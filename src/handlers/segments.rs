use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::Json;
use serde::Deserialize;
use std::collections::HashMap;

use crate::auth::RequireAuth;
use crate::errors::AppError;
use crate::models::{Segment, SegmentCondition};
use crate::routes::AppState;

// ── Response types ──────────────────────────────────────────────────────

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SegmentWithConditions {
    #[serde(flatten)]
    pub segment: Segment,
    pub conditions: Vec<SegmentCondition>,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SegmentDetailResponse {
    #[serde(flatten)]
    pub segment: Segment,
    pub conditions: Vec<SegmentCondition>,
    pub referenced_by: Vec<ReferencingFlag>,
}

#[derive(serde::Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct ReferencingFlag {
    pub flag_id: i64,
    pub flag_key: String,
    pub flag_name: String,
}

// ── Request types ───────────────────────────────────────────────────────

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateSegmentRequest {
    pub name: String,
    pub key: String,
    pub description: Option<String>,
    pub match_type: Option<String>,
    pub conditions: Option<Vec<ConditionInput>>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateSegmentRequest {
    pub name: Option<String>,
    pub description: Option<String>,
    pub match_type: Option<String>,
    pub conditions: Option<Vec<ConditionInput>>,
}

#[derive(Deserialize)]
pub struct ConditionInput {
    pub attribute: String,
    pub operator: String,
    pub values: Vec<serde_json::Value>,
}

// ── Helpers ─────────────────────────────────────────────────────────────

fn is_valid_key(key: &str) -> bool {
    !key.is_empty()
        && key
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
}

async fn insert_conditions(
    db: &sqlx::PgPool,
    segment_id: i64,
    conditions: &[ConditionInput],
) -> Result<Vec<SegmentCondition>, AppError> {
    let mut result = Vec::new();
    for (i, cond) in conditions.iter().enumerate() {
        let row = sqlx::query_as::<_, SegmentCondition>(
            "INSERT INTO segment_conditions (segment_id, attribute, operator, values_json, sort_order) \
             VALUES ($1, $2, $3, $4, $5) RETURNING *",
        )
        .bind(segment_id)
        .bind(&cond.attribute)
        .bind(&cond.operator)
        .bind(serde_json::json!(cond.values))
        .bind(i as i32)
        .fetch_one(db)
        .await?;
        result.push(row);
    }
    Ok(result)
}

// ── List segments ───────────────────────────────────────────────────────

pub async fn handle_list_segments(
    State(state): State<AppState>,
    auth: RequireAuth,
) -> Result<impl IntoResponse, AppError> {
    let project_id = auth.require_project()?;

    let segments = sqlx::query_as::<_, Segment>(
        "SELECT * FROM segments WHERE project_id = $1 ORDER BY created_at DESC",
    )
    .bind(project_id)
    .fetch_all(&state.db)
    .await?;

    if segments.is_empty() {
        return Ok(Json(Vec::<SegmentWithConditions>::new()));
    }

    let segment_ids: Vec<i64> = segments.iter().map(|s| s.id).collect();

    let conditions = sqlx::query_as::<_, SegmentCondition>(
        "SELECT * FROM segment_conditions WHERE segment_id = ANY($1) ORDER BY sort_order",
    )
    .bind(&segment_ids)
    .fetch_all(&state.db)
    .await?;

    let mut cond_map: HashMap<i64, Vec<SegmentCondition>> = HashMap::new();
    for cond in conditions {
        cond_map.entry(cond.segment_id).or_default().push(cond);
    }

    let result: Vec<SegmentWithConditions> = segments
        .into_iter()
        .map(|seg| {
            let conditions = cond_map.remove(&seg.id).unwrap_or_default();
            SegmentWithConditions { segment: seg, conditions }
        })
        .collect();

    Ok(Json(result))
}

// ── Get segment ─────────────────────────────────────────────────────────

pub async fn handle_get_segment(
    State(state): State<AppState>,
    auth: RequireAuth,
    Path(id): Path<i64>,
) -> Result<impl IntoResponse, AppError> {
    let project_id = auth.require_project()?;

    let segment = sqlx::query_as::<_, Segment>(
        "SELECT * FROM segments WHERE id = $1 AND project_id = $2",
    )
    .bind(id)
    .bind(project_id)
    .fetch_optional(&state.db)
    .await?
    .ok_or_else(|| AppError::NotFound("Segment not found".into()))?;

    let conditions = sqlx::query_as::<_, SegmentCondition>(
        "SELECT * FROM segment_conditions WHERE segment_id = $1 ORDER BY sort_order",
    )
    .bind(segment.id)
    .fetch_all(&state.db)
    .await?;

    let referenced_by = sqlx::query_as::<_, ReferencingFlag>(
        "SELECT f.id as flag_id, f.key as flag_key, f.name as flag_name \
         FROM flag_targeting_rules r \
         JOIN feature_flags f ON f.id = r.flag_id \
         WHERE r.rule_type = 'segment' AND r.rule_config->>'segmentKey' = $1 \
         AND f.project_id = $2",
    )
    .bind(&segment.key)
    .bind(project_id)
    .fetch_all(&state.db)
    .await?;

    Ok(Json(SegmentDetailResponse {
        segment,
        conditions,
        referenced_by,
    }))
}

// ── Create segment ──────────────────────────────────────────────────────

pub async fn handle_create_segment(
    State(state): State<AppState>,
    auth: RequireAuth,
    Json(body): Json<CreateSegmentRequest>,
) -> Result<impl IntoResponse, AppError> {
    auth.require_editor()?;
    let project_id = auth.require_project()?;

    let key = body.key.trim();
    if !is_valid_key(key) {
        return Err(AppError::BadRequest(
            "Key must contain only alphanumeric characters, hyphens, and underscores".into(),
        ));
    }

    let name = body.name.trim();
    if name.is_empty() {
        return Err(AppError::BadRequest("Name is required".into()));
    }

    let match_type = body.match_type.as_deref().unwrap_or("all");
    if match_type != "all" && match_type != "any" {
        return Err(AppError::BadRequest(
            "matchType must be 'all' or 'any'".into(),
        ));
    }

    let description = body.description.as_deref().unwrap_or("");

    let segment = sqlx::query_as::<_, Segment>(
        "INSERT INTO segments (project_id, key, name, description, match_type) \
         VALUES ($1, $2, $3, $4, $5) RETURNING *",
    )
    .bind(project_id)
    .bind(key)
    .bind(name)
    .bind(description)
    .bind(match_type)
    .fetch_one(&state.db)
    .await
    .map_err(|e| match e {
        sqlx::Error::Database(ref db_err) if db_err.is_unique_violation() => {
            AppError::BadRequest(format!("A segment with key '{}' already exists", key))
        }
        _ => AppError::Internal(e.to_string()),
    })?;

    let conditions = if let Some(ref conds) = body.conditions {
        insert_conditions(&state.db, segment.id, conds).await?
    } else {
        vec![]
    };

    Ok((
        StatusCode::CREATED,
        Json(SegmentWithConditions { segment, conditions }),
    ))
}

// ── Update segment ──────────────────────────────────────────────────────

pub async fn handle_update_segment(
    State(state): State<AppState>,
    auth: RequireAuth,
    Path(id): Path<i64>,
    Json(body): Json<UpdateSegmentRequest>,
) -> Result<impl IntoResponse, AppError> {
    auth.require_editor()?;
    let project_id = auth.require_project()?;

    let existing = sqlx::query_as::<_, Segment>(
        "SELECT * FROM segments WHERE id = $1 AND project_id = $2",
    )
    .bind(id)
    .bind(project_id)
    .fetch_optional(&state.db)
    .await?
    .ok_or_else(|| AppError::NotFound("Segment not found".into()))?;

    let name = body.name.as_deref().unwrap_or(&existing.name);
    let description = body.description.as_deref().unwrap_or(&existing.description);
    let match_type = body.match_type.as_deref().unwrap_or(&existing.match_type);

    if match_type != "all" && match_type != "any" {
        return Err(AppError::BadRequest(
            "matchType must be 'all' or 'any'".into(),
        ));
    }

    let segment = sqlx::query_as::<_, Segment>(
        "UPDATE segments SET name = $1, description = $2, match_type = $3, updated_at = NOW() \
         WHERE id = $4 AND project_id = $5 RETURNING *",
    )
    .bind(name)
    .bind(description)
    .bind(match_type)
    .bind(id)
    .bind(project_id)
    .fetch_one(&state.db)
    .await?;

    let conditions = if let Some(ref conds) = body.conditions {
        sqlx::query("DELETE FROM segment_conditions WHERE segment_id = $1")
            .bind(segment.id)
            .execute(&state.db)
            .await?;
        insert_conditions(&state.db, segment.id, conds).await?
    } else {
        sqlx::query_as::<_, SegmentCondition>(
            "SELECT * FROM segment_conditions WHERE segment_id = $1 ORDER BY sort_order",
        )
        .bind(segment.id)
        .fetch_all(&state.db)
        .await?
    };

    Ok(Json(SegmentWithConditions { segment, conditions }))
}

// ── Delete segment ──────────────────────────────────────────────────────

pub async fn handle_delete_segment(
    State(state): State<AppState>,
    auth: RequireAuth,
    Path(id): Path<i64>,
) -> Result<impl IntoResponse, AppError> {
    auth.require_editor()?;
    let project_id = auth.require_project()?;

    let segment = sqlx::query_as::<_, Segment>(
        "SELECT * FROM segments WHERE id = $1 AND project_id = $2",
    )
    .bind(id)
    .bind(project_id)
    .fetch_optional(&state.db)
    .await?
    .ok_or_else(|| AppError::NotFound("Segment not found".into()))?;

    // Check if any flag targeting rules reference this segment
    let referencing_flags = sqlx::query_as::<_, ReferencingFlag>(
        "SELECT f.id as flag_id, f.key as flag_key, f.name as flag_name \
         FROM flag_targeting_rules r \
         JOIN feature_flags f ON f.id = r.flag_id \
         WHERE r.rule_type = 'segment' AND r.rule_config->>'segmentKey' = $1 \
         AND f.project_id = $2",
    )
    .bind(&segment.key)
    .bind(project_id)
    .fetch_all(&state.db)
    .await?;

    if !referencing_flags.is_empty() {
        let flag_keys: Vec<&str> = referencing_flags.iter().map(|f| f.flag_key.as_str()).collect();
        return Err(AppError::BadRequest(format!(
            "Cannot delete segment '{}': it is referenced by flags: {}",
            segment.key,
            flag_keys.join(", ")
        )));
    }

    sqlx::query("DELETE FROM segments WHERE id = $1 AND project_id = $2")
        .bind(id)
        .bind(project_id)
        .execute(&state.db)
        .await?;

    Ok(StatusCode::NO_CONTENT)
}
