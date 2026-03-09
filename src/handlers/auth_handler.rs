use argon2::{Argon2, PasswordHash, PasswordHasher, PasswordVerifier};
use axum::Json;
use axum::extract::State;
use axum::http::StatusCode;
use axum::response::IntoResponse;
use rand::RngExt;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

use crate::auth::RequireAuth;
use crate::errors::AppError;
use crate::handlers::audit::record_audit;
use crate::routes::AppState;

// -- Setup status (is this a fresh install?) --

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SetupStatusResponse {
    pub needs_setup: bool,
    pub user_count: i64,
}

pub async fn handle_setup_status(
    State(state): State<AppState>,
) -> Result<impl IntoResponse, AppError> {
    let count = sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM users")
        .fetch_one(&state.db)
        .await
        .map_err(|e| AppError::Internal(e.to_string()))?;

    Ok(Json(SetupStatusResponse {
        needs_setup: count == 0,
        user_count: count,
    }))
}

// -- Register (first admin account) --

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RegisterRequest {
    pub email: String,
    pub name: String,
    pub password: String,
    pub project_name: Option<String>,
    pub project_slug: Option<String>,
}

pub async fn handle_register(
    State(state): State<AppState>,
    Json(body): Json<RegisterRequest>,
) -> Result<impl IntoResponse, AppError> {
    if body.email.trim().is_empty() {
        return Err(AppError::BadRequest("Email is required".into()));
    }
    if body.name.trim().is_empty() {
        return Err(AppError::BadRequest("Name is required".into()));
    }
    if body.password.len() < 8 {
        return Err(AppError::BadRequest(
            "Password must be at least 8 characters".into(),
        ));
    }

    let password_hash = hash_password(&body.password)?;

    let mut tx = state.db.begin().await.map_err(|e| AppError::Internal(e.to_string()))?;

    let user_id = sqlx::query_scalar::<_, i64>(
        "INSERT INTO users (email, name, role, password_hash) VALUES ($1, $2, 'admin', $3) RETURNING id",
    )
    .bind(body.email.trim())
    .bind(body.name.trim())
    .bind(&password_hash)
    .fetch_one(&mut *tx)
    .await
    .map_err(|e| {
        if e.to_string().contains("duplicate key") {
            AppError::BadRequest("A user with this email already exists".into())
        } else {
            AppError::Internal(e.to_string())
        }
    })?;

    // Use provided project name/slug or derive from user's name
    let project_name = body.project_name
        .as_deref()
        .filter(|s| !s.trim().is_empty())
        .map(|s| s.trim().to_string())
        .unwrap_or_else(|| format!("{}'s Project", body.name.trim()));

    let base_slug = body.project_slug
        .as_deref()
        .filter(|s| !s.trim().is_empty())
        .map(|s| s.trim().to_lowercase()
            .chars()
            .map(|c| if c.is_ascii_alphanumeric() || c == '-' { c } else { '-' })
            .collect::<String>()
            .trim_matches('-')
            .to_string())
        .unwrap_or_else(|| {
            body.name.trim().to_lowercase()
                .chars()
                .map(|c| if c.is_ascii_alphanumeric() { c } else { '-' })
                .collect::<String>()
                .trim_matches('-')
                .to_string()
        });
    let slug = if base_slug.is_empty() { format!("project-{user_id}") } else { base_slug };

    let project = sqlx::query_as::<_, crate::models::Project>(
        "INSERT INTO projects (name, slug) VALUES ($1, $2) RETURNING *",
    )
    .bind(&project_name)
    .bind(&slug)
    .fetch_one(&mut *tx)
    .await
    .map_err(|e| {
        if e.to_string().contains("duplicate key") {
            AppError::Internal(format!("Project slug '{slug}' already taken"))
        } else {
            AppError::Internal(e.to_string())
        }
    })?;

    sqlx::query("INSERT INTO project_members (project_id, user_id, role) VALUES ($1, $2, 'admin')")
        .bind(project.id)
        .bind(user_id)
        .execute(&mut *tx)
        .await
        .map_err(|e| AppError::Internal(e.to_string()))?;

    // Create default branch + channel
    sqlx::query("INSERT INTO branches (name, project_id) VALUES ('main', $1)")
        .bind(project.id)
        .execute(&mut *tx)
        .await
        .map_err(|e| AppError::Internal(e.to_string()))?;

    sqlx::query(
        "INSERT INTO channels (name, branch_name, project_id) VALUES ('production', 'main', $1)",
    )
    .bind(project.id)
    .execute(&mut *tx)
    .await
    .map_err(|e| AppError::Internal(e.to_string()))?;

    // Create session token so they're logged in immediately
    let token = generate_token();
    let token_hash = hex::encode(Sha256::digest(token.as_bytes()));

    sqlx::query(
        "INSERT INTO sessions (user_id, token_hash, expires_at) VALUES ($1, $2, NOW() + INTERVAL '30 days')",
    )
    .bind(user_id)
    .bind(&token_hash)
    .execute(&mut *tx)
    .await
    .map_err(|e| AppError::Internal(e.to_string()))?;

    tx.commit()
        .await
        .map_err(|e| AppError::Internal(e.to_string()))?;

    Ok((
        StatusCode::CREATED,
        Json(LoginResponse {
            token,
            user: UserInfo {
                id: user_id,
                email: body.email.trim().to_string(),
                name: body.name.trim().to_string(),
                role: "admin".to_string(),
                project_role: Some("admin".to_string()),
            },
        }),
    ))
}

// -- Login --

#[derive(Deserialize)]
pub struct LoginRequest {
    pub email: String,
    pub password: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LoginResponse {
    pub token: String,
    pub user: UserInfo,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct UserInfo {
    pub id: i64,
    pub email: String,
    pub name: String,
    pub role: String,
    pub project_role: Option<String>,
}

pub async fn handle_login(
    State(state): State<AppState>,
    Json(body): Json<LoginRequest>,
) -> Result<impl IntoResponse, AppError> {
    let user = sqlx::query_as::<_, (i64, String, String, String, Option<String>)>(
        "SELECT id, email, name, role, password_hash FROM users WHERE email = $1 AND is_active = TRUE",
    )
    .bind(&body.email)
    .fetch_optional(&state.db)
    .await
    .map_err(|e| AppError::Internal(e.to_string()))?
    .ok_or_else(|| AppError::Unauthorized("Invalid email or password".into()))?;

    let (user_id, email, name, role, password_hash) = user;

    let password_hash = password_hash.ok_or_else(|| {
        AppError::Unauthorized("Account not activated. Check your invite.".into())
    })?;

    let parsed_hash = PasswordHash::new(&password_hash)
        .map_err(|_| AppError::Internal("Invalid password hash in database".into()))?;

    Argon2::default()
        .verify_password(body.password.as_bytes(), &parsed_hash)
        .map_err(|_| AppError::Unauthorized("Invalid email or password".into()))?;

    // Create session token
    let token = generate_token();
    let token_hash = hex::encode(Sha256::digest(token.as_bytes()));

    sqlx::query(
        "INSERT INTO sessions (user_id, token_hash, expires_at) VALUES ($1, $2, NOW() + INTERVAL '30 days')",
    )
    .bind(user_id)
    .bind(&token_hash)
    .execute(&state.db)
    .await
    .map_err(|e| AppError::Internal(e.to_string()))?;

    Ok(Json(LoginResponse {
        token,
        user: UserInfo {
            id: user_id,
            email,
            name,
            role,
            project_role: None,
        },
    }))
}

// -- Logout --

pub async fn handle_logout(
    State(state): State<AppState>,
    auth: RequireAuth,
) -> Result<impl IntoResponse, AppError> {
    if let Some(user_id) = auth.user_id {
        // Delete current session (we don't have the token here, so delete all for this user)
        // In practice we'd extract the token, but deleting all is fine for a simple logout
        sqlx::query("DELETE FROM sessions WHERE user_id = $1")
            .bind(user_id)
            .execute(&state.db)
            .await
            .map_err(|e| AppError::Internal(e.to_string()))?;
    }
    Ok(StatusCode::NO_CONTENT)
}

// -- Me (current user) --

pub async fn handle_me(
    State(state): State<AppState>,
    auth: RequireAuth,
) -> Result<impl IntoResponse, AppError> {
    let user_id = auth
        .user_id
        .ok_or_else(|| AppError::Unauthorized("API keys do not have user profiles".into()))?;

    let user = sqlx::query_as::<_, (i64, String, String, String)>(
        "SELECT id, email, name, role FROM users WHERE id = $1",
    )
    .bind(user_id)
    .fetch_one(&state.db)
    .await
    .map_err(|e| AppError::Internal(e.to_string()))?;

    let project_role = if let Some(pid) = auth.project_id {
        sqlx::query_scalar::<_, String>(
            "SELECT role FROM project_members WHERE project_id = $1 AND user_id = $2",
        )
        .bind(pid)
        .bind(user_id)
        .fetch_optional(&state.db)
        .await
        .ok()
        .flatten()
    } else {
        None
    };

    Ok(Json(UserInfo {
        id: user.0,
        email: user.1,
        name: user.2,
        role: user.3,
        project_role,
    }))
}

// -- Invite user --

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InviteRequest {
    pub email: String,
    pub name: String,
    #[serde(default = "default_role")]
    pub role: String,
}

fn default_role() -> String {
    "editor".to_string()
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InviteResponse {
    pub id: i64,
    pub email: String,
    pub invite_token: String,
}

pub async fn handle_invite(
    State(state): State<AppState>,
    auth: RequireAuth,
    Json(body): Json<InviteRequest>,
) -> Result<impl IntoResponse, AppError> {
    auth.require_admin()?;
    let project_id = auth.require_project()?;

    if !["admin", "editor", "viewer"].contains(&body.role.as_str()) {
        return Err(AppError::BadRequest(
            "Role must be 'admin', 'editor', or 'viewer'".into(),
        ));
    }

    let invite_token = generate_token();

    let user_id = sqlx::query_scalar::<_, i64>(
        "INSERT INTO users (email, name, role, invite_token, invited_by)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id",
    )
    .bind(&body.email)
    .bind(&body.name)
    .bind(&body.role)
    .bind(&invite_token)
    .bind(auth.user_id)
    .fetch_one(&state.db)
    .await
    .map_err(|e| {
        if e.to_string().contains("duplicate key") {
            AppError::BadRequest("A user with this email already exists".into())
        } else {
            AppError::Internal(e.to_string())
        }
    })?;

    // Add the invited user to the current project with the specified role
    sqlx::query(
        "INSERT INTO project_members (project_id, user_id, role) VALUES ($1, $2, $3) \
         ON CONFLICT (project_id, user_id) DO UPDATE SET role = EXCLUDED.role",
    )
    .bind(project_id)
    .bind(user_id)
    .bind(&body.role)
    .execute(&state.db)
    .await?;

    record_audit(
        &state.db,
        &auth,
        "user.invited",
        "user",
        Some(user_id),
        serde_json::json!({ "email": body.email, "role": body.role }),
    )
    .await;

    Ok((
        StatusCode::CREATED,
        Json(InviteResponse {
            id: user_id,
            email: body.email,
            invite_token,
        }),
    ))
}

// -- Accept invite (set password) --

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AcceptInviteRequest {
    pub invite_token: String,
    pub password: String,
}

pub async fn handle_accept_invite(
    State(state): State<AppState>,
    Json(body): Json<AcceptInviteRequest>,
) -> Result<impl IntoResponse, AppError> {
    if body.password.len() < 8 {
        return Err(AppError::BadRequest(
            "Password must be at least 8 characters".into(),
        ));
    }

    let user = sqlx::query_as::<_, (i64, String)>(
        "SELECT id, email FROM users WHERE invite_token = $1 AND password_hash IS NULL",
    )
    .bind(&body.invite_token)
    .fetch_optional(&state.db)
    .await
    .map_err(|e| AppError::Internal(e.to_string()))?
    .ok_or_else(|| AppError::BadRequest("Invalid or already used invite token".into()))?;

    let password_hash = hash_password(&body.password)?;

    sqlx::query("UPDATE users SET password_hash = $1, invite_token = NULL WHERE id = $2")
        .bind(&password_hash)
        .bind(user.0)
        .execute(&state.db)
        .await
        .map_err(|e| AppError::Internal(e.to_string()))?;

    let no_auth = RequireAuth {
        user_id: None,
        api_key_id: None,
        project_id: None,
        role: crate::auth::Role::Viewer,
    };
    record_audit(
        &state.db,
        &no_auth,
        "user.activated",
        "user",
        Some(user.0),
        serde_json::json!({ "email": user.1 }),
    )
    .await;

    Ok(StatusCode::NO_CONTENT)
}

// -- List users (admin) --

#[derive(Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct UserListItem {
    pub id: i64,
    pub email: String,
    pub name: String,
    pub role: String,
    pub is_active: bool,
    pub has_password: bool,
    pub created_at: chrono::DateTime<chrono::Utc>,
}

pub async fn handle_list_users(
    State(state): State<AppState>,
    auth: RequireAuth,
) -> Result<impl IntoResponse, AppError> {
    let project_id = auth.require_project()?;

    let users = sqlx::query_as::<_, UserListItem>(
        "SELECT u.id, u.email, u.name, pm.role, u.is_active, (u.password_hash IS NOT NULL) AS has_password, u.created_at
         FROM users u
         JOIN project_members pm ON pm.user_id = u.id
         WHERE pm.project_id = $1
         ORDER BY u.created_at DESC",
    )
    .bind(project_id)
    .fetch_all(&state.db)
    .await
    .map_err(|e| AppError::Internal(e.to_string()))?;

    Ok(Json(users))
}

// -- API Keys --

#[derive(Deserialize)]
pub struct CreateApiKeyRequest {
    pub name: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateApiKeyResponse {
    pub id: i64,
    pub name: String,
    pub key: String,
    pub key_prefix: String,
}

#[derive(Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct ApiKeyListItem {
    pub id: i64,
    pub name: String,
    pub key_prefix: String,
    pub is_active: bool,
    pub created_at: chrono::DateTime<chrono::Utc>,
    pub last_used_at: Option<chrono::DateTime<chrono::Utc>>,
}

pub async fn handle_create_api_key(
    State(state): State<AppState>,
    auth: RequireAuth,
    Json(body): Json<CreateApiKeyRequest>,
) -> Result<impl IntoResponse, AppError> {
    auth.require_admin()?;
    if body.name.trim().is_empty() {
        return Err(AppError::BadRequest("Name is required".into()));
    }

    let raw_key = format!("dsp_{}", generate_token());
    let key_hash = hex::encode(Sha256::digest(raw_key.as_bytes()));
    let key_prefix = raw_key[..12].to_string();

    let project_id = auth.require_project()?;

    let id = sqlx::query_scalar::<_, i64>(
        "INSERT INTO api_keys (name, key_hash, key_prefix, project_id) VALUES ($1, $2, $3, $4) RETURNING id",
    )
    .bind(body.name.trim())
    .bind(&key_hash)
    .bind(&key_prefix)
    .bind(project_id)
    .fetch_one(&state.db)
    .await
    .map_err(|e| AppError::Internal(e.to_string()))?;

    record_audit(
        &state.db,
        &auth,
        "api_key.created",
        "api_key",
        Some(id),
        serde_json::json!({ "name": body.name.trim() }),
    )
    .await;

    Ok((
        StatusCode::CREATED,
        Json(CreateApiKeyResponse {
            id,
            name: body.name.trim().to_string(),
            key: raw_key,
            key_prefix,
        }),
    ))
}

pub async fn handle_list_api_keys(
    State(state): State<AppState>,
    auth: RequireAuth,
) -> Result<impl IntoResponse, AppError> {
    auth.require_admin()?;
    let project_id = auth.require_project()?;

    let keys = sqlx::query_as::<_, ApiKeyListItem>(
        "SELECT id, name, key_prefix, is_active, created_at, last_used_at
         FROM api_keys WHERE project_id = $1 ORDER BY created_at DESC",
    )
    .bind(project_id)
    .fetch_all(&state.db)
    .await
    .map_err(|e| AppError::Internal(e.to_string()))?;

    Ok(Json(keys))
}

pub async fn handle_revoke_api_key(
    State(state): State<AppState>,
    auth: RequireAuth,
    axum::extract::Path(id): axum::extract::Path<i64>,
) -> Result<impl IntoResponse, AppError> {
    auth.require_admin()?;
    let project_id = auth.require_project()?;

    let rows = sqlx::query("UPDATE api_keys SET is_active = FALSE WHERE id = $1 AND is_active = TRUE AND project_id = $2")
        .bind(id)
        .bind(project_id)
        .execute(&state.db)
        .await
        .map_err(|e| AppError::Internal(e.to_string()))?
        .rows_affected();

    if rows == 0 {
        return Err(AppError::NotFound(
            "API key not found or already revoked".into(),
        ));
    }

    record_audit(
        &state.db,
        &auth,
        "api_key.revoked",
        "api_key",
        Some(id),
        serde_json::json!({}),
    )
    .await;

    Ok(StatusCode::NO_CONTENT)
}

pub async fn handle_delete_api_key(
    State(state): State<AppState>,
    auth: RequireAuth,
    axum::extract::Path(id): axum::extract::Path<i64>,
) -> Result<impl IntoResponse, AppError> {
    auth.require_admin()?;
    let project_id = auth.require_project()?;

    let rows = sqlx::query("DELETE FROM api_keys WHERE id = $1 AND project_id = $2")
        .bind(id)
        .bind(project_id)
        .execute(&state.db)
        .await
        .map_err(|e| AppError::Internal(e.to_string()))?
        .rows_affected();

    if rows == 0 {
        return Err(AppError::NotFound("API key not found".into()));
    }

    record_audit(
        &state.db,
        &auth,
        "api_key.deleted",
        "api_key",
        Some(id),
        serde_json::json!({}),
    )
    .await;

    Ok(StatusCode::NO_CONTENT)
}

// -- Helpers --

fn generate_token() -> String {
    let bytes: [u8; 32] = rand::rng().random();
    hex::encode(bytes)
}

pub fn hash_password(password: &str) -> Result<String, AppError> {
    let salt =
        argon2::password_hash::SaltString::generate(&mut argon2::password_hash::rand_core::OsRng);
    let hash = Argon2::default()
        .hash_password(password.as_bytes(), &salt)
        .map_err(|e| AppError::Internal(format!("Failed to hash password: {e}")))?;
    Ok(hash.to_string())
}
