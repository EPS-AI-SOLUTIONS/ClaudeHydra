// helpers.rs — Private utility functions for AI Gateway handlers.

use serde_json::{json, Value};

use crate::ai_gateway::AiProvider;
use super::types::GatewayChatRequest;

/// Resolve the upstream URL, replacing `{model}` placeholder if present.
pub(crate) fn resolve_upstream_url(url_template: &str, model: &str) -> String {
    url_template.replace("{model}", model)
}

/// Build a minimal test payload for verifying provider connectivity.
pub(crate) fn build_test_payload(provider: &AiProvider, model: &str) -> Value {
    match provider {
        AiProvider::Anthropic => json!({
            "model": model,
            "max_tokens": 32,
            "messages": [{"role": "user", "content": "Say 'OK' and nothing else."}],
        }),
        AiProvider::OpenAI => json!({
            "model": model,
            "max_tokens": 32,
            "messages": [{"role": "user", "content": "Say 'OK' and nothing else."}],
        }),
        AiProvider::Google => json!({
            "contents": [{"parts": [{"text": "Say 'OK' and nothing else."}]}],
            "generationConfig": {"maxOutputTokens": 32},
        }),
        AiProvider::Xai => json!({
            "model": model,
            "messages": [{"role": "user", "content": "Say 'OK' and nothing else."}],
            "max_tokens": 32,
        }),
        AiProvider::DeepSeek => json!({
            "model": model,
            "max_tokens": 32,
            "messages": [{"role": "user", "content": "Say 'OK' and nothing else."}],
        }),
        AiProvider::Ollama => json!({
            "model": model,
            "messages": [{"role": "user", "content": "Say 'OK' and nothing else."}],
            "stream": false,
        }),
    }
}

/// Build the full chat payload in the provider's native format.
pub(crate) fn build_chat_payload(
    provider: &AiProvider,
    model: &str,
    request: &GatewayChatRequest,
) -> Value {
    let temperature = request.temperature.unwrap_or(0.7);
    let max_tokens = request.max_tokens.unwrap_or(4096);

    match provider {
        AiProvider::Anthropic => {
            let messages: Vec<Value> = request
                .messages
                .iter()
                .map(|m| json!({"role": m.role, "content": m.content}))
                .collect();
            json!({
                "model": model,
                "max_tokens": max_tokens,
                "temperature": temperature,
                "messages": messages,
            })
        }
        AiProvider::OpenAI => {
            let messages: Vec<Value> = request
                .messages
                .iter()
                .map(|m| json!({"role": m.role, "content": m.content}))
                .collect();
            json!({
                "model": model,
                "max_tokens": max_tokens,
                "temperature": temperature,
                "messages": messages,
            })
        }
        AiProvider::Google => {
            // Gemini uses a different message format: contents[].parts[].text
            let contents: Vec<Value> = request
                .messages
                .iter()
                .map(|m| {
                    let role = match m.role.as_str() {
                        "assistant" => "model",
                        other => other,
                    };
                    json!({
                        "role": role,
                        "parts": [{"text": m.content}],
                    })
                })
                .collect();
            json!({
                "contents": contents,
                "generationConfig": {
                    "maxOutputTokens": max_tokens,
                    "temperature": temperature,
                },
            })
        }
        AiProvider::Xai => {
            let messages: Vec<Value> = request
                .messages
                .iter()
                .map(|m| json!({"role": m.role, "content": m.content}))
                .collect();
            json!({
                "model": model,
                "max_tokens": max_tokens,
                "temperature": temperature,
                "messages": messages,
            })
        }
        AiProvider::DeepSeek => {
            let messages: Vec<Value> = request
                .messages
                .iter()
                .map(|m| json!({"role": m.role, "content": m.content}))
                .collect();
            json!({
                "model": model,
                "max_tokens": max_tokens,
                "temperature": temperature,
                "messages": messages,
            })
        }
        AiProvider::Ollama => {
            let messages: Vec<Value> = request
                .messages
                .iter()
                .map(|m| json!({"role": m.role, "content": m.content}))
                .collect();
            json!({
                "model": model,
                "messages": messages,
                "options": {
                    "temperature": temperature,
                    "num_predict": max_tokens,
                },
                "stream": false,
            })
        }
    }
}

/// Extract a short preview from the upstream response (for test results).
pub(crate) fn extract_response_preview(provider: &AiProvider, body: &Value) -> Option<String> {
    let text = extract_content_text(provider, body);
    if text.is_empty() {
        return None;
    }
    // Truncate preview to 200 chars
    if text.len() > 200 {
        Some(format!("{}...", &text[..text.floor_char_boundary(200)]))
    } else {
        Some(text)
    }
}

/// Extract the main content text from a provider's response body.
pub(crate) fn extract_content_text(provider: &AiProvider, body: &Value) -> String {
    match provider {
        AiProvider::Anthropic => {
            // Anthropic: { content: [{ type: "text", text: "..." }] }
            body.get("content")
                .and_then(|c| c.as_array())
                .and_then(|arr| arr.first())
                .and_then(|block| block.get("text"))
                .and_then(|t| t.as_str())
                .unwrap_or("")
                .to_string()
        }
        AiProvider::OpenAI | AiProvider::Xai | AiProvider::DeepSeek => {
            // OpenAI-compatible: { choices: [{ message: { content: "..." } }] }
            body.get("choices")
                .and_then(|c| c.as_array())
                .and_then(|arr| arr.first())
                .and_then(|choice| choice.get("message"))
                .and_then(|msg| msg.get("content"))
                .and_then(|t| t.as_str())
                .unwrap_or("")
                .to_string()
        }
        AiProvider::Google => {
            // Gemini: { candidates: [{ content: { parts: [{ text: "..." }] } }] }
            body.get("candidates")
                .and_then(|c| c.as_array())
                .and_then(|arr| arr.first())
                .and_then(|cand| cand.get("content"))
                .and_then(|content| content.get("parts"))
                .and_then(|parts| parts.as_array())
                .and_then(|arr| arr.first())
                .and_then(|part| part.get("text"))
                .and_then(|t| t.as_str())
                .unwrap_or("")
                .to_string()
        }
        AiProvider::Ollama => {
            // Ollama: { message: { content: "..." } }
            body.get("message")
                .and_then(|msg| msg.get("content"))
                .and_then(|t| t.as_str())
                .unwrap_or("")
                .to_string()
        }
    }
}

/// Chunk text into segments of approximately `chunk_size` characters,
/// respecting UTF-8 boundaries.
pub(crate) fn chunk_text(text: &str, chunk_size: usize) -> Vec<&str> {
    if text.is_empty() {
        return vec![];
    }
    let mut chunks = Vec::new();
    let mut start = 0;
    while start < text.len() {
        let end = (start + chunk_size).min(text.len());
        let end = text.floor_char_boundary(end);
        if end <= start {
            // Edge case: single multi-byte char wider than chunk_size
            let end = text.ceil_char_boundary(start + 1);
            chunks.push(&text[start..end]);
            start = end;
        } else {
            chunks.push(&text[start..end]);
            start = end;
        }
    }
    chunks
}
