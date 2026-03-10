mod common;

use axum::http::StatusCode;
use http_body_util::BodyExt;
use tower::ServiceExt;

// ── Test helpers ────────────────────────────────────────────────────────

/// Create a project directly via SQL and return (project_id, slug).
async fn create_project(db: &sqlx::PgPool, slug: &str) -> i64 {
    sqlx::query_scalar::<_, i64>(
        "INSERT INTO projects (name, slug) VALUES ($1, $2) RETURNING id",
    )
    .bind(format!("{} project", slug))
    .bind(slug)
    .fetch_one(db)
    .await
    .expect("Failed to insert project")
}

/// Create a feature flag and return the flag_id.
async fn create_flag(
    db: &sqlx::PgPool,
    project_id: i64,
    key: &str,
    flag_type: &str,
    default_value: serde_json::Value,
    enabled: bool,
) -> i64 {
    sqlx::query_scalar::<_, i64>(
        "INSERT INTO feature_flags (project_id, key, name, flag_type, default_value, enabled)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING id",
    )
    .bind(project_id)
    .bind(key)
    .bind(key) // name = key
    .bind(flag_type)
    .bind(&default_value)
    .bind(enabled)
    .fetch_one(db)
    .await
    .expect("Failed to insert flag")
}

/// Create a flag variation and return the variation_id.
async fn create_variation(
    db: &sqlx::PgPool,
    flag_id: i64,
    value: serde_json::Value,
    name: &str,
    sort_order: i32,
) -> i64 {
    sqlx::query_scalar::<_, i64>(
        "INSERT INTO flag_variations (flag_id, value, name, sort_order)
         VALUES ($1, $2, $3, $4) RETURNING id",
    )
    .bind(flag_id)
    .bind(&value)
    .bind(name)
    .bind(sort_order)
    .fetch_one(db)
    .await
    .expect("Failed to insert variation")
}

/// Create a targeting rule for a flag.
async fn create_rule(
    db: &sqlx::PgPool,
    flag_id: i64,
    priority: i32,
    rule_type: &str,
    variant_value: serde_json::Value,
    rule_config: serde_json::Value,
    channel_name: Option<&str>,
) {
    sqlx::query(
        "INSERT INTO flag_targeting_rules (flag_id, priority, rule_type, variant_value, rule_config, channel_name)
         VALUES ($1, $2, $3, $4, $5, $6)",
    )
    .bind(flag_id)
    .bind(priority)
    .bind(rule_type)
    .bind(&variant_value)
    .bind(&rule_config)
    .bind(channel_name)
    .execute(db)
    .await
    .expect("Failed to insert rule");
}

/// Create a flag env setting for a specific channel.
async fn create_env_setting(
    db: &sqlx::PgPool,
    flag_id: i64,
    channel_name: &str,
    enabled: bool,
    default_value: serde_json::Value,
) {
    sqlx::query(
        "INSERT INTO flag_env_settings (flag_id, channel_name, enabled, default_value)
         VALUES ($1, $2, $3, $4)",
    )
    .bind(flag_id)
    .bind(channel_name)
    .bind(enabled)
    .bind(&default_value)
    .execute(db)
    .await
    .expect("Failed to insert env setting");
}

/// Build a bulk eval request as an axum Request.
fn bulk_eval_request(body: serde_json::Value) -> axum::http::Request<axum::body::Body> {
    axum::http::Request::builder()
        .method("POST")
        .uri("/v1/ota/flag-evaluations-bulk")
        .header("content-type", "application/json")
        .body(axum::body::Body::from(serde_json::to_string(&body).unwrap()))
        .unwrap()
}

// ── Test 1: Empty flags ─────────────────────────────────────────────────

/// POST /v1/ota/flag-evaluations-bulk with valid project slug returns 200
/// with empty flags when no flags exist for the project.
#[tokio::test]
async fn test_bulk_eval_empty_flags() {
    let state = common::setup::create_test_state().await;
    common::setup::cleanup_test_data(&state.db).await;

    let project_id = create_project(&state.db, "empty-flags-proj").await;
    let _ = project_id; // just need the project to exist

    let app = dispatch_ota::routes::create_router(state.clone());
    let request = bulk_eval_request(serde_json::json!({
        "projectSlug": "empty-flags-proj",
        "deviceId": "device-001"
    }));

    let response = app.oneshot(request).await.unwrap();
    assert_eq!(response.status(), StatusCode::OK);

    let body = response.into_body().collect().await.unwrap().to_bytes();
    let json: serde_json::Value = serde_json::from_slice(&body).unwrap();
    let flags = json["flags"].as_object().unwrap();
    assert!(flags.is_empty(), "Expected empty flags map, got: {:?}", flags);

    common::setup::cleanup_test_data(&state.db).await;
}

// ── Test 2: Enabled flags return evaluated results ──────────────────────

/// POST /v1/ota/flag-evaluations-bulk with project that has flags returns
/// evaluated results for each enabled flag.
#[tokio::test]
async fn test_bulk_eval_enabled_flags() {
    let state = common::setup::create_test_state().await;
    common::setup::cleanup_test_data(&state.db).await;

    let project_id = create_project(&state.db, "enabled-flags-proj").await;

    // Create a boolean flag (enabled, default false)
    let flag_id = create_flag(
        &state.db, project_id, "my-bool-flag", "boolean",
        serde_json::json!(false), true,
    ).await;
    create_variation(&state.db, flag_id, serde_json::json!(true), "On", 0).await;
    create_variation(&state.db, flag_id, serde_json::json!(false), "Off", 1).await;

    // Create a string flag (enabled, default "red")
    let flag_id2 = create_flag(
        &state.db, project_id, "color-flag", "string",
        serde_json::json!("red"), true,
    ).await;
    create_variation(&state.db, flag_id2, serde_json::json!("red"), "Red", 0).await;
    create_variation(&state.db, flag_id2, serde_json::json!("blue"), "Blue", 1).await;

    let app = dispatch_ota::routes::create_router(state.clone());
    let request = bulk_eval_request(serde_json::json!({
        "projectSlug": "enabled-flags-proj",
        "deviceId": "device-002"
    }));

    let response = app.oneshot(request).await.unwrap();
    assert_eq!(response.status(), StatusCode::OK);

    let body = response.into_body().collect().await.unwrap().to_bytes();
    let json: serde_json::Value = serde_json::from_slice(&body).unwrap();
    let flags = json["flags"].as_object().unwrap();

    assert_eq!(flags.len(), 2, "Expected 2 flags, got: {:?}", flags);

    // Boolean flag should eval to default (false) with reason DEFAULT
    let bool_flag = &flags["my-bool-flag"];
    assert_eq!(bool_flag["value"], false);
    assert_eq!(bool_flag["reason"], "DEFAULT");
    assert_eq!(bool_flag["variant"], "Off");

    // String flag should eval to default ("red") with reason DEFAULT
    let color_flag = &flags["color-flag"];
    assert_eq!(color_flag["value"], "red");
    assert_eq!(color_flag["reason"], "DEFAULT");
    assert_eq!(color_flag["variant"], "Red");

    common::setup::cleanup_test_data(&state.db).await;
}

// ── Test 3: Disabled flags return DISABLED reason ───────────────────────

/// Disabled flags are included in response with reason "DISABLED".
#[tokio::test]
async fn test_bulk_eval_disabled_flags() {
    let state = common::setup::create_test_state().await;
    common::setup::cleanup_test_data(&state.db).await;

    let project_id = create_project(&state.db, "disabled-flags-proj").await;

    // Create a disabled flag
    let flag_id = create_flag(
        &state.db, project_id, "disabled-flag", "boolean",
        serde_json::json!(false), false,
    ).await;
    create_variation(&state.db, flag_id, serde_json::json!(true), "On", 0).await;
    create_variation(&state.db, flag_id, serde_json::json!(false), "Off", 1).await;

    let app = dispatch_ota::routes::create_router(state.clone());
    let request = bulk_eval_request(serde_json::json!({
        "projectSlug": "disabled-flags-proj",
        "deviceId": "device-003"
    }));

    let response = app.oneshot(request).await.unwrap();
    assert_eq!(response.status(), StatusCode::OK);

    let body = response.into_body().collect().await.unwrap().to_bytes();
    let json: serde_json::Value = serde_json::from_slice(&body).unwrap();
    let flags = json["flags"].as_object().unwrap();

    let disabled = &flags["disabled-flag"];
    assert_eq!(disabled["value"], false);
    assert_eq!(disabled["reason"], "DISABLED");

    common::setup::cleanup_test_data(&state.db).await;
}

// ── Test 4: user_list rule matching targeting_key ────────────────────────

/// Flag with user_list rule matching the targeting_key returns TARGETING_MATCH.
#[tokio::test]
async fn test_bulk_eval_user_list_match() {
    let state = common::setup::create_test_state().await;
    common::setup::cleanup_test_data(&state.db).await;

    let project_id = create_project(&state.db, "userlist-proj").await;

    let flag_id = create_flag(
        &state.db, project_id, "user-targeted-flag", "boolean",
        serde_json::json!(false), true,
    ).await;
    create_variation(&state.db, flag_id, serde_json::json!(true), "On", 0).await;
    create_variation(&state.db, flag_id, serde_json::json!(false), "Off", 1).await;

    // Add a user_list rule that targets "special-user"
    // The evaluator expects "userIds" as a comma-separated string
    create_rule(
        &state.db, flag_id, 1, "user_list",
        serde_json::json!(true), // variant_value: serve "true" to matched users
        serde_json::json!({ "userIds": "special-user,another-user" }),
        None,
    ).await;

    let app = dispatch_ota::routes::create_router(state.clone());

    // Request with matching targeting_key
    let request = bulk_eval_request(serde_json::json!({
        "projectSlug": "userlist-proj",
        "deviceId": "device-004",
        "targetingKey": "special-user"
    }));

    let response = app.oneshot(request).await.unwrap();
    assert_eq!(response.status(), StatusCode::OK);

    let body = response.into_body().collect().await.unwrap().to_bytes();
    let json: serde_json::Value = serde_json::from_slice(&body).unwrap();
    let flags = json["flags"].as_object().unwrap();

    let flag = &flags["user-targeted-flag"];
    assert_eq!(flag["value"], true);
    assert_eq!(flag["reason"], "TARGETING_MATCH");

    // Request with non-matching targeting_key should get DEFAULT
    let app2 = dispatch_ota::routes::create_router(state.clone());
    let request2 = bulk_eval_request(serde_json::json!({
        "projectSlug": "userlist-proj",
        "deviceId": "device-005",
        "targetingKey": "regular-user"
    }));

    let response2 = app2.oneshot(request2).await.unwrap();
    let body2 = response2.into_body().collect().await.unwrap().to_bytes();
    let json2: serde_json::Value = serde_json::from_slice(&body2).unwrap();
    let flag2 = &json2["flags"]["user-targeted-flag"];
    assert_eq!(flag2["value"], false);
    assert_eq!(flag2["reason"], "DEFAULT");

    common::setup::cleanup_test_data(&state.db).await;
}

// ── Test 5: percentage_rollout returns SPLIT with deterministic bucket ──

/// Flag with percentage_rollout rule returns SPLIT with deterministic bucket.
#[tokio::test]
async fn test_bulk_eval_percentage_rollout() {
    let state = common::setup::create_test_state().await;
    common::setup::cleanup_test_data(&state.db).await;

    let project_id = create_project(&state.db, "rollout-proj").await;

    let flag_id = create_flag(
        &state.db, project_id, "rollout-flag", "boolean",
        serde_json::json!(false), true,
    ).await;
    let on_var_id = create_variation(&state.db, flag_id, serde_json::json!(true), "On", 0).await;
    create_variation(&state.db, flag_id, serde_json::json!(false), "Off", 1).await;

    // 100% rollout: all users should get the "On" variation
    // The evaluator expects "rollout" array with {variationId, weight} objects
    create_rule(
        &state.db, flag_id, 1, "percentage_rollout",
        serde_json::json!(null),
        serde_json::json!({ "rollout": [{"variationId": on_var_id, "weight": 100}] }),
        None,
    ).await;

    let app = dispatch_ota::routes::create_router(state.clone());
    let request = bulk_eval_request(serde_json::json!({
        "projectSlug": "rollout-proj",
        "deviceId": "device-006",
        "targetingKey": "user-for-rollout"
    }));

    let response = app.oneshot(request).await.unwrap();
    assert_eq!(response.status(), StatusCode::OK);

    let body = response.into_body().collect().await.unwrap().to_bytes();
    let json: serde_json::Value = serde_json::from_slice(&body).unwrap();
    let flag = &json["flags"]["rollout-flag"];
    assert_eq!(flag["value"], true);
    assert_eq!(flag["reason"], "SPLIT");

    // 0% rollout: empty rollout array means nobody gets a variant -> falls through to DEFAULT
    common::setup::cleanup_test_data(&state.db).await;
    let project_id = create_project(&state.db, "rollout-proj-zero").await;
    let flag_id = create_flag(
        &state.db, project_id, "rollout-flag-zero", "boolean",
        serde_json::json!(false), true,
    ).await;
    let on_var_id2 = create_variation(&state.db, flag_id, serde_json::json!(true), "On", 0).await;
    create_variation(&state.db, flag_id, serde_json::json!(false), "Off", 1).await;
    // 0 weight means nobody gets this variation, so all users fall through to DEFAULT
    create_rule(
        &state.db, flag_id, 1, "percentage_rollout",
        serde_json::json!(null),
        serde_json::json!({ "rollout": [{"variationId": on_var_id2, "weight": 0}] }),
        None,
    ).await;

    let app2 = dispatch_ota::routes::create_router(state.clone());
    let request2 = bulk_eval_request(serde_json::json!({
        "projectSlug": "rollout-proj-zero",
        "deviceId": "device-006",
        "targetingKey": "user-for-rollout"
    }));

    let response2 = app2.oneshot(request2).await.unwrap();
    let body2 = response2.into_body().collect().await.unwrap().to_bytes();
    let json2: serde_json::Value = serde_json::from_slice(&body2).unwrap();
    let flag2 = &json2["flags"]["rollout-flag-zero"];
    assert_eq!(flag2["value"], false);
    assert_eq!(flag2["reason"], "DEFAULT");

    common::setup::cleanup_test_data(&state.db).await;
}

// ── Test 6: Linked flag gating via attribute rules (SDK-04) ─────────────

/// Flag with attribute rule checking runtime_version evaluates correctly
/// based on context. This tests the linked-flag gating pattern (SDK-04).
#[tokio::test]
async fn test_bulk_eval_linked_flag_gating() {
    let state = common::setup::create_test_state().await;
    common::setup::cleanup_test_data(&state.db).await;

    let project_id = create_project(&state.db, "linked-proj").await;

    let flag_id = create_flag(
        &state.db, project_id, "gated-feature", "boolean",
        serde_json::json!(false), true,
    ).await;
    create_variation(&state.db, flag_id, serde_json::json!(true), "On", 0).await;
    create_variation(&state.db, flag_id, serde_json::json!(false), "Off", 1).await;

    // Attribute rule: enable for devices with runtime_version >= "2.0.0"
    // The evaluator expects "values" as an array of strings
    create_rule(
        &state.db, flag_id, 1, "attribute",
        serde_json::json!(true),
        serde_json::json!({
            "conditions": [{
                "attribute": "runtime_version",
                "operator": "semver_gte",
                "values": ["2.0.0"]
            }]
        }),
        None,
    ).await;

    let app = dispatch_ota::routes::create_router(state.clone());

    // Device with runtime_version 2.1.0 >= 2.0.0: should get TARGETING_MATCH
    let request = bulk_eval_request(serde_json::json!({
        "projectSlug": "linked-proj",
        "deviceId": "device-007",
        "runtimeVersion": "2.1.0"
    }));

    let response = app.oneshot(request).await.unwrap();
    assert_eq!(response.status(), StatusCode::OK);

    let body = response.into_body().collect().await.unwrap().to_bytes();
    let json: serde_json::Value = serde_json::from_slice(&body).unwrap();
    let flag = &json["flags"]["gated-feature"];
    assert_eq!(flag["value"], true, "Device with runtime_version 2.1.0 should match semver_gte 2.0.0");
    assert_eq!(flag["reason"], "TARGETING_MATCH");

    // Device with runtime_version 1.5.0 < 2.0.0: should get DEFAULT
    let app2 = dispatch_ota::routes::create_router(state.clone());
    let request2 = bulk_eval_request(serde_json::json!({
        "projectSlug": "linked-proj",
        "deviceId": "device-008",
        "runtimeVersion": "1.5.0"
    }));

    let response2 = app2.oneshot(request2).await.unwrap();
    let body2 = response2.into_body().collect().await.unwrap().to_bytes();
    let json2: serde_json::Value = serde_json::from_slice(&body2).unwrap();
    let flag2 = &json2["flags"]["gated-feature"];
    assert_eq!(flag2["value"], false, "Device with runtime_version 1.5.0 should NOT match semver_gte 2.0.0");
    assert_eq!(flag2["reason"], "DEFAULT");

    common::setup::cleanup_test_data(&state.db).await;
}

// ── Test 7: Invalid project slug returns 404 ───────────────────────────

/// POST with invalid project slug returns 404.
#[tokio::test]
async fn test_bulk_eval_invalid_project() {
    let state = common::setup::create_test_state().await;
    common::setup::cleanup_test_data(&state.db).await;

    let app = dispatch_ota::routes::create_router(state.clone());
    let request = bulk_eval_request(serde_json::json!({
        "projectSlug": "nonexistent-project",
        "deviceId": "device-009"
    }));

    let response = app.oneshot(request).await.unwrap();
    assert_eq!(response.status(), StatusCode::NOT_FOUND);

    common::setup::cleanup_test_data(&state.db).await;
}

// ── Test 8: SSE stream opens and receives initial put event ─────────────

/// GET /v1/ota/flag-stream/{project_slug} opens SSE connection and receives
/// initial put event with all evaluated flags.
#[tokio::test]
async fn test_flag_stream_initial_put() {
    let state = common::setup::create_test_state().await;
    common::setup::cleanup_test_data(&state.db).await;

    let project_id = create_project(&state.db, "stream-proj").await;

    let flag_id = create_flag(
        &state.db, project_id, "streamed-flag", "boolean",
        serde_json::json!(false), true,
    ).await;
    create_variation(&state.db, flag_id, serde_json::json!(true), "On", 0).await;
    create_variation(&state.db, flag_id, serde_json::json!(false), "Off", 1).await;

    let app = dispatch_ota::routes::create_router(state.clone());

    let request = axum::http::Request::builder()
        .method("GET")
        .uri("/v1/ota/flag-stream/stream-proj?device_id=device-010")
        .header("accept", "text/event-stream")
        .body(axum::body::Body::empty())
        .unwrap();

    let response = app.oneshot(request).await.unwrap();
    assert_eq!(response.status(), StatusCode::OK);

    // Read the response body with a timeout to avoid hanging
    let body_result = tokio::time::timeout(
        std::time::Duration::from_secs(2),
        async {
            // Collect a chunk of the SSE stream
            let mut body = response.into_body();
            let mut collected = Vec::new();
            // Read one frame -- the initial put event
            if let Some(frame) = http_body_util::BodyExt::frame(&mut body).await {
                if let Ok(frame) = frame {
                    if let Some(data) = frame.data_ref() {
                        collected.extend_from_slice(data);
                    }
                }
            }
            String::from_utf8(collected).unwrap_or_default()
        }
    ).await;

    let sse_text = body_result.expect("SSE stream should deliver initial put event within 2 seconds");

    // Verify it contains an SSE put event with the flag data
    assert!(sse_text.contains("event: put"), "SSE should contain a put event, got: {:?}", sse_text);
    assert!(sse_text.contains("streamed-flag"), "SSE put data should contain the flag key, got: {:?}", sse_text);

    common::setup::cleanup_test_data(&state.db).await;
}
