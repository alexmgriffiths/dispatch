use axum::extract::{Path, Query, State};
use axum::response::IntoResponse;
use axum::Json;
use serde::Deserialize;

use crate::auth::RequireAuth;
use crate::errors::AppError;
use crate::models::AuditLogEntry;
use crate::routes::AppState;

#[derive(Deserialize)]
pub struct AuditQuery {
    #[serde(default = "default_limit")]
    pub limit: i64,
    pub action: Option<String>,
}

fn default_limit() -> i64 {
    50
}

pub async fn handle_list_audit_log(
    State(state): State<AppState>,
    auth: RequireAuth,
    Query(params): Query<AuditQuery>,
) -> Result<impl IntoResponse, AppError> {
    let project_id = auth.require_project()?;
    let limit = params.limit.min(200);

    let entries = if let Some(action) = &params.action {
        sqlx::query_as::<_, AuditLogEntry>(
            &format!("{AUDIT_SELECT} WHERE a.project_id = $1 AND a.action = $2 ORDER BY a.created_at DESC LIMIT $3"),
        )
        .bind(project_id)
        .bind(action)
        .bind(limit)
        .fetch_all(&state.db)
        .await?
    } else {
        sqlx::query_as::<_, AuditLogEntry>(
            &format!("{AUDIT_SELECT} WHERE a.project_id = $1 ORDER BY a.created_at DESC LIMIT $2"),
        )
        .bind(project_id)
        .bind(limit)
        .fetch_all(&state.db)
        .await?
    };

    Ok(Json(entries))
}

pub async fn handle_update_history(
    State(state): State<AppState>,
    auth: RequireAuth,
    Path(id): Path<i64>,
) -> Result<impl IntoResponse, AppError> {
    let project_id = auth.require_project()?;
    let entries = sqlx::query_as::<_, AuditLogEntry>(
        &format!("{AUDIT_SELECT} WHERE a.project_id = $1 AND a.entity_type = 'update' AND a.entity_id = $2 ORDER BY a.created_at DESC LIMIT 50"),
    )
    .bind(project_id)
    .bind(id)
    .fetch_all(&state.db)
    .await?;

    Ok(Json(entries))
}

const AUDIT_SELECT: &str = "\
    SELECT a.id, a.action, a.entity_type, a.entity_id, a.details, a.created_at, \
           CASE WHEN a.actor_user_id IS NOT NULL THEN 'user' \
                WHEN a.actor_api_key_id IS NOT NULL THEN 'api_key' \
                ELSE NULL END AS actor_type, \
           COALESCE(u.name, ak.name) AS actor_name \
    FROM audit_log a \
    LEFT JOIN users u ON u.id = a.actor_user_id \
    LEFT JOIN api_keys ak ON ak.id = a.actor_api_key_id";

/// Insert an audit log entry. Called from other handlers.
pub async fn record_audit(
    db: &sqlx::PgPool,
    auth: &crate::auth::RequireAuth,
    action: &str,
    entity_type: &str,
    entity_id: Option<i64>,
    details: serde_json::Value,
) {
    let _ = sqlx::query(
        "INSERT INTO audit_log (action, entity_type, entity_id, details, actor_user_id, actor_api_key_id, project_id) VALUES ($1, $2, $3, $4, $5, $6, $7)",
    )
    .bind(action)
    .bind(entity_type)
    .bind(entity_id)
    .bind(details)
    .bind(auth.user_id)
    .bind(auth.api_key_id)
    .bind(auth.project_id)
    .execute(db)
    .await;
}
