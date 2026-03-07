use axum::extract::{Path, Query, State};
use axum::response::IntoResponse;
use axum::Json;
use serde::{Deserialize, Serialize};

use crate::auth::RequireAuth;
use crate::errors::AppError;
use crate::routes::AppState;

#[derive(Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct UpdateInsights {
    pub update_id: i64,
    pub total_downloads: i64,
    pub unique_devices: i64,
}

pub async fn handle_get_update_insights(
    State(state): State<AppState>,
    auth: RequireAuth,
    Path(update_id): Path<i64>,
) -> Result<impl IntoResponse, AppError> {
    let project_id = auth.require_project()?;
    let row = sqlx::query_as::<_, UpdateInsights>(
        "SELECT $1::bigint AS update_id,
                COUNT(*) AS total_downloads,
                COUNT(DISTINCT ua.device_id) AS unique_devices
         FROM update_analytics ua
         JOIN updates u ON u.id = ua.update_id
         WHERE ua.update_id = $1 AND u.project_id = $2",
    )
    .bind(update_id)
    .bind(project_id)
    .fetch_one(&state.db)
    .await?;

    Ok(Json(row))
}

#[derive(Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct InsightsSummaryRow {
    pub update_id: i64,
    pub total_downloads: i64,
    pub unique_devices: i64,
}

pub async fn handle_list_insights(
    State(state): State<AppState>,
    auth: RequireAuth,
) -> Result<impl IntoResponse, AppError> {
    let project_id = auth.require_project()?;
    let rows = sqlx::query_as::<_, InsightsSummaryRow>(
        "SELECT ua.update_id,
                COUNT(*) AS total_downloads,
                COUNT(DISTINCT ua.device_id) AS unique_devices
         FROM update_analytics ua
         JOIN updates u ON u.id = ua.update_id
         WHERE u.project_id = $1
         GROUP BY ua.update_id
         ORDER BY total_downloads DESC
         LIMIT 100",
    )
    .bind(project_id)
    .fetch_all(&state.db)
    .await?;

    Ok(Json(rows))
}

// -- Adoption time-series --

#[derive(Deserialize)]
pub struct AdoptionQuery {
    /// Number of days to look back (default 30)
    pub days: Option<i32>,
    /// Optional update_id to filter to a single update
    pub update_id: Option<i64>,
    /// Bucket size: "hour" or "day" (default "day")
    pub bucket: Option<String>,
}

#[derive(Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct AdoptionBucket {
    pub bucket_time: chrono::DateTime<chrono::Utc>,
    pub update_id: i64,
    pub downloads: i64,
    pub unique_devices: i64,
}

#[derive(Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct DeviceCurrentUpdate {
    pub update_id: i64,
    pub update_uuid: String,
    pub runtime_version: String,
    pub channel: String,
    pub branch_name: Option<String>,
    pub device_count: i64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AdoptionResponse {
    pub timeseries: Vec<AdoptionBucket>,
    pub current_adoption: Vec<DeviceCurrentUpdate>,
}

pub async fn handle_adoption_timeseries(
    State(state): State<AppState>,
    auth: RequireAuth,
    Query(query): Query<AdoptionQuery>,
) -> Result<impl IntoResponse, AppError> {
    let project_id = auth.require_project()?;
    let days = query.days.unwrap_or(30).min(90).max(1);
    let bucket = query.bucket.as_deref().unwrap_or("day");
    let interval = match bucket {
        "hour" => "1 hour",
        _ => "1 day",
    };

    let timeseries = if let Some(uid) = query.update_id {
        sqlx::query_as::<_, AdoptionBucket>(&format!(
            "SELECT date_trunc('{interval}', ua.created_at) AS bucket_time,
                    ua.update_id,
                    COUNT(*) AS downloads,
                    COUNT(DISTINCT ua.device_id) AS unique_devices
             FROM update_analytics ua
             JOIN updates u ON u.id = ua.update_id
             WHERE ua.update_id = $1
               AND u.project_id = $2
               AND ua.created_at >= NOW() - INTERVAL '{days} days'
             GROUP BY bucket_time, ua.update_id
             ORDER BY bucket_time ASC"
        ))
        .bind(uid)
        .bind(project_id)
        .fetch_all(&state.db)
        .await?
    } else {
        sqlx::query_as::<_, AdoptionBucket>(&format!(
            "SELECT date_trunc('{interval}', ua.created_at) AS bucket_time,
                    ua.update_id,
                    COUNT(*) AS downloads,
                    COUNT(DISTINCT ua.device_id) AS unique_devices
             FROM update_analytics ua
             JOIN updates u ON u.id = ua.update_id
             WHERE u.project_id = $1
               AND ua.created_at >= NOW() - INTERVAL '{days} days'
             GROUP BY bucket_time, ua.update_id
             ORDER BY bucket_time ASC"
        ))
        .bind(project_id)
        .fetch_all(&state.db)
        .await?
    };

    // Current adoption: which update each device last downloaded (= currently running)
    let current_adoption = sqlx::query_as::<_, DeviceCurrentUpdate>(
        "WITH latest_per_device AS (
            SELECT DISTINCT ON (ua.device_id) ua.device_id, ua.update_id
            FROM update_analytics ua
            JOIN updates u ON u.id = ua.update_id
            WHERE ua.device_id IS NOT NULL
              AND u.project_id = $1
            ORDER BY ua.device_id, ua.created_at DESC
        )
        SELECT l.update_id,
               u.update_uuid,
               u.runtime_version,
               u.channel,
               u.branch_name,
               COUNT(*) AS device_count
        FROM latest_per_device l
        JOIN updates u ON u.id = l.update_id
        GROUP BY l.update_id, u.update_uuid, u.runtime_version, u.channel, u.branch_name
        ORDER BY device_count DESC
        LIMIT 50",
    )
    .bind(project_id)
    .fetch_all(&state.db)
    .await?;

    Ok(Json(AdoptionResponse {
        timeseries,
        current_adoption,
    }))
}
