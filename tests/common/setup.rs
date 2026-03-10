use dispatch_ota::config::Config;
use dispatch_ota::execution_events::ExecutionEventRegistry;
use dispatch_ota::routes::AppState;
use sqlx::PgPool;

/// Convenience constant for building test URIs.
pub const API_PREFIX: &str = "/v1/ota";

/// Create a test AppState connected to local Docker services.
/// Migrations are expected to have been run before tests start (via Makefile).
pub async fn create_test_state() -> AppState {
    dotenvy::from_filename("../.env.test").ok();
    dotenvy::dotenv().ok();

    let database_url = std::env::var("DATABASE_URL")
        .unwrap_or_else(|_| "postgres://ota_user:ota_pass@localhost:5435/ota_test".to_string());

    let db = PgPool::connect(&database_url)
        .await
        .expect("Failed to connect to test database");

    let aws_config = aws_config::defaults(aws_config::BehaviorVersion::latest())
        .region(aws_config::Region::new("us-east-1"))
        .load()
        .await;
    let s3_config = aws_sdk_s3::config::Builder::from(&aws_config)
        .force_path_style(true)
        .build();
    let s3 = aws_sdk_s3::Client::from_conf(s3_config);

    let config = Config {
        database_url,
        s3_bucket: "ota-updates".to_string(),
        s3_region: "us-east-1".to_string(),
        s3_base_url: "http://localhost:9000/ota-updates".to_string(),
        private_key_path: None,
        host: "0.0.0.0".to_string(),
        port: 9999,
    };

    AppState {
        db,
        s3,
        config,
        private_key: None,
        execution_events: ExecutionEventRegistry::new(),
    }
}

/// Clean up all test data in reverse foreign-key dependency order.
/// Called before and/or after each test to maintain isolation.
pub async fn cleanup_test_data(db: &PgPool) {
    // Leaf tables first, then parent tables
    sqlx::query("DELETE FROM aggregation_runs").execute(db).await.ok();
    sqlx::query("DELETE FROM perf_hourly_aggregates").execute(db).await.ok();
    sqlx::query("DELETE FROM performance_samples").execute(db).await.ok();
    sqlx::query("DELETE FROM rollout_stage_history").execute(db).await.ok();
    sqlx::query("DELETE FROM rollout_execution_flags").execute(db).await.ok();
    sqlx::query("DELETE FROM rollout_executions").execute(db).await.ok();
    sqlx::query("DELETE FROM rollout_stage_thresholds").execute(db).await.ok();
    sqlx::query("DELETE FROM rollout_policy_flags").execute(db).await.ok();
    sqlx::query("DELETE FROM rollout_policy_stages").execute(db).await.ok();
    sqlx::query("DELETE FROM rollout_policies").execute(db).await.ok();
    sqlx::query("DELETE FROM flag_health_snapshots").execute(db).await.ok();
    sqlx::query("DELETE FROM flag_evaluation_counts").execute(db).await.ok();
    sqlx::query("DELETE FROM flag_context_evaluations").execute(db).await.ok();
    sqlx::query("DELETE FROM flag_contexts").execute(db).await.ok();
    sqlx::query("DELETE FROM flag_env_settings").execute(db).await.ok();
    sqlx::query("DELETE FROM flag_targeting_rules").execute(db).await.ok();
    sqlx::query("DELETE FROM flag_variations").execute(db).await.ok();
    sqlx::query("DELETE FROM feature_flags").execute(db).await.ok();
    sqlx::query("DELETE FROM segment_conditions").execute(db).await.ok();
    sqlx::query("DELETE FROM segments").execute(db).await.ok();
    sqlx::query("DELETE FROM health_events_raw").execute(db).await.ok();
    sqlx::query("DELETE FROM health_events_hourly").execute(db).await.ok();
    sqlx::query("DELETE FROM telemetry_events").execute(db).await.ok();
    sqlx::query("DELETE FROM telemetry_daily_stats").execute(db).await.ok();
    sqlx::query("DELETE FROM update_analytics").execute(db).await.ok();
    sqlx::query("DELETE FROM assets").execute(db).await.ok();
    sqlx::query("DELETE FROM updates").execute(db).await.ok();
    sqlx::query("DELETE FROM build_assets").execute(db).await.ok();
    sqlx::query("DELETE FROM builds").execute(db).await.ok();
    sqlx::query("DELETE FROM user_overrides").execute(db).await.ok();
    sqlx::query("DELETE FROM channels").execute(db).await.ok();
    sqlx::query("DELETE FROM branches").execute(db).await.ok();
    sqlx::query("DELETE FROM audit_log").execute(db).await.ok();
    sqlx::query("DELETE FROM webhook_deliveries").execute(db).await.ok();
    sqlx::query("DELETE FROM webhook_configs").execute(db).await.ok();
    sqlx::query("DELETE FROM sessions").execute(db).await.ok();
    sqlx::query("DELETE FROM api_keys").execute(db).await.ok();
    sqlx::query("DELETE FROM project_members").execute(db).await.ok();
    sqlx::query("DELETE FROM projects").execute(db).await.ok();
    sqlx::query("DELETE FROM users").execute(db).await.ok();
}
