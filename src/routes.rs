use aws_sdk_s3::Client as S3Client;
use axum::{
    Router,
    extract::DefaultBodyLimit,
    routing::{delete, get, patch, post},
};
use rsa::RsaPrivateKey;
use sqlx::PgPool;
use axum::http::header::HeaderValue;
use tower_http::compression::CompressionLayer;
use tower_http::cors::{Any, CorsLayer};
use tower_http::set_header::SetResponseHeaderLayer;
use tower_http::services::{ServeDir, ServeFile};
use tower_http::trace::{DefaultMakeSpan, DefaultOnResponse, TraceLayer};
use tracing::Level;

use crate::config::Config;
use crate::handlers::analytics::{handle_adoption_timeseries, handle_get_update_insights, handle_list_insights};
use crate::handlers::branches::{
    handle_create_branch, handle_create_channel, handle_delete_branch, handle_delete_channel,
    handle_list_branches, handle_list_channels, handle_patch_channel,
};
use crate::handlers::auth_handler::{
    handle_accept_invite, handle_create_api_key, handle_delete_api_key, handle_invite,
    handle_list_api_keys, handle_list_users, handle_login, handle_logout, handle_me,
    handle_register, handle_revoke_api_key, handle_setup_status,
};
use crate::handlers::audit::{handle_list_audit_log, handle_update_history};
use crate::handlers::builds::{handle_delete_build, handle_list_builds, handle_publish_build, handle_upload_build};
use crate::handlers::manifest::handle_get_manifest;
use crate::handlers::projects::{handle_create_project, handle_delete_project, handle_list_projects};
use crate::handlers::rollback::handle_create_rollback;
use crate::handlers::settings::{
    handle_create_webhook, handle_delete_webhook, handle_gc_preview, handle_gc_run,
    handle_list_webhook_deliveries, handle_list_webhooks, handle_patch_webhook,
};
use crate::handlers::upload::{
    handle_create_update, handle_delete_update, handle_list_updates, handle_patch_update,
    handle_presign_upload, handle_republish_update, handle_upload_asset,
};

#[derive(Clone)]
pub struct AppState {
    pub db: PgPool,
    pub s3: S3Client,
    pub config: Config,
    pub private_key: Option<RsaPrivateKey>,
}

pub fn create_router(state: AppState) -> Router {
    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);

    // Public routes — no auth required
    let public_routes = Router::new()
        .route("/healthz", get(|| async { "ok" }))
        .route("/manifest/{project_slug}", get(handle_get_manifest))
        .route("/auth/login", post(handle_login))
        .route("/auth/register", post(handle_register))
        .route("/auth/setup-status", get(handle_setup_status))
        .route("/auth/accept-invite", post(handle_accept_invite));

    // Protected routes — RequireAuth extractor on each handler
    let protected_routes = Router::new()
        .route("/auth/me", get(handle_me))
        .route("/auth/logout", post(handle_logout))
        .route("/auth/invite", post(handle_invite))
        .route("/auth/users", get(handle_list_users))
        .route(
            "/auth/api-keys",
            get(handle_list_api_keys).post(handle_create_api_key),
        )
        .route("/auth/api-keys/{id}/revoke", post(handle_revoke_api_key))
        .route("/auth/api-keys/{id}", delete(handle_delete_api_key))
        .route(
            "/updates",
            get(handle_list_updates).post(handle_create_update),
        )
        .route("/updates/{id}", patch(handle_patch_update).delete(handle_delete_update))
        .route("/updates/{id}/republish", post(handle_republish_update))
        .route("/updates/{id}/history", get(handle_update_history))
        .route("/assets/upload", post(handle_upload_asset))
        .route("/assets/presign", post(handle_presign_upload))
        .route("/builds", get(handle_list_builds).post(handle_upload_build).layer(DefaultBodyLimit::max(256 * 1024 * 1024)))
        .route("/builds/{id}", delete(handle_delete_build))
        .route("/builds/{id}/publish", post(handle_publish_build))
        .route("/rollback", post(handle_create_rollback))
        .route(
            "/branches",
            get(handle_list_branches).post(handle_create_branch),
        )
        .route("/branches/{name}", delete(handle_delete_branch))
        .route(
            "/channels",
            get(handle_list_channels).post(handle_create_channel),
        )
        .route(
            "/channels/{name}",
            patch(handle_patch_channel).delete(handle_delete_channel),
        )
        .route("/insights", get(handle_list_insights))
        .route("/insights/adoption", get(handle_adoption_timeseries))
        .route("/insights/{id}", get(handle_get_update_insights))
        .route("/audit-log", get(handle_list_audit_log))
        .route(
            "/webhooks",
            get(handle_list_webhooks).post(handle_create_webhook),
        )
        .route(
            "/webhooks/{id}",
            patch(handle_patch_webhook).delete(handle_delete_webhook),
        )
        .route("/webhooks/{id}/deliveries", get(handle_list_webhook_deliveries))
        .route("/gc", get(handle_gc_preview).post(handle_gc_run))
        .route("/projects", get(handle_list_projects).post(handle_create_project))
        .route("/projects/{slug}", delete(handle_delete_project));

    let ota_routes = Router::new()
        .merge(public_routes)
        .merge(protected_routes);

    let static_dir = std::env::var("STATIC_DIR").unwrap_or_else(|_| "./web/dist".to_string());
    let serve_spa = ServeDir::new(&static_dir)
        .not_found_service(ServeFile::new(format!("{}/index.html", static_dir)));

    // Cache immutable hashed assets (Vite adds content hashes to filenames)
    let cache_header = SetResponseHeaderLayer::overriding(
        axum::http::header::CACHE_CONTROL,
        HeaderValue::from_static("public, max-age=31536000, immutable"),
    );

    let static_service = Router::new()
        .fallback_service(serve_spa)
        .layer(cache_header);

    Router::new()
        .nest("/v1/ota", ota_routes)
        .fallback_service(static_service)
        .layer(CompressionLayer::new())
        .layer(cors)
        .layer(
            TraceLayer::new_for_http()
                .make_span_with(DefaultMakeSpan::new().level(Level::INFO))
                .on_response(DefaultOnResponse::new().level(Level::INFO)),
        )
        .with_state(state)
}
