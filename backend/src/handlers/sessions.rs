//! Session CRUD, message storage, and AI title generation.
//!
//! Most handlers delegate to `jaskier_core::sessions` via `HasSessionsState`.
//! ClaudeHydra keeps local overrides for `get_session` and `add_session_message`
//! because they include `ch_tool_interactions` joins and inserts — a feature
//! specific to Claude's tool-use protocol that other Hydras don't have.

use axum::Json;
use axum::extract::{Path, Query, State};
use axum::http::StatusCode;
use serde_json::{Value, json};

use crate::models::*;
use crate::state::AppState;

use super::MAX_MESSAGE_LENGTH;

// ── Re-export shared session types ───────────────────────────────────────────
// These are used by lib.rs OpenAPI derive and route registration.
pub use jaskier_core::sessions::{
    PaginationParams,
    // Shared handlers — wired via turbofish in lib.rs routes.
    list_sessions, create_session, update_session, delete_session,
    update_session_working_directory, generate_session_title,
};

// ═══════════════════════════════════════════════════════════════════════
//  Get session (with paginated messages + tool interactions)
//  LOCAL OVERRIDE — shared version lacks tool_interactions join
// ═══════════════════════════════════════════════════════════════════════

#[utoipa::path(get, path = "/api/sessions/{id}", tag = "sessions",
    params(("id" = String, Path, description = "Session UUID")),
    responses((status = 200, description = "Session with messages")))]
pub async fn get_session(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Query(params): Query<PaginationParams>,
) -> Result<Json<Value>, StatusCode> {
    let session_id: uuid::Uuid = id.parse().map_err(|_| StatusCode::BAD_REQUEST)?;
    let msg_limit = params.limit.unwrap_or(200).clamp(1, 500);
    let msg_offset = params.offset.unwrap_or(0).max(0);

    let session_row = sqlx::query_as::<_, SessionRow>(
        "SELECT id, title, created_at, updated_at, working_directory FROM ch_sessions WHERE id = $1",
    )
    .bind(session_id)
    .fetch_optional(&state.db)
    .await
    .map_err(|e| {
        tracing::error!("Failed to get session: {}", e);
        StatusCode::INTERNAL_SERVER_ERROR
    })?
    .ok_or(StatusCode::NOT_FOUND)?;

    let total_messages: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM ch_messages WHERE session_id = $1")
            .bind(session_id)
            .fetch_one(&state.db)
            .await
            .map_err(|e| {
                tracing::error!("Failed to count session messages: {}", e);
                StatusCode::INTERNAL_SERVER_ERROR
            })?;

    let message_rows = sqlx::query_as::<_, MessageRow>(
        "SELECT * FROM (\
            SELECT id, session_id, role, content, model, agent, created_at \
            FROM ch_messages WHERE session_id = $1 \
            ORDER BY created_at DESC LIMIT $2 OFFSET $3\
        ) sub ORDER BY created_at ASC",
    )
    .bind(session_id)
    .bind(msg_limit)
    .bind(msg_offset)
    .fetch_all(&state.db)
    .await
    .map_err(|e| {
        tracing::error!("Failed to get session messages: {}", e);
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    let message_ids: Vec<uuid::Uuid> = message_rows.iter().map(|m| m.id).collect();
    let ti_rows = if message_ids.is_empty() {
        Vec::new()
    } else {
        sqlx::query_as::<_, ToolInteractionRow>(
            "SELECT ti.id, ti.message_id, ti.tool_use_id, ti.tool_name, \
             ti.tool_input, ti.result, ti.is_error, ti.executed_at \
             FROM ch_tool_interactions ti \
             WHERE ti.message_id = ANY($1) \
             ORDER BY ti.executed_at ASC",
        )
        .bind(&message_ids)
        .fetch_all(&state.db)
        .await
        .unwrap_or_default()
    };

    let mut ti_map: std::collections::HashMap<uuid::Uuid, Vec<ToolInteractionInfo>> =
        std::collections::HashMap::new();
    for ti in ti_rows {
        ti_map
            .entry(ti.message_id)
            .or_default()
            .push(ToolInteractionInfo {
                tool_use_id: ti.tool_use_id,
                tool_name: ti.tool_name,
                tool_input: ti.tool_input,
                result: ti.result,
                is_error: ti.is_error,
            });
    }

    let messages: Vec<HistoryEntry> = message_rows
        .into_iter()
        .map(|m| {
            let interactions = ti_map.remove(&m.id);
            HistoryEntry {
                id: m.id.to_string(),
                role: m.role,
                content: m.content,
                model: m.model,
                agent: m.agent,
                timestamp: m.created_at.to_rfc3339(),
                tool_interactions: interactions,
            }
        })
        .collect();

    Ok(Json(json!({
        "id": session_row.id.to_string(),
        "title": session_row.title,
        "created_at": session_row.created_at.to_rfc3339(),
        "working_directory": session_row.working_directory,
        "messages": serde_json::to_value(&messages).map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?,
        "pagination": {
            "total": total_messages,
            "limit": msg_limit,
            "offset": msg_offset,
        }
    })))
}

// ═══════════════════════════════════════════════════════════════════════
//  Add message to session
//  LOCAL OVERRIDE — shared version lacks tool_interactions insert
// ═══════════════════════════════════════════════════════════════════════

#[utoipa::path(post, path = "/api/sessions/{id}/messages", tag = "sessions",
    params(("id" = String, Path, description = "Session UUID")),
    request_body = AddMessageRequest,
    responses((status = 201, description = "Message added")))]
pub async fn add_session_message(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(req): Json<AddMessageRequest>,
) -> Result<(StatusCode, Json<Value>), StatusCode> {
    if req.content.len() > MAX_MESSAGE_LENGTH {
        tracing::warn!(
            "add_session_message: content exceeds {} chars (got {})",
            MAX_MESSAGE_LENGTH,
            req.content.len()
        );
        return Err(StatusCode::BAD_REQUEST);
    }

    let session_id: uuid::Uuid = id.parse().map_err(|_| StatusCode::BAD_REQUEST)?;

    let exists = sqlx::query("SELECT 1 FROM ch_sessions WHERE id = $1")
        .bind(session_id)
        .fetch_optional(&state.db)
        .await
        .map_err(|e| {
            tracing::error!("Failed to check session: {}", e);
            StatusCode::INTERNAL_SERVER_ERROR
        })?;

    if exists.is_none() {
        return Err(StatusCode::NOT_FOUND);
    }

    let row = sqlx::query_as::<_, MessageRow>(
        "INSERT INTO ch_messages (session_id, role, content, model, agent) \
         VALUES ($1, $2, $3, $4, $5) \
         RETURNING id, session_id, role, content, model, agent, created_at",
    )
    .bind(session_id)
    .bind(&req.role)
    .bind(&req.content)
    .bind(&req.model)
    .bind(&req.agent)
    .fetch_one(&state.db)
    .await
    .map_err(|e| {
        tracing::error!("Failed to add message: {}", e);
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    if let Some(ref interactions) = req.tool_interactions {
        for ti in interactions {
            sqlx::query(
                "INSERT INTO ch_tool_interactions \
                 (message_id, tool_use_id, tool_name, tool_input, result, is_error) \
                 VALUES ($1, $2, $3, $4, $5, $6)",
            )
            .bind(row.id)
            .bind(&ti.tool_use_id)
            .bind(&ti.tool_name)
            .bind(&ti.tool_input)
            .bind(&ti.result)
            .bind(ti.is_error)
            .execute(&state.db)
            .await
            .map_err(|e| {
                tracing::error!("Failed to save tool interaction: {}", e);
                StatusCode::INTERNAL_SERVER_ERROR
            })?;
        }
    }

    sqlx::query("UPDATE ch_sessions SET updated_at = NOW() WHERE id = $1")
        .bind(session_id)
        .execute(&state.db)
        .await
        .ok();

    let entry = HistoryEntry {
        id: row.id.to_string(),
        role: row.role,
        content: row.content,
        model: row.model,
        agent: row.agent,
        timestamp: row.created_at.to_rfc3339(),
        tool_interactions: req.tool_interactions,
    };

    Ok((
        StatusCode::CREATED,
        Json(serde_json::to_value(entry).map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?),
    ))
}
