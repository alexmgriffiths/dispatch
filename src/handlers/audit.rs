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
    pub entity_type: Option<String>,
    pub entity_id: Option<i64>,
    /// Cursor: return entries with id < before (for pagination)
    pub before: Option<i64>,
}

fn default_limit() -> i64 {
    200
}

pub async fn handle_list_audit_log(
    State(state): State<AppState>,
    auth: RequireAuth,
    Query(params): Query<AuditQuery>,
) -> Result<impl IntoResponse, AppError> {
    let project_id = auth.require_project()?;
    let limit = params.limit.min(200);

    let mut conditions = vec!["a.project_id = $1".to_string()];
    let mut bind_idx = 2u32;

    if params.action.is_some() {
        conditions.push(format!("a.action = ${bind_idx}"));
        bind_idx += 1;
    }
    if params.entity_type.is_some() {
        conditions.push(format!("a.entity_type = ${bind_idx}"));
        bind_idx += 1;
    }
    if params.entity_id.is_some() {
        conditions.push(format!("a.entity_id = ${bind_idx}"));
        bind_idx += 1;
    }
    if params.before.is_some() {
        conditions.push(format!("a.id < ${bind_idx}"));
        bind_idx += 1;
    }

    let sql = format!(
        "{AUDIT_SELECT} WHERE {} ORDER BY a.created_at DESC LIMIT ${bind_idx}",
        conditions.join(" AND "),
    );

    let mut query = sqlx::query_as::<_, AuditLogEntry>(&sql).bind(project_id);
    if let Some(action) = &params.action {
        query = query.bind(action);
    }
    if let Some(entity_type) = &params.entity_type {
        query = query.bind(entity_type);
    }
    if let Some(entity_id) = params.entity_id {
        query = query.bind(entity_id);
    }
    if let Some(before) = params.before {
        query = query.bind(before);
    }
    let entries = query.bind(limit).fetch_all(&state.db).await?;

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

/// Record an audit entry for system-initiated actions (e.g., rollout execution flag changes).
pub async fn record_system_audit(
    db: &sqlx::PgPool,
    project_id: i64,
    action: &str,
    entity_type: &str,
    entity_id: Option<i64>,
    details: serde_json::Value,
) {
    let _ = sqlx::query(
        "INSERT INTO audit_log (action, entity_type, entity_id, details, project_id) \
         VALUES ($1, $2, $3, $4, $5)",
    )
    .bind(action)
    .bind(entity_type)
    .bind(entity_id)
    .bind(details)
    .bind(project_id)
    .execute(db)
    .await;
}
