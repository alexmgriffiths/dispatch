mod common;

use axum::body::Body;
use axum::http::StatusCode;
use http_body_util::BodyExt;
use tower::ServiceExt;

use common::auth::authenticated_request;
use common::fixtures::{create_test_user, get_project_id};
use common::setup::{cleanup_test_data, create_test_state};

/// GET /v1/ota/telemetry/performance returns 200 with metrics array and lastUpdatedAt field
#[tokio::test]
async fn test_performance_returns_metrics_and_last_updated() {
    let state = create_test_state().await;
    cleanup_test_data(&state.db).await;
    let user = create_test_user(&state.db, "perf1@test.com", "PerfTest1").await;
    let project_id = get_project_id(&state.db, &user.project_slug).await;

    // Insert known perf_hourly_aggregates data
    let now = chrono::Utc::now();
    let bucket = now - chrono::Duration::hours(1);
    let bucket_hour = bucket
        .date_naive()
        .and_hms_opt(bucket.time().hour(), 0, 0)
        .unwrap()
        .and_utc();

    sqlx::query(
        "INSERT INTO perf_hourly_aggregates \
         (project_id, bucket_hour, channel_name, platform, runtime_version, \
          metric_name, sample_count, p50, p95, p99) \
         VALUES ($1, $2, 'production', 'ios', '1.0.0', 'startup_cold', 10, 200.0, 450.0, 490.0)",
    )
    .bind(project_id)
    .bind(bucket_hour)
    .execute(&state.db)
    .await
    .unwrap();

    // Insert aggregation_runs entry
    sqlx::query(
        "INSERT INTO aggregation_runs (completed_at, duration_ms, projects_processed) \
         VALUES (NOW(), 50, 1)",
    )
    .execute(&state.db)
    .await
    .unwrap();

    let app = dispatch_ota::routes::create_router(state.clone());
    let req = authenticated_request(
        "GET",
        "/v1/ota/telemetry/performance",
        &user.token,
        &user.project_slug,
        None,
    );
    let response = app.oneshot(req).await.unwrap();

    assert_eq!(response.status(), StatusCode::OK);

    let body = response.into_body().collect().await.unwrap().to_bytes();
    let json: serde_json::Value = serde_json::from_slice(&body).unwrap();

    // Response should have metrics array and lastUpdatedAt
    assert!(json["metrics"].is_array(), "Expected metrics array, got {:?}", json);
    assert!(json["lastUpdatedAt"].is_string(), "Expected lastUpdatedAt string, got {:?}", json);

    // Metrics should contain startup_cold
    let metrics = json["metrics"].as_array().unwrap();
    let cold = metrics.iter().find(|m| m["metricName"] == "startup_cold");
    assert!(cold.is_some(), "Expected startup_cold metric in response");

    let cold = cold.unwrap();
    assert!(cold["points"].is_array(), "Expected points array");
    assert!(cold["latest"].is_object(), "Expected latest object");

    cleanup_test_data(&state.db).await;
}

/// Performance response groups by metric_name
#[tokio::test]
async fn test_performance_groups_by_metric_name() {
    let state = create_test_state().await;
    cleanup_test_data(&state.db).await;
    let user = create_test_user(&state.db, "perf2@test.com", "PerfTest2").await;
    let project_id = get_project_id(&state.db, &user.project_slug).await;

    let now = chrono::Utc::now();
    let bucket_hour = (now - chrono::Duration::hours(1))
        .date_naive()
        .and_hms_opt((now - chrono::Duration::hours(1)).time().hour(), 0, 0)
        .unwrap()
        .and_utc();

    // Insert data for multiple metrics
    for metric in &["startup_cold", "startup_warm", "update_download", "flag_eval"] {
        sqlx::query(
            "INSERT INTO perf_hourly_aggregates \
             (project_id, bucket_hour, channel_name, platform, runtime_version, \
              metric_name, sample_count, p50, p95, p99) \
             VALUES ($1, $2, 'production', 'ios', '1.0.0', $3, 5, 100.0, 200.0, 300.0)",
        )
        .bind(project_id)
        .bind(bucket_hour)
        .bind(*metric)
        .execute(&state.db)
        .await
        .unwrap();
    }

    let app = dispatch_ota::routes::create_router(state.clone());
    let req = authenticated_request(
        "GET",
        "/v1/ota/telemetry/performance",
        &user.token,
        &user.project_slug,
        None,
    );
    let response = app.oneshot(req).await.unwrap();
    assert_eq!(response.status(), StatusCode::OK);

    let body = response.into_body().collect().await.unwrap().to_bytes();
    let json: serde_json::Value = serde_json::from_slice(&body).unwrap();

    let metrics = json["metrics"].as_array().unwrap();
    let names: Vec<&str> = metrics.iter().map(|m| m["metricName"].as_str().unwrap()).collect();

    assert!(names.contains(&"startup_cold"), "Missing startup_cold");
    assert!(names.contains(&"startup_warm"), "Missing startup_warm");
    assert!(names.contains(&"update_download"), "Missing update_download");
    assert!(names.contains(&"flag_eval"), "Missing flag_eval");

    cleanup_test_data(&state.db).await;
}

/// Filtering by channel_name query param narrows results
#[tokio::test]
async fn test_performance_filters_by_channel() {
    let state = create_test_state().await;
    cleanup_test_data(&state.db).await;
    let user = create_test_user(&state.db, "perf3@test.com", "PerfTest3").await;
    let project_id = get_project_id(&state.db, &user.project_slug).await;

    let now = chrono::Utc::now();
    let bucket_hour = (now - chrono::Duration::hours(1))
        .date_naive()
        .and_hms_opt((now - chrono::Duration::hours(1)).time().hour(), 0, 0)
        .unwrap()
        .and_utc();

    // Insert data for two channels
    sqlx::query(
        "INSERT INTO perf_hourly_aggregates \
         (project_id, bucket_hour, channel_name, platform, runtime_version, \
          metric_name, sample_count, p50, p95, p99) \
         VALUES ($1, $2, 'production', 'ios', '1.0.0', 'startup_cold', 10, 200.0, 450.0, 490.0), \
                ($1, $2, 'staging', 'ios', '1.0.0', 'startup_cold', 5, 300.0, 550.0, 590.0)",
    )
    .bind(project_id)
    .bind(bucket_hour)
    .execute(&state.db)
    .await
    .unwrap();

    let app = dispatch_ota::routes::create_router(state.clone());
    let req = authenticated_request(
        "GET",
        "/v1/ota/telemetry/performance?channel=staging",
        &user.token,
        &user.project_slug,
        None,
    );
    let response = app.oneshot(req).await.unwrap();
    assert_eq!(response.status(), StatusCode::OK);

    let body = response.into_body().collect().await.unwrap().to_bytes();
    let json: serde_json::Value = serde_json::from_slice(&body).unwrap();

    let metrics = json["metrics"].as_array().unwrap();
    assert!(!metrics.is_empty(), "Expected at least one metric for staging");

    // Verify that the data is for staging (p50 should be 300, not 200)
    let cold = metrics.iter().find(|m| m["metricName"] == "startup_cold").unwrap();
    let latest = &cold["latest"];
    assert!(
        (latest["p50"].as_f64().unwrap() - 300.0).abs() < 0.01,
        "Expected p50=300 for staging, got {}",
        latest["p50"]
    );

    cleanup_test_data(&state.db).await;
}

/// lastUpdatedAt reflects the most recent aggregation_runs.completed_at
#[tokio::test]
async fn test_performance_last_updated_at_reflects_aggregation_runs() {
    let state = create_test_state().await;
    cleanup_test_data(&state.db).await;
    let user = create_test_user(&state.db, "perf4@test.com", "PerfTest4").await;

    // Insert two aggregation runs with different timestamps
    sqlx::query(
        "INSERT INTO aggregation_runs (completed_at, duration_ms, projects_processed) \
         VALUES (NOW() - INTERVAL '10 minutes', 50, 1), \
                (NOW(), 50, 1)",
    )
    .execute(&state.db)
    .await
    .unwrap();

    let app = dispatch_ota::routes::create_router(state.clone());
    let req = authenticated_request(
        "GET",
        "/v1/ota/telemetry/performance",
        &user.token,
        &user.project_slug,
        None,
    );
    let response = app.oneshot(req).await.unwrap();
    assert_eq!(response.status(), StatusCode::OK);

    let body = response.into_body().collect().await.unwrap().to_bytes();
    let json: serde_json::Value = serde_json::from_slice(&body).unwrap();

    // lastUpdatedAt should be the most recent (NOW()), not 10 min ago
    let last_updated = json["lastUpdatedAt"].as_str().unwrap();
    let parsed = chrono::DateTime::parse_from_rfc3339(last_updated).unwrap();
    let age = chrono::Utc::now() - parsed.with_timezone(&chrono::Utc);
    assert!(
        age.num_seconds() < 60,
        "Expected lastUpdatedAt to be recent (within 60s), but age is {}s",
        age.num_seconds()
    );

    cleanup_test_data(&state.db).await;
}

/// When no aggregation has run, lastUpdatedAt is null
#[tokio::test]
async fn test_performance_last_updated_at_null_when_no_runs() {
    let state = create_test_state().await;
    cleanup_test_data(&state.db).await;
    let user = create_test_user(&state.db, "perf5@test.com", "PerfTest5").await;

    // No aggregation_runs inserted

    let app = dispatch_ota::routes::create_router(state.clone());
    let req = authenticated_request(
        "GET",
        "/v1/ota/telemetry/performance",
        &user.token,
        &user.project_slug,
        None,
    );
    let response = app.oneshot(req).await.unwrap();
    assert_eq!(response.status(), StatusCode::OK);

    let body = response.into_body().collect().await.unwrap().to_bytes();
    let json: serde_json::Value = serde_json::from_slice(&body).unwrap();

    assert!(json["lastUpdatedAt"].is_null(), "Expected lastUpdatedAt to be null, got {:?}", json["lastUpdatedAt"]);

    cleanup_test_data(&state.db).await;
}

/// Performance timeseries points include p50, p95, p99 values
#[tokio::test]
async fn test_performance_points_have_percentile_values() {
    let state = create_test_state().await;
    cleanup_test_data(&state.db).await;
    let user = create_test_user(&state.db, "perf6@test.com", "PerfTest6").await;
    let project_id = get_project_id(&state.db, &user.project_slug).await;

    let now = chrono::Utc::now();
    // Insert two hourly buckets
    for hours_ago in 1..=2 {
        let bucket = now - chrono::Duration::hours(hours_ago);
        let bucket_hour = bucket
            .date_naive()
            .and_hms_opt(bucket.time().hour(), 0, 0)
            .unwrap()
            .and_utc();

        sqlx::query(
            "INSERT INTO perf_hourly_aggregates \
             (project_id, bucket_hour, channel_name, platform, runtime_version, \
              metric_name, sample_count, p50, p95, p99) \
             VALUES ($1, $2, 'production', 'ios', '1.0.0', 'startup_cold', 10, $3, $4, $5)",
        )
        .bind(project_id)
        .bind(bucket_hour)
        .bind(100.0 * hours_ago as f64)
        .bind(200.0 * hours_ago as f64)
        .bind(300.0 * hours_ago as f64)
        .execute(&state.db)
        .await
        .unwrap();
    }

    let app = dispatch_ota::routes::create_router(state.clone());
    let req = authenticated_request(
        "GET",
        "/v1/ota/telemetry/performance",
        &user.token,
        &user.project_slug,
        None,
    );
    let response = app.oneshot(req).await.unwrap();
    assert_eq!(response.status(), StatusCode::OK);

    let body = response.into_body().collect().await.unwrap().to_bytes();
    let json: serde_json::Value = serde_json::from_slice(&body).unwrap();

    let metrics = json["metrics"].as_array().unwrap();
    let cold = metrics.iter().find(|m| m["metricName"] == "startup_cold").unwrap();
    let points = cold["points"].as_array().unwrap();

    assert_eq!(points.len(), 2, "Expected 2 points, got {}", points.len());

    // Each point should have p50, p95, p99, sampleCount, bucketHour
    let point = &points[0];
    assert!(point["p50"].is_f64(), "Expected p50 as float");
    assert!(point["p95"].is_f64(), "Expected p95 as float");
    assert!(point["p99"].is_f64(), "Expected p99 as float");
    assert!(point["sampleCount"].is_i64(), "Expected sampleCount as integer");
    assert!(point["bucketHour"].is_string(), "Expected bucketHour as string");

    cleanup_test_data(&state.db).await;
}

use chrono::Timelike;
