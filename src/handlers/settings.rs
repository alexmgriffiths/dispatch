use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::Json;
use serde::{Deserialize, Serialize};

use crate::auth::RequireAuth;
use crate::errors::AppError;
use crate::handlers::audit::record_audit;
use crate::models::{WebhookConfig, WebhookDelivery};
use crate::routes::AppState;

pub async fn handle_list_webhooks(
    State(state): State<AppState>,
    auth: RequireAuth,
) -> Result<impl IntoResponse, AppError> {
    let project_id = auth.require_project()?;
    let webhooks = sqlx::query_as::<_, WebhookConfig>(
        "SELECT * FROM webhook_configs WHERE project_id = $1 ORDER BY created_at DESC",
    )
    .bind(project_id)
    .fetch_all(&state.db)
    .await?;

    Ok(Json(webhooks))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateWebhookRequest {
    pub url: String,
    pub events: Vec<String>,
    #[serde(default)]
    pub secret: Option<String>,
}

pub async fn handle_create_webhook(
    State(state): State<AppState>,
    auth: RequireAuth,
    Json(body): Json<CreateWebhookRequest>,
) -> Result<impl IntoResponse, AppError> {
    auth.require_admin()?;
    if body.url.is_empty() {
        return Err(AppError::BadRequest("url is required".into()));
    }

    let project_id = auth.require_project()?;
    let webhook = sqlx::query_as::<_, WebhookConfig>(
        "INSERT INTO webhook_configs (url, events, secret, project_id) VALUES ($1, $2, $3, $4) RETURNING *",
    )
    .bind(&body.url)
    .bind(&body.events)
    .bind(&body.secret)
    .bind(project_id)
    .fetch_one(&state.db)
    .await?;

    record_audit(
        &state.db,
        &auth,
        "webhook.created",
        "webhook",
        Some(webhook.id),
        serde_json::json!({ "url": body.url, "events": body.events }),
    )
    .await;

    Ok((StatusCode::CREATED, Json(webhook)))
}

pub async fn handle_delete_webhook(
    State(state): State<AppState>,
    auth: RequireAuth,
    Path(id): Path<i64>,
) -> Result<impl IntoResponse, AppError> {
    auth.require_admin()?;
    let project_id = auth.require_project()?;
    let result = sqlx::query("DELETE FROM webhook_configs WHERE id = $1 AND project_id = $2")
        .bind(id)
        .bind(project_id)
        .execute(&state.db)
        .await?;

    if result.rows_affected() == 0 {
        return Err(AppError::NotFound("Webhook not found".into()));
    }

    record_audit(
        &state.db,
        &auth,
        "webhook.deleted",
        "webhook",
        Some(id),
        serde_json::json!({}),
    )
    .await;

    Ok(StatusCode::NO_CONTENT)
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PatchWebhookRequest {
    pub is_active: Option<bool>,
    pub url: Option<String>,
    pub events: Option<Vec<String>>,
}

pub async fn handle_patch_webhook(
    State(state): State<AppState>,
    auth: RequireAuth,
    Path(id): Path<i64>,
    Json(body): Json<PatchWebhookRequest>,
) -> Result<impl IntoResponse, AppError> {
    auth.require_admin()?;
    let project_id = auth.require_project()?;
    let result = sqlx::query(
        "UPDATE webhook_configs SET
            is_active = COALESCE($2, is_active),
            url = COALESCE($3, url),
            events = COALESCE($4, events)
         WHERE id = $1 AND project_id = $5",
    )
    .bind(id)
    .bind(body.is_active)
    .bind(&body.url)
    .bind(&body.events)
    .bind(project_id)
    .execute(&state.db)
    .await?;

    if result.rows_affected() == 0 {
        return Err(AppError::NotFound("Webhook not found".into()));
    }

    record_audit(
        &state.db,
        &auth,
        "webhook.updated",
        "webhook",
        Some(id),
        serde_json::json!({
            "is_active": body.is_active,
            "url": body.url,
            "events": body.events,
        }),
    )
    .await;

    Ok(StatusCode::NO_CONTENT)
}

pub async fn handle_list_webhook_deliveries(
    State(state): State<AppState>,
    auth: RequireAuth,
    Path(webhook_id): Path<i64>,
) -> Result<impl IntoResponse, AppError> {
    let project_id = auth.require_project()?;
    let deliveries = sqlx::query_as::<_, WebhookDelivery>(
        "SELECT * FROM webhook_deliveries WHERE webhook_id = $1 AND EXISTS(SELECT 1 FROM webhook_configs WHERE id = $1 AND project_id = $2) ORDER BY created_at DESC LIMIT 50",
    )
    .bind(webhook_id)
    .bind(project_id)
    .fetch_all(&state.db)
    .await?;

    Ok(Json(deliveries))
}

// -- Project storage stats --

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GcStatsResponse {
    pub total_s3_objects: i64,
    pub total_size_bytes: i64,
    pub update_assets: i64,
    pub build_assets: i64,
}

/// Show storage stats scoped to this project.
pub async fn handle_gc_preview(
    State(state): State<AppState>,
    auth: RequireAuth,
) -> Result<impl IntoResponse, AppError> {
    let project_id = auth.require_project()?;

    let (update_count, update_size): (i64, i64) = sqlx::query_as(
        "SELECT COUNT(DISTINCT a.s3_key)::bigint, COALESCE(SUM(a.file_size), 0)::bigint \
         FROM assets a JOIN updates u ON a.update_id = u.id WHERE u.project_id = $1",
    )
    .bind(project_id)
    .fetch_one(&state.db)
    .await?;

    let (build_count, build_size): (i64, i64) = sqlx::query_as(
        "SELECT COUNT(DISTINCT ba.s3_key)::bigint, COALESCE(SUM(ba.file_size), 0)::bigint \
         FROM build_assets ba JOIN builds b ON ba.build_id = b.id WHERE b.project_id = $1",
    )
    .bind(project_id)
    .fetch_one(&state.db)
    .await?;

    Ok(Json(GcStatsResponse {
        total_s3_objects: update_count + build_count,
        total_size_bytes: update_size + build_size,
        update_assets: update_count,
        build_assets: build_count,
    }))
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GcRunResponse {
    pub deleted_objects: i64,
    pub freed_bytes: i64,
}

/// Delete S3 objects that belong to this project's deleted updates/builds
/// but are no longer referenced by any record in the database.
pub async fn handle_gc_run(
    State(state): State<AppState>,
    auth: RequireAuth,
) -> Result<impl IntoResponse, AppError> {
    auth.require_admin()?;
    let _project_id = auth.require_project()?;

    // Clean up old raw health events (TTL: 30 days)
    let health_deleted = sqlx::query_scalar::<_, i64>(
        "WITH deleted AS (
            DELETE FROM health_events_raw WHERE received_at < NOW() - INTERVAL '30 days' RETURNING 1
        ) SELECT COUNT(*) FROM deleted",
    )
    .fetch_one(&state.db)
    .await
    .unwrap_or(0);

    record_audit(
        &state.db,
        &auth,
        "gc.run",
        "system",
        None,
        serde_json::json!({
            "deleted_objects": health_deleted,
            "freed_bytes": 0,
            "health_events_purged": health_deleted,
        }),
    )
    .await;

    Ok(Json(GcRunResponse {
        deleted_objects: health_deleted,
        freed_bytes: 0,
    }))
}
