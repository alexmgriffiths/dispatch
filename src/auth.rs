use axum::extract::FromRequestParts;
use axum::http::request::Parts;
use sha2::{Digest, Sha256};

use crate::errors::AppError;
use crate::routes::AppState;

// ── Role enum ────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
pub enum Role {
    Viewer,
    Editor,
    Admin,
}

impl Role {
    pub fn from_str(s: &str) -> Self {
        match s {
            "admin" => Role::Admin,
            "editor" => Role::Editor,
            _ => Role::Viewer,
        }
    }

    pub fn as_str(&self) -> &'static str {
        match self {
            Role::Admin => "admin",
            Role::Editor => "editor",
            Role::Viewer => "viewer",
        }
    }
}

// ── Auth extractor ───────────────────────────────────────────────────────

/// Extractor that validates the `Authorization: Bearer <token>` header.
/// Accepts either a session token or an API key.
/// Resolves project context from:
///   - API key: project_id + role stored on the key
///   - User session: X-Project header (slug) + project_members check
pub struct RequireAuth {
    pub user_id: Option<i64>,
    pub api_key_id: Option<i64>,
    pub project_id: Option<i64>,
    pub role: Role,
}

impl RequireAuth {
    /// Require a project context. Returns an error if no project was resolved.
    pub fn require_project(&self) -> Result<i64, AppError> {
        self.project_id.ok_or_else(|| {
            AppError::BadRequest("X-Project header is required".into())
        })
    }

    /// Require at least the given role. Returns 403 if insufficient.
    pub fn require_role(&self, minimum: Role) -> Result<(), AppError> {
        if self.role < minimum {
            return Err(AppError::Forbidden(format!(
                "This action requires '{}' role or higher",
                minimum.as_str()
            )));
        }
        Ok(())
    }

    pub fn require_admin(&self) -> Result<(), AppError> {
        self.require_role(Role::Admin)
    }

    pub fn require_editor(&self) -> Result<(), AppError> {
        self.require_role(Role::Editor)
    }
}

impl FromRequestParts<AppState> for RequireAuth {
    type Rejection = AppError;

    async fn from_request_parts(
        parts: &mut Parts,
        state: &AppState,
    ) -> Result<Self, Self::Rejection> {
        let header = parts
            .headers
            .get("authorization")
            .and_then(|v| v.to_str().ok())
            .ok_or_else(|| AppError::Unauthorized("Missing Authorization header".into()))?;

        let token = header
            .strip_prefix("Bearer ")
            .ok_or_else(|| AppError::Unauthorized("Invalid Authorization format".into()))?;

        let token_hash = hex::encode(Sha256::digest(token.as_bytes()));

        // Try session token first
        let session_user = sqlx::query_scalar::<_, i64>(
            "SELECT user_id FROM sessions WHERE token_hash = $1 AND expires_at > NOW()",
        )
        .bind(&token_hash)
        .fetch_optional(&state.db)
        .await
        .map_err(|e| AppError::Internal(e.to_string()))?;

        if let Some(user_id) = session_user {
            let (project_id, role) =
                resolve_user_project(parts, &state.db, user_id).await?;
            return Ok(RequireAuth {
                user_id: Some(user_id),
                api_key_id: None,
                project_id,
                role,
            });
        }

        // Fall back to API key
        let api_key = sqlx::query_as::<_, (i64, Option<i64>, String)>(
            "SELECT id, project_id, role FROM api_keys WHERE key_hash = $1 AND is_active = TRUE",
        )
        .bind(&token_hash)
        .fetch_optional(&state.db)
        .await
        .map_err(|e| AppError::Internal(e.to_string()))?;

        if let Some((key_id, project_id, role_str)) = api_key {
            let db = state.db.clone();
            let hash = token_hash.clone();
            tokio::spawn(async move {
                let _ =
                    sqlx::query("UPDATE api_keys SET last_used_at = NOW() WHERE key_hash = $1")
                        .bind(&hash)
                        .execute(&db)
                        .await;
            });
            return Ok(RequireAuth {
                user_id: None,
                api_key_id: Some(key_id),
                project_id,
                role: Role::from_str(&role_str),
            });
        }

        Err(AppError::Unauthorized("Invalid or expired token".into()))
    }
}

/// Resolve project_id + role from X-Project header slug + verify user membership.
/// Returns (None, Viewer) if no header is sent (auth-only routes like /me don't need project context).
async fn resolve_user_project(
    parts: &Parts,
    db: &sqlx::PgPool,
    user_id: i64,
) -> Result<(Option<i64>, Role), AppError> {
    let slug = match parts
        .headers
        .get("x-project")
        .and_then(|v| v.to_str().ok())
    {
        Some(s) if !s.is_empty() => s.to_string(),
        _ => return Ok((None, Role::Viewer)),
    };

    let row = sqlx::query_as::<_, (i64, String)>(
        "SELECT p.id, pm.role FROM projects p
         JOIN project_members pm ON pm.project_id = p.id
         WHERE p.slug = $1 AND pm.user_id = $2",
    )
    .bind(&slug)
    .bind(user_id)
    .fetch_optional(db)
    .await
    .map_err(|e| AppError::Internal(e.to_string()))?
    .ok_or_else(|| {
        AppError::NotFound(format!("Project '{slug}' not found or you don't have access"))
    })?;

    Ok((Some(row.0), Role::from_str(&row.1)))
}
