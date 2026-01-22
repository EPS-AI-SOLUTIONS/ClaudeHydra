use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BridgeRequest {
    pub id: String,
    pub message: String,
    #[serde(rename = "type")]
    pub request_type: String,
    pub status: String,
    pub timestamp: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BridgeSettings {
    pub poll_interval_ms: u32,
    pub max_pending_requests: u32,
    pub timeout_ms: u32,
}

impl Default for BridgeSettings {
    fn default() -> Self {
        Self {
            poll_interval_ms: 2000,
            max_pending_requests: 10,
            timeout_ms: 300000,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BridgeData {
    pub auto_approve: bool,
    pub requests: Vec<BridgeRequest>,
    pub settings: BridgeSettings,
}

impl Default for BridgeData {
    fn default() -> Self {
        Self {
            auto_approve: false,
            requests: Vec::new(),
            settings: BridgeSettings::default(),
        }
    }
}

fn get_bridge_path() -> PathBuf {
    // Look for bridge.json in parent directory (ClaudeHydra root)
    let mut path = std::env::current_dir().unwrap_or_default();

    // If we're in src-tauri, go up to claude-gui, then to ClaudeHydra
    if path.ends_with("src-tauri") {
        path.pop(); // claude-gui
        path.pop(); // ClaudeHydra
    } else if path.ends_with("claude-gui") {
        path.pop(); // ClaudeHydra
    }

    path.push("bridge.json");
    path
}

fn read_bridge_data() -> BridgeData {
    let path = get_bridge_path();

    if path.exists() {
        match fs::read_to_string(&path) {
            Ok(content) => {
                serde_json::from_str(&content).unwrap_or_default()
            }
            Err(_) => BridgeData::default(),
        }
    } else {
        BridgeData::default()
    }
}

fn write_bridge_data(data: &BridgeData) -> Result<(), String> {
    let path = get_bridge_path();
    let content = serde_json::to_string_pretty(data)
        .map_err(|e| e.to_string())?;
    fs::write(&path, content)
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn get_bridge_state() -> Result<BridgeData, String> {
    Ok(read_bridge_data())
}

#[tauri::command]
pub fn set_bridge_auto_approve(enabled: bool) -> Result<BridgeData, String> {
    let mut data = read_bridge_data();
    data.auto_approve = enabled;
    write_bridge_data(&data)?;
    Ok(data)
}

#[tauri::command]
pub fn approve_bridge_request(id: String) -> Result<BridgeData, String> {
    let mut data = read_bridge_data();

    if let Some(request) = data.requests.iter_mut().find(|r| r.id == id) {
        request.status = "approved".to_string();
    }

    write_bridge_data(&data)?;
    Ok(data)
}

#[tauri::command]
pub fn reject_bridge_request(id: String) -> Result<BridgeData, String> {
    let mut data = read_bridge_data();

    if let Some(request) = data.requests.iter_mut().find(|r| r.id == id) {
        request.status = "rejected".to_string();
    }

    write_bridge_data(&data)?;
    Ok(data)
}

#[tauri::command]
pub fn clear_bridge_requests() -> Result<BridgeData, String> {
    let mut data = read_bridge_data();
    data.requests.clear();
    write_bridge_data(&data)?;
    Ok(data)
}
