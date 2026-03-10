mod common;

use axum::http::StatusCode;
use http_body_util::BodyExt;
use tower::ServiceExt;

/// GET /v1/ota/rollout-executions with auth returns 200 with empty list when none exist
#[tokio::test]
async fn test_list_executions_empty() {
    let state = common::setup::create_test_state().await;
    common::setup::cleanup_test_data(&state.db).await;

    let user =
        common::fixtures::create_test_user(&state.db, "rollout@test.com", "Rollout User").await;

    let app = dispatch_ota::routes::create_router(state.clone());

    let request = common::auth::authenticated_request(
        "GET",
        "/v1/ota/rollout-executions",
        &user.token,
        &user.project_slug,
        None,
    );

    let response = app.oneshot(request).await.unwrap();

    assert_eq!(response.status(), StatusCode::OK);

    let body = response.into_body().collect().await.unwrap().to_bytes();
    let json: serde_json::Value = serde_json::from_slice(&body).unwrap();

    let executions = json.as_array().unwrap();
    assert!(executions.is_empty());

    common::setup::cleanup_test_data(&state.db).await;
}

/// POST /v1/ota/rollout-policies creates a policy, then GET /v1/ota/rollout-policies lists it.
/// CreatePolicyRequest requires: name, channel, stages (array with at least 1 stage).
/// Each stage requires: percentage (0-100). Optional: duration_minutes, min_devices, thresholds.
#[tokio::test]
async fn test_create_and_list_policies() {
    let state = common::setup::create_test_state().await;
    common::setup::cleanup_test_data(&state.db).await;

    let user =
        common::fixtures::create_test_user(&state.db, "policy@test.com", "Policy User").await;

    // Create a rollout policy
    let app = dispatch_ota::routes::create_router(state.clone());

    let request = common::auth::authenticated_request(
        "POST",
        "/v1/ota/rollout-policies",
        &user.token,
        &user.project_slug,
        Some(serde_json::json!({
            "name": "Gradual Rollout",
            "channel": "production",
            "stages": [
                {
                    "percentage": 10,
                    "durationMinutes": 30
                },
                {
                    "percentage": 50,
                    "durationMinutes": 60
                },
                {
                    "percentage": 100,
                    "durationMinutes": 0
                }
            ]
        })),
    );

    let response = app.oneshot(request).await.unwrap();

    assert_eq!(response.status(), StatusCode::CREATED);

    let body = response.into_body().collect().await.unwrap().to_bytes();
    let json: serde_json::Value = serde_json::from_slice(&body).unwrap();

    assert_eq!(json["name"], "Gradual Rollout");
    assert_eq!(json["channel"], "production");
    assert_eq!(json["isActive"], true);
    let stages = json["stages"].as_array().unwrap();
    assert_eq!(stages.len(), 3);
    // StageWithThresholds uses #[serde(flatten)] so stage fields are at top level
    assert_eq!(stages[0]["percentage"], 10);
    assert_eq!(stages[1]["percentage"], 50);
    assert_eq!(stages[2]["percentage"], 100);

    // List policies and verify it appears
    let app = dispatch_ota::routes::create_router(state.clone());
    let request = common::auth::authenticated_request(
        "GET",
        "/v1/ota/rollout-policies",
        &user.token,
        &user.project_slug,
        None,
    );
    let response = app.oneshot(request).await.unwrap();
    assert_eq!(response.status(), StatusCode::OK);

    let body = response.into_body().collect().await.unwrap().to_bytes();
    let json: serde_json::Value = serde_json::from_slice(&body).unwrap();

    let policies = json.as_array().unwrap();
    assert_eq!(policies.len(), 1);
    assert_eq!(policies[0]["name"], "Gradual Rollout");
    assert_eq!(policies[0]["activeExecutionCount"], 0);

    common::setup::cleanup_test_data(&state.db).await;
}

/// Test rollout policy with thresholds: create a policy with crash_rate threshold,
/// then verify it can be retrieved with threshold details.
#[tokio::test]
async fn test_policy_with_thresholds() {
    let state = common::setup::create_test_state().await;
    common::setup::cleanup_test_data(&state.db).await;

    let user =
        common::fixtures::create_test_user(&state.db, "threshold@test.com", "Threshold User")
            .await;

    let app = dispatch_ota::routes::create_router(state.clone());

    let request = common::auth::authenticated_request(
        "POST",
        "/v1/ota/rollout-policies",
        &user.token,
        &user.project_slug,
        Some(serde_json::json!({
            "name": "Safe Rollout",
            "channel": "production",
            "stages": [
                {
                    "percentage": 10,
                    "durationMinutes": 60,
                    "thresholds": [
                        {
                            "metricType": "crash_rate",
                            "operator": "lt",
                            "value": 0.01,
                            "action": "gate"
                        },
                        {
                            "metricType": "js_error_rate",
                            "operator": "lt",
                            "value": 0.05,
                            "action": "rollback"
                        }
                    ]
                },
                {
                    "percentage": 100
                }
            ]
        })),
    );

    let response = app.oneshot(request).await.unwrap();
    assert_eq!(response.status(), StatusCode::CREATED);

    let body = response.into_body().collect().await.unwrap().to_bytes();
    let json: serde_json::Value = serde_json::from_slice(&body).unwrap();

    let policy_id = json["id"].as_i64().unwrap();
    let stages = json["stages"].as_array().unwrap();
    assert_eq!(stages.len(), 2);

    // First stage should have 2 thresholds
    let first_stage_thresholds = stages[0]["thresholds"].as_array().unwrap();
    assert_eq!(first_stage_thresholds.len(), 2);
    assert_eq!(first_stage_thresholds[0]["metricType"], "crash_rate");
    assert_eq!(first_stage_thresholds[1]["metricType"], "js_error_rate");

    // Verify via GET single policy
    let app = dispatch_ota::routes::create_router(state.clone());
    let request = common::auth::authenticated_request(
        "GET",
        &format!("/v1/ota/rollout-policies/{}", policy_id),
        &user.token,
        &user.project_slug,
        None,
    );
    let response = app.oneshot(request).await.unwrap();
    assert_eq!(response.status(), StatusCode::OK);

    let body = response.into_body().collect().await.unwrap().to_bytes();
    let json: serde_json::Value = serde_json::from_slice(&body).unwrap();
    assert_eq!(json["name"], "Safe Rollout");
    let stages = json["stages"].as_array().unwrap();
    assert_eq!(stages[0]["thresholds"].as_array().unwrap().len(), 2);

    common::setup::cleanup_test_data(&state.db).await;
}
