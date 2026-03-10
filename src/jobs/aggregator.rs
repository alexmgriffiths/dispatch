use sqlx::PgPool;

/// Spawn the background aggregation task. Call once from main().
pub fn spawn_aggregator(db: PgPool) {
    tokio::spawn(async move {
        // Stagger start: wait 30s after server boot
        tokio::time::sleep(std::time::Duration::from_secs(30)).await;

        let mut interval = tokio::time::interval(std::time::Duration::from_secs(120));
        loop {
            interval.tick().await;
            if let Err(e) = run_aggregation_cycle(&db).await {
                tracing::error!(error = %e, "Aggregation cycle failed");
            }
        }
    });
}

/// Run a single aggregation cycle. This is the testable core function.
pub async fn run_aggregation_cycle(
    _db: &PgPool,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    // Stub: will be implemented in GREEN phase
    todo!("run_aggregation_cycle not yet implemented")
}
