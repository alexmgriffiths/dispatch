use axum::extract::{Query, State};
use axum::response::IntoResponse;
use axum::Json;
use serde::Deserialize;
use std::collections::BTreeMap;

use crate::auth::RequireAuth;
use crate::errors::AppError;
use crate::routes::AppState;

// ── Shared: lastUpdatedAt helper ────────────────────────────────────────

/// Query the most recent aggregation_runs.completed_at timestamp.
async fn get_last_updated_at(
    db: &sqlx::PgPool,
) -> Result<Option<chrono::DateTime<chrono::Utc>>, sqlx::Error> {
    sqlx::query_scalar::<_, Option<chrono::DateTime<chrono::Utc>>>(
        "SELECT completed_at FROM aggregation_runs ORDER BY completed_at DESC LIMIT 1",
    )
    .fetch_optional(db)
    .await
    .map(|opt| opt.flatten())
}

// ── Telemetry timeseries ─────────────────────────────────────────────────

#[derive(Deserialize)]
pub struct TelemetryQuery {
    #[serde(default = "default_days")]
    pub days: i32,
    pub channel: Option<String>,
    pub flag_key: Option<String>,
}

fn default_days() -> i32 {
    14
}

#[derive(serde::Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct TelemetryDailyPoint {
    pub date: chrono::NaiveDate,
    pub error_rate: f64,
    pub crash_free: f64,
    pub flag_evals: i64,
    pub updates: i64,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TelemetryTimeseriesResponse {
    pub data: Vec<TelemetryDailyPoint>,
    pub last_updated_at: Option<chrono::DateTime<chrono::Utc>>,
}

pub async fn handle_telemetry_timeseries(
    State(state): State<AppState>,
    auth: RequireAuth,
    Query(params): Query<TelemetryQuery>,
) -> Result<impl IntoResponse, AppError> {
    let project_id = auth.require_project()?;
    let days = params.days.min(90).max(1);
    let since = chrono::Utc::now().date_naive() - chrono::Duration::days(days as i64);

    let rows = if let Some(ref channel) = params.channel {
        sqlx::query_as::<_, TelemetryDailyPoint>(
            "SELECT date, error_rate, crash_free, flag_evals, \
             update_installs AS updates \
             FROM telemetry_daily_stats \
             WHERE project_id = $1 AND date >= $2 AND channel_name = $3 \
             ORDER BY date",
        )
        .bind(project_id)
        .bind(since)
        .bind(channel)
        .fetch_all(&state.db)
        .await?
    } else {
        sqlx::query_as::<_, TelemetryDailyPoint>(
            "SELECT date, \
             AVG(error_rate)::DOUBLE PRECISION AS error_rate, \
             AVG(crash_free)::DOUBLE PRECISION AS crash_free, \
             SUM(flag_evals)::BIGINT AS flag_evals, \
             SUM(update_installs)::BIGINT AS updates \
             FROM telemetry_daily_stats \
             WHERE project_id = $1 AND date >= $2 \
             GROUP BY date ORDER BY date",
        )
        .bind(project_id)
        .bind(since)
        .fetch_all(&state.db)
        .await?
    };

    let last_updated_at = get_last_updated_at(&state.db).await?;

    Ok(Json(TelemetryTimeseriesResponse {
        data: rows,
        last_updated_at,
    }))
}

// ── Flag impact metrics ──────────────────────────────────────────────────

#[derive(serde::Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct FlagImpactRow {
    pub flag_id: i64,
    pub flag_key: String,
    pub flag_name: String,
    pub variation_name: String,
    pub runtime_version: String,
    pub channel: String,
    pub devices: i32,
    pub error_rate: f64,
    pub error_rate_delta: f64,
    pub crash_free: f64,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FlagImpactsResponse {
    pub data: Vec<FlagImpactRow>,
    pub last_updated_at: Option<chrono::DateTime<chrono::Utc>>,
}

pub async fn handle_flag_impacts(
    State(state): State<AppState>,
    auth: RequireAuth,
    Query(params): Query<TelemetryQuery>,
) -> Result<impl IntoResponse, AppError> {
    let project_id = auth.require_project()?;

    let mut query = String::from(
        "SELECT h.flag_id, f.key AS flag_key, f.name AS flag_name, \
         COALESCE(fv.name, 'default') AS variation_name, \
         h.runtime_version, \
         COALESCE(h.channel_name, '') AS channel, \
         h.devices, h.error_rate, h.error_rate_delta, h.crash_free \
         FROM flag_health_snapshots h \
         JOIN feature_flags f ON f.id = h.flag_id AND f.project_id = $1 \
         LEFT JOIN flag_variations fv ON fv.id = h.variation_id \
         WHERE h.id IN ( \
           SELECT DISTINCT ON (flag_id, variation_id, channel_name) id \
           FROM flag_health_snapshots \
           ORDER BY flag_id, variation_id, channel_name, recorded_at DESC \
         )",
    );

    let mut arg_idx = 2;
    if params.channel.is_some() {
        query.push_str(&format!(" AND h.channel_name = ${arg_idx}"));
        arg_idx += 1;
    }
    if params.flag_key.is_some() {
        query.push_str(&format!(" AND f.key = ${arg_idx}"));
    }
    query.push_str(" ORDER BY h.error_rate DESC");

    let mut q = sqlx::query_as::<_, FlagImpactRow>(&query).bind(project_id);
    if let Some(ref channel) = params.channel {
        q = q.bind(channel);
    }
    if let Some(ref flag_key) = params.flag_key {
        q = q.bind(flag_key);
    }

    let rows = q.fetch_all(&state.db).await?;
    let last_updated_at = get_last_updated_at(&state.db).await?;

    Ok(Json(FlagImpactsResponse {
        data: rows,
        last_updated_at,
    }))
}

// ── Correlated events ────────────────────────────────────────────────────

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TelemetryEventResponse {
    pub id: i64,
    pub timestamp: chrono::DateTime<chrono::Utc>,
    #[serde(rename = "type")]
    pub event_type: String,
    pub severity: String,
    pub title: String,
    pub description: String,
    pub linked_flag: Option<LinkedFlag>,
    pub linked_update: Option<LinkedUpdate>,
    pub affected_devices: i32,
    pub status: String,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LinkedFlag {
    pub id: i64,
    pub key: String,
    pub variation: String,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LinkedUpdate {
    pub id: i64,
    pub runtime_version: String,
}

#[derive(sqlx::FromRow)]
struct TelemetryEventRow {
    id: i64,
    created_at: chrono::DateTime<chrono::Utc>,
    event_type: String,
    severity: String,
    status: String,
    title: String,
    description: String,
    linked_flag_id: Option<i64>,
    linked_flag_variation: Option<String>,
    flag_key: Option<String>,
    linked_update_id: Option<i64>,
    runtime_version: Option<String>,
    affected_devices: i32,
}

pub async fn handle_telemetry_events(
    State(state): State<AppState>,
    auth: RequireAuth,
    Query(params): Query<TelemetryQuery>,
) -> Result<impl IntoResponse, AppError> {
    let project_id = auth.require_project()?;
    let days = params.days.min(90).max(1);
    let since = chrono::Utc::now() - chrono::Duration::days(days as i64);

    let rows = sqlx::query_as::<_, TelemetryEventRow>(
        "SELECT te.id, te.created_at, te.event_type, te.severity, te.status, \
         te.title, te.description, \
         te.linked_flag_id, te.linked_flag_variation, f.key AS flag_key, \
         te.linked_update_id, u.runtime_version, \
         te.affected_devices \
         FROM telemetry_events te \
         LEFT JOIN feature_flags f ON f.id = te.linked_flag_id \
         LEFT JOIN updates u ON u.id = te.linked_update_id \
         WHERE te.project_id = $1 AND te.created_at >= $2 \
         ORDER BY te.created_at DESC",
    )
    .bind(project_id)
    .bind(since)
    .fetch_all(&state.db)
    .await?;

    let events: Vec<TelemetryEventResponse> = rows
        .into_iter()
        .map(|r| TelemetryEventResponse {
            id: r.id,
            timestamp: r.created_at,
            event_type: r.event_type,
            severity: r.severity,
            title: r.title,
            description: r.description,
            linked_flag: r.linked_flag_id.map(|id| LinkedFlag {
                id,
                key: r.flag_key.unwrap_or_default(),
                variation: r.linked_flag_variation.unwrap_or_default(),
            }),
            linked_update: r.linked_update_id.map(|id| LinkedUpdate {
                id,
                runtime_version: r.runtime_version.unwrap_or_default(),
            }),
            affected_devices: r.affected_devices,
            status: r.status,
        })
        .collect();

    Ok(Json(events))
}

// ── Performance metrics ─────────────────────────────────────────────────

#[derive(Deserialize)]
pub struct PerformanceQuery {
    pub channel: Option<String>,
    pub platform: Option<String>,
    pub runtime_version: Option<String>,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PerformanceResponse {
    pub metrics: Vec<PerformanceMetricSeries>,
    pub last_updated_at: Option<chrono::DateTime<chrono::Utc>>,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PerformanceMetricSeries {
    pub metric_name: String,
    pub points: Vec<PerformancePoint>,
    pub latest: PerformanceLatest,
}

#[derive(serde::Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct PerformancePoint {
    pub bucket_hour: chrono::DateTime<chrono::Utc>,
    pub p50: f64,
    pub p95: f64,
    pub p99: f64,
    pub sample_count: i32,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PerformanceLatest {
    pub p50: f64,
    pub p95: f64,
    pub p99: f64,
    pub sample_count: i32,
}

#[derive(sqlx::FromRow)]
struct PerfAggregateRow {
    bucket_hour: chrono::DateTime<chrono::Utc>,
    metric_name: String,
    sample_count: i32,
    p50: f64,
    p95: f64,
    p99: f64,
}

pub async fn handle_get_performance_metrics(
    State(state): State<AppState>,
    auth: RequireAuth,
    Query(params): Query<PerformanceQuery>,
) -> Result<impl IntoResponse, AppError> {
    let project_id = auth.require_project()?;
    let since = chrono::Utc::now() - chrono::Duration::hours(24);

    // Build dynamic query with optional filters
    let mut sql = String::from(
        "SELECT bucket_hour, metric_name, sample_count, p50, p95, p99 \
         FROM perf_hourly_aggregates \
         WHERE project_id = $1 AND bucket_hour >= $2",
    );
    let mut arg_idx = 3;

    if params.channel.is_some() {
        sql.push_str(&format!(" AND channel_name = ${arg_idx}"));
        arg_idx += 1;
    }
    if params.platform.is_some() {
        sql.push_str(&format!(" AND platform = ${arg_idx}"));
        arg_idx += 1;
    }
    if params.runtime_version.is_some() {
        sql.push_str(&format!(" AND runtime_version = ${arg_idx}"));
    }

    sql.push_str(" ORDER BY bucket_hour DESC");

    let mut q = sqlx::query_as::<_, PerfAggregateRow>(&sql)
        .bind(project_id)
        .bind(since);

    if let Some(ref channel) = params.channel {
        q = q.bind(channel);
    }
    if let Some(ref platform) = params.platform {
        q = q.bind(platform);
    }
    if let Some(ref runtime_version) = params.runtime_version {
        q = q.bind(runtime_version);
    }

    let rows = q.fetch_all(&state.db).await?;

    // Group by metric_name, preserving order (BTreeMap for stable ordering)
    let mut grouped: BTreeMap<String, Vec<PerformancePoint>> = BTreeMap::new();
    for row in &rows {
        grouped
            .entry(row.metric_name.clone())
            .or_default()
            .push(PerformancePoint {
                bucket_hour: row.bucket_hour,
                p50: row.p50,
                p95: row.p95,
                p99: row.p99,
                sample_count: row.sample_count,
            });
    }

    let metrics: Vec<PerformanceMetricSeries> = grouped
        .into_iter()
        .map(|(metric_name, points)| {
            // points are in DESC order; latest is first
            let latest = points
                .first()
                .map(|p| PerformanceLatest {
                    p50: p.p50,
                    p95: p.p95,
                    p99: p.p99,
                    sample_count: p.sample_count,
                })
                .unwrap_or(PerformanceLatest {
                    p50: 0.0,
                    p95: 0.0,
                    p99: 0.0,
                    sample_count: 0,
                });

            PerformanceMetricSeries {
                metric_name,
                points,
                latest,
            }
        })
        .collect();

    let last_updated_at = get_last_updated_at(&state.db).await?;

    Ok(Json(PerformanceResponse {
        metrics,
        last_updated_at,
    }))
}
