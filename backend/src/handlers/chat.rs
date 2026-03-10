//! Non-streaming Claude chat endpoints.
//!
//! - `claude_models` — list resolved Claude models per tier
//! - `claude_chat` — non-streaming chat completion

use axum::Json;
use axum::extract::State;
use axum::http::StatusCode;
use serde_json::{Value, json};

use crate::models::*;
use crate::state::AppState;

use super::{sanitize_json_strings, send_to_anthropic};

// ═══════════════════════════════════════════════════════════════════════
//  Claude models endpoint
// ═══════════════════════════════════════════════════════════════════════

/// GET /api/claude/models — dynamically resolved Claude models per tier
#[utoipa::path(get, path = "/api/claude/models", tag = "chat",
    responses((status = 200, description = "List Claude models per tier")))]
pub async fn claude_models(State(state): State<AppState>) -> Json<Value> {
    let resolved = crate::model_registry::resolve_models(&state).await;

    let models = vec![
        ClaudeModelInfo {
            id: resolved
                .commander
                .as_ref()
                .map(|m| m.id.clone())
                .unwrap_or_else(|| "claude-opus-4-6".to_string()),
            name: resolved
                .commander
                .as_ref()
                .and_then(|m| m.display_name.clone())
                .unwrap_or_else(|| "Claude Opus".to_string()),
            tier: "Commander".to_string(),
            provider: "anthropic".to_string(),
            available: true,
        },
        ClaudeModelInfo {
            id: resolved
                .coordinator
                .as_ref()
                .map(|m| m.id.clone())
                .unwrap_or_else(|| "claude-sonnet-4-6".to_string()),
            name: resolved
                .coordinator
                .as_ref()
                .and_then(|m| m.display_name.clone())
                .unwrap_or_else(|| "Claude Sonnet".to_string()),
            tier: "Coordinator".to_string(),
            provider: "anthropic".to_string(),
            available: true,
        },
        ClaudeModelInfo {
            id: resolved
                .executor
                .as_ref()
                .map(|m| m.id.clone())
                .unwrap_or_else(|| "claude-haiku-4-5-20251001".to_string()),
            name: resolved
                .executor
                .as_ref()
                .and_then(|m| m.display_name.clone())
                .unwrap_or_else(|| "Claude Haiku".to_string()),
            tier: "Executor".to_string(),
            provider: "anthropic".to_string(),
            available: true,
        },
    ];

    Json(serde_json::to_value(models).unwrap_or_else(|_| json!({"error": "serialization failed"})))
}

// ═══════════════════════════════════════════════════════════════════════
//  Non-streaming chat
// ═══════════════════════════════════════════════════════════════════════

/// POST /api/claude/chat — non-streaming Claude request
#[utoipa::path(post, path = "/api/claude/chat", tag = "chat",
    request_body = ChatRequest,
    responses((status = 200, description = "Chat completion response")))]
pub async fn claude_chat(
    State(state): State<AppState>,
    Json(req): Json<ChatRequest>,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    let default_model = crate::model_registry::get_model_id(&state, "coordinator").await;
    let model = req.model.unwrap_or(default_model);
    let max_tokens = req.max_tokens.unwrap_or(4096);

    let messages: Vec<Value> = req
        .messages
        .iter()
        .map(|m| json!({ "role": m.role, "content": m.content }))
        .collect();

    let mut body = json!({
        "model": model,
        "max_tokens": max_tokens,
        "messages": messages,
    });

    if let Some(temp) = req.temperature {
        body["temperature"] = json!(temp);
    }

    sanitize_json_strings(&mut body);

    let resp = send_to_anthropic(&state, &body, 120).await?;

    if !resp.status().is_success() {
        let status = resp.status();
        let err_body: Value = resp.json().await.unwrap_or_default();
        tracing::error!("anthropic chat: status={}, body={}", status, err_body);
        return Err((
            StatusCode::from_u16(status.as_u16()).unwrap_or(StatusCode::BAD_GATEWAY),
            Json(json!({ "error": "AI provider request failed" })),
        ));
    }

    let resp_body: Value = resp.json().await.map_err(|e| {
        tracing::error!("anthropic chat: invalid JSON response: {}", e);
        (
            StatusCode::BAD_GATEWAY,
            Json(json!({ "error": "AI provider returned invalid response" })),
        )
    })?;

    let content = resp_body
        .get("content")
        .and_then(|c| c.as_array())
        .map(|blocks| {
            blocks
                .iter()
                .filter_map(|b| b.get("text").and_then(|t| t.as_str()))
                .collect::<Vec<&str>>()
                .join("")
        })
        .unwrap_or_default();

    let response_model = resp_body
        .get("model")
        .and_then(|m| m.as_str())
        .unwrap_or(&model)
        .to_string();

    let usage = resp_body.get("usage").map(|u| UsageInfo {
        prompt_tokens: u.get("input_tokens").and_then(|v| v.as_u64()).unwrap_or(0) as u32,
        completion_tokens: u.get("output_tokens").and_then(|v| v.as_u64()).unwrap_or(0) as u32,
        total_tokens: (u.get("input_tokens").and_then(|v| v.as_u64()).unwrap_or(0)
            + u.get("output_tokens").and_then(|v| v.as_u64()).unwrap_or(0))
            as u32,
    });

    let chat_resp = ChatResponse {
        id: resp_body
            .get("id")
            .and_then(|v| v.as_str())
            .unwrap_or("unknown")
            .to_string(),
        message: ChatMessage {
            role: "assistant".to_string(),
            content,
            model: Some(response_model.clone()),
            timestamp: Some(chrono::Utc::now().to_rfc3339()),
        },
        model: response_model,
        usage,
    };

    Ok(Json(serde_json::to_value(chat_resp).map_err(|_| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"error": "serialization failed"})),
        )
    })?))
}
