use aws_sdk_s3::presigning::PresigningConfig;
use aws_sdk_s3::primitives::ByteStream;
use axum::extract::{Multipart, Path, Query, State};
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

// -- Asset upload --

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UploadAssetResponse {
    pub s3_key: String,
    pub hash_sha256: String,
    pub hash_md5: String,
    pub content_type: String,
    pub file_extension: String,
    pub file_size: i64,
}

pub async fn handle_upload_asset(
    State(state): State<AppState>,
    auth: RequireAuth,
    mut multipart: Multipart,
) -> Result<impl IntoResponse, AppError> {
    auth.require_editor()?;
    let mut results: Vec<UploadAssetResponse> = Vec::new();

    while let Some(field) = multipart
        .next_field()
        .await
        .map_err(|e| AppError::BadRequest(e.to_string()))?
    {
        let file_name = field
            .file_name()
            .ok_or_else(|| AppError::BadRequest("Missing file name".into()))?
            .to_string();

        let content_type = field
            .content_type()
            .unwrap_or("application/octet-stream")
            .to_string();

        let data = field
            .bytes()
            .await
            .map_err(|e| AppError::BadRequest(e.to_string()))?;

        let sha256_hash = {
            let hash = Sha256::digest(&data);
            base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(hash)
        };

        let md5_hash = {
            let hash = Md5::digest(&data);
            format!("{:x}", hash)
        };

        let file_extension = file_name
            .rsplit_once('.')
            .map(|(_, ext)| format!(".{ext}"))
            .unwrap_or_default();

        let s3_key = format!("assets/{}/{}", &md5_hash, &file_name);

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
                .body(ByteStream::from(data.to_vec()))
                .content_type(&content_type)
                .send()
                .await
                .map_err(|e| AppError::Internal(format!("S3 upload failed: {e}")))?;
        }

        let file_size = data.len() as i64;

        results.push(UploadAssetResponse {
            s3_key,
            hash_sha256: sha256_hash,
            hash_md5: md5_hash,
            content_type,
            file_extension,
            file_size,
        });
    }

    if results.is_empty() {
        return Err(AppError::BadRequest("No files uploaded".into()));
    }

    Ok((StatusCode::OK, Json(results)))
}

// -- Presigned upload URL --

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PresignUploadRequest {
    pub file_name: String,
    pub content_type: String,
    /// MD5 hash of the file (hex). Used as part of the content-addressed S3 key.
    pub hash_md5: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PresignUploadResponse {
    pub upload_url: String,
    pub s3_key: String,
    /// True if this asset already exists in S3 (no upload needed)
    pub already_exists: bool,
}

pub async fn handle_presign_upload(
    State(state): State<AppState>,
    auth: RequireAuth,
    Json(body): Json<PresignUploadRequest>,
) -> Result<impl IntoResponse, AppError> {
    auth.require_editor()?;
    let s3_key = format!("assets/{}/{}", &body.hash_md5, &body.file_name);

    // Check if already exists (dedup)
    let already_exists = state
        .s3
        .head_object()
        .bucket(&state.config.s3_bucket)
        .key(&s3_key)
        .send()
        .await
        .is_ok();

    if already_exists {
        return Ok(Json(PresignUploadResponse {
            upload_url: String::new(),
            s3_key,
            already_exists: true,
        }));
    }

    let presign_config = PresigningConfig::builder()
        .expires_in(std::time::Duration::from_secs(3600))
        .build()
        .map_err(|e| AppError::Internal(format!("Presigning config error: {e}")))?;

    let presigned = state
        .s3
        .put_object()
        .bucket(&state.config.s3_bucket)
        .key(&s3_key)
        .content_type(&body.content_type)
        .presigned(presign_config)
        .await
        .map_err(|e| AppError::Internal(format!("Failed to generate presigned URL: {e}")))?;

    Ok(Json(PresignUploadResponse {
        upload_url: presigned.uri().to_string(),
        s3_key,
        already_exists: false,
    }))
}

// -- List updates --

#[derive(Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct UpdateListItem {
    pub id: i64,
    pub runtime_version: String,
    pub platform: String,
    pub update_uuid: String,
    pub is_rollback: bool,
    pub channel: String,
    pub rollout_percentage: i32,
    pub is_critical: bool,
    pub is_enabled: bool,
    pub release_message: String,
    pub expo_config: serde_json::Value,
    pub created_at: chrono::DateTime<chrono::Utc>,
    pub asset_count: i64,
    pub total_size: i64,
    pub group_id: Option<String>,
    pub rollback_to_update_id: Option<i64>,
    pub branch_name: Option<String>,
    pub total_downloads: i64,
    pub unique_devices: i64,
    pub runtime_fingerprint: Option<String>,
    pub git_commit_hash: Option<String>,
    pub git_branch: Option<String>,
    pub ci_run_url: Option<String>,
    pub build_message: Option<String>,
}

#[derive(Deserialize)]
pub struct UpdateListQuery {
    /// Filter by platform (ios/android)
    pub platform: Option<String>,
    /// Filter by channel name
    pub channel: Option<String>,
    /// Filter by branch name
    pub branch: Option<String>,
    /// Filter by runtime version
    pub runtime_version: Option<String>,
    /// Search in release message, git commit hash, or git branch
    pub search: Option<String>,
    /// Max results (default 100, max 500)
    #[serde(default = "default_list_limit")]
    pub limit: i64,
    /// Offset for pagination
    #[serde(default)]
    pub offset: i64,
}

fn default_list_limit() -> i64 {
    100
}

pub async fn handle_list_updates(
    State(state): State<AppState>,
    auth: RequireAuth,
    Query(params): Query<UpdateListQuery>,
) -> Result<impl IntoResponse, AppError> {
    let project_id = auth.require_project()?;
    let limit = params.limit.min(500);
    let offset = params.offset.max(0);

    // Build dynamic WHERE clause
    // $1 is always project_id
    let mut conditions: Vec<String> = vec!["u.project_id = $1".to_string()];
    let mut bind_idx = 1u32;

    // We'll collect bind values and apply them in order
    let mut platform_val = None;
    let mut channel_val = None;
    let mut branch_val = None;
    let mut runtime_val = None;
    let mut search_val = None;

    if let Some(ref p) = params.platform {
        bind_idx += 1;
        conditions.push(format!("u.platform = ${bind_idx}"));
        platform_val = Some(p.clone());
    }
    if let Some(ref c) = params.channel {
        bind_idx += 1;
        conditions.push(format!("u.channel = ${bind_idx}"));
        channel_val = Some(c.clone());
    }
    if let Some(ref b) = params.branch {
        bind_idx += 1;
        conditions.push(format!("u.branch_name = ${bind_idx}"));
        branch_val = Some(b.clone());
    }
    if let Some(ref rv) = params.runtime_version {
        bind_idx += 1;
        conditions.push(format!("(u.runtime_version = ${bind_idx} OR u.runtime_fingerprint = ${bind_idx})"));
        runtime_val = Some(rv.clone());
    }
    if let Some(ref s) = params.search {
        bind_idx += 1;
        let pat_idx = bind_idx;
        conditions.push(format!(
            "(u.release_message ILIKE ${pat_idx} OR b.git_commit_hash ILIKE ${pat_idx} OR b.git_branch ILIKE ${pat_idx} OR u.update_uuid ILIKE ${pat_idx})"
        ));
        search_val = Some(format!("%{s}%"));
    }

    let where_clause = format!("WHERE {}", conditions.join(" AND "));

    let limit_idx = bind_idx + 1;
    let offset_idx = bind_idx + 2;

    let sql = format!(
        "SELECT u.id, u.runtime_version, u.platform, u.update_uuid, u.is_rollback,
                u.channel, u.rollout_percentage, u.is_critical, u.is_enabled, u.release_message,
                u.expo_config, u.created_at,
                COUNT(DISTINCT a.id) AS asset_count,
                COALESCE(SUM(a.file_size), 0)::BIGINT AS total_size,
                u.group_id, u.rollback_to_update_id, u.branch_name,
                COALESCE(an.total_downloads, 0) AS total_downloads,
                COALESCE(an.unique_devices, 0) AS unique_devices,
                u.runtime_fingerprint,
                b.git_commit_hash,
                b.git_branch,
                b.ci_run_url,
                b.message AS build_message
         FROM updates u
         LEFT JOIN assets a ON a.update_id = u.id
         LEFT JOIN builds b ON b.id = u.build_id
         LEFT JOIN LATERAL (
             SELECT COUNT(*) AS total_downloads, COUNT(DISTINCT device_id) AS unique_devices
             FROM update_analytics WHERE update_id = u.id
         ) an ON TRUE
         {where_clause}
         GROUP BY u.id, u.group_id, u.rollback_to_update_id, an.total_downloads, an.unique_devices,
                  u.runtime_fingerprint, b.git_commit_hash, b.git_branch, b.ci_run_url, b.message
         ORDER BY u.created_at DESC
         LIMIT ${limit_idx} OFFSET ${offset_idx}"
    );

    let mut query = sqlx::query_as::<_, UpdateListItem>(&sql);

    // Bind in the same order as the placeholders
    query = query.bind(project_id);
    if let Some(ref v) = platform_val { query = query.bind(v); }
    if let Some(ref v) = channel_val { query = query.bind(v); }
    if let Some(ref v) = branch_val { query = query.bind(v); }
    if let Some(ref v) = runtime_val { query = query.bind(v); }
    if let Some(ref v) = search_val { query = query.bind(v); }
    query = query.bind(limit).bind(offset);

    let updates = query.fetch_all(&state.db).await?;

    Ok(Json(updates))
}

// -- Create update --

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateUpdateRequest {
    pub runtime_version: String,
    pub platform: String,
    pub expo_config: serde_json::Value,
    pub is_rollback: bool,
    pub assets: Vec<CreateAssetRequest>,
    #[serde(default = "default_channel")]
    pub channel: String,
    #[serde(default = "default_rollout")]
    pub rollout_percentage: i32,
    #[serde(default)]
    pub is_critical: bool,
    #[serde(default)]
    pub release_message: String,
    #[serde(default)]
    pub linked_flags: Vec<LinkedFlagOverride>,
}

#[derive(Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct LinkedFlagOverride {
    pub flag_id: i64,
    pub enabled: bool,
}

fn default_channel() -> String {
    "production".to_string()
}

fn default_rollout() -> i32 {
    100
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateAssetRequest {
    pub s3_key: String,
    pub hash_sha256: String,
    pub hash_md5: String,
    pub file_extension: String,
    pub content_type: String,
    pub is_launch_asset: bool,
    #[serde(default)]
    pub file_size: Option<i64>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateUpdateResponse {
    pub id: i64,
    pub update_uuid: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub warning: Option<String>,
}

pub async fn handle_create_update(
    State(state): State<AppState>,
    auth: RequireAuth,
    Json(body): Json<CreateUpdateRequest>,
) -> Result<impl IntoResponse, AppError> {
    auth.require_editor()?;
    let project_id = auth.require_project()?;

    if body.platform != "ios" && body.platform != "android" {
        return Err(AppError::BadRequest(
            "Platform must be 'ios' or 'android'.".into(),
        ));
    }

    if !(0..=100).contains(&body.rollout_percentage) {
        return Err(AppError::BadRequest(
            "rolloutPercentage must be between 0 and 100.".into(),
        ));
    }

    // Check if any build exists with this runtime version (or fingerprint)
    let has_matching_build = sqlx::query_scalar::<_, bool>(
        "SELECT EXISTS(
            SELECT 1 FROM builds
            WHERE project_id = $1
            AND platform = $2
            AND (runtime_version = $3 OR runtime_fingerprint = $3)
        )",
    )
    .bind(project_id)
    .bind(&body.platform)
    .bind(&body.runtime_version)
    .fetch_one(&state.db)
    .await
    .unwrap_or(true);

    let warning = if !has_matching_build {
        Some(format!(
            "No build found for runtime version '{}' on {}. No devices will be able to receive this update until a matching build is created.",
            body.runtime_version, body.platform
        ))
    } else {
        None
    };

    let update_uuid = uuid::Uuid::new_v4().to_string();

    let mut tx = state.db.begin().await?;

    // Resolve channel → branch: use channel's branch if configured, else channel name as branch
    let branch_name = sqlx::query_scalar::<_, String>(
        "SELECT branch_name FROM channels WHERE name = $1 AND project_id = $2",
    )
    .bind(&body.channel)
    .bind(project_id)
    .fetch_optional(&mut *tx)
    .await?
    .unwrap_or_else(|| body.channel.clone());

    let update_row = sqlx::query_as::<_, (i64, String)>(
        "INSERT INTO updates (runtime_version, platform, update_uuid, metadata, expo_config, is_rollback, channel, rollout_percentage, is_critical, release_message, branch_name, project_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
         RETURNING id, update_uuid",
    )
    .bind(&body.runtime_version)
    .bind(&body.platform)
    .bind(&update_uuid)
    .bind(serde_json::json!({}))
    .bind(&body.expo_config)
    .bind(body.is_rollback)
    .bind(&body.channel)
    .bind(body.rollout_percentage)
    .bind(body.is_critical)
    .bind(&body.release_message)
    .bind(&branch_name)
    .bind(project_id)
    .fetch_one(&mut *tx)
    .await?;

    for asset in &body.assets {
        sqlx::query(
            "INSERT INTO assets (update_id, s3_key, hash_sha256, hash_md5, file_extension, content_type, is_launch_asset, file_size)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)",
        )
        .bind(update_row.0)
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
        "update.created",
        "update",
        Some(update_row.0),
        serde_json::json!({
            "runtime_version": body.runtime_version,
            "platform": body.platform,
            "channel": body.channel,
        }),
    )
    .await;

    crate::handlers::webhooks::fire_webhooks(
        &state.db,
        "update.created",
        serde_json::json!({
            "update_id": update_row.0,
            "update_uuid": update_row.1,
            "runtime_version": body.runtime_version,
            "platform": body.platform,
            "channel": body.channel,
        }),
    )
    .await;

    // Best-effort auto-start: if an active rollout policy exists for this channel,
    // automatically kick off a rollout execution.
    if let Err(e) = try_auto_start_execution(
        &state.db,
        project_id,
        update_row.0,
        &update_row.1,
        &body.channel,
        &body.linked_flags,
    )
    .await
    {
        tracing::warn!(
            update_id = update_row.0,
            channel = %body.channel,
            error = %e,
            "Auto-start rollout execution failed (non-fatal)"
        );
    }

    Ok((
        StatusCode::CREATED,
        Json(CreateUpdateResponse {
            id: update_row.0,
            update_uuid: update_row.1,
            warning,
        }),
    ))
}

// -- Republish (revert to a previous update) --

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RepublishRequest {
    /// Target channel(s) — defaults to the original channel
    #[serde(default)]
    pub channels: Vec<String>,
    #[serde(default)]
    pub release_message: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RepublishResponse {
    pub updates: Vec<RepublishedUpdate>,
    pub group_id: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RepublishedUpdate {
    pub id: i64,
    pub update_uuid: String,
    pub channel: String,
}

pub async fn handle_republish_update(
    State(state): State<AppState>,
    auth: RequireAuth,
    Path(update_id): Path<i64>,
    Json(body): Json<RepublishRequest>,
) -> Result<impl IntoResponse, AppError> {
    auth.require_editor()?;
    let project_id = auth.require_project()?;

    // Fetch the source update
    let source = sqlx::query_as::<_, crate::models::Update>(
        "SELECT * FROM updates WHERE id = $1 AND project_id = $2",
    )
    .bind(update_id)
    .bind(project_id)
    .fetch_optional(&state.db)
    .await?
    .ok_or_else(|| AppError::NotFound("Update not found".into()))?;

    if source.is_rollback {
        return Err(AppError::BadRequest("Cannot republish a rollback update".into()));
    }

    // Fetch source assets
    let source_assets = sqlx::query_as::<_, crate::models::Asset>(
        "SELECT * FROM assets WHERE update_id = $1",
    )
    .bind(update_id)
    .fetch_all(&state.db)
    .await?;

    let channels = if body.channels.is_empty() {
        vec![source.channel.clone()]
    } else {
        body.channels
    };

    let release_message = body.release_message.unwrap_or(source.release_message.clone());
    let group_id = uuid::Uuid::new_v4().to_string();
    let mut results: Vec<RepublishedUpdate> = Vec::new();

    for channel in &channels {
        let new_uuid = uuid::Uuid::new_v4().to_string();

        // Resolve channel → branch
        let branch_name = sqlx::query_scalar::<_, String>(
            "SELECT branch_name FROM channels WHERE name = $1 AND project_id = $2",
        )
        .bind(channel)
        .bind(project_id)
        .fetch_optional(&state.db)
        .await?
        .unwrap_or_else(|| channel.clone());

        let mut tx = state.db.begin().await?;

        let new_id = sqlx::query_scalar::<_, i64>(
            "INSERT INTO updates (runtime_version, platform, update_uuid, metadata, expo_config, is_rollback, channel, rollout_percentage, is_critical, release_message, group_id, runtime_fingerprint, branch_name, project_id)
             VALUES ($1, $2, $3, $4, $5, FALSE, $6, 100, $7, $8, $9, $10, $11, $12)
             RETURNING id",
        )
        .bind(&source.runtime_version)
        .bind(&source.platform)
        .bind(&new_uuid)
        .bind(&source.metadata)
        .bind(&source.expo_config)
        .bind(channel)
        .bind(source.is_critical)
        .bind(&release_message)
        .bind(&group_id)
        .bind(&source.runtime_fingerprint)
        .bind(&branch_name)
        .bind(project_id)
        .fetch_one(&mut *tx)
        .await?;

        // Copy assets — same S3 keys, no data duplication
        for asset in &source_assets {
            sqlx::query(
                "INSERT INTO assets (update_id, s3_key, hash_sha256, hash_md5, file_extension, content_type, is_launch_asset, file_size)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8)",
            )
            .bind(new_id)
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
            "update.republished",
            "update",
            Some(new_id),
            serde_json::json!({
                "source_update_id": update_id,
                "channel": channel,
                "group_id": group_id,
            }),
        )
        .await;

        results.push(RepublishedUpdate {
            id: new_id,
            update_uuid: new_uuid,
            channel: channel.clone(),
        });
    }

    crate::handlers::webhooks::fire_webhooks(
        &state.db,
        "update.republished",
        serde_json::json!({
            "source_update_id": update_id,
            "channels": channels,
            "group_id": group_id,
        }),
    )
    .await;

    Ok((
        StatusCode::CREATED,
        Json(RepublishResponse {
            updates: results,
            group_id,
        }),
    ))
}

// -- Patch update (rollout, enabled, critical) --

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PatchUpdateRequest {
    pub rollout_percentage: Option<i32>,
    pub is_enabled: Option<bool>,
    pub is_critical: Option<bool>,
    pub release_message: Option<String>,
}

pub async fn handle_patch_update(
    State(state): State<AppState>,
    auth: RequireAuth,
    Path(update_id): Path<i64>,
    Json(body): Json<PatchUpdateRequest>,
) -> Result<impl IntoResponse, AppError> {
    auth.require_editor()?;
    let project_id = auth.require_project()?;

    if let Some(pct) = body.rollout_percentage {
        if !(0..=100).contains(&pct) {
            return Err(AppError::BadRequest(
                "rolloutPercentage must be between 0 and 100.".into(),
            ));
        }
    }

    let result = sqlx::query(
        "UPDATE updates SET
            rollout_percentage = COALESCE($2, rollout_percentage),
            is_enabled = COALESCE($3, is_enabled),
            is_critical = COALESCE($4, is_critical),
            release_message = COALESCE($5, release_message)
         WHERE id = $1 AND project_id = $6",
    )
    .bind(update_id)
    .bind(body.rollout_percentage)
    .bind(body.is_enabled)
    .bind(body.is_critical)
    .bind(&body.release_message)
    .bind(project_id)
    .execute(&state.db)
    .await?;

    if result.rows_affected() == 0 {
        return Err(AppError::NotFound("Update not found".into()));
    }

    let details = serde_json::json!({
        "rollout_percentage": body.rollout_percentage,
        "is_enabled": body.is_enabled,
        "is_critical": body.is_critical,
    });

    record_audit(
        &state.db,
        &auth,
        "update.patched",
        "update",
        Some(update_id),
        details.clone(),
    )
    .await;

    crate::handlers::webhooks::fire_webhooks(
        &state.db,
        "update.patched",
        serde_json::json!({
            "update_id": update_id,
            "changes": details,
        }),
    )
    .await;

    Ok(StatusCode::NO_CONTENT)
}

// -- Delete update --

pub async fn handle_delete_update(
    State(state): State<AppState>,
    auth: RequireAuth,
    Path(update_id): Path<i64>,
) -> Result<impl IntoResponse, AppError> {
    auth.require_editor()?;
    let project_id = auth.require_project()?;

    // Fetch assets belonging to this update (scoped by project)
    let assets = sqlx::query_as::<_, crate::models::Asset>(
        "SELECT a.* FROM assets a JOIN updates u ON u.id = a.update_id WHERE a.update_id = $1 AND u.project_id = $2",
    )
    .bind(update_id)
    .bind(project_id)
    .fetch_all(&state.db)
    .await?;

    // Delete the update (cascades to assets table)
    let result = sqlx::query("DELETE FROM updates WHERE id = $1 AND project_id = $2")
        .bind(update_id)
        .bind(project_id)
        .execute(&state.db)
        .await?;

    if result.rows_affected() == 0 {
        return Err(AppError::NotFound("Update not found".into()));
    }

    // Clean up orphaned S3 objects: delete assets not referenced by any other update or build
    for asset in &assets {
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
        "update.deleted",
        "update",
        Some(update_id),
        serde_json::json!({}),
    )
    .await;

    crate::handlers::webhooks::fire_webhooks(
        &state.db,
        "update.deleted",
        serde_json::json!({ "update_id": update_id }),
    )
    .await;

    Ok(StatusCode::NO_CONTENT)
}

// ── Auto-start rollout execution on publish ──────────────────────────

/// If an active rollout policy exists for the given channel, create a rollout
/// execution automatically. This is best-effort — errors are returned but the
/// caller should log them and continue rather than failing the upload.
pub(crate) async fn try_auto_start_execution(
    db: &sqlx::PgPool,
    project_id: i64,
    update_id: i64,
    update_uuid: &str,
    channel: &str,
    linked_flags: &[LinkedFlagOverride],
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    // Find an active policy for this channel
    let policy_row = sqlx::query_as::<_, (i64,)>(
        "SELECT id FROM rollout_policies \
         WHERE project_id = $1 AND channel = $2 AND is_active = true \
         LIMIT 1",
    )
    .bind(project_id)
    .bind(channel)
    .fetch_optional(db)
    .await?;

    let policy_id = match policy_row {
        Some((id,)) => id,
        None => return Ok(()), // No active policy — nothing to do
    };

    // Get the first stage to determine initial rollout percentage
    let first_stage = sqlx::query_as::<_, (i32,)>(
        "SELECT percentage FROM rollout_policy_stages \
         WHERE policy_id = $1 ORDER BY stage_order LIMIT 1",
    )
    .bind(policy_id)
    .fetch_optional(db)
    .await?;

    let first_percentage = match first_stage {
        Some((pct,)) => pct,
        None => return Ok(()), // Policy has no stages — skip
    };

    // Use the update's group_id if it has one, otherwise fall back to update_uuid.
    let group_id: String = sqlx::query_scalar(
        "SELECT COALESCE(group_id, update_uuid) FROM updates WHERE id = $1",
    )
    .bind(update_id)
    .fetch_one(db)
    .await?;

    // Create the execution
    let execution_id: i64 = sqlx::query_scalar(
        "INSERT INTO rollout_executions \
         (project_id, policy_id, update_group_id, channel, current_stage, status) \
         VALUES ($1, $2, $3, $4, 1, 'running') \
         RETURNING id",
    )
    .bind(project_id)
    .bind(policy_id)
    .bind(&group_id)
    .bind(channel)
    .fetch_one(db)
    .await?;

    // Link flags to this execution, snapshot current state, and apply override
    if !linked_flags.is_empty() {
        for lf in linked_flags {
            // Snapshot the current per-channel enabled state before we override it
            let pre_enabled: Option<bool> = sqlx::query_scalar(
                "SELECT enabled FROM flag_env_settings \
                 WHERE flag_id = $1 AND channel_name = $2",
            )
            .bind(lf.flag_id)
            .bind(channel)
            .fetch_optional(db)
            .await?;

            sqlx::query(
                "INSERT INTO rollout_execution_flags \
                 (execution_id, flag_id, link_type, target_enabled, pre_execution_enabled) \
                 VALUES ($1, $2, 'kill_switch', $3, $4) \
                 ON CONFLICT (execution_id, flag_id) DO UPDATE \
                 SET target_enabled = EXCLUDED.target_enabled, \
                     pre_execution_enabled = EXCLUDED.pre_execution_enabled",
            )
            .bind(execution_id)
            .bind(lf.flag_id)
            .bind(lf.enabled)
            .bind(pre_enabled)
            .execute(db)
            .await?;

            // Apply the target state: update flag_env_settings to match
            let rows = sqlx::query(
                "UPDATE flag_env_settings SET enabled = $1 \
                 WHERE flag_id = $2 AND channel_name = $3",
            )
            .bind(lf.enabled)
            .bind(lf.flag_id)
            .bind(channel)
            .execute(db)
            .await?;

            if rows.rows_affected() == 0 {
                sqlx::query(
                    "INSERT INTO flag_env_settings (flag_id, channel_name, enabled) \
                     VALUES ($1, $2, $3)",
                )
                .bind(lf.flag_id)
                .bind(channel)
                .bind(lf.enabled)
                .execute(db)
                .await?;
            }

            // Create a percentage_rollout targeting rule on the flag for this channel
            let rule_id = crate::handlers::rollout_executions::create_rollout_targeting_rule(
                db,
                lf.flag_id,
                channel,
                first_percentage,
                lf.enabled,
            )
            .await?;

            // Store the rule ID so we can update/delete it later
            sqlx::query(
                "UPDATE rollout_execution_flags SET targeting_rule_id = $1 \
                 WHERE execution_id = $2 AND flag_id = $3",
            )
            .bind(rule_id)
            .bind(execution_id)
            .bind(lf.flag_id)
            .execute(db)
            .await?;

            // Audit: flag state changed by rollout execution
            crate::handlers::audit::record_system_audit(
                db,
                project_id,
                "flag.rollout_applied",
                "feature_flag",
                Some(lf.flag_id),
                serde_json::json!({
                    "executionId": execution_id,
                    "channel": channel,
                    "enabled": lf.enabled,
                    "previousEnabled": pre_enabled,
                    "percentage": first_percentage,
                }),
            )
            .await;
        }
    }

    // Create the first stage history entry
    sqlx::query(
        "INSERT INTO rollout_stage_history (execution_id, stage_order, percentage) \
         VALUES ($1, 1, $2)",
    )
    .bind(execution_id)
    .bind(first_percentage)
    .execute(db)
    .await?;

    // Set the update's rollout_percentage to the first stage's target
    sqlx::query(
        "UPDATE updates SET rollout_percentage = $1 WHERE id = $2",
    )
    .bind(first_percentage)
    .bind(update_id)
    .execute(db)
    .await?;

    tracing::info!(
        update_id,
        update_uuid,
        channel,
        policy_id,
        execution_id,
        first_percentage,
        "Auto-started rollout execution for published update"
    );

    Ok(())
}
