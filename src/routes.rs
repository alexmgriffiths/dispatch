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
use crate::execution_events::ExecutionEventRegistry;
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
use crate::handlers::assets::handle_proxy_asset;
use crate::handlers::health_metrics::handle_report_health_metrics;
use crate::handlers::observe::handle_list_observe_events;
use crate::handlers::manifest::handle_get_manifest;
use crate::handlers::projects::{handle_create_project, handle_delete_project, handle_list_projects};
use crate::handlers::rollback::handle_create_rollback;
use crate::handlers::settings::{
    handle_create_webhook, handle_delete_webhook, handle_gc_preview, handle_gc_run,
    handle_list_webhook_deliveries, handle_list_webhooks, handle_patch_webhook,
};
use crate::handlers::user_overrides::{
    handle_create_user_override, handle_delete_user_override, handle_list_user_overrides,
};
use crate::handlers::contexts::{
    handle_create_context, handle_delete_context, handle_get_context,
    handle_list_context_kinds, handle_list_contexts,
};
use crate::handlers::rollout_executions::{
    handle_add_execution_flag, handle_advance_execution, handle_cancel_execution,
    handle_execution_events, handle_get_execution, handle_list_executions,
    handle_pause_execution, handle_remove_execution_flag, handle_resume_execution,
    handle_revert_flag,
};
use crate::handlers::rollout_policies::{
    handle_create_policy, handle_delete_policy, handle_get_policy,
    handle_list_policies, handle_update_policy,
};
use crate::handlers::segments::{
    handle_list_segments, handle_create_segment, handle_get_segment,
    handle_update_segment, handle_delete_segment,
};
use crate::handlers::feature_flags::{
    handle_create_flag, handle_create_rule, handle_delete_flag, handle_delete_rule,
    handle_get_flag, handle_get_flag_definitions, handle_get_flag_health, handle_list_flags,
    handle_patch_env_setting, handle_get_flag_evaluations, handle_patch_flag, handle_patch_rule,
    handle_patch_variation, handle_report_evaluations,
};
use crate::handlers::telemetry::{
    handle_flag_impacts, handle_get_performance_metrics, handle_telemetry_events,
    handle_telemetry_timeseries,
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
    pub execution_events: ExecutionEventRegistry,
}

pub fn create_router(state: AppState) -> Router {
    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);

    // OTA client routes — no compression (expo-updates can't parse compressed multipart)
    let ota_client_routes = Router::new()
        .route("/manifest/{project_slug}", get(handle_get_manifest))
        .route("/assets/{*key}", get(handle_proxy_asset))
        .route("/flag-definitions/{project_slug}", get(handle_get_flag_definitions))
        .route("/health-metrics", post(handle_report_health_metrics));

    // Public routes — no auth required
    let public_routes = Router::new()
        .route("/healthz", get(|| async { "ok" }))
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
        .route("/projects/{slug}", delete(handle_delete_project))
        .route(
            "/user-overrides",
            get(handle_list_user_overrides).post(handle_create_user_override),
        )
        .route("/user-overrides/{id}", delete(handle_delete_user_override))
        .route("/flags", get(handle_list_flags).post(handle_create_flag))
        .route(
            "/flags/{id}",
            get(handle_get_flag).patch(handle_patch_flag).delete(handle_delete_flag),
        )
        .route("/flags/{id}/rules", post(handle_create_rule))
        .route("/flags/{id}/rules/{rule_id}", delete(handle_delete_rule).patch(handle_patch_rule))
        .route("/flags/{id}/variations/{variation_id}", patch(handle_patch_variation))
        .route("/flags/{id}/env/{channel_name}", patch(handle_patch_env_setting))
        .route("/flags/{id}/evaluations", get(handle_get_flag_evaluations))
        .route("/flags/{id}/health", get(handle_get_flag_health))
        .route("/flag-evaluations", post(handle_report_evaluations))
        .route("/contexts", get(handle_list_contexts).post(handle_create_context))
        .route("/contexts/kinds", get(handle_list_context_kinds))
        .route("/contexts/{id}", get(handle_get_context).delete(handle_delete_context))
        .route("/segments", get(handle_list_segments).post(handle_create_segment))
        .route("/segments/{id}", get(handle_get_segment).patch(handle_update_segment).delete(handle_delete_segment))
        .route("/rollout-policies", get(handle_list_policies).post(handle_create_policy))
        .route("/rollout-policies/{id}", get(handle_get_policy).patch(handle_update_policy).delete(handle_delete_policy))
        .route("/rollout-executions", get(handle_list_executions))
        .route("/rollout-executions/{id}", get(handle_get_execution))
        .route("/rollout-executions/{id}/pause", post(handle_pause_execution))
        .route("/rollout-executions/{id}/resume", post(handle_resume_execution))
        .route("/rollout-executions/{id}/cancel", post(handle_cancel_execution))
        .route("/rollout-executions/{id}/advance", post(handle_advance_execution))
        .route("/rollout-executions/{id}/flags", post(handle_add_execution_flag))
        .route("/rollout-executions/{id}/flags/{flag_id}", delete(handle_remove_execution_flag))
        .route("/rollout-executions/{id}/flags/{flag_id}/revert", post(handle_revert_flag))
        .route("/rollout-executions/{id}/events", get(handle_execution_events))
        .route("/observe/events", get(handle_list_observe_events))
        .route("/telemetry/timeseries", get(handle_telemetry_timeseries))
        .route("/telemetry/flag-impacts", get(handle_flag_impacts))
        .route("/telemetry/events", get(handle_telemetry_events))
        .route("/telemetry/performance", get(handle_get_performance_metrics));

    let compressed_routes = Router::new()
        .merge(public_routes)
        .merge(protected_routes)
        .layer(CompressionLayer::new());

    let ota_routes = Router::new()
        .merge(ota_client_routes)
        .merge(compressed_routes);

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
        .layer(cors)
        .layer(
            TraceLayer::new_for_http()
                .make_span_with(DefaultMakeSpan::new().level(Level::INFO))
                .on_response(DefaultOnResponse::new().level(Level::INFO)),
        )
        .with_state(state)
}
