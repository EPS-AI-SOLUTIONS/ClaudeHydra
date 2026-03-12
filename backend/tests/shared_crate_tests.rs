// ═══════════════════════════════════════════════════════════════════════════
// ClaudeHydra — Shared crate integration tests (R9 Step 9)
//
// Verifies that jaskier-core, jaskier-oauth, jaskier-browser trait
// implementations on ClaudeHydra's AppState work correctly, and that shared
// utilities (CircuitBreaker, LogRingBuffer, auth middleware, sessions,
// anthropic_streaming) integrate without issues.
// ═══════════════════════════════════════════════════════════════════════════

use std::sync::Arc;

use axum::http::StatusCode;
use jaskier_core::testing::{body_json, delete, get};
use tower::ServiceExt;

use claudehydra_backend::state::AppState;

/// Helper: build a fresh test router (no rate limiter, no real DB).
fn app() -> axum::Router {
    let state = AppState::new_test();
    claudehydra_backend::create_test_router(state)
}

/// Helper: build an AppState for unit-level trait tests.
/// Must be called inside a tokio runtime (PgPool::connect_lazy needs it).
fn test_state() -> AppState {
    AppState::new_test()
}

// ═══════════════════════════════════════════════════════════════════════════
//  HasAuthSecret trait — jaskier-core::auth
// ═══════════════════════════════════════════════════════════════════════════

#[tokio::test]
async fn has_auth_secret_returns_none_in_test_mode() {
    use jaskier_core::auth::HasAuthSecret;
    let state = test_state();
    assert!(
        state.auth_secret().is_none(),
        "test state should have no auth secret (dev mode)"
    );
}

// ═══════════════════════════════════════════════════════════════════════════
//  HasLogBuffer trait — jaskier-core::logs
// ═══════════════════════════════════════════════════════════════════════════

#[tokio::test]
async fn has_log_buffer_returns_working_buffer() {
    use jaskier_core::logs::{HasLogBuffer, LogEntry};
    let state = test_state();
    let buf = state.log_buffer();

    // Initially empty
    assert_eq!(buf.recent(100, None, None).len(), 0);

    // Push an entry and retrieve it
    buf.push(LogEntry {
        timestamp: "2026-03-12T00:00:00Z".to_string(),
        level: "INFO".to_string(),
        target: "test".to_string(),
        message: "hello from ClaudeHydra".to_string(),
    });
    let entries = buf.recent(100, None, None);
    assert_eq!(entries.len(), 1);
    assert_eq!(entries[0].message, "hello from ClaudeHydra");
}

#[tokio::test]
async fn log_buffer_has_1000_capacity_in_test_state() {
    use jaskier_core::logs::{HasLogBuffer, LogEntry};
    let state = test_state();
    let buf = state.log_buffer();

    // Push 1100 entries
    for i in 0..1100 {
        buf.push(LogEntry {
            timestamp: "2026-03-12T00:00:00Z".to_string(),
            level: "DEBUG".to_string(),
            target: "test".to_string(),
            message: format!("msg {i}"),
        });
    }
    // Capacity is 1000, so only last 1000 entries remain
    let entries = buf.recent(2000, None, None);
    assert_eq!(entries.len(), 1000);
}

// ═══════════════════════════════════════════════════════════════════════════
//  CircuitBreaker integration — jaskier-core::circuit_breaker
// ═══════════════════════════════════════════════════════════════════════════

#[tokio::test]
async fn circuit_breaker_starts_closed_in_app_state() {
    let state = test_state();
    assert!(
        state.circuit_breaker.check().await.is_ok(),
        "circuit breaker should be CLOSED at init"
    );
}

#[tokio::test]
async fn circuit_breaker_record_success_keeps_closed() {
    let state = test_state();
    state.circuit_breaker.record_success().await;
    assert!(state.circuit_breaker.check().await.is_ok());
}

#[tokio::test]
async fn circuit_breaker_trips_after_threshold_failures() {
    let state = test_state();
    // Trip the breaker (threshold is 3)
    for _ in 0..3 {
        state.circuit_breaker.record_failure().await;
    }
    assert!(
        state.circuit_breaker.check().await.is_err(),
        "circuit breaker should be OPEN after 3 failures"
    );
}

#[tokio::test]
async fn circuit_breaker_resets_on_success_after_failures() {
    let state = test_state();
    // Fail twice (below threshold)
    state.circuit_breaker.record_failure().await;
    state.circuit_breaker.record_failure().await;
    // Then succeed
    state.circuit_breaker.record_success().await;
    // Should still be closed
    assert!(state.circuit_breaker.check().await.is_ok());
}

#[tokio::test]
async fn circuit_breaker_is_shared_across_clones() {
    let state1 = test_state();
    let state2 = state1.clone();
    // Same Arc<CircuitBreaker>
    assert!(Arc::ptr_eq(&state1.circuit_breaker, &state2.circuit_breaker));
    // Failure on one clone affects the other
    for _ in 0..3 {
        state1.circuit_breaker.record_failure().await;
    }
    assert!(state2.circuit_breaker.check().await.is_err());
}

// ═══════════════════════════════════════════════════════════════════════════
//  HasGoogleOAuthState trait — jaskier-oauth
// ═══════════════════════════════════════════════════════════════════════════

#[tokio::test]
async fn google_oauth_table_names_use_ch_prefix() {
    use jaskier_oauth::google::HasGoogleOAuthState;
    let state = test_state();
    assert_eq!(state.google_auth_table(), "ch_google_auth");
    assert_eq!(state.default_port(), "8082");
}

#[tokio::test]
async fn github_oauth_table_uses_ch_prefix() {
    use jaskier_oauth::github::HasGitHubOAuthState;
    let state = test_state();
    assert_eq!(state.github_oauth_table(), "ch_oauth_github");
}

#[tokio::test]
async fn vercel_oauth_table_uses_ch_prefix() {
    use jaskier_oauth::vercel::HasVercelOAuthState;
    let state = test_state();
    assert_eq!(state.vercel_oauth_table(), "ch_oauth_vercel");
}

#[tokio::test]
async fn service_tokens_table_uses_ch_prefix() {
    use jaskier_oauth::service_tokens::HasServiceTokensState;
    let state = test_state();
    assert_eq!(state.service_tokens_table(), "ch_service_tokens");
}

// ═══════════════════════════════════════════════════════════════════════════
//  HasModelRegistryState trait — jaskier-core::model_registry
// ═══════════════════════════════════════════════════════════════════════════

#[tokio::test]
async fn model_registry_table_names_use_ch_prefix() {
    use jaskier_core::model_registry::HasModelRegistryState;
    let state = test_state();
    assert_eq!(state.model_pins_table(), "ch_model_pins");
    assert_eq!(state.settings_table(), "ch_settings");
    assert_eq!(state.audit_log_table(), "ch_audit_log");
}

#[tokio::test]
async fn model_cache_initially_empty() {
    use jaskier_core::model_registry::HasModelRegistryState;
    let state = test_state();
    let cache = state.model_cache().read().await;
    assert!(cache.models.is_empty(), "model cache should be empty at init");
}

// ═══════════════════════════════════════════════════════════════════════════
//  HasSessionsState trait — jaskier-core::sessions
// ═══════════════════════════════════════════════════════════════════════════

#[tokio::test]
async fn sessions_table_names_use_ch_prefix() {
    use jaskier_core::sessions::HasSessionsState;
    let state = test_state();
    assert_eq!(state.sessions_table(), "ch_sessions");
    assert_eq!(state.messages_table(), "ch_messages");
    assert_eq!(state.settings_table(), "ch_settings");
    assert_eq!(state.memory_table(), "ch_memories");
    assert_eq!(state.knowledge_nodes_table(), "ch_knowledge_nodes");
    assert_eq!(state.knowledge_edges_table(), "ch_knowledge_edges");
    assert_eq!(state.prompt_history_table(), "ch_prompt_history");
    assert_eq!(state.ratings_table(), "ch_ratings");
    assert_eq!(state.audit_log_table(), "ch_audit_log");
}

// ═══════════════════════════════════════════════════════════════════════════
//  HasWatchdogState trait — jaskier-browser::watchdog
// ═══════════════════════════════════════════════════════════════════════════

#[tokio::test]
async fn watchdog_browser_proxy_status_defaults() {
    use jaskier_browser::watchdog::HasWatchdogState;
    let state = test_state();
    let status = state.browser_proxy_status().read().await;
    assert!(!status.configured, "proxy should not be configured in test state");
    assert!(!status.reachable);
    assert!(!status.ready);
    assert_eq!(status.total_restarts, 0);
}

#[tokio::test]
async fn watchdog_health_history_empty_at_start() {
    use jaskier_browser::watchdog::HasWatchdogState;
    let state = test_state();
    let events = state.browser_proxy_history().recent(100);
    assert!(events.is_empty());
}

// ═══════════════════════════════════════════════════════════════════════════
//  Log endpoint integration (GET /api/logs/backend)
// ═══════════════════════════════════════════════════════════════════════════

#[tokio::test]
async fn logs_backend_returns_200_with_empty_logs() {
    let response = app().oneshot(get("/api/logs/backend")).await.unwrap();
    assert_eq!(response.status(), StatusCode::OK);

    let json = body_json(response).await;
    assert!(json["logs"].is_array());
    assert_eq!(json["total"], 0);
}

#[tokio::test]
async fn logs_backend_clear_returns_200() {
    let response = app().oneshot(delete("/api/logs/backend")).await.unwrap();
    assert_eq!(response.status(), StatusCode::OK);

    let json = body_json(response).await;
    assert_eq!(json["cleared"], true);
}

// ═══════════════════════════════════════════════════════════════════════════
//  Browser proxy status endpoint (GET /api/browser-proxy/status)
// ═══════════════════════════════════════════════════════════════════════════

#[tokio::test]
async fn browser_proxy_status_returns_200() {
    let response = app()
        .oneshot(get("/api/browser-proxy/status"))
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::OK);

    let json = body_json(response).await;
    // Default status is not configured
    assert_eq!(json["configured"], false);
}

// ═══════════════════════════════════════════════════════════════════════════
//  Auth middleware integration (dev mode = pass-through)
// ═══════════════════════════════════════════════════════════════════════════

#[tokio::test]
async fn auth_middleware_allows_all_in_dev_mode() {
    // The test state has no AUTH_SECRET → dev mode → all routes pass through
    let response = app().oneshot(get("/api/agents")).await.unwrap();
    assert_eq!(response.status(), StatusCode::OK);
}

// ═══════════════════════════════════════════════════════════════════════════
//  Anthropic streaming utilities — jaskier-core::handlers::anthropic_streaming
// ═══════════════════════════════════════════════════════════════════════════

#[test]
fn sanitize_api_error_handles_anthropic_format() {
    use jaskier_core::handlers::anthropic_streaming::sanitize_api_error;
    let raw = r#"{"error":{"type":"overloaded_error","message":"Server is busy"}}"#;
    let sanitized = sanitize_api_error(raw);
    assert!(
        sanitized.contains("overloaded"),
        "should mention overloaded, got: {sanitized}"
    );
    // Must not contain raw error details
    assert!(!sanitized.contains("Server is busy"));
}

#[test]
fn sanitize_api_error_handles_google_format() {
    use jaskier_core::handlers::anthropic_streaming::sanitize_api_error;
    let raw = r#"{"error":{"status":"RESOURCE_EXHAUSTED","code":429}}"#;
    let sanitized = sanitize_api_error(raw);
    assert!(sanitized.contains("Rate limit"));
}

#[test]
fn sanitize_api_error_never_leaks_raw_text() {
    use jaskier_core::handlers::anthropic_streaming::sanitize_api_error;
    let raw = "502 Bad Gateway <html>secret-api-key-abc123</html>";
    let sanitized = sanitize_api_error(raw);
    assert!(!sanitized.contains("secret-api-key"));
    assert!(!sanitized.contains("html"));
}

#[test]
fn trim_conversation_preserves_short_conversations() {
    use jaskier_core::handlers::anthropic_streaming::trim_conversation_with_limit;
    let mut conv: Vec<serde_json::Value> = (0..5)
        .map(|i| serde_json::json!({"role": "user", "content": format!("msg {i}")}))
        .collect();
    trim_conversation_with_limit(&mut conv, 10);
    assert_eq!(conv.len(), 5, "short conversation should not be trimmed");
}

#[test]
fn truncate_for_context_returns_short_text_unchanged() {
    use jaskier_core::handlers::anthropic_streaming::truncate_for_context_with_limit;
    let text = "hello world";
    assert_eq!(truncate_for_context_with_limit(text, 100), text);
}

#[test]
fn truncate_for_context_truncates_long_text_with_marker() {
    use jaskier_core::handlers::anthropic_streaming::truncate_for_context_with_limit;
    let text = "a".repeat(500);
    let truncated = truncate_for_context_with_limit(&text, 100);
    assert!(truncated.contains("[Output truncated"));
    assert!(truncated.len() < 500 + 200); // truncated + marker
}

#[test]
fn dynamic_max_iterations_scales_with_prompt_length() {
    use jaskier_core::handlers::anthropic_streaming::dynamic_max_iterations;
    assert_eq!(dynamic_max_iterations(50), 15);
    assert_eq!(dynamic_max_iterations(500), 20);
    assert_eq!(dynamic_max_iterations(2000), 25);
}

#[test]
fn build_iteration_nudge_none_for_early_iterations() {
    use jaskier_core::handlers::anthropic_streaming::build_iteration_nudge;
    let conv = vec![serde_json::json!({"role": "user", "content": "test"})];
    assert!(build_iteration_nudge(1, 15, &conv).is_none());
    assert!(build_iteration_nudge(2, 15, &conv).is_none());
}

#[test]
fn build_iteration_nudge_some_for_later_iterations() {
    use jaskier_core::handlers::anthropic_streaming::build_iteration_nudge;
    let conv = vec![serde_json::json!({"role": "user", "content": "test"})];
    let nudge = build_iteration_nudge(5, 15, &conv);
    assert!(nudge.is_some());
    assert!(nudge.unwrap().contains("remaining"));
}

// ═══════════════════════════════════════════════════════════════════════════
//  Error types — jaskier-core::error
// ═══════════════════════════════════════════════════════════════════════════

#[test]
fn api_error_variants_have_correct_codes() {
    use jaskier_core::error::ApiError;
    assert_eq!(ApiError::BadRequest("".into()).error_code(), "BAD_REQUEST");
    assert_eq!(ApiError::NotFound("".into()).error_code(), "NOT_FOUND");
    assert_eq!(ApiError::Upstream("".into()).error_code(), "UPSTREAM_ERROR");
    assert_eq!(ApiError::Internal("".into()).error_code(), "INTERNAL_ERROR");
    assert_eq!(ApiError::Unauthorized("".into()).error_code(), "UNAUTHORIZED");
    assert_eq!(ApiError::Unavailable("".into()).error_code(), "SERVICE_UNAVAILABLE");
    assert_eq!(ApiError::ToolTimeout("".into()).error_code(), "TOOL_TIMEOUT");
    assert_eq!(ApiError::RateLimited("".into()).error_code(), "RATE_LIMITED");
}
