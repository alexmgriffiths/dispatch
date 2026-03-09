use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::Json;
use serde::Deserialize;

use crate::auth::RequireAuth;
use crate::errors::AppError;
use crate::handlers::audit::record_audit;
use crate::models::{Branch, Channel};
use crate::routes::AppState;

// -- Branches CRUD --

pub async fn handle_list_branches(
    State(state): State<AppState>,
    auth: RequireAuth,
) -> Result<impl IntoResponse, AppError> {
    let project_id = auth.require_project()?;

    let branches = sqlx::query_as::<_, Branch>(
        "SELECT * FROM branches WHERE project_id = $1 ORDER BY created_at DESC",
    )
    .bind(project_id)
    .fetch_all(&state.db)
    .await?;

    Ok(Json(branches))
}

#[derive(Deserialize)]
pub struct CreateBranchRequest {
    pub name: String,
}

pub async fn handle_create_branch(
    State(state): State<AppState>,
    auth: RequireAuth,
    Json(body): Json<CreateBranchRequest>,
) -> Result<impl IntoResponse, AppError> {
    auth.require_editor()?;
    let project_id = auth.require_project()?;
    let name = body.name.trim().to_string();
    if name.is_empty() {
        return Err(AppError::BadRequest("Branch name cannot be empty".into()));
    }

    let branch = sqlx::query_as::<_, Branch>(
        "INSERT INTO branches (name, project_id) VALUES ($1, $2) RETURNING *",
    )
    .bind(&name)
    .bind(project_id)
    .fetch_one(&state.db)
    .await
    .map_err(|e| {
        if e.to_string().contains("duplicate key") {
            AppError::BadRequest(format!("Branch '{name}' already exists"))
        } else {
            AppError::Internal(e.to_string())
        }
    })?;

    record_audit(
        &state.db,
        &auth,
        "branch.created",
        "branch",
        Some(branch.id),
        serde_json::json!({ "name": name }),
    )
    .await;

    crate::handlers::webhooks::fire_webhooks(
        &state.db,
        "branch.created",
        serde_json::json!({ "name": name }),
    )
    .await;

    Ok((StatusCode::CREATED, Json(branch)))
}

pub async fn handle_delete_branch(
    State(state): State<AppState>,
    auth: RequireAuth,
    Path(name): Path<String>,
) -> Result<impl IntoResponse, AppError> {
    auth.require_editor()?;
    let project_id = auth.require_project()?;

    let channel_count = sqlx::query_scalar::<_, i64>(
        "SELECT COUNT(*) FROM channels WHERE project_id = $1 AND (branch_name = $2 OR rollout_branch_name = $2)",
    )
    .bind(project_id)
    .bind(&name)
    .fetch_one(&state.db)
    .await?;

    if channel_count > 0 {
        return Err(AppError::BadRequest(
            "Cannot delete branch — it is referenced by one or more channels".into(),
        ));
    }

    let result = sqlx::query("DELETE FROM branches WHERE project_id = $1 AND name = $2")
        .bind(project_id)
        .bind(&name)
        .execute(&state.db)
        .await?;

    if result.rows_affected() == 0 {
        return Err(AppError::NotFound("Branch not found".into()));
    }

    record_audit(
        &state.db,
        &auth,
        "branch.deleted",
        "branch",
        None,
        serde_json::json!({ "name": name }),
    )
    .await;

    crate::handlers::webhooks::fire_webhooks(
        &state.db,
        "branch.deleted",
        serde_json::json!({ "name": name }),
    )
    .await;

    Ok(StatusCode::NO_CONTENT)
}

// -- Channels CRUD --

pub async fn handle_list_channels(
    State(state): State<AppState>,
    auth: RequireAuth,
) -> Result<impl IntoResponse, AppError> {
    let project_id = auth.require_project()?;

    let channels = sqlx::query_as::<_, Channel>(
        "SELECT * FROM channels WHERE project_id = $1 ORDER BY created_at DESC",
    )
    .bind(project_id)
    .fetch_all(&state.db)
    .await?;

    Ok(Json(channels))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateChannelRequest {
    pub name: String,
    pub branch_name: String,
}

pub async fn handle_create_channel(
    State(state): State<AppState>,
    auth: RequireAuth,
    Json(body): Json<CreateChannelRequest>,
) -> Result<impl IntoResponse, AppError> {
    auth.require_editor()?;
    let project_id = auth.require_project()?;
    let name = body.name.trim().to_string();
    let branch_name = body.branch_name.trim().to_string();

    if name.is_empty() || branch_name.is_empty() {
        return Err(AppError::BadRequest(
            "Channel name and branch name cannot be empty".into(),
        ));
    }

    // Verify branch exists in this project
    let branch_exists = sqlx::query_scalar::<_, bool>(
        "SELECT EXISTS(SELECT 1 FROM branches WHERE project_id = $1 AND name = $2)",
    )
    .bind(project_id)
    .bind(&branch_name)
    .fetch_one(&state.db)
    .await?;

    if !branch_exists {
        return Err(AppError::BadRequest(format!(
            "Branch '{branch_name}' does not exist"
        )));
    }

    let channel = sqlx::query_as::<_, Channel>(
        "INSERT INTO channels (name, branch_name, project_id) VALUES ($1, $2, $3) RETURNING *",
    )
    .bind(&name)
    .bind(&branch_name)
    .bind(project_id)
    .fetch_one(&state.db)
    .await
    .map_err(|e| {
        let msg = e.to_string();
        if msg.contains("duplicate key") {
            AppError::BadRequest(format!("Channel '{name}' already exists"))
        } else {
            AppError::Internal(msg)
        }
    })?;

    record_audit(
        &state.db,
        &auth,
        "channel.created",
        "channel",
        None,
        serde_json::json!({ "name": name, "branch_name": branch_name }),
    )
    .await;

    crate::handlers::webhooks::fire_webhooks(
        &state.db,
        "channel.created",
        serde_json::json!({ "name": name, "branch_name": branch_name }),
    )
    .await;

    Ok((StatusCode::CREATED, Json(channel)))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PatchChannelRequest {
    pub branch_name: Option<String>,
    pub rollout_branch_name: Option<String>,
    pub rollout_percentage: Option<i32>,
    pub min_runtime_version: Option<String>,
}

pub async fn handle_patch_channel(
    State(state): State<AppState>,
    auth: RequireAuth,
    Path(name): Path<String>,
    Json(body): Json<PatchChannelRequest>,
) -> Result<impl IntoResponse, AppError> {
    auth.require_editor()?;
    let project_id = auth.require_project()?;

    if let Some(pct) = body.rollout_percentage {
        if !(0..=100).contains(&pct) {
            return Err(AppError::BadRequest(
                "rolloutPercentage must be between 0 and 100".into(),
            ));
        }
    }

    let result = sqlx::query(
        "UPDATE channels SET
            branch_name = COALESCE($3, branch_name),
            rollout_branch_name = CASE WHEN $4::text = '' THEN NULL ELSE COALESCE($4, rollout_branch_name) END,
            rollout_percentage = COALESCE($5, rollout_percentage),
            min_runtime_version = CASE WHEN $6::text = '' THEN NULL ELSE COALESCE($6, min_runtime_version) END
         WHERE project_id = $1 AND name = $2",
    )
    .bind(project_id)
    .bind(&name)
    .bind(&body.branch_name)
    .bind(&body.rollout_branch_name)
    .bind(body.rollout_percentage)
    .bind(&body.min_runtime_version)
    .execute(&state.db)
    .await?;

    if result.rows_affected() == 0 {
        return Err(AppError::NotFound("Channel not found".into()));
    }

    let details = serde_json::json!({
        "name": name,
        "branch_name": body.branch_name,
        "rollout_branch_name": body.rollout_branch_name,
        "rollout_percentage": body.rollout_percentage,
        "min_runtime_version": body.min_runtime_version,
    });

    record_audit(&state.db, &auth, "channel.updated", "channel", None, details.clone()).await;
    crate::handlers::webhooks::fire_webhooks(&state.db, "channel.updated", details).await;

    Ok(StatusCode::NO_CONTENT)
}

pub async fn handle_delete_channel(
    State(state): State<AppState>,
    auth: RequireAuth,
    Path(name): Path<String>,
) -> Result<impl IntoResponse, AppError> {
    auth.require_editor()?;
    let project_id = auth.require_project()?;

    let result = sqlx::query("DELETE FROM channels WHERE project_id = $1 AND name = $2")
        .bind(project_id)
        .bind(&name)
        .execute(&state.db)
        .await?;

    if result.rows_affected() == 0 {
        return Err(AppError::NotFound("Channel not found".into()));
    }

    record_audit(&state.db, &auth, "channel.deleted", "channel", None, serde_json::json!({ "name": name })).await;
    crate::handlers::webhooks::fire_webhooks(&state.db, "channel.deleted", serde_json::json!({ "name": name })).await;

    Ok(StatusCode::NO_CONTENT)
}
