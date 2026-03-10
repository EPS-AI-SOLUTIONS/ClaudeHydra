// Jaskier Shared Pattern -- mcp/config
//! DB CRUD for MCP server configurations (ch_mcp_servers + ch_mcp_discovered_tools).

use axum::Json;
use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::response::IntoResponse;
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use sqlx::PgPool;

// ── SSRF URL validation ──────────────────────────────────────────────────

/// Validate an MCP server URL to prevent SSRF attacks.
///
/// In production (AUTH_SECRET set): blocks localhost, private IPs, cloud metadata,
/// and Fly.io .internal addresses.
/// In dev mode (no AUTH_SECRET): only blocks cloud metadata and .internal addresses.
pub fn validate_mcp_url(url: &str, is_prod: bool) -> Result<(), String> {
    let parsed = url::Url::parse(url).map_err(|e| format!("Invalid MCP server URL: {}", e))?;

    let scheme = parsed.scheme();
    if scheme != "http" && scheme != "https" {
        return Err(format!("Only http/https schemes allowed, got: {}", scheme));
    }

    let host = parsed
        .host_str()
        .ok_or_else(|| "MCP server URL has no host".to_string())?;

    let h = host.to_lowercase();

    // Always block: cloud metadata and Fly.io internal network
    if h == "metadata.google.internal" || h.ends_with(".internal") || h.contains("169.254.169.254")
    {
        return Err(format!(
            "Blocked: MCP URL points to internal/metadata host '{}'",
            host
        ));
    }

    // Block IP literals pointing to link-local (metadata) range — always
    if let Ok(ip) = host.parse::<std::net::IpAddr>()
        && let std::net::IpAddr::V4(v4) = ip
        && v4.octets()[0] == 169
        && v4.octets()[1] == 254
    {
        return Err(format!("Blocked: MCP URL points to link-local IP {}", ip));
    }

    // Production-only: also block localhost and private IPs
    if is_prod {
        if h == "localhost" || h.ends_with(".local") || h.ends_with(".localhost") {
            return Err(format!(
                "Blocked: MCP URL points to local host '{}' (production mode)",
                host
            ));
        }

        if let Ok(ip) = host.parse::<std::net::IpAddr>() {
            match ip {
                std::net::IpAddr::V4(v4) => {
                    if v4.is_loopback()
                        || v4.is_private()
                        || v4.is_link_local()
                        || v4.is_broadcast()
                        || v4.is_unspecified()
                    {
                        return Err(format!(
                            "Blocked: MCP URL points to private/local IP {} (production mode)",
                            ip
                        ));
                    }
                }
                std::net::IpAddr::V6(v6) => {
                    if v6.is_loopback() || v6.is_unspecified() {
                        return Err(format!(
                            "Blocked: MCP URL points to private IP {} (production mode)",
                            ip
                        ));
                    }
                    let seg = v6.segments();
                    // ULA (fc00::/7) and link-local (fe80::/10)
                    if (seg[0] & 0xfe00) == 0xfc00 || (seg[0] & 0xffc0) == 0xfe80 {
                        return Err(format!(
                            "Blocked: MCP URL points to private IP {} (production mode)",
                            ip
                        ));
                    }
                    // IPv4-mapped addresses (::ffff:x.x.x.x)
                    if let Some(v4) = v6.to_ipv4_mapped()
                        && (v4.is_loopback() || v4.is_private() || v4.is_link_local())
                    {
                        return Err(format!(
                            "Blocked: MCP URL resolves to private IPv4-mapped IP {} (production mode)",
                            ip
                        ));
                    }
                }
            }
        }
    }

    Ok(())
}

// ── Models ───────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct McpServerConfig {
    pub id: String,
    pub name: String,
    pub transport: String,
    pub command: Option<String>,
    pub args: String,     // JSON array
    pub env_vars: String, // JSON object
    pub url: Option<String>,
    pub enabled: bool,
    pub auth_token: Option<String>,
    pub timeout_secs: i32,
    pub created_at: chrono::DateTime<chrono::Utc>,
    pub updated_at: chrono::DateTime<chrono::Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct McpDiscoveredTool {
    pub id: String,
    pub server_id: String,
    pub tool_name: String,
    pub description: Option<String>,
    pub input_schema: String, // JSON
    pub discovered_at: chrono::DateTime<chrono::Utc>,
}

#[derive(Debug, Deserialize)]
pub struct CreateMcpServerRequest {
    pub name: String,
    pub transport: String,
    pub command: Option<String>,
    pub args: Option<Vec<String>>,
    pub env_vars: Option<Value>,
    pub url: Option<String>,
    pub enabled: Option<bool>,
    pub auth_token: Option<String>,
    pub timeout_secs: Option<i32>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateMcpServerRequest {
    pub name: Option<String>,
    pub transport: Option<String>,
    pub command: Option<String>,
    pub args: Option<Vec<String>>,
    pub env_vars: Option<Value>,
    pub url: Option<String>,
    pub enabled: Option<bool>,
    pub auth_token: Option<String>,
    pub timeout_secs: Option<i32>,
}

// ── DB helpers (used by handlers and client) ─────────────────────────────

/// Load all MCP server configs from DB.
pub async fn list_all(db: &PgPool) -> Result<Vec<McpServerConfig>, sqlx::Error> {
    sqlx::query_as::<_, McpServerConfig>(
        "SELECT id, name, transport, command, args, env_vars, url, enabled, \
         auth_token, timeout_secs, created_at, updated_at \
         FROM ch_mcp_servers ORDER BY name",
    )
    .fetch_all(db)
    .await
}

/// Load only enabled MCP server configs.
pub async fn list_enabled(db: &PgPool) -> Result<Vec<McpServerConfig>, sqlx::Error> {
    sqlx::query_as::<_, McpServerConfig>(
        "SELECT id, name, transport, command, args, env_vars, url, enabled, \
         auth_token, timeout_secs, created_at, updated_at \
         FROM ch_mcp_servers WHERE enabled = true ORDER BY name",
    )
    .fetch_all(db)
    .await
}

/// Get a single server config by ID.
pub async fn get_by_id(db: &PgPool, id: &str) -> Result<Option<McpServerConfig>, sqlx::Error> {
    sqlx::query_as::<_, McpServerConfig>(
        "SELECT id, name, transport, command, args, env_vars, url, enabled, \
         auth_token, timeout_secs, created_at, updated_at \
         FROM ch_mcp_servers WHERE id = $1",
    )
    .bind(id)
    .fetch_optional(db)
    .await
}

/// Insert a new server config.
pub async fn insert(
    db: &PgPool,
    req: &CreateMcpServerRequest,
) -> Result<McpServerConfig, sqlx::Error> {
    let args_json = serde_json::to_string(&req.args.as_deref().unwrap_or(&[]))
        .unwrap_or_else(|_| "[]".to_string());
    let env_json = req
        .env_vars
        .as_ref()
        .map(|v| v.to_string())
        .unwrap_or_else(|| "{}".to_string());

    sqlx::query_as::<_, McpServerConfig>(
        "INSERT INTO ch_mcp_servers (name, transport, command, args, env_vars, url, enabled, auth_token, timeout_secs) \
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) \
         RETURNING id, name, transport, command, args, env_vars, url, enabled, auth_token, timeout_secs, created_at, updated_at",
    )
    .bind(&req.name)
    .bind(&req.transport)
    .bind(&req.command)
    .bind(&args_json)
    .bind(&env_json)
    .bind(&req.url)
    .bind(req.enabled.unwrap_or(true))
    .bind(&req.auth_token)
    .bind(req.timeout_secs.unwrap_or(30))
    .fetch_one(db)
    .await
}

/// Update a server config by ID (partial update).
pub async fn update(
    db: &PgPool,
    id: &str,
    req: &UpdateMcpServerRequest,
) -> Result<Option<McpServerConfig>, sqlx::Error> {
    // Build dynamic SET clauses — keep it simple with COALESCE approach
    let args_json = req
        .args
        .as_ref()
        .map(|a| serde_json::to_string(a).unwrap_or_else(|_| "[]".to_string()));
    let env_json = req.env_vars.as_ref().map(|v| v.to_string());

    sqlx::query_as::<_, McpServerConfig>(
        "UPDATE ch_mcp_servers SET \
         name = COALESCE($2, name), \
         transport = COALESCE($3, transport), \
         command = COALESCE($4, command), \
         args = COALESCE($5, args), \
         env_vars = COALESCE($6, env_vars), \
         url = COALESCE($7, url), \
         enabled = COALESCE($8, enabled), \
         auth_token = COALESCE($9, auth_token), \
         timeout_secs = COALESCE($10, timeout_secs), \
         updated_at = NOW() \
         WHERE id = $1 \
         RETURNING id, name, transport, command, args, env_vars, url, enabled, auth_token, timeout_secs, created_at, updated_at",
    )
    .bind(id)
    .bind(&req.name)
    .bind(&req.transport)
    .bind(&req.command)
    .bind(&args_json)
    .bind(&env_json)
    .bind(&req.url)
    .bind(req.enabled)
    .bind(&req.auth_token)
    .bind(req.timeout_secs)
    .fetch_optional(db)
    .await
}

/// Delete a server config by ID.
pub async fn delete(db: &PgPool, id: &str) -> Result<bool, sqlx::Error> {
    let result = sqlx::query("DELETE FROM ch_mcp_servers WHERE id = $1")
        .bind(id)
        .execute(db)
        .await?;
    Ok(result.rows_affected() > 0)
}

/// List discovered tools for a given server.
pub async fn list_tools_for_server(
    db: &PgPool,
    server_id: &str,
) -> Result<Vec<McpDiscoveredTool>, sqlx::Error> {
    sqlx::query_as::<_, McpDiscoveredTool>(
        "SELECT id, server_id, tool_name, description, input_schema, discovered_at \
         FROM ch_mcp_discovered_tools WHERE server_id = $1 ORDER BY tool_name",
    )
    .bind(server_id)
    .fetch_all(db)
    .await
}

/// List ALL discovered tools across all enabled servers.
pub async fn list_all_tools(db: &PgPool) -> Result<Vec<(String, McpDiscoveredTool)>, sqlx::Error> {
    // Join to get server name alongside each tool
    let rows = sqlx::query_as::<_, (String, String, String, String, Option<String>, String, chrono::DateTime<chrono::Utc>)>(
        "SELECT s.name, t.id, t.server_id, t.tool_name, t.description, t.input_schema, t.discovered_at \
         FROM ch_mcp_discovered_tools t \
         JOIN ch_mcp_servers s ON s.id = t.server_id \
         WHERE s.enabled = true \
         ORDER BY s.name, t.tool_name",
    )
    .fetch_all(db)
    .await?;

    Ok(rows
        .into_iter()
        .map(
            |(server_name, id, server_id, tool_name, description, input_schema, discovered_at)| {
                (
                    server_name,
                    McpDiscoveredTool {
                        id,
                        server_id,
                        tool_name,
                        description,
                        input_schema,
                        discovered_at,
                    },
                )
            },
        )
        .collect())
}

/// Upsert discovered tools for a server (replaces old ones).
pub async fn upsert_discovered_tools(
    db: &PgPool,
    server_id: &str,
    tools: &[(String, Option<String>, String)], // (name, description, input_schema_json)
) -> Result<(), sqlx::Error> {
    // Delete old tools for this server, then insert new ones
    sqlx::query("DELETE FROM ch_mcp_discovered_tools WHERE server_id = $1")
        .bind(server_id)
        .execute(db)
        .await?;

    for (name, desc, schema) in tools {
        sqlx::query(
            "INSERT INTO ch_mcp_discovered_tools (server_id, tool_name, description, input_schema) \
             VALUES ($1, $2, $3, $4)",
        )
        .bind(server_id)
        .bind(name)
        .bind(desc.as_deref())
        .bind(schema)
        .execute(db)
        .await?;
    }

    Ok(())
}

// ── Security: stdio command allowlist ──────────────────────────────────────

/// Allowed base commands for MCP stdio transport.
/// Only well-known package runners and interpreters are permitted.
const ALLOWED_STDIO_COMMANDS: &[&str] = &[
    "npx",
    "npx.cmd",
    "node",
    "node.exe",
    "python",
    "python.exe",
    "python3",
    "python3.exe",
    "uvx",
    "uvx.exe",
    "uv",
    "uv.exe",
    "deno",
    "deno.exe",
    "bun",
    "bun.exe",
];

/// Environment variables that must not be overridden by MCP server config.
const BLOCKED_ENV_VARS: &[&str] = &[
    "PATH",
    "Path",
    "PATHEXT",
    "LD_PRELOAD",
    "LD_LIBRARY_PATH",
    "DYLD_INSERT_LIBRARIES",
    "COMSPEC",
    "SHELL",
    "HOME",
    "USERPROFILE",
    "SYSTEMROOT",
];

/// Validate stdio transport config: command must be in allowlist,
/// env vars must not contain blocked keys.
fn validate_stdio_config(command: &str, env_vars: Option<&Value>) -> Result<(), String> {
    let base = std::path::Path::new(command)
        .file_name()
        .and_then(|f| f.to_str())
        .unwrap_or(command);

    if !ALLOWED_STDIO_COMMANDS.contains(&base) {
        return Err(format!(
            "Command '{}' not in allowlist. Allowed: npx, node, python, python3, uvx, uv, deno, bun",
            command
        ));
    }

    if let Some(env_val) = env_vars
        && let Some(obj) = env_val.as_object()
    {
        for key in obj.keys() {
            if BLOCKED_ENV_VARS.contains(&key.as_str()) {
                return Err(format!(
                    "Environment variable '{}' is blocked for security reasons",
                    key
                ));
            }
        }
    }

    Ok(())
}

// ── Axum Handlers ────────────────────────────────────────────────────────

use crate::state::AppState;

/// GET /api/mcp/servers — list all MCP server configurations
pub async fn list_servers_handler(
    State(state): State<AppState>,
) -> Result<Json<Value>, StatusCode> {
    let servers = list_all(&state.db).await.map_err(|e| {
        tracing::error!("mcp: list_servers: {}", e);
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    // Redact auth_token in response
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
    // Validate stdio command allowlist and blocked env vars
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

    let tools = state
        .mcp_client
        .connect_server(&config)
        .await
        .map_err(|e| {
            tracing::error!("mcp: connect_server {}: {}", config.name, e);
            StatusCode::BAD_GATEWAY
        })?;

    Ok(Json(json!({
        "server_id": id,
        "server_name": config.name,
        "tools_discovered": tools.len(),
        "tools": tools.iter().map(|t| json!({
            "name": t.name,
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
        .map(|(prefixed_name, tool)| {
            json!({
                "name": prefixed_name,
                "server_tool_name": tool.name,
                "description": tool.description,
                "input_schema": tool.input_schema,
            })
        })
        .collect();

    Ok(Json(json!(tools_json)))
}

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
