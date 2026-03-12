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

pub mod agents;
pub mod chat;
pub mod files;
pub mod health;
pub mod prompt;
pub mod prompt_history;
pub mod sessions;
pub mod settings;
pub mod streaming;

// Re-export everything (including utoipa __path_* types needed by OpenApi derive)
pub use agents::*;
pub use chat::*;
pub use files::*;
pub use health::*;
pub use prompt::warm_prompt_cache;
pub use prompt_history::*;
pub use sessions::*;
pub use settings::*;
pub use streaming::*;

// ── Shared constants ──────────────────────────────────────────────────────

pub(crate) const TOOL_TIMEOUT_SECS: u64 = 60;
pub(crate) const MAX_MESSAGE_LENGTH: usize = 100_000;

// ── Shared helpers ────────────────────────────────────────────────────────

use axum::Json;
use axum::http::StatusCode;
use serde_json::{Value, json};

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

/// Get the Anthropic credential.
/// Returns `(token_or_key, is_oauth)`.
async fn get_anthropic_credential(state: &AppState) -> Option<(String, bool)> {
    // 1. Try Anthropic OAuth token from DB
    if let Some(token) = crate::oauth::get_valid_access_token(state).await {
        return Some((token, true));
    }
    // 2. Try runtime state (hot-loaded API key)
    {
        let rt = state.runtime.read().await;
        if let Some(key) = rt.api_keys.get("ANTHROPIC_API_KEY")
            && !key.is_empty()
        {
            return Some((key.clone(), false));
        }
    }
    // 3. Try env var
    std::env::var("ANTHROPIC_API_KEY")
        .ok()
        .filter(|k| !k.is_empty())
        .map(|k| (k, false))
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
