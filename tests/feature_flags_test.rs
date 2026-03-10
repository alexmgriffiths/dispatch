mod common;

use axum::http::StatusCode;
use http_body_util::BodyExt;
use tower::ServiceExt;

/// POST /v1/ota/flags with authenticated request creates a flag and returns 201.
/// CreateFlagRequest requires: name, key. Defaults: flag_type="boolean", enabled=true.
#[tokio::test]
async fn test_create_flag() {
    let state = common::setup::create_test_state().await;
    common::setup::cleanup_test_data(&state.db).await;

    let user =
        common::fixtures::create_test_user(&state.db, "flagcreator@test.com", "Flag Creator")
            .await;

    let app = dispatch_ota::routes::create_router(state.clone());

    let request = common::auth::authenticated_request(
        "POST",
        "/v1/ota/flags",
        &user.token,
        &user.project_slug,
        Some(serde_json::json!({
            "name": "My Feature Flag",
            "key": "my-feature-flag"
        })),
    );

    let response = app.oneshot(request).await.unwrap();

    assert_eq!(response.status(), StatusCode::CREATED);

    let body = response.into_body().collect().await.unwrap().to_bytes();
    let json: serde_json::Value = serde_json::from_slice(&body).unwrap();

    // Verify response contains the created flag
    assert_eq!(json["key"], "my-feature-flag");
    assert_eq!(json["name"], "My Feature Flag");
    assert_eq!(json["flagType"], "boolean");
    assert_eq!(json["enabled"], true);

    // Verify flag exists in database
    let flag_count = sqlx::query_scalar::<_, i64>(
        "SELECT COUNT(*) FROM feature_flags WHERE key = 'my-feature-flag'",
    )
    .fetch_one(&state.db)
    .await
    .unwrap();
    assert_eq!(flag_count, 1);

    // Verify boolean variations were auto-created
    let flag_id = json["id"].as_i64().unwrap();
    let variation_count = sqlx::query_scalar::<_, i64>(
        "SELECT COUNT(*) FROM flag_variations WHERE flag_id = $1",
    )
    .bind(flag_id)
    .fetch_one(&state.db)
    .await
    .unwrap();
    assert_eq!(variation_count, 2); // true and false

    common::setup::cleanup_test_data(&state.db).await;
}

/// GET /v1/ota/flags with auth returns list containing created flags
#[tokio::test]
async fn test_list_flags() {
    let state = common::setup::create_test_state().await;
    common::setup::cleanup_test_data(&state.db).await;

    let user =
        common::fixtures::create_test_user(&state.db, "flaglister@test.com", "Flag Lister").await;
    let project_id = common::fixtures::get_project_id(&state.db, &user.project_slug).await;
    let _flag_id = common::fixtures::create_test_flag(&state.db, project_id, "test-flag").await;

    let app = dispatch_ota::routes::create_router(state.clone());

    let request = common::auth::authenticated_request(
        "GET",
        "/v1/ota/flags",
        &user.token,
        &user.project_slug,
        None,
    );

    let response = app.oneshot(request).await.unwrap();

    assert_eq!(response.status(), StatusCode::OK);

    let body = response.into_body().collect().await.unwrap().to_bytes();
    let json: serde_json::Value = serde_json::from_slice(&body).unwrap();

    let flags = json.as_array().unwrap();
    assert_eq!(flags.len(), 1);
    assert_eq!(flags[0]["key"], "test-flag");

    common::setup::cleanup_test_data(&state.db).await;
}

/// GET /v1/ota/flags/{id} with auth returns flag details
#[tokio::test]
async fn test_get_flag_by_id() {
    let state = common::setup::create_test_state().await;
    common::setup::cleanup_test_data(&state.db).await;

    let user =
        common::fixtures::create_test_user(&state.db, "flaggetter@test.com", "Flag Getter").await;
    let project_id = common::fixtures::get_project_id(&state.db, &user.project_slug).await;
    let flag_id = common::fixtures::create_test_flag(&state.db, project_id, "get-flag").await;

    let app = dispatch_ota::routes::create_router(state.clone());

    let request = common::auth::authenticated_request(
        "GET",
        &format!("/v1/ota/flags/{}", flag_id),
        &user.token,
        &user.project_slug,
        None,
    );

    let response = app.oneshot(request).await.unwrap();

    assert_eq!(response.status(), StatusCode::OK);

    let body = response.into_body().collect().await.unwrap().to_bytes();
    let json: serde_json::Value = serde_json::from_slice(&body).unwrap();

    assert_eq!(json["key"], "get-flag");
    assert_eq!(json["id"], flag_id);
    // Verify variations are included in response
    assert!(json["variations"].is_array());
    assert_eq!(json["variations"].as_array().unwrap().len(), 2); // on/off

    common::setup::cleanup_test_data(&state.db).await;
}

/// DELETE /v1/ota/flags/{id} removes the flag; subsequent GET returns 404
#[tokio::test]
async fn test_delete_flag() {
    let state = common::setup::create_test_state().await;
    common::setup::cleanup_test_data(&state.db).await;

    let user =
        common::fixtures::create_test_user(&state.db, "flagdeleter@test.com", "Flag Deleter")
            .await;
    let project_id = common::fixtures::get_project_id(&state.db, &user.project_slug).await;
    let flag_id =
        common::fixtures::create_test_flag(&state.db, project_id, "delete-flag").await;

    // Delete the flag
    let app = dispatch_ota::routes::create_router(state.clone());
    let request = common::auth::authenticated_request(
        "DELETE",
        &format!("/v1/ota/flags/{}", flag_id),
        &user.token,
        &user.project_slug,
        None,
    );
    let response = app.oneshot(request).await.unwrap();
    assert_eq!(response.status(), StatusCode::NO_CONTENT);

    // Verify the flag no longer exists via GET
    let app = dispatch_ota::routes::create_router(state.clone());
    let request = common::auth::authenticated_request(
        "GET",
        &format!("/v1/ota/flags/{}", flag_id),
        &user.token,
        &user.project_slug,
        None,
    );
    let response = app.oneshot(request).await.unwrap();
    assert_eq!(response.status(), StatusCode::NOT_FOUND);

    common::setup::cleanup_test_data(&state.db).await;
}

/// GET /v1/ota/flag-definitions/{project_slug} returns flag definitions for SDK.
/// This is an OTA client route -- no auth required.
#[tokio::test]
async fn test_get_flag_definitions_for_sdk() {
    let state = common::setup::create_test_state().await;
    common::setup::cleanup_test_data(&state.db).await;

    let user =
        common::fixtures::create_test_user(&state.db, "flagsdk@test.com", "Flag SDK").await;
    let project_id = common::fixtures::get_project_id(&state.db, &user.project_slug).await;
    let _flag_id =
        common::fixtures::create_test_flag(&state.db, project_id, "sdk-flag").await;

    // flag-definitions is an OTA client route -- no auth required, just GET with project_slug
    let app = dispatch_ota::routes::create_router(state.clone());
    let request = common::auth::unauthenticated_request(
        "GET",
        &format!("/v1/ota/flag-definitions/{}", user.project_slug),
        None,
    );
    let response = app.oneshot(request).await.unwrap();

    assert_eq!(response.status(), StatusCode::OK);

    let body = response.into_body().collect().await.unwrap().to_bytes();
    let json: serde_json::Value = serde_json::from_slice(&body).unwrap();

    // Response should have a "flags" array
    let flags = json["flags"].as_array().unwrap();
    assert_eq!(flags.len(), 1);
    assert_eq!(flags[0]["key"], "sdk-flag");

    common::setup::cleanup_test_data(&state.db).await;
}
