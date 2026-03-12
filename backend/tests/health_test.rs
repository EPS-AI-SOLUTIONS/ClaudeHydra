// Jaskier Shared Pattern -- backend integration test
// ClaudeHydra v4 - Health endpoint integration test
//
// Uses jaskier_core::testing shared helpers for request building and body parsing.

use jaskier_core::testing::{body_json, get};
use axum::http::StatusCode;
use tower::ServiceExt;

use claudehydra_backend::state::AppState;

/// Build a test app router without requiring a real database.
fn test_app() -> axum::Router {
    let state = AppState::new_test();
    claudehydra_backend::create_router(state)
}

#[tokio::test]
async fn health_endpoint_returns_ok() {
    let response = test_app().oneshot(get("/api/health")).await.unwrap();
    assert_eq!(response.status(), StatusCode::OK);
}

#[tokio::test]
async fn health_endpoint_returns_json_with_status_field() {
    let response = test_app().oneshot(get("/api/health")).await.unwrap();
    let json = body_json(response).await;
    assert!(
        json.get("status").is_some(),
        "Response should have 'status' field"
    );
}

#[tokio::test]
async fn auth_mode_endpoint_returns_ok() {
    let response = test_app().oneshot(get("/api/auth/mode")).await.unwrap();
    assert_eq!(response.status(), StatusCode::OK);

    let json = body_json(response).await;
    // In test mode, AUTH_SECRET is not set, so mode = "open"
    assert_eq!(json["mode"], "open");
}

#[tokio::test]
async fn readiness_endpoint_exists() {
    let response = test_app()
        .oneshot(get("/api/health/ready"))
        .await
        .unwrap();
    // Readiness may return 503 if not marked ready yet, but should not 404
    assert_ne!(response.status(), StatusCode::NOT_FOUND);
}

#[tokio::test]
async fn nonexistent_route_returns_404() {
    let response = test_app()
        .oneshot(get("/api/does-not-exist"))
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::NOT_FOUND);
}
