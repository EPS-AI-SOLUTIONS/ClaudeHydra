use std::process::Command;

/// Initial HYDRA prompt - kept simple to avoid cmd escaping issues
const HYDRA_INIT_PROMPT: &str = "HYDRA 10.6 ACTIVATED. Run /hydra for full instructions.";

/// Spawn Claude CLI with HYDRA configuration
pub async fn spawn_claude_cli(yolo_mode: bool) -> Result<String, String> {
    let hydra_path = get_hydra_path()?;

    let mut args = vec![];

    if yolo_mode {
        // YOLO mode: dangerously skip all permissions
        args.push("--dangerously-skip-permissions".to_string());
    }

    // Add initial prompt
    args.push("-p".to_string());
    args.push(HYDRA_INIT_PROMPT.to_string());

    log::info!("Launching Claude CLI with args: {:?}", args);

    // Use start command on Windows to open in new terminal
    #[cfg(windows)]
    {
        // Build the command - start Claude in the HYDRA directory
        // Using Windows Terminal (wt) if available, fallback to cmd
        let yolo_flag = if yolo_mode { "--dangerously-skip-permissions" } else { "" };

        // Try Windows Terminal first, then fallback to cmd
        let wt_result = Command::new("wt")
            .args([
                "-d", &hydra_path,
                "cmd", "/k",
                &format!("claude {} -p \"{}\"", yolo_flag, HYDRA_INIT_PROMPT)
            ])
            .spawn();

        if wt_result.is_err() {
            // Fallback to cmd - simpler approach without nested quotes
            Command::new("cmd")
                .current_dir(&hydra_path)
                .args(["/c", "start", "claude", yolo_flag])
                .spawn()
                .map_err(|e| format!("Failed to launch Claude CLI: {}", e))?;
        }
    }

    #[cfg(not(windows))]
    {
        Command::new("claude")
            .args(&args)
            .current_dir(&hydra_path)
            .spawn()
            .map_err(|e| format!("Failed to launch Claude CLI: {}", e))?;
    }

    Ok("Claude CLI launched successfully".to_string())
}

/// Get the HYDRA project path
fn get_hydra_path() -> Result<String, String> {
    // Check environment variable first
    if let Ok(path) = std::env::var("HYDRA_PATH") {
        return Ok(path);
    }

    // Default to Desktop/ClaudeHYDRA
    let home = std::env::var("USERPROFILE")
        .or_else(|_| std::env::var("HOME"))
        .map_err(|_| "Could not determine home directory")?;

    let default_path = format!("{}\\Desktop\\ClaudeHYDRA", home);

    if std::path::Path::new(&default_path).exists() {
        Ok(default_path)
    } else {
        Err("HYDRA path not found. Set HYDRA_PATH environment variable.".to_string())
    }
}

/// Check if Claude CLI is installed
#[allow(dead_code)]
pub async fn check_claude_installed() -> bool {
    #[cfg(windows)]
    {
        Command::new("where")
            .arg("claude")
            .output()
            .map(|o| o.status.success())
            .unwrap_or(false)
    }

    #[cfg(not(windows))]
    {
        Command::new("which")
            .arg("claude")
            .output()
            .map(|o| o.status.success())
            .unwrap_or(false)
    }
}
