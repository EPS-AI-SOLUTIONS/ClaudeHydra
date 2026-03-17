//! `HasAnthropicStreamingState` trait implementation for CH AppState.
//!
//! Bridges CH-specific state (tool executor, session DB, MCP notifications)
//! into the shared anthropic_streaming handler from jaskier_core.

use axum::http::StatusCode;
use serde_json::{Value, json};

use jaskier_core::handlers::anthropic_streaming::{
    AnthropicChatContext, AnthropicToolDef, HasAnthropicStreamingState,
};

use crate::state::AppState;

use super::{
    TOOL_TIMEOUT_SECS, is_retryable_status, sanitize_json_strings, send_to_anthropic,
};
use super::agent_call::execute_agent_call;
use super::helpers::{load_session_history, send_task_complete_notification};

impl HasAnthropicStreamingState for AppState {
    fn db(&self) -> &sqlx::PgPool {
        &self.db
    }

    fn http_client(&self) -> &reqwest::Client {
        &self.http_client
    }

    fn rate_limiter(&self) -> &std::sync::Arc<jaskier_core::rate_limiter::GlobalRateLimiter> {
        &self.base.global_rate_limiter
    }

    fn send_to_anthropic(
        &self,
        body: &Value,
        timeout_secs: u64,
    ) -> impl std::future::Future<Output = Result<reqwest::Response, (StatusCode, String)>> + Send
    {
        let state = self.clone();
        let body = body.clone();
        async move {
            send_to_anthropic(&state, &body, timeout_secs)
                .await
                .map_err(|(status, axum::Json(err_val))| {
                    let msg = err_val
                        .get("error")
                        .and_then(|e| e.as_str())
                        .unwrap_or("Unknown error")
                        .to_string();
                    (status, msg)
                })
        }
    }

    async fn resolve_context(
        &self,
        _messages: &[Value],
        _model_override: Option<&str>,
        _session_id: Option<&str>,
        _temperature: Option<f64>,
        _max_tokens: Option<u32>,
        _tools_enabled: bool,
    ) -> AnthropicChatContext {
        // This is called internally by the shared handler. For CH, we resolve
        // context outside the trait (via resolve_chat_context) and pass it in.
        // This default impl is a fallback that should not be called directly.
        AnthropicChatContext {
            model: "claude-sonnet-4-6".to_string(),
            max_tokens: 4096,
            temperature: 0.7,
            max_iterations: 15,
            working_directory: String::new(),
            session_id: None,
            system_prompt: String::new(),
        }
    }

    fn build_tool_definitions(
        &self,
    ) -> impl std::future::Future<Output = Vec<AnthropicToolDef>> + Send {
        let state = self.clone();
        async move {
            state
                .tool_executor
                .tool_definitions_with_mcp(&state, None)
                .await
                .into_iter()
                .map(|td| AnthropicToolDef {
                    name: td.name,
                    description: td.description,
                    input_schema: td.input_schema,
                })
                .collect()
        }
    }

    fn execute_tool(
        &self,
        name: &str,
        input: &Value,
        working_directory: &str,
        _iteration: usize,
    ) -> impl std::future::Future<Output = (String, bool)> + Send {
        let state = self.clone();
        let name = name.to_string();
        let input = input.clone();
        let wd = working_directory.to_string();
        async move {
            if name == "call_agent" {
                // Acquire A2A concurrency permit (max 5 concurrent delegations)
                match state.a2a_semaphore.clone().acquire_owned().await {
                    Err(_) => (
                        "A2A delegation limit reached — semaphore closed".to_string(),
                        true,
                    ),
                    Ok(_permit) => {
                        match tokio::time::timeout(
                            std::time::Duration::from_secs(120),
                            execute_agent_call(&state, &input, &wd, 0),
                        )
                        .await
                        {
                            Ok(res) => res,
                            Err(_) => {
                                ("Agent delegation timed out after 120s".to_string(), true)
                            }
                        }
                    }
                }
            } else {
                let timeout = std::time::Duration::from_secs(TOOL_TIMEOUT_SECS);
                let executor = state.tool_executor.with_working_directory(&wd);
                match tokio::time::timeout(
                    timeout,
                    executor.execute_with_state(&name, &input, &state),
                )
                .await
                {
                    Ok(res) => res,
                    Err(_) => (
                        format!("Tool '{}' timed out after {}s", name, TOOL_TIMEOUT_SECS),
                        true,
                    ),
                }
            }
        }
    }

    fn tool_timeout_secs(&self) -> u64 {
        TOOL_TIMEOUT_SECS
    }

    fn load_session_history(
        &self,
        session_id: &uuid::Uuid,
    ) -> impl std::future::Future<Output = Vec<Value>> + Send {
        let db = self.db.clone();
        let sid = *session_id;
        async move { load_session_history(&db, &sid).await }
    }

    fn filter_messages(&self, messages: &[Value]) -> Vec<Value> {
        messages.to_vec()
    }

    fn sanitize_body(&self, body: &mut Value) {
        sanitize_json_strings(body);
    }

    fn fallback_models(&self) -> Vec<String> {
        vec![
            "claude-sonnet-4-6".to_string(),
            "claude-haiku-4-5-20251001".to_string(),
        ]
    }

    fn send_fallback_openai_compatible(
        &self,
        _model: &str, // Original model
        system: &str,
        messages: &[Value],
        temperature: f64,
        max_tokens: u32,
    ) -> impl std::future::Future<Output = Result<reqwest::Response, (StatusCode, String)>> + Send {
        let state = self.clone();
        let system_prompt = system.to_string();
        let msgs = messages.to_vec();

        async move {
            let api_keys = state.base.api_keys.read().await;

            let (target_model, base_url, api_key) = if let Some(key) = api_keys.get("deepseek") {
                ("deepseek-chat", "https://api.deepseek.com/chat/completions", key.to_string())
            } else if let Some(key) = api_keys.get("grok") {
                ("grok-2-1212", "https://api.x.ai/v1/chat/completions", key.to_string())
            } else if let Ok(key) = std::env::var("DEEPSEEK_API_KEY") {
                ("deepseek-chat", "https://api.deepseek.com/chat/completions", key)
            } else if let Ok(key) = std::env::var("XAI_API_KEY") {
                ("grok-2-1212", "https://api.x.ai/v1/chat/completions", key)
            } else {
                return Err((StatusCode::NOT_IMPLEMENTED, "No fallback API keys found (deepseek/grok)".to_string()));
            };

            let mut openai_messages = Vec::new();
            if !system_prompt.is_empty() {
                openai_messages.push(json!({
                    "role": "system",
                    "content": system_prompt
                }));
            }

            for msg in &msgs {
                let role = msg.get("role").unwrap_or(&json!("user")).clone();
                let mut content_str = String::new();
                if let Some(content_arr) = msg.get("content").and_then(|c| c.as_array()) {
                    for block in content_arr {
                        if let Some(text) = block.get("text").and_then(|t| t.as_str()) {
                            content_str.push_str(text);
                        }
                    }
                } else if let Some(text) = msg.get("content").and_then(|c| c.as_str()) {
                    content_str.push_str(text);
                }
                openai_messages.push(json!({
                    "role": role,
                    "content": content_str
                }));
            }

            let body = json!({
                "model": target_model,
                "messages": openai_messages,
                "stream": true,
                "temperature": temperature,
                "max_tokens": max_tokens
            });

            state.http_client.post(base_url)
                .header("Authorization", format!("Bearer {}", api_key))
                .json(&body)
                .send()
                .await
                .map_err(|e| (StatusCode::BAD_GATEWAY, e.to_string()))
        }
    }

    fn is_retryable_status(&self, status: u16) -> bool {
        is_retryable_status(status)
    }

    fn on_stream_complete(
        &self,
        model: &str,
        _total_tokens: u32,
        output_chars: usize,
        prompt_len: usize,
        latency_ms: u128,
    ) -> impl std::future::Future<Output = ()> + Send {
        let db = self.db.clone();
        let state = self.clone();
        let model = model.to_string();
        async move {
            // Token usage tracking — fire-and-forget
            let latency = latency_ms.min(i32::MAX as u128) as i32;
            let input_est = (prompt_len / 4) as i32;
            let output_est = (output_chars / 4) as i32;
            let tier = if model.contains("opus") {
                "commander"
            } else if model.contains("sonnet") {
                "coordinator"
            } else if model.contains("haiku") {
                "executor"
            } else if model.contains("flash") {
                "flash"
            } else {
                "coordinator"
            };
            let m = model.clone();
            let db_clone = db.clone();
            tokio::spawn(async move {
                let _ = sqlx::query(
                    "INSERT INTO ch_agent_usage (agent_id, model, input_tokens, output_tokens, total_tokens, latency_ms, success, tier) \
                     VALUES (NULL, $1, $2, $3, $4, $5, TRUE, $6)",
                )
                .bind(&m)
                .bind(input_est)
                .bind(output_est)
                .bind(input_est + output_est)
                .bind(latency)
                .bind(tier)
                .execute(&db_clone)
                .await;
            });

            // Fire-and-forget: task completion notification
            tokio::spawn(async move {
                send_task_complete_notification(&state, &model).await;
            });
        }
    }

    fn on_tool_loop_complete(
        &self,
        model: &str,
    ) -> impl std::future::Future<Output = ()> + Send {
        let state = self.clone();
        let model = model.to_string();
        async move {
            send_task_complete_notification(&state, &model).await;
        }
    }

    fn auto_fix_enabled(&self) -> bool {
        true
    }

    fn auto_fix_keywords(&self) -> &[&str] {
        &[
            "fix",
            "napraw",
            "zmian",
            "popraw",
            "zastosow",
            "write_file",
            "edit_file",
            "zmieni",
            "edytu",
            "zapisa",
        ]
    }

    fn forced_synthesis_enabled(&self) -> bool {
        true
    }

    fn forced_synthesis_threshold(&self) -> usize {
        100
    }
}
