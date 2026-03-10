use axum::extract::State;
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::Json;
use serde::Deserialize;

use crate::errors::AppError;
use crate::routes::AppState;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HealthMetricsRequest {
    pub project_slug: String,
    pub update_uuid: Option<String>,
    pub device_id: String,
    pub channel: Option<String>,
    pub platform: String,
    pub runtime_version: String,
    pub events: Vec<HealthEventPayload>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HealthEventPayload {
    #[serde(rename = "type")]
    pub event_type: String,
    pub name: Option<String>,
    pub message: Option<String>,
    #[serde(default = "default_count")]
    pub count: i32,
    pub flag_states: Option<serde_json::Value>,
    pub stack_trace: Option<String>,
    pub error_name: Option<String>,
    pub component_stack: Option<String>,
    #[serde(default)]
    pub is_fatal: bool,
    pub tags: Option<serde_json::Value>,
}

fn default_count() -> i32 {
    1
}

/// Slim ingestion handler: fast INSERT only, no aggregation.
///
/// Routes events by type:
/// - "perf_sample" -> performance_samples table
/// - everything else -> health_events_raw table
///
/// All aggregation (hourly, anomaly detection, daily stats, flag health snapshots)
/// is handled by the background aggregator task.
pub async fn handle_report_health_metrics(
    State(state): State<AppState>,
    Json(body): Json<HealthMetricsRequest>,
) -> Result<impl IntoResponse, AppError> {
    // 1. Resolve project by slug (public endpoint, no auth)
    tracing::debug!(slug = %body.project_slug, events = body.events.len(), "Health metrics received");
    let project_id = sqlx::query_scalar::<_, i64>(
        "SELECT id FROM projects WHERE slug = $1",
    )
    .bind(&body.project_slug)
    .fetch_optional(&state.db)
    .await
    .map_err(|e| { tracing::error!(error = %e, "Step 1: project lookup failed"); AppError::Internal(e.to_string()) })?
    .ok_or_else(|| { tracing::warn!(slug = %body.project_slug, "Step 1: project not found"); AppError::NotFound("Project not found".into()) })?;

    // 2. Insert events -- route by event_type
    for event in &body.events {
        if event.event_type == "perf_sample" {
            insert_performance_sample(&state.db, project_id, &body, event).await?;
        } else {
            insert_raw_health_event(&state.db, project_id, &body, event).await?;
        }
    }

    Ok(StatusCode::NO_CONTENT)
}

/// Insert a raw health event into health_events_raw.
async fn insert_raw_health_event(
    db: &sqlx::PgPool,
    project_id: i64,
    body: &HealthMetricsRequest,
    event: &HealthEventPayload,
) -> Result<(), AppError> {
    sqlx::query(
        "INSERT INTO health_events_raw \
         (project_id, update_uuid, device_id, channel_name, platform, \
          runtime_version, event_type, event_name, event_message, count, flag_states, \
          stack_trace, error_name, component_stack, is_fatal, tags) \
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)",
    )
    .bind(project_id)
    .bind(&body.update_uuid)
    .bind(&body.device_id)
    .bind(&body.channel)
    .bind(&body.platform)
    .bind(&body.runtime_version)
    .bind(&event.event_type)
    .bind(&event.name)
    .bind(&event.message)
    .bind(event.count)
    .bind(&event.flag_states)
    .bind(&event.stack_trace)
    .bind(&event.error_name)
    .bind(&event.component_stack)
    .bind(event.is_fatal)
    .bind(&event.tags)
    .execute(db)
    .await
    .map_err(|e| { tracing::error!(error = %e, event_type = %event.event_type, "Raw event insert failed"); AppError::Internal(e.to_string()) })?;

    Ok(())
}

/// Insert a performance timing sample into performance_samples.
/// Parses duration_ms from tags.duration_ms, metric_name from event.name.
async fn insert_performance_sample(
    db: &sqlx::PgPool,
    project_id: i64,
    body: &HealthMetricsRequest,
    event: &HealthEventPayload,
) -> Result<(), AppError> {
    let metric_name = event.name.as_deref().unwrap_or("unknown");
    let duration_ms = event
        .tags
        .as_ref()
        .and_then(|t| t.get("duration_ms"))
        .and_then(|v| v.as_str())
        .and_then(|s| s.parse::<f64>().ok())
        .unwrap_or(0.0);

    sqlx::query(
        "INSERT INTO performance_samples \
         (project_id, device_id, channel_name, platform, runtime_version, \
          metric_name, duration_ms) \
         VALUES ($1, $2, $3, $4, $5, $6, $7)",
    )
    .bind(project_id)
    .bind(&body.device_id)
    .bind(&body.channel)
    .bind(&body.platform)
    .bind(&body.runtime_version)
    .bind(metric_name)
    .bind(duration_ms)
    .execute(db)
    .await
    .map_err(|e| { tracing::error!(error = %e, metric = metric_name, "Performance sample insert failed"); AppError::Internal(e.to_string()) })?;

    Ok(())
}

