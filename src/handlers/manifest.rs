use std::collections::HashMap;
use std::hash::{DefaultHasher, Hash, Hasher};

use axum::extract::{Path, Query, State};
use axum::http::{HeaderMap, StatusCode};
use axum::response::{IntoResponse, Response};

use crate::errors::AppError;
use crate::models::*;
use crate::multipart::MultipartMixed;
use crate::routes::AppState;
use crate::signing;

pub async fn handle_get_manifest(
    State(state): State<AppState>,
    Path(project_id_or_slug): Path<String>,
    headers: HeaderMap,
    Query(query): Query<ManifestQueryParams>,
) -> Result<Response, AppError> {
    // Resolve project from UUID or slug
    let project_id = if let Ok(uuid) = project_id_or_slug.parse::<uuid::Uuid>() {
        sqlx::query_scalar::<_, i64>("SELECT id FROM projects WHERE uuid = $1")
            .bind(uuid)
            .fetch_optional(&state.db)
            .await?
    } else {
        sqlx::query_scalar::<_, i64>("SELECT id FROM projects WHERE slug = $1")
            .bind(&project_id_or_slug)
            .fetch_optional(&state.db)
            .await?
    }
    .ok_or_else(|| AppError::NotFound(format!("Project '{project_id_or_slug}' not found")))?;
    let protocol_version: u8 = headers
        .get("expo-protocol-version")
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.parse().ok())
        .unwrap_or(0);

    if protocol_version > 1 {
        return Err(AppError::BadRequest(
            "Unsupported protocol version. Expected either 0 or 1.".into(),
        ));
    }

    let platform = headers
        .get("expo-platform")
        .and_then(|v| v.to_str().ok())
        .map(String::from)
        .or(query.platform);

    let platform = match platform.as_deref() {
        Some("ios") | Some("android") => platform.unwrap(),
        _ => {
            return Err(AppError::BadRequest(
                "Unsupported platform. Expected either ios or android.".into(),
            ))
        }
    };

    let runtime_version = headers
        .get("expo-runtime-version")
        .and_then(|v| v.to_str().ok())
        .map(String::from)
        .or(query.runtime_version);

    let runtime_version = match runtime_version {
        Some(rv) if !rv.is_empty() => rv,
        _ => return Err(AppError::BadRequest("No runtimeVersion provided.".into())),
    };

    let current_update_id = headers
        .get("expo-current-update-id")
        .and_then(|v| v.to_str().ok())
        .map(String::from);

    let embedded_update_id = headers
        .get("expo-embedded-update-id")
        .and_then(|v| v.to_str().ok())
        .map(String::from);

    let expect_signature = headers.get("expo-expect-signature").is_some();

    // Channel from custom request header, defaults to "production"
    let channel = headers
        .get("expo-channel-name")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("production");

    // Device ID for consistent rollout bucketing
    let device_id = headers
        .get("expo-device-id")
        .and_then(|v| v.to_str().ok());

    // Resolve channel → branch(es) for branch-based routing
    let channel_config = sqlx::query_as::<_, crate::models::Channel>(
        "SELECT * FROM channels WHERE name = $1 AND project_id = $2",
    )
    .bind(channel)
    .bind(project_id)
    .fetch_optional(&state.db)
    .await?;

    // Minimum runtime version policy: if the channel has a minimum and the device is below it,
    // return a no-update response with a header indicating an app store update is required.
    if let Some(ref ch) = channel_config {
        if let Some(ref min_rv) = ch.min_runtime_version {
            if runtime_version < *min_rv {
                let mut response = build_no_update_response(&state, protocol_version, expect_signature)?;
                response.headers_mut().insert(
                    "expo-update-required",
                    format!("min-runtime-version={min_rv}").parse().unwrap(),
                );
                return Ok(response);
            }
        }
    }

    // Determine which branch to serve from
    let target_branch = if let Some(ref ch) = channel_config {
        // Branch-based rollout: if rollout_branch_name is set and rollout_percentage > 0,
        // use deterministic bucketing to decide which branch to serve
        if let Some(ref rollout_branch) = ch.rollout_branch_name {
            if ch.rollout_percentage > 0 {
                let in_rollout = match device_id {
                    Some(did) => {
                        let mut hasher = DefaultHasher::new();
                        did.hash(&mut hasher);
                        channel.hash(&mut hasher);
                        (hasher.finish() % 100) as i32 >= (100 - ch.rollout_percentage)
                    }
                    None => {
                        use rand::RngExt;
                        rand::rng().random_range(0..100) < ch.rollout_percentage
                    }
                };
                if in_rollout {
                    rollout_branch.as_str()
                } else {
                    ch.branch_name.as_str()
                }
            } else {
                ch.branch_name.as_str()
            }
        } else {
            ch.branch_name.as_str()
        }
    } else {
        // Fallback: no channel config, use channel name as branch name (backwards compat)
        channel
    };

    // Find the latest update on the resolved branch
    let update = sqlx::query_as::<_, Update>(
        "SELECT * FROM updates
         WHERE (runtime_version = $1 OR runtime_fingerprint = $1)
         AND platform = $2 AND branch_name = $3 AND project_id = $4 AND is_enabled = TRUE
         ORDER BY created_at DESC LIMIT 1",
    )
    .bind(&runtime_version)
    .bind(&platform)
    .bind(target_branch)
    .bind(project_id)
    .fetch_optional(&state.db)
    .await?;

    // Fallback: try legacy channel-based lookup for pre-migration updates
    let update = match update {
        Some(u) => u,
        None => {
            sqlx::query_as::<_, Update>(
                "SELECT * FROM updates
                 WHERE (runtime_version = $1 OR runtime_fingerprint = $1)
                 AND platform = $2 AND channel = $3 AND branch_name IS NULL AND project_id = $4 AND is_enabled = TRUE
                 ORDER BY created_at DESC LIMIT 1",
            )
            .bind(&runtime_version)
            .bind(&platform)
            .bind(channel)
            .bind(project_id)
            .fetch_optional(&state.db)
            .await?
            .ok_or_else(|| {
                AppError::NotFound(format!(
                    "No update found for runtime version: {runtime_version}, channel: {channel}"
                ))
            })?
        }
    };

    // Rollback to specific update: serve that update's manifest instead
    if update.is_rollback {
        if let Some(target_id) = update.rollback_to_update_id {
            let target = sqlx::query_as::<_, Update>(
                "SELECT * FROM updates WHERE id = $1",
            )
            .bind(target_id)
            .fetch_optional(&state.db)
            .await?;

            if let Some(target_update) = target {
                // Check if client already has this update
                if protocol_version == 1 {
                    if let Some(ref current_id) = current_update_id {
                        if current_id == &target_update.update_uuid {
                            return build_no_update_response(&state, protocol_version, expect_signature);
                        }
                    }
                }
                // Record analytics
                record_manifest_download(&state, &target_update, device_id).await;
                return build_update_response(
                    &state,
                    &target_update,
                    &target_update.runtime_version,
                    protocol_version,
                    expect_signature,
                    None,
                )
                .await;
            }
        }

        // Fall back to embedded rollback
        return build_rollback_response(
            &state,
            &update,
            protocol_version,
            current_update_id.as_deref(),
            embedded_update_id.as_deref(),
            expect_signature,
        );
    }

    // Check if client already has this update
    if protocol_version == 1 {
        if let Some(ref current_id) = current_update_id {
            if current_id == &update.update_uuid {
                return build_no_update_response(&state, protocol_version, expect_signature);
            }
        }
    }

    // Rollout gating: if rollout_percentage < 100, check if this device is in the rollout
    if update.rollout_percentage < 100 {
        let in_rollout = match device_id {
            Some(did) => {
                // Deterministic: hash device_id + update_uuid for consistent bucketing
                let mut hasher = DefaultHasher::new();
                did.hash(&mut hasher);
                update.update_uuid.hash(&mut hasher);
                let bucket = (hasher.finish() % 100) as i32;
                bucket < update.rollout_percentage
            }
            None => {
                // No device ID: use random bucketing (non-sticky)
                use rand::RngExt;
                let roll: i32 = rand::rng().random_range(0..100);
                roll < update.rollout_percentage
            }
        };

        if !in_rollout {
            // Not in rollout — return no update (or fall back to previous update)
            if protocol_version == 1 {
                return build_no_update_response(&state, protocol_version, expect_signature);
            }
            // Protocol 0 doesn't support NoUpdateAvailable, so just 404
            return Err(AppError::NotFound(
                "No update available for this device.".into(),
            ));
        }
    }

    // Record analytics
    record_manifest_download(&state, &update, device_id).await;

    // Delta updates: filter out assets the client already has
    let client_asset_hashes = headers
        .get("expo-asset-hashes")
        .and_then(|v| v.to_str().ok())
        .map(|s| s.split(',').map(|h| h.trim().to_string()).collect::<Vec<_>>());

    build_update_response(
        &state,
        &update,
        &runtime_version,
        protocol_version,
        expect_signature,
        client_asset_hashes.as_deref(),
    )
    .await
}

async fn record_manifest_download(state: &AppState, update: &Update, device_id: Option<&str>) {
    let _ = sqlx::query(
        "INSERT INTO update_analytics (update_id, device_id, platform, runtime_version, event) VALUES ($1, $2, $3, $4, 'download')",
    )
    .bind(update.id)
    .bind(device_id)
    .bind(&update.platform)
    .bind(&update.runtime_version)
    .execute(&state.db)
    .await;
}

async fn build_update_response(
    state: &AppState,
    update: &Update,
    runtime_version: &str,
    protocol_version: u8,
    expect_signature: bool,
    client_asset_hashes: Option<&[String]>,
) -> Result<Response, AppError> {
    let assets = sqlx::query_as::<_, Asset>(
        "SELECT * FROM assets WHERE update_id = $1 AND is_launch_asset = FALSE",
    )
    .bind(update.id)
    .fetch_all(&state.db)
    .await?;

    let launch_asset = sqlx::query_as::<_, Asset>(
        "SELECT * FROM assets WHERE update_id = $1 AND is_launch_asset = TRUE LIMIT 1",
    )
    .bind(update.id)
    .fetch_one(&state.db)
    .await
    .map_err(|_| AppError::Internal("No launch asset found for update".into()))?;

    // Delta updates: only include assets the client doesn't already have
    let filtered_assets: Vec<&Asset> = if let Some(hashes) = client_asset_hashes {
        assets
            .iter()
            .filter(|a| !hashes.contains(&a.hash_sha256) && !hashes.contains(&a.hash_md5))
            .collect()
    } else {
        assets.iter().collect()
    };

    let asset_metadatas: Vec<AssetMetadata> = filtered_assets
        .iter()
        .map(|a| asset_to_metadata(a, &state.config.s3_base_url))
        .collect();

    let launch_asset_metadata = asset_to_metadata(&launch_asset, &state.config.s3_base_url);

    let manifest = ManifestBody {
        id: update.update_uuid.clone(),
        created_at: update.created_at.to_rfc3339(),
        runtime_version: runtime_version.to_string(),
        assets: asset_metadatas,
        launch_asset: launch_asset_metadata,
        metadata: serde_json::json!({}),
        extra: ManifestExtra {
            expo_client: update.expo_config.clone(),
        },
    };

    let manifest_json =
        serde_json::to_string(&manifest).map_err(|e| AppError::Internal(e.to_string()))?;

    let mut manifest_headers: Vec<(&str, &str)> = Vec::new();
    let signature;
    if expect_signature {
        if let Some(ref key) = state.private_key {
            let sig = signing::sign_rsa_sha256(&manifest_json, key);
            signature = signing::format_signature(&sig);
            manifest_headers.push(("expo-signature", &signature));
        } else {
            return Err(AppError::BadRequest(
                "Code signing requested but no key supplied when starting server.".into(),
            ));
        }
    }

    // Build asset request headers extension
    let mut asset_request_headers: HashMap<String, serde_json::Value> = HashMap::new();
    for asset in manifest
        .assets
        .iter()
        .chain(std::iter::once(&manifest.launch_asset))
    {
        asset_request_headers.insert(
            asset.key.clone(),
            serde_json::json!({"test-header": "test-header-value"}),
        );
    }
    let extensions_json = serde_json::to_string(
        &serde_json::json!({ "assetRequestHeaders": asset_request_headers }),
    )
    .map_err(|e| AppError::Internal(e.to_string()))?;

    let mut form = MultipartMixed::new();
    form.add_part(
        &manifest_json,
        "application/json; charset=utf-8",
        manifest_headers,
    );
    form.add_part(&extensions_json, "application/json", vec![]);

    let mut response = build_multipart_response(form, protocol_version);

    // If critical, add a header so the client knows to force-apply
    if update.is_critical {
        response
            .headers_mut()
            .insert("expo-is-critical", "true".parse().unwrap());
    }

    Ok(response)
}

fn build_rollback_response(
    state: &AppState,
    update: &Update,
    protocol_version: u8,
    current_update_id: Option<&str>,
    embedded_update_id: Option<&str>,
    expect_signature: bool,
) -> Result<Response, AppError> {
    if protocol_version == 0 {
        return Err(AppError::BadRequest(
            "Rollbacks not supported on protocol version 0".into(),
        ));
    }

    let embedded_id = embedded_update_id.ok_or_else(|| {
        AppError::BadRequest("Invalid Expo-Embedded-Update-ID request header specified.".into())
    })?;

    if current_update_id == Some(embedded_id) {
        return build_no_update_response(state, protocol_version, expect_signature);
    }

    let directive = Directive::RollBack {
        parameters: RollbackParameters {
            commit_time: update.created_at.to_rfc3339(),
        },
    };

    build_directive_response(state, &directive, protocol_version, expect_signature)
}

fn build_no_update_response(
    state: &AppState,
    protocol_version: u8,
    expect_signature: bool,
) -> Result<Response, AppError> {
    if protocol_version == 0 {
        return Err(AppError::BadRequest(
            "NoUpdateAvailable directive not available in protocol version 0".into(),
        ));
    }

    let directive = Directive::NoUpdate;
    build_directive_response(state, &directive, protocol_version, expect_signature)
}

fn build_directive_response(
    state: &AppState,
    directive: &Directive,
    protocol_version: u8,
    expect_signature: bool,
) -> Result<Response, AppError> {
    let directive_json =
        serde_json::to_string(directive).map_err(|e| AppError::Internal(e.to_string()))?;

    let mut directive_headers: Vec<(&str, &str)> = Vec::new();
    let signature;
    if expect_signature {
        if let Some(ref key) = state.private_key {
            let sig = signing::sign_rsa_sha256(&directive_json, key);
            signature = signing::format_signature(&sig);
            directive_headers.push(("expo-signature", &signature));
        } else {
            return Err(AppError::BadRequest(
                "Code signing requested but no key supplied when starting server.".into(),
            ));
        }
    }

    let mut form = MultipartMixed::new();
    form.add_part(
        &directive_json,
        "application/json; charset=utf-8",
        directive_headers,
    );

    Ok(build_multipart_response(form, protocol_version))
}

fn build_multipart_response(form: MultipartMixed, protocol_version: u8) -> Response {
    axum::http::Response::builder()
        .status(StatusCode::OK)
        .header("content-type", form.content_type())
        .header("expo-protocol-version", protocol_version.to_string())
        .header("expo-sfv-version", "0")
        .header("cache-control", "private, max-age=0")
        .body(axum::body::Body::from(form.to_bytes()))
        .unwrap()
        .into_response()
}

fn asset_to_metadata(asset: &Asset, s3_base_url: &str) -> AssetMetadata {
    AssetMetadata {
        hash: asset.hash_sha256.clone(),
        key: asset.hash_md5.clone(),
        file_extension: asset.file_extension.clone(),
        content_type: asset.content_type.clone(),
        url: format!("{}/{}", s3_base_url, asset.s3_key),
    }
}
