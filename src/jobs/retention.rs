use sqlx::PgPool;

/// Spawn the background retention cleanup task. Call once from main().
pub fn spawn_retention(db: PgPool) {
    tokio::spawn(async move {
        // Stagger start: wait 60s after server boot
        tokio::time::sleep(std::time::Duration::from_secs(60)).await;

        let mut interval = tokio::time::interval(std::time::Duration::from_secs(86400));
        loop {
            interval.tick().await;
            if let Err(e) = run_retention_cycle(&db).await {
                tracing::error!(error = %e, "Retention cycle failed");
            }
        }
    });
}

/// Run a single retention cycle. This is the testable core function.
///
/// Deletes:
/// - health_events_raw older than 30 days
/// - performance_samples older than 30 days
/// - aggregation_runs older than 90 days
pub async fn run_retention_cycle(
    db: &PgPool,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let health_deleted = sqlx::query_scalar::<_, i64>(
        "WITH deleted AS ( \
            DELETE FROM health_events_raw \
            WHERE received_at < NOW() - INTERVAL '30 days' \
            RETURNING 1 \
        ) SELECT COUNT(*) FROM deleted",
    )
    .fetch_one(db)
    .await
    .unwrap_or(0);

    let perf_deleted = sqlx::query_scalar::<_, i64>(
        "WITH deleted AS ( \
            DELETE FROM performance_samples \
            WHERE received_at < NOW() - INTERVAL '30 days' \
            RETURNING 1 \
        ) SELECT COUNT(*) FROM deleted",
    )
    .fetch_one(db)
    .await
    .unwrap_or(0);

    let runs_deleted = sqlx::query_scalar::<_, i64>(
        "WITH deleted AS ( \
            DELETE FROM aggregation_runs \
            WHERE completed_at < NOW() - INTERVAL '90 days' \
            RETURNING 1 \
        ) SELECT COUNT(*) FROM deleted",
    )
    .fetch_one(db)
    .await
    .unwrap_or(0);

    tracing::info!(
        health_events = health_deleted,
        performance_samples = perf_deleted,
        aggregation_runs = runs_deleted,
        "Retention cycle complete"
    );

    Ok(())
}
