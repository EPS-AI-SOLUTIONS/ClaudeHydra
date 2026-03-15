//! Handler modules for ClaudeHydra v4 API.
//!
//! Split from monolithic `handlers.rs` into focused sub-modules:
//! - `prompt` — system prompt construction, chat context resolution, auto-tier routing
//! - `streaming` — NDJSON streaming handlers (Anthropic SSE + Gemini hybrid)
//! - `chat` — non-streaming Claude chat endpoints
//! - `health` — health, readiness, system stats, auth mode, admin
//! - `sessions` — session CRUD, messages, AI title generation
//! - `settings` — application settings endpoints
//! - `agents` — agent listing and refresh
//! - `files` — file listing and native folder browser
//! - `prompt_history` — bash-like prompt recall
//! - `analytics` — agent performance dashboard aggregation endpoints

pub mod agents;
pub mod analytics;
pub mod chat;
pub mod files;
pub mod health;
pub mod prompt;
pub mod prompt_history;
pub mod sessions;
pub mod settings;
pub mod streaming;
pub mod tags;

// Re-export everything (including utoipa __path_* types needed by OpenApi derive)
pub use agents::*;
pub use analytics::*;
pub use chat::*;
pub use files::*;
pub use health::*;
pub use prompt::warm_prompt_cache;
pub use prompt_history::*;
pub use sessions::*;
pub use settings::*;
pub use streaming::*;
pub use tags::*;

// ── Shared constants ──────────────────────────────────────────────────────

pub(crate) const TOOL_TIMEOUT_SECS: u64 = 60;
pub(crate) const MAX_MESSAGE_LENGTH: usize = 100_000;

// ── Shared helpers ────────────────────────────────────────────────────────

use axum::Json;
use axum::http::StatusCode;
use serde_json::{Value, json};

use crate::ai_gateway::vault_bridge::HasVaultBridge;
use crate::state::AppState;

/// Check if an HTTP status code is retryable (429 Too Many Requests or 5xx).
pub(crate) fn is_retryable_status(status: u16) -> bool {
    status == 429 || (500..=599).contains(&status)
}

/// UTF-8 safe truncation for context window limits.
pub(crate) fn truncate_for_context_with_limit(text: &str, max_chars: usize) -> String {
    if text.len() <= max_chars {
        return text.to_string();
    }
    let boundary = text
        .char_indices()
        .take_while(|(idx, _)| *idx < max_chars)
        .last()
        .map(|(idx, c)| idx + c.len_utf8())
        .unwrap_or(max_chars.min(text.len()));
    format!(
        "{}... [truncated, {} chars total]",
        &text[..boundary],
        text.len()
    )
}

/// Sanitize JSON strings — remove null bytes and BOM that break API calls.
pub(crate) fn sanitize_json_strings(value: &mut Value) {
    match value {
        Value::String(s) => {
            *s = s.replace(['\0', '\u{FEFF}'], "");
        }
        Value::Array(arr) => {
            for v in arr {
                sanitize_json_strings(v);
            }
        }
        Value::Object(map) => {
            for v in map.values_mut() {
                sanitize_json_strings(v);
            }
        }
        _ => {}
    }
}

// ── Anthropic API helpers ─────────────────────────────────────────────────

/// Get the Anthropic credential with dual resolution strategy:
/// 1. First try: Jaskier Vault (`ai_providers/anthropic_max`)
/// 2. Fallback: Old DB path (`jaskier_oauth::anthropic::get_valid_anthropic_access_token`)
/// 3. Last resort: Runtime API keys / `ANTHROPIC_API_KEY` env var
///
/// Returns `(token_or_key, is_oauth)`.
async fn get_anthropic_credential(state: &AppState) -> Option<(String, bool)> {
    // 1. Try Vault first (ai_providers/anthropic_max)
    match state.vault_client().get("ai_providers", "anthropic_max").await {
        Ok(cred) if cred.is_connected => {
            // Vault has a connected credential — use delegate for actual API calls.
            // For header injection (non-delegate path), extract the masked value
            // as a signal that Vault is the active source. The actual token is
            // injected by the Vault Bouncer in `send_to_anthropic_via_vault`.
            tracing::info!("Using Vault credential for Anthropic (plan: {:?})", cred.plan_tier);
            // Return a sentinel that tells build_anthropic_request to use OAuth Bearer.
            // The real token was already validated by Vault — masked_value is proof of connection.
            // For direct API calls, callers should prefer vault_delegate() instead.
            return Some(("__vault_managed__".to_string(), true));
        }
        Ok(cred) => {
            tracing::debug!(
                "Vault has Anthropic credential but not connected (is_connected={}), falling back",
                cred.is_connected
            );
        }
        Err(crate::ai_gateway::vault_bridge::VaultError::NotFound) => {
            tracing::debug!("Vault has no Anthropic credential, falling back to DB OAuth");
        }
        Err(crate::ai_gateway::vault_bridge::VaultError::AnomalyDetected(msg)) => {
            tracing::error!("ANOMALY DETECTED from Vault during credential resolution: {}", msg);
            // On anomaly, do NOT fall through — fail safe
            return None;
        }
        Err(e) => {
            tracing::debug!("Vault unavailable ({}), falling back to DB OAuth", e);
        }
    }

    // 2. Fallback: Old DB OAuth path (will be removed after full Vault migration)
    if let Some(token) = jaskier_oauth::anthropic::get_valid_anthropic_access_token(state).await {
        tracing::info!("Falling back to DB OAuth for Anthropic");
        return Some((token, true));
    }
    // 3. Try runtime state (hot-loaded API key)
    {
        let rt = state.runtime.read().await;
        if let Some(key) = rt.api_keys.get("ANTHROPIC_API_KEY")
            && !key.is_empty()
        {
            tracing::info!("Falling back to runtime API key for Anthropic");
            return Some((key.clone(), false));
        }
    }
    // 4. Last resort: env var
    if let Some(key) = std::env::var("ANTHROPIC_API_KEY")
        .ok()
        .filter(|k| !k.is_empty())
    {
        tracing::info!("Falling back to ANTHROPIC_API_KEY env var for Anthropic");
        return Some((key, false));
    }

    None
}

/// Build a request to the Anthropic Messages API.
fn build_anthropic_request(
    state: &AppState,
    body: &Value,
    credential: &str,
    timeout_secs: u64,
    is_oauth: bool,
) -> reqwest::RequestBuilder {
    let mut req = state
        .http_client
        .post("https://api.anthropic.com/v1/messages")
        .timeout(std::time::Duration::from_secs(timeout_secs))
        .header("content-type", "application/json")
        .header("anthropic-version", "2023-06-01");

    if is_oauth {
        req = req.header("authorization", format!("Bearer {}", credential));
    } else {
        req = req.header("x-api-key", credential);
    }

    req.json(body)
}

/// Send a single request to Anthropic (no retry).
///
/// When Vault is the active credential source (`__vault_managed__`), this
/// delegates the upstream HTTP call through Vault Bouncer — the raw token
/// never leaves the Vault process. For non-Vault credentials (DB OAuth,
/// API key), the old direct-request path is used.
async fn send_to_anthropic_once(
    state: &AppState,
    body: &Value,
    timeout_secs: u64,
) -> Result<reqwest::Response, (StatusCode, Json<Value>)> {
    let (credential, is_oauth) = get_anthropic_credential(state).await.ok_or_else(|| {
        (
            StatusCode::UNAUTHORIZED,
            Json(json!({ "error": "No Anthropic API key configured" })),
        )
    })?;

    // ── Vault Bouncer path ────────────────────────────────────────────────
    // When credential is "__vault_managed__", delegate the API call through Vault.
    // The Vault Bouncer injects the real Bearer token; this backend never sees it.
    if credential == "__vault_managed__" {
        return send_to_anthropic_via_vault(state, body, timeout_secs).await;
    }

    // ── Direct path (DB OAuth token or API key) ───────────────────────────
    let resp = build_anthropic_request(state, body, &credential, timeout_secs, is_oauth)
        .send()
        .await
        .map_err(|e| {
            tracing::error!("anthropic proxy: {}", e);
            (
                StatusCode::BAD_GATEWAY,
                Json(json!({ "error": "AI provider request failed" })),
            )
        })?;

    // If OAuth returned 401, fallback to API key
    if is_oauth && resp.status() == reqwest::StatusCode::UNAUTHORIZED {
        tracing::warn!("OAuth token rejected (401), falling back to API key");
        if let Some((api_key, false)) = get_anthropic_api_key_only(state).await {
            return build_anthropic_request(state, body, &api_key, timeout_secs, false)
                .send()
                .await
                .map_err(|e| {
                    tracing::error!("anthropic proxy fallback: {}", e);
                    (
                        StatusCode::BAD_GATEWAY,
                        Json(json!({ "error": "AI provider request failed" })),
                    )
                });
        }
    }

    Ok(resp)
}

/// Send a request to Anthropic through the Vault Bouncer (zero-trust delegation).
///
/// The Vault decrypts the credential, injects the Bearer token, and makes the
/// upstream HTTP call. This backend receives only the response — the raw token
/// never enters our process memory.
///
/// Returns a synthetic `reqwest::Response` built from the Vault delegate response,
/// preserving the existing contract expected by `send_to_anthropic`.
async fn send_to_anthropic_via_vault(
    state: &AppState,
    body: &Value,
    _timeout_secs: u64,
) -> Result<reqwest::Response, (StatusCode, Json<Value>)> {
    let vault = state.vault_client();

    let delegate_result = vault
        .delegate(
            "https://api.anthropic.com/v1/messages",
            "POST",
            "ai_providers",
            "anthropic_max",
            Some(body.clone()),
        )
        .await;

    match delegate_result {
        Ok(vault_resp) => {
            tracing::debug!(
                "Vault Bouncer delegate completed (status={}, latency={}ms)",
                vault_resp.status,
                vault_resp.latency_ms
            );

            // Build a synthetic reqwest::Response from Vault delegate response
            let status_code = reqwest::StatusCode::from_u16(vault_resp.status)
                .unwrap_or(reqwest::StatusCode::BAD_GATEWAY);

            let response_bytes = serde_json::to_vec(&vault_resp.body).unwrap_or_default();
            let http_resp = http::Response::builder()
                .status(status_code)
                .header("content-type", "application/json")
                .body(response_bytes)
                .map_err(|e| {
                    tracing::error!("Failed to build synthetic response: {}", e);
                    (
                        StatusCode::INTERNAL_SERVER_ERROR,
                        Json(json!({ "error": "Internal error building Vault response" })),
                    )
                })?;

            Ok(reqwest::Response::from(http_resp))
        }
        Err(crate::ai_gateway::vault_bridge::VaultError::AnomalyDetected(msg)) => {
            tracing::error!("ANOMALY DETECTED during Vault delegate: {}", msg);
            Err((
                StatusCode::SERVICE_UNAVAILABLE,
                Json(json!({ "error": "Security anomaly detected — operations halted" })),
            ))
        }
        Err(e) => {
            tracing::warn!("Vault Bouncer delegate failed ({}), falling back to direct path", e);

            // Fallback: try DB OAuth or API key directly
            if let Some(token) = jaskier_oauth::anthropic::get_valid_anthropic_access_token(state).await {
                tracing::info!("Vault delegate failed — falling back to DB OAuth token");
                return build_anthropic_request(state, body, &token, _timeout_secs, true)
                    .send()
                    .await
                    .map_err(|e| {
                        tracing::error!("anthropic proxy (vault fallback): {}", e);
                        (
                            StatusCode::BAD_GATEWAY,
                            Json(json!({ "error": "AI provider request failed" })),
                        )
                    });
            }

            if let Some((api_key, false)) = get_anthropic_api_key_only(state).await {
                tracing::info!("Vault delegate failed — falling back to API key");
                return build_anthropic_request(state, body, &api_key, _timeout_secs, false)
                    .send()
                    .await
                    .map_err(|e| {
                        tracing::error!("anthropic proxy (vault fallback): {}", e);
                        (
                            StatusCode::BAD_GATEWAY,
                            Json(json!({ "error": "AI provider request failed" })),
                        )
                    });
            }

            Err((
                StatusCode::BAD_GATEWAY,
                Json(json!({ "error": format!("Vault delegate failed and no fallback available: {}", e) })),
            ))
        }
    }
}

/// Get Anthropic API key only (skip OAuth). Used as fallback.
async fn get_anthropic_api_key_only(state: &AppState) -> Option<(String, bool)> {
    {
        let rt = state.runtime.read().await;
        if let Some(key) = rt.api_keys.get("ANTHROPIC_API_KEY")
            && !key.is_empty()
        {
            return Some((key.clone(), false));
        }
    }
    std::env::var("ANTHROPIC_API_KEY")
        .ok()
        .filter(|k| !k.is_empty())
        .map(|k| (k, false))
}

/// Send to Anthropic with circuit breaker + retry on 429/5xx.
pub(crate) async fn send_to_anthropic(
    state: &AppState,
    body: &Value,
    timeout_secs: u64,
) -> Result<reqwest::Response, (StatusCode, Json<Value>)> {
    // Circuit breaker gate
    if let Err(msg) = state.circuit_breaker.check().await {
        return Err((
            StatusCode::SERVICE_UNAVAILABLE,
            Json(json!({
                "error": msg
            })),
        ));
    }

    let resp = send_to_anthropic_once(state, body, timeout_secs).await?;

    if resp.status().is_success() {
        state.circuit_breaker.record_success().await;
        Ok(resp)
    } else if is_retryable_status(resp.status().as_u16()) {
        state.circuit_breaker.record_failure().await;
        // Retry once with 2s backoff
        tokio::time::sleep(std::time::Duration::from_secs(2)).await;
        let retry_resp = send_to_anthropic_once(state, body, timeout_secs).await?;
        if retry_resp.status().is_success() {
            state.circuit_breaker.record_success().await;
        } else {
            state.circuit_breaker.record_failure().await;
        }
        Ok(retry_resp)
    } else {
        Ok(resp)
    }
}
