pub mod fly_tools;
pub mod fs_tools;
pub mod github_tools;
pub mod git_tools;
pub mod image_tools;
pub mod pdf_tools;
pub mod vercel_tools;
pub mod web;
pub mod zip_tools;

use std::collections::HashMap;
use std::path::PathBuf;

use serde_json::{json, Value};

use crate::models::ToolDefinition;
use crate::state::AppState;

// ── Constants ───────────────────────────────────────────────────────────

const MAX_READ_BYTES: u64 = 10 * 1024 * 1024; // 10 MB
const MAX_WRITE_BYTES: usize = 1024 * 1024; // 1 MB
const DEFAULT_MAX_LINES: usize = 500;
const DEFAULT_MAX_DEPTH: usize = 3;
const DEFAULT_MAX_RESULTS: usize = 50;

/// Extensions that are never writable.
const BLOCKED_WRITE_EXTENSIONS: &[&str] = &[
    "env", "key", "pem", "exe", "dll", "so", "dylib", "bat", "cmd", "ps1",
];

/// Backup / temporary extensions blocked for read and write (#6 path traversal hardening).
const BLOCKED_BACKUP_EXTENSIONS: &[&str] = &["bak", "old", "orig", "swp"];

/// System paths that must never be written to (prefix match on canonical path).
#[cfg(windows)]
const BLOCKED_WRITE_PREFIXES: &[&str] = &[
    "C:\\Windows",
    "C:\\Program Files",
    "C:\\Program Files (x86)",
    "C:\\ProgramData",
];
#[cfg(not(windows))]
const BLOCKED_WRITE_PREFIXES: &[&str] = &["/etc", "/usr", "/bin", "/sbin", "/var", "/boot", "/proc", "/sys"];

// ── ToolExecutor ────────────────────────────────────────────────────────

#[derive(Debug, Clone)]
pub struct ToolExecutor {
    allowed_dirs: Vec<PathBuf>,
    pub http_client: reqwest::Client,
    pub api_keys: HashMap<String, String>,
}

impl Default for ToolExecutor {
    fn default() -> Self {
        Self::new(reqwest::Client::new(), HashMap::new())
    }
}

impl ToolExecutor {
    pub fn new(http_client: reqwest::Client, api_keys: HashMap<String, String>) -> Self {
        let dirs_str =
            std::env::var("ALLOWED_FILE_DIRS").unwrap_or_else(|_| {
                dirs::desktop_dir()
                    .unwrap_or_else(|| PathBuf::from("."))
                    .to_string_lossy()
                    .to_string()
            });

        let allowed_dirs: Vec<PathBuf> = dirs_str
            .split(';')
            .filter(|s| !s.is_empty())
            .map(|s| PathBuf::from(s.trim()))
            .collect();

        tracing::info!("ToolExecutor: allowed_dirs = {:?}", allowed_dirs);

        Self {
            allowed_dirs,
            http_client,
            api_keys,
        }
    }

    /// Create a clone with working_directory prepended to allowed_dirs.
    /// Relative paths will resolve against the working_directory (first entry in allowed_dirs).
    /// If working_directory is empty, returns self unchanged.
    pub fn with_working_directory(&self, working_directory: &str) -> Self {
        if working_directory.is_empty() {
            return self.clone();
        }
        let mut dirs = vec![PathBuf::from(working_directory)];
        dirs.extend(self.allowed_dirs.iter().cloned());
        Self {
            allowed_dirs: dirs,
            http_client: self.http_client.clone(),
            api_keys: self.api_keys.clone(),
        }
    }

    /// Return tool definitions for the Anthropic API (includes GitHub, Vercel, Fly.io tools).
    pub fn tool_definitions(&self) -> Vec<ToolDefinition> {
        let mut defs = vec![
            ToolDefinition {
                name: "read_file".to_string(),
                description: "Read the contents of a file at the given path. \
                    Returns the text content (truncated if exceeding max_lines)."
                    .to_string(),
                input_schema: json!({
                    "type": "object",
                    "properties": {
                        "path": {
                            "type": "string",
                            "description": "Absolute or relative path to the file"
                        },
                        "max_lines": {
                            "type": "integer",
                            "description": "Maximum number of lines to return (default 500)"
                        }
                    },
                    "required": ["path"]
                }),
            },
            ToolDefinition {
                name: "list_directory".to_string(),
                description: "List files and directories at the given path. \
                    Returns names, types (file/dir), and sizes."
                    .to_string(),
                input_schema: json!({
                    "type": "object",
                    "properties": {
                        "path": {
                            "type": "string",
                            "description": "Absolute or relative path to list"
                        },
                        "recursive": {
                            "type": "boolean",
                            "description": "Whether to list recursively (default false)"
                        },
                        "max_depth": {
                            "type": "integer",
                            "description": "Max recursion depth (default 3)"
                        }
                    },
                    "required": ["path"]
                }),
            },
            ToolDefinition {
                name: "write_file".to_string(),
                description: "Write content to a file. Creates the file if it \
                    doesn't exist. Creates a .bak backup if the file already exists."
                    .to_string(),
                input_schema: json!({
                    "type": "object",
                    "properties": {
                        "path": {
                            "type": "string",
                            "description": "Absolute or relative path to write"
                        },
                        "content": {
                            "type": "string",
                            "description": "Content to write to the file"
                        },
                        "create_dirs": {
                            "type": "boolean",
                            "description": "Create parent directories if needed (default false)"
                        }
                    },
                    "required": ["path", "content"]
                }),
            },
            ToolDefinition {
                name: "search_in_files".to_string(),
                description: "Search for a regex pattern in files under a \
                    directory. Returns matching lines with file paths and \
                    line numbers."
                    .to_string(),
                input_schema: json!({
                    "type": "object",
                    "properties": {
                        "path": {
                            "type": "string",
                            "description": "Directory to search in"
                        },
                        "pattern": {
                            "type": "string",
                            "description": "Regex pattern to search for"
                        },
                        "file_glob": {
                            "type": "string",
                            "description": "File glob filter, e.g. '*.ts' (default: all files)"
                        },
                        "max_results": {
                            "type": "integer",
                            "description": "Maximum number of matching lines to return (default 50)"
                        }
                    },
                    "required": ["path", "pattern"]
                }),
            },
            ToolDefinition {
                name: "read_pdf".to_string(),
                description: "Extract text content from a PDF file. Returns the extracted text, \
                    optionally filtered to specific pages.".to_string(),
                input_schema: json!({
                    "type": "object",
                    "properties": {
                        "path": {
                            "type": "string",
                            "description": "Path to the PDF file"
                        },
                        "page_range": {
                            "type": "string",
                            "description": "Optional page range like '1-5' or '3' (1-indexed)"
                        }
                    },
                    "required": ["path"]
                }),
            },
            ToolDefinition {
                name: "list_zip".to_string(),
                description: "List the contents of a ZIP archive. Shows file names, sizes, \
                    and compressed sizes.".to_string(),
                input_schema: json!({
                    "type": "object",
                    "properties": {
                        "path": {
                            "type": "string",
                            "description": "Path to the ZIP file"
                        }
                    },
                    "required": ["path"]
                }),
            },
            ToolDefinition {
                name: "extract_zip_file".to_string(),
                description: "Extract and read a single file from a ZIP archive. Returns text \
                    content or hex preview for binary files.".to_string(),
                input_schema: json!({
                    "type": "object",
                    "properties": {
                        "path": {
                            "type": "string",
                            "description": "Path to the ZIP archive"
                        },
                        "file_path": {
                            "type": "string",
                            "description": "Path of the file within the ZIP archive to extract"
                        }
                    },
                    "required": ["path", "file_path"]
                }),
            },
            ToolDefinition {
                name: "analyze_image".to_string(),
                description: "Analyze an image file using AI vision. Describes contents, text, \
                    objects, colors, and notable features. Supports PNG, JPEG, WebP, GIF. \
                    Set extract_text=true to perform OCR (extract text from the image).".to_string(),
                input_schema: json!({
                    "type": "object",
                    "properties": {
                        "path": {
                            "type": "string",
                            "description": "Path to the image file"
                        },
                        "prompt": {
                            "type": "string",
                            "description": "Optional custom analysis prompt (default: detailed description)"
                        },
                        "extract_text": {
                            "type": "boolean",
                            "description": "When true, extract text (OCR) from the image instead of describing it"
                        }
                    },
                    "required": ["path"]
                }),
            },
            ToolDefinition {
                name: "ocr_document".to_string(),
                description: "Extract text from an image or PDF using AI Vision OCR. Returns text \
                    with preserved formatting: tables as markdown (| pipes + --- separators), \
                    headers, lists, paragraphs. Ideal for invoices, reports, forms, tables, \
                    receipts, scanned documents. Supports PNG, JPEG, WebP, GIF, PDF (max 22 MB)."
                    .to_string(),
                input_schema: json!({
                    "type": "object",
                    "properties": {
                        "path": {
                            "type": "string",
                            "description": "Path to the image or PDF file"
                        }
                    },
                    "required": ["path"]
                }),
            },
            ToolDefinition {
                name: "generate_image".to_string(),
                description: "Generate or edit an image using AI (Gemini via browser proxy). Provide a source image \
                    and a text prompt describing the desired changes. The result is saved next to the original file \
                    as {name}_generated.png. Requires BROWSER_PROXY_URL to be set. Supports PNG, JPEG, WebP (max 20 MB)."
                    .to_string(),
                input_schema: json!({
                    "type": "object",
                    "properties": {
                        "image_path": {
                            "type": "string",
                            "description": "Absolute or relative path to the source image file (PNG, JPEG, WebP)"
                        },
                        "prompt": {
                            "type": "string",
                            "description": "Text prompt describing what to generate or how to edit the image. Be specific and detailed."
                        }
                    },
                    "required": ["image_path", "prompt"]
                }),
            },
            ToolDefinition {
                name: "git_status".to_string(),
                description: "Show the working tree status of a git repository.".to_string(),
                input_schema: json!({
                    "type": "object",
                    "properties": {
                        "repo_path": {
                            "type": "string",
                            "description": "Path to the git repository"
                        }
                    },
                    "required": ["repo_path"]
                }),
            },
            ToolDefinition {
                name: "git_log".to_string(),
                description: "Show commit history of a git repository.".to_string(),
                input_schema: json!({
                    "type": "object",
                    "properties": {
                        "repo_path": {
                            "type": "string",
                            "description": "Path to the git repository"
                        },
                        "count": {
                            "type": "integer",
                            "description": "Number of commits to show (default 20, max 50)"
                        }
                    },
                    "required": ["repo_path"]
                }),
            },
            ToolDefinition {
                name: "git_diff".to_string(),
                description: "Show changes in a git repository. Use target='staged' for staged \
                    changes, or a commit hash/branch name.".to_string(),
                input_schema: json!({
                    "type": "object",
                    "properties": {
                        "repo_path": {
                            "type": "string",
                            "description": "Path to the git repository"
                        },
                        "target": {
                            "type": "string",
                            "description": "What to diff: 'staged', '--stat', commit hash, or branch name (default: working tree --stat)"
                        }
                    },
                    "required": ["repo_path"]
                }),
            },
            ToolDefinition {
                name: "git_branch".to_string(),
                description: "List, create, or switch git branches. Actions: 'list' (default), \
                    'create:branch-name', 'switch:branch-name'.".to_string(),
                input_schema: json!({
                    "type": "object",
                    "properties": {
                        "repo_path": {
                            "type": "string",
                            "description": "Path to the git repository"
                        },
                        "action": {
                            "type": "string",
                            "description": "Branch action: 'list', 'create:name', or 'switch:name'"
                        }
                    },
                    "required": ["repo_path"]
                }),
            },
            ToolDefinition {
                name: "git_commit".to_string(),
                description: "Stage files and create a git commit. Does NOT push. Use files='all' \
                    to stage everything, or comma-separated paths.".to_string(),
                input_schema: json!({
                    "type": "object",
                    "properties": {
                        "repo_path": {
                            "type": "string",
                            "description": "Path to the git repository"
                        },
                        "message": {
                            "type": "string",
                            "description": "Commit message"
                        },
                        "files": {
                            "type": "string",
                            "description": "Files to stage: 'all' for everything, or comma-separated paths. If omitted, commits already-staged files."
                        }
                    },
                    "required": ["repo_path", "message"]
                }),
            },
            ToolDefinition {
                name: "call_agent".to_string(),
                description: "Delegate a subtask to another Witcher agent. The target agent has full tool access \
                    and uses the appropriate Claude model for its tier (Commander→Opus, Coordinator→Sonnet, \
                    Executor→Haiku). Use when the task requires specialized expertise. Max 3 delegation levels."
                    .to_string(),
                input_schema: json!({
                    "type": "object",
                    "properties": {
                        "agent_name": {
                            "type": "string",
                            "description": "Target agent name (lowercase): geralt, yennefer, vesemir, triss, jaskier, ciri, dijkstra, lambert, eskel, regis, zoltan, philippa"
                        },
                        "task": {
                            "type": "string",
                            "description": "The subtask to delegate. Be specific about what you need and provide context."
                        }
                    },
                    "required": ["agent_name", "task"]
                }),
            },
        ];

        // Append GitHub, Vercel, Fly.io, and Web tool definitions
        defs.extend(github_tools::tool_definitions());
        defs.extend(vercel_tools::tool_definitions());
        defs.extend(fly_tools::tool_definitions());
        defs.extend(web::tool_definitions());

        defs
    }

    /// Execute a tool by name with AppState access (for tools that need DB).
    /// Falls back to `execute()` for tools that don't need state.
    pub async fn execute_with_state(
        &self,
        tool_name: &str,
        input: &Value,
        state: &AppState,
    ) -> (String, bool) {
        // MCP tools — delegated to external MCP servers
        if tool_name.starts_with("mcp_") {
            return self.execute_mcp_tool(tool_name, input, state).await;
        }
        // GitHub tools
        if tool_name.starts_with("github_") {
            return github_tools::execute(tool_name, input, state).await;
        }
        // Vercel tools
        if tool_name.starts_with("vercel_") {
            return vercel_tools::execute(tool_name, input, state).await;
        }
        // Fly.io tools
        if tool_name.starts_with("fly_") {
            return fly_tools::execute(tool_name, input, state).await;
        }
        // read_pdf — needs AppState for OCR fallback
        if tool_name == "read_pdf" {
            let path = input.get("path").and_then(|v| v.as_str()).unwrap_or("");
            let page_range = input.get("page_range").and_then(|v| v.as_str());
            return match pdf_tools::tool_read_pdf(path, page_range, Some(state)).await {
                Ok(text) => (text, false),
                Err(e) => (e, true),
            };
        }
        // ocr_document — dedicated OCR with markdown table preservation
        if tool_name == "ocr_document" {
            let path = input.get("path").and_then(|v| v.as_str()).unwrap_or("");
            return match ocr_document(path, state).await {
                Ok(text) => (text, false),
                Err(e) => (e, true),
            };
        }
        // analyze_image — needs extract_text parameter
        if tool_name == "analyze_image" {
            let path = input.get("path").and_then(|v| v.as_str()).unwrap_or("");
            let prompt = input.get("prompt").and_then(|v| v.as_str());
            let extract_text = input.get("extract_text").and_then(|v| v.as_bool());
            return match image_tools::tool_analyze_image(path, prompt, extract_text, &self.http_client, &self.api_keys).await {
                Ok(result) => result,
                Err(e) => (e, true),
            };
        }
        // Web tools — fetching and crawling web pages
        if tool_name == "fetch_webpage" || tool_name == "crawl_website" {
            return web::execute(tool_name, input, state).await;
        }
        // Image generation via browser proxy
        if tool_name == "generate_image" {
            let image_path = input.get("image_path").and_then(|v| v.as_str()).unwrap_or("");
            let prompt = input.get("prompt").and_then(|v| v.as_str()).unwrap_or("");
            return match tool_generate_image(image_path, prompt, &self.http_client).await {
                Ok(text) => (text, false),
                Err(e) => (e, true),
            };
        }
        // Fall back to existing execute for local tools
        self.execute(tool_name, input).await
    }

    /// Dispatch an MCP-prefixed tool call to the appropriate MCP server.
    async fn execute_mcp_tool(
        &self,
        prefixed_name: &str,
        input: &Value,
        state: &AppState,
    ) -> (String, bool) {
        let resolved = state.mcp_client.resolve_tool(prefixed_name).await;
        match resolved {
            Some((server_id, tool_name)) => {
                match state.mcp_client.call_tool(&server_id, &tool_name, input).await {
                    Ok(result) => (result, false),
                    Err(e) => (e, true),
                }
            }
            None => (
                format!("MCP tool '{}' not found on any connected server", prefixed_name),
                true,
            ),
        }
    }

    /// Return tool definitions including MCP tools (for Anthropic API tool_use).
    /// This is async because it needs to read from the MCP client manager.
    pub async fn tool_definitions_with_mcp(&self, state: &AppState) -> Vec<ToolDefinition> {
        let mut defs = self.tool_definitions();

        // Append MCP tools from connected servers
        let mcp_tools = state.mcp_client.list_all_tools().await;
        for (prefixed_name, tool) in mcp_tools {
            defs.push(ToolDefinition {
                name: prefixed_name,
                description: tool.description,
                input_schema: tool.input_schema,
            });
        }

        defs
    }

    /// Execute a tool by name, returning `(result_text, is_error)`.
    pub async fn execute(&self, tool_name: &str, input: &Value) -> (String, bool) {
        match tool_name {
            "read_file" => fs_tools::exec_read_file(input, &self.allowed_dirs).await,
            "list_directory" => fs_tools::exec_list_directory(input, &self.allowed_dirs).await,
            "write_file" => fs_tools::exec_write_file(input, &self.allowed_dirs).await,
            "search_in_files" => fs_tools::exec_search_in_files(input, &self.allowed_dirs).await,
            "read_pdf" => {
                let path = input.get("path").and_then(|v| v.as_str()).unwrap_or("");
                let page_range = input.get("page_range").and_then(|v| v.as_str());
                // No state available — OCR fallback disabled
                match pdf_tools::tool_read_pdf(path, page_range, None).await {
                    Ok(text) => (text, false),
                    Err(e) => (e, true),
                }
            }
            "list_zip" => {
                match zip_tools::tool_list_zip(input.get("path").and_then(|v| v.as_str()).unwrap_or("")).await {
                    Ok(text) => (text, false),
                    Err(e) => (e, true),
                }
            }
            "extract_zip_file" => {
                let path = input.get("path").and_then(|v| v.as_str()).unwrap_or("");
                let file_path = input.get("file_path").and_then(|v| v.as_str()).unwrap_or("");
                match zip_tools::tool_extract_zip_file(path, file_path).await {
                    Ok(text) => (text, false),
                    Err(e) => (e, true),
                }
            }
            "analyze_image" => {
                let path = input.get("path").and_then(|v| v.as_str()).unwrap_or("");
                let prompt = input.get("prompt").and_then(|v| v.as_str());
                // No state — extract_text defaults to None (description mode)
                match image_tools::tool_analyze_image(path, prompt, None, &self.http_client, &self.api_keys).await {
                    Ok(result) => result,
                    Err(e) => (e, true),
                }
            }
            "git_status" => {
                let repo = input.get("repo_path").and_then(|v| v.as_str()).unwrap_or(".");
                match git_tools::tool_git_status(repo).await {
                    Ok(text) => (text, false),
                    Err(e) => (e, true),
                }
            }
            "git_log" => {
                let repo = input.get("repo_path").and_then(|v| v.as_str()).unwrap_or(".");
                let count = input.get("count").and_then(|v| v.as_u64()).map(|n| n as u32);
                match git_tools::tool_git_log(repo, count).await {
                    Ok(text) => (text, false),
                    Err(e) => (e, true),
                }
            }
            "git_diff" => {
                let repo = input.get("repo_path").and_then(|v| v.as_str()).unwrap_or(".");
                let target = input.get("target").and_then(|v| v.as_str());
                match git_tools::tool_git_diff(repo, target).await {
                    Ok(text) => (text, false),
                    Err(e) => (e, true),
                }
            }
            "git_branch" => {
                let repo = input.get("repo_path").and_then(|v| v.as_str()).unwrap_or(".");
                let action = input.get("action").and_then(|v| v.as_str());
                match git_tools::tool_git_branch(repo, action).await {
                    Ok(text) => (text, false),
                    Err(e) => (e, true),
                }
            }
            "git_commit" => {
                let repo = input.get("repo_path").and_then(|v| v.as_str()).unwrap_or(".");
                let message = input.get("message").and_then(|v| v.as_str()).unwrap_or("");
                let files = input.get("files").and_then(|v| v.as_str());
                match git_tools::tool_git_commit(repo, message, files).await {
                    Ok(text) => (text, false),
                    Err(e) => (e, true),
                }
            }
            _ => (format!("Unknown tool: {}", tool_name), true),
        }
    }
}

// ── OCR Document tool ─────────────────────────────────────────────────────

const OCR_DOCUMENT_EXTENSIONS: &[&str] = &["png", "jpg", "jpeg", "webp", "gif", "pdf"];

async fn ocr_document(path: &str, state: &AppState) -> Result<String, String> {
    let file_path = std::path::Path::new(path);

    if !file_path.exists() {
        return Err(format!("File not found: {}", path));
    }

    let ext = file_path
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_lowercase())
        .unwrap_or_default();

    if !OCR_DOCUMENT_EXTENSIONS.contains(&ext.as_str()) {
        return Err(format!(
            "Unsupported file type: .{}. Supported: {:?}",
            ext, OCR_DOCUMENT_EXTENSIONS
        ));
    }

    let metadata = tokio::fs::metadata(file_path)
        .await
        .map_err(|e| format!("Cannot read metadata: {}", e))?;
    if metadata.len() > 30_000_000 {
        return Err(format!(
            "File too large: {} bytes (max 22 MB decoded)",
            metadata.len()
        ));
    }

    let bytes = tokio::fs::read(file_path)
        .await
        .map_err(|e| format!("Cannot read file: {}", e))?;
    let b64 = base64::Engine::encode(&base64::engine::general_purpose::STANDARD, &bytes);

    let mime_type = match ext.as_str() {
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "webp" => "image/webp",
        "gif" => "image/gif",
        "pdf" => "application/pdf",
        _ => "application/octet-stream",
    };

    let text = if ext == "pdf" {
        crate::ocr::ocr_pdf_text(state, &b64, None).await?
    } else {
        crate::ocr::ocr_image_text(state, &b64, mime_type).await?
    };

    let filename = file_path
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("document");
    Ok(format!(
        "### OCR: {} ({}, {} bytes)\n\n{}",
        filename, mime_type, metadata.len(), text
    ))
}

// ── Image generation tool (browser proxy) ─────────────────────────────────

const GENERATE_IMAGE_EXTENSIONS: &[&str] = &["png", "jpg", "jpeg", "webp"];

async fn tool_generate_image(
    path: &str,
    prompt: &str,
    client: &reqwest::Client,
) -> Result<String, String> {
    if !crate::browser_proxy::is_enabled() {
        return Err(
            "Browser proxy not enabled. Set BROWSER_PROXY_URL env var to use generate_image."
                .to_string(),
        );
    }

    let file_path = std::path::Path::new(path);
    if !file_path.exists() {
        return Err(format!("File not found: {}", path));
    }

    let ext = file_path
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_lowercase())
        .unwrap_or_default();

    if !GENERATE_IMAGE_EXTENSIONS.contains(&ext.as_str()) {
        return Err(format!(
            "Unsupported image type: .{}. Supported: {:?}",
            ext, GENERATE_IMAGE_EXTENSIONS
        ));
    }

    let metadata = tokio::fs::metadata(file_path)
        .await
        .map_err(|e| format!("Cannot read metadata: {}", e))?;
    if metadata.len() > 20_000_000 {
        return Err(format!(
            "Image too large: {} bytes (max 20 MB)",
            metadata.len()
        ));
    }

    let bytes = tokio::fs::read(file_path)
        .await
        .map_err(|e| format!("Cannot read file: {}", e))?;
    let image_b64 = base64::Engine::encode(&base64::engine::general_purpose::STANDARD, &bytes);

    let mime_type = match ext.as_str() {
        "png" => "image/png",
        "webp" => "image/webp",
        _ => "image/jpeg",
    };

    let result_b64 =
        crate::browser_proxy::generate_image(client, &image_b64, mime_type, prompt, "agent-tool")
            .await?;

    // Save result next to the original file
    let stem = file_path
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("output");
    let output_path = file_path.with_file_name(format!("{}_generated.png", stem));

    let decoded = base64::Engine::decode(&base64::engine::general_purpose::STANDARD, &result_b64)
        .map_err(|e| format!("Failed to decode result image: {}", e))?;

    tokio::fs::write(&output_path, &decoded)
        .await
        .map_err(|e| format!("Failed to save result image: {}", e))?;

    let filename = file_path
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("image");
    Ok(format!(
        "Image generated successfully!\n\
         Input: {} ({} bytes)\n\
         Output: {} ({} bytes)\n\
         Prompt: {}",
        filename,
        metadata.len(),
        output_path.display(),
        decoded.len(),
        prompt
    ))
}
