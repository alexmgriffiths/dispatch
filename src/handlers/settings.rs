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

// -- Asset garbage collection --

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GcStatsResponse {
    pub total_s3_objects: i64,
    pub referenced_objects: i64,
    pub orphaned_objects: i64,
    pub orphaned_size_bytes: i64,
}

/// Preview what GC would clean up without deleting anything.
pub async fn handle_gc_preview(
    State(state): State<AppState>,
    auth: RequireAuth,
) -> Result<impl IntoResponse, AppError> {
    let project_id = auth.require_project()?;
    let stats = compute_gc_stats(&state, project_id).await?;
    Ok(Json(stats))
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GcRunResponse {
    pub deleted_objects: i64,
    pub freed_bytes: i64,
}

/// Actually delete orphaned S3 objects not referenced by any asset or build_asset row.
pub async fn handle_gc_run(
    State(state): State<AppState>,
    auth: RequireAuth,
) -> Result<impl IntoResponse, AppError> {
    let project_id = auth.require_project()?;
    let (orphaned_keys, orphaned_size) = find_orphaned_keys(&state, project_id).await?;
    let deleted_count = orphaned_keys.len() as i64;

    for key in &orphaned_keys {
        let _ = state
            .s3
            .delete_object()
            .bucket(&state.config.s3_bucket)
            .key(key)
            .send()
            .await;
    }

    record_audit(
        &state.db,
        &auth,
        "gc.run",
        "system",
        None,
        serde_json::json!({
            "deleted_objects": deleted_count,
            "freed_bytes": orphaned_size,
        }),
    )
    .await;

    Ok(Json(GcRunResponse {
        deleted_objects: deleted_count,
        freed_bytes: orphaned_size,
    }))
}

async fn compute_gc_stats(state: &AppState, project_id: i64) -> Result<GcStatsResponse, AppError> {
    let (orphaned_keys, orphaned_size) = find_orphaned_keys(state, project_id).await?;
    let asset_keys = list_all_s3_keys(state, "assets/").await?;
    let build_keys = list_all_s3_keys(state, "builds/").await?;
    let total = (asset_keys.len() + build_keys.len()) as i64;

    Ok(GcStatsResponse {
        total_s3_objects: total,
        referenced_objects: total - orphaned_keys.len() as i64,
        orphaned_objects: orphaned_keys.len() as i64,
        orphaned_size_bytes: orphaned_size,
    })
}

async fn find_orphaned_keys(state: &AppState, project_id: i64) -> Result<(Vec<String>, i64), AppError> {
    // Get all S3 keys referenced in the database for this project
    let db_keys: std::collections::HashSet<String> = {
        let asset_keys = sqlx::query_scalar::<_, String>(
            "SELECT DISTINCT a.s3_key FROM assets a JOIN updates u ON a.update_id = u.id WHERE u.project_id = $1",
        )
        .bind(project_id)
        .fetch_all(&state.db)
        .await?;
        let build_keys = sqlx::query_scalar::<_, String>(
            "SELECT DISTINCT ba.s3_key FROM build_assets ba JOIN builds b ON ba.build_id = b.id WHERE b.project_id = $1",
        )
        .bind(project_id)
        .fetch_all(&state.db)
        .await?;
        asset_keys.into_iter().chain(build_keys).collect()
    };

    // List all objects in S3 under both prefixes
    let mut s3_objects = list_all_s3_objects(state, "assets/").await?;
    s3_objects.extend(list_all_s3_objects(state, "builds/").await?);

    let mut orphaned_keys = Vec::new();
    let mut orphaned_size: i64 = 0;

    for (key, size) in &s3_objects {
        if !db_keys.contains(key) {
            orphaned_keys.push(key.clone());
            orphaned_size += size;
        }
    }

    Ok((orphaned_keys, orphaned_size))
}

async fn list_all_s3_keys(
    state: &AppState,
    prefix: &str,
) -> Result<Vec<String>, AppError> {
    let objects = list_all_s3_objects(state, prefix).await?;
    Ok(objects.into_iter().map(|(k, _)| k).collect())
}

async fn list_all_s3_objects(
    state: &AppState,
    prefix: &str,
) -> Result<Vec<(String, i64)>, AppError> {
    let mut objects = Vec::new();
    let mut continuation_token: Option<String> = None;

    loop {
        let mut req = state
            .s3
            .list_objects_v2()
            .bucket(&state.config.s3_bucket)
            .prefix(prefix);

        if let Some(token) = &continuation_token {
            req = req.continuation_token(token);
        }

        let resp = req
            .send()
            .await
            .map_err(|e| AppError::Internal(format!("S3 list failed: {e}")))?;

        for obj in resp.contents() {
            if let Some(key) = obj.key() {
                let size = obj.size().unwrap_or(0);
                objects.push((key.to_string(), size));
            }
        }

        if resp.is_truncated() == Some(true) {
            continuation_token = resp.next_continuation_token().map(|s| s.to_string());
        } else {
            break;
        }
    }

    Ok(objects)
}
