use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;

// -- Request models --

#[derive(Deserialize)]
pub struct ManifestQueryParams {
    pub platform: Option<String>,
    #[serde(rename = "runtime-version")]
    pub runtime_version: Option<String>,
}

// -- Database models --

#[derive(FromRow, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Project {
    pub id: i64,
    pub uuid: uuid::Uuid,
    pub name: String,
    pub slug: String,
    pub created_at: DateTime<Utc>,
}

#[derive(FromRow, Clone)]
pub struct Update {
    pub id: i64,
    pub project_id: Option<i64>,
    pub runtime_version: String,
    pub platform: String,
    pub update_uuid: String,
    pub metadata: serde_json::Value,
    pub expo_config: serde_json::Value,
    pub is_rollback: bool,
    pub channel: String,
    pub rollout_percentage: i32,
    pub is_critical: bool,
    pub is_enabled: bool,
    pub release_message: String,
    pub created_at: DateTime<Utc>,
    pub build_id: Option<i64>,
    pub group_id: Option<String>,
    pub rollback_to_update_id: Option<i64>,
    pub runtime_fingerprint: Option<String>,
    pub branch_name: Option<String>,
}

#[derive(FromRow, Clone)]
pub struct Asset {
    pub id: i64,
    pub update_id: i64,
    pub s3_key: String,
    pub hash_sha256: String,
    pub hash_md5: String,
    pub file_extension: String,
    pub content_type: String,
    pub is_launch_asset: bool,
    pub file_size: Option<i64>,
}

#[derive(FromRow, Clone)]
pub struct Build {
    pub id: i64,
    pub project_id: Option<i64>,
    pub build_uuid: String,
    pub runtime_version: String,
    pub platform: String,
    pub expo_config: serde_json::Value,
    pub git_commit_hash: Option<String>,
    pub git_branch: Option<String>,
    pub ci_run_url: Option<String>,
    pub message: String,
    pub created_at: DateTime<Utc>,
    pub runtime_fingerprint: Option<String>,
}

#[derive(FromRow, Clone)]
pub struct BuildAsset {
    pub id: i64,
    pub build_id: i64,
    pub s3_key: String,
    pub hash_sha256: String,
    pub hash_md5: String,
    pub file_extension: String,
    pub content_type: String,
    pub is_launch_asset: bool,
    pub file_size: Option<i64>,
}

#[derive(FromRow, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AuditLogEntry {
    pub id: i64,
    pub action: String,
    pub entity_type: String,
    pub entity_id: Option<i64>,
    pub details: serde_json::Value,
    pub created_at: DateTime<Utc>,
    pub actor_type: Option<String>,
    pub actor_name: Option<String>,
}

#[derive(FromRow, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WebhookConfig {
    pub id: i64,
    pub project_id: Option<i64>,
    pub url: String,
    pub events: Vec<String>,
    pub is_active: bool,
    pub secret: Option<String>,
    pub created_at: DateTime<Utc>,
}

#[derive(FromRow, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WebhookDelivery {
    pub id: i64,
    pub webhook_id: i64,
    pub event: String,
    pub payload: serde_json::Value,
    pub status: String,
    pub http_status: Option<i32>,
    pub response_body: Option<String>,
    pub error_message: Option<String>,
    pub attempt: i32,
    pub max_attempts: i32,
    pub next_retry_at: Option<DateTime<Utc>>,
    pub created_at: DateTime<Utc>,
    pub completed_at: Option<DateTime<Utc>>,
}

#[derive(FromRow, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Branch {
    pub id: i64,
    pub project_id: Option<i64>,
    pub name: String,
    pub created_at: DateTime<Utc>,
}

#[derive(FromRow, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Channel {
    pub id: i64,
    pub project_id: Option<i64>,
    pub name: String,
    pub branch_name: String,
    pub rollout_branch_name: Option<String>,
    pub rollout_percentage: i32,
    pub created_at: DateTime<Utc>,
    pub min_runtime_version: Option<String>,
}

#[derive(FromRow, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UserOverride {
    pub id: i64,
    pub project_id: i64,
    pub user_id: String,
    pub branch_name: String,
    pub note: Option<String>,
    pub created_at: DateTime<Utc>,
}

#[derive(FromRow, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FeatureFlag {
    pub id: i64,
    pub project_id: i64,
    pub name: String,
    pub key: String,
    pub flag_type: String,
    pub default_value: serde_json::Value,
    pub enabled: bool,
    pub description: Option<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub created_by_name: Option<String>,
}

#[derive(FromRow, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FlagTargetingRule {
    pub id: i64,
    pub flag_id: i64,
    pub priority: i32,
    pub rule_type: String,
    pub variant_value: serde_json::Value,
    pub rule_config: serde_json::Value,
    pub created_at: DateTime<Utc>,
    pub channel_name: Option<String>,
}

#[derive(FromRow, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FlagEnvSetting {
    pub id: i64,
    pub flag_id: i64,
    pub channel_name: String,
    pub enabled: bool,
    pub default_value: serde_json::Value,
    pub created_at: DateTime<Utc>,
}

#[derive(FromRow, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FlagVariation {
    pub id: i64,
    pub flag_id: i64,
    pub value: serde_json::Value,
    pub name: Option<String>,
    pub description: Option<String>,
    pub sort_order: i32,
    pub created_at: DateTime<Utc>,
}

#[derive(FromRow, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FlagEvaluationCount {
    pub date: chrono::NaiveDate,
    pub total: i64,
}

#[derive(FromRow, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FlagEvaluationVariationCount {
    pub variation_id: Option<i64>,
    pub variation_name: Option<String>,
    pub total: i64,
}

#[derive(FromRow, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FlagContext {
    pub id: i64,
    pub project_id: i64,
    pub targeting_key: String,
    pub kind: String,
    pub name: Option<String>,
    pub attributes: serde_json::Value,
    pub first_seen_at: DateTime<Utc>,
    pub last_seen_at: DateTime<Utc>,
    pub evaluation_count: i64,
}

#[derive(FromRow, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FlagContextEvaluation {
    pub id: i64,
    pub context_id: i64,
    pub flag_id: i64,
    pub variation_value: Option<serde_json::Value>,
    pub channel_name: Option<String>,
    pub last_evaluated_at: DateTime<Utc>,
    pub evaluation_count: i64,
}

#[derive(FromRow, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FlagContextEvaluationWithFlag {
    pub id: i64,
    pub context_id: i64,
    pub flag_id: i64,
    pub flag_key: String,
    pub flag_name: String,
    pub variation_value: Option<serde_json::Value>,
    pub channel_name: Option<String>,
    pub last_evaluated_at: DateTime<Utc>,
    pub evaluation_count: i64,
}

#[derive(FromRow, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RolloutPolicy {
    pub id: i64,
    pub project_id: i64,
    pub name: String,
    pub description: String,
    pub channel: String,
    pub is_active: bool,
    pub health_check_url: Option<String>,
    pub health_threshold_ms: Option<i32>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(FromRow, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RolloutPolicyStage {
    pub id: i64,
    pub policy_id: i64,
    pub stage_order: i32,
    pub percentage: i32,
    pub duration_minutes: i32,
    pub min_devices: i32,
}

#[derive(FromRow, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RolloutStageThreshold {
    pub id: i64,
    pub stage_id: i64,
    pub metric_type: String,
    pub operator: String,
    pub value: f64,
    pub action: String,
}

#[derive(FromRow, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RolloutExecution {
    pub id: i64,
    pub project_id: i64,
    pub policy_id: i64,
    pub update_group_id: String,
    pub channel: String,
    pub current_stage: i32,
    pub status: String,
    pub started_at: DateTime<Utc>,
    pub completed_at: Option<DateTime<Utc>>,
    pub paused_at: Option<DateTime<Utc>>,
    pub last_evaluated_at: Option<DateTime<Utc>>,
    pub rollback_reason: Option<String>,
}

#[derive(FromRow, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RolloutStageHistory {
    pub id: i64,
    pub execution_id: i64,
    pub stage_order: i32,
    pub percentage: i32,
    pub started_at: DateTime<Utc>,
    pub completed_at: Option<DateTime<Utc>>,
    pub health_status: Option<String>,
    pub gate_reason: Option<String>,
}

#[derive(FromRow, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Segment {
    pub id: i64,
    pub project_id: i64,
    pub key: String,
    pub name: String,
    pub description: String,
    pub match_type: String,
    pub estimated_devices: i32,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(FromRow, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SegmentCondition {
    pub id: i64,
    pub segment_id: i64,
    pub attribute: String,
    pub operator: String,
    pub values_json: serde_json::Value,
    pub sort_order: i32,
}

// -- Response models --

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ManifestExtra {
    pub expo_client: serde_json::Value,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AssetMetadata {
    pub hash: String,
    pub key: String,
    pub file_extension: String,
    pub content_type: String,
    pub url: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ManifestBody {
    pub id: String,
    pub created_at: String,
    pub runtime_version: String,
    pub assets: Vec<AssetMetadata>,
    pub launch_asset: AssetMetadata,
    pub metadata: serde_json::Value,
    pub extra: ManifestExtra,
}

#[derive(Serialize)]
#[serde(tag = "type")]
pub enum Directive {
    #[serde(rename = "rollBackToEmbedded")]
    RollBack { parameters: RollbackParameters },
    #[serde(rename = "noUpdateAvailable")]
    NoUpdate,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RollbackParameters {
    pub commit_time: String,
}
