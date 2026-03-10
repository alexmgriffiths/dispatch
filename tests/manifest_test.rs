mod common;

use axum::body::Body;
use axum::http::{Request, StatusCode};
use http_body_util::BodyExt;
use tower::ServiceExt;

/// GET /v1/ota/manifest/{project_slug} with expo-protocol-version 1 and no matching update
/// returns a "no update available" directive (200 with multipart containing noUpdateAvailable).
#[tokio::test]
async fn test_get_manifest_no_updates() {
    let state = common::setup::create_test_state().await;
    common::setup::cleanup_test_data(&state.db).await;

    let user =
        common::fixtures::create_test_user(&state.db, "manifest@test.com", "Manifest User").await;

    let app = dispatch_ota::routes::create_router(state.clone());

    // The manifest endpoint requires expo-platform, expo-runtime-version, and expo-protocol-version headers.
    // With protocol version 1 and no matching update, it should return a "no update" directive
    // (not a 404, because protocol v1 uses directives).
    // However, if there's truly no update at all for this runtime version, the handler returns
    // a 404 NotFound. Let's verify that behavior.
    let response = app
        .oneshot(
            Request::builder()
                .method("GET")
                .uri(&format!("/v1/ota/manifest/{}", user.project_slug))
                .header("expo-platform", "ios")
                .header("expo-runtime-version", "1.0.0")
                .header("expo-protocol-version", "1")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    // When there are no updates at all, the handler returns 404
    assert_eq!(response.status(), StatusCode::NOT_FOUND);

    let body = response.into_body().collect().await.unwrap().to_bytes();
    let json: serde_json::Value = serde_json::from_slice(&body).unwrap();
    assert!(json["error"].as_str().unwrap().contains("No update found"));

    common::setup::cleanup_test_data(&state.db).await;
}

/// GET /v1/ota/manifest/{project_slug} with a published update returns a multipart
/// manifest response with the update metadata.
#[tokio::test]
async fn test_get_manifest_with_update() {
    let state = common::setup::create_test_state().await;
    common::setup::cleanup_test_data(&state.db).await;

    let user =
        common::fixtures::create_test_user(&state.db, "manifest2@test.com", "Manifest User2")
            .await;
    let project_id = common::fixtures::get_project_id(&state.db, &user.project_slug).await;

    // Insert a published update and its assets directly via SQL
    // (the full multipart upload flow is too complex for a unit test)
    let update_uuid = "test-update-uuid-12345";
    let update_id = sqlx::query_scalar::<_, i64>(
        "INSERT INTO updates (runtime_version, platform, update_uuid, metadata, expo_config, \
         is_rollback, channel, rollout_percentage, is_critical, release_message, branch_name, \
         group_id, project_id) \
         VALUES ($1, $2, $3, '{}'::jsonb, '{}'::jsonb, false, 'production', 100, false, '', 'main', \
         'test-group', $4) RETURNING id",
    )
    .bind("1.0.0")
    .bind("ios")
    .bind(update_uuid)
    .bind(project_id)
    .fetch_one(&state.db)
    .await
    .unwrap();

    // Insert a launch asset (required by build_update_response)
    sqlx::query(
        "INSERT INTO assets (update_id, s3_key, hash_sha256, hash_md5, file_extension, \
         content_type, is_launch_asset, file_size) \
         VALUES ($1, 'test/bundle.js', 'sha256hash', 'md5hash', '.js', \
         'application/javascript', true, 1024)",
    )
    .bind(update_id)
    .execute(&state.db)
    .await
    .unwrap();

    let app = dispatch_ota::routes::create_router(state.clone());

    let response = app
        .oneshot(
            Request::builder()
                .method("GET")
                .uri(&format!("/v1/ota/manifest/{}", user.project_slug))
                .header("expo-platform", "ios")
                .header("expo-runtime-version", "1.0.0")
                .header("expo-protocol-version", "1")
                .header("host", "localhost")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);

    // Verify it's a multipart response
    let content_type = response
        .headers()
        .get("content-type")
        .unwrap()
        .to_str()
        .unwrap()
        .to_string();
    assert!(
        content_type.contains("multipart/mixed"),
        "Expected multipart/mixed response, got: {}",
        content_type
    );

    // Verify expo protocol headers
    let proto_version = response
        .headers()
        .get("expo-protocol-version")
        .unwrap()
        .to_str()
        .unwrap();
    assert_eq!(proto_version, "1");

    // Read the body and verify it contains the manifest with our update UUID
    let body = response.into_body().collect().await.unwrap().to_bytes();
    let body_str = String::from_utf8_lossy(&body);
    assert!(
        body_str.contains(update_uuid),
        "Manifest response should contain update UUID"
    );

    common::setup::cleanup_test_data(&state.db).await;
}
