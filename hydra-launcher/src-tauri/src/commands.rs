use crate::config::HydraConfig;
use crate::logger::{log_info, log_error, log_mcp_health, log_claude_interaction, log_system_metrics};
use crate::mcp::health::{check_all_mcp_servers, McpHealthResult, McpStatus};
use crate::process::claude::spawn_claude_cli;
use crate::process::ollama::{check_ollama_running, get_ollama_model_list};
use crate::session::{
    SessionManager, SharedSessionManager, TabSession, TabInfo, QueueStats, FileConflict,
    CLIProvider, PromptPriority, PromptStatus,
};
use serde::{Deserialize, Serialize};
use sysinfo::System;
use std::sync::{Arc, Mutex as StdMutex};
use std::process::Command;
use tauri::State;
use once_cell::sync::Lazy;
use tokio::sync::Mutex;

// ============================================================================
// UTF-8 SAFE STRING HELPERS
// ============================================================================

/// Safely truncate a UTF-8 string to a maximum number of characters.
/// Unlike byte slicing, this respects multi-byte character boundaries.
fn truncate_utf8(s: &str, max_chars: usize) -> String {
    if s.chars().count() <= max_chars {
        s.to_string()
    } else {
        let truncated: String = s.chars().take(max_chars).collect();
        format!("{}...", truncated)
    }
}

// Global System instance for accurate CPU readings
static SYSTEM: Lazy<StdMutex<System>> = Lazy::new(|| {
    let mut sys = System::new_all();
    sys.refresh_all();
    sys.refresh_cpu_all();
    StdMutex::new(sys)
});

// Global Session Manager (initialized lazily)
static SESSION_MANAGER: Lazy<Mutex<Option<SharedSessionManager>>> = Lazy::new(|| {
    Mutex::new(None)
});

/// Initialize the session manager with HYDRA path
async fn get_or_init_session_manager() -> Result<SharedSessionManager, String> {
    let mut manager_lock = SESSION_MANAGER.lock().await;

    if manager_lock.is_none() {
        let hydra_path = get_hydra_path()?;
        let manager = SessionManager::new(hydra_path, 3).await;
        *manager_lock = Some(manager);
    }

    Ok(manager_lock.as_ref().unwrap().clone())
}

// Global state for YOLO mode and tabs
pub struct AppState {
    pub yolo_enabled: StdMutex<bool>,
}

impl Default for AppState {
    fn default() -> Self {
        Self {
            yolo_enabled: StdMutex::new(true),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SystemMetrics {
    pub cpu_percent: f32,
    pub memory_percent: f32,
    pub memory_used_gb: f64,
    pub memory_total_gb: f64,
}

// ============================================================================
// TAB MANAGEMENT COMMANDS
// ============================================================================

/// Create a new tab with a session
#[tauri::command]
pub async fn create_tab(name: String, provider: String) -> Result<TabSession, String> {
    let manager = get_or_init_session_manager().await?;

    let cli_provider = match provider.to_lowercase().as_str() {
        "hydra" => CLIProvider::Hydra,
        "gemini" => CLIProvider::Gemini,
        "jules" => CLIProvider::Jules,
        "deepseek" => CLIProvider::DeepSeek,
        "codex" => CLIProvider::Codex,
        "grok" => CLIProvider::Grok,
        "ollama" => CLIProvider::Ollama,
        _ => CLIProvider::Hydra,
    };

    log_info(&format!("Creating new tab: {} with provider: {}", name, provider));
    manager.create_tab(name, cli_provider).await
}

/// Close a tab
#[tauri::command]
pub async fn close_tab(tab_id: String) -> Result<(), String> {
    let manager = get_or_init_session_manager().await?;
    log_info(&format!("Closing tab: {}", tab_id));
    manager.close_tab(&tab_id).await
}

/// Get all tabs
#[tauri::command]
pub async fn get_tabs() -> Result<Vec<TabInfo>, String> {
    let manager = get_or_init_session_manager().await?;
    Ok(manager.get_tabs().await)
}

/// Get a specific tab's data
#[tauri::command]
pub async fn get_tab(tab_id: String) -> Result<Option<TabSession>, String> {
    let manager = get_or_init_session_manager().await?;
    Ok(manager.get_tab(&tab_id).await)
}

/// Rename a tab
#[tauri::command]
pub async fn rename_tab(tab_id: String, new_name: String) -> Result<(), String> {
    let manager = get_or_init_session_manager().await?;
    manager.rename_tab(&tab_id, new_name).await
}

// ============================================================================
// PROMPT QUEUE COMMANDS
// ============================================================================

/// Send a prompt to a tab (queued)
#[tauri::command]
pub async fn send_prompt(tab_id: String, content: String, priority: Option<String>) -> Result<String, String> {
    let manager = get_or_init_session_manager().await?;

    let prio = match priority.as_deref() {
        Some("low") => PromptPriority::Low,
        Some("high") => PromptPriority::High,
        Some("critical") => PromptPriority::Critical,
        _ => PromptPriority::Normal,
    };

    log_claude_interaction("QUEUE", &truncate_utf8(&content, 100));

    manager.send_prompt(&tab_id, content, prio).await
}

/// Process the next prompt in queue (called by background worker)
#[tauri::command]
pub async fn process_next_prompt() -> Result<Option<(String, String)>, String> {
    let manager = get_or_init_session_manager().await?;
    Ok(manager.process_queue().await)
}

/// Get queue statistics
#[tauri::command]
pub async fn get_queue_stats() -> Result<QueueStats, String> {
    let manager = get_or_init_session_manager().await?;
    Ok(manager.get_queue_stats().await)
}

/// Check if a tab is busy (has processing prompt)
#[tauri::command]
pub async fn is_tab_busy(tab_id: String) -> Result<bool, String> {
    let manager = get_or_init_session_manager().await?;
    Ok(manager.is_tab_busy(&tab_id).await)
}

/// Cancel a queued prompt
#[tauri::command]
pub async fn cancel_prompt(prompt_id: String) -> Result<bool, String> {
    let manager = get_or_init_session_manager().await?;
    Ok(manager.cancel_prompt(&prompt_id).await)
}

// ============================================================================
// CONFLICT DETECTION COMMANDS
// ============================================================================

/// Register files being worked on by a tab
#[tauri::command]
pub async fn register_tab_files(tab_id: String, files: Vec<String>) -> Result<(), String> {
    let manager = get_or_init_session_manager().await?;
    manager.register_tab_files(&tab_id, files).await;
    Ok(())
}

/// Get conflicts for a tab
#[tauri::command]
pub async fn get_tab_conflicts(tab_id: String) -> Result<Vec<FileConflict>, String> {
    let manager = get_or_init_session_manager().await?;
    Ok(manager.get_tab_conflicts(&tab_id).await)
}

// ============================================================================
// EXISTING COMMANDS (MCP, SYSTEM, ETC.)
// ============================================================================

#[tauri::command]
pub async fn check_mcp_health() -> Result<Vec<McpHealthResult>, String> {
    log_info("MCP health check started");
    let results = check_all_mcp_servers().await;

    if let Ok(ref servers) = results {
        for server in servers {
            let status = if server.status == McpStatus::Online { "HEALTHY" } else { "DOWN" };
            log_mcp_health(&server.name, status, server.response_time_ms);
        }
    }

    results
}

#[tauri::command]
pub fn get_system_metrics() -> SystemMetrics {
    let mut sys = SYSTEM.lock().unwrap();

    sys.refresh_cpu_all();
    std::thread::sleep(std::time::Duration::from_millis(200));
    sys.refresh_cpu_all();
    sys.refresh_memory();

    let cpu_percent = sys.global_cpu_usage();
    let memory_used = sys.used_memory() as f64;
    let memory_total = sys.total_memory() as f64;
    let memory_percent = (memory_used / memory_total * 100.0) as f32;

    log_system_metrics(cpu_percent, memory_percent);

    SystemMetrics {
        cpu_percent,
        memory_percent,
        memory_used_gb: memory_used / 1024.0 / 1024.0 / 1024.0,
        memory_total_gb: memory_total / 1024.0 / 1024.0 / 1024.0,
    }
}

#[tauri::command]
pub fn load_hydra_config() -> Result<HydraConfig, String> {
    HydraConfig::load(None)
}

#[tauri::command(rename_all = "camelCase")]
pub async fn launch_claude(yolo_mode: bool) -> Result<String, String> {
    spawn_claude_cli(yolo_mode).await
}

#[tauri::command]
pub async fn check_ollama() -> Result<bool, String> {
    check_ollama_running().await
}

#[tauri::command]
pub async fn get_ollama_models() -> Result<Vec<String>, String> {
    get_ollama_model_list().await
}

#[tauri::command]
pub fn set_yolo_mode(state: State<'_, AppState>, enabled: bool) -> bool {
    let mut yolo = state.yolo_enabled.lock().unwrap();
    *yolo = enabled;
    log_info(&format!("YOLO mode set to: {}", if enabled { "ON" } else { "OFF" }));
    enabled
}

// ============================================================================
// LEGACY COMMANDS (for backward compatibility)
// ============================================================================

/// Start a Claude session (legacy - now handled by tab creation)
#[tauri::command(rename_all = "camelCase")]
pub async fn start_claude_session(_yolo_mode: bool) -> Result<String, String> {
    // For backward compatibility, create a default tab
    let manager = get_or_init_session_manager().await?;
    let tab = manager.create_tab("HYDRA Session".to_string(), CLIProvider::Hydra).await?;
    Ok(tab.session_id)
}

/// Send a message to Claude (legacy - now uses queue)
#[tauri::command]
pub async fn send_to_claude(message: String) -> Result<String, String> {
    let manager = get_or_init_session_manager().await?;

    // Get or create default tab
    let tabs = manager.get_tabs().await;
    let tab_id = if let Some(tab) = tabs.first() {
        tab.tab_id.clone()
    } else {
        let tab = manager.create_tab("HYDRA Session".to_string(), CLIProvider::Hydra).await?;
        tab.tab_id
    };

    // For legacy command, execute directly instead of queueing
    log_claude_interaction("SEND", &truncate_utf8(&message, 100));

    // Execute directly (legacy behavior)
    let hydra_path = get_hydra_path()?;
    let claude_path = find_claude_executable()?;
    log_info(&format!("Using Claude at: {}", claude_path));

    let output = Command::new(&claude_path)
        .current_dir(&hydra_path)
        .args(["-p", &message, "--output-format", "text"])
        .output()
        .map_err(|e| {
            log_error(&format!("Failed to run claude: {}", e));
            format!("Failed to run claude: {}", e)
        })?;

    if output.status.success() {
        let response = String::from_utf8_lossy(&output.stdout).to_string();
        let trimmed = response.trim();
        log_claude_interaction("RECV", &truncate_utf8(trimmed, 100));
        Ok(trimmed.to_string())
    } else {
        let error = String::from_utf8_lossy(&output.stderr).to_string();
        log_error(&format!("Claude error: {}", error));
        Err(format!("Claude error: {}", error))
    }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

fn find_claude_executable() -> Result<String, String> {
    let possible_paths = [
        format!("{}\\AppData\\Roaming\\npm\\claude.cmd", std::env::var("USERPROFILE").unwrap_or_default()),
        format!("{}\\bin\\claude.cmd", std::env::var("USERPROFILE").unwrap_or_default()),
        "claude".to_string(),
    ];

    for path in &possible_paths {
        if path == "claude" {
            if let Ok(output) = Command::new("where").arg("claude").output() {
                if output.status.success() {
                    let paths = String::from_utf8_lossy(&output.stdout);
                    if let Some(first_path) = paths.lines().next() {
                        return Ok(first_path.trim().to_string());
                    }
                }
            }
        } else if std::path::Path::new(path).exists() {
            return Ok(path.clone());
        }
    }

    Err("Claude CLI not found. Please install it with: npm install -g @anthropic-ai/claude-code".to_string())
}

fn get_hydra_path() -> Result<String, String> {
    if let Ok(path) = std::env::var("HYDRA_PATH") {
        return Ok(path);
    }

    let home = std::env::var("USERPROFILE")
        .or_else(|_| std::env::var("HOME"))
        .map_err(|_| "Could not determine home directory")?;

    let default_path = format!("{}\\Desktop\\ClaudeHYDRA", home);

    if std::path::Path::new(&default_path).exists() {
        Ok(default_path)
    } else {
        Err("HYDRA path not found".to_string())
    }
}

// ============================================================================
// SWARM LOGGER COMMANDS
// ============================================================================

/// Append content to a log file
#[tauri::command]
pub async fn append_to_log(filename: String, content: String) -> Result<(), String> {
    use std::fs::{OpenOptions, create_dir_all};
    use std::io::Write;
    use std::path::Path;

    let hydra_path = get_hydra_path()?;
    let log_path = format!("{}\\{}", hydra_path, filename);

    // Ensure directory exists
    if let Some(parent) = Path::new(&log_path).parent() {
        create_dir_all(parent).map_err(|e| format!("Failed to create log directory: {}", e))?;
    }

    // Append to file
    let mut file = OpenOptions::new()
        .create(true)
        .append(true)
        .open(&log_path)
        .map_err(|e| format!("Failed to open log file: {}", e))?;

    file.write_all(content.as_bytes())
        .map_err(|e| format!("Failed to write to log file: {}", e))?;

    Ok(())
}

// ============================================================================
// BUILD FRESHNESS CHECK COMMANDS
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BuildFreshness {
    pub is_fresh: bool,
    pub dist_modified: Option<u64>,
    pub src_modified: Option<u64>,
    pub stale_files: Vec<String>,
    pub message: String,
}

/// Check if dist files are up to date with src files
#[tauri::command]
pub async fn check_build_freshness() -> Result<BuildFreshness, String> {
    use std::fs;
    use std::time::SystemTime;

    let hydra_path = get_hydra_path()?;
    let launcher_path = format!("{}\\hydra-launcher", hydra_path);
    let dist_path = format!("{}\\dist", launcher_path);
    let src_path = format!("{}\\src", launcher_path);

    // Get dist folder modification time
    let dist_modified = fs::metadata(&dist_path)
        .and_then(|m| m.modified())
        .ok()
        .and_then(|t| t.duration_since(SystemTime::UNIX_EPOCH).ok())
        .map(|d| d.as_secs());

    // Find most recent src file modification
    let mut src_modified: Option<u64> = None;
    let mut stale_files: Vec<String> = Vec::new();

    fn scan_dir(path: &str, dist_time: Option<u64>, src_mod: &mut Option<u64>, stale: &mut Vec<String>) {
        if let Ok(entries) = fs::read_dir(path) {
            for entry in entries.flatten() {
                let file_path = entry.path();
                if file_path.is_dir() {
                    if let Some(name) = file_path.file_name() {
                        if name != "node_modules" && name != "dist" && name != "target" {
                            scan_dir(&file_path.to_string_lossy(), dist_time, src_mod, stale);
                        }
                    }
                } else if let Some(ext) = file_path.extension() {
                    let ext_str = ext.to_string_lossy();
                    if ext_str == "ts" || ext_str == "tsx" || ext_str == "css" || ext_str == "html" {
                        if let Ok(meta) = fs::metadata(&file_path) {
                            if let Ok(mod_time) = meta.modified() {
                                if let Ok(duration) = mod_time.duration_since(SystemTime::UNIX_EPOCH) {
                                    let secs = duration.as_secs();
                                    if src_mod.is_none() || secs > src_mod.unwrap() {
                                        *src_mod = Some(secs);
                                    }
                                    // Check if file is newer than dist
                                    if let Some(dist_t) = dist_time {
                                        if secs > dist_t {
                                            stale.push(file_path.to_string_lossy().to_string());
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    scan_dir(&src_path, dist_modified, &mut src_modified, &mut stale_files);

    let is_fresh = stale_files.is_empty();
    let message = if is_fresh {
        "Build is up to date".to_string()
    } else {
        format!("{} file(s) modified since last build", stale_files.len())
    };

    log_info(&format!("Build freshness check: {} - {}", if is_fresh { "FRESH" } else { "STALE" }, message));

    Ok(BuildFreshness {
        is_fresh,
        dist_modified,
        src_modified,
        stale_files,
        message,
    })
}

/// Read SWARM logs
#[tauri::command]
pub async fn read_swarm_logs(limit: Option<usize>) -> Result<Vec<String>, String> {
    use std::fs::File;
    use std::io::{BufRead, BufReader};

    let hydra_path = get_hydra_path()?;
    let log_path = format!("{}\\hydra-logs\\swarm.log", hydra_path);

    let file = File::open(&log_path).map_err(|e| format!("Failed to open log file: {}", e))?;
    let reader = BufReader::new(file);

    let lines: Vec<String> = reader
        .lines()
        .filter_map(|line| line.ok())
        .collect();

    let limit = limit.unwrap_or(100);
    let start = if lines.len() > limit { lines.len() - limit } else { 0 };

    Ok(lines[start..].to_vec())
}
