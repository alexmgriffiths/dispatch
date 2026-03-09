use axum::extract::{Path, Query, State};
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::Json;
use serde::Deserialize;

use crate::auth::RequireAuth;
use crate::errors::AppError;
use crate::handlers::audit::record_audit;
use crate::models::{
    FeatureFlag, FlagEnvSetting, FlagEvaluationCount, FlagEvaluationVariationCount,
    FlagTargetingRule, FlagVariation,
};
use crate::routes::AppState;

// ── List all flags (with per-channel status summary) ────────────────────

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FlagListItem {
    #[serde(flatten)]
    pub flag: FeatureFlag,
    pub env_settings: Vec<FlagEnvSetting>,
    pub rules: Vec<FlagTargetingRule>,
    pub variations: Vec<FlagVariation>,
    pub eval_total_7d: i64,
    pub eval_by_channel_7d: std::collections::HashMap<String, i64>,
}

pub async fn handle_list_flags(
    State(state): State<AppState>,
    auth: RequireAuth,
) -> Result<impl IntoResponse, AppError> {
    let project_id = auth.require_project()?;

    let flags = sqlx::query_as::<_, FeatureFlag>(
        "SELECT * FROM feature_flags WHERE project_id = $1 ORDER BY key",
    )
    .bind(project_id)
    .fetch_all(&state.db)
    .await?;

    if flags.is_empty() {
        return Ok(Json(Vec::<FlagListItem>::new()));
    }

    let flag_ids: Vec<i64> = flags.iter().map(|f| f.id).collect();
    let settings = sqlx::query_as::<_, FlagEnvSetting>(
        "SELECT * FROM flag_env_settings WHERE flag_id = ANY($1) ORDER BY flag_id, channel_name",
    )
    .bind(&flag_ids)
    .fetch_all(&state.db)
    .await?;

    let mut settings_by_flag: std::collections::HashMap<i64, Vec<FlagEnvSetting>> =
        std::collections::HashMap::new();
    for s in settings {
        settings_by_flag.entry(s.flag_id).or_default().push(s);
    }

    let rules = sqlx::query_as::<_, FlagTargetingRule>(
        "SELECT * FROM flag_targeting_rules WHERE flag_id = ANY($1) ORDER BY flag_id, priority",
    )
    .bind(&flag_ids)
    .fetch_all(&state.db)
    .await?;

    let mut rules_by_flag: std::collections::HashMap<i64, Vec<FlagTargetingRule>> =
        std::collections::HashMap::new();
    for r in rules {
        rules_by_flag.entry(r.flag_id).or_default().push(r);
    }

    let variations = sqlx::query_as::<_, FlagVariation>(
        "SELECT * FROM flag_variations WHERE flag_id = ANY($1) ORDER BY flag_id, sort_order",
    )
    .bind(&flag_ids)
    .fetch_all(&state.db)
    .await?;

    let mut variations_by_flag: std::collections::HashMap<i64, Vec<FlagVariation>> =
        std::collections::HashMap::new();
    for v in variations {
        variations_by_flag.entry(v.flag_id).or_default().push(v);
    }

    // 7-day evaluation totals per flag, broken out by channel
    let since_7d = chrono::Utc::now().date_naive() - chrono::Duration::days(7);
    let eval_rows: Vec<(i64, Option<String>, i64)> = sqlx::query_as(
        "SELECT flag_id, channel_name, COALESCE(SUM(count), 0)::BIGINT AS total \
         FROM flag_evaluation_counts \
         WHERE flag_id = ANY($1) AND date >= $2 \
         GROUP BY flag_id, channel_name",
    )
    .bind(&flag_ids)
    .bind(since_7d)
    .fetch_all(&state.db)
    .await?;

    let mut evals_by_flag_channel: std::collections::HashMap<i64, std::collections::HashMap<String, i64>> =
        std::collections::HashMap::new();
    let mut evals_total_by_flag: std::collections::HashMap<i64, i64> =
        std::collections::HashMap::new();
    for (flag_id, channel, total) in eval_rows {
        *evals_total_by_flag.entry(flag_id).or_default() += total;
        if let Some(ch) = channel {
            evals_by_flag_channel
                .entry(flag_id)
                .or_default()
                .insert(ch, total);
        }
    }

    let items: Vec<FlagListItem> = flags
        .into_iter()
        .map(|f| {
            let eval_total_7d = evals_total_by_flag.remove(&f.id).unwrap_or(0);
            let eval_by_channel_7d = evals_by_flag_channel.remove(&f.id).unwrap_or_default();
            let env_settings = settings_by_flag.remove(&f.id).unwrap_or_default();
            let rules = rules_by_flag.remove(&f.id).unwrap_or_default();
            let variations = variations_by_flag.remove(&f.id).unwrap_or_default();
            FlagListItem {
                flag: f,
                env_settings,
                rules,
                variations,
                eval_total_7d,
                eval_by_channel_7d,
            }
        })
        .collect();

    Ok(Json(items))
}

// ── Get single flag with env settings + rules ───────────────────────────

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FlagWithDetails {
    #[serde(flatten)]
    pub flag: FeatureFlag,
    pub env_settings: Vec<FlagEnvSetting>,
    pub rules: Vec<FlagTargetingRule>,
    pub variations: Vec<FlagVariation>,
    pub active_executions: Vec<FlagActiveExecution>,
}

#[derive(serde::Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct FlagActiveExecution {
    pub execution_id: i64,
    pub channel: String,
    pub policy_name: String,
    pub target_enabled: bool,
    pub current_stage: i32,
    pub status: String,
}

pub async fn handle_get_flag(
    State(state): State<AppState>,
    auth: RequireAuth,
    Path(flag_id): Path<i64>,
) -> Result<impl IntoResponse, AppError> {
    let project_id = auth.require_project()?;

    let flag = sqlx::query_as::<_, FeatureFlag>(
        "SELECT * FROM feature_flags WHERE project_id = $1 AND id = $2",
    )
    .bind(project_id)
    .bind(flag_id)
    .fetch_optional(&state.db)
    .await?
    .ok_or_else(|| AppError::NotFound("Flag not found".into()))?;

    let env_settings = sqlx::query_as::<_, FlagEnvSetting>(
        "SELECT * FROM flag_env_settings WHERE flag_id = $1 ORDER BY channel_name",
    )
    .bind(flag_id)
    .fetch_all(&state.db)
    .await?;

    let rules = sqlx::query_as::<_, FlagTargetingRule>(
        "SELECT * FROM flag_targeting_rules WHERE flag_id = $1 ORDER BY channel_name NULLS FIRST, priority",
    )
    .bind(flag_id)
    .fetch_all(&state.db)
    .await?;

    let variations = sqlx::query_as::<_, FlagVariation>(
        "SELECT * FROM flag_variations WHERE flag_id = $1 ORDER BY sort_order",
    )
    .bind(flag_id)
    .fetch_all(&state.db)
    .await?;

    // Active rollout executions that affect this flag
    let active_executions = sqlx::query_as::<_, FlagActiveExecution>(
        "SELECT e.id AS execution_id, e.channel, p.name AS policy_name, \
         xf.target_enabled, e.current_stage, e.status \
         FROM rollout_execution_flags xf \
         JOIN rollout_executions e ON e.id = xf.execution_id \
         JOIN rollout_policies p ON p.id = e.policy_id \
         WHERE xf.flag_id = $1 AND e.status IN ('running', 'paused') \
         ORDER BY e.started_at DESC",
    )
    .bind(flag_id)
    .fetch_all(&state.db)
    .await?;

    Ok(Json(FlagWithDetails {
        flag,
        env_settings,
        rules,
        variations,
        active_executions,
    }))
}

// ── Create flag ─────────────────────────────────────────────────────────

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateFlagRequest {
    pub name: String,
    pub key: String,
    #[serde(default = "default_flag_type")]
    pub flag_type: String,
    pub default_value: Option<serde_json::Value>,
    #[serde(default = "default_true")]
    pub enabled: bool,
    pub description: Option<String>,
    pub variations: Option<Vec<CreateVariationInput>>,
}

#[derive(Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct CreateVariationInput {
    pub value: serde_json::Value,
    pub name: Option<String>,
    pub description: Option<String>,
}

fn default_flag_type() -> String {
    "boolean".to_string()
}
fn default_true() -> bool {
    true
}

const VALID_FLAG_TYPES: &[&str] = &["boolean", "string", "number", "json"];

pub async fn handle_create_flag(
    State(state): State<AppState>,
    auth: RequireAuth,
    Json(body): Json<CreateFlagRequest>,
) -> Result<impl IntoResponse, AppError> {
    auth.require_editor()?;
    let project_id = auth.require_project()?;
    let key = body.key.trim().to_string();

    if key.is_empty() {
        return Err(AppError::BadRequest("Flag key cannot be empty".into()));
    }

    if !key
        .chars()
        .all(|c| c.is_alphanumeric() || c == '-' || c == '_' || c == '.')
    {
        return Err(AppError::BadRequest(
            "Flag key may only contain alphanumeric characters, hyphens, underscores, and dots"
                .into(),
        ));
    }

    if !VALID_FLAG_TYPES.contains(&body.flag_type.as_str()) {
        return Err(AppError::BadRequest(format!(
            "Invalid flag type '{}'. Must be one of: {}",
            body.flag_type,
            VALID_FLAG_TYPES.join(", ")
        )));
    }

    let default_value = body
        .default_value
        .unwrap_or_else(|| default_value_for_type(&body.flag_type));

    let name = body.name.trim().to_string();
    if name.is_empty() {
        return Err(AppError::BadRequest("Flag name cannot be empty".into()));
    }

    // Look up creator name from user_id
    let created_by_name: Option<String> = if let Some(uid) = auth.user_id {
        sqlx::query_scalar::<_, String>("SELECT name FROM users WHERE id = $1")
            .bind(uid)
            .fetch_optional(&state.db)
            .await?
    } else {
        None
    };

    let flag = sqlx::query_as::<_, FeatureFlag>(
        "INSERT INTO feature_flags (project_id, name, key, flag_type, default_value, enabled, description, created_by_name)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING *",
    )
    .bind(project_id)
    .bind(&name)
    .bind(&key)
    .bind(&body.flag_type)
    .bind(&default_value)
    .bind(body.enabled)
    .bind(&body.description)
    .bind(&created_by_name)
    .fetch_one(&state.db)
    .await
    .map_err(|e| {
        if let sqlx::Error::Database(ref db_err) = e {
            if db_err.constraint() == Some("idx_feature_flags_project_key") {
                return AppError::BadRequest(format!("Flag key '{key}' already exists"));
            }
        }
        AppError::Internal(e.to_string())
    })?;

    // Auto-create env settings for all existing channels
    let channels = sqlx::query_scalar::<_, String>(
        "SELECT name FROM channels WHERE project_id = $1",
    )
    .bind(project_id)
    .fetch_all(&state.db)
    .await?;

    for ch in &channels {
        let _ = sqlx::query(
            "INSERT INTO flag_env_settings (flag_id, channel_name, enabled, default_value)
             VALUES ($1, $2, false, $3)
             ON CONFLICT (flag_id, channel_name) DO NOTHING",
        )
        .bind(flag.id)
        .bind(ch)
        .bind(&default_value)
        .execute(&state.db)
        .await;
    }

    // Create variations
    let variation_inputs: Vec<CreateVariationInput> = if let Some(v) = body.variations {
        if v.is_empty() {
            return Err(AppError::BadRequest(
                "At least one variation is required".into(),
            ));
        }
        v
    } else if body.flag_type == "boolean" {
        // Auto-create true/false variations for boolean flags
        vec![
            CreateVariationInput {
                value: serde_json::Value::Bool(true),
                name: Some("true".to_string()),
                description: None,
            },
            CreateVariationInput {
                value: serde_json::Value::Bool(false),
                name: Some("false".to_string()),
                description: None,
            },
        ]
    } else {
        // Non-boolean with no variations: create a single default variation
        vec![CreateVariationInput {
            value: default_value.clone(),
            name: None,
            description: None,
        }]
    };

    for (i, v) in variation_inputs.iter().enumerate() {
        sqlx::query(
            "INSERT INTO flag_variations (flag_id, value, name, description, sort_order)
             VALUES ($1, $2, $3, $4, $5)",
        )
        .bind(flag.id)
        .bind(&v.value)
        .bind(&v.name)
        .bind(&v.description)
        .bind(i as i32)
        .execute(&state.db)
        .await?;
    }

    record_audit(
        &state.db,
        &auth,
        "flag.created",
        "feature_flag",
        Some(flag.id),
        serde_json::json!({ "key": key, "flagType": body.flag_type }),
    )
    .await;

    Ok((StatusCode::CREATED, Json(flag)))
}

fn default_value_for_type(flag_type: &str) -> serde_json::Value {
    match flag_type {
        "boolean" => serde_json::Value::Bool(false),
        "string" => serde_json::Value::String(String::new()),
        "number" => serde_json::json!(0),
        "json" => serde_json::json!({}),
        _ => serde_json::Value::Bool(false),
    }
}

// ── Update flag ─────────────────────────────────────────────────────────

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PatchFlagRequest {
    pub name: Option<String>,
    pub default_value: Option<serde_json::Value>,
    pub enabled: Option<bool>,
    pub description: Option<String>,
}

pub async fn handle_patch_flag(
    State(state): State<AppState>,
    auth: RequireAuth,
    Path(flag_id): Path<i64>,
    Json(body): Json<PatchFlagRequest>,
) -> Result<impl IntoResponse, AppError> {
    auth.require_editor()?;
    let project_id = auth.require_project()?;

    let flag = sqlx::query_as::<_, FeatureFlag>(
        "UPDATE feature_flags
         SET name = COALESCE($1, name),
             default_value = COALESCE($2, default_value),
             enabled = COALESCE($3, enabled),
             description = COALESCE($4, description),
             updated_at = NOW()
         WHERE project_id = $5 AND id = $6
         RETURNING *",
    )
    .bind(&body.name)
    .bind(&body.default_value)
    .bind(body.enabled)
    .bind(&body.description)
    .bind(project_id)
    .bind(flag_id)
    .fetch_optional(&state.db)
    .await?
    .ok_or_else(|| AppError::NotFound("Flag not found".into()))?;

    record_audit(
        &state.db,
        &auth,
        "flag.updated",
        "feature_flag",
        Some(flag.id),
        serde_json::json!({
            "key": flag.key,
            "enabled": body.enabled,
            "defaultValue": body.default_value,
        }),
    )
    .await;

    Ok(Json(flag))
}

// ── Delete flag ─────────────────────────────────────────────────────────

pub async fn handle_delete_flag(
    State(state): State<AppState>,
    auth: RequireAuth,
    Path(flag_id): Path<i64>,
) -> Result<impl IntoResponse, AppError> {
    auth.require_editor()?;
    let project_id = auth.require_project()?;

    // Block deletion if flag is linked to an active rollout execution
    let active_count = sqlx::query_scalar::<_, i64>(
        "SELECT COUNT(*) FROM rollout_execution_flags xf \
         JOIN rollout_executions e ON e.id = xf.execution_id \
         WHERE xf.flag_id = $1 AND e.status IN ('running', 'paused')",
    )
    .bind(flag_id)
    .fetch_one(&state.db)
    .await?;

    if active_count > 0 {
        return Err(AppError::BadRequest(
            "Cannot delete flag while it is linked to an active rollout execution. \
             Complete or roll back the execution first.".into(),
        ));
    }

    let result =
        sqlx::query("DELETE FROM feature_flags WHERE project_id = $1 AND id = $2")
            .bind(project_id)
            .bind(flag_id)
            .execute(&state.db)
            .await?;

    if result.rows_affected() == 0 {
        return Err(AppError::NotFound("Flag not found".into()));
    }

    record_audit(
        &state.db,
        &auth,
        "flag.deleted",
        "feature_flag",
        Some(flag_id),
        serde_json::json!({ "id": flag_id }),
    )
    .await;

    Ok(StatusCode::NO_CONTENT)
}

// ── Environment settings ────────────────────────────────────────────────

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PatchEnvSettingRequest {
    pub enabled: Option<bool>,
    pub default_value: Option<serde_json::Value>,
}

pub async fn handle_patch_env_setting(
    State(state): State<AppState>,
    auth: RequireAuth,
    Path((flag_id, channel_name)): Path<(i64, String)>,
    Json(body): Json<PatchEnvSettingRequest>,
) -> Result<impl IntoResponse, AppError> {
    auth.require_editor()?;
    let project_id = auth.require_project()?;

    let flag_exists = sqlx::query_scalar::<_, bool>(
        "SELECT EXISTS(SELECT 1 FROM feature_flags WHERE project_id = $1 AND id = $2)",
    )
    .bind(project_id)
    .bind(flag_id)
    .fetch_one(&state.db)
    .await?;

    if !flag_exists {
        return Err(AppError::NotFound("Flag not found".into()));
    }

    let setting = sqlx::query_as::<_, FlagEnvSetting>(
        "INSERT INTO flag_env_settings (flag_id, channel_name, enabled, default_value)
         VALUES ($1, $2, COALESCE($3, false), COALESCE($4, 'false'::jsonb))
         ON CONFLICT (flag_id, channel_name)
         DO UPDATE SET
           enabled = COALESCE($3, flag_env_settings.enabled),
           default_value = COALESCE($4, flag_env_settings.default_value)
         RETURNING *",
    )
    .bind(flag_id)
    .bind(&channel_name)
    .bind(body.enabled)
    .bind(&body.default_value)
    .fetch_one(&state.db)
    .await?;

    record_audit(
        &state.db,
        &auth,
        "flag_env.updated",
        "flag_env_setting",
        Some(setting.id),
        serde_json::json!({
            "flagId": flag_id,
            "channel": channel_name,
            "enabled": body.enabled,
        }),
    )
    .await;

    Ok(Json(setting))
}

// ── Targeting rules CRUD ────────────────────────────────────────────────

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateRuleRequest {
    pub priority: Option<i32>,
    pub rule_type: String,
    pub variant_value: serde_json::Value,
    #[serde(default = "default_rule_config")]
    pub rule_config: serde_json::Value,
    pub channel_name: Option<String>,
}

fn default_rule_config() -> serde_json::Value {
    serde_json::json!({})
}

const VALID_RULE_TYPES: &[&str] = &["force", "percentage_rollout", "user_list", "attribute", "ota_update", "segment"];

pub async fn handle_create_rule(
    State(state): State<AppState>,
    auth: RequireAuth,
    Path(flag_id): Path<i64>,
    Json(body): Json<CreateRuleRequest>,
) -> Result<impl IntoResponse, AppError> {
    auth.require_editor()?;
    let project_id = auth.require_project()?;

    let flag_exists = sqlx::query_scalar::<_, bool>(
        "SELECT EXISTS(SELECT 1 FROM feature_flags WHERE project_id = $1 AND id = $2)",
    )
    .bind(project_id)
    .bind(flag_id)
    .fetch_one(&state.db)
    .await?;

    if !flag_exists {
        return Err(AppError::NotFound("Flag not found".into()));
    }

    if !VALID_RULE_TYPES.contains(&body.rule_type.as_str()) {
        return Err(AppError::BadRequest(format!(
            "Invalid rule type '{}'. Must be one of: {}",
            body.rule_type,
            VALID_RULE_TYPES.join(", ")
        )));
    }

    validate_rule_config(&body.rule_type, &body.rule_config)?;

    let priority = body.priority.unwrap_or(0);

    let rule = sqlx::query_as::<_, FlagTargetingRule>(
        "INSERT INTO flag_targeting_rules (flag_id, priority, rule_type, variant_value, rule_config, channel_name)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *",
    )
    .bind(flag_id)
    .bind(priority)
    .bind(&body.rule_type)
    .bind(&body.variant_value)
    .bind(&body.rule_config)
    .bind(&body.channel_name)
    .fetch_one(&state.db)
    .await?;

    record_audit(
        &state.db,
        &auth,
        "flag_rule.created",
        "flag_targeting_rule",
        Some(rule.id),
        serde_json::json!({
            "flagId": flag_id,
            "ruleType": body.rule_type,
            "priority": priority,
            "channel": body.channel_name,
        }),
    )
    .await;

    Ok((StatusCode::CREATED, Json(rule)))
}

// ── Update targeting rule ────────────────────────────────────────────────

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PatchRuleRequest {
    pub variant_value: Option<serde_json::Value>,
    pub rule_config: Option<serde_json::Value>,
    pub priority: Option<i32>,
}

pub async fn handle_patch_rule(
    State(state): State<AppState>,
    auth: RequireAuth,
    Path((flag_id, rule_id)): Path<(i64, i64)>,
    Json(body): Json<PatchRuleRequest>,
) -> Result<impl IntoResponse, AppError> {
    auth.require_editor()?;
    let project_id = auth.require_project()?;

    let flag_exists = sqlx::query_scalar::<_, bool>(
        "SELECT EXISTS(SELECT 1 FROM feature_flags WHERE project_id = $1 AND id = $2)",
    )
    .bind(project_id)
    .bind(flag_id)
    .fetch_one(&state.db)
    .await?;

    if !flag_exists {
        return Err(AppError::NotFound("Flag not found".into()));
    }

    // If rule_config is being updated, validate it against the existing rule_type
    if let Some(ref config) = body.rule_config {
        let rule_type: String = sqlx::query_scalar(
            "SELECT rule_type FROM flag_targeting_rules WHERE flag_id = $1 AND id = $2",
        )
        .bind(flag_id)
        .bind(rule_id)
        .fetch_optional(&state.db)
        .await?
        .ok_or_else(|| AppError::NotFound("Rule not found".into()))?;

        validate_rule_config(&rule_type, config)?;
    }

    let rule = sqlx::query_as::<_, FlagTargetingRule>(
        "UPDATE flag_targeting_rules
         SET variant_value = COALESCE($1, variant_value),
             rule_config = COALESCE($2, rule_config),
             priority = COALESCE($3, priority)
         WHERE flag_id = $4 AND id = $5
         RETURNING *",
    )
    .bind(&body.variant_value)
    .bind(&body.rule_config)
    .bind(body.priority)
    .bind(flag_id)
    .bind(rule_id)
    .fetch_optional(&state.db)
    .await?
    .ok_or_else(|| AppError::NotFound("Rule not found".into()))?;

    record_audit(
        &state.db,
        &auth,
        "flag_rule.updated",
        "flag_targeting_rule",
        Some(rule.id),
        serde_json::json!({ "flagId": flag_id, "ruleId": rule_id }),
    )
    .await;

    Ok(Json(rule))
}

fn validate_rule_config(rule_type: &str, config: &serde_json::Value) -> Result<(), AppError> {
    match rule_type {
        "force" => Ok(()),
        "percentage_rollout" => {
            // Support multi-variation rollout: {"rollout": [{"variationId": N, "weight": N}, ...]}
            if let Some(rollout) = config.get("rollout").and_then(|v| v.as_array()) {
                if rollout.is_empty() {
                    return Err(AppError::BadRequest(
                        "rollout array must not be empty".into(),
                    ));
                }
                let total: f64 = rollout
                    .iter()
                    .map(|entry| {
                        entry
                            .get("weight")
                            .and_then(|w| w.as_f64())
                            .unwrap_or(0.0)
                    })
                    .sum();
                if (total - 100.0).abs() > 0.01 {
                    return Err(AppError::BadRequest(
                        "rollout weights must sum to 100".into(),
                    ));
                }
                return Ok(());
            }
            // Legacy: single percentage
            let pct = config
                .get("percentage")
                .and_then(|v| v.as_f64())
                .ok_or_else(|| {
                    AppError::BadRequest(
                        "percentage_rollout requires rule_config.rollout array or rule_config.percentage (0-100)".into(),
                    )
                })?;
            if !(0.0..=100.0).contains(&pct) {
                return Err(AppError::BadRequest(
                    "percentage must be between 0 and 100".into(),
                ));
            }
            Ok(())
        }
        "user_list" => {
            let users = config.get("userIds").and_then(|v| v.as_array());
            if users.is_none() {
                return Err(AppError::BadRequest(
                    "user_list requires rule_config.userIds array".into(),
                ));
            }
            Ok(())
        }
        "attribute" => {
            let conditions = config
                .get("conditions")
                .and_then(|v| v.as_array())
                .ok_or_else(|| {
                    AppError::BadRequest(
                        "attribute requires rule_config.conditions array".into(),
                    )
                })?;
            if conditions.is_empty() {
                return Err(AppError::BadRequest(
                    "conditions array must not be empty".into(),
                ));
            }
            const VALID_OPERATORS: &[&str] = &[
                "eq",
                "neq",
                "in",
                "not_in",
                "contains",
                "starts_with",
                "ends_with",
                "gt",
                "gte",
                "lt",
                "lte",
                "exists",
                "not_exists",
                "semver_gt",
                "semver_gte",
                "semver_lt",
                "semver_lte",
            ];
            for (i, cond) in conditions.iter().enumerate() {
                let attr = cond
                    .get("attribute")
                    .and_then(|v| v.as_str())
                    .unwrap_or("");
                if attr.is_empty() {
                    return Err(AppError::BadRequest(
                        format!("conditions[{i}].attribute must be a non-empty string"),
                    ));
                }
                let operator = cond
                    .get("operator")
                    .and_then(|v| v.as_str())
                    .unwrap_or("");
                if !VALID_OPERATORS.contains(&operator) {
                    return Err(AppError::BadRequest(format!(
                        "conditions[{i}].operator '{}' is invalid. Must be one of: {}",
                        operator,
                        VALID_OPERATORS.join(", ")
                    )));
                }
                let values = cond
                    .get("values")
                    .and_then(|v| v.as_array())
                    .ok_or_else(|| {
                        AppError::BadRequest(
                            format!("conditions[{i}].values must be a JSON array"),
                        )
                    })?;
                if operator != "exists" && operator != "not_exists" && values.is_empty() {
                    return Err(AppError::BadRequest(
                        format!("conditions[{i}].values must not be empty for operator '{operator}'"),
                    ));
                }
            }
            Ok(())
        }
        "ota_update" => {
            const VALID_MATCH_BY: &[&str] = &["branch", "runtime_version", "updated_since"];
            let match_by = config
                .get("matchBy")
                .and_then(|v| v.as_str())
                .unwrap_or("");
            if !VALID_MATCH_BY.contains(&match_by) {
                return Err(AppError::BadRequest(format!(
                    "ota_update requires rule_config.matchBy to be one of: {}",
                    VALID_MATCH_BY.join(", ")
                )));
            }
            let value = config
                .get("value")
                .and_then(|v| v.as_str())
                .unwrap_or("");
            if value.is_empty() {
                return Err(AppError::BadRequest(
                    "ota_update requires rule_config.value (non-empty string)".into(),
                ));
            }
            if match_by == "runtime_version" {
                let comparison = config
                    .get("comparison")
                    .and_then(|v| v.as_str())
                    .unwrap_or("");
                const VALID_COMPARISONS: &[&str] = &["gte", "gt", "lte", "lt"];
                if !VALID_COMPARISONS.contains(&comparison) {
                    return Err(AppError::BadRequest(format!(
                        "ota_update with matchBy=runtime_version requires rule_config.comparison to be one of: {}",
                        VALID_COMPARISONS.join(", ")
                    )));
                }
            }
            Ok(())
        }
        "segment" => {
            let segment_key = config
                .get("segmentKey")
                .and_then(|v| v.as_str())
                .unwrap_or("");
            if segment_key.is_empty() {
                return Err(AppError::BadRequest(
                    "segment requires rule_config.segmentKey (non-empty string)".into(),
                ));
            }
            Ok(())
        }
        _ => Ok(()),
    }
}

pub async fn handle_delete_rule(
    State(state): State<AppState>,
    auth: RequireAuth,
    Path((flag_id, rule_id)): Path<(i64, i64)>,
) -> Result<impl IntoResponse, AppError> {
    auth.require_editor()?;
    let project_id = auth.require_project()?;

    let flag_exists = sqlx::query_scalar::<_, bool>(
        "SELECT EXISTS(SELECT 1 FROM feature_flags WHERE project_id = $1 AND id = $2)",
    )
    .bind(project_id)
    .bind(flag_id)
    .fetch_one(&state.db)
    .await?;

    if !flag_exists {
        return Err(AppError::NotFound("Flag not found".into()));
    }

    let result =
        sqlx::query("DELETE FROM flag_targeting_rules WHERE flag_id = $1 AND id = $2")
            .bind(flag_id)
            .bind(rule_id)
            .execute(&state.db)
            .await?;

    if result.rows_affected() == 0 {
        return Err(AppError::NotFound("Rule not found".into()));
    }

    record_audit(
        &state.db,
        &auth,
        "flag_rule.deleted",
        "flag_targeting_rule",
        Some(rule_id),
        serde_json::json!({ "flagId": flag_id, "ruleId": rule_id }),
    )
    .await;

    Ok(StatusCode::NO_CONTENT)
}

// ── Public evaluation endpoint ──────────────────────────────────────────

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FlagDefinition {
    pub key: String,
    pub flag_type: String,
    pub default_value: serde_json::Value,
    pub enabled: bool,
    pub rules: Vec<RuleDefinition>,
    pub variations: Vec<VariationDefinition>,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VariationDefinition {
    pub id: i64,
    pub value: serde_json::Value,
    pub name: Option<String>,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RuleDefinition {
    pub priority: i32,
    pub rule_type: String,
    pub variant_value: serde_json::Value,
    pub rule_config: serde_json::Value,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FlagPayload {
    pub flags: Vec<FlagDefinition>,
}

#[derive(Deserialize)]
pub struct FlagDefQuery {
    pub channel: Option<String>,
}

pub async fn handle_get_flag_definitions(
    State(state): State<AppState>,
    Path(project_slug): Path<String>,
    Query(query): Query<FlagDefQuery>,
) -> Result<impl IntoResponse, AppError> {
    let project_id = sqlx::query_scalar::<_, i64>(
        "SELECT id FROM projects WHERE slug = $1",
    )
    .bind(&project_slug)
    .fetch_optional(&state.db)
    .await?
    .ok_or_else(|| AppError::NotFound("Project not found".into()))?;

    let channel = query.channel.as_deref();

    let flags = sqlx::query_as::<_, FeatureFlag>(
        "SELECT * FROM feature_flags WHERE project_id = $1 ORDER BY key",
    )
    .bind(project_id)
    .fetch_all(&state.db)
    .await?;

    if flags.is_empty() {
        return Ok(Json(FlagPayload { flags: vec![] }));
    }

    let flag_ids: Vec<i64> = flags.iter().map(|f| f.id).collect();

    // Load per-channel env settings if channel specified
    let env_settings: std::collections::HashMap<i64, FlagEnvSetting> = if let Some(ch) = channel {
        sqlx::query_as::<_, FlagEnvSetting>(
            "SELECT * FROM flag_env_settings WHERE flag_id = ANY($1) AND channel_name = $2",
        )
        .bind(&flag_ids)
        .bind(ch)
        .fetch_all(&state.db)
        .await?
        .into_iter()
        .map(|s| (s.flag_id, s))
        .collect()
    } else {
        std::collections::HashMap::new()
    };

    // Fetch rules: channel-specific + global (NULL channel)
    let rules = if let Some(ch) = channel {
        sqlx::query_as::<_, FlagTargetingRule>(
            "SELECT * FROM flag_targeting_rules
             WHERE flag_id = ANY($1) AND (channel_name = $2 OR channel_name IS NULL)
             ORDER BY flag_id, priority",
        )
        .bind(&flag_ids)
        .bind(ch)
        .fetch_all(&state.db)
        .await?
    } else {
        sqlx::query_as::<_, FlagTargetingRule>(
            "SELECT * FROM flag_targeting_rules WHERE flag_id = ANY($1) ORDER BY flag_id, priority",
        )
        .bind(&flag_ids)
        .fetch_all(&state.db)
        .await?
    };

    let mut rules_by_flag: std::collections::HashMap<i64, Vec<RuleDefinition>> =
        std::collections::HashMap::new();
    for rule in rules {
        rules_by_flag
            .entry(rule.flag_id)
            .or_default()
            .push(RuleDefinition {
                priority: rule.priority,
                rule_type: rule.rule_type,
                variant_value: rule.variant_value,
                rule_config: rule.rule_config,
            });
    }

    // Fetch variations
    let variations = sqlx::query_as::<_, FlagVariation>(
        "SELECT * FROM flag_variations WHERE flag_id = ANY($1) ORDER BY flag_id, sort_order",
    )
    .bind(&flag_ids)
    .fetch_all(&state.db)
    .await?;

    let mut variations_by_flag: std::collections::HashMap<i64, Vec<VariationDefinition>> =
        std::collections::HashMap::new();
    for v in variations {
        variations_by_flag
            .entry(v.flag_id)
            .or_default()
            .push(VariationDefinition {
                id: v.id,
                value: v.value,
                name: v.name,
            });
    }

    let definitions: Vec<FlagDefinition> = flags
        .into_iter()
        .filter_map(|f| {
            let (enabled, default_value) = if let Some(env) = env_settings.get(&f.id) {
                (env.enabled, env.default_value.clone())
            } else {
                (f.enabled, f.default_value.clone())
            };

            if !enabled {
                return None;
            }

            let flag_rules = rules_by_flag.remove(&f.id).unwrap_or_default();
            let flag_variations = variations_by_flag.remove(&f.id).unwrap_or_default();
            Some(FlagDefinition {
                key: f.key,
                flag_type: f.flag_type,
                default_value,
                enabled,
                rules: flag_rules,
                variations: flag_variations,
            })
        })
        .collect();

    Ok(Json(FlagPayload { flags: definitions }))
}

// ── Update variation ────────────────────────────────────────────────────

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PatchVariationRequest {
    pub value: Option<serde_json::Value>,
    pub name: Option<String>,
    pub description: Option<String>,
}

pub async fn handle_patch_variation(
    State(state): State<AppState>,
    auth: RequireAuth,
    Path((flag_id, variation_id)): Path<(i64, i64)>,
    Json(body): Json<PatchVariationRequest>,
) -> Result<impl IntoResponse, AppError> {
    auth.require_editor()?;
    let project_id = auth.require_project()?;

    // Verify flag belongs to project
    let flag_exists = sqlx::query_scalar::<_, bool>(
        "SELECT EXISTS(SELECT 1 FROM feature_flags WHERE project_id = $1 AND id = $2)",
    )
    .bind(project_id)
    .bind(flag_id)
    .fetch_one(&state.db)
    .await?;

    if !flag_exists {
        return Err(AppError::NotFound("Flag not found".into()));
    }

    let variation = sqlx::query_as::<_, FlagVariation>(
        "UPDATE flag_variations
         SET value = COALESCE($1, value),
             name = COALESCE($2, name),
             description = COALESCE($3, description)
         WHERE flag_id = $4 AND id = $5
         RETURNING *",
    )
    .bind(&body.value)
    .bind(&body.name)
    .bind(&body.description)
    .bind(flag_id)
    .bind(variation_id)
    .fetch_optional(&state.db)
    .await?
    .ok_or_else(|| AppError::NotFound("Variation not found".into()))?;

    record_audit(
        &state.db,
        &auth,
        "flag_variation.updated",
        "flag_variation",
        Some(variation.id),
        serde_json::json!({ "flagId": flag_id, "variationId": variation_id }),
    )
    .await;

    Ok(Json(variation))
}

// ── Flag evaluation tracking ─────────────────────────────────────────────

#[derive(Deserialize)]
pub struct EvalQuery {
    #[serde(default = "default_days")]
    pub days: i32,
    pub channel: Option<String>,
}

fn default_days() -> i32 {
    7
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EvaluationSummary {
    pub total: i64,
    pub daily: Vec<FlagEvaluationCount>,
    pub by_variation: Vec<FlagEvaluationVariationCount>,
    pub last_evaluated_at: Option<chrono::DateTime<chrono::Utc>>,
}

pub async fn handle_get_flag_evaluations(
    State(state): State<AppState>,
    auth: RequireAuth,
    Path(flag_id): Path<i64>,
    Query(params): Query<EvalQuery>,
) -> Result<impl IntoResponse, AppError> {
    let project_id = auth.require_project()?;

    // Verify flag belongs to project
    let flag_exists = sqlx::query_scalar::<_, bool>(
        "SELECT EXISTS(SELECT 1 FROM feature_flags WHERE project_id = $1 AND id = $2)",
    )
    .bind(project_id)
    .bind(flag_id)
    .fetch_one(&state.db)
    .await?;

    if !flag_exists {
        return Err(AppError::NotFound("Flag not found".into()));
    }

    let days = params.days.min(90).max(1);
    let since = chrono::Utc::now().date_naive() - chrono::Duration::days(days as i64);

    // Daily counts
    let daily = if let Some(ref channel) = params.channel {
        sqlx::query_as::<_, FlagEvaluationCount>(
            "SELECT date, SUM(count)::BIGINT AS total FROM flag_evaluation_counts \
             WHERE flag_id = $1 AND date >= $2 AND channel_name = $3 \
             GROUP BY date ORDER BY date",
        )
        .bind(flag_id)
        .bind(since)
        .bind(channel)
        .fetch_all(&state.db)
        .await?
    } else {
        sqlx::query_as::<_, FlagEvaluationCount>(
            "SELECT date, SUM(count)::BIGINT AS total FROM flag_evaluation_counts \
             WHERE flag_id = $1 AND date >= $2 \
             GROUP BY date ORDER BY date",
        )
        .bind(flag_id)
        .bind(since)
        .fetch_all(&state.db)
        .await?
    };

    // By variation
    let by_variation = if let Some(ref channel) = params.channel {
        sqlx::query_as::<_, FlagEvaluationVariationCount>(
            "SELECT fec.variation_id, fv.name AS variation_name, SUM(fec.count)::BIGINT AS total \
             FROM flag_evaluation_counts fec \
             LEFT JOIN flag_variations fv ON fv.id = fec.variation_id \
             WHERE fec.flag_id = $1 AND fec.date >= $2 AND fec.channel_name = $3 \
             GROUP BY fec.variation_id, fv.name ORDER BY total DESC",
        )
        .bind(flag_id)
        .bind(since)
        .bind(channel)
        .fetch_all(&state.db)
        .await?
    } else {
        sqlx::query_as::<_, FlagEvaluationVariationCount>(
            "SELECT fec.variation_id, fv.name AS variation_name, SUM(fec.count)::BIGINT AS total \
             FROM flag_evaluation_counts fec \
             LEFT JOIN flag_variations fv ON fv.id = fec.variation_id \
             WHERE fec.flag_id = $1 AND fec.date >= $2 \
             GROUP BY fec.variation_id, fv.name ORDER BY total DESC",
        )
        .bind(flag_id)
        .bind(since)
        .fetch_all(&state.db)
        .await?
    };

    let total: i64 = daily.iter().map(|d| d.total).sum();

    // Last evaluation timestamp (approximate from latest date with data)
    let last_evaluated_at = sqlx::query_scalar::<_, Option<chrono::DateTime<chrono::Utc>>>(
        "SELECT MAX(date::timestamp AT TIME ZONE 'UTC') FROM flag_evaluation_counts \
         WHERE flag_id = $1 AND count > 0",
    )
    .bind(flag_id)
    .fetch_one(&state.db)
    .await
    .unwrap_or(None);

    Ok(Json(EvaluationSummary {
        total,
        daily,
        by_variation,
        last_evaluated_at,
    }))
}

// ── Flag health ─────────────────────────────────────────────────────────

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FlagHealthSummary {
    pub status: String,
    pub error_rate: f64,
    pub error_rate_delta: f64,
    pub crash_free: f64,
    pub affected_devices: i64,
    pub last_checked: Option<chrono::DateTime<chrono::Utc>>,
}

#[derive(serde::Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct FlagVariationHealth {
    pub variation_name: String,
    pub runtime_version: String,
    pub channel: String,
    pub devices: i32,
    pub error_rate: f64,
    pub error_rate_delta: f64,
    pub crash_free: f64,
    pub status: String,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FlagHealthResponse {
    pub summary: FlagHealthSummary,
    pub variations: Vec<FlagVariationHealth>,
}

pub async fn handle_get_flag_health(
    State(state): State<AppState>,
    auth: RequireAuth,
    Path(flag_id): Path<i64>,
) -> Result<impl IntoResponse, AppError> {
    let project_id = auth.require_project()?;

    // Verify flag belongs to project
    let flag_exists = sqlx::query_scalar::<_, bool>(
        "SELECT EXISTS(SELECT 1 FROM feature_flags WHERE project_id = $1 AND id = $2)",
    )
    .bind(project_id)
    .bind(flag_id)
    .fetch_one(&state.db)
    .await?;

    if !flag_exists {
        return Err(AppError::NotFound("Flag not found".into()));
    }

    // Get latest health snapshots per variation+channel (most recent per combo)
    let variations = sqlx::query_as::<_, FlagVariationHealth>(
        "SELECT DISTINCT ON (h.variation_id, h.channel_name) \
            COALESCE(fv.name, 'default') AS variation_name, \
            h.runtime_version, \
            COALESCE(h.channel_name, '') AS channel, \
            h.devices, \
            h.error_rate, \
            h.error_rate_delta, \
            h.crash_free, \
            h.status \
         FROM flag_health_snapshots h \
         LEFT JOIN flag_variations fv ON fv.id = h.variation_id \
         WHERE h.flag_id = $1 \
         ORDER BY h.variation_id, h.channel_name, h.recorded_at DESC",
    )
    .bind(flag_id)
    .fetch_all(&state.db)
    .await?;

    if variations.is_empty() {
        // No health snapshots yet — return healthy default so the UI shows the setup prompt
        return Ok(Json(FlagHealthResponse {
            summary: FlagHealthSummary {
                status: "healthy".to_string(),
                error_rate: 0.0,
                error_rate_delta: 0.0,
                crash_free: 100.0,
                affected_devices: 0,
                last_checked: None,
            },
            variations: vec![],
        }));
    }

    // Compute summary from per-variation data
    let total_devices: i64 = variations.iter().map(|v| v.devices as i64).sum();
    let weighted_error_rate = if total_devices > 0 {
        variations
            .iter()
            .map(|v| v.error_rate * v.devices as f64)
            .sum::<f64>()
            / total_devices as f64
    } else {
        0.0
    };
    let weighted_error_delta = if total_devices > 0 {
        variations
            .iter()
            .map(|v| v.error_rate_delta * v.devices as f64)
            .sum::<f64>()
            / total_devices as f64
    } else {
        0.0
    };
    let weighted_crash_free = if total_devices > 0 {
        variations
            .iter()
            .map(|v| v.crash_free * v.devices as f64)
            .sum::<f64>()
            / total_devices as f64
    } else {
        100.0
    };
    let overall_status = if variations.iter().any(|v| v.status == "incident") {
        "incident"
    } else if variations.iter().any(|v| v.status == "degraded") {
        "degraded"
    } else {
        "healthy"
    };

    let last_checked = sqlx::query_scalar::<_, Option<chrono::DateTime<chrono::Utc>>>(
        "SELECT MAX(recorded_at) FROM flag_health_snapshots WHERE flag_id = $1",
    )
    .bind(flag_id)
    .fetch_one(&state.db)
    .await
    .unwrap_or(None);

    Ok(Json(FlagHealthResponse {
        summary: FlagHealthSummary {
            status: overall_status.to_string(),
            error_rate: (weighted_error_rate * 100.0).round() / 100.0,
            error_rate_delta: (weighted_error_delta * 100.0).round() / 100.0,
            crash_free: (weighted_crash_free * 100.0).round() / 100.0,
            affected_devices: total_devices,
            last_checked,
        },
        variations,
    }))
}

/// Batch report evaluations from SDKs
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReportEvaluationsRequest {
    pub evaluations: Vec<EvalReport>,
    pub context: Option<EvalContext>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EvalReport {
    pub flag_key: String,
    pub variation_value: Option<serde_json::Value>,
    pub count: i64,
    pub channel: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EvalContext {
    pub targeting_key: String,
    pub kind: Option<String>,
    pub name: Option<String>,
    pub attributes: Option<serde_json::Value>,
}

pub async fn handle_report_evaluations(
    State(state): State<AppState>,
    auth: RequireAuth,
    Json(body): Json<ReportEvaluationsRequest>,
) -> Result<impl IntoResponse, AppError> {
    let project_id = auth.require_project()?;
    let today = chrono::Utc::now().date_naive();

    // Upsert context if provided
    let context_id: Option<i64> = if let Some(ref ctx) = body.context {
        let kind = ctx.kind.as_deref().unwrap_or("user");
        let attrs = ctx.attributes.clone().unwrap_or(serde_json::json!({}));
        let id = sqlx::query_scalar::<_, i64>(
            "INSERT INTO flag_contexts (project_id, targeting_key, kind, name, attributes, evaluation_count) \
             VALUES ($1, $2, $3, $4, $5, $6) \
             ON CONFLICT (project_id, targeting_key, kind) \
             DO UPDATE SET name = COALESCE(EXCLUDED.name, flag_contexts.name), \
               attributes = EXCLUDED.attributes, \
               last_seen_at = NOW(), \
               evaluation_count = flag_contexts.evaluation_count + EXCLUDED.evaluation_count \
             RETURNING id",
        )
        .bind(project_id)
        .bind(&ctx.targeting_key)
        .bind(kind)
        .bind(&ctx.name)
        .bind(&attrs)
        .bind(body.evaluations.iter().map(|e| e.count).sum::<i64>())
        .fetch_one(&state.db)
        .await?;
        Some(id)
    } else {
        None
    };

    for eval in &body.evaluations {
        // Resolve flag id from key
        let flag = sqlx::query_as::<_, FeatureFlag>(
            "SELECT * FROM feature_flags WHERE project_id = $1 AND key = $2",
        )
        .bind(project_id)
        .bind(&eval.flag_key)
        .fetch_optional(&state.db)
        .await?;

        let flag = match flag {
            Some(f) => f,
            None => continue, // skip unknown flags
        };

        // Resolve variation_id from value
        let variation_id: Option<i64> = if let Some(ref val) = eval.variation_value {
            sqlx::query_scalar::<_, i64>(
                "SELECT id FROM flag_variations WHERE flag_id = $1 AND value = $2",
            )
            .bind(flag.id)
            .bind(val)
            .fetch_optional(&state.db)
            .await?
        } else {
            None
        };

        // Upsert count
        sqlx::query(
            "INSERT INTO flag_evaluation_counts (flag_id, variation_id, channel_name, date, count) \
             VALUES ($1, $2, $3, $4, $5) \
             ON CONFLICT (flag_id, variation_id, channel_name, date) \
             DO UPDATE SET count = flag_evaluation_counts.count + EXCLUDED.count",
        )
        .bind(flag.id)
        .bind(variation_id)
        .bind(&eval.channel)
        .bind(today)
        .bind(eval.count)
        .execute(&state.db)
        .await?;

        // Upsert context evaluation record
        if let Some(ctx_id) = context_id {
            sqlx::query(
                "INSERT INTO flag_context_evaluations (context_id, flag_id, variation_value, channel_name, evaluation_count) \
                 VALUES ($1, $2, $3, $4, $5) \
                 ON CONFLICT (context_id, flag_id, channel_name) \
                 DO UPDATE SET variation_value = EXCLUDED.variation_value, \
                   last_evaluated_at = NOW(), \
                   evaluation_count = flag_context_evaluations.evaluation_count + EXCLUDED.evaluation_count",
            )
            .bind(ctx_id)
            .bind(flag.id)
            .bind(&eval.variation_value)
            .bind(&eval.channel)
            .bind(eval.count)
            .execute(&state.db)
            .await?;
        }
    }

    Ok(StatusCode::NO_CONTENT)
}
