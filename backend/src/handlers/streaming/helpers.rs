//! Shared helpers for streaming module: session history, predictive prefetch,
//! MCP notifications, and DB persistence.

use serde_json::{Value, json};

use crate::models::*;
use crate::state::AppState;

// ═══════════════════════════════════════════════════════════════════════
//  Post-task MCP notification (fire-and-forget)
// ═══════════════════════════════════════════════════════════════════════

/// Send a "success" notification via the ai-swarm-notifier MCP server (if connected).
/// Best-effort: errors are logged but never propagate to the caller.
/// Uses the shared `McpClientManager::call_tool(prefixed_name, args)` API.
pub(crate) async fn send_task_complete_notification(state: &AppState, model: &str) {
    let prefixed = "mcp_ai_swarm_notifier_show_notification";
    let args = json!({
        "status": "success",
        "agent": "ClaudeHydra",
        "message": format!("Task completed ({})", model),
    });
    match state.mcp_client.call_tool(prefixed, &args).await {
        Ok(_) => tracing::debug!("Task completion notification sent via MCP"),
        Err(e) => tracing::debug!(
            "MCP notification not sent (server may not be connected): {}",
            e
        ),
    }
}

// ═══════════════════════════════════════════════════════════════════════
//  Session history helpers
// ═══════════════════════════════════════════════════════════════════════

pub(crate) async fn load_session_history(db: &sqlx::PgPool, sid: &uuid::Uuid) -> Vec<Value> {
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
        if i < messages.len().saturating_sub(6)
            && let Some(content) = messages[i].get_mut("content")
            && let Some(s) = content.as_str().map(|s| s.to_string())
            && s.len() > 500
        {
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

    messages
}

pub(crate) fn filter_client_system_prompt(messages: &[ChatMessage]) -> Vec<Value> {
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
//  Predictive UI Pre-fetching — view hint detection from prompt text
// ═══════════════════════════════════════════════════════════════════════

/// Keyword-to-view mapping for predictive pre-fetching.
/// Analyzes the user prompt and returns view IDs that the user likely wants next.
pub(crate) fn detect_view_hints(prompt: &str) -> Vec<String> {
    let lower = prompt.to_lowercase();
    let mut hints = Vec::new();

    let rules: &[(&[&str], &str)] = &[
        (&["statystyk", "analytics", "zużyci", "token", "koszt", "cost", "usage", "billing"], "analytics"),
        (&["ustawieni", "settings", "konfiguracj", "model", "api key", "provider"], "settings"),
        (&["log", "błęd", "error", "debug", "tracing"], "logs"),
        (&["agent", "narzędzi", "tool", "executor"], "agents"),
        (&["delegacj", "delegation", "przekaz", "a2a"], "delegations"),
        (&["rój", "swarm", "orkiestracj", "multi-agent", "peer"], "swarm"),
        (&["cache", "semantyczn", "semantic", "embedding", "qdrant"], "semantic-cache"),
        (&["kolaboracj", "collab", "współprac", "edytor", "crdt", "yjs"], "collab"),
    ];

    for (keywords, view) in rules {
        if keywords.iter().any(|kw| lower.contains(kw)) {
            hints.push((*view).to_string());
        }
    }

    // Cap at 3 hints to avoid over-fetching
    hints.truncate(3);
    hints
}

// ═══════════════════════════════════════════════════════════════════════
//  DB persistence helpers
// ═══════════════════════════════════════════════════════════════════════

/// Store user prompt + assistant response to DB for a WebSocket session.
pub(crate) async fn store_ws_messages(
    state: &AppState,
    session_id: &uuid::Uuid,
    user_prompt: &str,
    assistant_text: &str,
) -> Result<(), sqlx::Error> {
    sqlx::query(
        "INSERT INTO ch_messages (id, session_id, role, content, created_at) VALUES ($1, $2, 'user', $3, NOW())",
    )
    .bind(uuid::Uuid::new_v4())
    .bind(session_id)
    .bind(user_prompt)
    .execute(&state.db)
    .await?;

    if !assistant_text.is_empty() {
        sqlx::query(
            "INSERT INTO ch_messages (id, session_id, role, content, created_at) VALUES ($1, $2, 'assistant', $3, NOW())",
        )
        .bind(uuid::Uuid::new_v4())
        .bind(session_id)
        .bind(assistant_text)
        .execute(&state.db)
        .await?;
    }

    Ok(())
}
