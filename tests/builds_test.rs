mod common;

use axum::http::StatusCode;
use http_body_util::BodyExt;
use tower::ServiceExt;

/// GET /v1/ota/builds with auth returns 200 with empty list when no builds exist
#[tokio::test]
async fn test_list_builds_empty() {
    let state = common::setup::create_test_state().await;
    common::setup::cleanup_test_data(&state.db).await;

    let user =
        common::fixtures::create_test_user(&state.db, "builds@test.com", "Builds User").await;

    let app = dispatch_ota::routes::create_router(state.clone());

    let request = common::auth::authenticated_request(
        "GET",
        "/v1/ota/builds",
        &user.token,
        &user.project_slug,
        None,
    );

    let response = app.oneshot(request).await.unwrap();

    assert_eq!(response.status(), StatusCode::OK);

    let body = response.into_body().collect().await.unwrap().to_bytes();
    let json: serde_json::Value = serde_json::from_slice(&body).unwrap();

    let builds = json.as_array().unwrap();
    assert!(builds.is_empty());

    common::setup::cleanup_test_data(&state.db).await;
}

/// GET /v1/ota/builds with auth returns builds when data exists (inserted via SQL)
#[tokio::test]
async fn test_list_builds_with_data() {
    let state = common::setup::create_test_state().await;
    common::setup::cleanup_test_data(&state.db).await;

    let user =
        common::fixtures::create_test_user(&state.db, "builds2@test.com", "Builds User2").await;
    let project_id = common::fixtures::get_project_id(&state.db, &user.project_slug).await;

    // Insert a build directly via SQL (bypassing multipart upload)
    let build_uuid = "test-build-uuid-12345";
    sqlx::query(
        "INSERT INTO builds (build_uuid, runtime_version, platform, expo_config, message, project_id) \
         VALUES ($1, '1.0.0', 'ios', '{}'::jsonb, 'Test build', $2)",
    )
    .bind(build_uuid)
    .bind(project_id)
    .execute(&state.db)
    .await
    .unwrap();

    let app = dispatch_ota::routes::create_router(state.clone());

    let request = common::auth::authenticated_request(
        "GET",
        "/v1/ota/builds",
        &user.token,
        &user.project_slug,
        None,
    );

    let response = app.oneshot(request).await.unwrap();

    assert_eq!(response.status(), StatusCode::OK);

    let body = response.into_body().collect().await.unwrap().to_bytes();
    let json: serde_json::Value = serde_json::from_slice(&body).unwrap();

    let builds = json.as_array().unwrap();
    assert_eq!(builds.len(), 1);
    assert_eq!(builds[0]["buildUuid"], build_uuid);
    assert_eq!(builds[0]["runtimeVersion"], "1.0.0");
    assert_eq!(builds[0]["platform"], "ios");
    assert_eq!(builds[0]["message"], "Test build");

    common::setup::cleanup_test_data(&state.db).await;
}

/// POST /v1/ota/builds/{id}/publish with an invalid build ID returns 404
#[tokio::test]
async fn test_publish_build_not_found() {
    let state = common::setup::create_test_state().await;
    common::setup::cleanup_test_data(&state.db).await;

    let user =
        common::fixtures::create_test_user(&state.db, "builds3@test.com", "Builds User3").await;

    let app = dispatch_ota::routes::create_router(state.clone());

    let request = common::auth::authenticated_request(
        "POST",
        "/v1/ota/builds/99999/publish",
        &user.token,
        &user.project_slug,
        Some(serde_json::json!({
            "channel": "production",
            "rolloutPercentage": 100
        })),
    );

    let response = app.oneshot(request).await.unwrap();

    assert_eq!(response.status(), StatusCode::NOT_FOUND);

    common::setup::cleanup_test_data(&state.db).await;
}
