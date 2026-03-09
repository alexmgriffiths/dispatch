use axum::extract::{Path, Query, State};
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::Json;
use serde::Deserialize;

use crate::auth::RequireAuth;
use crate::errors::AppError;
use crate::models::{FlagContext, FlagContextEvaluationWithFlag};
use crate::routes::AppState;

// ── List contexts ────────────────────────────────────────────────────────

#[derive(Deserialize)]
pub struct ListContextsQuery {
    pub search: Option<String>,
    pub kind: Option<String>,
    pub limit: Option<i64>,
    pub offset: Option<i64>,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ListContextsResponse {
    pub contexts: Vec<FlagContext>,
    pub total: i64,
}

pub async fn handle_list_contexts(
    State(state): State<AppState>,
    auth: RequireAuth,
    Query(params): Query<ListContextsQuery>,
) -> Result<impl IntoResponse, AppError> {
    let project_id = auth.require_project()?;
    let limit = params.limit.unwrap_or(50).min(200);
    let offset = params.offset.unwrap_or(0);

    let (contexts, total) = if let Some(ref search) = params.search {
        let pattern = format!("%{}%", search);
        let contexts = if let Some(ref kind) = params.kind {
            sqlx::query_as::<_, FlagContext>(
                "SELECT * FROM flag_contexts \
                 WHERE project_id = $1 AND kind = $2 \
                 AND (targeting_key ILIKE $3 OR name ILIKE $3 OR attributes::text ILIKE $3) \
                 ORDER BY last_seen_at DESC LIMIT $4 OFFSET $5",
            )
            .bind(project_id)
            .bind(kind)
            .bind(&pattern)
            .bind(limit)
            .bind(offset)
            .fetch_all(&state.db)
            .await?
        } else {
            sqlx::query_as::<_, FlagContext>(
                "SELECT * FROM flag_contexts \
                 WHERE project_id = $1 \
                 AND (targeting_key ILIKE $2 OR name ILIKE $2 OR attributes::text ILIKE $2) \
                 ORDER BY last_seen_at DESC LIMIT $3 OFFSET $4",
            )
            .bind(project_id)
            .bind(&pattern)
            .bind(limit)
            .bind(offset)
            .fetch_all(&state.db)
            .await?
        };

        let total: i64 = if let Some(ref kind) = params.kind {
            sqlx::query_scalar(
                "SELECT COUNT(*) FROM flag_contexts \
                 WHERE project_id = $1 AND kind = $2 \
                 AND (targeting_key ILIKE $3 OR name ILIKE $3 OR attributes::text ILIKE $3)",
            )
            .bind(project_id)
            .bind(kind)
            .bind(&pattern)
            .fetch_one(&state.db)
            .await?
        } else {
            sqlx::query_scalar(
                "SELECT COUNT(*) FROM flag_contexts \
                 WHERE project_id = $1 \
                 AND (targeting_key ILIKE $2 OR name ILIKE $2 OR attributes::text ILIKE $2)",
            )
            .bind(project_id)
            .bind(&pattern)
            .fetch_one(&state.db)
            .await?
        };

        (contexts, total)
    } else {
        let contexts = if let Some(ref kind) = params.kind {
            sqlx::query_as::<_, FlagContext>(
                "SELECT * FROM flag_contexts \
                 WHERE project_id = $1 AND kind = $2 \
                 ORDER BY last_seen_at DESC LIMIT $3 OFFSET $4",
            )
            .bind(project_id)
            .bind(kind)
            .bind(limit)
            .bind(offset)
            .fetch_all(&state.db)
            .await?
        } else {
            sqlx::query_as::<_, FlagContext>(
                "SELECT * FROM flag_contexts \
                 WHERE project_id = $1 \
                 ORDER BY last_seen_at DESC LIMIT $2 OFFSET $3",
            )
            .bind(project_id)
            .bind(limit)
            .bind(offset)
            .fetch_all(&state.db)
            .await?
        };

        let total: i64 = if let Some(ref kind) = params.kind {
            sqlx::query_scalar(
                "SELECT COUNT(*) FROM flag_contexts WHERE project_id = $1 AND kind = $2",
            )
            .bind(project_id)
            .bind(kind)
            .fetch_one(&state.db)
            .await?
        } else {
            sqlx::query_scalar(
                "SELECT COUNT(*) FROM flag_contexts WHERE project_id = $1",
            )
            .bind(project_id)
            .fetch_one(&state.db)
            .await?
        };

        (contexts, total)
    };

    Ok(Json(ListContextsResponse { contexts, total }))
}

// ── Get context detail ───────────────────────────────────────────────────

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ContextDetailResponse {
    pub context: FlagContext,
    pub evaluations: Vec<FlagContextEvaluationWithFlag>,
}

pub async fn handle_get_context(
    State(state): State<AppState>,
    auth: RequireAuth,
    Path(id): Path<i64>,
) -> Result<impl IntoResponse, AppError> {
    let project_id = auth.require_project()?;

    let context = sqlx::query_as::<_, FlagContext>(
        "SELECT * FROM flag_contexts WHERE id = $1 AND project_id = $2",
    )
    .bind(id)
    .bind(project_id)
    .fetch_optional(&state.db)
    .await?
    .ok_or_else(|| AppError::NotFound("Context not found".into()))?;

    let evaluations = sqlx::query_as::<_, FlagContextEvaluationWithFlag>(
        "SELECT ce.id, ce.context_id, ce.flag_id, f.key as flag_key, f.name as flag_name, \
         ce.variation_value, ce.channel_name, ce.last_evaluated_at, ce.evaluation_count \
         FROM flag_context_evaluations ce \
         JOIN feature_flags f ON f.id = ce.flag_id \
         WHERE ce.context_id = $1 \
         ORDER BY ce.last_evaluated_at DESC",
    )
    .bind(context.id)
    .fetch_all(&state.db)
    .await?;

    Ok(Json(ContextDetailResponse {
        context,
        evaluations,
    }))
}

// ── Create context ───────────────────────────────────────────────────────

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateContextRequest {
    pub targeting_key: String,
    pub kind: String,
    pub name: Option<String>,
    pub attributes: Option<serde_json::Value>,
}

const VALID_KINDS: &[&str] = &[
    "user", "device", "organization", "service", "environment",
];

pub async fn handle_create_context(
    State(state): State<AppState>,
    auth: RequireAuth,
    Json(body): Json<CreateContextRequest>,
) -> Result<impl IntoResponse, AppError> {
    auth.require_editor()?;
    let project_id = auth.require_project()?;

    let targeting_key = body.targeting_key.trim();
    if targeting_key.is_empty() {
        return Err(AppError::BadRequest("targeting_key is required".into()));
    }

    if !VALID_KINDS.contains(&body.kind.as_str()) {
        return Err(AppError::BadRequest(format!(
            "Invalid kind '{}'. Must be one of: {}",
            body.kind,
            VALID_KINDS.join(", ")
        )));
    }

    let attrs = body.attributes.unwrap_or(serde_json::json!({}));

    let context = sqlx::query_as::<_, FlagContext>(
        "INSERT INTO flag_contexts (project_id, targeting_key, kind, name, attributes) \
         VALUES ($1, $2, $3, $4, $5) \
         ON CONFLICT (project_id, targeting_key, kind) \
         DO UPDATE SET name = COALESCE(EXCLUDED.name, flag_contexts.name), \
           attributes = EXCLUDED.attributes, \
           last_seen_at = NOW() \
         RETURNING *",
    )
    .bind(project_id)
    .bind(targeting_key)
    .bind(&body.kind)
    .bind(&body.name)
    .bind(&attrs)
    .fetch_one(&state.db)
    .await?;

    Ok((StatusCode::CREATED, Json(context)))
}

// ── Delete context ───────────────────────────────────────────────────────

pub async fn handle_delete_context(
    State(state): State<AppState>,
    auth: RequireAuth,
    Path(id): Path<i64>,
) -> Result<impl IntoResponse, AppError> {
    auth.require_editor()?;
    let project_id = auth.require_project()?;

    let rows = sqlx::query(
        "DELETE FROM flag_contexts WHERE id = $1 AND project_id = $2",
    )
    .bind(id)
    .bind(project_id)
    .execute(&state.db)
    .await?
    .rows_affected();

    if rows == 0 {
        return Err(AppError::NotFound("Context not found".into()));
    }

    Ok(StatusCode::NO_CONTENT)
}

// ── Get context kinds (for filter dropdown) ──────────────────────────────

pub async fn handle_list_context_kinds(
    State(state): State<AppState>,
    auth: RequireAuth,
) -> Result<impl IntoResponse, AppError> {
    let project_id = auth.require_project()?;

    let kinds: Vec<String> = sqlx::query_scalar(
        "SELECT DISTINCT kind FROM flag_contexts WHERE project_id = $1 ORDER BY kind",
    )
    .bind(project_id)
    .fetch_all(&state.db)
    .await?;

    Ok(Json(kinds))
}
