use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::Json;
use serde::{Deserialize, Serialize};

use crate::auth::RequireAuth;
use crate::errors::AppError;
use crate::models::{RolloutPolicy, RolloutPolicyStage, RolloutStageThreshold};
use crate::routes::AppState;

// ── Response types ──────────────────────────────────────────────────────

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StageWithThresholds {
    #[serde(flatten)]
    pub stage: RolloutPolicyStage,
    pub thresholds: Vec<RolloutStageThreshold>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PolicyListItem {
    #[serde(flatten)]
    pub policy: RolloutPolicy,
    pub stages: Vec<StageWithThresholds>,
    pub active_execution_count: i64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PolicyDetailResponse {
    #[serde(flatten)]
    pub policy: RolloutPolicy,
    pub stages: Vec<StageWithThresholds>,
}

// ── Helpers ─────────────────────────────────────────────────────────────

async fn load_stages_with_thresholds(
    db: &sqlx::PgPool,
    policy_id: i64,
) -> Result<Vec<StageWithThresholds>, AppError> {
    let stages = sqlx::query_as::<_, RolloutPolicyStage>(
        "SELECT * FROM rollout_policy_stages WHERE policy_id = $1 ORDER BY stage_order",
    )
    .bind(policy_id)
    .fetch_all(db)
    .await?;

    let stage_ids: Vec<i64> = stages.iter().map(|s| s.id).collect();
    let thresholds = if stage_ids.is_empty() {
        vec![]
    } else {
        sqlx::query_as::<_, RolloutStageThreshold>(
            "SELECT * FROM rollout_stage_thresholds WHERE stage_id = ANY($1) ORDER BY id",
        )
        .bind(&stage_ids)
        .fetch_all(db)
        .await?
    };

    let mut threshold_map: std::collections::HashMap<i64, Vec<RolloutStageThreshold>> =
        std::collections::HashMap::new();
    for t in thresholds {
        threshold_map.entry(t.stage_id).or_default().push(t);
    }

    Ok(stages
        .into_iter()
        .map(|s| {
            let ts = threshold_map.remove(&s.id).unwrap_or_default();
            StageWithThresholds {
                stage: s,
                thresholds: ts,
            }
        })
        .collect())
}

async fn insert_stages_with_thresholds(
    db: &sqlx::PgPool,
    policy_id: i64,
    stage_inputs: &[StageInput],
) -> Result<Vec<StageWithThresholds>, AppError> {
    let mut result = Vec::with_capacity(stage_inputs.len());
    for (i, si) in stage_inputs.iter().enumerate() {
        let stage = sqlx::query_as::<_, RolloutPolicyStage>(
            "INSERT INTO rollout_policy_stages (policy_id, stage_order, percentage, duration_minutes, min_devices) \
             VALUES ($1, $2, $3, $4, $5) RETURNING *",
        )
        .bind(policy_id)
        .bind((i + 1) as i32)
        .bind(si.percentage)
        .bind(si.duration_minutes.unwrap_or(60))
        .bind(si.min_devices.unwrap_or(0))
        .fetch_one(db)
        .await?;

        let mut thresholds = Vec::new();
        if let Some(ref ts) = si.thresholds {
            for ti in ts {
                let t = sqlx::query_as::<_, RolloutStageThreshold>(
                    "INSERT INTO rollout_stage_thresholds (stage_id, metric_type, operator, value, action) \
                     VALUES ($1, $2, $3, $4, $5) RETURNING *",
                )
                .bind(stage.id)
                .bind(&ti.metric_type)
                .bind(ti.operator.as_deref().unwrap_or("lt"))
                .bind(ti.value)
                .bind(ti.action.as_deref().unwrap_or("gate"))
                .fetch_one(db)
                .await?;
                thresholds.push(t);
            }
        }

        result.push(StageWithThresholds { stage, thresholds });
    }
    Ok(result)
}

// ── Validation ──────────────────────────────────────────────────────────

fn validate_thresholds(thresholds: &[ThresholdInput]) -> Result<(), AppError> {
    for t in thresholds {
        let mt = t.metric_type.as_str();
        match mt {
            "crash_rate" | "js_error_rate" => {}
            s if s.starts_with("custom:") => {
                let name = &s["custom:".len()..];
                if name.is_empty() {
                    return Err(AppError::BadRequest(
                        "custom metric_type must include a name after 'custom:' (e.g. 'custom:checkout_success')".into(),
                    ));
                }
            }
            _ => {
                return Err(AppError::BadRequest(format!(
                    "Unknown metric_type '{}'. Use 'crash_rate', 'js_error_rate', or 'custom:<name>'",
                    mt
                )));
            }
        }
        if let Some(ref op) = t.operator {
            if !matches!(op.as_str(), "lt" | "lte" | "gt" | "gte" | "eq") {
                return Err(AppError::BadRequest(format!(
                    "Invalid operator '{}'. Use 'lt', 'lte', 'gt', 'gte', or 'eq'",
                    op
                )));
            }
        }
        if let Some(ref action) = t.action {
            if !matches!(action.as_str(), "gate" | "rollback") {
                return Err(AppError::BadRequest(format!(
                    "Invalid action '{}'. Use 'gate' or 'rollback'",
                    action
                )));
            }
        }
    }
    Ok(())
}

// ── Input types ─────────────────────────────────────────────────────────

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ThresholdInput {
    pub metric_type: String,
    pub operator: Option<String>,
    pub value: f64,
    pub action: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StageInput {
    pub percentage: i32,
    pub duration_minutes: Option<i32>,
    pub min_devices: Option<i32>,
    pub thresholds: Option<Vec<ThresholdInput>>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreatePolicyRequest {
    pub name: String,
    pub description: Option<String>,
    pub channel: String,
    pub is_active: Option<bool>,
    pub health_check_url: Option<String>,
    pub health_threshold_ms: Option<i32>,
    pub stages: Vec<StageInput>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdatePolicyRequest {
    pub name: Option<String>,
    pub description: Option<String>,
    pub channel: Option<String>,
    pub is_active: Option<bool>,
    pub health_check_url: Option<String>,
    pub health_threshold_ms: Option<i32>,
    pub stages: Option<Vec<StageInput>>,
}

// ── List policies ────────────────────────────────────────────────────────

pub async fn handle_list_policies(
    State(state): State<AppState>,
    auth: RequireAuth,
) -> Result<impl IntoResponse, AppError> {
    let project_id = auth.require_project()?;

    let policies = sqlx::query_as::<_, RolloutPolicy>(
        "SELECT * FROM rollout_policies WHERE project_id = $1 ORDER BY created_at DESC",
    )
    .bind(project_id)
    .fetch_all(&state.db)
    .await?;

    let mut items = Vec::with_capacity(policies.len());
    for policy in policies {
        let stages = load_stages_with_thresholds(&state.db, policy.id).await?;

        let active_execution_count: i64 = sqlx::query_scalar(
            "SELECT COUNT(*) FROM rollout_executions \
             WHERE policy_id = $1 AND status IN ('running', 'paused')",
        )
        .bind(policy.id)
        .fetch_one(&state.db)
        .await?;

        items.push(PolicyListItem {
            policy,
            stages,
            active_execution_count,
        });
    }

    Ok(Json(items))
}

// ── Get policy ───────────────────────────────────────────────────────────

pub async fn handle_get_policy(
    State(state): State<AppState>,
    auth: RequireAuth,
    Path(id): Path<i64>,
) -> Result<impl IntoResponse, AppError> {
    let project_id = auth.require_project()?;

    let policy = sqlx::query_as::<_, RolloutPolicy>(
        "SELECT * FROM rollout_policies WHERE id = $1 AND project_id = $2",
    )
    .bind(id)
    .bind(project_id)
    .fetch_optional(&state.db)
    .await?
    .ok_or_else(|| AppError::NotFound("Rollout policy not found".into()))?;

    let stages = load_stages_with_thresholds(&state.db, policy.id).await?;

    Ok(Json(PolicyDetailResponse { policy, stages }))
}

// ── Create policy ────────────────────────────────────────────────────────

pub async fn handle_create_policy(
    State(state): State<AppState>,
    auth: RequireAuth,
    Json(body): Json<CreatePolicyRequest>,
) -> Result<impl IntoResponse, AppError> {
    auth.require_editor()?;
    let project_id = auth.require_project()?;

    let name = body.name.trim();
    if name.is_empty() {
        return Err(AppError::BadRequest("name is required".into()));
    }
    if body.channel.trim().is_empty() {
        return Err(AppError::BadRequest("channel is required".into()));
    }
    if body.stages.is_empty() {
        return Err(AppError::BadRequest("At least one stage is required".into()));
    }

    for stage in &body.stages {
        if stage.percentage < 0 || stage.percentage > 100 {
            return Err(AppError::BadRequest(
                "Stage percentage must be between 0 and 100".into(),
            ));
        }
        if let Some(ref thresholds) = stage.thresholds {
            validate_thresholds(thresholds)?;
        }
    }

    let is_active = body.is_active.unwrap_or(true);
    let description = body.description.as_deref().unwrap_or("");

    let policy = sqlx::query_as::<_, RolloutPolicy>(
        "INSERT INTO rollout_policies (project_id, name, description, channel, is_active, health_check_url, health_threshold_ms) \
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *",
    )
    .bind(project_id)
    .bind(name)
    .bind(description)
    .bind(body.channel.trim())
    .bind(is_active)
    .bind(&body.health_check_url)
    .bind(body.health_threshold_ms)
    .fetch_one(&state.db)
    .await?;

    let stages = insert_stages_with_thresholds(&state.db, policy.id, &body.stages).await?;

    Ok((
        StatusCode::CREATED,
        Json(PolicyDetailResponse { policy, stages }),
    ))
}

// ── Update policy ────────────────────────────────────────────────────────

pub async fn handle_update_policy(
    State(state): State<AppState>,
    auth: RequireAuth,
    Path(id): Path<i64>,
    Json(body): Json<UpdatePolicyRequest>,
) -> Result<impl IntoResponse, AppError> {
    auth.require_editor()?;
    let project_id = auth.require_project()?;

    let policy = sqlx::query_as::<_, RolloutPolicy>(
        "SELECT * FROM rollout_policies WHERE id = $1 AND project_id = $2",
    )
    .bind(id)
    .bind(project_id)
    .fetch_optional(&state.db)
    .await?
    .ok_or_else(|| AppError::NotFound("Rollout policy not found".into()))?;

    // If stages are being changed, check no running executions
    if body.stages.is_some() {
        let running_count: i64 = sqlx::query_scalar(
            "SELECT COUNT(*) FROM rollout_executions \
             WHERE policy_id = $1 AND status IN ('running', 'paused')",
        )
        .bind(policy.id)
        .fetch_one(&state.db)
        .await?;

        if running_count > 0 {
            return Err(AppError::BadRequest(
                "Cannot modify stages while executions are running or paused".into(),
            ));
        }
    }

    if let Some(ref stages) = body.stages {
        if stages.is_empty() {
            return Err(AppError::BadRequest("At least one stage is required".into()));
        }
        for stage in stages {
            if stage.percentage < 0 || stage.percentage > 100 {
                return Err(AppError::BadRequest(
                    "Stage percentage must be between 0 and 100".into(),
                ));
            }
            if let Some(ref thresholds) = stage.thresholds {
                validate_thresholds(thresholds)?;
            }
        }
    }

    let name = body.name.as_deref().unwrap_or(&policy.name);
    let description = body.description.as_deref().unwrap_or(&policy.description);
    let channel = body.channel.as_deref().unwrap_or(&policy.channel);
    let is_active = body.is_active.unwrap_or(policy.is_active);
    let health_check_url = if body.health_check_url.is_some() {
        &body.health_check_url
    } else {
        &policy.health_check_url
    };
    let health_threshold_ms = if body.health_threshold_ms.is_some() {
        body.health_threshold_ms
    } else {
        policy.health_threshold_ms
    };

    let updated_policy = sqlx::query_as::<_, RolloutPolicy>(
        "UPDATE rollout_policies \
         SET name = $3, description = $4, channel = $5, is_active = $6, health_check_url = $7, \
             health_threshold_ms = $8, updated_at = NOW() \
         WHERE id = $1 AND project_id = $2 RETURNING *",
    )
    .bind(id)
    .bind(project_id)
    .bind(name)
    .bind(description)
    .bind(channel)
    .bind(is_active)
    .bind(health_check_url)
    .bind(health_threshold_ms)
    .fetch_one(&state.db)
    .await?;

    // If stages provided, delete and re-insert (cascade deletes thresholds)
    let stages = if let Some(ref stage_inputs) = body.stages {
        sqlx::query("DELETE FROM rollout_policy_stages WHERE policy_id = $1")
            .bind(id)
            .execute(&state.db)
            .await?;

        insert_stages_with_thresholds(&state.db, id, stage_inputs).await?
    } else {
        load_stages_with_thresholds(&state.db, id).await?
    };

    Ok(Json(PolicyDetailResponse {
        policy: updated_policy,
        stages,
    }))
}

// ── Delete policy ────────────────────────────────────────────────────────

pub async fn handle_delete_policy(
    State(state): State<AppState>,
    auth: RequireAuth,
    Path(id): Path<i64>,
) -> Result<impl IntoResponse, AppError> {
    auth.require_editor()?;
    let project_id = auth.require_project()?;

    // Verify policy exists
    let _policy = sqlx::query_as::<_, RolloutPolicy>(
        "SELECT * FROM rollout_policies WHERE id = $1 AND project_id = $2",
    )
    .bind(id)
    .bind(project_id)
    .fetch_optional(&state.db)
    .await?
    .ok_or_else(|| AppError::NotFound("Rollout policy not found".into()))?;

    // Check no running/paused executions
    let active_count: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM rollout_executions \
         WHERE policy_id = $1 AND status IN ('running', 'paused')",
    )
    .bind(id)
    .fetch_one(&state.db)
    .await?;

    if active_count > 0 {
        return Err(AppError::BadRequest(
            "Cannot delete policy with running or paused executions".into(),
        ));
    }

    sqlx::query("DELETE FROM rollout_policies WHERE id = $1 AND project_id = $2")
        .bind(id)
        .bind(project_id)
        .execute(&state.db)
        .await?;

    Ok(StatusCode::NO_CONTENT)
}
