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
