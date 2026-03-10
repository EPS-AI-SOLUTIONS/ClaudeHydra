// Jaskier Shared Pattern -- backend integration test
// ClaudeHydra v4 - Health endpoint integration test

use axum::body::Body;
use axum::http::{Request, StatusCode};
use http_body_util::BodyExt;
use serde_json::Value;
use tower::ServiceExt;

use claudehydra_backend::state::AppState;

/// Build a test app router without requiring a real database.
fn test_app() -> axum::Router {
    let state = AppState::new_test();
    claudehydra_backend::create_router(state)
}

/// Collect a response body into a `serde_json::Value`.
async fn body_json(response: axum::response::Response) -> Value {
    let bytes = response.into_body().collect().await.unwrap().to_bytes();
    serde_json::from_slice(&bytes).unwrap()
}

#[tokio::test]
async fn health_endpoint_returns_ok() {
    let response = test_app()
        .oneshot(
            Request::builder()
                .uri("/api/health")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);
}

#[tokio::test]
async fn health_endpoint_returns_json_with_status_field() {
    let response = test_app()
        .oneshot(
            Request::builder()
                .uri("/api/health")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    let json = body_json(response).await;
    assert!(json.get("status").is_some(), "Response should have 'status' field");
}

#[tokio::test]
async fn auth_mode_endpoint_returns_ok() {
    let response = test_app()
        .oneshot(
            Request::builder()
                .uri("/api/auth/mode")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);

    let json = body_json(response).await;
    // In test mode, AUTH_SECRET is not set, so mode = "open"
    assert_eq!(json["mode"], "open");
}

#[tokio::test]
async fn readiness_endpoint_exists() {
    let response = test_app()
        .oneshot(
            Request::builder()
                .uri("/api/health/ready")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    // Readiness may return 503 if not marked ready yet, but should not 404
    assert_ne!(response.status(), StatusCode::NOT_FOUND);
}

#[tokio::test]
async fn nonexistent_route_returns_404() {
    let response = test_app()
        .oneshot(
            Request::builder()
                .uri("/api/does-not-exist")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::NOT_FOUND);
}
