use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::time::Duration;
use std::sync::atomic::{AtomicU32, Ordering};

const OLLAMA_URL: &str = "http://127.0.0.1:11434";

// Track the PID of the Ollama process we started
static OLLAMA_PID: AtomicU32 = AtomicU32::new(0);

#[derive(Debug, Deserialize)]
struct OllamaTagsResponse {
    models: Vec<OllamaModel>,
}

#[derive(Debug, Deserialize)]
struct OllamaModel {
    name: String,
}

/// Ollama status information
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OllamaStatus {
    pub is_running: bool,
    pub status: OllamaState,
    pub pid: Option<u32>,
    pub models_count: usize,
    pub message: String,
}

/// Ollama state enum
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum OllamaState {
    Running,
    Stopped,
    Starting,
    Stopping,
    Error,
}

/// Check if Ollama is running on default port
pub async fn check_ollama_running() -> Result<bool, String> {
    let client = Client::builder()
        .timeout(Duration::from_secs(2))
        .build()
        .map_err(|e| e.to_string())?;

    match client.get(format!("{}/api/tags", OLLAMA_URL)).send().await {
        Ok(response) => Ok(response.status().is_success()),
        Err(_) => Ok(false),
    }
}

/// Get detailed Ollama status
pub async fn get_ollama_status() -> Result<OllamaStatus, String> {
    let is_running = check_ollama_running().await.unwrap_or(false);
    let pid = {
        let stored_pid = OLLAMA_PID.load(Ordering::SeqCst);
        if stored_pid > 0 { Some(stored_pid) } else { None }
    };

    let (status, models_count, message) = if is_running {
        let models = get_ollama_model_list().await.unwrap_or_default();
        (
            OllamaState::Running,
            models.len(),
            format!("Ollama running with {} models", models.len()),
        )
    } else {
        (
            OllamaState::Stopped,
            0,
            "Ollama is not running".to_string(),
        )
    };

    Ok(OllamaStatus {
        is_running,
        status,
        pid,
        models_count,
        message,
    })
}

/// Get list of available Ollama models
pub async fn get_ollama_model_list() -> Result<Vec<String>, String> {
    let client = Client::builder()
        .timeout(Duration::from_secs(5))
        .build()
        .map_err(|e| e.to_string())?;

    let response = client
        .get(format!("{}/api/tags", OLLAMA_URL))
        .send()
        .await
        .map_err(|e| format!("Failed to connect to Ollama: {}", e))?;

    if !response.status().is_success() {
        return Err(format!("Ollama returned status: {}", response.status()));
    }

    let tags: OllamaTagsResponse = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse response: {}", e))?;

    Ok(tags.models.into_iter().map(|m| m.name).collect())
}

/// Start Ollama service (Windows)
#[cfg(windows)]
pub async fn start_ollama() -> Result<u32, String> {
    use std::process::Command;
    use std::os::windows::process::CommandExt;

    // Check if already running
    if check_ollama_running().await.unwrap_or(false) {
        return Err("Ollama is already running".to_string());
    }

    // CREATE_NEW_PROCESS_GROUP flag for detached process
    const CREATE_NEW_PROCESS_GROUP: u32 = 0x00000200;
    const DETACHED_PROCESS: u32 = 0x00000008;

    // Try to find ollama executable
    let ollama_path = find_ollama_executable()?;

    let child = Command::new(&ollama_path)
        .arg("serve")
        .creation_flags(CREATE_NEW_PROCESS_GROUP | DETACHED_PROCESS)
        .spawn()
        .map_err(|e| format!("Failed to start Ollama: {}", e))?;

    let pid = child.id();
    OLLAMA_PID.store(pid, Ordering::SeqCst);

    // Wait for Ollama to start (poll with timeout)
    let max_wait = 10;
    for i in 0..max_wait {
        tokio::time::sleep(Duration::from_secs(1)).await;
        if check_ollama_running().await.unwrap_or(false) {
            return Ok(pid);
        }
        if i == max_wait - 1 {
            return Err("Ollama started but not responding after 10 seconds".to_string());
        }
    }

    Ok(pid)
}

/// Start Ollama service (Unix)
#[cfg(not(windows))]
pub async fn start_ollama() -> Result<u32, String> {
    use std::process::Command;

    // Check if already running
    if check_ollama_running().await.unwrap_or(false) {
        return Err("Ollama is already running".to_string());
    }

    let child = Command::new("ollama")
        .arg("serve")
        .spawn()
        .map_err(|e| format!("Failed to start Ollama: {}", e))?;

    let pid = child.id();
    OLLAMA_PID.store(pid, Ordering::SeqCst);

    // Wait for Ollama to start (poll with timeout)
    let max_wait = 10;
    for i in 0..max_wait {
        tokio::time::sleep(Duration::from_secs(1)).await;
        if check_ollama_running().await.unwrap_or(false) {
            return Ok(pid);
        }
        if i == max_wait - 1 {
            return Err("Ollama started but not responding after 10 seconds".to_string());
        }
    }

    Ok(pid)
}

/// Stop Ollama service - tries graceful shutdown first, then force kill
pub async fn stop_ollama() -> Result<(), String> {
    // Check if running
    if !check_ollama_running().await.unwrap_or(false) {
        OLLAMA_PID.store(0, Ordering::SeqCst);
        return Ok(()); // Already stopped
    }

    // Try graceful shutdown via API (Ollama doesn't have a quit endpoint, so we use process kill)
    // First try to get PID from our tracking
    let stored_pid = OLLAMA_PID.load(Ordering::SeqCst);

    if stored_pid > 0 {
        kill_process_by_pid(stored_pid).await?;
    } else {
        // Find and kill ollama process by name
        kill_ollama_process().await?;
    }

    // Wait for shutdown
    let max_wait = 5;
    for i in 0..max_wait {
        tokio::time::sleep(Duration::from_secs(1)).await;
        if !check_ollama_running().await.unwrap_or(true) {
            OLLAMA_PID.store(0, Ordering::SeqCst);
            return Ok(());
        }
        if i == max_wait - 1 {
            // Force kill if graceful shutdown failed
            force_kill_ollama().await?;
        }
    }

    OLLAMA_PID.store(0, Ordering::SeqCst);
    Ok(())
}

/// Restart Ollama service
pub async fn restart_ollama() -> Result<u32, String> {
    // Stop first
    if check_ollama_running().await.unwrap_or(false) {
        stop_ollama().await?;
        // Wait a bit for clean shutdown
        tokio::time::sleep(Duration::from_millis(500)).await;
    }

    // Start again
    start_ollama().await
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/// Find Ollama executable path (Windows)
#[cfg(windows)]
fn find_ollama_executable() -> Result<String, String> {
    use std::process::Command;

    // Common installation paths on Windows
    let possible_paths = [
        format!("{}\\AppData\\Local\\Programs\\Ollama\\ollama.exe", std::env::var("USERPROFILE").unwrap_or_default()),
        format!("{}\\Ollama\\ollama.exe", std::env::var("LOCALAPPDATA").unwrap_or_default()),
        "C:\\Program Files\\Ollama\\ollama.exe".to_string(),
        "ollama".to_string(),
    ];

    for path in &possible_paths {
        if path == "ollama" {
            // Try to find via PATH
            if let Ok(output) = Command::new("where").arg("ollama").output() {
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

    Err("Ollama executable not found. Please install Ollama from https://ollama.ai".to_string())
}

/// Find Ollama executable path (Unix)
#[cfg(not(windows))]
fn find_ollama_executable() -> Result<String, String> {
    use std::process::Command;

    // Try which command
    if let Ok(output) = Command::new("which").arg("ollama").output() {
        if output.status.success() {
            let path = String::from_utf8_lossy(&output.stdout);
            return Ok(path.trim().to_string());
        }
    }

    // Common paths
    let possible_paths = [
        "/usr/local/bin/ollama",
        "/usr/bin/ollama",
        "/opt/ollama/ollama",
    ];

    for path in &possible_paths {
        if std::path::Path::new(path).exists() {
            return Ok(path.to_string());
        }
    }

    Err("Ollama executable not found. Please install Ollama from https://ollama.ai".to_string())
}

/// Kill process by PID (Windows)
#[cfg(windows)]
async fn kill_process_by_pid(pid: u32) -> Result<(), String> {
    use std::process::Command;

    Command::new("taskkill")
        .args(["/PID", &pid.to_string(), "/F"])
        .output()
        .map_err(|e| format!("Failed to kill process: {}", e))?;

    Ok(())
}

/// Kill process by PID (Unix)
#[cfg(not(windows))]
async fn kill_process_by_pid(pid: u32) -> Result<(), String> {
    use std::process::Command;

    // First try graceful SIGTERM
    Command::new("kill")
        .args(["-15", &pid.to_string()])
        .output()
        .map_err(|e| format!("Failed to kill process: {}", e))?;

    Ok(())
}

/// Kill Ollama process by name (Windows)
#[cfg(windows)]
async fn kill_ollama_process() -> Result<(), String> {
    use std::process::Command;

    Command::new("taskkill")
        .args(["/IM", "ollama.exe", "/F"])
        .output()
        .map_err(|e| format!("Failed to kill Ollama: {}", e))?;

    Ok(())
}

/// Kill Ollama process by name (Unix)
#[cfg(not(windows))]
async fn kill_ollama_process() -> Result<(), String> {
    use std::process::Command;

    Command::new("pkill")
        .args(["-f", "ollama"])
        .output()
        .map_err(|e| format!("Failed to kill Ollama: {}", e))?;

    Ok(())
}

/// Force kill Ollama (Windows)
#[cfg(windows)]
async fn force_kill_ollama() -> Result<(), String> {
    use std::process::Command;

    Command::new("taskkill")
        .args(["/IM", "ollama.exe", "/F", "/T"])
        .output()
        .map_err(|e| format!("Failed to force kill Ollama: {}", e))?;

    Ok(())
}

/// Force kill Ollama (Unix)
#[cfg(not(windows))]
async fn force_kill_ollama() -> Result<(), String> {
    use std::process::Command;

    Command::new("pkill")
        .args(["-9", "-f", "ollama"])
        .output()
        .map_err(|e| format!("Failed to force kill Ollama: {}", e))?;

    Ok(())
}
