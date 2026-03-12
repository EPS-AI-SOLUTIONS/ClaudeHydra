use axum::http::StatusCode;
use jaskier_core::testing::{body_json, get, post_json};
use tower::ServiceExt;

use claudehydra_backend::state::AppState;

/// Helper: build a fresh app router with a clean in-memory AppState.
/// Uses `create_test_router` — no GovernorLayer (rate limiter needs peer IP
/// which `oneshot()` doesn't provide) and `connect_lazy` (no real DB).
fn app() -> axum::Router {
    let state = AppState::new_test();
    claudehydra_backend::create_test_router(state)
}

// ═══════════════════════════════════════════════════════════════════════════
//  GET /api/health
// ═══════════════════════════════════════════════════════════════════════════

#[tokio::test]
async fn health_returns_200() {
    let response = app().oneshot(get("/api/health")).await.unwrap();
    assert_eq!(response.status(), StatusCode::OK);
}

#[tokio::test]
async fn health_has_correct_fields() {
    let response = app().oneshot(get("/api/health")).await.unwrap();
    let json = body_json(response).await;

    // new_test() uses connect_lazy to a fake DB → SELECT 1 fails → "degraded"
    let status = json["status"].as_str().unwrap();
    assert!(
        status == "healthy" || status == "degraded",
        "unexpected health status: {status}"
    );
    assert_eq!(json["version"], "4.0.0");
    assert_eq!(json["app"], "ClaudeHydra v4");
    assert!(json["uptime_seconds"].is_u64());
    assert!(json["providers"].is_array());
    assert!(json.get("ollama_connected").is_none());
}

// ═══════════════════════════════════════════════════════════════════════════
//  GET /api/auth/mode
// ═══════════════════════════════════════════════════════════════════════════

#[tokio::test]
async fn auth_mode_returns_200() {
    let response = app().oneshot(get("/api/auth/mode")).await.unwrap();
    assert_eq!(response.status(), StatusCode::OK);

    let json = body_json(response).await;
    assert_eq!(json["mode"], "open");
}

// ═══════════════════════════════════════════════════════════════════════════
//  GET /api/health/ready
// ═══════════════════════════════════════════════════════════════════════════

#[tokio::test]
async fn readiness_returns_503_before_ready() {
    let response = app().oneshot(get("/api/health/ready")).await.unwrap();
    assert_eq!(response.status(), StatusCode::SERVICE_UNAVAILABLE);
}

// ═══════════════════════════════════════════════════════════════════════════
//  GET /api/agents
// ═══════════════════════════════════════════════════════════════════════════

#[tokio::test]
async fn agents_returns_200() {
    let response = app().oneshot(get("/api/agents")).await.unwrap();
    assert_eq!(response.status(), StatusCode::OK);
}

#[tokio::test]
async fn agents_returns_12_agents() {
    let response = app().oneshot(get("/api/agents")).await.unwrap();
    let json = body_json(response).await;
    let agents = json.as_array().unwrap();
    assert_eq!(agents.len(), 12);
}

#[tokio::test]
async fn agents_have_required_fields() {
    let response = app().oneshot(get("/api/agents")).await.unwrap();
    let json = body_json(response).await;
    let agents = json.as_array().unwrap();

    for agent in agents {
        assert!(agent["id"].is_string(), "agent missing id");
        assert!(agent["name"].is_string(), "agent missing name");
        assert!(agent["role"].is_string(), "agent missing role");
        assert!(agent["tier"].is_string(), "agent missing tier");
        assert!(agent["status"].is_string(), "agent missing status");
        assert!(agent["model"].is_string(), "agent missing model");
    }
}

#[tokio::test]
async fn agents_have_correct_model_per_tier() {
    let response = app().oneshot(get("/api/agents")).await.unwrap();
    let json = body_json(response).await;
    let agents = json.as_array().unwrap();

    for agent in agents {
        let tier = agent["tier"].as_str().unwrap();
        let model = agent["model"].as_str().unwrap();
        match tier {
            "Commander" => assert_eq!(model, "claude-opus-4-6"),
            "Coordinator" => assert_eq!(model, "claude-sonnet-4-6"),
            "Executor" => assert_eq!(model, "claude-haiku-4-5-20251001"),
            _ => panic!("Unknown tier: {}", tier),
        }
    }
}

// ═══════════════════════════════════════════════════════════════════════════
//  POST /api/settings/api-key
// ═══════════════════════════════════════════════════════════════════════════

#[tokio::test]
async fn set_api_key_returns_200() {
    let body = serde_json::json!({
        "provider": "anthropic",
        "key": "test-key-12345"
    });

    let response = app().oneshot(post_json("/api/settings/api-key", body)).await.unwrap();
    assert_eq!(response.status(), StatusCode::OK);

    let json = body_json(response).await;
    assert_eq!(json["status"], "ok");
    assert_eq!(json["provider"], "anthropic");
}

// ═══════════════════════════════════════════════════════════════════════════
//  404 for unknown routes
// ═══════════════════════════════════════════════════════════════════════════

#[tokio::test]
async fn unknown_route_returns_404() {
    let response = app().oneshot(get("/api/nonexistent")).await.unwrap();
    assert_eq!(response.status(), StatusCode::NOT_FOUND);
}
