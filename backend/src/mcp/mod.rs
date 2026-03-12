// Jaskier Shared Pattern -- mcp
//! MCP (Model Context Protocol) support — client, config, and server.
//!
//! ## Architecture (ClaudeHydra)
//!
//! - **client**: Re-exports `jaskier_core::mcp::client::*` — shared `McpClientManager` with
//!   `call_tool(prefixed_name, args)` API used by `tools/mod.rs` and `handlers/streaming.rs`.
//! - **config**: Shared types + DB functions from `jaskier_core::mcp::config`, with local
//!   HTTP handlers that match ClaudeHydra's API contract (bare `Json<Value>` returns).
//! - **server**: Local implementation — uses ClaudeHydra's `ToolExecutor` pattern instead of
//!   the shared `HasMcpServerState` trait (which targets the Quad Hydras).

pub mod client;
pub mod config;
pub mod server;
