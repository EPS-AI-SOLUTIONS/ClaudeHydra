// handlers/ — HTTP handlers for the Unified AI Provider Gateway.
//
// Split into focused submodules:
// - `types` — Request / Response types
// - `router` — Sub-router builder + shared error helpers
// - `providers` — Provider management handlers (list, status, connect, etc.)
// - `proxy` — Chat proxy handlers (non-streaming + SSE streaming)
// - `helpers` — Private utility functions (payload builders, content extractors)

mod types;
pub mod router;
pub mod providers;
pub mod proxy;
pub(crate) mod helpers;

// ── Public re-exports ────────────────────────────────────────────────────
pub use types::*;
pub use router::ai_gateway_router;

// ═══════════════════════════════════════════════════════════════════════════
//  Tests
// ═══════════════════════════════════════════════════════════════════════════

#[cfg(test)]
mod tests {
    use axum::http::StatusCode;
    use serde_json::json;

    use crate::ai_gateway::AiProvider;
    use super::helpers::*;
    use super::router::parse_provider;
    use super::types::*;

    #[test]
    fn parse_provider_valid() {
        assert!(parse_provider("anthropic").is_ok());
        assert!(parse_provider("openai").is_ok());
        assert!(parse_provider("google").is_ok());
        assert!(parse_provider("gemini").is_ok());
        assert!(parse_provider("xai").is_ok());
        assert!(parse_provider("grok").is_ok());
        assert!(parse_provider("deepseek").is_ok());
        assert!(parse_provider("ollama").is_ok());
    }

    #[test]
    fn parse_provider_invalid() {
        let err = parse_provider("unknown").unwrap_err();
        assert_eq!(err.0, StatusCode::BAD_REQUEST);
    }

    #[test]
    fn resolve_upstream_url_with_model_placeholder() {
        let url = "https://api.example.com/v1/models/{model}:generate";
        assert_eq!(
            resolve_upstream_url(url, "gemini-2.5-pro"),
            "https://api.example.com/v1/models/gemini-2.5-pro:generate",
        );
    }

    #[test]
    fn resolve_upstream_url_without_placeholder() {
        let url = "https://api.anthropic.com/v1/messages";
        assert_eq!(resolve_upstream_url(url, "claude-sonnet"), url);
    }

    #[test]
    fn build_test_payload_anthropic() {
        let payload = build_test_payload(&AiProvider::Anthropic, "claude-sonnet-4-6");
        assert_eq!(payload["model"], "claude-sonnet-4-6");
        assert_eq!(payload["max_tokens"], 32);
        assert!(payload["messages"].as_array().unwrap().len() == 1);
    }

    #[test]
    fn build_test_payload_google() {
        let payload = build_test_payload(&AiProvider::Google, "gemini-2.5-pro");
        assert!(payload.get("contents").is_some());
        assert!(payload.get("model").is_none()); // Gemini uses contents, not model in body
    }

    #[test]
    fn build_chat_payload_openai_format() {
        let request = GatewayChatRequest {
            model: Some("gpt-4o".to_string()),
            messages: vec![
                GatewayChatMessage {
                    role: "user".to_string(),
                    content: "Hello".to_string(),
                },
            ],
            temperature: Some(0.5),
            max_tokens: Some(1024),
            stream: None,
        };
        let payload = build_chat_payload(&AiProvider::OpenAI, "gpt-4o", &request);
        assert_eq!(payload["model"], "gpt-4o");
        assert_eq!(payload["temperature"], 0.5);
        assert_eq!(payload["max_tokens"], 1024);
        assert_eq!(payload["messages"][0]["role"], "user");
    }

    #[test]
    fn build_chat_payload_google_role_mapping() {
        let request = GatewayChatRequest {
            model: None,
            messages: vec![
                GatewayChatMessage {
                    role: "user".to_string(),
                    content: "Hi".to_string(),
                },
                GatewayChatMessage {
                    role: "assistant".to_string(),
                    content: "Hello!".to_string(),
                },
            ],
            temperature: None,
            max_tokens: None,
            stream: None,
        };
        let payload = build_chat_payload(&AiProvider::Google, "gemini-2.5-pro", &request);
        // Google maps "assistant" -> "model"
        assert_eq!(payload["contents"][1]["role"], "model");
        assert_eq!(payload["contents"][0]["role"], "user");
    }

    #[test]
    fn extract_content_anthropic() {
        let body = json!({
            "content": [{"type": "text", "text": "Hello from Claude"}],
        });
        assert_eq!(
            extract_content_text(&AiProvider::Anthropic, &body),
            "Hello from Claude",
        );
    }

    #[test]
    fn extract_content_openai() {
        let body = json!({
            "choices": [{"message": {"content": "Hello from GPT"}}],
        });
        assert_eq!(
            extract_content_text(&AiProvider::OpenAI, &body),
            "Hello from GPT",
        );
    }

    #[test]
    fn extract_content_google() {
        let body = json!({
            "candidates": [{"content": {"parts": [{"text": "Hello from Gemini"}]}}],
        });
        assert_eq!(
            extract_content_text(&AiProvider::Google, &body),
            "Hello from Gemini",
        );
    }

    #[test]
    fn extract_content_ollama() {
        let body = json!({
            "message": {"content": "Hello from Ollama"},
        });
        assert_eq!(
            extract_content_text(&AiProvider::Ollama, &body),
            "Hello from Ollama",
        );
    }

    #[test]
    fn extract_content_empty() {
        assert_eq!(extract_content_text(&AiProvider::Anthropic, &json!({})), "");
        assert_eq!(extract_content_text(&AiProvider::OpenAI, &json!({})), "");
    }

    #[test]
    fn chunk_text_basic() {
        let chunks = chunk_text("Hello, world!", 5);
        assert_eq!(chunks, vec!["Hello", ", wor", "ld!"]);
    }

    #[test]
    fn chunk_text_empty() {
        let chunks = chunk_text("", 10);
        assert!(chunks.is_empty());
    }

    #[test]
    fn chunk_text_exact_boundary() {
        let chunks = chunk_text("abcdef", 3);
        assert_eq!(chunks, vec!["abc", "def"]);
    }

    #[test]
    fn chunk_text_utf8() {
        // Polish characters: "źdźbło" — multi-byte UTF-8
        let text = "źdźbło";
        let chunks = chunk_text(text, 3);
        // Should not panic and should produce valid UTF-8 chunks
        for chunk in &chunks {
            assert!(chunk.is_ascii() || !chunk.is_empty());
        }
        let reassembled: String = chunks.into_iter().collect();
        assert_eq!(reassembled, text);
    }
}
