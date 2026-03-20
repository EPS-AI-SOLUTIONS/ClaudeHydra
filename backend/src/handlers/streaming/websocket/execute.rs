//! Core WebSocket streaming execution with rich protocol.
//!
//! This remains CH-specific because:
//! - CH uses its own WsClientMessage/WsServerMessage types (different from jaskier-core)
//! - CH WS handler supports `tools_enabled` toggle (vs OpenAI/Gemini always-tools)
//! - CH WS has unique auto-fix phase and forced synthesis
//! - CancellationToken integration is CH-specific
//!
//! The Anthropic SSE parsing within WS uses the shared `AnthropicSseParser`.

use axum::Json;
use axum::extract::ws::{Message as WsMessage, WebSocket};
use futures_util::stream::SplitSink;
use serde_json::{Value, json};
use tokio_stream::StreamExt;
use tokio_util::sync::CancellationToken;

use jaskier_core::handlers::anthropic_streaming::{
    AnthropicSseEvent, AnthropicSseParser, build_iteration_nudge,
    dynamic_max_iterations, parse_sse_lines, sanitize_api_error,
    tool_result_context_limit, trim_conversation,
    truncate_for_context_with_limit as truncate_tool_output,
};

use crate::models::*;
use crate::state::AppState;

use crate::handlers::streaming::{
    TOOL_TIMEOUT_SECS, is_retryable_status, sanitize_json_strings,
    send_to_anthropic, truncate_for_context_with_limit,
};
use crate::handlers::streaming::agent_call::execute_agent_call;
use crate::handlers::streaming::helpers::{detect_view_hints, load_session_history, store_ws_messages};
use crate::handlers::prompt::resolve_chat_context;

use super::ws_send;

/// Core WebSocket streaming execution with rich protocol.
pub(crate) async fn execute_streaming_ws(
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
        execute_no_tools(
            sender, state, &model, max_tokens, effective_temperature,
            &system_prompt, &initial_messages, &prompt, &ctx.session_id,
            execution_start, &cancel,
        ).await;
        return;
    }

    // ── Tools-enabled path: agentic tool_use loop ───────────────────────
    execute_with_tools(
        sender, state, &model, max_tokens, effective_temperature,
        &system_prompt, initial_messages, &prompt, &ctx.session_id,
        &wd, max_tool_iterations, execution_start, &cancel,
    ).await;
}

/// Non-tools path: simple streaming without tool loop.
async fn execute_no_tools(
    sender: &mut SplitSink<WebSocket, WsMessage>,
    state: &AppState,
    model: &str,
    max_tokens: u32,
    effective_temperature: f64,
    system_prompt: &str,
    initial_messages: &[Value],
    prompt: &str,
    session_id: &Option<uuid::Uuid>,
    execution_start: std::time::Instant,
    cancel: &CancellationToken,
) {
    let mut body = json!({
        "model": model,
        "max_tokens": max_tokens,
        "system": system_prompt,
        "messages": initial_messages,
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
                        from: model.to_string(),
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
    if let Some(sid) = session_id {
        let _ = store_ws_messages(state, sid, prompt, &full_text).await;
    }

    ws_send(
        sender,
        &WsServerMessage::Complete {
            duration_ms: execution_start.elapsed().as_millis() as u64,
        },
    )
    .await;
}

/// Tools-enabled path: agentic tool_use loop.
/// Uses shared AnthropicSseParser for SSE parsing.
async fn execute_with_tools(
    sender: &mut SplitSink<WebSocket, WsMessage>,
    state: &AppState,
    model: &str,
    max_tokens: u32,
    effective_temperature: f64,
    system_prompt: &str,
    initial_messages: Vec<Value>,
    prompt: &str,
    session_id: &Option<uuid::Uuid>,
    wd: &str,
    max_tool_iterations: usize,
    execution_start: std::time::Instant,
    cancel: &CancellationToken,
) {
    let tool_defs: Vec<Value> = state
        .tool_executor
        .tool_definitions_with_mcp(state, Some(model))
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
            "model": model,
            "max_tokens": max_tokens,
            "system": system_prompt,
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
                let executor = state.tool_executor.with_working_directory(wd);
                let state_ref = state.clone();
                let wd_ref = wd.to_string();

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
            execute_auto_fix(sender, state, model, max_tokens, system_prompt, &conversation, &tool_defs, wd, iteration).await;
        }

        // Store messages if session present
        if let Some(sid) = session_id {
            let _ = store_ws_messages(state, sid, prompt, &full_text).await;
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

/// Auto-fix phase — detects when agent described changes but never wrote files.
async fn execute_auto_fix(
    sender: &mut SplitSink<WebSocket, WsMessage>,
    state: &AppState,
    model: &str,
    max_tokens: u32,
    system_prompt: &str,
    conversation: &[Value],
    tool_defs: &[Value],
    wd: &str,
    iteration: u32,
) {
    // Check if the full text mentions fix/edit keywords
    let full_text: String = conversation.iter()
        .filter_map(|m| {
            if m.get("role").and_then(|r| r.as_str()) == Some("assistant") {
                m.get("content").and_then(|c| c.as_str()).map(String::from)
            } else {
                None
            }
        })
        .collect();

    let fix_keywords = [
        "fix", "napraw", "zmian", "popraw", "zastosow",
        "write_file", "edit_file", "zmieni", "edytu", "zapisa",
    ];
    let lower = full_text.to_lowercase();
    let needs_fix = fix_keywords.iter().any(|kw| lower.contains(kw));

    if !needs_fix {
        return;
    }

    tracing::info!("WS: Auto-fix phase — agent described changes but never wrote files");
    let edit_tools: Vec<&Value> = tool_defs
        .iter()
        .filter(|td| {
            let name = td.get("name").and_then(|n| n.as_str()).unwrap_or("");
            name == "edit_file" || name == "write_file"
        })
        .collect();

    if edit_tools.is_empty() {
        return;
    }

    let mut fix_conversation = conversation.to_vec();
    fix_conversation.push(json!({
        "role": "user",
        "content": "[SYSTEM: You described changes but never applied them. Use edit_file or write_file NOW to apply the changes you described. Do not explain — just make the edits.]"
    }));

    let fix_body = json!({
        "model": model,
        "max_tokens": max_tokens,
        "system": system_prompt,
        "messages": &fix_conversation,
        "tools": &edit_tools,
        "stream": false,
    });

    if let Ok(fix_resp) = send_to_anthropic(state, &fix_body, 60).await
        && fix_resp.status().is_success()
        && let Ok(fix_json) = fix_resp.json::<Value>().await
        && let Some(content) = fix_json.get("content").and_then(|c| c.as_array())
    {
        for block in content {
            let block_type = block.get("type").and_then(|t| t.as_str()).unwrap_or("");
            if block_type == "tool_use" {
                let fix_tool_name = block.get("name").and_then(|n| n.as_str()).unwrap_or("");
                let empty_input = json!({});
                let fix_tool_input = block.get("input").unwrap_or(&empty_input);
                let executor = state.tool_executor.with_working_directory(wd);
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
