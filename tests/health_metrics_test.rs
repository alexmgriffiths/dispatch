mod common;

use axum::body::Body;
use axum::http::{Request, StatusCode};
use http_body_util::BodyExt;
use tower::ServiceExt;

use common::setup::{cleanup_test_data, create_test_state};
use common::fixtures::create_test_user;
use dispatch_ota::routes::create_router;

/// Build a health-metrics POST request (public endpoint, no auth required).
fn health_metrics_request(project_slug: &str, events_json: serde_json::Value) -> Request<Body> {
    let body = serde_json::json!({
        "projectSlug": project_slug,
        "deviceId": "test-device-001",
        "platform": "ios",
        "runtimeVersion": "1.0.0",
        "channel": "production",
        "events": events_json,
    });

    Request::builder()
        .method("POST")
        .uri("/v1/ota/health-metrics")
        .header("content-type", "application/json")
        .body(Body::from(serde_json::to_string(&body).unwrap()))
        .unwrap()
}

#[tokio::test]
async fn test_health_metrics_returns_204_and_inserts_raw_events() {
    let state = create_test_state().await;
    cleanup_test_data(&state.db).await;
    let user = create_test_user(&state.db, "hm1@test.com", "HmTest1").await;

    let events = serde_json::json!([
        {
            "type": "app_launch",
            "name": "launch",
            "count": 1,
            "flagStates": {"feature-a": "true"}
        },
        {
            "type": "js_error",
            "name": "TypeError",
            "message": "Cannot read property 'x' of undefined",
            "count": 1,
            "flagStates": {"feature-a": "true"}
        }
    ]);

    let app = create_router(state.clone());
    let req = health_metrics_request(&user.project_slug, events);
    let resp = app.oneshot(req).await.unwrap();

    assert_eq!(resp.status(), StatusCode::NO_CONTENT, "Expected 204 NO_CONTENT");

    // Verify raw events were inserted
    let raw_count = sqlx::query_scalar::<_, i64>(
        "SELECT COUNT(*) FROM health_events_raw WHERE device_id = 'test-device-001'",
    )
    .fetch_one(&state.db)
    .await
    .unwrap();

    assert_eq!(raw_count, 2, "Expected 2 raw events inserted");

    cleanup_test_data(&state.db).await;
}

#[tokio::test]
async fn test_perf_sample_inserts_into_performance_samples() {
    let state = create_test_state().await;
    cleanup_test_data(&state.db).await;
    let user = create_test_user(&state.db, "hm2@test.com", "HmTest2").await;

    let events = serde_json::json!([
        {
            "type": "perf_sample",
            "name": "startup_cold",
            "count": 1,
            "tags": {
                "duration_ms": "1234.5"
            }
        }
    ]);

    let app = create_router(state.clone());
    let req = health_metrics_request(&user.project_slug, events);
    let resp = app.oneshot(req).await.unwrap();

    assert_eq!(resp.status(), StatusCode::NO_CONTENT, "Expected 204 NO_CONTENT");

    // Verify the sample went into performance_samples, NOT health_events_raw
    let perf_count = sqlx::query_scalar::<_, i64>(
        "SELECT COUNT(*) FROM performance_samples WHERE device_id = 'test-device-001'",
    )
    .fetch_one(&state.db)
    .await
    .unwrap();

    assert_eq!(perf_count, 1, "Expected 1 performance sample inserted");

    // Verify it did NOT go into health_events_raw
    let raw_count = sqlx::query_scalar::<_, i64>(
        "SELECT COUNT(*) FROM health_events_raw WHERE device_id = 'test-device-001'",
    )
    .fetch_one(&state.db)
    .await
    .unwrap();

    assert_eq!(raw_count, 0, "perf_sample should NOT be in health_events_raw");

    cleanup_test_data(&state.db).await;
}

#[tokio::test]
async fn test_no_hourly_aggregation_inline() {
    let state = create_test_state().await;
    cleanup_test_data(&state.db).await;
    let user = create_test_user(&state.db, "hm3@test.com", "HmTest3").await;

    let events = serde_json::json!([
        {
            "type": "app_launch",
            "name": "launch",
            "count": 1
        },
        {
            "type": "js_error",
            "name": "Error",
            "message": "test error",
            "count": 3
        }
    ]);

    let app = create_router(state.clone());
    let req = health_metrics_request(&user.project_slug, events);
    let resp = app.oneshot(req).await.unwrap();

    assert_eq!(resp.status(), StatusCode::NO_CONTENT);

    // After ingestion, health_events_hourly should be EMPTY (aggregation moved to background)
    let hourly_count = sqlx::query_scalar::<_, i64>(
        "SELECT COUNT(*) FROM health_events_hourly",
    )
    .fetch_one(&state.db)
    .await
    .unwrap();

    assert_eq!(hourly_count, 0, "Hourly aggregates should NOT be computed inline");

    // Also verify no flag_health_snapshots were computed inline
    let snapshot_count = sqlx::query_scalar::<_, i64>(
        "SELECT COUNT(*) FROM flag_health_snapshots",
    )
    .fetch_one(&state.db)
    .await
    .unwrap();

    assert_eq!(snapshot_count, 0, "Flag health snapshots should NOT be computed inline");

    // And no telemetry_daily_stats
    let daily_count = sqlx::query_scalar::<_, i64>(
        "SELECT COUNT(*) FROM telemetry_daily_stats",
    )
    .fetch_one(&state.db)
    .await
    .unwrap();

    assert_eq!(daily_count, 0, "Daily stats should NOT be computed inline");

    cleanup_test_data(&state.db).await;
}

#[tokio::test]
async fn test_performance_sample_has_correct_fields() {
    let state = create_test_state().await;
    cleanup_test_data(&state.db).await;
    let user = create_test_user(&state.db, "hm4@test.com", "HmTest4").await;

    let events = serde_json::json!([
        {
            "type": "perf_sample",
            "name": "update_download",
            "count": 1,
            "tags": {
                "duration_ms": "567.89"
            }
        }
    ]);

    let app = create_router(state.clone());
    let req = health_metrics_request(&user.project_slug, events);
    let resp = app.oneshot(req).await.unwrap();

    assert_eq!(resp.status(), StatusCode::NO_CONTENT);

    // Verify the performance sample has the correct fields
    let row = sqlx::query_as::<_, (i64, String, String, String, String, f64)>(
        "SELECT project_id, device_id, metric_name, platform, runtime_version, duration_ms \
         FROM performance_samples WHERE device_id = 'test-device-001' LIMIT 1",
    )
    .fetch_one(&state.db)
    .await
    .unwrap();

    let project_id = sqlx::query_scalar::<_, i64>(
        "SELECT id FROM projects WHERE slug = $1",
    )
    .bind(&user.project_slug)
    .fetch_one(&state.db)
    .await
    .unwrap();

    assert_eq!(row.0, project_id, "project_id mismatch");
    assert_eq!(row.1, "test-device-001", "device_id mismatch");
    assert_eq!(row.2, "update_download", "metric_name mismatch");
    assert_eq!(row.3, "ios", "platform mismatch");
    assert_eq!(row.4, "1.0.0", "runtime_version mismatch");
    assert!((row.5 - 567.89).abs() < 0.01, "duration_ms mismatch: got {}", row.5);

    // Also verify channel_name was captured
    let channel: Option<String> = sqlx::query_scalar(
        "SELECT channel_name FROM performance_samples WHERE device_id = 'test-device-001' LIMIT 1",
    )
    .fetch_one(&state.db)
    .await
    .unwrap();

    assert_eq!(channel.as_deref(), Some("production"), "channel_name mismatch");

    cleanup_test_data(&state.db).await;
}
