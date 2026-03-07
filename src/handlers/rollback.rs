use axum::extract::State;
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::Json;
use serde::{Deserialize, Serialize};

use crate::auth::RequireAuth;
use crate::errors::AppError;
use crate::handlers::audit::record_audit;
use crate::routes::AppState;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateRollbackRequest {
    pub runtime_version: String,
    pub platform: String,
    #[serde(default = "default_channel")]
    pub channel: String,
    /// If set, roll back to this specific update. Otherwise, roll back to embedded.
    pub rollback_to_update_id: Option<i64>,
}

fn default_channel() -> String {
    "production".to_string()
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateRollbackResponse {
    pub id: i64,
    pub update_uuid: String,
}

pub async fn handle_create_rollback(
    State(state): State<AppState>,
    auth: RequireAuth,
    Json(body): Json<CreateRollbackRequest>,
) -> Result<impl IntoResponse, AppError> {
    let project_id = auth.require_project()?;

    // If rollback_to_update_id is specified, verify it exists within this project
    if let Some(target_id) = body.rollback_to_update_id {
        let exists = sqlx::query_scalar::<_, bool>(
            "SELECT EXISTS(SELECT 1 FROM updates WHERE id = $1 AND project_id = $2)",
        )
        .bind(target_id)
        .bind(project_id)
        .fetch_one(&state.db)
        .await?;

        if !exists {
            return Err(AppError::NotFound(
                "Target update for rollback not found".into(),
            ));
        }
    }

    let update_uuid = uuid::Uuid::new_v4().to_string();

    let id = sqlx::query_scalar::<_, i64>(
        "INSERT INTO updates (runtime_version, platform, update_uuid, metadata, expo_config, is_rollback, channel, rollback_to_update_id, project_id)
         VALUES ($1, $2, $3, '{}', '{}', TRUE, $4, $5, $6)
         RETURNING id",
    )
    .bind(&body.runtime_version)
    .bind(&body.platform)
    .bind(&update_uuid)
    .bind(&body.channel)
    .bind(body.rollback_to_update_id)
    .bind(project_id)
    .fetch_one(&state.db)
    .await?;

    record_audit(
        &state.db,
        &auth,
        "update.rollback",
        "update",
        Some(id),
        serde_json::json!({
            "runtime_version": body.runtime_version,
            "platform": body.platform,
            "channel": body.channel,
            "rollback_to_update_id": body.rollback_to_update_id,
        }),
    )
    .await;

    crate::handlers::webhooks::fire_webhooks(
        &state.db,
        "rollback.created",
        serde_json::json!({
            "update_id": id,
            "update_uuid": update_uuid,
            "rollback_to_update_id": body.rollback_to_update_id,
            "runtime_version": body.runtime_version,
            "platform": body.platform,
            "channel": body.channel,
        }),
    )
    .await;

    Ok((
        StatusCode::CREATED,
        Json(CreateRollbackResponse {
            id,
            update_uuid,
        }),
    ))
}
