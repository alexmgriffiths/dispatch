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

    // 2. Insert raw events
    for event in &body.events {
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
        .execute(&state.db)
        .await
        .map_err(|e| { tracing::error!(error = %e, event_type = %event.event_type, "Step 2: raw event insert failed"); AppError::Internal(e.to_string()) })?;
    }

    // 3. Upsert hourly aggregates
    let now = chrono::Utc::now();
    let bucket_hour = now
        .date_naive()
        .and_hms_opt(now.time().hour(), 0, 0)
        .unwrap()
        .and_utc();

    // Normalize NULL update_uuid to empty string so the UNIQUE constraint
    // works correctly (NULL != NULL in Postgres, breaking ON CONFLICT).
    let update_uuid_normalized = body.update_uuid.clone().unwrap_or_default();

    for event in &body.events {
        sqlx::query(
            "INSERT INTO health_events_hourly \
             (project_id, bucket_hour, channel_name, platform, runtime_version, \
              update_uuid, event_type, event_name, total_count, unique_devices) \
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 1) \
             ON CONFLICT (project_id, bucket_hour, channel_name, platform, \
                          runtime_version, update_uuid, event_type, event_name) \
             DO UPDATE SET total_count = health_events_hourly.total_count + EXCLUDED.total_count, \
               unique_devices = health_events_hourly.unique_devices + 1",
        )
        .bind(project_id)
        .bind(bucket_hour)
        .bind(&body.channel)
        .bind(&body.platform)
        .bind(&body.runtime_version)
        .bind(&update_uuid_normalized)
        .bind(&event.event_type)
        .bind(&event.name)
        .bind(event.count as i64)
        .execute(&state.db)
        .await
        .map_err(|e| { tracing::error!(error = %e, event_type = %event.event_type, "Step 3: hourly upsert failed"); AppError::Internal(e.to_string()) })?;
    }

    // 4. Lightweight anomaly detection
    let error_count = sqlx::query_scalar::<_, Option<i64>>(
        "SELECT SUM(total_count)::BIGINT FROM health_events_hourly \
         WHERE project_id = $1 AND event_type IN ('js_error', 'crash') \
         AND bucket_hour = $2 AND channel_name IS NOT DISTINCT FROM $3",
    )
    .bind(project_id)
    .bind(bucket_hour)
    .bind(&body.channel)
    .fetch_one(&state.db)
    .await?;

    if let Some(current) = error_count {
        if current > 5 {
            // Only check anomaly if we have a meaningful sample
            let avg_24h = sqlx::query_scalar::<_, Option<f64>>(
                "SELECT AVG(total_count)::DOUBLE PRECISION FROM health_events_hourly \
                 WHERE project_id = $1 AND event_type IN ('js_error', 'crash') \
                 AND bucket_hour >= $2 AND bucket_hour < $3 \
                 AND channel_name IS NOT DISTINCT FROM $4",
            )
            .bind(project_id)
            .bind(bucket_hour - chrono::Duration::hours(24))
            .bind(bucket_hour)
            .bind(&body.channel)
            .fetch_one(&state.db)
            .await?;

            if let Some(avg) = avg_24h {
                if avg > 0.0 && (current as f64) > avg * 2.0 {
                    try_insert_anomaly(
                        &state.db,
                        project_id,
                        &body,
                        current,
                        avg,
                        bucket_hour,
                    )
                    .await
                    .ok(); // Best-effort, don't fail the request
                }
            }
        }
    }

    // 5. Upsert daily stats for telemetry timeseries
    let today = now.date_naive();
    let total_events: i64 = body.events.iter().map(|e| e.count as i64).sum();
    let error_events: i64 = body
        .events
        .iter()
        .filter(|e| e.event_type == "js_error" || e.event_type == "crash")
        .map(|e| e.count as i64)
        .sum();
    let launch_events: i64 = body
        .events
        .iter()
        .filter(|e| e.event_type == "app_launch")
        .map(|e| e.count as i64)
        .sum();

    if total_events > 0 {
        sqlx::query(
            "INSERT INTO telemetry_daily_stats \
             (project_id, date, channel_name, total_errors, total_launches, \
              error_rate, crash_free, flag_evals, update_installs) \
             VALUES ($1, $2, $3, $4, $5, \
              CASE WHEN $5 > 0 THEN ($4::float / $5::float) * 100 ELSE 0 END, \
              CASE WHEN $5 > 0 THEN 100 - ($4::float / $5::float) * 100 ELSE 100 END, \
              0, $6) \
             ON CONFLICT (project_id, date, channel_name) \
             DO UPDATE SET \
               total_errors = telemetry_daily_stats.total_errors + EXCLUDED.total_errors, \
               total_launches = telemetry_daily_stats.total_launches + EXCLUDED.total_launches, \
               error_rate = CASE WHEN (telemetry_daily_stats.total_launches + EXCLUDED.total_launches) > 0 \
                 THEN ((telemetry_daily_stats.total_errors + EXCLUDED.total_errors)::float / \
                       (telemetry_daily_stats.total_launches + EXCLUDED.total_launches)::float) * 100 \
                 ELSE 0 END, \
               crash_free = CASE WHEN (telemetry_daily_stats.total_launches + EXCLUDED.total_launches) > 0 \
                 THEN 100 - ((telemetry_daily_stats.total_errors + EXCLUDED.total_errors)::float / \
                             (telemetry_daily_stats.total_launches + EXCLUDED.total_launches)::float) * 100 \
                 ELSE 100 END, \
               update_installs = telemetry_daily_stats.update_installs + EXCLUDED.update_installs",
        )
        .bind(project_id)
        .bind(today)
        .bind(&body.channel)
        .bind(error_events)
        .bind(launch_events)
        .bind(launch_events)
        .execute(&state.db)
        .await?;
    }

    // 6. Upsert flag_health_snapshots from flag_states (connects to flag health UI)
    if let Err(e) = upsert_flag_health_snapshots(
        &state.db,
        project_id,
        &body,
    )
    .await
    {
        tracing::error!(error = %e, "Step 6: flag health snapshot upsert failed");
    }

    Ok(StatusCode::NO_CONTENT)
}

/// Upsert flag_health_snapshots using a 24h rolling window from health_events_raw.
/// Computes per-variation error rates: for each distinct variation value seen in the
/// window, counts errors vs total events where that variation was active.
async fn upsert_flag_health_snapshots(
    db: &sqlx::PgPool,
    project_id: i64,
    body: &HealthMetricsRequest,
) -> Result<(), AppError> {
    let channel = body.channel.as_deref().unwrap_or("default");
    let now = chrono::Utc::now();
    let window_start = now - chrono::Duration::hours(24);

    // Get all enabled flags for this project
    let flags = sqlx::query_as::<_, (i64, String)>(
        "SELECT id, key FROM feature_flags WHERE project_id = $1 AND enabled = true",
    )
    .bind(project_id)
    .fetch_all(db)
    .await?;

    if flags.is_empty() {
        return Ok(());
    }

    for (flag_id, flag_key) in &flags {
        // Get distinct variation values seen for this flag in the 24h window
        let variation_values = sqlx::query_as::<_, (serde_json::Value,)>(
            "SELECT DISTINCT flag_states -> $2 AS val FROM health_events_raw \
             WHERE project_id = $1 AND received_at >= $3 \
             AND channel_name IS NOT DISTINCT FROM $4 \
             AND flag_states ? $2",
        )
        .bind(project_id)
        .bind(flag_key)
        .bind(window_start)
        .bind(&body.channel)
        .fetch_all(db)
        .await?;

        if variation_values.is_empty() {
            continue;
        }

        for (var_value,) in &variation_values {
            let var_str = var_value.to_string().trim_matches('"').to_string();

            // App launches where this flag had this specific variation (denominator).
            // The SDK sends flag_states on app_launch events so we get per-variation counts.
            let launches_for_variation = sqlx::query_scalar::<_, Option<i64>>(
                "SELECT SUM(count)::BIGINT FROM health_events_raw \
                 WHERE project_id = $1 AND received_at >= $2 \
                 AND event_type = 'app_launch' \
                 AND channel_name IS NOT DISTINCT FROM $3 \
                 AND flag_states ->> $4 = $5",
            )
            .bind(project_id)
            .bind(window_start)
            .bind(&body.channel)
            .bind(flag_key)
            .bind(&var_str)
            .fetch_one(db)
            .await?
            .unwrap_or(0);

            if launches_for_variation == 0 {
                continue;
            }

            // JS error events for this variation (numerator for error_rate)
            let js_errors_for_variation = sqlx::query_scalar::<_, Option<i64>>(
                "SELECT SUM(count)::BIGINT FROM health_events_raw \
                 WHERE project_id = $1 AND received_at >= $2 \
                 AND event_type = 'js_error' \
                 AND channel_name IS NOT DISTINCT FROM $3 \
                 AND flag_states ->> $4 = $5",
            )
            .bind(project_id)
            .bind(window_start)
            .bind(&body.channel)
            .bind(flag_key)
            .bind(&var_str)
            .fetch_one(db)
            .await?
            .unwrap_or(0);

            // Crash events for this variation (numerator for crash_free)
            let crashes_for_variation = sqlx::query_scalar::<_, Option<i64>>(
                "SELECT SUM(count)::BIGINT FROM health_events_raw \
                 WHERE project_id = $1 AND received_at >= $2 \
                 AND event_type = 'crash' \
                 AND channel_name IS NOT DISTINCT FROM $3 \
                 AND flag_states ->> $4 = $5",
            )
            .bind(project_id)
            .bind(window_start)
            .bind(&body.channel)
            .bind(flag_key)
            .bind(&var_str)
            .fetch_one(db)
            .await?
            .unwrap_or(0);

            // error_rate = % of launches that had at least one error, capped at 100
            let error_rate_raw = (js_errors_for_variation + crashes_for_variation) as f64 / launches_for_variation as f64 * 100.0;
            let error_rate = (error_rate_raw.min(100.0) * 100.0).round() / 100.0;
            // crash_free = % of launches with no crashes
            let crash_rate_raw = crashes_for_variation as f64 / launches_for_variation as f64 * 100.0;
            let crash_free = ((100.0 - crash_rate_raw).max(0.0).min(100.0) * 100.0).round() / 100.0;

            // Unique devices for this variation
            let devices = sqlx::query_scalar::<_, Option<i64>>(
                "SELECT COUNT(DISTINCT device_id) FROM health_events_raw \
                 WHERE project_id = $1 AND received_at >= $2 \
                 AND channel_name IS NOT DISTINCT FROM $3 \
                 AND flag_states ->> $4 = $5",
            )
            .bind(project_id)
            .bind(window_start)
            .bind(&body.channel)
            .bind(flag_key)
            .bind(&var_str)
            .fetch_one(db)
            .await?
            .unwrap_or(0);

            // Resolve variation_id
            let variation_id = sqlx::query_scalar::<_, i64>(
                "SELECT id FROM flag_variations WHERE flag_id = $1 AND value = $2::jsonb",
            )
            .bind(flag_id)
            .bind(var_value)
            .fetch_optional(db)
            .await?;

            // Get previous error rate for delta (per variation)
            let prev_error_rate = sqlx::query_scalar::<_, Option<f64>>(
                "SELECT error_rate FROM flag_health_snapshots \
                 WHERE flag_id = $1 AND channel_name = $2 \
                 AND variation_id IS NOT DISTINCT FROM $3 \
                 ORDER BY recorded_at DESC LIMIT 1",
            )
            .bind(flag_id)
            .bind(channel)
            .bind(variation_id)
            .fetch_one(db)
            .await
            .unwrap_or(None);

            // Both error_rate and prev are already percentages (e.g., 5.0 = 5%)
            // Delta is the raw difference in percentage points, rounded to 2 decimal places
            let error_rate_delta = prev_error_rate.map(|prev| ((error_rate - prev) * 100.0).round() / 100.0).unwrap_or(0.0);

            let status = if error_rate > 10.0 {
                "incident"
            } else if error_rate > 2.0 {
                "degraded"
            } else {
                "healthy"
            };

            sqlx::query(
                "INSERT INTO flag_health_snapshots \
                 (flag_id, variation_id, channel_name, runtime_version, devices, \
                  error_rate, error_rate_delta, crash_free, status) \
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)",
            )
            .bind(flag_id)
            .bind(variation_id)
            .bind(channel)
            .bind(&body.runtime_version)
            .bind(devices as i32)
            .bind(error_rate)
            .bind(error_rate_delta)
            .bind(crash_free)
            .bind(status)
            .execute(db)
            .await?;
        }
    }

    Ok(())
}

/// Best-effort anomaly insertion into telemetry_events
async fn try_insert_anomaly(
    db: &sqlx::PgPool,
    project_id: i64,
    body: &HealthMetricsRequest,
    current_count: i64,
    avg_count: f64,
    bucket_hour: chrono::DateTime<chrono::Utc>,
) -> Result<(), AppError> {
    // Deduplicate: don't insert if we already have an anomaly for this hour+channel
    let existing = sqlx::query_scalar::<_, bool>(
        "SELECT EXISTS(SELECT 1 FROM telemetry_events \
         WHERE project_id = $1 AND event_type = 'error_spike' \
         AND created_at >= $2 AND created_at < $3)",
    )
    .bind(project_id)
    .bind(bucket_hour)
    .bind(bucket_hour + chrono::Duration::hours(1))
    .fetch_one(db)
    .await?;

    if existing {
        return Ok(());
    }

    // Try to find the most common flag key in recent error events
    let correlated_flag = sqlx::query_as::<_, (String, String)>(
        "SELECT key, value::TEXT FROM health_events_raw, \
         jsonb_each(flag_states) \
         WHERE project_id = $1 AND event_type IN ('js_error', 'crash') \
         AND received_at >= $2 AND flag_states IS NOT NULL \
         GROUP BY key, value ORDER BY COUNT(*) DESC LIMIT 1",
    )
    .bind(project_id)
    .bind(bucket_hour)
    .fetch_optional(db)
    .await?;

    let (linked_flag_id, linked_variation) = if let Some((flag_key, variation)) = correlated_flag {
        let flag_id = sqlx::query_scalar::<_, i64>(
            "SELECT id FROM feature_flags WHERE project_id = $1 AND key = $2",
        )
        .bind(project_id)
        .bind(&flag_key)
        .fetch_optional(db)
        .await?;
        (flag_id, Some(variation))
    } else {
        (None, None)
    };

    let ratio = (current_count as f64 / avg_count) as i32;
    let severity = if current_count as f64 > avg_count * 5.0 {
        "critical"
    } else {
        "warning"
    };
    let status = if current_count as f64 > avg_count * 5.0 {
        "incident"
    } else {
        "degraded"
    };
    let channel_label = body.channel.as_deref().unwrap_or("default");

    sqlx::query(
        "INSERT INTO telemetry_events \
         (project_id, event_type, severity, status, title, description, \
          linked_flag_id, linked_flag_variation, affected_devices) \
         VALUES ($1, 'error_spike', $2, $3, $4, $5, $6, $7, $8)",
    )
    .bind(project_id)
    .bind(severity)
    .bind(status)
    .bind(format!("Error spike on {channel_label} channel"))
    .bind(format!(
        "Error rate is {ratio}x above 24h average ({current_count} errors this hour vs avg {:.0})",
        avg_count
    ))
    .bind(linked_flag_id)
    .bind(&linked_variation)
    .bind(1i32)
    .execute(db)
    .await?;

    Ok(())
}

use chrono::Timelike;
