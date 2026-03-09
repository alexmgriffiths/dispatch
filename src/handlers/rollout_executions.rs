use axum::extract::{Path, Query, State};
use axum::http::StatusCode;
use axum::response::sse::{Event, KeepAlive, Sse};
use axum::response::IntoResponse;
use axum::Json;
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use std::convert::Infallible;
use tokio_stream::wrappers::BroadcastStream;
use tokio_stream::StreamExt;

use crate::auth::RequireAuth;
use crate::errors::AppError;
use crate::execution_events::ExecutionEvent;
use crate::models::{RolloutExecution, RolloutPolicyStage, RolloutStageHistory};
use crate::routes::AppState;

// ── SSE stream for execution updates ─────────────────────────────────────

pub async fn handle_execution_events(
    State(state): State<AppState>,
    Path(id): Path<i64>,
) -> Sse<impl tokio_stream::Stream<Item = Result<Event, Infallible>>> {
    let rx = state.execution_events.subscribe(id);
    let stream = BroadcastStream::new(rx).filter_map(|result| match result {
        Ok(event) => {
            let data = serde_json::to_string(&event).unwrap_or_default();
            Some(Ok(Event::default().data(data)))
        }
        Err(_) => None, // lagged — skip
    });
    Sse::new(stream).keep_alive(KeepAlive::default())
}

// ── List executions ──────────────────────────────────────────────────────

#[derive(Deserialize)]
pub struct ListExecutionsQuery {
    pub status: Option<String>,
}

#[derive(FromRow, Clone)]
pub struct ExecutionListItem {
    pub id: i64,
    pub project_id: i64,
    pub policy_id: i64,
    pub update_group_id: String,
    pub channel: String,
    pub current_stage: i32,
    pub status: String,
    pub started_at: chrono::DateTime<chrono::Utc>,
    pub completed_at: Option<chrono::DateTime<chrono::Utc>>,
    pub paused_at: Option<chrono::DateTime<chrono::Utc>>,
    pub policy_name: String,
    pub stage_count: i64,
    pub current_percentage: Option<i32>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExecutionListResponse {
    pub id: i64,
    pub project_id: i64,
    pub policy_id: i64,
    pub update_group_id: String,
    pub channel: String,
    pub current_stage: i32,
    pub status: String,
    pub started_at: chrono::DateTime<chrono::Utc>,
    pub completed_at: Option<chrono::DateTime<chrono::Utc>>,
    pub paused_at: Option<chrono::DateTime<chrono::Utc>>,
    pub policy_name: String,
    pub stage_count: i64,
    pub current_percentage: i32,
    pub linked_flag_count: i64,
    pub crash_rate: f64,
    pub js_error_rate: f64,
    pub unique_devices: i64,
    pub worst_flag_status: Option<String>,
}

pub async fn handle_list_executions(
    State(state): State<AppState>,
    auth: RequireAuth,
    Query(params): Query<ListExecutionsQuery>,
) -> Result<impl IntoResponse, AppError> {
    let project_id = auth.require_project()?;

    let executions = if let Some(ref status) = params.status {
        sqlx::query_as::<_, ExecutionListItem>(
            "SELECT e.*, p.name AS policy_name, \
             (SELECT COUNT(*) FROM rollout_policy_stages WHERE policy_id = e.policy_id) AS stage_count, \
             s.percentage AS current_percentage \
             FROM rollout_executions e \
             JOIN rollout_policies p ON p.id = e.policy_id \
             LEFT JOIN rollout_policy_stages s ON s.policy_id = e.policy_id AND s.stage_order = e.current_stage \
             WHERE e.project_id = $1 AND e.status = $2 \
             ORDER BY e.started_at DESC",
        )
        .bind(project_id)
        .bind(status)
        .fetch_all(&state.db)
        .await?
    } else {
        sqlx::query_as::<_, ExecutionListItem>(
            "SELECT e.*, p.name AS policy_name, \
             (SELECT COUNT(*) FROM rollout_policy_stages WHERE policy_id = e.policy_id) AS stage_count, \
             s.percentage AS current_percentage \
             FROM rollout_executions e \
             JOIN rollout_policies p ON p.id = e.policy_id \
             LEFT JOIN rollout_policy_stages s ON s.policy_id = e.policy_id AND s.stage_order = e.current_stage \
             WHERE e.project_id = $1 \
             ORDER BY e.started_at DESC",
        )
        .bind(project_id)
        .fetch_all(&state.db)
        .await?
    };

    if executions.is_empty() {
        return Ok(Json(Vec::<ExecutionListResponse>::new()));
    }

    // Build ID/channel/started arrays for batch queries
    let exec_ids: Vec<i64> = executions.iter().map(|e| e.id).collect();

    // Batch: linked flag counts per execution
    #[derive(FromRow)]
    struct FlagCountRow {
        execution_id: i64,
        cnt: i64,
    }
    let flag_counts = sqlx::query_as::<_, FlagCountRow>(
        "SELECT execution_id, COUNT(*) AS cnt FROM rollout_execution_flags \
         WHERE execution_id = ANY($1) GROUP BY execution_id",
    )
    .bind(&exec_ids)
    .fetch_all(&state.db)
    .await?;
    let flag_count_map: std::collections::HashMap<i64, i64> =
        flag_counts.into_iter().map(|r| (r.execution_id, r.cnt)).collect();

    // Batch: health events per (channel, started_at) — aggregate per execution
    #[derive(FromRow)]
    struct HealthAggRow {
        execution_id: i64,
        event_type: String,
        total_count: Option<i64>,
    }
    let channels: Vec<String> = executions.iter().map(|e| e.channel.clone()).collect();
    let started_ats: Vec<chrono::DateTime<chrono::Utc>> =
        executions.iter().map(|e| e.started_at).collect();

    let health_rows = sqlx::query_as::<_, HealthAggRow>(
        "SELECT v.exec_id AS execution_id, h.event_type, \
         COALESCE(SUM(h.total_count), 0)::bigint AS total_count \
         FROM UNNEST($1::bigint[], $2::text[], $3::timestamptz[]) AS v(exec_id, chan, started) \
         JOIN health_events_hourly h ON h.project_id = $4 \
           AND h.channel_name = v.chan AND h.bucket_hour >= v.started \
         GROUP BY v.exec_id, h.event_type",
    )
    .bind(&exec_ids)
    .bind(&channels)
    .bind(&started_ats)
    .bind(project_id)
    .fetch_all(&state.db)
    .await?;

    // Also fetch unique_devices per execution
    #[derive(FromRow)]
    struct DevicesRow {
        execution_id: i64,
        unique_devices: Option<i64>,
    }
    let device_rows = sqlx::query_as::<_, DevicesRow>(
        "SELECT v.exec_id AS execution_id, \
         COALESCE(SUM(h.unique_devices), 0)::bigint AS unique_devices \
         FROM UNNEST($1::bigint[], $2::text[], $3::timestamptz[]) AS v(exec_id, chan, started) \
         JOIN health_events_hourly h ON h.project_id = $4 \
           AND h.channel_name = v.chan AND h.bucket_hour >= v.started \
         GROUP BY v.exec_id",
    )
    .bind(&exec_ids)
    .bind(&channels)
    .bind(&started_ats)
    .bind(project_id)
    .fetch_all(&state.db)
    .await?;

    let device_map: std::collections::HashMap<i64, i64> = device_rows
        .into_iter()
        .map(|r| (r.execution_id, r.unique_devices.unwrap_or(0)))
        .collect();

    // Build per-execution health maps
    struct HealthAccum {
        crashes: i64,
        js_errors: i64,
        app_launches: i64,
    }
    let mut health_map: std::collections::HashMap<i64, HealthAccum> =
        std::collections::HashMap::new();
    for row in health_rows {
        let count = row.total_count.unwrap_or(0);
        let entry = health_map
            .entry(row.execution_id)
            .or_insert(HealthAccum { crashes: 0, js_errors: 0, app_launches: 0 });
        match row.event_type.as_str() {
            "crash" => entry.crashes += count,
            "js_error" => entry.js_errors += count,
            "app_launch" => entry.app_launches += count,
            _ => {}
        }
    }

    // Batch: worst flag health status per execution
    #[derive(FromRow)]
    struct WorstStatusRow {
        execution_id: i64,
        status: String,
    }
    let worst_status_rows = sqlx::query_as::<_, WorstStatusRow>(
        "SELECT xf.execution_id, fhs.status \
         FROM rollout_execution_flags xf \
         JOIN LATERAL ( \
           SELECT status FROM flag_health_snapshots \
           WHERE flag_id = xf.flag_id \
           ORDER BY CASE status \
             WHEN 'incident' THEN 0 WHEN 'degraded' THEN 1 ELSE 2 END, \
             recorded_at DESC \
           LIMIT 1 \
         ) fhs ON true \
         WHERE xf.execution_id = ANY($1)",
    )
    .bind(&exec_ids)
    .fetch_all(&state.db)
    .await?;

    let mut worst_status_map: std::collections::HashMap<i64, String> =
        std::collections::HashMap::new();
    let status_priority = |s: &str| -> i32 {
        match s {
            "incident" => 0,
            "degraded" => 1,
            _ => 2,
        }
    };
    for row in worst_status_rows {
        let entry = worst_status_map.entry(row.execution_id).or_insert_with(|| row.status.clone());
        if status_priority(&row.status) < status_priority(entry) {
            *entry = row.status;
        }
    }

    let result: Vec<ExecutionListResponse> = executions
        .into_iter()
        .map(|e| {
            let health = health_map.get(&e.id);
            let denominator = health.map_or(1.0, |h| if h.app_launches > 0 { h.app_launches as f64 } else { 1.0 });
            ExecutionListResponse {
                id: e.id,
                project_id: e.project_id,
                policy_id: e.policy_id,
                update_group_id: e.update_group_id,
                channel: e.channel,
                current_stage: e.current_stage,
                status: e.status,
                started_at: e.started_at,
                completed_at: e.completed_at,
                paused_at: e.paused_at,
                policy_name: e.policy_name,
                stage_count: e.stage_count,
                current_percentage: e.current_percentage.unwrap_or(0),
                linked_flag_count: flag_count_map.get(&e.id).copied().unwrap_or(0),
                crash_rate: health.map_or(0.0, |h| h.crashes as f64 / denominator),
                js_error_rate: health.map_or(0.0, |h| h.js_errors as f64 / denominator),
                unique_devices: device_map.get(&e.id).copied().unwrap_or(0),
                worst_flag_status: worst_status_map.get(&e.id).cloned(),
            }
        })
        .collect();

    Ok(Json(result))
}

// ── Get execution ────────────────────────────────────────────────────────

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExecutionHealthMetrics {
    pub crash_rate: f64,
    pub js_error_rate: f64,
    pub app_launches: i64,
    pub unique_devices: i64,
}

#[derive(FromRow)]
struct LinkedFlagRow {
    flag_id: i64,
    key: String,
    name: String,
    flag_type: String,
    link_type: String,
    enabled: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LinkedFlagHealth {
    pub error_rate: f64,
    pub error_rate_delta: Option<f64>,
    pub crash_free: f64,
    pub status: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LinkedFlagResponse {
    pub id: i64,
    pub key: String,
    pub name: String,
    pub flag_type: String,
    pub link_type: String,
    pub enabled: bool,
    pub variation_name: Option<String>,
    pub variation_value: Option<serde_json::Value>,
    pub triggered_at: Option<String>,
    pub health: Option<LinkedFlagHealth>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExecutionDetailResponse {
    #[serde(flatten)]
    pub execution: RolloutExecution,
    pub policy_name: String,
    pub release_notes: String,
    pub stages: Vec<RolloutPolicyStage>,
    pub history: Vec<RolloutStageHistory>,
    pub health: ExecutionHealthMetrics,
    pub linked_flags: Vec<LinkedFlagResponse>,
}

pub async fn handle_get_execution(
    State(state): State<AppState>,
    auth: RequireAuth,
    Path(id): Path<i64>,
) -> Result<impl IntoResponse, AppError> {
    let project_id = auth.require_project()?;

    let execution = sqlx::query_as::<_, RolloutExecution>(
        "SELECT * FROM rollout_executions WHERE id = $1 AND project_id = $2",
    )
    .bind(id)
    .bind(project_id)
    .fetch_optional(&state.db)
    .await?
    .ok_or_else(|| AppError::NotFound("Rollout execution not found".into()))?;

    let policy_name: String = sqlx::query_scalar(
        "SELECT name FROM rollout_policies WHERE id = $1",
    )
    .bind(execution.policy_id)
    .fetch_one(&state.db)
    .await?;

    let release_notes: String = sqlx::query_scalar::<_, Option<String>>(
        "SELECT release_message FROM updates \
         WHERE project_id = $1 AND group_id = $2 \
         ORDER BY created_at DESC LIMIT 1",
    )
    .bind(project_id)
    .bind(&execution.update_group_id)
    .fetch_optional(&state.db)
    .await?
    .flatten()
    .unwrap_or_default();

    let stages = sqlx::query_as::<_, RolloutPolicyStage>(
        "SELECT * FROM rollout_policy_stages WHERE policy_id = $1 ORDER BY stage_order",
    )
    .bind(execution.policy_id)
    .fetch_all(&state.db)
    .await?;

    let history = sqlx::query_as::<_, RolloutStageHistory>(
        "SELECT * FROM rollout_stage_history WHERE execution_id = $1 ORDER BY stage_order",
    )
    .bind(execution.id)
    .fetch_all(&state.db)
    .await?;

    // Execution-level health from health_events_hourly (since execution started)
    let health = fetch_execution_health(&state.db, project_id, &execution).await?;

    // Linked flags with per-flag health from flag_health_snapshots
    let linked_flags =
        fetch_linked_flags_with_health(&state.db, execution.id, &execution.channel).await?;

    Ok(Json(ExecutionDetailResponse {
        execution,
        policy_name,
        release_notes,
        stages,
        history,
        health,
        linked_flags,
    }))
}

async fn fetch_execution_health(
    db: &sqlx::PgPool,
    project_id: i64,
    execution: &RolloutExecution,
) -> Result<ExecutionHealthMetrics, AppError> {
    #[derive(FromRow)]
    struct HealthRow {
        total_count: Option<i64>,
        event_type: String,
    }

    let rows = sqlx::query_as::<_, HealthRow>(
        "SELECT event_type, COALESCE(SUM(total_count), 0)::bigint AS total_count \
         FROM health_events_hourly \
         WHERE project_id = $1 AND channel_name = $2 \
         AND bucket_hour >= $3 \
         GROUP BY event_type",
    )
    .bind(project_id)
    .bind(&execution.channel)
    .bind(execution.started_at)
    .fetch_all(db)
    .await?;

    let mut crashes: i64 = 0;
    let mut js_errors: i64 = 0;
    let mut app_launches: i64 = 0;
    for row in &rows {
        let count = row.total_count.unwrap_or(0);
        match row.event_type.as_str() {
            "crash" => crashes += count,
            "js_error" => js_errors += count,
            "app_launch" => app_launches += count,
            _ => {}
        }
    }

    let unique_devices = sqlx::query_scalar::<_, Option<i64>>(
        "SELECT COALESCE(SUM(unique_devices), 0)::bigint FROM health_events_hourly \
         WHERE project_id = $1 AND channel_name = $2 \
         AND bucket_hour >= $3",
    )
    .bind(project_id)
    .bind(&execution.channel)
    .bind(execution.started_at)
    .fetch_one(db)
    .await?
    .unwrap_or(0);

    let denominator = if app_launches > 0 { app_launches as f64 } else { 1.0 };

    Ok(ExecutionHealthMetrics {
        crash_rate: crashes as f64 / denominator,
        js_error_rate: js_errors as f64 / denominator,
        app_launches,
        unique_devices,
    })
}

async fn fetch_linked_flags_with_health(
    db: &sqlx::PgPool,
    execution_id: i64,
    channel: &str,
) -> Result<Vec<LinkedFlagResponse>, AppError> {
    let flag_rows = sqlx::query_as::<_, LinkedFlagRow>(
        "SELECT f.id AS flag_id, f.key, f.name, f.flag_type, xf.link_type, \
         xf.target_enabled AS enabled \
         FROM rollout_execution_flags xf \
         JOIN feature_flags f ON f.id = xf.flag_id \
         WHERE xf.execution_id = $1 \
         ORDER BY f.name",
    )
    .bind(execution_id)
    .fetch_all(db)
    .await?;

    let mut result = Vec::with_capacity(flag_rows.len());
    for flag in flag_rows {
        // Get latest health snapshot for this flag+channel
        #[derive(FromRow)]
        struct HealthSnap {
            error_rate: f64,
            error_rate_delta: Option<f64>,
            crash_free: f64,
            status: String,
        }

        let health = sqlx::query_as::<_, HealthSnap>(
            "SELECT error_rate, error_rate_delta, crash_free, status \
             FROM flag_health_snapshots \
             WHERE flag_id = $1 AND channel_name = $2 \
             ORDER BY recorded_at DESC LIMIT 1",
        )
        .bind(flag.flag_id)
        .bind(channel)
        .fetch_optional(db)
        .await?;

        result.push(LinkedFlagResponse {
            id: flag.flag_id,
            key: flag.key,
            name: flag.name,
            flag_type: flag.flag_type,
            link_type: flag.link_type,
            enabled: flag.enabled,
            variation_name: None,
            variation_value: None,
            triggered_at: None,
            health: health.map(|h| LinkedFlagHealth {
                error_rate: h.error_rate,
                error_rate_delta: h.error_rate_delta,
                crash_free: h.crash_free,
                status: h.status,
            }),
        });
    }

    Ok(result)
}

// ── Pause execution ──────────────────────────────────────────────────────

pub async fn handle_pause_execution(
    State(state): State<AppState>,
    auth: RequireAuth,
    Path(id): Path<i64>,
) -> Result<impl IntoResponse, AppError> {
    auth.require_editor()?;
    let project_id = auth.require_project()?;

    let execution = sqlx::query_as::<_, RolloutExecution>(
        "SELECT * FROM rollout_executions WHERE id = $1 AND project_id = $2",
    )
    .bind(id)
    .bind(project_id)
    .fetch_optional(&state.db)
    .await?
    .ok_or_else(|| AppError::NotFound("Rollout execution not found".into()))?;

    if execution.status != "running" {
        return Err(AppError::BadRequest(format!(
            "Cannot pause execution with status '{}'",
            execution.status
        )));
    }

    let updated = sqlx::query_as::<_, RolloutExecution>(
        "UPDATE rollout_executions SET status = 'paused', paused_at = NOW() \
         WHERE id = $1 RETURNING *",
    )
    .bind(id)
    .fetch_one(&state.db)
    .await?;

    state.execution_events.emit(id, ExecutionEvent::Updated);

    Ok(Json(updated))
}

// ── Resume execution ─────────────────────────────────────────────────────

pub async fn handle_resume_execution(
    State(state): State<AppState>,
    auth: RequireAuth,
    Path(id): Path<i64>,
) -> Result<impl IntoResponse, AppError> {
    auth.require_editor()?;
    let project_id = auth.require_project()?;

    let execution = sqlx::query_as::<_, RolloutExecution>(
        "SELECT * FROM rollout_executions WHERE id = $1 AND project_id = $2",
    )
    .bind(id)
    .bind(project_id)
    .fetch_optional(&state.db)
    .await?
    .ok_or_else(|| AppError::NotFound("Rollout execution not found".into()))?;

    if execution.status != "paused" {
        return Err(AppError::BadRequest(format!(
            "Cannot resume execution with status '{}'",
            execution.status
        )));
    }

    let updated = sqlx::query_as::<_, RolloutExecution>(
        "UPDATE rollout_executions SET status = 'running', paused_at = NULL \
         WHERE id = $1 RETURNING *",
    )
    .bind(id)
    .fetch_one(&state.db)
    .await?;

    state.execution_events.emit(id, ExecutionEvent::Updated);

    Ok(Json(updated))
}

// ── Cancel execution ─────────────────────────────────────────────────────

pub async fn handle_cancel_execution(
    State(state): State<AppState>,
    auth: RequireAuth,
    Path(id): Path<i64>,
) -> Result<impl IntoResponse, AppError> {
    auth.require_editor()?;
    let project_id = auth.require_project()?;

    let execution = sqlx::query_as::<_, RolloutExecution>(
        "SELECT * FROM rollout_executions WHERE id = $1 AND project_id = $2",
    )
    .bind(id)
    .bind(project_id)
    .fetch_optional(&state.db)
    .await?
    .ok_or_else(|| AppError::NotFound("Rollout execution not found".into()))?;

    if execution.status != "running" && execution.status != "paused" {
        return Err(AppError::BadRequest(format!(
            "Cannot cancel execution with status '{}'",
            execution.status
        )));
    }

    let updated = sqlx::query_as::<_, RolloutExecution>(
        "UPDATE rollout_executions \
         SET status = 'rolled_back', completed_at = NOW(), rollback_reason = 'Manual rollback' \
         WHERE id = $1 RETURNING *",
    )
    .bind(id)
    .fetch_one(&state.db)
    .await?;

    // Complete current stage with rolled_back status
    sqlx::query(
        "UPDATE rollout_stage_history SET completed_at = NOW(), health_status = 'rolled_back' \
         WHERE execution_id = $1 AND completed_at IS NULL",
    )
    .bind(id)
    .execute(&state.db)
    .await?;

    // Delete targeting rules created by this execution
    delete_execution_targeting_rules(&state.db, id)
        .await
        .map_err(|e| AppError::Internal(format!("Failed to delete targeting rules: {e}")))?;

    // Restore linked flags to their pre-execution state
    let restored = restore_pre_execution_flags(
        &state.db,
        id,
        &execution.channel,
        project_id,
    )
    .await
    .map_err(|e| AppError::Internal(format!("Failed to restore linked flags: {e}")))?;

    if !restored.is_empty() {
        tracing::info!(
            execution_id = id,
            flags = ?restored,
            "Restored linked flags to pre-execution state on rollback"
        );
    }

    state.execution_events.emit(id, ExecutionEvent::Updated);
    state.execution_events.remove(id);

    Ok(Json(updated))
}

// ── Advance execution ────────────────────────────────────────────────────

pub async fn handle_advance_execution(
    State(state): State<AppState>,
    auth: RequireAuth,
    Path(id): Path<i64>,
) -> Result<impl IntoResponse, AppError> {
    auth.require_editor()?;
    let project_id = auth.require_project()?;

    let execution = sqlx::query_as::<_, RolloutExecution>(
        "SELECT * FROM rollout_executions WHERE id = $1 AND project_id = $2",
    )
    .bind(id)
    .bind(project_id)
    .fetch_optional(&state.db)
    .await?
    .ok_or_else(|| AppError::NotFound("Rollout execution not found".into()))?;

    if execution.status != "running" {
        return Err(AppError::BadRequest(format!(
            "Cannot advance execution with status '{}'",
            execution.status
        )));
    }

    // Get total stage count
    let stages = sqlx::query_as::<_, RolloutPolicyStage>(
        "SELECT * FROM rollout_policy_stages WHERE policy_id = $1 ORDER BY stage_order",
    )
    .bind(execution.policy_id)
    .fetch_all(&state.db)
    .await?;

    let next_stage = execution.current_stage + 1;

    // Complete the current stage history entry
    sqlx::query(
        "UPDATE rollout_stage_history SET completed_at = NOW() \
         WHERE execution_id = $1 AND stage_order = $2 AND completed_at IS NULL",
    )
    .bind(id)
    .bind(execution.current_stage)
    .execute(&state.db)
    .await?;

    if next_stage > stages.len() as i32 {
        // Past last stage — finalize flags, delete targeting rules, mark completed
        update_execution_rollout_percentage(&state.db, &execution, 100)
            .await
            .map_err(|e| AppError::Internal(format!("Failed to update rollout percentage: {e}")))?;

        finalize_execution_flags(&state.db, id, &execution.channel)
            .await
            .map_err(|e| AppError::Internal(format!("Failed to finalize flags: {e}")))?;

        delete_execution_targeting_rules(&state.db, id)
            .await
            .map_err(|e| AppError::Internal(format!("Failed to delete targeting rules: {e}")))?;

        let updated = sqlx::query_as::<_, RolloutExecution>(
            "UPDATE rollout_executions \
             SET status = 'completed', current_stage = $2, completed_at = NOW() \
             WHERE id = $1 RETURNING *",
        )
        .bind(id)
        .bind(next_stage)
        .fetch_one(&state.db)
        .await?;

        state.execution_events.emit(id, ExecutionEvent::Updated);
        state.execution_events.remove(id);
        return Ok(Json(updated));
    }

    // Find the stage we're advancing to
    let target_stage = stages
        .iter()
        .find(|s| s.stage_order == next_stage)
        .ok_or_else(|| AppError::Internal("Stage configuration mismatch".into()))?;

    // Insert new stage history entry
    sqlx::query(
        "INSERT INTO rollout_stage_history (execution_id, stage_order, percentage) \
         VALUES ($1, $2, $3)",
    )
    .bind(id)
    .bind(next_stage)
    .bind(target_stage.percentage)
    .execute(&state.db)
    .await?;

    // Update execution current_stage
    let updated = sqlx::query_as::<_, RolloutExecution>(
        "UPDATE rollout_executions SET current_stage = $2 WHERE id = $1 RETURNING *",
    )
    .bind(id)
    .bind(next_stage)
    .fetch_one(&state.db)
    .await?;

    // Update targeting rules to the new stage's percentage
    update_execution_targeting_rules(&state.db, id, target_stage.percentage)
        .await
        .map_err(|e| AppError::Internal(format!("Failed to update targeting rules: {e}")))?;

    // Update release rollout percentage to match stage
    update_execution_rollout_percentage(&state.db, &execution, target_stage.percentage)
        .await
        .map_err(|e| AppError::Internal(format!("Failed to update rollout percentage: {e}")))?;

    state.execution_events.emit(id, ExecutionEvent::Updated);

    Ok(Json(updated))
}

// ── Execution flags management ───────────────────────────────────────────

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExecutionFlagPayload {
    pub flag_id: i64,
    pub link_type: Option<String>,
    #[serde(default = "default_true")]
    pub target_enabled: bool,
}

fn default_true() -> bool {
    true
}

pub async fn handle_add_execution_flag(
    State(state): State<AppState>,
    auth: RequireAuth,
    Path(execution_id): Path<i64>,
    Json(body): Json<ExecutionFlagPayload>,
) -> Result<impl IntoResponse, AppError> {
    auth.require_editor()?;
    let project_id = auth.require_project()?;

    // Verify execution belongs to project and get channel
    let channel = sqlx::query_scalar::<_, String>(
        "SELECT channel FROM rollout_executions WHERE id = $1 AND project_id = $2",
    )
    .bind(execution_id)
    .bind(project_id)
    .fetch_optional(&state.db)
    .await?
    .ok_or_else(|| AppError::NotFound("Execution not found".into()))?;

    let link_type = body.link_type.as_deref().unwrap_or("kill_switch");
    if !matches!(link_type, "monitor" | "kill_switch" | "gate") {
        return Err(AppError::BadRequest(
            "link_type must be 'monitor', 'kill_switch', or 'gate'".into(),
        ));
    }

    // Snapshot current per-channel state
    let pre_enabled: Option<bool> = sqlx::query_scalar(
        "SELECT enabled FROM flag_env_settings \
         WHERE flag_id = $1 AND channel_name = $2",
    )
    .bind(body.flag_id)
    .bind(&channel)
    .fetch_optional(&state.db)
    .await?;

    sqlx::query(
        "INSERT INTO rollout_execution_flags \
         (execution_id, flag_id, link_type, target_enabled, pre_execution_enabled) \
         VALUES ($1, $2, $3, $4, $5) ON CONFLICT (execution_id, flag_id) \
         DO UPDATE SET link_type = EXCLUDED.link_type, \
         target_enabled = EXCLUDED.target_enabled, \
         pre_execution_enabled = EXCLUDED.pre_execution_enabled",
    )
    .bind(execution_id)
    .bind(body.flag_id)
    .bind(link_type)
    .bind(body.target_enabled)
    .bind(pre_enabled)
    .execute(&state.db)
    .await?;

    // Get current stage percentage and create a targeting rule
    let current_pct: Option<i32> = sqlx::query_scalar(
        "SELECT sh.percentage FROM rollout_stage_history sh \
         JOIN rollout_executions e ON e.id = sh.execution_id \
         WHERE sh.execution_id = $1 AND sh.stage_order = e.current_stage \
         AND sh.completed_at IS NULL \
         LIMIT 1",
    )
    .bind(execution_id)
    .fetch_optional(&state.db)
    .await?;

    if let Some(pct) = current_pct {
        let rule_id = create_rollout_targeting_rule(
            &state.db,
            body.flag_id,
            &channel,
            pct,
            body.target_enabled,
        )
        .await
        .map_err(|e| AppError::Internal(format!("Failed to create targeting rule: {e}")))?;

        sqlx::query(
            "UPDATE rollout_execution_flags SET targeting_rule_id = $1 \
             WHERE execution_id = $2 AND flag_id = $3",
        )
        .bind(rule_id)
        .bind(execution_id)
        .bind(body.flag_id)
        .execute(&state.db)
        .await?;
    }

    state.execution_events.emit(execution_id, ExecutionEvent::Updated);

    Ok(StatusCode::CREATED)
}

pub async fn handle_remove_execution_flag(
    State(state): State<AppState>,
    auth: RequireAuth,
    Path((execution_id, flag_id)): Path<(i64, i64)>,
) -> Result<impl IntoResponse, AppError> {
    auth.require_editor()?;
    let project_id = auth.require_project()?;

    // Verify execution belongs to project
    sqlx::query_scalar::<_, i64>(
        "SELECT id FROM rollout_executions WHERE id = $1 AND project_id = $2",
    )
    .bind(execution_id)
    .bind(project_id)
    .fetch_optional(&state.db)
    .await?
    .ok_or_else(|| AppError::NotFound("Execution not found".into()))?;

    sqlx::query(
        "DELETE FROM rollout_execution_flags WHERE execution_id = $1 AND flag_id = $2",
    )
    .bind(execution_id)
    .bind(flag_id)
    .execute(&state.db)
    .await?;

    Ok(StatusCode::NO_CONTENT)
}

// ── Revert individual flag on an execution ──────────────────────────────

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RevertFlagResponse {
    pub flag_id: i64,
    pub restored: bool,
}

pub async fn handle_revert_flag(
    State(state): State<AppState>,
    auth: RequireAuth,
    Path((execution_id, flag_id)): Path<(i64, i64)>,
) -> Result<impl IntoResponse, AppError> {
    auth.require_editor()?;
    let project_id = auth.require_project()?;

    // Verify execution exists and belongs to this project
    let execution = sqlx::query_as::<_, RolloutExecution>(
        "SELECT * FROM rollout_executions WHERE id = $1 AND project_id = $2",
    )
    .bind(execution_id)
    .bind(project_id)
    .fetch_optional(&state.db)
    .await?
    .ok_or_else(|| AppError::NotFound("Rollout execution not found".into()))?;

    // Verify the flag is linked and get snapshot
    #[derive(sqlx::FromRow)]
    struct FlagLink {
        key: String,
        pre_execution_enabled: Option<bool>,
    }
    let link = sqlx::query_as::<_, FlagLink>(
        "SELECT f.key, xf.pre_execution_enabled \
         FROM rollout_execution_flags xf \
         JOIN feature_flags f ON f.id = xf.flag_id \
         WHERE xf.execution_id = $1 AND xf.flag_id = $2",
    )
    .bind(execution_id)
    .bind(flag_id)
    .fetch_optional(&state.db)
    .await?
    .ok_or_else(|| AppError::NotFound("Flag is not linked to this execution".into()))?;

    let flag_key = link.key;
    let restore_to = link.pre_execution_enabled.unwrap_or(false);

    // Delete this flag's targeting rule created by the execution
    delete_flag_targeting_rule(&state.db, execution_id, flag_id)
        .await
        .map_err(|e| AppError::Internal(format!("Failed to delete targeting rule: {e}")))?;

    // Restore per-channel setting to pre-execution state
    let updated_rows = sqlx::query(
        "UPDATE flag_env_settings SET enabled = $1 \
         WHERE flag_id = $2 AND channel_name = $3",
    )
    .bind(restore_to)
    .bind(flag_id)
    .bind(&execution.channel)
    .execute(&state.db)
    .await?;

    if updated_rows.rows_affected() == 0 {
        sqlx::query(
            "INSERT INTO flag_env_settings (flag_id, channel_name, enabled) \
             VALUES ($1, $2, $3)",
        )
        .bind(flag_id)
        .bind(&execution.channel)
        .bind(restore_to)
        .execute(&state.db)
        .await?;
    }

    tracing::warn!(
        execution_id,
        flag_id,
        flag_key = %flag_key,
        channel = %execution.channel,
        restored_to = restore_to,
        "Per-flag revert: restored flag to pre-execution state"
    );

    // Record audit on the execution
    crate::handlers::audit::record_audit(
        &state.db,
        &auth,
        "flag_reverted",
        "rollout_execution",
        Some(execution_id),
        serde_json::json!({
            "flagId": flag_id,
            "flagKey": flag_key,
            "channel": execution.channel,
        }),
    )
    .await;

    // Record audit on the flag itself so it shows in flag detail audit history
    crate::handlers::audit::record_audit(
        &state.db,
        &auth,
        "flag.rollout_reverted",
        "feature_flag",
        Some(flag_id),
        serde_json::json!({
            "executionId": execution_id,
            "channel": execution.channel,
            "restoredTo": restore_to,
        }),
    )
    .await;

    state.execution_events.emit(execution_id, ExecutionEvent::Updated);

    Ok(Json(RevertFlagResponse {
        flag_id,
        restored: true,
    }))
}

// ── Restore linked flags to pre-execution state on rollback ──────────────

/// Restore all linked flags to the state they were in before the execution started.
/// Uses the `pre_execution_enabled` snapshot stored when the execution was created.
pub async fn restore_pre_execution_flags(
    db: &sqlx::PgPool,
    execution_id: i64,
    channel: &str,
    project_id: i64,
) -> Result<Vec<String>, Box<dyn std::error::Error + Send + Sync>> {
    #[derive(FromRow)]
    struct LinkedFlagSnapshot {
        flag_id: i64,
        key: String,
        pre_execution_enabled: Option<bool>,
    }

    let flags = sqlx::query_as::<_, LinkedFlagSnapshot>(
        "SELECT xf.flag_id, f.key, xf.pre_execution_enabled \
         FROM rollout_execution_flags xf \
         JOIN feature_flags f ON f.id = xf.flag_id \
         WHERE xf.execution_id = $1",
    )
    .bind(execution_id)
    .fetch_all(db)
    .await?;

    let mut restored_keys = Vec::new();

    for flag in &flags {
        // Restore to pre-execution state (default to false if no snapshot)
        let restore_to = flag.pre_execution_enabled.unwrap_or(false);

        let rows = sqlx::query(
            "UPDATE flag_env_settings SET enabled = $1 \
             WHERE flag_id = $2 AND channel_name = $3",
        )
        .bind(restore_to)
        .bind(flag.flag_id)
        .bind(channel)
        .execute(db)
        .await?;

        if rows.rows_affected() == 0 {
            sqlx::query(
                "INSERT INTO flag_env_settings (flag_id, channel_name, enabled) \
                 VALUES ($1, $2, $3)",
            )
            .bind(flag.flag_id)
            .bind(channel)
            .bind(restore_to)
            .execute(db)
            .await?;
        }

        restored_keys.push(flag.key.clone());

        // Audit: flag state restored by rollback
        crate::handlers::audit::record_system_audit(
            db,
            project_id,
            "flag.rollout_restored",
            "feature_flag",
            Some(flag.flag_id),
            serde_json::json!({
                "executionId": execution_id,
                "channel": channel,
                "restoredTo": restore_to,
            }),
        )
        .await;

        tracing::info!(
            flag_id = flag.flag_id,
            flag_key = %flag.key,
            execution_id,
            channel,
            restored_to = restore_to,
            "Restored flag to pre-execution state"
        );
    }

    Ok(restored_keys)
}

// ── Targeting-rule helpers for rollout executions ─────────────────────────

/// Create a `percentage_rollout` targeting rule on a flag for the given channel.
/// Returns the newly created rule's ID.
///
/// The rule assigns `percentage`% weight to the target variation (determined by
/// `target_enabled`) and the remaining weight to the other variation.
pub async fn create_rollout_targeting_rule(
    db: &sqlx::PgPool,
    flag_id: i64,
    channel: &str,
    percentage: i32,
    target_enabled: bool,
) -> Result<i64, Box<dyn std::error::Error + Send + Sync>> {
    // Fetch variations for this flag
    let variations = fetch_flag_variations(db, flag_id).await?;

    // Build the rollout config based on variations
    let rollout = build_rollout_config(&variations, percentage, target_enabled);

    // Use the target variation's value as variant_value
    let target_value = if target_enabled {
        serde_json::Value::Bool(true)
    } else {
        serde_json::Value::Bool(false)
    };

    let rule_id: i64 = sqlx::query_scalar(
        "INSERT INTO flag_targeting_rules \
         (flag_id, priority, rule_type, variant_value, rule_config, channel_name) \
         VALUES ($1, 0, 'percentage_rollout', $2, $3, $4) \
         RETURNING id",
    )
    .bind(flag_id)
    .bind(&target_value)
    .bind(&rollout)
    .bind(channel)
    .fetch_one(db)
    .await?;

    Ok(rule_id)
}

/// Update the percentage weights on all targeting rules linked to an execution.
pub async fn update_execution_targeting_rules(
    db: &sqlx::PgPool,
    execution_id: i64,
    new_percentage: i32,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    #[derive(sqlx::FromRow)]
    struct RuleLink {
        flag_id: i64,
        targeting_rule_id: Option<i64>,
        target_enabled: bool,
    }
    let links = sqlx::query_as::<_, RuleLink>(
        "SELECT flag_id, targeting_rule_id, target_enabled \
         FROM rollout_execution_flags WHERE execution_id = $1",
    )
    .bind(execution_id)
    .fetch_all(db)
    .await?;

    for link in &links {
        let rule_id = match link.targeting_rule_id {
            Some(id) => id,
            None => continue,
        };

        // Fetch variations
        let variations = fetch_flag_variations(db, link.flag_id).await?;

        let rollout = build_rollout_config(&variations, new_percentage, link.target_enabled);

        sqlx::query("UPDATE flag_targeting_rules SET rule_config = $1 WHERE id = $2")
            .bind(&rollout)
            .bind(rule_id)
            .execute(db)
            .await?;
    }

    Ok(())
}

/// Update the rollout_percentage on all updates in the execution's group
/// so the manifest endpoint serves to the correct percentage of devices.
pub async fn update_execution_rollout_percentage(
    db: &sqlx::PgPool,
    execution: &RolloutExecution,
    percentage: i32,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    sqlx::query(
        "UPDATE updates SET rollout_percentage = $1 \
         WHERE group_id = $2 AND project_id = $3",
    )
    .bind(percentage)
    .bind(&execution.update_group_id)
    .bind(execution.project_id)
    .execute(db)
    .await?;

    tracing::info!(
        execution_id = execution.id,
        group_id = %execution.update_group_id,
        percentage,
        "Updated release rollout percentage"
    );

    Ok(())
}

/// On successful completion, update each linked flag's default_value to match
/// the target_enabled state so the flag stays in the correct state after the
/// targeting rule is removed.
pub async fn finalize_execution_flags(
    db: &sqlx::PgPool,
    execution_id: i64,
    channel: &str,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    #[derive(sqlx::FromRow)]
    struct LinkedFlag {
        flag_id: i64,
        target_enabled: bool,
    }

    let flags = sqlx::query_as::<_, LinkedFlag>(
        "SELECT flag_id, target_enabled FROM rollout_execution_flags WHERE execution_id = $1",
    )
    .bind(execution_id)
    .fetch_all(db)
    .await?;

    for lf in &flags {
        let default_value = serde_json::Value::Bool(lf.target_enabled);
        sqlx::query(
            "UPDATE flag_env_settings SET default_value = $3 \
             WHERE flag_id = $1 AND channel_name = $2",
        )
        .bind(lf.flag_id)
        .bind(channel)
        .bind(&default_value)
        .execute(db)
        .await?;
    }

    Ok(())
}

/// Delete all targeting rules created by an execution and clear the references.
pub async fn delete_execution_targeting_rules(
    db: &sqlx::PgPool,
    execution_id: i64,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    // Delete the actual rules
    sqlx::query(
        "DELETE FROM flag_targeting_rules WHERE id IN \
         (SELECT targeting_rule_id FROM rollout_execution_flags \
          WHERE execution_id = $1 AND targeting_rule_id IS NOT NULL)",
    )
    .bind(execution_id)
    .execute(db)
    .await?;

    // Clear the references
    sqlx::query(
        "UPDATE rollout_execution_flags SET targeting_rule_id = NULL WHERE execution_id = $1",
    )
    .bind(execution_id)
    .execute(db)
    .await?;

    Ok(())
}

/// Delete a single flag's targeting rule from an execution.
pub async fn delete_flag_targeting_rule(
    db: &sqlx::PgPool,
    execution_id: i64,
    flag_id: i64,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let rule_id: Option<i64> = sqlx::query_scalar(
        "SELECT targeting_rule_id FROM rollout_execution_flags \
         WHERE execution_id = $1 AND flag_id = $2",
    )
    .bind(execution_id)
    .bind(flag_id)
    .fetch_optional(db)
    .await?
    .flatten();

    if let Some(id) = rule_id {
        sqlx::query("DELETE FROM flag_targeting_rules WHERE id = $1")
            .bind(id)
            .execute(db)
            .await?;

        sqlx::query(
            "UPDATE rollout_execution_flags SET targeting_rule_id = NULL \
             WHERE execution_id = $1 AND flag_id = $2",
        )
        .bind(execution_id)
        .bind(flag_id)
        .execute(db)
        .await?;
    }

    Ok(())
}

async fn fetch_flag_variations(
    db: &sqlx::PgPool,
    flag_id: i64,
) -> Result<Vec<(i64, serde_json::Value)>, Box<dyn std::error::Error + Send + Sync>> {
    #[derive(sqlx::FromRow)]
    struct Var {
        id: i64,
        value: serde_json::Value,
    }
    let rows = sqlx::query_as::<_, Var>(
        "SELECT id, value FROM flag_variations WHERE flag_id = $1 ORDER BY sort_order",
    )
    .bind(flag_id)
    .fetch_all(db)
    .await?;
    Ok(rows.into_iter().map(|v| (v.id, v.value)).collect())
}

/// Build a percentage_rollout rule_config JSON for the given variations and percentage.
///
/// For boolean flags: assigns `percentage`% to the target variation (true or false)
/// and the remainder to the other variation.
/// For non-boolean flags with 2+ variations: assigns `percentage`% to the first
/// variation and the remainder to the second.
fn build_rollout_config(
    variations: &[(i64, serde_json::Value)],
    percentage: i32,
    target_enabled: bool,
) -> serde_json::Value {
    if variations.len() < 2 {
        // Fallback: single variation gets 100%
        let var_id = variations.first().map(|(id, _)| *id).unwrap_or(0);
        return serde_json::json!({
            "rollout": [{ "variationId": var_id, "weight": 100 }]
        });
    }

    // Find the target and non-target variation.
    // For boolean flags: target_enabled=true → target is the `true` variation.
    // For non-boolean: use first=target, second=non-target.
    let target_idx = variations
        .iter()
        .position(|(_, v)| *v == serde_json::Value::Bool(target_enabled))
        .unwrap_or(0);
    let non_target_idx = if target_idx == 0 { 1 } else { 0 };

    let target_weight = percentage.clamp(0, 100);
    let non_target_weight = 100 - target_weight;

    serde_json::json!({
        "rollout": [
            { "variationId": variations[target_idx].0, "weight": target_weight },
            { "variationId": variations[non_target_idx].0, "weight": non_target_weight },
        ]
    })
}
