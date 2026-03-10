//! File listing and native folder browser endpoints.

use axum::Json;
use axum::extract::State;
use axum::http::StatusCode;
use serde_json::{Value, json};

use crate::state::AppState;

// ═══════════════════════════════════════════════════════════════════════
//  Request types (local to this module)
// ═══════════════════════════════════════════════════════════════════════

#[derive(Debug, serde::Deserialize)]
pub struct FileListRequest {
    #[serde(default)]
    pub directory: String,
    #[serde(default)]
    pub show_hidden: bool,
}

// ═══════════════════════════════════════════════════════════════════════
//  POST /api/files/list
// ═══════════════════════════════════════════════════════════════════════

pub async fn list_files(
    State(_state): State<AppState>,
    Json(req): Json<FileListRequest>,
) -> Result<Json<Value>, StatusCode> {
    let dir = if req.directory.is_empty() {
        std::env::current_dir()
            .map(|p| p.to_string_lossy().to_string())
            .unwrap_or_else(|_| ".".to_string())
    } else {
        req.directory
    };

    let path = std::path::Path::new(&dir);
    if !path.is_dir() {
        return Err(StatusCode::BAD_REQUEST);
    }

    let mut entries = Vec::new();
    let read_dir = std::fs::read_dir(path).map_err(|e| {
        tracing::error!("Failed to read directory '{}': {}", dir, e);
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    for entry in read_dir.flatten() {
        let file_name = entry.file_name().to_string_lossy().to_string();

        // Skip hidden files unless requested
        if !req.show_hidden && file_name.starts_with('.') {
            continue;
        }

        let metadata = entry.metadata().ok();
        let is_dir = metadata.as_ref().map(|m| m.is_dir()).unwrap_or(false);
        let size = metadata.as_ref().map(|m| m.len()).unwrap_or(0);

        entries.push(json!({
            "name": file_name,
            "path": entry.path().to_string_lossy(),
            "is_directory": is_dir,
            "size": size,
        }));
    }

    // Sort: directories first, then alphabetical
    entries.sort_by(|a, b| {
        let a_dir = a
            .get("is_directory")
            .and_then(|v| v.as_bool())
            .unwrap_or(false);
        let b_dir = b
            .get("is_directory")
            .and_then(|v| v.as_bool())
            .unwrap_or(false);
        match (b_dir, a_dir) {
            (true, false) => std::cmp::Ordering::Greater,
            (false, true) => std::cmp::Ordering::Less,
            _ => {
                let a_name = a.get("name").and_then(|v| v.as_str()).unwrap_or("");
                let b_name = b.get("name").and_then(|v| v.as_str()).unwrap_or("");
                a_name.to_lowercase().cmp(&b_name.to_lowercase())
            }
        }
    });

    Ok(Json(json!({
        "directory": dir,
        "entries": entries,
    })))
}

// ═══════════════════════════════════════════════════════════════════════
//  POST /api/files/browse — native Windows FolderBrowserDialog
// ═══════════════════════════════════════════════════════════════════════

pub async fn browse_directory(
    State(_state): State<AppState>,
    Json(body): Json<Value>,
) -> Json<Value> {
    let initial_dir = body
        .get("initial_directory")
        .and_then(|v| v.as_str())
        .unwrap_or("");

    // Build PowerShell script for native folder dialog
    let ps_script = format!(
        r#"Add-Type -AssemblyName System.Windows.Forms
$dialog = New-Object System.Windows.Forms.FolderBrowserDialog
$dialog.ShowNewFolderButton = $true
$dialog.Description = "Select working directory"
{}
$form = New-Object System.Windows.Forms.Form
$form.TopMost = $true
$result = $dialog.ShowDialog($form)
if ($result -eq [System.Windows.Forms.DialogResult]::OK) {{
    Write-Output $dialog.SelectedPath
}} else {{
    Write-Output "CANCELLED"
}}"#,
        if initial_dir.is_empty() {
            String::new()
        } else {
            format!(
                "$dialog.SelectedPath = '{}'",
                initial_dir.replace('\'', "''")
            )
        }
    );

    // Write temp .ps1 file (PowerShell -Command has issues with complex scripts)
    let temp_dir = std::env::temp_dir();
    let ps_path = temp_dir.join("jaskier_browse_folder.ps1");
    if let Err(e) = std::fs::write(&ps_path, &ps_script) {
        tracing::error!("Failed to write PS1 script: {}", e);
        return Json(json!({ "error": "Failed to prepare folder dialog" }));
    }

    let output = tokio::process::Command::new("powershell")
        .args([
            "-NoProfile",
            "-STA",
            "-ExecutionPolicy",
            "Bypass",
            "-File",
            &ps_path.to_string_lossy(),
        ])
        .output()
        .await;

    // Clean up temp file
    let _ = std::fs::remove_file(&ps_path);

    match output {
        Ok(out) => {
            let stdout = String::from_utf8_lossy(&out.stdout).trim().to_string();
            if stdout == "CANCELLED" || stdout.is_empty() {
                Json(json!({ "cancelled": true }))
            } else {
                Json(json!({ "path": stdout }))
            }
        }
        Err(e) => {
            tracing::error!("Failed to run folder dialog: {}", e);
            Json(json!({ "error": "Failed to open folder dialog" }))
        }
    }
}
