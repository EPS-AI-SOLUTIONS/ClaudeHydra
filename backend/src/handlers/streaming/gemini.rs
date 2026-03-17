//! Gemini hybrid streaming — Google API SSE → NDJSON translation.

use axum::Json;
use axum::body::Body;
use axum::http::StatusCode;
use axum::response::Response;
use serde_json::{Value, json};

use jaskier_core::handlers::anthropic_streaming::{
    build_ndjson_response, sanitize_api_error,
};

use crate::models::*;
use crate::state::AppState;

use crate::handlers::prompt::ChatContext;

pub(crate) async fn google_chat_stream(
    state: AppState,
    req: ChatRequest,
    ctx: ChatContext,
) -> Result<Response, (StatusCode, Json<Value>)> {
    let credential = jaskier_oauth::google::get_google_credential(&state).await;
    let (api_key, is_oauth) = match credential {
        Some(c) => c,
        None => {
            return Err((
                StatusCode::UNAUTHORIZED,
                Json(json!({ "error": "No Google API credential configured" })),
            ));
        }
    };

    let model = &ctx.model;
    let url = format!(
        "https://generativelanguage.googleapis.com/v1beta/models/{}:streamGenerateContent?alt=sse",
        model
    );

    let contents: Vec<Value> = req
        .messages
        .iter()
        .map(|m| {
            let role = if m.role == "assistant" {
                "model"
            } else {
                "user"
            };
            json!({ "role": role, "parts": [{ "text": m.content }] })
        })
        .collect();

    let body = json!({
        "systemInstruction": { "parts": [{ "text": ctx.system_prompt }] },
        "contents": contents,
        "generationConfig": {
            "temperature": req.temperature.unwrap_or(1.0),
            "maxOutputTokens": ctx.max_tokens,
        }
    });

    let request =
        jaskier_oauth::google::apply_google_auth(state.http_client.post(&url), &api_key, is_oauth)
            .json(&body)
            .timeout(std::time::Duration::from_secs(300));

    let resp = request.send().await.map_err(|e| {
        tracing::error!("Google API request failed: {}", e);
        (
            StatusCode::BAD_GATEWAY,
            Json(json!({ "error": "AI provider request failed" })),
        )
    })?;

    if !resp.status().is_success() {
        let status = resp.status();
        let err = resp.text().await.unwrap_or_default();
        tracing::error!("Google API error (status={}): {}", status, err);
        let safe_error = sanitize_api_error(&err);
        return Err((
            StatusCode::from_u16(status.as_u16()).unwrap_or(StatusCode::BAD_GATEWAY),
            Json(json!({ "error": safe_error })),
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
                    tracing::error!("Google SSE stream error: {}", e);
                    let err_line = serde_json::to_string(&json!({ "token": "\n[Stream interrupted]", "done": true, "model": &model_for_done })).unwrap_or_default();
                    yield Ok::<_, std::io::Error>(axum::body::Bytes::from(format!("{}\n", err_line)));
                    break;
                }
            };
            sse_buffer.push_str(&String::from_utf8_lossy(&chunk));

            while let Some(nl) = sse_buffer.find('\n') {
                // Safety: '\n' is ASCII — find() returns byte pos at char boundary
                let line = sse_buffer[..nl].trim().to_string();
                sse_buffer = sse_buffer[nl + 1..].to_string();
                if line.is_empty() || line.starts_with(':') { continue; }
                if let Some(data) = line.strip_prefix("data: ")
                    && let Ok(event) = serde_json::from_str::<Value>(data) {
                        if let Some(text) = event.pointer("/candidates/0/content/parts/0/text").and_then(|t| t.as_str())
                            && !text.is_empty() {
                                let ndjson_line = serde_json::to_string(&json!({ "token": text, "done": false })).unwrap_or_default();
                                yield Ok::<_, std::io::Error>(axum::body::Bytes::from(format!("{}\n", ndjson_line)));
                            }
                        if let Some(usage) = event.get("usageMetadata") {
                            total_tokens = usage.get("totalTokenCount").and_then(|v| v.as_u64()).unwrap_or(0) as u32;
                        }
                    }
            }
        }
        let done_line = serde_json::to_string(&json!({ "token": "", "done": true, "model": &model_for_done, "total_tokens": total_tokens })).unwrap_or_default();
        yield Ok::<_, std::io::Error>(axum::body::Bytes::from(format!("{}\n", done_line)));
    };

    Ok(build_ndjson_response(Body::from_stream(ndjson_stream)))
}
