//! Streaming chat endpoints — NDJSON output from Anthropic SSE and Gemini SSE,
//! plus WebSocket streaming transport.
//!
//! - `claude_chat_stream` — streaming NDJSON with fallback chain (no-tools path)
//! - `claude_chat_stream_with_tools` — agentic tool_use loop with auto-fix
//! - `google_chat_stream` — Gemini hybrid routing for streaming
//! - `ws_chat` — WebSocket streaming with rich protocol (Start/Token/Iteration/ToolCall/ToolResult/Complete)

use std::collections::HashMap;

use axum::body::Body;
use axum::extract::ws::{Message as WsMessage, WebSocket, WebSocketUpgrade};
use axum::extract::State;
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use axum::Json;
use futures_util::{SinkExt, stream::SplitSink};
use serde_json::{json, Value};
use tokio_stream::StreamExt;
use tokio_util::sync::CancellationToken;

use crate::auth::validate_ws_token;
use crate::models::*;
use crate::state::AppState;

use super::prompt::{resolve_chat_context, ChatContext};
use super::{
    is_retryable_status, sanitize_json_strings, send_to_anthropic,
    truncate_for_context_with_limit, TOOL_TIMEOUT_SECS,
};

// ═══════════════════════════════════════════════════════════════════════
//  Gemini hybrid streaming
// ═══════════════════════════════════════════════════════════════════════

async fn google_chat_stream(
    state: AppState,
    req: ChatRequest,
    ctx: ChatContext,
) -> Result<Response, (StatusCode, Json<Value>)> {
    let credential = crate::oauth_google::get_google_credential(&state).await;
    let (api_key, is_oauth) = match credential {
        Some(c) => c,
        None => return Err((
            StatusCode::UNAUTHORIZED,
            Json(json!({ "error": "No Google API credential configured" })),
        )),
    };

    let model = &ctx.model;
    let url = format!(
        "https://generativelanguage.googleapis.com/v1beta/models/{}:streamGenerateContent?alt=sse",
        model
    );

    let contents: Vec<Value> = req.messages.iter().map(|m| {
        let role = if m.role == "assistant" { "model" } else { "user" };
        json!({ "role": role, "parts": [{ "text": m.content }] })
    }).collect();

    let body = json!({
        "systemInstruction": { "parts": [{ "text": ctx.system_prompt }] },
        "contents": contents,
        "generationConfig": {
            "temperature": req.temperature.unwrap_or(1.0),
            "maxOutputTokens": ctx.max_tokens,
        }
    });

    let request = crate::oauth_google::apply_google_auth(
        state.http_client.post(&url), &api_key, is_oauth,
    )
    .json(&body)
    .timeout(std::time::Duration::from_secs(300));

    let resp = request.send().await.map_err(|e| (
        StatusCode::BAD_GATEWAY,
        Json(json!({ "error": format!("Google API request failed: {}", e) })),
    ))?;

    if !resp.status().is_success() {
        let status = resp.status();
        let err = resp.text().await.unwrap_or_default();
        return Err((
            StatusCode::from_u16(status.as_u16()).unwrap_or(StatusCode::BAD_GATEWAY),
            Json(json!({ "error": err })),
        ));
    }

    let model_for_done = ctx.model.clone();
    let byte_stream = resp.bytes_stream();

    let ndjson_stream = async_stream::stream! {
        let mut sse_buffer = String::new();
        let mut total_tokens: u32 = 0;
        let mut stream = byte_stream;

        while let Some(chunk_result) = futures_util::StreamExt::next(&mut stream).await {
            let chunk = match chunk_result {
                Ok(b) => b,
                Err(e) => {
                    let err_line = serde_json::to_string(&json!({ "token": format!("[Error: {}]", e), "done": true, "model": &model_for_done })).unwrap_or_default();
                    yield Ok::<_, std::io::Error>(axum::body::Bytes::from(format!("{}\n", err_line)));
                    break;
                }
            };
            sse_buffer.push_str(&String::from_utf8_lossy(&chunk));

            while let Some(nl) = sse_buffer.find('\n') {
                let line = sse_buffer[..nl].trim().to_string();
                sse_buffer = sse_buffer[nl + 1..].to_string();
                if line.is_empty() || line.starts_with(':') { continue; }
                if let Some(data) = line.strip_prefix("data: ") {
                    if let Ok(event) = serde_json::from_str::<Value>(data) {
                        if let Some(text) = event.pointer("/candidates/0/content/parts/0/text").and_then(|t| t.as_str()) {
                            if !text.is_empty() {
                                let ndjson_line = serde_json::to_string(&json!({ "token": text, "done": false })).unwrap_or_default();
                                yield Ok::<_, std::io::Error>(axum::body::Bytes::from(format!("{}\n", ndjson_line)));
                            }
                        }
                        if let Some(usage) = event.get("usageMetadata") {
                            total_tokens = usage.get("totalTokenCount").and_then(|v| v.as_u64()).unwrap_or(0) as u32;
                        }
                    }
                }
            }
        }
        let done_line = serde_json::to_string(&json!({ "token": "", "done": true, "model": &model_for_done, "total_tokens": total_tokens })).unwrap_or_default();
        yield Ok::<_, std::io::Error>(axum::body::Bytes::from(format!("{}\n", done_line)));
    };

    Ok(Response::builder()
        .status(StatusCode::OK)
        .header("content-type", "application/x-ndjson")
        .header("cache-control", "no-cache")
        .header("x-content-type-options", "nosniff")
        .body(Body::from_stream(ndjson_stream))
        .expect("Response builder with valid status and headers"))
}

// ═══════════════════════════════════════════════════════════════════════
//  Session history helpers
// ═══════════════════════════════════════════════════════════════════════

async fn load_session_history(db: &sqlx::PgPool, sid: &uuid::Uuid) -> Vec<Value> {
    let mut messages: Vec<Value> = sqlx::query_as::<_, (String, String)>(
        "SELECT role, content FROM ch_messages WHERE session_id = $1 ORDER BY created_at DESC LIMIT 20",
    )
    .bind(sid)
    .fetch_all(db)
    .await
    .unwrap_or_default()
    .into_iter()
    .rev()
    .map(|(r, c)| json!({ "role": r, "content": c }))
    .collect();

    // Compress old messages: truncate everything except the last 6
    for i in 0..messages.len() {
        if i < messages.len().saturating_sub(6) {
            if let Some(content) = messages[i].get_mut("content") {
                if let Some(s) = content.as_str().map(|s| s.to_string()) {
                    if s.len() > 500 {
                        let boundary = s
                            .char_indices()
                            .take_while(|(idx, _)| *idx < 500)
                            .last()
                            .map(|(idx, c)| idx + c.len_utf8())
                            .unwrap_or(500.min(s.len()));
                        *content = json!(format!(
                            "{}... [message truncated for context efficiency]",
                            &s[..boundary]
                        ));
                    }
                }
            }
        }
    }

    messages
}

fn filter_client_system_prompt(messages: &[ChatMessage]) -> Vec<Value> {
    let mut result = Vec::new();
    let mut skip_count = 0;

    if messages.len() >= 2
        && messages[0].role == "user"
        && messages[0].content.contains("Witcher-themed AI agent")
        && messages[1].role == "assistant"
        && messages[1].content.contains("Understood")
    {
        skip_count = 2;
    }

    for msg in messages.iter().skip(skip_count) {
        result.push(json!({ "role": msg.role, "content": msg.content }));
    }
    result
}

// ═══════════════════════════════════════════════════════════════════════
//  Claude Streaming (SSE from Anthropic → NDJSON to frontend)
// ═══════════════════════════════════════════════════════════════════════

/// POST /api/claude/chat/stream
#[utoipa::path(post, path = "/api/claude/chat/stream", tag = "chat",
    request_body = ChatRequest,
    responses((status = 200, description = "Streaming NDJSON response")))]
pub async fn claude_chat_stream(
    State(state): State<AppState>,
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

    // Hybrid routing: Gemini models → Google API
    if ctx.model.starts_with("gemini-") {
        return google_chat_stream(state, req, ctx).await;
    }

    let model = ctx.model;
    let max_tokens = ctx.max_tokens;
    let system_prompt = ctx.system_prompt;

    let messages: Vec<Value> = filter_client_system_prompt(&req.messages);

    let mut body = json!({
        "model": model,
        "max_tokens": max_tokens,
        "system": system_prompt,
        "messages": messages,
        "stream": true,
    });

    if let Some(temp) = req.temperature {
        body["temperature"] = json!(temp);
    }

    sanitize_json_strings(&mut body);

    let resp = send_to_anthropic(&state, &body, 300).await?;

    // Fallback chain: if retryable error, try lighter model
    let resp = if !resp.status().is_success() && is_retryable_status(resp.status().as_u16()) {
        let fallback_models = ["claude-sonnet-4-6", "claude-haiku-4-5-20251001"];
        let mut fallback_resp = None;
        for fb_model in &fallback_models {
            if *fb_model == model { continue; }
            tracing::warn!("claude_chat_stream: {} returned {}, falling back to {}", model, resp.status(), fb_model);
            body["model"] = json!(fb_model);
            if let Ok(fb) = send_to_anthropic(&state, &body, 300).await {
                if fb.status().is_success() {
                    fallback_resp = Some(fb);
                    break;
                }
            }
        }
        fallback_resp.unwrap_or(resp)
    } else {
        resp
    };

    if !resp.status().is_success() {
        let status = resp.status();
        let err_body: Value = resp.json().await.unwrap_or_default();
        return Err((
            StatusCode::from_u16(status.as_u16()).unwrap_or(StatusCode::BAD_GATEWAY),
            Json(json!({ "error": err_body })),
        ));
    }

    // Convert Anthropic SSE stream into NDJSON
    let model_for_done = model.clone();
    let model_for_usage = model.clone();
    let db_for_usage = state.db.clone();
    let stream_start = std::time::Instant::now();
    let prompt_len = req.messages.iter().map(|m| m.content.len()).sum::<usize>();
    let byte_stream = resp.bytes_stream();

    let ndjson_stream = async_stream::stream! {
        let mut sse_buffer = String::new();
        let mut total_tokens: u32 = 0;
        let mut output_chars: usize = 0;
        let mut stream = byte_stream;

        while let Some(chunk_result) = futures_util::StreamExt::next(&mut stream).await {
            let chunk = match chunk_result {
                Ok(bytes) => bytes,
                Err(e) => {
                    let err_line = serde_json::to_string(&json!({
                        "token": format!("\n[Stream error: {}]", e),
                        "done": true,
                        "model": &model_for_done,
                        "total_tokens": total_tokens,
                    })).unwrap_or_default();
                    yield Ok::<_, std::io::Error>(axum::body::Bytes::from(format!("{}\n", err_line)));
                    break;
                }
            };

            sse_buffer.push_str(&String::from_utf8_lossy(&chunk));

            while let Some(newline_pos) = sse_buffer.find('\n') {
                let line = sse_buffer[..newline_pos].trim().to_string();
                sse_buffer = sse_buffer[newline_pos + 1..].to_string();

                if line.is_empty() || line.starts_with(':') {
                    continue;
                }

                if let Some(data) = line.strip_prefix("data: ") {
                    if data == "[DONE]" { continue; }

                    if let Ok(event) = serde_json::from_str::<Value>(data) {
                        let event_type = event.get("type").and_then(|t| t.as_str()).unwrap_or("");

                        match event_type {
                            "content_block_delta" => {
                                let text = event.get("delta").and_then(|d| d.get("text")).and_then(|t| t.as_str()).unwrap_or("");
                                if !text.is_empty() {
                                    output_chars += text.len();
                                    let ndjson_line = serde_json::to_string(&json!({
                                        "token": text,
                                        "done": false,
                                    })).unwrap_or_default();
                                    yield Ok::<_, std::io::Error>(axum::body::Bytes::from(format!("{}\n", ndjson_line)));
                                }
                            }
                            "message_delta" => {
                                if let Some(usage) = event.get("usage") {
                                    total_tokens = usage.get("output_tokens").and_then(|v| v.as_u64()).unwrap_or(0) as u32;
                                }
                            }
                            "message_stop" => {
                                let done_line = serde_json::to_string(&json!({
                                    "token": "",
                                    "done": true,
                                    "model": &model_for_done,
                                    "total_tokens": total_tokens,
                                })).unwrap_or_default();
                                yield Ok::<_, std::io::Error>(axum::body::Bytes::from(format!("{}\n", done_line)));

                                // Token usage tracking — fire-and-forget
                                let latency = stream_start.elapsed().as_millis() as i32;
                                let input_est = (prompt_len / 4) as i32;
                                let output_est = (output_chars / 4) as i32;
                                let db = db_for_usage.clone();
                                let m = model_for_usage.clone();
                                let tier = if m.contains("opus") { "commander" }
                                    else if m.contains("sonnet") { "coordinator" }
                                    else if m.contains("haiku") { "executor" }
                                    else if m.contains("flash") { "flash" }
                                    else { "coordinator" };
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
                                    .execute(&db)
                                    .await;
                                });
                            }
                            _ => {}
                        }
                    }
                }
            }
        }
    };

    Ok(Response::builder()
        .status(StatusCode::OK)
        .header("content-type", "application/x-ndjson")
        .header("cache-control", "no-cache")
        .header("x-content-type-options", "nosniff")
        .body(Body::from_stream(ndjson_stream))
        .expect("Response builder with valid status and headers"))
}

// ═══════════════════════════════════════════════════════════════════════
//  Claude Streaming with Tools (agentic tool_use loop)
// ═══════════════════════════════════════════════════════════════════════

async fn claude_chat_stream_with_tools(
    state: AppState,
    req: ChatRequest,
) -> Result<Response, (StatusCode, Json<Value>)> {
    let ctx = resolve_chat_context(&state, &req).await;
    let model = ctx.model;
    let max_tokens = ctx.max_tokens;
    let effective_temperature = ctx.temperature;
    let wd = ctx.working_directory;
    let system_prompt = ctx.system_prompt;

    // Dynamic iteration cap based on prompt complexity
    let prompt_len = req.messages.last().map(|m| m.content.len()).unwrap_or(0);
    let dynamic_max: usize = if prompt_len < 200 { 15 } else if prompt_len < 1000 { 20 } else { 25 };
    let max_tool_iterations: usize = dynamic_max.min(ctx.max_iterations.max(1) as usize);

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

    // Build tool definitions (includes MCP tools from connected servers)
    let tool_defs: Vec<Value> = state
        .tool_executor
        .tool_definitions_with_mcp(&state)
        .await
        .into_iter()
        .map(|td| json!({
            "name": td.name,
            "description": td.description,
            "input_schema": td.input_schema,
        }))
        .collect();

    let (tx, rx) = tokio::sync::mpsc::channel::<String>(256);
    let state_clone = state.clone();

    tokio::spawn(async move {
        let mut conversation: Vec<Value> = initial_messages;
        let mut iteration: usize = 0;
        let mut has_written_file = false;
        let mut agent_text_len: usize = 0;
        let mut full_text = String::new();
        let execution_start = std::time::Instant::now();
        let execution_timeout = std::time::Duration::from_secs(300);

        loop {
            iteration += 1;

            if execution_start.elapsed() >= execution_timeout {
                tracing::warn!("Global execution timeout (300s) reached at iteration {}", iteration);
                let _ = tx.send(serde_json::to_string(&json!({
                    "token": "\n[Execution timeout — 5 minutes reached]",
                    "done": true, "model": &model, "total_tokens": 0,
                })).unwrap_or_default()).await;
                break;
            }

            if iteration > max_tool_iterations {
                let _ = tx.send(serde_json::to_string(&json!({
                    "token": "\n[Max tool iterations reached]",
                    "done": true, "model": &model, "total_tokens": 0,
                })).unwrap_or_default()).await;
                break;
            }

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

            let resp = match send_to_anthropic(&state_clone, &body, 300).await {
                Ok(r) => r,
                Err((_, Json(err_val))) => {
                    let err_msg = err_val.get("error").and_then(|e| e.as_str()).unwrap_or("Unknown error");
                    let _ = tx.send(serde_json::to_string(&json!({
                        "token": format!("\n[API error: {}]", err_msg),
                        "done": true, "model": &model, "total_tokens": 0,
                    })).unwrap_or_default()).await;
                    break;
                }
            };

            if !resp.status().is_success() {
                let status = resp.status();
                let err_text = resp.text().await.unwrap_or_default();
                tracing::error!("Anthropic API error (status={}, iteration={}): {}", status, iteration, &err_text[..err_text.len().min(500)]);
                let _ = tx.send(serde_json::to_string(&json!({
                    "token": format!("\n[Anthropic error: {}]", err_text),
                    "done": true, "model": &model, "total_tokens": 0,
                })).unwrap_or_default()).await;
                break;
            }

            // Parse SSE stream — collect content blocks
            let mut text_content = String::new();
            let mut tool_uses: Vec<Value> = Vec::new();
            let mut current_tool_id = String::new();
            let mut current_tool_name = String::new();
            let mut current_tool_input_json = String::new();
            let mut in_tool_use = false;
            let mut stop_reason = String::new();
            let mut total_tokens: u32 = 0;

            let mut byte_stream = resp.bytes_stream();
            let mut raw_buf: Vec<u8> = Vec::new();

            while let Some(chunk_result) = byte_stream.next().await {
                let chunk = match chunk_result {
                    Ok(bytes) => bytes,
                    Err(_) => break,
                };

                raw_buf.extend_from_slice(&chunk);

                while let Some(newline_pos) = raw_buf.iter().position(|&b| b == b'\n') {
                    let line_bytes = raw_buf[..newline_pos].to_vec();
                    raw_buf = raw_buf[newline_pos + 1..].to_vec();
                    let line = String::from_utf8_lossy(&line_bytes).trim().to_string();

                    if line.is_empty() || line.starts_with(':') { continue; }

                    let data = match line.strip_prefix("data: ") {
                        Some(d) if d != "[DONE]" => d,
                        _ => continue,
                    };

                    let event: Value = match serde_json::from_str(data) {
                        Ok(v) => v,
                        Err(_) => continue,
                    };

                    let event_type = event.get("type").and_then(|t| t.as_str()).unwrap_or("");

                    match event_type {
                        "content_block_start" => {
                            let cb = event.get("content_block").unwrap_or(&Value::Null);
                            let cb_type = cb.get("type").and_then(|t| t.as_str()).unwrap_or("");
                            if cb_type == "tool_use" {
                                in_tool_use = true;
                                current_tool_id = cb.get("id").and_then(|v| v.as_str()).unwrap_or("").to_string();
                                current_tool_name = cb.get("name").and_then(|v| v.as_str()).unwrap_or("").to_string();
                                current_tool_input_json.clear();
                            }
                        }
                        "content_block_delta" => {
                            let delta = event.get("delta").unwrap_or(&Value::Null);
                            let delta_type = delta.get("type").and_then(|t| t.as_str()).unwrap_or("");
                            if delta_type == "text_delta" {
                                let text = delta.get("text").and_then(|t| t.as_str()).unwrap_or("");
                                if !text.is_empty() {
                                    text_content.push_str(text);
                                    full_text.push_str(text);
                                    agent_text_len += text.len();
                                    let _ = tx.send(serde_json::to_string(&json!({
                                        "token": text, "done": false,
                                    })).unwrap_or_default()).await;
                                }
                            } else if delta_type == "input_json_delta" {
                                let partial = delta.get("partial_json").and_then(|t| t.as_str()).unwrap_or("");
                                current_tool_input_json.push_str(partial);
                            }
                        }
                        "content_block_stop" => {
                            if in_tool_use {
                                let tool_input: Value = serde_json::from_str(&current_tool_input_json).unwrap_or(json!({}));
                                let _ = tx.send(serde_json::to_string(&json!({
                                    "type": "tool_call",
                                    "tool_use_id": &current_tool_id,
                                    "tool_name": &current_tool_name,
                                    "tool_input": &tool_input,
                                })).unwrap_or_default()).await;
                                tool_uses.push(json!({
                                    "type": "tool_use",
                                    "id": &current_tool_id,
                                    "name": &current_tool_name,
                                    "input": tool_input,
                                }));
                                in_tool_use = false;
                            }
                        }
                        "message_delta" => {
                            if let Some(sr) = event.get("delta").and_then(|d| d.get("stop_reason")).and_then(|s| s.as_str()) {
                                stop_reason = sr.to_string();
                            }
                            if let Some(usage) = event.get("usage") {
                                total_tokens = usage.get("output_tokens").and_then(|v| v.as_u64()).unwrap_or(0) as u32;
                            }
                        }
                        _ => {}
                    }
                }
            }

            // After stream completes — check stop_reason
            if stop_reason == "tool_use" && !tool_uses.is_empty() {
                let mut assistant_blocks: Vec<Value> = Vec::new();
                if !text_content.is_empty() {
                    assistant_blocks.push(json!({ "type": "text", "text": &text_content }));
                }
                assistant_blocks.extend(tool_uses.clone());
                conversation.push(json!({ "role": "assistant", "content": assistant_blocks }));

                // Execute each tool
                let mut tool_results: Vec<Value> = Vec::new();
                for tu in &tool_uses {
                    let tool_name = tu.get("name").and_then(|n| n.as_str()).unwrap_or("");
                    let tool_id = tu.get("id").and_then(|i| i.as_str()).unwrap_or("");
                    let empty_input = json!({});
                    let tool_input = tu.get("input").unwrap_or(&empty_input);

                    let (result, is_error) = if tool_name == "call_agent" {
                        // Agent-to-agent delegation — longer timeout (120s)
                        match tokio::time::timeout(
                            std::time::Duration::from_secs(120),
                            execute_agent_call(&state_clone, tool_input, &wd, 0),
                        ).await {
                            Ok(res) => res,
                            Err(_) => ("Agent delegation timed out after 120s".to_string(), true),
                        }
                    } else {
                        let timeout = std::time::Duration::from_secs(TOOL_TIMEOUT_SECS);
                        let executor = state_clone.tool_executor.with_working_directory(&wd);
                        match tokio::time::timeout(
                            timeout,
                            executor.execute_with_state(tool_name, tool_input, &state_clone),
                        ).await {
                            Ok(res) => res,
                            Err(_) => {
                                tracing::warn!("Tool '{}' timed out after {}s", tool_name, TOOL_TIMEOUT_SECS);
                                (format!("Tool '{}' timed out after {}s", tool_name, TOOL_TIMEOUT_SECS), true)
                            }
                        }
                    };

                    if !is_error && (tool_name == "write_file" || tool_name == "edit_file") {
                        has_written_file = true;
                    }

                    let context_limit = if iteration < 3 { 25000 } else if iteration < 6 { 15000 } else { 8000 };
                    let truncated_result = truncate_for_context_with_limit(&result, context_limit);

                    let _ = tx.send(serde_json::to_string(&json!({
                        "type": "tool_result",
                        "tool_use_id": tool_id,
                        "result": &result,
                        "is_error": is_error,
                    })).unwrap_or_default()).await;

                    tool_results.push(json!({
                        "type": "tool_result",
                        "tool_use_id": tool_id,
                        "content": &truncated_result,
                        "is_error": is_error,
                    }));
                }

                conversation.push(json!({ "role": "user", "content": tool_results }));

                // Iteration nudges
                if iteration >= 3 {
                    let approx_context_bytes: usize = conversation.iter()
                        .map(|c| serde_json::to_string(c).map(|s| s.len()).unwrap_or(0))
                        .sum();
                    let context_hint = format!(
                        "[CONTEXT: ~{}KB, {} msgs, iter {}/{}]",
                        approx_context_bytes / 1024, conversation.len(), iteration, max_tool_iterations
                    );
                    let nudge = if iteration >= 12 {
                        format!("[SYSTEM: Approaching limit. {} Wrap up and apply any pending changes.]", context_hint)
                    } else if iteration >= 8 {
                        format!("[SYSTEM: {} Consider applying edits now.]", context_hint)
                    } else {
                        format!("[SYSTEM: {} {} iterations remaining.]", context_hint, max_tool_iterations - iteration)
                    };
                    conversation.push(json!({ "role": "user", "content": nudge }));
                }

                text_content.clear();
                continue;
            }

            // Auto-fix phase
            if !has_written_file && !full_text.is_empty() && agent_text_len > 50 {
                let fix_keywords = ["fix", "napraw", "zmian", "popraw", "zastosow",
                                    "write_file", "edit_file", "zmieni", "edytu", "zapisa"];
                let lower = full_text.to_lowercase();
                let needs_fix = fix_keywords.iter().any(|kw| lower.contains(kw));

                if needs_fix {
                    tracing::info!("Auto-fix phase — agent described changes but never wrote files");
                    let edit_tools: Vec<&Value> = tool_defs.iter().filter(|td| {
                        let name = td.get("name").and_then(|n| n.as_str()).unwrap_or("");
                        name == "edit_file" || name == "write_file"
                    }).collect();

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

                        if let Ok(fix_resp) = send_to_anthropic(&state_clone, &fix_body, 60).await {
                            if fix_resp.status().is_success() {
                                if let Ok(fix_json) = fix_resp.json::<Value>().await {
                                    if let Some(content) = fix_json.get("content").and_then(|c| c.as_array()) {
                                        for block in content {
                                            let block_type = block.get("type").and_then(|t| t.as_str()).unwrap_or("");
                                            if block_type == "tool_use" {
                                                let fix_tool_name = block.get("name").and_then(|n| n.as_str()).unwrap_or("");
                                                let empty_input = json!({});
                                                let fix_tool_input = block.get("input").unwrap_or(&empty_input);
                                                let fix_tool_id = block.get("id").and_then(|i| i.as_str()).unwrap_or("");

                                                let executor = state_clone.tool_executor.with_working_directory(&wd);
                                                let timeout = std::time::Duration::from_secs(TOOL_TIMEOUT_SECS);
                                                let (result, is_error) = match tokio::time::timeout(
                                                    timeout,
                                                    executor.execute_with_state(fix_tool_name, fix_tool_input, &state_clone),
                                                ).await {
                                                    Ok(res) => res,
                                                    Err(_) => (format!("Tool '{}' timed out", fix_tool_name), true),
                                                };

                                                let _ = tx.send(serde_json::to_string(&json!({
                                                    "type": "tool_call",
                                                    "tool_use_id": fix_tool_id,
                                                    "tool_name": fix_tool_name,
                                                    "tool_input": fix_tool_input,
                                                })).unwrap_or_default()).await;
                                                let _ = tx.send(serde_json::to_string(&json!({
                                                    "type": "tool_result",
                                                    "tool_use_id": fix_tool_id,
                                                    "result": &result,
                                                    "is_error": is_error,
                                                })).unwrap_or_default()).await;

                                                let _ = is_error;
                                            } else if block_type == "text" {
                                                if let Some(text) = block.get("text").and_then(|t| t.as_str()) {
                                                    if !text.is_empty() {
                                                        let _ = tx.send(serde_json::to_string(&json!({
                                                            "token": text, "done": false,
                                                        })).unwrap_or_default()).await;
                                                    }
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }

            // Forced synthesis — if agent produced very little text
            if agent_text_len < 100 && !full_text.is_empty() {
                tracing::info!("Forced synthesis — agent produced {}B text, requesting summary", agent_text_len);
                conversation.push(json!({ "role": "assistant", "content": &full_text }));
                conversation.push(json!({
                    "role": "user",
                    "content": "[SYSTEM: Summarize what you did. Be concise but list all changes made.]"
                }));

                let synth_body = json!({
                    "model": &model,
                    "max_tokens": 1024_u32,
                    "system": &system_prompt,
                    "messages": &conversation,
                    "stream": true,
                });

                if let Ok(synth_resp) = send_to_anthropic(&state_clone, &synth_body, 30).await {
                    if synth_resp.status().is_success() {
                        let mut synth_stream = synth_resp.bytes_stream();
                        let mut synth_buf: Vec<u8> = Vec::new();
                        while let Some(Ok(chunk)) = synth_stream.next().await {
                            synth_buf.extend_from_slice(&chunk);
                            while let Some(nl) = synth_buf.iter().position(|&b| b == b'\n') {
                                let line_bytes = synth_buf[..nl].to_vec();
                                synth_buf = synth_buf[nl + 1..].to_vec();
                                let line = String::from_utf8_lossy(&line_bytes).trim().to_string();
                                if let Some(data) = line.strip_prefix("data: ") {
                                    if data == "[DONE]" { continue; }
                                    if let Ok(ev) = serde_json::from_str::<Value>(data) {
                                        if let Some(text) = ev.pointer("/delta/text").and_then(|t| t.as_str()) {
                                            if !text.is_empty() {
                                                let _ = tx.send(serde_json::to_string(&json!({
                                                    "token": text, "done": false,
                                                })).unwrap_or_default()).await;
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }

            // stop_reason == "end_turn" or other — emit done
            let _ = tx.send(serde_json::to_string(&json!({
                "token": "", "done": true, "model": &model, "total_tokens": total_tokens,
            })).unwrap_or_default()).await;
            break;
        }
    });

    // Convert channel receiver into a byte stream with SSE heartbeat
    let ndjson_stream = async_stream::stream! {
        let mut rx = rx;
        let heartbeat_interval = std::time::Duration::from_secs(15);
        loop {
            tokio::select! {
                msg = rx.recv() => {
                    match msg {
                        Some(line) => {
                            yield Ok::<_, std::io::Error>(axum::body::Bytes::from(format!("{}\n", line)));
                        }
                        None => break,
                    }
                }
                _ = tokio::time::sleep(heartbeat_interval) => {
                    yield Ok::<_, std::io::Error>(axum::body::Bytes::from_static(b": heartbeat\n\n"));
                }
            }
        }
    };

    Ok(Response::builder()
        .status(StatusCode::OK)
        .header("content-type", "application/x-ndjson")
        .header("cache-control", "no-cache")
        .header("x-content-type-options", "nosniff")
        .body(Body::from_stream(ndjson_stream))
        .expect("Response builder with valid status and headers"))
}

// ═══════════════════════════════════════════════════════════════════════
//  WebSocket Streaming — Jaskier Shared Pattern
// ═══════════════════════════════════════════════════════════════════════

/// Send a `WsServerMessage` through the WebSocket sink.
async fn ws_send(
    sender: &mut SplitSink<WebSocket, WsMessage>,
    msg: &WsServerMessage,
) {
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
                        ws_send(&mut sender, &WsServerMessage::Error {
                            message: format!("Invalid message format: {}", e),
                            code: Some("PARSE_ERROR".to_string()),
                        }).await;
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
    let dynamic_max: usize = if prompt_len < 200 { 15 } else if prompt_len < 1000 { 20 } else { 25 };
    let max_tool_iterations: usize = dynamic_max.min(ctx.max_iterations.max(1) as usize);

    // Send Start
    ws_send(sender, &WsServerMessage::Start {
        id: execution_id.clone(),
        model: model.clone(),
        files_loaded: vec![],
    }).await;

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
                let err_msg = err_val.get("error").and_then(|e| e.as_str()).unwrap_or("Unknown error");
                ws_send(sender, &WsServerMessage::Error {
                    message: err_msg.to_string(),
                    code: Some("API_ERROR".to_string()),
                }).await;
                return;
            }
        };

        // Fallback chain
        let resp = if !resp.status().is_success() && is_retryable_status(resp.status().as_u16()) {
            let fallback_models = ["claude-sonnet-4-6", "claude-haiku-4-5-20251001"];
            let mut fallback_resp = None;
            for fb_model in &fallback_models {
                if *fb_model == model { continue; }
                tracing::warn!("ws: {} returned {}, falling back to {}", model, resp.status(), fb_model);
                body["model"] = json!(fb_model);
                if let Ok(fb) = send_to_anthropic(state, &body, 300).await {
                    if fb.status().is_success() {
                        fallback_resp = Some(fb);
                        break;
                    }
                }
            }
            fallback_resp.unwrap_or(resp)
        } else {
            resp
        };

        if !resp.status().is_success() {
            let err_text = resp.text().await.unwrap_or_default();
            ws_send(sender, &WsServerMessage::Error {
                message: err_text,
                code: Some("ANTHROPIC_ERROR".to_string()),
            }).await;
            return;
        }

        // Parse SSE → Token messages
        let mut byte_stream = resp.bytes_stream();
        let mut raw_buf: Vec<u8> = Vec::new();
        let mut full_text = String::new();

        while let Some(chunk_result) = byte_stream.next().await {
            if cancel.is_cancelled() {
                ws_send(sender, &WsServerMessage::Error {
                    message: "Cancelled by user".to_string(),
                    code: Some("CANCELLED".to_string()),
                }).await;
                return;
            }
            let chunk = match chunk_result {
                Ok(bytes) => bytes,
                Err(_) => break,
            };
            raw_buf.extend_from_slice(&chunk);

            while let Some(nl) = raw_buf.iter().position(|&b| b == b'\n') {
                let line_bytes = raw_buf[..nl].to_vec();
                raw_buf = raw_buf[nl + 1..].to_vec();
                let line = String::from_utf8_lossy(&line_bytes).trim().to_string();
                if line.is_empty() || line.starts_with(':') { continue; }
                let data = match line.strip_prefix("data: ") {
                    Some(d) if d != "[DONE]" => d,
                    _ => continue,
                };
                let event: Value = match serde_json::from_str(data) {
                    Ok(v) => v,
                    Err(_) => continue,
                };
                let event_type = event.get("type").and_then(|t| t.as_str()).unwrap_or("");
                if event_type == "content_block_delta" {
                    let text = event.get("delta").and_then(|d| d.get("text")).and_then(|t| t.as_str()).unwrap_or("");
                    if !text.is_empty() {
                        full_text.push_str(text);
                        ws_send(sender, &WsServerMessage::Token { content: text.to_string() }).await;
                    }
                }
            }
        }

        // Store message to DB if session present
        if let Some(ref sid) = ctx.session_id {
            let _ = store_ws_messages(state, sid, &prompt, &full_text).await;
        }

        ws_send(sender, &WsServerMessage::Complete {
            duration_ms: execution_start.elapsed().as_millis() as u64,
        }).await;
        return;
    }

    // ── Tools-enabled path: agentic tool_use loop ───────────────────────

    let tool_defs: Vec<Value> = state
        .tool_executor
        .tool_definitions_with_mcp(state)
        .await
        .into_iter()
        .map(|td| json!({
            "name": td.name,
            "description": td.description,
            "input_schema": td.input_schema,
        }))
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
            ws_send(sender, &WsServerMessage::Error {
                message: "Cancelled by user".to_string(),
                code: Some("CANCELLED".to_string()),
            }).await;
            break;
        }

        if execution_start.elapsed() >= execution_timeout {
            tracing::warn!("WS: Global execution timeout (300s) at iteration {}", iteration);
            ws_send(sender, &WsServerMessage::Error {
                message: "Execution timeout — 5 minutes reached".to_string(),
                code: Some("TIMEOUT".to_string()),
            }).await;
            break;
        }

        if iteration > max_tool_iterations as u32 {
            ws_send(sender, &WsServerMessage::Error {
                message: "Max tool iterations reached".to_string(),
                code: Some("MAX_ITERATIONS".to_string()),
            }).await;
            break;
        }

        // Send Iteration
        ws_send(sender, &WsServerMessage::Iteration {
            number: iteration,
            max: max_tool_iterations as u32,
        }).await;

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
                let err_msg = err_val.get("error").and_then(|e| e.as_str()).unwrap_or("Unknown error");
                ws_send(sender, &WsServerMessage::Error {
                    message: format!("API error: {}", err_msg),
                    code: Some("API_ERROR".to_string()),
                }).await;
                break;
            }
        };

        if !resp.status().is_success() {
            let status = resp.status();
            let err_text = resp.text().await.unwrap_or_default();
            tracing::error!("WS: Anthropic API error (status={}, iter={}): {}", status, iteration, &err_text[..err_text.len().min(500)]);
            ws_send(sender, &WsServerMessage::Error {
                message: err_text,
                code: Some("ANTHROPIC_ERROR".to_string()),
            }).await;
            break;
        }

        // Parse Anthropic SSE stream
        let mut text_content = String::new();
        let mut tool_uses: Vec<Value> = Vec::new();
        let mut current_tool_id = String::new();
        let mut current_tool_name = String::new();
        let mut current_tool_input_json = String::new();
        let mut in_tool_use = false;
        let mut stop_reason = String::new();
        let mut _total_tokens: u32 = 0;

        let mut byte_stream = resp.bytes_stream();
        let mut raw_buf: Vec<u8> = Vec::new();

        while let Some(chunk_result) = byte_stream.next().await {
            if cancel.is_cancelled() { break; }

            let chunk = match chunk_result {
                Ok(bytes) => bytes,
                Err(_) => break,
            };
            raw_buf.extend_from_slice(&chunk);

            while let Some(nl) = raw_buf.iter().position(|&b| b == b'\n') {
                let line_bytes = raw_buf[..nl].to_vec();
                raw_buf = raw_buf[nl + 1..].to_vec();
                let line = String::from_utf8_lossy(&line_bytes).trim().to_string();
                if line.is_empty() || line.starts_with(':') { continue; }
                let data = match line.strip_prefix("data: ") {
                    Some(d) if d != "[DONE]" => d,
                    _ => continue,
                };
                let event: Value = match serde_json::from_str(data) {
                    Ok(v) => v,
                    Err(_) => continue,
                };
                let event_type = event.get("type").and_then(|t| t.as_str()).unwrap_or("");

                match event_type {
                    "content_block_start" => {
                        let cb = event.get("content_block").unwrap_or(&Value::Null);
                        let cb_type = cb.get("type").and_then(|t| t.as_str()).unwrap_or("");
                        if cb_type == "tool_use" {
                            in_tool_use = true;
                            current_tool_id = cb.get("id").and_then(|v| v.as_str()).unwrap_or("").to_string();
                            current_tool_name = cb.get("name").and_then(|v| v.as_str()).unwrap_or("").to_string();
                            current_tool_input_json.clear();
                        }
                    }
                    "content_block_delta" => {
                        let delta = event.get("delta").unwrap_or(&Value::Null);
                        let delta_type = delta.get("type").and_then(|t| t.as_str()).unwrap_or("");
                        if delta_type == "text_delta" {
                            let text = delta.get("text").and_then(|t| t.as_str()).unwrap_or("");
                            if !text.is_empty() {
                                text_content.push_str(text);
                                full_text.push_str(text);
                                agent_text_len += text.len();
                                ws_send(sender, &WsServerMessage::Token { content: text.to_string() }).await;
                            }
                        } else if delta_type == "input_json_delta" {
                            let partial = delta.get("partial_json").and_then(|t| t.as_str()).unwrap_or("");
                            current_tool_input_json.push_str(partial);
                        }
                    }
                    "content_block_stop" => {
                        if in_tool_use {
                            let tool_input: Value = serde_json::from_str(&current_tool_input_json).unwrap_or(json!({}));
                            ws_send(sender, &WsServerMessage::ToolCall {
                                name: current_tool_name.clone(),
                                args: tool_input.clone(),
                                iteration,
                            }).await;
                            tool_uses.push(json!({
                                "type": "tool_use",
                                "id": &current_tool_id,
                                "name": &current_tool_name,
                                "input": tool_input,
                            }));
                            in_tool_use = false;
                        }
                    }
                    "message_delta" => {
                        if let Some(sr) = event.get("delta").and_then(|d| d.get("stop_reason")).and_then(|s| s.as_str()) {
                            stop_reason = sr.to_string();
                        }
                        if let Some(usage) = event.get("usage") {
                            _total_tokens = usage.get("output_tokens").and_then(|v| v.as_u64()).unwrap_or(0) as u32;
                        }
                    }
                    _ => {}
                }
            }
        }

        if cancel.is_cancelled() {
            ws_send(sender, &WsServerMessage::Error {
                message: "Cancelled by user".to_string(),
                code: Some("CANCELLED".to_string()),
            }).await;
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
            for tu in &tool_uses {
                let tool_name = tu.get("name").and_then(|n| n.as_str()).unwrap_or("").to_string();
                let tool_id = tu.get("id").and_then(|i| i.as_str()).unwrap_or("").to_string();
                let tool_input = tu.get("input").unwrap_or(&json!({})).clone();
                let executor = state.tool_executor.with_working_directory(&wd);
                let state_ref = state.clone();
                let wd_ref = wd.clone();

                let handle = tokio::spawn(async move {
                    let (result, is_error) = if tool_name == "call_agent" {
                        // Agent-to-agent delegation — longer timeout (120s)
                        match tokio::time::timeout(
                            std::time::Duration::from_secs(120),
                            execute_agent_call(&state_ref, &tool_input, &wd_ref, 0),
                        ).await {
                            Ok(res) => res,
                            Err(_) => ("Agent delegation timed out after 120s".to_string(), true),
                        }
                    } else {
                        let timeout = std::time::Duration::from_secs(TOOL_TIMEOUT_SECS);
                        match tokio::time::timeout(
                            timeout,
                            executor.execute_with_state(&tool_name, &tool_input, &state_ref),
                        ).await {
                            Ok(res) => res,
                            Err(_) => (format!("Tool '{}' timed out after {}s", tool_name, TOOL_TIMEOUT_SECS), true),
                        }
                    };
                    (tool_name, tool_id, result, is_error)
                });
                handles.push(handle);
            }

            // Collect results with heartbeat during long tool execution
            for mut handle in handles {
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
                        ws_send(sender, &WsServerMessage::ToolResult {
                            name: tool_name.clone(),
                            success: !is_error,
                            summary,
                            iteration,
                        }).await;

                        ws_send(sender, &WsServerMessage::ToolProgress {
                            iteration,
                            tools_completed,
                            tools_total,
                        }).await;

                        let context_limit = if iteration < 3 { 25000 } else if iteration < 6 { 15000 } else { 8000 };
                        let truncated = truncate_for_context_with_limit(&result, context_limit);
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
                    }
                }
            }

            conversation.push(json!({ "role": "user", "content": tool_results }));

            // Iteration nudges
            if iteration >= 3 {
                let approx_context_bytes: usize = conversation.iter()
                    .map(|c| serde_json::to_string(c).map(|s| s.len()).unwrap_or(0))
                    .sum();
                let context_hint = format!(
                    "[CONTEXT: ~{}KB, {} msgs, iter {}/{}]",
                    approx_context_bytes / 1024, conversation.len(), iteration, max_tool_iterations
                );
                let nudge = if iteration >= 12 {
                    format!("[SYSTEM: Approaching limit. {} Wrap up and apply any pending changes.]", context_hint)
                } else if iteration >= 8 {
                    format!("[SYSTEM: {} Consider applying edits now.]", context_hint)
                } else {
                    format!("[SYSTEM: {} {} iterations remaining.]", context_hint, max_tool_iterations as u32 - iteration)
                };
                conversation.push(json!({ "role": "user", "content": nudge }));
            }

            text_content.clear();
            continue;
        }

        // Auto-fix phase
        if !has_written_file && !full_text.is_empty() && agent_text_len > 50 {
            let fix_keywords = ["fix", "napraw", "zmian", "popraw", "zastosow",
                                "write_file", "edit_file", "zmieni", "edytu", "zapisa"];
            let lower = full_text.to_lowercase();
            let needs_fix = fix_keywords.iter().any(|kw| lower.contains(kw));

            if needs_fix {
                tracing::info!("WS: Auto-fix phase — agent described changes but never wrote files");
                let edit_tools: Vec<&Value> = tool_defs.iter().filter(|td| {
                    let name = td.get("name").and_then(|n| n.as_str()).unwrap_or("");
                    name == "edit_file" || name == "write_file"
                }).collect();

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

                    if let Ok(fix_resp) = send_to_anthropic(state, &fix_body, 60).await {
                        if fix_resp.status().is_success() {
                            if let Ok(fix_json) = fix_resp.json::<Value>().await {
                                if let Some(content) = fix_json.get("content").and_then(|c| c.as_array()) {
                                    for block in content {
                                        let block_type = block.get("type").and_then(|t| t.as_str()).unwrap_or("");
                                        if block_type == "tool_use" {
                                            let fix_tool_name = block.get("name").and_then(|n| n.as_str()).unwrap_or("");
                                            let empty_input = json!({});
                                            let fix_tool_input = block.get("input").unwrap_or(&empty_input);
                                            let executor = state.tool_executor.with_working_directory(&wd);
                                            let timeout = std::time::Duration::from_secs(TOOL_TIMEOUT_SECS);
                                            let (result, is_error) = match tokio::time::timeout(
                                                timeout,
                                                executor.execute_with_state(fix_tool_name, fix_tool_input, state),
                                            ).await {
                                                Ok(res) => res,
                                                Err(_) => (format!("Tool '{}' timed out", fix_tool_name), true),
                                            };

                                            ws_send(sender, &WsServerMessage::ToolCall {
                                                name: fix_tool_name.to_string(),
                                                args: fix_tool_input.clone(),
                                                iteration,
                                            }).await;
                                            let summary: String = result.chars().take(200).collect();
                                            ws_send(sender, &WsServerMessage::ToolResult {
                                                name: fix_tool_name.to_string(),
                                                success: !is_error,
                                                summary,
                                                iteration,
                                            }).await;
                                        } else if block_type == "text" {
                                            if let Some(text) = block.get("text").and_then(|t| t.as_str()) {
                                                if !text.is_empty() {
                                                    ws_send(sender, &WsServerMessage::Token { content: text.to_string() }).await;
                                                }
                                            }
                                        }
                                    }
                                }
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
        ws_send(sender, &WsServerMessage::Complete {
            duration_ms: execution_start.elapsed().as_millis() as u64,
        }).await;
        break;
    }
}

// ═══════════════════════════════════════════════════════════════════════
//  Agent-to-Agent delegation (call_agent tool)
// ═══════════════════════════════════════════════════════════════════════

/// Execute a `call_agent` tool call — runs a non-streaming Claude conversation
/// with the target agent's identity and tier model. Supports nested delegation.
pub(crate) async fn execute_agent_call(
    state: &AppState,
    input: &Value,
    working_directory: &str,
    call_depth: u32,
) -> (String, bool) {
    // Read configurable limits from DB (with fallback defaults)
    let (max_call_depth, agent_max_iterations) = {
        let row: Option<(i32, i32)> = sqlx::query_as(
            "SELECT COALESCE(agent_max_call_depth, 3), COALESCE(agent_max_iterations, 8) \
             FROM ch_settings WHERE id = 1"
        )
        .fetch_optional(&state.db)
        .await
        .ok()
        .flatten();
        row.unwrap_or((3, 8))
    };

    let depth = call_depth + 1;
    if depth > max_call_depth as u32 {
        return (
            format!("Agent call depth limit ({}) reached — cannot delegate further", max_call_depth),
            true,
        );
    }

    let agent_name = match input.get("agent_name").and_then(|v| v.as_str()) {
        Some(n) => n.to_lowercase(),
        None => return ("Missing required argument: agent_name".to_string(), true),
    };
    let task = match input.get("task").and_then(|v| v.as_str()) {
        Some(t) => t,
        None => return ("Missing required argument: task".to_string(), true),
    };

    // Find agent by name (case-insensitive)
    let (agent_display_name, agent_role, agent_tier, agent_desc) = {
        let agents = state.agents.read().await;
        match agents.iter().find(|a| a.name.to_lowercase() == agent_name) {
            Some(a) => (a.name.clone(), a.role.clone(), a.tier.clone(), a.description.clone()),
            None => {
                let available: Vec<String> = agents.iter().map(|a| a.name.to_lowercase()).collect();
                return (
                    format!("Unknown agent '{}'. Available: {}", agent_name, available.join(", ")),
                    true,
                );
            }
        }
    };

    // Get the model for the agent's tier
    let model = crate::model_registry::get_model_id(state, &agent_tier.to_lowercase()).await;
    let max_tokens = super::prompt::tier_token_budget(&model);

    tracing::info!(
        "call_agent: delegating to {} ({}, {}, depth={}) — model={}",
        agent_display_name, agent_role, agent_tier, depth, model
    );

    let task_start = std::time::Instant::now();

    // Log delegation to DB (fire-and-forget)
    let task_id = uuid::Uuid::new_v4();
    {
        let db = state.db.clone();
        let name = agent_name.clone();
        let tier = agent_tier.clone();
        let model_clone = model.clone();
        let task_clone = task.to_string();
        tokio::spawn(async move {
            let _ = sqlx::query(
                "INSERT INTO ch_a2a_tasks (id, agent_name, agent_tier, task_prompt, model_used, call_depth, status) \
                 VALUES ($1, $2, $3, $4, $5, $6, 'working')"
            )
            .bind(task_id)
            .bind(&name)
            .bind(&tier)
            .bind(&task_clone)
            .bind(&model_clone)
            .bind(depth as i32)
            .execute(&db)
            .await;
        });
    }

    // Build agent-specific system prompt
    let lang = {
        let row: Option<(String,)> = sqlx::query_as(
            "SELECT COALESCE(language, 'en') FROM ch_settings WHERE id = 1"
        )
        .fetch_optional(&state.db)
        .await
        .ok()
        .flatten();
        row.map(|(l,)| l).unwrap_or_else(|| "en".to_string())
    };
    let lang_name = if lang == "pl" { "Polish" } else { "English" };

    let system_prompt = format!(
        "## Identity\n\
         **{name}** | {role} | {tier} | `{model}` | ClaudeHydra v4 (delegated agent, depth {depth})\n\
         {desc}\n\n\
         ## Rules\n\
         - Write ALL text in **{lang}** (except code/paths/identifiers).\n\
         - You run on a LOCAL Windows machine with FULL filesystem access.\n\
         - Be concise and focused on the delegated task.\n\
         - Use tools proactively. Request MULTIPLE tool calls in PARALLEL when independent.\n\
         - {delegation_hint}\n\
         {wd_section}",
        name = agent_display_name,
        role = agent_role,
        tier = agent_tier,
        model = model,
        depth = depth,
        desc = agent_desc,
        lang = lang_name,
        delegation_hint = if depth < max_call_depth as u32 {
            "You can use `call_agent` to further delegate if needed."
        } else {
            "You are at max delegation depth — complete the task yourself."
        },
        wd_section = if !working_directory.is_empty() {
            format!("\n## Working Directory\n**Current working directory**: `{}`", working_directory)
        } else {
            String::new()
        },
    );

    // Build tool definitions (including MCP)
    let tool_defs: Vec<Value> = state
        .tool_executor
        .tool_definitions_with_mcp(state)
        .await
        .into_iter()
        .map(|td| json!({
            "name": td.name,
            "description": td.description,
            "input_schema": td.input_schema,
        }))
        .collect();

    let mut conversation: Vec<Value> = vec![
        json!({ "role": "user", "content": task }),
    ];

    let mut collected_text = String::new();

    for iter in 0..agent_max_iterations as usize {
        let body = json!({
            "model": &model,
            "max_tokens": max_tokens,
            "system": &system_prompt,
            "messages": &conversation,
            "tools": &tool_defs,
        });

        let resp = match send_to_anthropic(state, &body, 120).await {
            Ok(r) => r,
            Err((_, Json(err_val))) => {
                let msg = err_val.get("error").and_then(|e| e.as_str()).unwrap_or("Unknown error");
                return (format!("[{} error: {}]", agent_display_name, msg), true);
            }
        };

        if !resp.status().is_success() {
            let err = resp.text().await.unwrap_or_default();
            return (format!("[{} API error: {}]", agent_display_name, &err[..err.len().min(300)]), true);
        }

        let resp_json: Value = match resp.json().await {
            Ok(v) => v,
            Err(e) => return (format!("[{} parse error: {}]", agent_display_name, e), true),
        };

        let stop_reason = resp_json.get("stop_reason").and_then(|s| s.as_str()).unwrap_or("end_turn");
        let content = resp_json.get("content").and_then(|c| c.as_array());

        let mut text_parts = Vec::new();
        let mut tool_uses: Vec<Value> = Vec::new();

        if let Some(blocks) = content {
            for block in blocks {
                let block_type = block.get("type").and_then(|t| t.as_str()).unwrap_or("");
                match block_type {
                    "text" => {
                        if let Some(t) = block.get("text").and_then(|t| t.as_str()) {
                            text_parts.push(t.to_string());
                            collected_text.push_str(t);
                        }
                    }
                    "tool_use" => {
                        tool_uses.push(block.clone());
                    }
                    _ => {}
                }
            }
        }

        if stop_reason == "tool_use" && !tool_uses.is_empty() {
            // Build assistant message
            let mut assistant_blocks: Vec<Value> = Vec::new();
            for t in &text_parts {
                assistant_blocks.push(json!({ "type": "text", "text": t }));
            }
            assistant_blocks.extend(tool_uses.clone());
            conversation.push(json!({ "role": "assistant", "content": assistant_blocks }));

            // Execute tools
            let mut tool_results: Vec<Value> = Vec::new();
            for tu in &tool_uses {
                let tool_name = tu.get("name").and_then(|n| n.as_str()).unwrap_or("");
                let tool_id = tu.get("id").and_then(|i| i.as_str()).unwrap_or("");
                let empty = json!({});
                let tool_input = tu.get("input").unwrap_or(&empty);

                let (result, is_error) = if tool_name == "call_agent" {
                    // Recursive delegation
                    Box::pin(execute_agent_call(state, tool_input, working_directory, depth)).await
                } else {
                    let executor = state.tool_executor.with_working_directory(working_directory);
                    let timeout = std::time::Duration::from_secs(TOOL_TIMEOUT_SECS);
                    match tokio::time::timeout(
                        timeout,
                        executor.execute_with_state(tool_name, tool_input, state),
                    ).await {
                        Ok(res) => res,
                        Err(_) => (format!("Tool '{}' timed out", tool_name), true),
                    }
                };

                let truncated = truncate_for_context_with_limit(&result, 15000);
                tool_results.push(json!({
                    "type": "tool_result",
                    "tool_use_id": tool_id,
                    "content": &truncated,
                    "is_error": is_error,
                }));
            }

            conversation.push(json!({ "role": "user", "content": tool_results }));

            if iter >= 6 {
                conversation.push(json!({
                    "role": "user",
                    "content": "[SYSTEM: Approaching iteration limit. Wrap up now.]"
                }));
            }

            continue;
        }

        // end_turn — done
        break;
    }

    // Update task status in DB
    let duration_ms = task_start.elapsed().as_millis() as i32;
    let is_error = collected_text.is_empty();
    let preview: String = collected_text.chars().take(500).collect();
    {
        let db = state.db.clone();
        tokio::spawn(async move {
            let _ = sqlx::query(
                "UPDATE ch_a2a_tasks SET status = $1, result_preview = $2, duration_ms = $3, \
                 is_error = $4, completed_at = NOW() WHERE id = $5"
            )
            .bind(if is_error { "failed" } else { "completed" })
            .bind(&preview)
            .bind(duration_ms)
            .bind(is_error)
            .bind(task_id)
            .execute(&db)
            .await;
        });
    }

    if collected_text.is_empty() {
        return (format!("[{} completed the task but produced no text output]", agent_display_name), false);
    }

    (
        format!("**[Agent {} ({})]:**\n\n{}", agent_display_name, agent_role, collected_text),
        false,
    )
}

/// Store user prompt + assistant response to DB for a WebSocket session.
async fn store_ws_messages(
    state: &AppState,
    session_id: &uuid::Uuid,
    user_prompt: &str,
    assistant_text: &str,
) -> Result<(), sqlx::Error> {
    sqlx::query(
        "INSERT INTO ch_messages (id, session_id, role, content, created_at) VALUES ($1, $2, 'user', $3, NOW())"
    )
    .bind(uuid::Uuid::new_v4())
    .bind(session_id)
    .bind(user_prompt)
    .execute(&state.db)
    .await?;

    if !assistant_text.is_empty() {
        sqlx::query(
            "INSERT INTO ch_messages (id, session_id, role, content, created_at) VALUES ($1, $2, 'assistant', $3, NOW())"
        )
        .bind(uuid::Uuid::new_v4())
        .bind(session_id)
        .bind(assistant_text)
        .execute(&state.db)
        .await?;
    }

    Ok(())
}
