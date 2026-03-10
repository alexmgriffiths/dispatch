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
pub async fn run_retention_cycle(
    _db: &PgPool,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    // Stub: will be implemented in GREEN phase
    todo!("run_retention_cycle not yet implemented")
}
