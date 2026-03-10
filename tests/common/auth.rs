use axum::body::Body;
use axum::http::Request;

/// Build a request with Authorization Bearer token, x-project header,
/// and content-type application/json.
pub fn authenticated_request(
    method: &str,
    uri: &str,
    token: &str,
    project_slug: &str,
    body: Option<serde_json::Value>,
) -> Request<Body> {
    let builder = Request::builder()
        .method(method)
        .uri(uri)
        .header("authorization", format!("Bearer {}", token))
        .header("x-project", project_slug)
        .header("content-type", "application/json");

    match body {
        Some(json) => builder
            .body(Body::from(serde_json::to_string(&json).unwrap()))
            .unwrap(),
        None => builder.body(Body::empty()).unwrap(),
    }
}

/// Build a request without auth headers, for testing public endpoints
/// and auth rejection scenarios.
pub fn unauthenticated_request(
    method: &str,
    uri: &str,
    body: Option<serde_json::Value>,
) -> Request<Body> {
    let builder = Request::builder()
        .method(method)
        .uri(uri)
        .header("content-type", "application/json");

    match body {
        Some(json) => builder
            .body(Body::from(serde_json::to_string(&json).unwrap()))
            .unwrap(),
        None => builder.body(Body::empty()).unwrap(),
    }
}
