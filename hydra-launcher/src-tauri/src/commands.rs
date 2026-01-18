use crate::config::HydraConfig;
use crate::logger::{log_info, log_error, log_mcp_health, log_claude_interaction, log_system_metrics};
use crate::mcp::health::{check_all_mcp_servers, McpHealthResult, McpStatus};
use crate::process::claude::spawn_claude_cli;
use crate::process::ollama::{check_ollama_running, get_ollama_model_list};
use serde::{Deserialize, Serialize};
use sysinfo::System;
use std::sync::Mutex;
use std::process::Command;
use tauri::State;

// Global state for YOLO mode
pub struct AppState {
    pub yolo_enabled: Mutex<bool>,
}

impl Default for AppState {
    fn default() -> Self {
        Self {
            yolo_enabled: Mutex::new(true), // YOLO ON by default
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
    let mut sys = System::new_all();
    sys.refresh_all();

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

/// Start a Claude session (placeholder - returns session ID)
#[tauri::command(rename_all = "camelCase")]
pub async fn start_claude_session(_yolo_mode: bool) -> Result<String, String> {
    // For now, just verify Claude is available
    #[cfg(windows)]
    {
        let output = Command::new("where")
            .arg("claude")
            .output()
            .map_err(|e| format!("Failed to check claude: {}", e))?;

        if !output.status.success() {
            return Err("Claude CLI not found. Please install it first.".to_string());
        }
    }

    Ok(format!("session_{}", std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_millis()))
}

/// Safely truncate a UTF-8 string to approximately n characters
fn safe_truncate(s: &str, max_chars: usize) -> String {
    let truncated: String = s.chars().take(max_chars).collect();
    if s.chars().count() > max_chars {
        format!("{}...", truncated)
    } else {
        truncated
    }
}

/// Send a message to Claude and get response
#[tauri::command]
pub async fn send_to_claude(message: String) -> Result<String, String> {
    let hydra_path = get_hydra_path()?;
    let msg_preview = safe_truncate(&message, 100);
    log_claude_interaction("SEND", &msg_preview);

    // Find claude executable path
    let claude_path = find_claude_executable()?;
    log_info(&format!("Using Claude at: {}", claude_path));

    // Use claude CLI with print mode for single prompts
    // Note: Claude CLI doesn't have --cwd option, we use current_dir() instead
    let output = Command::new(&claude_path)
        .current_dir(&hydra_path)
        .args([
            "-p", &message,
            "--output-format", "text",
        ])
        .output()
        .map_err(|e| {
            log_error(&format!("Failed to run claude: {}", e));
            format!("Failed to run claude: {}", e)
        })?;

    if output.status.success() {
        let response = String::from_utf8_lossy(&output.stdout).to_string();
        let resp_preview = safe_truncate(response.trim(), 100);
        log_claude_interaction("RECV", &resp_preview);
        Ok(response.trim().to_string())
    } else {
        let error = String::from_utf8_lossy(&output.stderr).to_string();
        log_error(&format!("Claude error: {}", error));
        Err(format!("Claude error: {}", error))
    }
}

/// Find Claude executable path
fn find_claude_executable() -> Result<String, String> {
    // Try common paths on Windows
    let possible_paths = [
        // NPM global installs
        format!("{}\\AppData\\Roaming\\npm\\claude.cmd", std::env::var("USERPROFILE").unwrap_or_default()),
        format!("{}\\bin\\claude.cmd", std::env::var("USERPROFILE").unwrap_or_default()),
        // Just "claude" if in PATH
        "claude".to_string(),
    ];

    for path in &possible_paths {
        if path == "claude" {
            // Check if claude is in PATH using where command
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

/// Get the HYDRA project path
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
