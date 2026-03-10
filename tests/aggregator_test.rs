mod common;

use common::setup::{cleanup_test_data, create_test_state};
use common::fixtures::{create_test_user, create_test_flag, get_project_id};
use dispatch_ota::jobs::aggregator::run_aggregation_cycle;

#[tokio::test]
async fn test_aggregation_processes_hourly_from_raw_events() {
    let state = create_test_state().await;
    cleanup_test_data(&state.db).await;
    let user = create_test_user(&state.db, "agg1@test.com", "AggTest1").await;
    let project_id = get_project_id(&state.db, &user.project_slug).await;

    // Insert raw health events directly via SQL
    sqlx::query(
        "INSERT INTO health_events_raw \
         (project_id, device_id, channel_name, platform, runtime_version, \
          event_type, event_name, count) \
         VALUES ($1, 'device-1', 'production', 'ios', '1.0.0', 'app_launch', 'launch', 1), \
                ($1, 'device-1', 'production', 'ios', '1.0.0', 'js_error', 'TypeError', 2), \
                ($1, 'device-2', 'production', 'ios', '1.0.0', 'app_launch', 'launch', 1)",
    )
    .bind(project_id)
    .execute(&state.db)
    .await
    .unwrap();

    // Run aggregation
    run_aggregation_cycle(&state.db).await.unwrap();

    // Verify health_events_hourly was populated
    let hourly_count = sqlx::query_scalar::<_, i64>(
        "SELECT COUNT(*) FROM health_events_hourly WHERE project_id = $1",
    )
    .bind(project_id)
    .fetch_one(&state.db)
    .await
    .unwrap();

    assert!(hourly_count > 0, "Expected hourly aggregates to be created, got {}", hourly_count);

    cleanup_test_data(&state.db).await;
}

#[tokio::test]
async fn test_aggregation_computes_flag_health_snapshots() {
    let state = create_test_state().await;
    cleanup_test_data(&state.db).await;
    let user = create_test_user(&state.db, "agg2@test.com", "AggTest2").await;
    let project_id = get_project_id(&state.db, &user.project_slug).await;
    let _flag_id = create_test_flag(&state.db, project_id, "test-flag").await;

    // Insert raw events with flag_states
    sqlx::query(
        "INSERT INTO health_events_raw \
         (project_id, device_id, channel_name, platform, runtime_version, \
          event_type, event_name, count, flag_states) \
         VALUES ($1, 'device-1', 'production', 'ios', '1.0.0', 'app_launch', 'launch', 5, \
                 '{\"test-flag\": \"true\"}'::jsonb), \
                ($1, 'device-1', 'production', 'ios', '1.0.0', 'js_error', 'Error', 1, \
                 '{\"test-flag\": \"true\"}'::jsonb)",
    )
    .bind(project_id)
    .execute(&state.db)
    .await
    .unwrap();

    // Run aggregation
    run_aggregation_cycle(&state.db).await.unwrap();

    // Verify flag_health_snapshots was populated
    let snapshot_count = sqlx::query_scalar::<_, i64>(
        "SELECT COUNT(*) FROM flag_health_snapshots",
    )
    .fetch_one(&state.db)
    .await
    .unwrap();

    assert!(snapshot_count > 0, "Expected flag health snapshots to be created, got {}", snapshot_count);

    cleanup_test_data(&state.db).await;
}

#[tokio::test]
async fn test_aggregation_detects_anomalies() {
    let state = create_test_state().await;
    cleanup_test_data(&state.db).await;
    let user = create_test_user(&state.db, "agg3@test.com", "AggTest3").await;
    let project_id = get_project_id(&state.db, &user.project_slug).await;

    // Insert historical hourly data (low error rate baseline over 24h)
    let now = chrono::Utc::now();
    for hours_ago in 1..24 {
        let bucket = now - chrono::Duration::hours(hours_ago);
        let bucket_hour = bucket
            .date_naive()
            .and_hms_opt(bucket.time().hour(), 0, 0)
            .unwrap()
            .and_utc();

        sqlx::query(
            "INSERT INTO health_events_hourly \
             (project_id, bucket_hour, channel_name, platform, runtime_version, \
              update_uuid, event_type, event_name, total_count, unique_devices) \
             VALUES ($1, $2, 'production', 'ios', '1.0.0', '', 'js_error', 'Error', 2, 1)",
        )
        .bind(project_id)
        .bind(bucket_hour)
        .execute(&state.db)
        .await
        .unwrap();
    }

    // Insert current raw events with a spike (well above 2x the avg of 2)
    for _ in 0..20 {
        sqlx::query(
            "INSERT INTO health_events_raw \
             (project_id, device_id, channel_name, platform, runtime_version, \
              event_type, event_name, count) \
             VALUES ($1, 'device-1', 'production', 'ios', '1.0.0', 'js_error', 'Error', 1)",
        )
        .bind(project_id)
        .execute(&state.db)
        .await
        .unwrap();
    }

    // Run aggregation (which includes anomaly detection)
    run_aggregation_cycle(&state.db).await.unwrap();

    // Verify anomaly was detected and inserted
    let anomaly_count = sqlx::query_scalar::<_, i64>(
        "SELECT COUNT(*) FROM telemetry_events WHERE project_id = $1 AND event_type = 'error_spike'",
    )
    .bind(project_id)
    .fetch_one(&state.db)
    .await
    .unwrap();

    assert!(anomaly_count > 0, "Expected anomaly detection to insert telemetry events, got {}", anomaly_count);

    cleanup_test_data(&state.db).await;
}

#[tokio::test]
async fn test_aggregation_computes_performance_percentiles() {
    let state = create_test_state().await;
    cleanup_test_data(&state.db).await;
    let user = create_test_user(&state.db, "agg4@test.com", "AggTest4").await;
    let project_id = get_project_id(&state.db, &user.project_slug).await;

    // Insert performance samples with known values
    for duration in &[100.0, 200.0, 300.0, 400.0, 500.0] {
        sqlx::query(
            "INSERT INTO performance_samples \
             (project_id, device_id, channel_name, platform, runtime_version, \
              metric_name, duration_ms) \
             VALUES ($1, 'device-1', 'production', 'ios', '1.0.0', 'startup_cold', $2)",
        )
        .bind(project_id)
        .bind(*duration)
        .execute(&state.db)
        .await
        .unwrap();
    }

    // Run aggregation
    run_aggregation_cycle(&state.db).await.unwrap();

    // Verify perf_hourly_aggregates was populated
    let agg = sqlx::query_as::<_, (i32, f64, f64, f64)>(
        "SELECT sample_count, p50, p95, p99 FROM perf_hourly_aggregates \
         WHERE project_id = $1 AND metric_name = 'startup_cold' LIMIT 1",
    )
    .bind(project_id)
    .fetch_one(&state.db)
    .await
    .unwrap();

    assert_eq!(agg.0, 5, "Expected 5 samples, got {}", agg.0);
    // p50 of [100, 200, 300, 400, 500] should be approximately 300
    assert!((agg.1 - 300.0).abs() < 50.0, "p50 should be ~300, got {}", agg.1);
    // p95 should be close to 480-500
    assert!(agg.2 > 400.0, "p95 should be >400, got {}", agg.2);
    // p99 should be close to 496-500
    assert!(agg.3 > 450.0, "p99 should be >450, got {}", agg.3);

    cleanup_test_data(&state.db).await;
}

#[tokio::test]
async fn test_aggregation_records_run_metadata() {
    let state = create_test_state().await;
    cleanup_test_data(&state.db).await;
    let user = create_test_user(&state.db, "agg5@test.com", "AggTest5").await;
    let project_id = get_project_id(&state.db, &user.project_slug).await;

    // Insert a raw event so there's something to process
    sqlx::query(
        "INSERT INTO health_events_raw \
         (project_id, device_id, channel_name, platform, runtime_version, \
          event_type, event_name, count) \
         VALUES ($1, 'device-1', 'production', 'ios', '1.0.0', 'app_launch', 'launch', 1)",
    )
    .bind(project_id)
    .execute(&state.db)
    .await
    .unwrap();

    // Run aggregation
    run_aggregation_cycle(&state.db).await.unwrap();

    // Verify aggregation_runs was populated
    let run_count = sqlx::query_scalar::<_, i64>(
        "SELECT COUNT(*) FROM aggregation_runs",
    )
    .fetch_one(&state.db)
    .await
    .unwrap();

    assert!(run_count > 0, "Expected aggregation run to be recorded, got {}", run_count);

    // Verify fields
    let (duration_ms, projects_processed): (i64, i32) = sqlx::query_as(
        "SELECT duration_ms, projects_processed FROM aggregation_runs ORDER BY completed_at DESC LIMIT 1",
    )
    .fetch_one(&state.db)
    .await
    .unwrap();

    assert!(duration_ms >= 0, "duration_ms should be non-negative, got {}", duration_ms);
    assert!(projects_processed >= 1, "Should have processed at least 1 project, got {}", projects_processed);

    cleanup_test_data(&state.db).await;
}

use chrono::Timelike;
