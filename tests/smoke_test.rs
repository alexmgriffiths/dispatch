mod common;

use axum::body::Body;
use axum::http::{Request, StatusCode};
use tower::ServiceExt;

#[tokio::test]
async fn test_healthz_returns_ok() {
    let state = common::setup::create_test_state().await;
    let app = dispatch_ota::routes::create_router(state);

    let response = app
        .oneshot(
            Request::builder()
                .uri("/v1/ota/healthz")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);
}
