use aws_sdk_s3::primitives::ByteStream;
use axum::extract::{Multipart, Path, State};
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::Json;
use base64::Engine;
use md5::Md5;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

use crate::auth::RequireAuth;
use crate::errors::AppError;
use crate::handlers::audit::record_audit;
use crate::routes::AppState;

// -- Upload build from CI/CD --

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BuildResponse {
    pub id: i64,
    pub build_uuid: String,
}

pub async fn handle_upload_build(
    State(state): State<AppState>,
    auth: RequireAuth,
    mut multipart: Multipart,
) -> Result<impl IntoResponse, AppError> {
    let project_id = auth.require_project()?;

    let mut runtime_version: Option<String> = None;
    let mut platform: Option<String> = None;
    let mut expo_config: serde_json::Value = serde_json::json!({});
    let mut git_commit_hash: Option<String> = None;
    let mut git_branch: Option<String> = None;
    let mut ci_run_url: Option<String> = None;
    let mut message = String::new();
    let mut runtime_fingerprint: Option<String> = None;

    struct PendingAsset {
        file_name: String,
        content_type: String,
        data: axum::body::Bytes,
    }
    let mut pending_assets: Vec<PendingAsset> = Vec::new();

    while let Some(field) = multipart
        .next_field()
        .await
        .map_err(|e| AppError::BadRequest(e.to_string()))?
    {
        let name = field.name().unwrap_or("").to_string();

        match name.as_str() {
            "runtimeVersion" => {
                runtime_version = Some(
                    field
                        .text()
                        .await
                        .map_err(|e| AppError::BadRequest(e.to_string()))?,
                );
            }
            "platform" => {
                platform = Some(
                    field
                        .text()
                        .await
                        .map_err(|e| AppError::BadRequest(e.to_string()))?,
                );
            }
            "expoConfig" => {
                let text = field
                    .text()
                    .await
                    .map_err(|e| AppError::BadRequest(e.to_string()))?;
                expo_config = serde_json::from_str(&text)
                    .map_err(|e| AppError::BadRequest(format!("Invalid expoConfig JSON: {e}")))?;
            }
            "gitCommitHash" => {
                git_commit_hash = Some(
                    field
                        .text()
                        .await
                        .map_err(|e| AppError::BadRequest(e.to_string()))?,
                );
            }
            "gitBranch" => {
                git_branch = Some(
                    field
                        .text()
                        .await
                        .map_err(|e| AppError::BadRequest(e.to_string()))?,
                );
            }
            "ciRunUrl" => {
                ci_run_url = Some(
                    field
                        .text()
                        .await
                        .map_err(|e| AppError::BadRequest(e.to_string()))?,
                );
            }
            "message" => {
                message = field
                    .text()
                    .await
                    .map_err(|e| AppError::BadRequest(e.to_string()))?;
            }
            "runtimeFingerprint" => {
                runtime_fingerprint = Some(
                    field
                        .text()
                        .await
                        .map_err(|e| AppError::BadRequest(e.to_string()))?,
                );
            }
            _ => {
                // Treat as a file upload
                let file_name = field
                    .file_name()
                    .ok_or_else(|| AppError::BadRequest(format!("Field '{name}' missing filename")))?
                    .to_string();
                let content_type = field
                    .content_type()
                    .unwrap_or("application/octet-stream")
                    .to_string();
                let data = field
                    .bytes()
                    .await
                    .map_err(|e| AppError::BadRequest(e.to_string()))?;
                pending_assets.push(PendingAsset {
                    file_name,
                    content_type,
                    data,
                });
            }
        }
    }

    let runtime_version =
        runtime_version.ok_or_else(|| AppError::BadRequest("runtimeVersion is required".into()))?;
    let platform =
        platform.ok_or_else(|| AppError::BadRequest("platform is required".into()))?;

    if platform != "ios" && platform != "android" {
        return Err(AppError::BadRequest(
            "platform must be 'ios' or 'android'".into(),
        ));
    }

    if pending_assets.is_empty() {
        return Err(AppError::BadRequest(
            "At least one asset file is required".into(),
        ));
    }

    let build_uuid = uuid::Uuid::new_v4().to_string();
    let mut tx = state.db.begin().await?;

    let build_id = sqlx::query_scalar::<_, i64>(
        "INSERT INTO builds (build_uuid, runtime_version, platform, expo_config, git_commit_hash, git_branch, ci_run_url, message, runtime_fingerprint, project_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         RETURNING id",
    )
    .bind(&build_uuid)
    .bind(&runtime_version)
    .bind(&platform)
    .bind(&expo_config)
    .bind(&git_commit_hash)
    .bind(&git_branch)
    .bind(&ci_run_url)
    .bind(&message)
    .bind(&runtime_fingerprint)
    .bind(project_id)
    .fetch_one(&mut *tx)
    .await?;

    for asset in &pending_assets {
        let sha256_hash = {
            let hash = Sha256::digest(&asset.data);
            base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(hash)
        };
        let md5_hash = {
            let hash = Md5::digest(&asset.data);
            format!("{:x}", hash)
        };
        let file_extension = asset
            .file_name
            .rsplit_once('.')
            .map(|(_, ext)| format!(".{ext}"))
            .unwrap_or_default();

        let s3_key = format!("builds/{}/{}/{}", &build_uuid, &md5_hash, &asset.file_name);

        // Deduplicate: skip upload if this content-addressed key already exists in S3
        let already_exists = state
            .s3
            .head_object()
            .bucket(&state.config.s3_bucket)
            .key(&s3_key)
            .send()
            .await
            .is_ok();

        if !already_exists {
            state
                .s3
                .put_object()
                .bucket(&state.config.s3_bucket)
                .key(&s3_key)
                .body(ByteStream::from(asset.data.to_vec()))
                .content_type(&asset.content_type)
                .send()
                .await
                .map_err(|e| AppError::Internal(format!("S3 upload failed: {e}")))?;
        }

        // Auto-detect launch asset: first .js file
        let is_launch_asset = asset.content_type == "application/javascript"
            || asset.file_name.ends_with(".js");

        let file_size = asset.data.len() as i64;

        sqlx::query(
            "INSERT INTO build_assets (build_id, s3_key, hash_sha256, hash_md5, file_extension, content_type, is_launch_asset, file_size)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)",
        )
        .bind(build_id)
        .bind(&s3_key)
        .bind(&sha256_hash)
        .bind(&md5_hash)
        .bind(&file_extension)
        .bind(&asset.content_type)
        .bind(is_launch_asset)
        .bind(file_size)
        .execute(&mut *tx)
        .await?;
    }

    tx.commit().await?;

    record_audit(
        &state.db,
        &auth,
        "build.uploaded",
        "build",
        Some(build_id),
        serde_json::json!({
            "runtime_version": runtime_version,
            "platform": platform,
            "git_branch": git_branch,
        }),
    )
    .await;

    crate::handlers::webhooks::fire_webhooks(
        &state.db,
        "build.uploaded",
        serde_json::json!({
            "build_id": build_id,
            "build_uuid": build_uuid,
            "runtime_version": runtime_version,
            "platform": platform,
            "git_branch": git_branch,
        }),
    )
    .await;

    Ok((
        StatusCode::CREATED,
        Json(BuildResponse {
            id: build_id,
            build_uuid,
        }),
    ))
}

// -- List builds --

#[derive(Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct BuildListItem {
    pub id: i64,
    pub build_uuid: String,
    pub runtime_version: String,
    pub platform: String,
    pub git_commit_hash: Option<String>,
    pub git_branch: Option<String>,
    pub ci_run_url: Option<String>,
    pub message: String,
    pub created_at: chrono::DateTime<chrono::Utc>,
    pub asset_count: i64,
    pub is_published: bool,
}

pub async fn handle_list_builds(
    State(state): State<AppState>,
    auth: RequireAuth,
) -> Result<impl IntoResponse, AppError> {
    let project_id = auth.require_project()?;

    let builds = sqlx::query_as::<_, BuildListItem>(
        "SELECT b.id, b.build_uuid, b.runtime_version, b.platform,
                b.git_commit_hash, b.git_branch, b.ci_run_url, b.message,
                b.created_at,
                COUNT(ba.id) AS asset_count,
                EXISTS(SELECT 1 FROM updates u WHERE u.build_id = b.id) AS is_published
         FROM builds b
         LEFT JOIN build_assets ba ON ba.build_id = b.id
         WHERE b.project_id = $1
         GROUP BY b.id
         ORDER BY b.created_at DESC
         LIMIT 100",
    )
    .bind(project_id)
    .fetch_all(&state.db)
    .await?;

    Ok(Json(builds))
}

// -- Publish a build as an update --

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PublishBuildRequest {
    #[serde(default = "default_channel")]
    pub channel: String,
    #[serde(default = "default_rollout")]
    pub rollout_percentage: i32,
    #[serde(default)]
    pub is_critical: bool,
    #[serde(default)]
    pub release_message: String,
    pub group_id: Option<String>,
}

fn default_channel() -> String {
    "production".to_string()
}

fn default_rollout() -> i32 {
    100
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PublishBuildResponse {
    pub update_id: i64,
    pub update_uuid: String,
    pub group_id: String,
}

pub async fn handle_publish_build(
    State(state): State<AppState>,
    auth: RequireAuth,
    Path(build_id): Path<i64>,
    Json(body): Json<PublishBuildRequest>,
) -> Result<impl IntoResponse, AppError> {
    let project_id = auth.require_project()?;

    if !(0..=100).contains(&body.rollout_percentage) {
        return Err(AppError::BadRequest(
            "rolloutPercentage must be between 0 and 100".into(),
        ));
    }

    // Fetch the build
    let build = sqlx::query_as::<_, crate::models::Build>(
        "SELECT * FROM builds WHERE id = $1 AND project_id = $2",
    )
    .bind(build_id)
    .bind(project_id)
    .fetch_optional(&state.db)
    .await?
    .ok_or_else(|| AppError::NotFound("Build not found".into()))?;

    // Fetch build assets
    let build_assets = sqlx::query_as::<_, crate::models::BuildAsset>(
        "SELECT * FROM build_assets WHERE build_id = $1",
    )
    .bind(build_id)
    .fetch_all(&state.db)
    .await?;

    if build_assets.is_empty() {
        return Err(AppError::BadRequest("Build has no assets".into()));
    }

    let update_uuid = uuid::Uuid::new_v4().to_string();
    let mut tx = state.db.begin().await?;

    // Auto-generate group_id if not provided
    let group_id = body
        .group_id
        .clone()
        .unwrap_or_else(|| uuid::Uuid::new_v4().to_string());

    // Resolve channel → branch
    let branch_name = sqlx::query_scalar::<_, String>(
        "SELECT branch_name FROM channels WHERE name = $1 AND project_id = $2",
    )
    .bind(&body.channel)
    .bind(project_id)
    .fetch_optional(&mut *tx)
    .await?
    .unwrap_or_else(|| body.channel.clone());

    let update_id = sqlx::query_scalar::<_, i64>(
        "INSERT INTO updates (runtime_version, platform, update_uuid, metadata, expo_config, is_rollback, channel, rollout_percentage, is_critical, release_message, build_id, group_id, runtime_fingerprint, branch_name, project_id)
         VALUES ($1, $2, $3, $4, $5, FALSE, $6, $7, $8, $9, $10, $11, $12, $13, $14)
         RETURNING id",
    )
    .bind(&build.runtime_version)
    .bind(&build.platform)
    .bind(&update_uuid)
    .bind(serde_json::json!({}))
    .bind(&build.expo_config)
    .bind(&body.channel)
    .bind(body.rollout_percentage)
    .bind(body.is_critical)
    .bind(&body.release_message)
    .bind(build_id)
    .bind(&group_id)
    .bind(&build.runtime_fingerprint)
    .bind(&branch_name)
    .bind(project_id)
    .fetch_one(&mut *tx)
    .await?;

    for asset in &build_assets {
        sqlx::query(
            "INSERT INTO assets (update_id, s3_key, hash_sha256, hash_md5, file_extension, content_type, is_launch_asset, file_size)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)",
        )
        .bind(update_id)
        .bind(&asset.s3_key)
        .bind(&asset.hash_sha256)
        .bind(&asset.hash_md5)
        .bind(&asset.file_extension)
        .bind(&asset.content_type)
        .bind(asset.is_launch_asset)
        .bind(asset.file_size)
        .execute(&mut *tx)
        .await?;
    }

    tx.commit().await?;

    record_audit(
        &state.db,
        &auth,
        "build.published",
        "build",
        Some(build_id),
        serde_json::json!({
            "update_id": update_id,
            "channel": body.channel,
            "rollout_percentage": body.rollout_percentage,
            "runtime_version": build.runtime_version,
            "platform": build.platform,
        }),
    )
    .await;

    // Fire webhooks
    crate::handlers::webhooks::fire_webhooks(
        &state.db,
        "build.published",
        serde_json::json!({
            "build_id": build_id,
            "update_id": update_id,
            "update_uuid": update_uuid,
            "group_id": group_id,
            "channel": body.channel,
            "runtime_version": build.runtime_version,
            "platform": build.platform,
        }),
    )
    .await;

    Ok((
        StatusCode::CREATED,
        Json(PublishBuildResponse {
            update_id,
            update_uuid,
            group_id,
        }),
    ))
}

// -- Delete build --

pub async fn handle_delete_build(
    State(state): State<AppState>,
    auth: RequireAuth,
    Path(build_id): Path<i64>,
) -> Result<impl IntoResponse, AppError> {
    let project_id = auth.require_project()?;

    // Check if any updates reference this build
    let has_updates = sqlx::query_scalar::<_, bool>(
        "SELECT EXISTS(SELECT 1 FROM updates WHERE build_id = $1 AND project_id = $2)",
    )
    .bind(build_id)
    .bind(project_id)
    .fetch_one(&state.db)
    .await?;

    if has_updates {
        return Err(AppError::BadRequest(
            "Cannot delete build: it has published updates. Delete the updates first.".into(),
        ));
    }

    // Fetch build assets for S3 cleanup
    let build_assets = sqlx::query_as::<_, crate::models::BuildAsset>(
        "SELECT ba.* FROM build_assets ba
         JOIN builds b ON b.id = ba.build_id
         WHERE ba.build_id = $1 AND b.project_id = $2",
    )
    .bind(build_id)
    .bind(project_id)
    .fetch_all(&state.db)
    .await?;

    // Delete the build (cascades to build_assets)
    let result = sqlx::query("DELETE FROM builds WHERE id = $1 AND project_id = $2")
        .bind(build_id)
        .bind(project_id)
        .execute(&state.db)
        .await?;

    if result.rows_affected() == 0 {
        return Err(AppError::NotFound("Build not found".into()));
    }

    // Clean up orphaned S3 objects
    for asset in &build_assets {
        let still_referenced = sqlx::query_scalar::<_, bool>(
            "SELECT EXISTS(
                SELECT 1 FROM assets WHERE s3_key = $1
                UNION ALL
                SELECT 1 FROM build_assets WHERE s3_key = $1
            )",
        )
        .bind(&asset.s3_key)
        .fetch_one(&state.db)
        .await
        .unwrap_or(true);

        if !still_referenced {
            let _ = state
                .s3
                .delete_object()
                .bucket(&state.config.s3_bucket)
                .key(&asset.s3_key)
                .send()
                .await;
        }
    }

    record_audit(
        &state.db,
        &auth,
        "build.deleted",
        "build",
        Some(build_id),
        serde_json::json!({}),
    )
    .await;

    crate::handlers::webhooks::fire_webhooks(
        &state.db,
        "build.deleted",
        serde_json::json!({ "build_id": build_id }),
    )
    .await;

    Ok(StatusCode::NO_CONTENT)
}
