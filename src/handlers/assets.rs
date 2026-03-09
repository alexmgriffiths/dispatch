use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};

use crate::errors::AppError;
use crate::routes::AppState;

/// Proxy asset downloads from S3 so clients don't need direct S3 access.
/// Route: GET /v1/ota/assets/*key
pub async fn handle_proxy_asset(
    State(state): State<AppState>,
    Path(key): Path<String>,
) -> Result<Response, AppError> {
    // Validate the key to prevent path traversal
    if key.contains("..") || key.starts_with('/') {
        return Err(AppError::BadRequest("Invalid asset key".into()));
    }
    // Only allow serving from assets/ or builds/ prefixes
    if !key.starts_with("assets/") && !key.starts_with("builds/") {
        return Err(AppError::BadRequest("Invalid asset key".into()));
    }

    let result = state
        .s3
        .get_object()
        .bucket(&state.config.s3_bucket)
        .key(&key)
        .send()
        .await
        .map_err(|e| {
            tracing::warn!(s3_key = %key, error = %e, "Asset not found in S3");
            AppError::NotFound("Asset not found".into())
        })?;

    let content_type = result
        .content_type()
        .unwrap_or("application/octet-stream")
        .to_string();

    let body = result
        .body
        .collect()
        .await
        .map_err(|e| AppError::Internal(format!("Failed to read S3 object: {e}")))?
        .into_bytes();

    Ok(axum::http::Response::builder()
        .status(StatusCode::OK)
        .header("content-type", content_type)
        .header("cache-control", "public, max-age=31536000, immutable")
        .body(axum::body::Body::from(body))
        .unwrap()
        .into_response())
}
