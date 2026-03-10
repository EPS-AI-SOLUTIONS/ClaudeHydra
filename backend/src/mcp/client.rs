// Jaskier Shared Pattern -- mcp/client
//! Lightweight JSON-RPC MCP client manager.
//!
//! Supports HTTP transport (Streamable HTTP) and stdio transport (child process).
//! Uses JSON-RPC 2.0 over HTTP POST for HTTP servers, and JSON-RPC over stdin/stdout
//! for stdio servers.

use std::collections::HashMap;
use std::sync::Arc;
use std::time::Duration;

use reqwest::Client;
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use sqlx::PgPool;
use tokio::sync::RwLock;

use super::config::{self, McpServerConfig};

/// Maximum allowed MCP response size (10 MB) to prevent OOM from malicious servers.
const MAX_MCP_RESPONSE_BYTES: usize = 10 * 1024 * 1024;

// ── MCP Tool ─────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct McpTool {
    pub name: String,
    pub description: String,
    pub input_schema: Value,
}

// ── MCP Connection ───────────────────────────────────────────────────────

#[derive(Debug)]
pub struct McpConnection {
    pub server_id: String,
    pub server_name: String,
    pub transport: McpTransport,
    pub tools: Vec<McpTool>,
    pub timeout: Duration,
}

#[derive(Debug)]
pub enum McpTransport {
    Http {
        url: String,
        auth_token: Option<String>,
    },
    Stdio {
        child: Box<tokio::sync::Mutex<tokio::process::Child>>,
        stdin: tokio::sync::Mutex<tokio::process::ChildStdin>,
        stdout: tokio::sync::Mutex<tokio::io::BufReader<tokio::process::ChildStdout>>,
    },
}

// ── McpClientManager ─────────────────────────────────────────────────────

/// Manages connections to external MCP servers.
/// Thread-safe — wrapped in Arc for sharing across handlers.
pub struct McpClientManager {
    connections: RwLock<HashMap<String, Arc<McpConnection>>>,
    db: PgPool,
    client: Client,
}

impl McpClientManager {
    pub fn new(db: PgPool, client: Client) -> Self {
        Self {
            connections: RwLock::new(HashMap::new()),
            db,
            client,
        }
    }

    /// Connect to all enabled MCP servers on startup.
    pub async fn startup_connect(&self) -> Result<(), anyhow::Error> {
        let servers = config::list_enabled(&self.db).await?;
        tracing::info!("mcp: startup_connect — {} enabled servers", servers.len());

        for server in &servers {
            match self.connect_server(server).await {
                Ok(tools) => {
                    tracing::info!(
                        "mcp: connected to '{}' — {} tools discovered",
                        server.name,
                        tools.len()
                    );
                }
                Err(e) => {
                    tracing::error!("mcp: failed to connect to '{}': {}", server.name, e);
                }
            }
        }

        Ok(())
    }

    /// Connect to a single MCP server, perform initialize + tools/list.
    pub async fn connect_server(
        &self,
        config: &McpServerConfig,
    ) -> Result<Vec<McpTool>, anyhow::Error> {
        let timeout = Duration::from_secs(config.timeout_secs.max(5) as u64);

        let (transport, tools) = match config.transport.as_str() {
            "http" => {
                let url = config
                    .url
                    .as_deref()
                    .ok_or_else(|| anyhow::anyhow!("HTTP transport requires url"))?;

                // Defense-in-depth: SSRF validation before making any HTTP request
                let is_prod = std::env::var("AUTH_SECRET")
                    .ok()
                    .filter(|s| !s.is_empty())
                    .is_some();
                if let Err(msg) = super::config::validate_mcp_url(url, is_prod) {
                    return Err(anyhow::anyhow!("SSRF blocked: {}", msg));
                }

                let transport = McpTransport::Http {
                    url: url.to_string(),
                    auth_token: config.auth_token.clone(),
                };

                // Initialize
                self.http_jsonrpc(
                    url,
                    config.auth_token.as_deref(),
                    "initialize",
                    json!({
                        "protocolVersion": "2025-03-26",
                        "capabilities": {},
                        "clientInfo": {
                            "name": "ClaudeHydra-v4",
                            "version": "4.0.0"
                        }
                    }),
                    timeout,
                )
                .await?;

                // Send initialized notification (no id)
                let _ = self
                    .http_jsonrpc_notify(
                        url,
                        config.auth_token.as_deref(),
                        "notifications/initialized",
                        json!({}),
                        timeout,
                    )
                    .await;

                // List tools
                let tools = self
                    .http_list_tools(url, config.auth_token.as_deref(), timeout)
                    .await?;

                (transport, tools)
            }
            "stdio" => {
                let command = config
                    .command
                    .as_deref()
                    .ok_or_else(|| anyhow::anyhow!("stdio transport requires command"))?;

                let args: Vec<String> = serde_json::from_str(&config.args).unwrap_or_default();
                let env_vars: HashMap<String, String> =
                    serde_json::from_str(&config.env_vars).unwrap_or_default();

                let (transport, tools) = self
                    .stdio_connect(command, &args, &env_vars, timeout)
                    .await?;

                (transport, tools)
            }
            other => {
                return Err(anyhow::anyhow!("Unsupported transport: {}", other));
            }
        };

        // Persist discovered tools to DB
        let tool_rows: Vec<(String, Option<String>, String)> = tools
            .iter()
            .map(|t| {
                (
                    t.name.clone(),
                    if t.description.is_empty() {
                        None
                    } else {
                        Some(t.description.clone())
                    },
                    t.input_schema.to_string(),
                )
            })
            .collect();
        if let Err(e) = config::upsert_discovered_tools(&self.db, &config.id, &tool_rows).await {
            tracing::warn!(
                "mcp: failed to persist discovered tools for '{}': {}",
                config.name,
                e
            );
        }

        let conn = Arc::new(McpConnection {
            server_id: config.id.clone(),
            server_name: config.name.clone(),
            transport,
            tools: tools.clone(),
            timeout,
        });

        self.connections
            .write()
            .await
            .insert(config.id.clone(), conn);

        Ok(tools)
    }

    /// Disconnect from a server by ID.
    pub async fn disconnect_server(&self, server_id: &str) {
        if let Some(conn) = self.connections.write().await.remove(server_id) {
            tracing::info!("mcp: disconnected from '{}'", conn.server_name);
            // For stdio, kill the child process
            if let McpTransport::Stdio { child, .. } = &conn.transport
                && let Ok(c) = child.lock().await.try_wait()
            {
                // already exited
                let _ = c;
            }
            // Best-effort: the child is behind an Arc, so it will be dropped when
            // all references are gone. tokio::process::Child::drop kills the child.
        }
    }

    /// Call a tool on a connected MCP server.
    pub async fn call_tool(
        &self,
        server_id: &str,
        tool_name: &str,
        arguments: &Value,
    ) -> Result<String, String> {
        let connections = self.connections.read().await;
        let conn = connections
            .get(server_id)
            .ok_or_else(|| format!("MCP server '{}' not connected", server_id))?
            .clone();
        drop(connections);

        match &conn.transport {
            McpTransport::Http { url, auth_token } => {
                let result = self
                    .http_jsonrpc(
                        url,
                        auth_token.as_deref(),
                        "tools/call",
                        json!({
                            "name": tool_name,
                            "arguments": arguments,
                        }),
                        conn.timeout,
                    )
                    .await
                    .map_err(|e| format!("MCP tools/call failed: {}", e))?;

                // Extract text content from result
                extract_tool_result(&result)
            }
            McpTransport::Stdio { stdin, stdout, .. } => {
                self.stdio_call_tool(stdin, stdout, tool_name, arguments, conn.timeout)
                    .await
            }
        }
    }

    /// List all tools across all connected servers, with `mcp_{server}_{tool}` prefix.
    pub async fn list_all_tools(&self) -> Vec<(String, McpTool)> {
        let connections = self.connections.read().await;
        let mut result = Vec::new();

        for conn in connections.values() {
            let server_slug = slug(&conn.server_name);
            for tool in &conn.tools {
                let prefixed = format!("mcp_{}_{}", server_slug, tool.name);
                result.push((prefixed, tool.clone()));
            }
        }

        result
    }

    /// Find which server owns a prefixed tool name, returning (server_id, original_tool_name).
    pub async fn resolve_tool(&self, prefixed_name: &str) -> Option<(String, String)> {
        let connections = self.connections.read().await;
        for conn in connections.values() {
            let server_slug = slug(&conn.server_name);
            let prefix = format!("mcp_{}_", server_slug);
            if let Some(tool_name) = prefixed_name.strip_prefix(&prefix) {
                // Verify the tool actually exists on this server
                if conn.tools.iter().any(|t| t.name == tool_name) {
                    return Some((conn.server_id.clone(), tool_name.to_string()));
                }
            }
        }
        None
    }

    /// Check if any MCP servers are connected.
    pub async fn has_connections(&self) -> bool {
        !self.connections.read().await.is_empty()
    }

    // ── HTTP JSON-RPC helpers ────────────────────────────────────────────

    async fn http_jsonrpc(
        &self,
        url: &str,
        auth_token: Option<&str>,
        method: &str,
        params: Value,
        timeout: Duration,
    ) -> Result<Value, anyhow::Error> {
        let id = uuid::Uuid::new_v4().to_string();
        let body = json!({
            "jsonrpc": "2.0",
            "id": id,
            "method": method,
            "params": params,
        });

        let mut req = self
            .client
            .post(url)
            .header("Content-Type", "application/json")
            .timeout(timeout)
            .json(&body);

        if let Some(token) = auth_token {
            req = req.header("Authorization", format!("Bearer {}", token));
        }

        let resp = req.send().await?;
        let status = resp.status();

        // Guard against OOM from oversized responses
        if let Some(len) = resp.content_length()
            && len > MAX_MCP_RESPONSE_BYTES as u64
        {
            return Err(anyhow::anyhow!("MCP response too large: {} bytes", len));
        }
        let bytes = resp.bytes().await?;
        if bytes.len() > MAX_MCP_RESPONSE_BYTES {
            return Err(anyhow::anyhow!(
                "MCP response too large: {} bytes",
                bytes.len()
            ));
        }
        let text = String::from_utf8_lossy(&bytes);

        if !status.is_success() {
            return Err(anyhow::anyhow!(
                "MCP JSON-RPC {} returned HTTP {}: {}",
                method,
                status.as_u16(),
                truncate(&text, 500)
            ));
        }

        let parsed: Value = serde_json::from_str(&text).map_err(|e| {
            anyhow::anyhow!(
                "MCP JSON-RPC parse error: {} — body: {}",
                e,
                truncate(&text, 200)
            )
        })?;

        if let Some(error) = parsed.get("error") {
            return Err(anyhow::anyhow!("MCP JSON-RPC error: {}", error));
        }

        Ok(parsed.get("result").cloned().unwrap_or(json!(null)))
    }

    /// Send a JSON-RPC notification (no id, no response expected).
    async fn http_jsonrpc_notify(
        &self,
        url: &str,
        auth_token: Option<&str>,
        method: &str,
        params: Value,
        timeout: Duration,
    ) -> Result<(), anyhow::Error> {
        let body = json!({
            "jsonrpc": "2.0",
            "method": method,
            "params": params,
        });

        let mut req = self
            .client
            .post(url)
            .header("Content-Type", "application/json")
            .timeout(timeout)
            .json(&body);

        if let Some(token) = auth_token {
            req = req.header("Authorization", format!("Bearer {}", token));
        }

        let _ = req.send().await?;
        Ok(())
    }

    async fn http_list_tools(
        &self,
        url: &str,
        auth_token: Option<&str>,
        timeout: Duration,
    ) -> Result<Vec<McpTool>, anyhow::Error> {
        let result = self
            .http_jsonrpc(url, auth_token, "tools/list", json!({}), timeout)
            .await?;

        parse_tools_list(&result)
    }

    // ── Stdio transport helpers ──────────────────────────────────────────

    async fn stdio_connect(
        &self,
        command: &str,
        args: &[String],
        env_vars: &HashMap<String, String>,
        timeout: Duration,
    ) -> Result<(McpTransport, Vec<McpTool>), anyhow::Error> {
        use tokio::io::{AsyncWriteExt, BufReader};
        use tokio::process::Command;

        let mut cmd = Command::new(command);
        cmd.args(args)
            .envs(env_vars)
            .stdin(std::process::Stdio::piped())
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped());

        let mut child = cmd.spawn().map_err(|e| {
            anyhow::anyhow!("Failed to spawn MCP stdio server '{}': {}", command, e)
        })?;

        let stdin = child
            .stdin
            .take()
            .ok_or_else(|| anyhow::anyhow!("Failed to capture stdin"))?;
        let stdout = child
            .stdout
            .take()
            .ok_or_else(|| anyhow::anyhow!("Failed to capture stdout"))?;

        let stdin_mutex = tokio::sync::Mutex::new(stdin);
        let stdout_mutex = tokio::sync::Mutex::new(BufReader::new(stdout));

        // Initialize
        let init_result = self
            .stdio_request(
                &stdin_mutex,
                &stdout_mutex,
                "initialize",
                json!({
                    "protocolVersion": "2025-03-26",
                    "capabilities": {},
                    "clientInfo": {
                        "name": "ClaudeHydra-v4",
                        "version": "4.0.0"
                    }
                }),
                timeout,
            )
            .await?;

        tracing::debug!("mcp stdio initialize result: {:?}", init_result);

        // Send initialized notification
        {
            let notif = json!({
                "jsonrpc": "2.0",
                "method": "notifications/initialized",
                "params": {}
            });
            let mut line = serde_json::to_string(&notif).unwrap_or_default();
            line.push('\n');
            let mut guard = stdin_mutex.lock().await;
            guard.write_all(line.as_bytes()).await?;
            guard.flush().await?;
        }

        // List tools
        let tools_result = self
            .stdio_request(
                &stdin_mutex,
                &stdout_mutex,
                "tools/list",
                json!({}),
                timeout,
            )
            .await?;

        let tools = parse_tools_list(&tools_result)?;

        let transport = McpTransport::Stdio {
            child: Box::new(tokio::sync::Mutex::new(child)),
            stdin: stdin_mutex,
            stdout: stdout_mutex,
        };

        Ok((transport, tools))
    }

    async fn stdio_request(
        &self,
        stdin: &tokio::sync::Mutex<tokio::process::ChildStdin>,
        stdout: &tokio::sync::Mutex<tokio::io::BufReader<tokio::process::ChildStdout>>,
        method: &str,
        params: Value,
        timeout: Duration,
    ) -> Result<Value, anyhow::Error> {
        use tokio::io::{AsyncBufReadExt, AsyncWriteExt};

        let id = uuid::Uuid::new_v4().to_string();
        let request = json!({
            "jsonrpc": "2.0",
            "id": &id,
            "method": method,
            "params": params,
        });

        let mut line = serde_json::to_string(&request)?;
        line.push('\n');

        // Write request
        {
            let mut guard = stdin.lock().await;
            guard.write_all(line.as_bytes()).await?;
            guard.flush().await?;
        }

        // Read response (line-delimited JSON-RPC)
        let response = tokio::time::timeout(timeout, async {
            let mut guard = stdout.lock().await;
            loop {
                let mut buf = String::new();
                let n = guard.read_line(&mut buf).await?;
                if n == 0 {
                    return Err(anyhow::anyhow!("MCP stdio: EOF while reading response"));
                }
                if buf.len() > MAX_MCP_RESPONSE_BYTES {
                    return Err(anyhow::anyhow!("MCP stdio response too large"));
                }
                let buf = buf.trim();
                if buf.is_empty() {
                    continue;
                }
                let parsed: Value = serde_json::from_str(buf)?;
                // Match by id (skip notifications)
                if parsed.get("id").and_then(|v| v.as_str()) == Some(&id) {
                    if let Some(error) = parsed.get("error") {
                        return Err(anyhow::anyhow!("MCP JSON-RPC error: {}", error));
                    }
                    return Ok(parsed.get("result").cloned().unwrap_or(json!(null)));
                }
                // else: notification or mismatched id, skip
            }
        })
        .await
        .map_err(|_| {
            anyhow::anyhow!("MCP stdio: timeout waiting for response to '{}'", method)
        })??;

        Ok(response)
    }

    async fn stdio_call_tool(
        &self,
        stdin: &tokio::sync::Mutex<tokio::process::ChildStdin>,
        stdout: &tokio::sync::Mutex<tokio::io::BufReader<tokio::process::ChildStdout>>,
        tool_name: &str,
        arguments: &Value,
        timeout: Duration,
    ) -> Result<String, String> {
        let result = self
            .stdio_request(
                stdin,
                stdout,
                "tools/call",
                json!({
                    "name": tool_name,
                    "arguments": arguments,
                }),
                timeout,
            )
            .await
            .map_err(|e| format!("MCP stdio tools/call failed: {}", e))?;

        extract_tool_result(&result)
    }
}

// ── Helpers ──────────────────────────────────────────────────────────────

/// Check if a tool name from an MCP server contains only safe characters.
fn is_valid_tool_name(name: &str) -> bool {
    !name.is_empty()
        && name.len() <= 128
        && name
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-')
}

/// Parse tools/list result into Vec<McpTool>.
fn parse_tools_list(result: &Value) -> Result<Vec<McpTool>, anyhow::Error> {
    let tools_array = result
        .get("tools")
        .and_then(|v| v.as_array())
        .cloned()
        .unwrap_or_default();

    let mut tools = Vec::new();
    for t in tools_array {
        let name = t
            .get("name")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();
        let description = t
            .get("description")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();
        let input_schema = t
            .get("inputSchema")
            .cloned()
            .unwrap_or(json!({"type": "object", "properties": {}}));

        if !is_valid_tool_name(&name) {
            tracing::warn!(
                "MCP: skipping tool with invalid name '{}'",
                truncate(&name, 128)
            );
            continue;
        }

        tools.push(McpTool {
            name,
            description,
            input_schema,
        });
    }

    Ok(tools)
}

/// Extract text content from a tools/call result.
fn extract_tool_result(result: &Value) -> Result<String, String> {
    // MCP tools/call returns { content: [{ type: "text", text: "..." }, ...], isError?: bool }
    let is_error = result
        .get("isError")
        .and_then(|v| v.as_bool())
        .unwrap_or(false);

    let content = result
        .get("content")
        .and_then(|v| v.as_array())
        .cloned()
        .unwrap_or_default();

    let mut text_parts: Vec<String> = Vec::new();
    for part in &content {
        let part_type = part.get("type").and_then(|v| v.as_str()).unwrap_or("");
        match part_type {
            "text" => {
                if let Some(text) = part.get("text").and_then(|v| v.as_str()) {
                    text_parts.push(text.to_string());
                }
            }
            "image" | "resource" => {
                // For non-text content, include a marker
                text_parts.push(format!("[{} content]", part_type));
            }
            _ => {}
        }
    }

    let combined = if text_parts.is_empty() {
        // Fallback: serialize the whole result
        serde_json::to_string_pretty(result).unwrap_or_else(|_| "{}".to_string())
    } else {
        text_parts.join("\n")
    };

    if is_error {
        Err(combined)
    } else {
        Ok(combined)
    }
}

/// Convert a server name to a safe slug for tool prefixing.
fn slug(name: &str) -> String {
    name.chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() {
                c.to_ascii_lowercase()
            } else {
                '_'
            }
        })
        .collect::<String>()
        .trim_matches('_')
        .to_string()
}

/// Truncate a string for error messages.
fn truncate(s: &str, max: usize) -> String {
    if s.len() <= max {
        s.to_string()
    } else {
        let end: String = s
            .char_indices()
            .take_while(|(i, _)| *i < max)
            .map(|(_, c)| c)
            .collect();
        format!("{}...", end)
    }
}
