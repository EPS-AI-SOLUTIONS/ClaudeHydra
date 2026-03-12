// Jaskier Shared Pattern -- mcp/config
//! MCP server configuration — uses shared types and DB functions from `jaskier_core::mcp::config`.
//!
//! ClaudeHydra keeps local HTTP handlers because its response format (bare `Json<Value>`)
//! differs from the shared generic handlers (which return `(StatusCode, Json<Value>)` tuples).
//! However, all types, validation (SSRF + stdio allowlist), and DB functions are delegated
//! to the shared crate.

use axum::Json;
use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::response::IntoResponse;
use serde_json::{Value, json};
use sqlx::PgPool;

use crate::state::AppState;

// ── Re-export shared types so callers (client.rs, server.rs) can use them ──
pub use jaskier_core::mcp::config::{
    McpServerConfig, McpDiscoveredTool,
    validate_mcp_url, validate_stdio_config,
};

// Re-export shared create/update request types under local names for compatibility.
pub use jaskier_core::mcp::config::CreateMcpServer as CreateMcpServerRequest;
pub use jaskier_core::mcp::config::UpdateMcpServer as UpdateMcpServerRequest;

// ── Table names ────────────────────────────────────────────────────────────

const CH_MCP_SERVERS: &str = "ch_mcp_servers";
const CH_MCP_TOOLS: &str = "ch_mcp_discovered_tools";

// ── DB helpers (thin wrappers over shared `_t` functions) ──────────────────
// These hardcode the `ch_*` table names for ClaudeHydra.

/// Load all MCP server configs from `ch_mcp_servers`.
pub async fn list_all(db: &PgPool) -> Result<Vec<McpServerConfig>, sqlx::Error> {
    jaskier_core::mcp::config::list_mcp_servers_t(db, CH_MCP_SERVERS).await
}

/// Load only enabled MCP server configs.
pub async fn list_enabled(db: &PgPool) -> Result<Vec<McpServerConfig>, sqlx::Error> {
    let all = jaskier_core::mcp::config::list_mcp_servers_t(db, CH_MCP_SERVERS).await?;
    Ok(all.into_iter().filter(|s| s.enabled).collect())
}

/// Get a single server config by ID.
pub async fn get_by_id(db: &PgPool, id: &str) -> Result<Option<McpServerConfig>, sqlx::Error> {
    jaskier_core::mcp::config::get_mcp_server_t(db, CH_MCP_SERVERS, id).await
}

/// Insert a new server config.
pub async fn insert(
    db: &PgPool,
    req: &CreateMcpServerRequest,
) -> Result<McpServerConfig, sqlx::Error> {
    jaskier_core::mcp::config::create_mcp_server_db_t(db, CH_MCP_SERVERS, req).await
}

/// Update a server config by ID (partial update).
pub async fn update(
    db: &PgPool,
    id: &str,
    req: &UpdateMcpServerRequest,
) -> Result<Option<McpServerConfig>, sqlx::Error> {
    jaskier_core::mcp::config::update_mcp_server_db_t(db, CH_MCP_SERVERS, id, req).await
}

/// Delete a server config by ID.
pub async fn delete(db: &PgPool, id: &str) -> Result<bool, sqlx::Error> {
    jaskier_core::mcp::config::delete_mcp_server_db_t(db, CH_MCP_SERVERS, id).await
}

/// List discovered tools for a given server.
pub async fn list_tools_for_server(
    db: &PgPool,
    server_id: &str,
) -> Result<Vec<McpDiscoveredTool>, sqlx::Error> {
    jaskier_core::mcp::config::list_discovered_tools_t(db, CH_MCP_TOOLS, server_id).await
}

/// Upsert discovered tools for a server (replaces old ones).
/// Each tuple is (name, description, input_schema_json).
pub async fn upsert_discovered_tools(
    db: &PgPool,
    server_id: &str,
    tools: &[(String, Option<String>, String)],
) -> Result<(), sqlx::Error> {
    jaskier_core::mcp::config::save_discovered_tools_t(db, CH_MCP_TOOLS, server_id, tools).await
}

// ── Helpers ────────────────────────────────────────────────────────────────

/// Redact auth_token from server config for API responses.
fn redact_server(s: &McpServerConfig) -> Value {
    json!({
        "id": s.id,
        "name": s.name,
        "transport": s.transport,
        "command": s.command,
        "args": serde_json::from_str::<Value>(&s.args).unwrap_or(json!([])),
        "env_vars": serde_json::from_str::<Value>(&s.env_vars).unwrap_or(json!({})),
        "url": s.url,
        "enabled": s.enabled,
        "has_auth_token": s.auth_token.is_some(),
        "timeout_secs": s.timeout_secs,
        "created_at": s.created_at.to_rfc3339(),
        "updated_at": s.updated_at.to_rfc3339(),
    })
}

// ── HTTP Handlers (ClaudeHydra-specific, use shared McpClientManager) ───────
// These keep the same API signatures as before but delegate DB operations
// to the shared `_t` functions above.

/// GET /api/mcp/servers — list all MCP server configurations
pub async fn list_servers_handler(
    State(state): State<AppState>,
) -> Result<Json<Value>, StatusCode> {
    let servers = list_all(&state.db).await.map_err(|e| {
        tracing::error!("mcp: list_servers: {}", e);
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    let servers_json: Vec<Value> = servers.into_iter().map(|s| redact_server(&s)).collect();
    Ok(Json(json!(servers_json)))
}

/// POST /api/mcp/servers — create a new MCP server config
pub async fn create_server_handler(
    State(state): State<AppState>,
    Json(req): Json<CreateMcpServerRequest>,
) -> Result<impl IntoResponse, StatusCode> {
    // Validate transport
    if req.transport != "stdio" && req.transport != "http" {
        return Err(StatusCode::BAD_REQUEST);
    }
    // stdio requires command
    if req.transport == "stdio" && req.command.is_none() {
        return Err(StatusCode::BAD_REQUEST);
    }
    // http requires url
    if req.transport == "http" && req.url.is_none() {
        return Err(StatusCode::BAD_REQUEST);
    }
    // Validate stdio command allowlist and blocked env vars (shared function)
    if req.transport == "stdio"
        && let Some(ref cmd) = req.command
        && let Err(msg) = validate_stdio_config(cmd, req.env_vars.as_ref())
    {
        tracing::warn!("mcp: create_server rejected: {}", msg);
        return Err(StatusCode::BAD_REQUEST);
    }
    // SSRF validation for HTTP transport URLs
    if req.transport == "http"
        && let Some(ref url) = req.url
    {
        let is_prod = state.auth_secret.is_some();
        if let Err(msg) = validate_mcp_url(url, is_prod) {
            tracing::warn!("mcp: create_server SSRF rejected: {}", msg);
            return Err(StatusCode::BAD_REQUEST);
        }
    }

    let server = insert(&state.db, &req).await.map_err(|e| {
        tracing::error!("mcp: create_server: {}", e);
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    Ok((StatusCode::CREATED, Json(redact_server(&server))))
}

/// PATCH /api/mcp/servers/{id} — update an MCP server config
pub async fn update_server_handler(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(req): Json<UpdateMcpServerRequest>,
) -> Result<Json<Value>, StatusCode> {
    // Validate stdio allowlist: check effective transport + command after merge
    if req.transport.as_deref() == Some("stdio") || req.command.is_some() || req.env_vars.is_some()
    {
        let current = get_by_id(&state.db, &id)
            .await
            .map_err(|e| {
                tracing::error!("mcp: update_server prefetch: {}", e);
                StatusCode::INTERNAL_SERVER_ERROR
            })?
            .ok_or(StatusCode::NOT_FOUND)?;
        let effective_transport = req.transport.as_deref().unwrap_or(&current.transport);
        if effective_transport == "stdio" {
            let effective_command = req.command.as_deref().or(current.command.as_deref());
            if let Some(cmd) = effective_command
                && let Err(msg) = validate_stdio_config(cmd, req.env_vars.as_ref())
            {
                tracing::warn!("mcp: update_server rejected: {}", msg);
                return Err(StatusCode::BAD_REQUEST);
            }
        }
    }

    // SSRF validation for HTTP transport URLs on update
    if let Some(ref url) = req.url {
        let needs_url_check = req.transport.as_deref() == Some("http")
            || (req.transport.is_none() && req.url.is_some());
        if needs_url_check {
            let is_prod = state.auth_secret.is_some();
            if let Err(msg) = validate_mcp_url(url, is_prod) {
                tracing::warn!("mcp: update_server SSRF rejected: {}", msg);
                return Err(StatusCode::BAD_REQUEST);
            }
        }
    }

    let server = update(&state.db, &id, &req)
        .await
        .map_err(|e| {
            tracing::error!("mcp: update_server: {}", e);
            StatusCode::INTERNAL_SERVER_ERROR
        })?
        .ok_or(StatusCode::NOT_FOUND)?;

    Ok(Json(redact_server(&server)))
}

/// DELETE /api/mcp/servers/{id} — delete an MCP server config
pub async fn delete_server_handler(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<StatusCode, StatusCode> {
    // Also disconnect from client manager
    state.mcp_client.disconnect_server(&id).await;

    let deleted = delete(&state.db, &id).await.map_err(|e| {
        tracing::error!("mcp: delete_server: {}", e);
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    if deleted {
        Ok(StatusCode::NO_CONTENT)
    } else {
        Err(StatusCode::NOT_FOUND)
    }
}

/// POST /api/mcp/servers/{id}/connect — connect to an MCP server
pub async fn connect_server_handler(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<Json<Value>, StatusCode> {
    let config = get_by_id(&state.db, &id)
        .await
        .map_err(|e| {
            tracing::error!("mcp: connect_server: {}", e);
            StatusCode::INTERNAL_SERVER_ERROR
        })?
        .ok_or(StatusCode::NOT_FOUND)?;

    if !config.enabled {
        return Err(StatusCode::CONFLICT);
    }

    state
        .mcp_client
        .connect_server(&config)
        .await
        .map_err(|e| {
            tracing::error!("mcp: connect_server {}: {}", config.name, e);
            StatusCode::BAD_GATEWAY
        })?;

    let tools = state.mcp_client.get_server_tools(&id).await;

    Ok(Json(json!({
        "server_id": id,
        "server_name": config.name,
        "tools_discovered": tools.len(),
        "tools": tools.iter().map(|t| json!({
            "name": t.name,
            "prefixed_name": t.prefixed_name,
            "description": t.description,
        })).collect::<Vec<_>>(),
    })))
}

/// POST /api/mcp/servers/{id}/disconnect — disconnect from an MCP server
pub async fn disconnect_server_handler(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> StatusCode {
    state.mcp_client.disconnect_server(&id).await;
    StatusCode::NO_CONTENT
}

/// GET /api/mcp/servers/{id}/tools — list discovered tools for a server
pub async fn list_server_tools_handler(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<Json<Value>, StatusCode> {
    let tools = list_tools_for_server(&state.db, &id).await.map_err(|e| {
        tracing::error!("mcp: list_server_tools: {}", e);
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    let tools_json: Vec<Value> = tools
        .into_iter()
        .map(|t| {
            json!({
                "id": t.id,
                "tool_name": t.tool_name,
                "description": t.description,
                "input_schema": serde_json::from_str::<Value>(&t.input_schema).unwrap_or(json!({})),
                "discovered_at": t.discovered_at.to_rfc3339(),
            })
        })
        .collect();

    Ok(Json(json!(tools_json)))
}

/// GET /api/mcp/tools — list all discovered tools across all enabled servers (prefixed)
pub async fn list_all_tools_handler(
    State(state): State<AppState>,
) -> Result<Json<Value>, StatusCode> {
    let tools = state.mcp_client.list_all_tools().await;

    let tools_json: Vec<Value> = tools
        .into_iter()
        .map(|tool| {
            json!({
                "name": tool.prefixed_name,
                "server_tool_name": tool.name,
                "server_name": tool.server_name,
                "description": tool.description,
                "input_schema": tool.input_schema,
            })
        })
        .collect();

    Ok(Json(json!(tools_json)))
}
