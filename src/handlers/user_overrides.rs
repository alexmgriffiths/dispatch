use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::Json;
use serde::Deserialize;

use crate::auth::RequireAuth;
use crate::errors::AppError;
use crate::handlers::audit::record_audit;
use crate::models::UserOverride;
use crate::routes::AppState;

pub async fn handle_list_user_overrides(
    State(state): State<AppState>,
    auth: RequireAuth,
) -> Result<impl IntoResponse, AppError> {
    let project_id = auth.require_project()?;

    let overrides = sqlx::query_as::<_, UserOverride>(
        "SELECT * FROM user_overrides WHERE project_id = $1 ORDER BY created_at DESC",
    )
    .bind(project_id)
    .fetch_all(&state.db)
    .await?;

    Ok(Json(overrides))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateUserOverrideRequest {
    pub user_id: String,
    pub branch_name: String,
    pub note: Option<String>,
}

pub async fn handle_create_user_override(
    State(state): State<AppState>,
    auth: RequireAuth,
    Json(body): Json<CreateUserOverrideRequest>,
) -> Result<impl IntoResponse, AppError> {
    let project_id = auth.require_project()?;
    let user_id = body.user_id.trim().to_string();
    let branch_name = body.branch_name.trim().to_string();

    if user_id.is_empty() || branch_name.is_empty() {
        return Err(AppError::BadRequest(
            "User ID and branch name cannot be empty".into(),
        ));
    }

    // Verify branch exists
    let branch_exists = sqlx::query_scalar::<_, bool>(
        "SELECT EXISTS(SELECT 1 FROM branches WHERE project_id = $1 AND name = $2)",
    )
    .bind(project_id)
    .bind(&branch_name)
    .fetch_one(&state.db)
    .await?;

    if !branch_exists {
        return Err(AppError::BadRequest(format!(
            "Branch '{branch_name}' does not exist"
        )));
    }

    let override_record = sqlx::query_as::<_, UserOverride>(
        "INSERT INTO user_overrides (project_id, user_id, branch_name, note)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (project_id, user_id)
         DO UPDATE SET branch_name = EXCLUDED.branch_name, note = EXCLUDED.note
         RETURNING *",
    )
    .bind(project_id)
    .bind(&user_id)
    .bind(&branch_name)
    .bind(&body.note)
    .fetch_one(&state.db)
    .await?;

    record_audit(
        &state.db,
        &auth,
        "user_override.created",
        "user_override",
        Some(override_record.id),
        serde_json::json!({ "userId": user_id, "branchName": branch_name, "note": body.note }),
    )
    .await;

    Ok((StatusCode::CREATED, Json(override_record)))
}

pub async fn handle_delete_user_override(
    State(state): State<AppState>,
    auth: RequireAuth,
    Path(id): Path<i64>,
) -> Result<impl IntoResponse, AppError> {
    let project_id = auth.require_project()?;

    let result = sqlx::query("DELETE FROM user_overrides WHERE project_id = $1 AND id = $2")
        .bind(project_id)
        .bind(id)
        .execute(&state.db)
        .await?;

    if result.rows_affected() == 0 {
        return Err(AppError::NotFound("User override not found".into()));
    }

    record_audit(
        &state.db,
        &auth,
        "user_override.deleted",
        "user_override",
        Some(id),
        serde_json::json!({ "id": id }),
    )
    .await;

    Ok(StatusCode::NO_CONTENT)
}
