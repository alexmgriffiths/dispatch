mod common;

use axum::body::Body;
use axum::http::{Request, StatusCode};
use http_body_util::BodyExt;
use tower::ServiceExt;

/// GET /v1/ota/auth/setup-status on clean DB returns needsSetup: true
#[tokio::test]
async fn test_setup_status_initially_needs_setup() {
    let state = common::setup::create_test_state().await;
    common::setup::cleanup_test_data(&state.db).await;

    let app = dispatch_ota::routes::create_router(state.clone());

    let response = app
        .oneshot(
            Request::builder()
                .method("GET")
                .uri("/v1/ota/auth/setup-status")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);

    let body = response.into_body().collect().await.unwrap().to_bytes();
    let json: serde_json::Value = serde_json::from_slice(&body).unwrap();

    assert_eq!(json["needsSetup"], true);
    assert_eq!(json["userCount"], 0);

    common::setup::cleanup_test_data(&state.db).await;
}

/// POST /v1/ota/auth/register creates user, project, branch, channel, and session.
/// Returns 201 with token and user info (role=admin).
#[tokio::test]
async fn test_register_creates_user_and_project() {
    let state = common::setup::create_test_state().await;
    common::setup::cleanup_test_data(&state.db).await;

    let app = dispatch_ota::routes::create_router(state.clone());

    let response = app
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/v1/ota/auth/register")
                .header("content-type", "application/json")
                .body(Body::from(
                    serde_json::to_string(&serde_json::json!({
                        "email": "admin@test.com",
                        "name": "Admin User",
                        "password": "securepassword123"
                    }))
                    .unwrap(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::CREATED);

    let body = response.into_body().collect().await.unwrap().to_bytes();
    let json: serde_json::Value = serde_json::from_slice(&body).unwrap();

    // Verify response shape
    assert!(json["token"].as_str().unwrap().len() > 10);
    assert_eq!(json["user"]["email"], "admin@test.com");
    assert_eq!(json["user"]["name"], "Admin User");
    assert_eq!(json["user"]["role"], "admin");

    // Verify database state: user exists
    let user_count = sqlx::query_scalar::<_, i64>(
        "SELECT COUNT(*) FROM users WHERE email = 'admin@test.com'",
    )
    .fetch_one(&state.db)
    .await
    .unwrap();
    assert_eq!(user_count, 1);

    // Verify project was created
    let project_count =
        sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM projects")
            .fetch_one(&state.db)
            .await
            .unwrap();
    assert_eq!(project_count, 1);

    // Verify default branch and channel were created
    let branch_count =
        sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM branches WHERE name = 'main'")
            .fetch_one(&state.db)
            .await
            .unwrap();
    assert_eq!(branch_count, 1);

    let channel_count = sqlx::query_scalar::<_, i64>(
        "SELECT COUNT(*) FROM channels WHERE name = 'production'",
    )
    .fetch_one(&state.db)
    .await
    .unwrap();
    assert_eq!(channel_count, 1);

    common::setup::cleanup_test_data(&state.db).await;
}

/// POST /v1/ota/auth/register with password < 8 chars returns 400
#[tokio::test]
async fn test_register_rejects_short_password() {
    let state = common::setup::create_test_state().await;
    common::setup::cleanup_test_data(&state.db).await;

    let app = dispatch_ota::routes::create_router(state.clone());

    let response = app
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/v1/ota/auth/register")
                .header("content-type", "application/json")
                .body(Body::from(
                    serde_json::to_string(&serde_json::json!({
                        "email": "short@test.com",
                        "name": "Short Password",
                        "password": "short"
                    }))
                    .unwrap(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::BAD_REQUEST);

    let body = response.into_body().collect().await.unwrap().to_bytes();
    let json: serde_json::Value = serde_json::from_slice(&body).unwrap();
    assert!(json["error"]
        .as_str()
        .unwrap()
        .contains("at least 8 characters"));

    common::setup::cleanup_test_data(&state.db).await;
}

/// POST /v1/ota/auth/login with correct credentials returns 200 with token
#[tokio::test]
async fn test_login_returns_token() {
    let state = common::setup::create_test_state().await;
    common::setup::cleanup_test_data(&state.db).await;

    // Setup: create a user via fixtures
    let _user =
        common::fixtures::create_test_user(&state.db, "login@test.com", "Login User").await;

    let app = dispatch_ota::routes::create_router(state.clone());

    let response = app
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/v1/ota/auth/login")
                .header("content-type", "application/json")
                .body(Body::from(
                    serde_json::to_string(&serde_json::json!({
                        "email": "login@test.com",
                        "password": common::fixtures::TEST_PASSWORD
                    }))
                    .unwrap(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);

    let body = response.into_body().collect().await.unwrap().to_bytes();
    let json: serde_json::Value = serde_json::from_slice(&body).unwrap();

    // Verify response shape
    assert!(json["token"].as_str().unwrap().len() > 10);
    assert_eq!(json["user"]["email"], "login@test.com");
    assert_eq!(json["user"]["name"], "Login User");
    assert_eq!(json["user"]["role"], "admin");

    common::setup::cleanup_test_data(&state.db).await;
}

/// POST /v1/ota/auth/login with wrong password returns 401
#[tokio::test]
async fn test_login_rejects_wrong_password() {
    let state = common::setup::create_test_state().await;
    common::setup::cleanup_test_data(&state.db).await;

    // Setup: create a user via fixtures
    let _user =
        common::fixtures::create_test_user(&state.db, "wrong@test.com", "Wrong Password").await;

    let app = dispatch_ota::routes::create_router(state.clone());

    let response = app
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/v1/ota/auth/login")
                .header("content-type", "application/json")
                .body(Body::from(
                    serde_json::to_string(&serde_json::json!({
                        "email": "wrong@test.com",
                        "password": "definitely-wrong-password"
                    }))
                    .unwrap(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::UNAUTHORIZED);

    common::setup::cleanup_test_data(&state.db).await;
}

/// GET /v1/ota/flags without Bearer token returns 401
#[tokio::test]
async fn test_protected_route_rejects_unauthenticated() {
    let state = common::setup::create_test_state().await;
    let app = dispatch_ota::routes::create_router(state.clone());

    let response = app
        .oneshot(
            Request::builder()
                .method("GET")
                .uri("/v1/ota/flags")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::UNAUTHORIZED);

    common::setup::cleanup_test_data(&state.db).await;
}
