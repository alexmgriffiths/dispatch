use axum::extract::{Query, State};
use axum::response::IntoResponse;
use axum::Json;
use serde::{Deserialize, Serialize};

use crate::auth::RequireAuth;
use crate::errors::AppError;
use crate::routes::AppState;

#[derive(Deserialize)]
pub struct ObserveQuery {
    /// Filter by event type: js_error, crash, custom, app_launch
    #[serde(rename = "type")]
    pub event_type: Option<String>,
    /// Search within event_message or event_name
    pub search: Option<String>,
    /// Filter by channel
    pub channel: Option<String>,
    /// Filter by platform
    pub platform: Option<String>,
    /// Filter by device_id
    pub device_id: Option<String>,
    /// Filter by update_uuid
    pub update_uuid: Option<String>,
    /// ISO timestamp — only events after this time
    pub from: Option<String>,
    /// ISO timestamp — only events before this time
    pub to: Option<String>,
    /// "message" to group by event_message, "name" to group by event_name
    pub group_by: Option<String>,
    #[serde(default = "default_limit")]
    pub limit: i64,
    #[serde(default)]
    pub offset: i64,
}

fn default_limit() -> i64 {
    50
}

#[derive(Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct ObserveEvent {
    pub id: i64,
    pub update_uuid: Option<String>,
    pub device_id: String,
    pub channel_name: Option<String>,
    pub platform: String,
    pub runtime_version: String,
    pub event_type: String,
    pub event_name: Option<String>,
    pub event_message: Option<String>,
    pub count: i32,
    pub flag_states: Option<serde_json::Value>,
    pub stack_trace: Option<String>,
    pub error_name: Option<String>,
    pub component_stack: Option<String>,
    pub is_fatal: bool,
    pub tags: Option<serde_json::Value>,
    pub received_at: chrono::DateTime<chrono::Utc>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ObserveListResponse {
    pub events: Vec<ObserveEvent>,
    pub total: i64,
}

#[derive(Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct ObserveGroup {
    pub key: String,
    pub total_count: i64,
    pub unique_devices: i64,
    pub first_seen: chrono::DateTime<chrono::Utc>,
    pub last_seen: chrono::DateTime<chrono::Utc>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ObserveGroupResponse {
    pub groups: Vec<ObserveGroup>,
    pub total: i64,
}

/// GET /observe/events — list or group health events
pub async fn handle_list_observe_events(
    State(state): State<AppState>,
    auth: RequireAuth,
    Query(params): Query<ObserveQuery>,
) -> Result<impl IntoResponse, AppError> {
    let project_id = auth.require_project()?;
    let limit = params.limit.min(200);

    // Build WHERE clause dynamically
    let mut conditions = vec!["project_id = $1".to_string()];
    let mut bind_idx = 2u32;

    // Track which optional params to bind
    struct Binds {
        event_type: Option<String>,
        search: Option<String>,
        channel: Option<String>,
        platform: Option<String>,
        device_id: Option<String>,
        update_uuid: Option<String>,
        from: Option<chrono::DateTime<chrono::Utc>>,
        to: Option<chrono::DateTime<chrono::Utc>>,
    }

    let from_ts = params
        .from
        .as_ref()
        .and_then(|s| s.parse::<chrono::DateTime<chrono::Utc>>().ok());
    let to_ts = params
        .to
        .as_ref()
        .and_then(|s| s.parse::<chrono::DateTime<chrono::Utc>>().ok());

    let mut binds = Binds {
        event_type: params.event_type.clone(),
        search: params.search.clone(),
        channel: params.channel.clone(),
        platform: params.platform.clone(),
        device_id: params.device_id.clone(),
        update_uuid: params.update_uuid.clone(),
        from: from_ts,
        to: to_ts,
    };

    if binds.event_type.is_some() {
        conditions.push(format!("event_type = ${bind_idx}"));
        bind_idx += 1;
    }
    if binds.search.is_some() {
        conditions.push(format!(
            "(event_message ILIKE ${bind_idx} OR event_name ILIKE ${bind_idx})"
        ));
        bind_idx += 1;
    }
    if binds.channel.is_some() {
        conditions.push(format!("channel_name = ${bind_idx}"));
        bind_idx += 1;
    }
    if binds.platform.is_some() {
        conditions.push(format!("platform = ${bind_idx}"));
        bind_idx += 1;
    }
    if binds.device_id.is_some() {
        conditions.push(format!("device_id = ${bind_idx}"));
        bind_idx += 1;
    }
    if binds.update_uuid.is_some() {
        conditions.push(format!("update_uuid = ${bind_idx}"));
        bind_idx += 1;
    }
    if binds.from.is_some() {
        conditions.push(format!("received_at >= ${bind_idx}"));
        bind_idx += 1;
    }
    if binds.to.is_some() {
        conditions.push(format!("received_at <= ${bind_idx}"));
        bind_idx += 1;
    }

    let where_clause = conditions.join(" AND ");

    // Grouped mode
    if let Some(ref group_by) = params.group_by {
        let group_col = match group_by.as_str() {
            "message" => "COALESCE(event_message, '')",
            "name" => "COALESCE(event_name, '')",
            _ => "COALESCE(event_message, '')",
        };

        let count_sql = format!(
            "SELECT COUNT(DISTINCT {group_col})::bigint FROM health_events_raw WHERE {where_clause}"
        );
        let sql = format!(
            "SELECT {group_col} AS key, \
             SUM(count)::bigint AS total_count, \
             COUNT(DISTINCT device_id)::bigint AS unique_devices, \
             MIN(received_at) AS first_seen, \
             MAX(received_at) AS last_seen \
             FROM health_events_raw WHERE {where_clause} \
             GROUP BY {group_col} \
             ORDER BY last_seen DESC \
             LIMIT ${bind_idx} OFFSET ${next}",
            bind_idx = bind_idx,
            next = bind_idx + 1,
        );

        macro_rules! bind_params {
            ($query:expr, $binds:expr) => {{
                let mut q = $query.bind(project_id);
                if let Some(ref v) = $binds.event_type { q = q.bind(v); }
                if let Some(ref v) = $binds.search { q = q.bind(format!("%{v}%")); }
                if let Some(ref v) = $binds.channel { q = q.bind(v); }
                if let Some(ref v) = $binds.platform { q = q.bind(v); }
                if let Some(ref v) = $binds.device_id { q = q.bind(v); }
                if let Some(ref v) = $binds.update_uuid { q = q.bind(v); }
                if let Some(v) = $binds.from { q = q.bind(v); }
                if let Some(v) = $binds.to { q = q.bind(v); }
                q
            }};
        }

        let total = {
            let q = bind_params!(sqlx::query_scalar::<_, i64>(&count_sql), binds);
            q.fetch_one(&state.db).await?
        };

        // Rebind for main query (from/to are Copy so this works)
        binds.from = from_ts;
        binds.to = to_ts;
        // Re-clone the strings
        binds.event_type = params.event_type.clone();
        binds.search = params.search.clone();
        binds.channel = params.channel.clone();
        binds.platform = params.platform.clone();
        binds.device_id = params.device_id.clone();
        binds.update_uuid = params.update_uuid.clone();

        let groups = {
            let q = bind_params!(sqlx::query_as::<_, ObserveGroup>(&sql), binds);
            q.bind(limit).bind(params.offset).fetch_all(&state.db).await?
        };

        return Ok(Json(serde_json::json!({
            "groups": groups,
            "total": total,
        })));
    }

    // Individual events mode
    let count_sql = format!(
        "SELECT COUNT(*)::bigint FROM health_events_raw WHERE {where_clause}"
    );
    let sql = format!(
        "SELECT id, update_uuid, device_id, channel_name, platform, runtime_version, \
         event_type, event_name, event_message, count, flag_states, \
         stack_trace, error_name, component_stack, is_fatal, tags, received_at \
         FROM health_events_raw WHERE {where_clause} \
         ORDER BY received_at DESC \
         LIMIT ${bind_idx} OFFSET ${next}",
        bind_idx = bind_idx,
        next = bind_idx + 1,
    );

    macro_rules! bind_params2 {
        ($query:expr, $binds:expr) => {{
            let mut q = $query.bind(project_id);
            if let Some(ref v) = $binds.event_type { q = q.bind(v); }
            if let Some(ref v) = $binds.search { q = q.bind(format!("%{v}%")); }
            if let Some(ref v) = $binds.channel { q = q.bind(v); }
            if let Some(ref v) = $binds.platform { q = q.bind(v); }
            if let Some(ref v) = $binds.device_id { q = q.bind(v); }
            if let Some(ref v) = $binds.update_uuid { q = q.bind(v); }
            if let Some(v) = $binds.from { q = q.bind(v); }
            if let Some(v) = $binds.to { q = q.bind(v); }
            q
        }};
    }

    let total = {
        let q = bind_params2!(sqlx::query_scalar::<_, i64>(&count_sql), binds);
        q.fetch_one(&state.db).await?
    };

    binds.from = from_ts;
    binds.to = to_ts;
    binds.event_type = params.event_type;
    binds.search = params.search;
    binds.channel = params.channel;
    binds.platform = params.platform;
    binds.device_id = params.device_id;
    binds.update_uuid = params.update_uuid;

    let events = {
        let q = bind_params2!(sqlx::query_as::<_, ObserveEvent>(&sql), binds);
        q.bind(limit).bind(params.offset).fetch_all(&state.db).await?
    };

    Ok(Json(serde_json::json!({
        "events": events,
        "total": total,
    })))
}
