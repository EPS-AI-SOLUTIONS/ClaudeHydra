//! WebSocket streaming transport — CH-specific rich protocol.
//!
//! Message types: Start/Token/Iteration/ToolCall/ToolResult/ToolProgress/
//! ViewHint/Fallback/Heartbeat/Complete/Error.
//!
//! Remains CH-specific because:
//! - CH uses its own WsClientMessage/WsServerMessage types
//! - CH WS handler supports `tools_enabled` toggle
//! - CH WS has unique auto-fix phase and forced synthesis
//! - CancellationToken integration is CH-specific

use std::collections::HashMap;

use axum::Json;
use axum::extract::State;
use axum::extract::ws::{Message as WsMessage, WebSocket, WebSocketUpgrade};
use axum::http::StatusCode;
use axum::response::IntoResponse;
use futures_util::{SinkExt, stream::SplitSink};
use serde_json::{Value, json};
use tokio_stream::StreamExt;
use tokio_util::sync::CancellationToken;

use jaskier_core::auth::validate_ws_token;
use jaskier_core::handlers::anthropic_streaming::{
    AnthropicSseEvent, AnthropicSseParser, build_iteration_nudge,
    dynamic_max_iterations, parse_sse_lines, sanitize_api_error,
    tool_result_context_limit, trim_conversation,
    truncate_for_context_with_limit as truncate_tool_output,
};

use crate::models::*;
use crate::state::AppState;

use super::{
    TOOL_TIMEOUT_SECS, is_retryable_status, sanitize_json_strings,
    send_to_anthropic, truncate_for_context_with_limit,
};
use super::agent_call::execute_agent_call;
use super::helpers::{detect_view_hints, load_session_history, store_ws_messages};
use crate::handlers::prompt::resolve_chat_context;

/// Send a `WsServerMessage` through the WebSocket sink.
async fn ws_send(sender: &mut SplitSink<WebSocket, WsMessage>, msg: &WsServerMessage) {
    let json = match serde_json::to_string(msg) {
        Ok(s) => s,
        Err(e) => {
            tracing::error!("ws_send serialization error: {}", e);
            return;
        }
    };
    if let Err(e) = sender.send(WsMessage::Text(json.into())).await {
        tracing::warn!("ws_send failed: {}", e);
    }
}

/// WebSocket upgrade handler for `/ws/chat`.
/// Auth via `?token=<secret>` query parameter (WS doesn't support custom headers).
pub async fn ws_chat(
    ws: WebSocketUpgrade,
    State(state): State<AppState>,
    axum::extract::Query(params): axum::extract::Query<HashMap<String, String>>,
) -> impl IntoResponse {
    // Build query string from params for validate_ws_token
    let query_string: String = params
        .iter()
        .map(|(k, v)| format!("{}={}", k, v))
        .collect::<Vec<_>>()
        .join("&");

    if !validate_ws_token(&query_string, state.auth_secret.as_deref()) {
        return (StatusCode::UNAUTHORIZED, "Invalid or missing auth token").into_response();
    }

    ws.on_upgrade(|socket| handle_ws(socket, state))
}

/// Main WebSocket message loop.
async fn handle_ws(socket: WebSocket, state: AppState) {
    let (mut sender, mut receiver) = futures_util::StreamExt::split(socket);
    let cancel = CancellationToken::new();

    tracing::info!("WebSocket client connected");

    loop {
        let msg = tokio::select! {
            msg = futures_util::StreamExt::next(&mut receiver) => msg,
            // Send heartbeat every 30s when idle
            _ = tokio::time::sleep(std::time::Duration::from_secs(30)) => {
                ws_send(&mut sender, &WsServerMessage::Heartbeat).await;
                continue;
            }
        };

        match msg {
            Some(Ok(WsMessage::Text(text))) => {
                let client_msg: WsClientMessage = match serde_json::from_str(&text) {
                    Ok(m) => m,
                    Err(e) => {
                        tracing::warn!("Invalid WS message: {}", e);
                        ws_send(
                            &mut sender,
                            &WsServerMessage::Error {
                                message: "Invalid message format".to_string(),
                                code: Some("PARSE_ERROR".to_string()),
                            },
                        )
                        .await;
                        continue;
                    }
                };

                match client_msg {
                    WsClientMessage::Ping => {
                        ws_send(&mut sender, &WsServerMessage::Pong).await;
                    }
                    WsClientMessage::Cancel => {
                        tracing::info!("Cancel requested");
                        cancel.cancel();
                    }
                    WsClientMessage::Execute {
                        prompt,
                        model,
                        tools_enabled,
                        session_id,
                    } => {
                        let child_cancel = cancel.child_token();
                        execute_streaming_ws(
                            &mut sender,
                            &state,
                            prompt,
                            model,
                            tools_enabled.unwrap_or(false),
                            session_id,
                            child_cancel,
                        )
                        .await;
                    }
                }
            }
            Some(Ok(WsMessage::Close(_))) | None => {
                tracing::info!("WebSocket client disconnected");
                break;
            }
            Some(Ok(WsMessage::Ping(data))) => {
                let _ = sender.send(WsMessage::Pong(data)).await;
            }
            _ => {}
        }
    }
}

/// Core WebSocket streaming execution with rich protocol.
///
/// This remains CH-specific because:
/// - CH uses its own WsClientMessage/WsServerMessage types (different from jaskier-core)
/// - CH WS handler supports `tools_enabled` toggle (vs OpenAI/Gemini always-tools)
/// - CH WS has unique auto-fix phase and forced synthesis
/// - CancellationToken integration is CH-specific
///
/// The Anthropic SSE parsing within WS uses the shared `AnthropicSseParser`.
async fn execute_streaming_ws(
    sender: &mut SplitSink<WebSocket, WsMessage>,
    state: &AppState,
    prompt: String,
    model_override: Option<String>,
    tools_enabled: bool,
    session_id: Option<String>,
    cancel: CancellationToken,
) {
    let execution_start = std::time::Instant::now();
    let execution_id = uuid::Uuid::new_v4().to_string();

    // Build a ChatRequest for resolve_chat_context
    let chat_req = ChatRequest {
        messages: vec![ChatMessage {
            role: "user".to_string(),
            content: prompt.clone(),
            model: None,
            timestamp: None,
        }],
        model: model_override,
        temperature: None,
        max_tokens: None,
        stream: Some(true),
        tools_enabled: Some(tools_enabled),
        session_id: session_id.clone(),
    };

    let ctx = resolve_chat_context(state, &chat_req).await;
    let model = ctx.model;
    let max_tokens = ctx.max_tokens;
    let effective_temperature = ctx.temperature;
    let wd = ctx.working_directory;
    let system_prompt = ctx.system_prompt;

    // Dynamic iteration cap
    let prompt_len = prompt.len();
    let max_tool_iterations: usize =
        dynamic_max_iterations(prompt_len).min(ctx.max_iterations.max(1) as usize);

    // Send Start
    ws_send(
        sender,
        &WsServerMessage::Start {
            id: execution_id.clone(),
            model: model.clone(),
            files_loaded: vec![],
        },
    )
    .await;

    // Predictive UI pre-fetching — emit view hints based on prompt keywords
    let view_hints = detect_view_hints(&prompt);
    if !view_hints.is_empty() {
        ws_send(sender, &WsServerMessage::ViewHint { views: view_hints }).await;
    }

    // Build initial messages — prefer DB history when session_id present
    let initial_messages: Vec<Value> = if let Some(ref sid) = ctx.session_id {
        let mut history = load_session_history(&state.db, sid).await;
        history.push(json!({ "role": "user", "content": &prompt }));
        history
    } else {
        vec![json!({ "role": "user", "content": &prompt })]
    };

    // Non-tools path: simple streaming without tool loop
    if !tools_enabled {
        let mut body = json!({
            "model": &model,
            "max_tokens": max_tokens,
            "system": &system_prompt,
            "messages": &initial_messages,
            "stream": true,
        });
        if effective_temperature > 0.0 {
            body["temperature"] = json!(effective_temperature);
        }
        sanitize_json_strings(&mut body);

        let resp = match send_to_anthropic(state, &body, 300).await {
            Ok(r) => r,
            Err((_, Json(err_val))) => {
                let raw_msg = err_val
                    .get("error")
                    .and_then(|e| e.as_str())
                    .unwrap_or("Unknown error");
                tracing::error!("WS: send_to_anthropic failed (no-tools): {}", raw_msg);
                ws_send(
                    sender,
                    &WsServerMessage::Error {
                        message: "AI provider request failed".to_string(),
                        code: Some("API_ERROR".to_string()),
                    },
                )
                .await;
                return;
            }
        };

        // Fallback chain
        let resp = if !resp.status().is_success()
            && is_retryable_status(resp.status().as_u16())
        {
            let original_status = resp.status();
            let fallback_models = ["claude-sonnet-4-6", "claude-haiku-4-5-20251001"];
            let mut fallback_resp = None;
            for fb_model in &fallback_models {
                if *fb_model == model {
                    continue;
                }
                tracing::warn!(
                    "ws: {} returned {}, falling back to {}",
                    model,
                    original_status,
                    fb_model
                );
                body["model"] = json!(fb_model);
                if let Ok(fb) = send_to_anthropic(state, &body, 300).await
                    && fb.status().is_success()
                {
                    let reason = if original_status.as_u16() == 429 {
                        "rate_limited"
                    } else {
                        "server_error"
                    };
                    ws_send(
                        sender,
                        &WsServerMessage::Fallback {
                            from: model.clone(),
                            to: fb_model.to_string(),
                            reason: reason.to_string(),
                        },
                    )
                    .await;
                    fallback_resp = Some(fb);
                    break;
                }
            }
            fallback_resp.unwrap_or(resp)
        } else {
            resp
        };

        if !resp.status().is_success() {
            let status = resp.status();
            let err_text = resp.text().await.unwrap_or_default();
            tracing::error!(
                "WS: Anthropic API error after fallback (status={}): {}",
                status,
                &truncate_for_context_with_limit(&err_text, 500)
            );
            let safe_error = sanitize_api_error(&err_text);
            ws_send(
                sender,
                &WsServerMessage::Error {
                    message: safe_error,
                    code: Some("ANTHROPIC_ERROR".to_string()),
                },
            )
            .await;
            return;
        }

        // Parse SSE -> Token messages (using shared parser)
        let mut byte_stream = resp.bytes_stream();
        let mut raw_buf: Vec<u8> = Vec::new();
        let mut full_text = String::new();

        while let Some(chunk_result) = byte_stream.next().await {
            if cancel.is_cancelled() {
                ws_send(
                    sender,
                    &WsServerMessage::Error {
                        message: "Cancelled by user".to_string(),
                        code: Some("CANCELLED".to_string()),
                    },
                )
                .await;
                return;
            }
            let chunk = match chunk_result {
                Ok(bytes) => bytes,
                Err(_) => break,
            };
            raw_buf.extend_from_slice(&chunk);

            let events = parse_sse_lines(&mut raw_buf);
            for event in events {
                let event_type = event.get("type").and_then(|t| t.as_str()).unwrap_or("");
                if event_type == "content_block_delta" {
                    let text = event
                        .get("delta")
                        .and_then(|d| d.get("text"))
                        .and_then(|t| t.as_str())
                        .unwrap_or("");
                    if !text.is_empty() {
                        full_text.push_str(text);
                        ws_send(
                            sender,
                            &WsServerMessage::Token {
                                content: text.to_string(),
                            },
                        )
                        .await;
                    }
                }
            }
        }

        // Store message to DB if session present
        if let Some(ref sid) = ctx.session_id {
            let _ = store_ws_messages(state, sid, &prompt, &full_text).await;
        }

        ws_send(
            sender,
            &WsServerMessage::Complete {
                duration_ms: execution_start.elapsed().as_millis() as u64,
            },
        )
        .await;
        return;
    }

    // ── Tools-enabled path: agentic tool_use loop ───────────────────────
    // Uses shared AnthropicSseParser for SSE parsing

    let tool_defs: Vec<Value> = state
        .tool_executor
        .tool_definitions_with_mcp(state, Some(&model))
        .await
        .into_iter()
        .map(|td| {
            json!({
                "name": td.name,
                "description": td.description,
                "input_schema": td.input_schema,
            })
        })
        .collect();

    let mut conversation: Vec<Value> = initial_messages;
    let mut iteration: u32 = 0;
    let mut has_written_file = false;
    let mut agent_text_len: usize = 0;
    let mut full_text = String::new();
    let execution_timeout = std::time::Duration::from_secs(300);

    loop {
        iteration += 1;

        if cancel.is_cancelled() {
            ws_send(
                sender,
                &WsServerMessage::Error {
                    message: "Cancelled by user".to_string(),
                    code: Some("CANCELLED".to_string()),
                },
            )
            .await;
            break;
        }

        if execution_start.elapsed() >= execution_timeout {
            tracing::warn!(
                "WS: Global execution timeout (300s) at iteration {}",
                iteration
            );
            ws_send(
                sender,
                &WsServerMessage::Error {
                    message: "Execution timeout — 5 minutes reached".to_string(),
                    code: Some("TIMEOUT".to_string()),
                },
            )
            .await;
            break;
        }

        if iteration > max_tool_iterations as u32 {
            ws_send(
                sender,
                &WsServerMessage::Error {
                    message: "Max tool iterations reached".to_string(),
                    code: Some("MAX_ITERATIONS".to_string()),
                },
            )
            .await;
            break;
        }

        // Send Iteration
        ws_send(
            sender,
            &WsServerMessage::Iteration {
                number: iteration,
                max: max_tool_iterations as u32,
            },
        )
        .await;

        let mut body = json!({
            "model": &model,
            "max_tokens": max_tokens,
            "system": &system_prompt,
            "messages": &conversation,
            "tools": &tool_defs,
            "stream": true,
            "temperature": effective_temperature,
        });
        sanitize_json_strings(&mut body);

        let resp = match send_to_anthropic(state, &body, 300).await {
            Ok(r) => r,
            Err((_, Json(err_val))) => {
                let raw_msg = err_val
                    .get("error")
                    .and_then(|e| e.as_str())
                    .unwrap_or("Unknown error");
                tracing::error!(
                    "WS: send_to_anthropic failed (tool loop, iter={}): {}",
                    iteration,
                    raw_msg
                );
                ws_send(
                    sender,
                    &WsServerMessage::Error {
                        message: "AI provider request failed".to_string(),
                        code: Some("API_ERROR".to_string()),
                    },
                )
                .await;
                break;
            }
        };

        if !resp.status().is_success() {
            let status = resp.status();
            let err_text = resp.text().await.unwrap_or_default();
            tracing::error!(
                "WS: Anthropic API error (status={}, iter={}): {}",
                status,
                iteration,
                &truncate_for_context_with_limit(&err_text, 500)
            );
            let safe_error = sanitize_api_error(&err_text);
            ws_send(
                sender,
                &WsServerMessage::Error {
                    message: safe_error,
                    code: Some("ANTHROPIC_ERROR".to_string()),
                },
            )
            .await;
            break;
        }

        // Parse Anthropic SSE stream using shared parser
        let mut parser = AnthropicSseParser::new();
        let mut text_content = String::new();
        let mut tool_uses: Vec<Value> = Vec::new();
        let mut stop_reason = String::new();
        let mut _total_tokens: u32 = 0;

        let mut byte_stream = resp.bytes_stream();
        let mut raw_buf: Vec<u8> = Vec::new();

        while let Some(chunk_result) = byte_stream.next().await {
            if cancel.is_cancelled() {
                break;
            }

            let chunk = match chunk_result {
                Ok(bytes) => bytes,
                Err(_) => break,
            };
            raw_buf.extend_from_slice(&chunk);

            let sse_events = parse_sse_lines(&mut raw_buf);
            for sse_json in sse_events {
                let parsed = parser.parse_event(&sse_json);
                for ev in parsed {
                    match ev {
                        AnthropicSseEvent::TextToken(text) => {
                            text_content.push_str(&text);
                            full_text.push_str(&text);
                            agent_text_len += text.len();
                            ws_send(
                                sender,
                                &WsServerMessage::Token {
                                    content: text,
                                },
                            )
                            .await;
                        }
                        AnthropicSseEvent::ToolUse { id, name, input } => {
                            ws_send(
                                sender,
                                &WsServerMessage::ToolCall {
                                    name: name.clone(),
                                    args: input.clone(),
                                    iteration,
                                },
                            )
                            .await;
                            tool_uses.push(json!({
                                "type": "tool_use",
                                "id": &id,
                                "name": &name,
                                "input": input,
                            }));
                        }
                        AnthropicSseEvent::StopReason(sr) => {
                            stop_reason = sr;
                        }
                        AnthropicSseEvent::TokenUsage(tokens) => {
                            _total_tokens = tokens;
                        }
                        AnthropicSseEvent::MessageStop => {}
                    }
                }
            }
        }

        if cancel.is_cancelled() {
            ws_send(
                sender,
                &WsServerMessage::Error {
                    message: "Cancelled by user".to_string(),
                    code: Some("CANCELLED".to_string()),
                },
            )
            .await;
            break;
        }

        // Tool execution
        if stop_reason == "tool_use" && !tool_uses.is_empty() {
            let mut assistant_blocks: Vec<Value> = Vec::new();
            if !text_content.is_empty() {
                assistant_blocks.push(json!({ "type": "text", "text": &text_content }));
            }
            assistant_blocks.extend(tool_uses.clone());
            conversation.push(json!({ "role": "assistant", "content": assistant_blocks }));

            let tools_total = tool_uses.len() as u32;
            let mut tool_results: Vec<Value> = Vec::new();
            let mut tools_completed: u32 = 0;

            // Execute tools in parallel via tokio::spawn
            let mut handles = Vec::new();
            let mut pending_tool_ids: Vec<String> = Vec::new();
            for tu in &tool_uses {
                let tool_name = tu
                    .get("name")
                    .and_then(|n| n.as_str())
                    .unwrap_or("")
                    .to_string();
                let tool_id = tu
                    .get("id")
                    .and_then(|i| i.as_str())
                    .unwrap_or("")
                    .to_string();
                pending_tool_ids.push(tool_id.clone());
                let tool_input = tu.get("input").unwrap_or(&json!({})).clone();
                let executor = state.tool_executor.with_working_directory(&wd);
                let state_ref = state.clone();
                let wd_ref = wd.clone();

                let semaphore = state.a2a_semaphore.clone();
                let handle = tokio::spawn(async move {
                    let (result, is_error) = if tool_name == "call_agent" {
                        // Acquire A2A concurrency permit
                        match semaphore.acquire_owned().await {
                            Err(_) => (
                                "A2A delegation limit reached — semaphore closed".to_string(),
                                true,
                            ),
                            Ok(_permit) => {
                                match tokio::time::timeout(
                                    std::time::Duration::from_secs(120),
                                    execute_agent_call(&state_ref, &tool_input, &wd_ref, 0),
                                )
                                .await
                                {
                                    Ok(res) => res,
                                    Err(_) => (
                                        "Agent delegation timed out after 120s".to_string(),
                                        true,
                                    ),
                                }
                            }
                        }
                    } else {
                        let timeout = std::time::Duration::from_secs(TOOL_TIMEOUT_SECS);
                        match tokio::time::timeout(
                            timeout,
                            executor.execute_with_state(&tool_name, &tool_input, &state_ref),
                        )
                        .await
                        {
                            Ok(res) => res,
                            Err(_) => (
                                format!(
                                    "Tool '{}' timed out after {}s",
                                    tool_name, TOOL_TIMEOUT_SECS
                                ),
                                true,
                            ),
                        }
                    };
                    (tool_name, tool_id, result, is_error)
                });
                handles.push(handle);
            }

            // Collect results with heartbeat during long tool execution
            for (handle_idx, mut handle) in handles.into_iter().enumerate() {
                let heartbeat_dur = std::time::Duration::from_secs(15);
                let result = loop {
                    tokio::select! {
                        result = &mut handle => break result,
                        _ = tokio::time::sleep(heartbeat_dur) => {
                            ws_send(sender, &WsServerMessage::Heartbeat).await;
                        }
                    }
                };

                match result {
                    Ok((tool_name, tool_id, result, is_error)) => {
                        tools_completed += 1;
                        if !is_error && (tool_name == "write_file" || tool_name == "edit_file") {
                            has_written_file = true;
                        }

                        let summary: String = result.chars().take(200).collect();
                        ws_send(
                            sender,
                            &WsServerMessage::ToolResult {
                                name: tool_name.clone(),
                                success: !is_error,
                                summary,
                                iteration,
                            },
                        )
                        .await;

                        ws_send(
                            sender,
                            &WsServerMessage::ToolProgress {
                                iteration,
                                tools_completed,
                                tools_total,
                            },
                        )
                        .await;

                        let truncated =
                            truncate_tool_output(&result, tool_result_context_limit(iteration));
                        tool_results.push(json!({
                            "type": "tool_result",
                            "tool_use_id": &tool_id,
                            "content": &truncated,
                            "is_error": is_error,
                        }));
                    }
                    Err(e) => {
                        tracing::error!("Tool task panicked: {}", e);
                        tools_completed += 1;
                        tool_results.push(json!({
                            "type": "tool_result",
                            "tool_use_id": &pending_tool_ids[handle_idx],
                            "content": "Tool execution panicked — internal error",
                            "is_error": true,
                        }));
                    }
                }
            }

            conversation.push(json!({ "role": "user", "content": tool_results }));

            // Sliding window: trim conversation
            trim_conversation(&mut conversation);

            // Iteration nudges
            if let Some(nudge) = build_iteration_nudge(
                iteration,
                max_tool_iterations as u32,
                &conversation,
            ) {
                conversation.push(json!({ "role": "user", "content": nudge }));
            }

            text_content.clear();
            continue;
        }

        // Auto-fix phase
        if !has_written_file && !full_text.is_empty() && agent_text_len > 50 {
            let fix_keywords = [
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
            ];
            let lower = full_text.to_lowercase();
            let needs_fix = fix_keywords.iter().any(|kw| lower.contains(kw));

            if needs_fix {
                tracing::info!(
                    "WS: Auto-fix phase — agent described changes but never wrote files"
                );
                let edit_tools: Vec<&Value> = tool_defs
                    .iter()
                    .filter(|td| {
                        let name = td.get("name").and_then(|n| n.as_str()).unwrap_or("");
                        name == "edit_file" || name == "write_file"
                    })
                    .collect();

                if !edit_tools.is_empty() {
                    conversation.push(json!({
                        "role": "user",
                        "content": "[SYSTEM: You described changes but never applied them. Use edit_file or write_file NOW to apply the changes you described. Do not explain — just make the edits.]"
                    }));

                    let fix_body = json!({
                        "model": &model,
                        "max_tokens": max_tokens,
                        "system": &system_prompt,
                        "messages": &conversation,
                        "tools": &edit_tools,
                        "stream": false,
                    });

                    if let Ok(fix_resp) = send_to_anthropic(state, &fix_body, 60).await
                        && fix_resp.status().is_success()
                        && let Ok(fix_json) = fix_resp.json::<Value>().await
                        && let Some(content) = fix_json.get("content").and_then(|c| c.as_array())
                    {
                        for block in content {
                            let block_type =
                                block.get("type").and_then(|t| t.as_str()).unwrap_or("");
                            if block_type == "tool_use" {
                                let fix_tool_name =
                                    block.get("name").and_then(|n| n.as_str()).unwrap_or("");
                                let empty_input = json!({});
                                let fix_tool_input = block.get("input").unwrap_or(&empty_input);
                                let executor = state.tool_executor.with_working_directory(&wd);
                                let timeout = std::time::Duration::from_secs(TOOL_TIMEOUT_SECS);
                                let (result, is_error) = match tokio::time::timeout(
                                    timeout,
                                    executor.execute_with_state(fix_tool_name, fix_tool_input, state),
                                )
                                .await
                                {
                                    Ok(res) => res,
                                    Err(_) => {
                                        (format!("Tool '{}' timed out", fix_tool_name), true)
                                    }
                                };

                                ws_send(
                                    sender,
                                    &WsServerMessage::ToolCall {
                                        name: fix_tool_name.to_string(),
                                        args: fix_tool_input.clone(),
                                        iteration,
                                    },
                                )
                                .await;
                                let summary: String = result.chars().take(200).collect();
                                ws_send(
                                    sender,
                                    &WsServerMessage::ToolResult {
                                        name: fix_tool_name.to_string(),
                                        success: !is_error,
                                        summary,
                                        iteration,
                                    },
                                )
                                .await;
                            } else if block_type == "text"
                                && let Some(text) = block.get("text").and_then(|t| t.as_str())
                                && !text.is_empty()
                            {
                                ws_send(
                                    sender,
                                    &WsServerMessage::Token {
                                        content: text.to_string(),
                                    },
                                )
                                .await;
                            }
                        }
                    }
                }
            }
        }

        // Store messages if session present
        if let Some(ref sid) = ctx.session_id {
            let _ = store_ws_messages(state, sid, &prompt, &full_text).await;
        }

        // Complete
        ws_send(
            sender,
            &WsServerMessage::Complete {
                duration_ms: execution_start.elapsed().as_millis() as u64,
            },
        )
        .await;
        break;
    }
}
