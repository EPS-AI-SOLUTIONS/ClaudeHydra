// Jaskier Shared Pattern -- mcp/client
//! Re-exports from `jaskier_core::mcp::client`.
//!
//! ClaudeHydra now uses the shared `McpClientManager` from `jaskier_core`.
//! The shared client provides:
//! - `call_tool(prefixed_name, args)` — resolves server + tool from prefix
//! - `list_all_tools()` → `Vec<McpTool>` with `prefixed_name`, `server_name`, etc.
//! - `connect_server()` / `disconnect_server()` / `startup_connect()`
//!
//! Previously CH had its own `McpClientManager` with a different API:
//! `call_tool(server_id, tool_name, args)`. Callers have been updated to use
//! the prefixed-name API instead.

pub use jaskier_core::mcp::client::*;
