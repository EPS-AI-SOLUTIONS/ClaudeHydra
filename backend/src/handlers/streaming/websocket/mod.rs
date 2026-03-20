//! WebSocket streaming transport — CH-specific rich protocol.
//!
//! Split into focused submodules:
//! - `mod.rs` — connection setup, auth, message loop
//! - `execute` — core streaming execution (no-tools + tools-enabled paths)
//!
//! Message types: Start/Token/Iteration/ToolCall/ToolResult/ToolProgress/
//! ViewHint/Fallback/Heartbeat/Complete/Error.
//!
//! Remains CH-specific because:
//! - CH uses its own WsClientMessage/WsServerMessage types
//! - CH WS handler supports `tools_enabled` toggle
//! - CH WS has unique auto-fix phase and forced synthesis
//! - CancellationToken integration is CH-specific

mod execute;

use std::collections::HashMap;

use axum::extract::State;
use axum::extract::ws::{Message as WsMessage, WebSocket, WebSocketUpgrade};
use axum::http::StatusCode;
use axum::response::IntoResponse;
use futures_util::{SinkExt, stream::SplitSink};
use tokio_util::sync::CancellationToken;

use jaskier_core::auth::validate_ws_token;

use crate::models::*;
use crate::state::AppState;

/// Send a `WsServerMessage` through the WebSocket sink.
pub(crate) async fn ws_send(sender: &mut SplitSink<WebSocket, WsMessage>, msg: &WsServerMessage) {
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
                        execute::execute_streaming_ws(
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
