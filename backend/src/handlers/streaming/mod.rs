//! Streaming chat endpoints — NDJSON output from Anthropic SSE and Gemini SSE,
//! plus WebSocket streaming transport.
//!
//! Split into focused submodules:
//! - `trait_impl` — `HasAnthropicStreamingState` implementation for CH AppState
//! - `helpers` — session history, predictive prefetch, MCP notifications, DB persistence
//! - `gemini` — Gemini hybrid streaming (Google API SSE -> NDJSON)
//! - `websocket` — WebSocket streaming with rich protocol
//! - `agent_call` — Agent-to-Agent delegation (call_agent tool)
//!
//! BE-CH-003: NDJSON streaming uses `jaskier_core::handlers::anthropic_streaming`
//! shared handler with `HasAnthropicStreamingState` trait. WebSocket + A2A delegation
//! remain CH-specific (different protocol / deeply coupled to CH state).

mod trait_impl;
pub mod helpers;
mod gemini;
pub mod websocket;
pub mod agent_call;

use axum::Json;
use axum::http::StatusCode;
use axum::response::Response;
use serde_json::{Value, json};

use jaskier_core::handlers::anthropic_streaming::{
    self, AnthropicChatContext, dynamic_max_iterations,
};

use crate::models::*;
use crate::state::AppState;

use super::prompt::resolve_chat_context;
use super::{
    TOOL_TIMEOUT_SECS, is_retryable_status, sanitize_json_strings, send_to_anthropic,
    truncate_for_context_with_limit,
};
use helpers::{detect_view_hints, filter_client_system_prompt, load_session_history};

// ── Public re-exports ────────────────────────────────────────────────────

pub use websocket::ws_chat;

// ═══════════════════════════════════════════════════════════════════════
//  Predictive Prefetch — REST endpoint for NDJSON clients
// ═══════════════════════════════════════════════════════════════════════

/// POST /api/prefetch/hints — returns view hints for a given prompt.
/// Used by NDJSON streaming clients that can't receive WS `view_hint` events.
pub async fn prefetch_hints(
    Json(body): Json<Value>,
) -> Json<Value> {
    let prompt = body
        .get("prompt")
        .and_then(|v| v.as_str())
        .unwrap_or("");
    let hints = detect_view_hints(prompt);
    Json(json!({ "views": hints }))
}

// ═══════════════════════════════════════════════════════════════════════
//  Claude Streaming (SSE from Anthropic -> NDJSON to frontend)
//  BE-CH-003: Delegates to shared anthropic_streaming handler
// ═══════════════════════════════════════════════════════════════════════

/// POST /api/claude/chat/stream
#[utoipa::path(post, path = "/api/claude/chat/stream", tag = "chat",
    request_body = ChatRequest,
    responses((status = 200, description = "Streaming NDJSON response")))]
pub async fn claude_chat_stream(
    axum::extract::State(state): axum::extract::State<AppState>,
    Json(req): Json<ChatRequest>,
) -> Result<Response, (StatusCode, Json<Value>)> {
    // Gate: if tools_enabled, route to agentic handler
    if req.tools_enabled.unwrap_or(false) {
        return claude_chat_stream_with_tools(state, req).await;
    }

    let ctx = resolve_chat_context(&state, &req).await;
    tracing::info!(
        session_id = ?ctx.session_id,
        wd = %ctx.working_directory,
        model = %ctx.model,
        "chat stream (no-tools)"
    );

    // Hybrid routing: Gemini models -> Google API
    if ctx.model.starts_with("gemini-") {
        return gemini::google_chat_stream(state, req, ctx).await;
    }

    // ── Delegate to shared handler ──────────────────────────────────────
    let prompt_len = req.messages.iter().map(|m| m.content.len()).sum::<usize>();
    let messages = filter_client_system_prompt(&req.messages);

    let shared_ctx = AnthropicChatContext {
        model: ctx.model,
        max_tokens: ctx.max_tokens,
        temperature: ctx.temperature,
        max_iterations: ctx.max_iterations.max(1) as usize,
        working_directory: ctx.working_directory,
        session_id: ctx.session_id,
        system_prompt: ctx.system_prompt,
    };

    anthropic_streaming::anthropic_ndjson_stream_no_tools(&state, &shared_ctx, messages, prompt_len)
        .await
}

// ═══════════════════════════════════════════════════════════════════════
//  Claude Streaming with Tools (agentic tool_use loop)
//  BE-CH-003: Delegates to shared anthropic_streaming handler
// ═══════════════════════════════════════════════════════════════════════

async fn claude_chat_stream_with_tools(
    state: AppState,
    req: ChatRequest,
) -> Result<Response, (StatusCode, Json<Value>)> {
    let ctx = resolve_chat_context(&state, &req).await;

    // Dynamic iteration cap based on prompt complexity
    let prompt_len = req.messages.last().map(|m| m.content.len()).unwrap_or(0);
    let max_tool_iterations: usize =
        dynamic_max_iterations(prompt_len).min(ctx.max_iterations.max(1) as usize);

    // Build initial messages — prefer DB history when session_id present
    let initial_messages: Vec<Value> = if let Some(ref sid) = ctx.session_id {
        let mut history = load_session_history(&state.db, sid).await;
        if let Some(last) = req.messages.last() {
            history.push(json!({ "role": "user", "content": &last.content }));
        }
        history
    } else {
        filter_client_system_prompt(&req.messages)
    };

    let shared_ctx = AnthropicChatContext {
        model: ctx.model,
        max_tokens: ctx.max_tokens,
        temperature: ctx.temperature,
        max_iterations: max_tool_iterations,
        working_directory: ctx.working_directory,
        session_id: ctx.session_id,
        system_prompt: ctx.system_prompt,
    };

    // ── Delegate to shared handler ──────────────────────────────────────
    anthropic_streaming::anthropic_ndjson_stream_with_tools(&state, shared_ctx, initial_messages)
        .await
}
