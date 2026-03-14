// DEPRECATED — Skarbiec Krasnali migration
// This module is superseded by ai_gateway/. Credentials now managed by Jaskier Vault.
// TODO: Remove this file after full migration to ai_gateway (Phase 4, P4-001)
// New auth: /api/ai/providers/* endpoints in ai_gateway/handlers.rs
//
// Jaskier Shared Pattern — Anthropic OAuth PKCE
// Thin re-export from jaskier-oauth shared crate.
// All generic logic lives in crates/jaskier-oauth/src/anthropic.rs.

#[allow(deprecated)]
pub use jaskier_oauth::anthropic::{
    ANTHROPIC_BETA, AnthropicAuthCallbackRequest, REQUIRED_SYSTEM_PROMPT,
    ensure_system_prompt, get_valid_anthropic_access_token, has_anthropic_oauth_tokens,
};

use axum::Json;
use axum::extract::State;
use axum::http::StatusCode;
use serde_json::Value;

use crate::state::AppState;

// ── CH-specific handler wrappers (monomorphize the generic handlers) ────────
// These exist so lib.rs can reference `oauth::auth_status` etc. without
// turbofish syntax at every call-site, keeping the router clean.

/// GET /api/auth/status
#[deprecated(note = "Use ai_gateway module instead. Credentials managed by Jaskier Vault.")]
#[allow(deprecated)]
pub async fn auth_status(state: State<AppState>) -> Json<Value> {
    jaskier_oauth::anthropic::anthropic_auth_status(state).await
}

/// POST /api/auth/login
#[deprecated(note = "Use ai_gateway module instead. Credentials managed by Jaskier Vault.")]
#[allow(deprecated)]
pub async fn auth_login(state: State<AppState>) -> Json<Value> {
    jaskier_oauth::anthropic::anthropic_auth_login(state).await
}

/// POST /api/auth/callback
#[deprecated(note = "Use ai_gateway module instead. Credentials managed by Jaskier Vault.")]
#[allow(deprecated)]
pub async fn auth_callback(
    state: State<AppState>,
    body: Json<AnthropicAuthCallbackRequest>,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    jaskier_oauth::anthropic::anthropic_auth_callback(state, body).await
}

/// POST /api/auth/logout
#[deprecated(note = "Use ai_gateway module instead. Credentials managed by Jaskier Vault.")]
#[allow(deprecated)]
pub async fn auth_logout(state: State<AppState>) -> Json<Value> {
    jaskier_oauth::anthropic::anthropic_auth_logout(state).await
}

/// Get a valid OAuth access token, auto-refreshing if expired.
/// CH-specific wrapper — avoids turbofish at call-sites.
#[deprecated(note = "Use ai_gateway module instead. Credentials managed by Jaskier Vault.")]
#[allow(deprecated)]
pub async fn get_valid_access_token(state: &AppState) -> Option<String> {
    get_valid_anthropic_access_token(state).await
}

/// Check if OAuth tokens exist (for health check).
#[deprecated(note = "Use ai_gateway module instead. Credentials managed by Jaskier Vault.")]
#[allow(deprecated)]
pub async fn has_oauth_tokens(state: &AppState) -> bool {
    has_anthropic_oauth_tokens(state).await
}
