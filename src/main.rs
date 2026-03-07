use tracing_subscriber::EnvFilter;

use crate::config::Config;
use crate::routes::{AppState, create_router};
use crate::signing::load_private_key;

pub mod auth;
pub mod config;
pub mod errors;
pub mod handlers;
pub mod models;
pub mod multipart;
pub mod routes;
pub mod signing;

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt()
        .with_env_filter(EnvFilter::from_default_env())
        .init();

    dotenvy::dotenv().ok();
    let config = Config::from_env();

    let db = sqlx::postgres::PgPoolOptions::new()
        .max_connections(20)
        .idle_timeout(std::time::Duration::from_secs(300))
        .acquire_timeout(std::time::Duration::from_secs(5))
        .connect(&config.database_url)
        .await
        .expect("Failed to connect to database");

    sqlx::migrate!("./migrations")
        .run(&db)
        .await
        .expect("Failed to run migrations");

    // Seed default admin user if no users exist
    let user_count = sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM users")
        .fetch_one(&db)
        .await
        .expect("Failed to count users");

    if user_count == 0 {
        let default_password = std::env::var("ADMIN_PASSWORD").unwrap_or_else(|_| "admin".to_string());
        let hash = handlers::auth_handler::hash_password(&default_password)
            .expect("Failed to hash default admin password");

        sqlx::query(
            "INSERT INTO users (email, password_hash, name, role) VALUES ('admin@dispatch.dev', $1, 'Admin', 'admin')",
        )
        .bind(&hash)
        .execute(&db)
        .await
        .expect("Failed to seed admin user");

        tracing::info!("Seeded default admin user: admin@dispatch.dev (password from ADMIN_PASSWORD env or 'admin')");
    }

    let aws_config = aws_config::defaults(aws_config::BehaviorVersion::latest())
        .region(aws_config::Region::new(config.s3_region.clone()))
        .load()
        .await;
    let s3_config = aws_sdk_s3::config::Builder::from(&aws_config)
        .force_path_style(true)
        .build();
    let s3 = aws_sdk_s3::Client::from_conf(s3_config);

    let private_key = match &config.private_key_path {
        Some(path) => {
            let key = load_private_key(path)
                .await
                .expect("Failed to load private key");
            tracing::info!("Code signing enabled");
            Some(key)
        }
        None => {
            tracing::info!("Code signing disabled (no PRIVATE_KEY_PATH set)");
            None
        }
    };

    let addr = format!("{}:{}", config.host, config.port);
    let state = AppState {
        db,
        s3,
        config,
        private_key,
    };
    let app = create_router(state);

    tracing::info!("Listening on {}", addr);
    let listener = tokio::net::TcpListener::bind(&addr).await.unwrap();
    axum::serve(listener, app)
        .with_graceful_shutdown(shutdown_signal())
        .await
        .expect("Server error");
    tracing::info!("Server shut down gracefully");
}

async fn shutdown_signal() {
    let ctrl_c = async {
        tokio::signal::ctrl_c()
            .await
            .expect("Failed to install Ctrl+C handler");
    };

    #[cfg(unix)]
    let terminate = async {
        tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate())
            .expect("Failed to install SIGTERM handler")
            .recv()
            .await;
    };

    #[cfg(not(unix))]
    let terminate = std::future::pending::<()>();

    tokio::select! {
        _ = ctrl_c => tracing::info!("Received Ctrl+C, shutting down..."),
        _ = terminate => tracing::info!("Received SIGTERM, shutting down..."),
    }
}
