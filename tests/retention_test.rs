mod common;

use common::setup::{cleanup_test_data, create_test_state};
use common::fixtures::{create_test_user, get_project_id};
use dispatch_ota::jobs::retention::run_retention_cycle;

#[tokio::test]
async fn test_retention_deletes_old_health_events() {
    let state = create_test_state().await;
    cleanup_test_data(&state.db).await;
    let user = create_test_user(&state.db, "ret1@test.com", "RetTest1").await;
    let project_id = get_project_id(&state.db, &user.project_slug).await;

    // Insert old event (31 days ago)
    sqlx::query(
        "INSERT INTO health_events_raw \
         (project_id, device_id, channel_name, platform, runtime_version, \
          event_type, event_name, count, received_at) \
         VALUES ($1, 'device-old', 'production', 'ios', '1.0.0', 'app_launch', 'launch', 1, \
                 NOW() - INTERVAL '31 days')",
    )
    .bind(project_id)
    .execute(&state.db)
    .await
    .unwrap();

    // Insert recent event (now)
    sqlx::query(
        "INSERT INTO health_events_raw \
         (project_id, device_id, channel_name, platform, runtime_version, \
          event_type, event_name, count) \
         VALUES ($1, 'device-new', 'production', 'ios', '1.0.0', 'app_launch', 'launch', 1)",
    )
    .bind(project_id)
    .execute(&state.db)
    .await
    .unwrap();

    // Verify both exist before retention
    let before_count = sqlx::query_scalar::<_, i64>(
        "SELECT COUNT(*) FROM health_events_raw WHERE project_id = $1",
    )
    .bind(project_id)
    .fetch_one(&state.db)
    .await
    .unwrap();
    assert_eq!(before_count, 2, "Expected 2 events before retention");

    // Run retention
    run_retention_cycle(&state.db).await.unwrap();

    // Old event should be deleted
    let old_count = sqlx::query_scalar::<_, i64>(
        "SELECT COUNT(*) FROM health_events_raw WHERE project_id = $1 AND device_id = 'device-old'",
    )
    .bind(project_id)
    .fetch_one(&state.db)
    .await
    .unwrap();
    assert_eq!(old_count, 0, "Old event should be deleted by retention");

    // Recent event should be preserved
    let new_count = sqlx::query_scalar::<_, i64>(
        "SELECT COUNT(*) FROM health_events_raw WHERE project_id = $1 AND device_id = 'device-new'",
    )
    .bind(project_id)
    .fetch_one(&state.db)
    .await
    .unwrap();
    assert_eq!(new_count, 1, "Recent event should be preserved");

    cleanup_test_data(&state.db).await;
}

#[tokio::test]
async fn test_retention_deletes_old_performance_samples() {
    let state = create_test_state().await;
    cleanup_test_data(&state.db).await;
    let user = create_test_user(&state.db, "ret2@test.com", "RetTest2").await;
    let project_id = get_project_id(&state.db, &user.project_slug).await;

    // Insert old performance sample (31 days ago)
    sqlx::query(
        "INSERT INTO performance_samples \
         (project_id, device_id, channel_name, platform, runtime_version, \
          metric_name, duration_ms, received_at) \
         VALUES ($1, 'device-old', 'production', 'ios', '1.0.0', 'startup_cold', 1000.0, \
                 NOW() - INTERVAL '31 days')",
    )
    .bind(project_id)
    .execute(&state.db)
    .await
    .unwrap();

    // Insert recent performance sample
    sqlx::query(
        "INSERT INTO performance_samples \
         (project_id, device_id, channel_name, platform, runtime_version, \
          metric_name, duration_ms) \
         VALUES ($1, 'device-new', 'production', 'ios', '1.0.0', 'startup_cold', 500.0)",
    )
    .bind(project_id)
    .execute(&state.db)
    .await
    .unwrap();

    // Run retention
    run_retention_cycle(&state.db).await.unwrap();

    // Old sample should be deleted
    let old_count = sqlx::query_scalar::<_, i64>(
        "SELECT COUNT(*) FROM performance_samples WHERE project_id = $1 AND device_id = 'device-old'",
    )
    .bind(project_id)
    .fetch_one(&state.db)
    .await
    .unwrap();
    assert_eq!(old_count, 0, "Old performance sample should be deleted by retention");

    // Recent sample should be preserved
    let new_count = sqlx::query_scalar::<_, i64>(
        "SELECT COUNT(*) FROM performance_samples WHERE project_id = $1 AND device_id = 'device-new'",
    )
    .bind(project_id)
    .fetch_one(&state.db)
    .await
    .unwrap();
    assert_eq!(new_count, 1, "Recent performance sample should be preserved");

    cleanup_test_data(&state.db).await;
}

#[tokio::test]
async fn test_retention_preserves_events_newer_than_30_days() {
    let state = create_test_state().await;
    cleanup_test_data(&state.db).await;
    let user = create_test_user(&state.db, "ret3@test.com", "RetTest3").await;
    let project_id = get_project_id(&state.db, &user.project_slug).await;

    // Insert events at various ages (all within 30 days)
    for days_ago in &[0, 5, 10, 15, 20, 25, 29] {
        sqlx::query(
            "INSERT INTO health_events_raw \
             (project_id, device_id, channel_name, platform, runtime_version, \
              event_type, event_name, count, received_at) \
             VALUES ($1, $2, 'production', 'ios', '1.0.0', 'app_launch', 'launch', 1, \
                     NOW() - make_interval(days => $3))",
        )
        .bind(project_id)
        .bind(format!("device-{}", days_ago))
        .bind(*days_ago)
        .execute(&state.db)
        .await
        .unwrap();
    }

    let before_count = sqlx::query_scalar::<_, i64>(
        "SELECT COUNT(*) FROM health_events_raw WHERE project_id = $1",
    )
    .bind(project_id)
    .fetch_one(&state.db)
    .await
    .unwrap();
    assert_eq!(before_count, 7, "Expected 7 events before retention");

    // Run retention
    run_retention_cycle(&state.db).await.unwrap();

    // All events should be preserved (none older than 30 days)
    let after_count = sqlx::query_scalar::<_, i64>(
        "SELECT COUNT(*) FROM health_events_raw WHERE project_id = $1",
    )
    .bind(project_id)
    .fetch_one(&state.db)
    .await
    .unwrap();
    assert_eq!(after_count, 7, "All events within 30 days should be preserved, got {}", after_count);

    cleanup_test_data(&state.db).await;
}
