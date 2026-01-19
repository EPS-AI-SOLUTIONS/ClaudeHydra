use std::process::Command;

/// Initial HYDRA prompt - kept simple to avoid cmd escaping issues
const HYDRA_INIT_PROMPT: &str = "HYDRA 10.6 ACTIVATED. Run /hydra for full instructions.";

/// Spawn Claude CLI with HYDRA configuration
pub async fn spawn_claude_cli(yolo_mode: bool) -> Result<String, String> {
    let hydra_path = get_hydra_path()?;

    log::info!("Launching Claude CLI in HYDRA mode (yolo={})", yolo_mode);

    // Use start command on Windows to open in new terminal
    #[cfg(windows)]
    {
        // Find Claude executable first
        let claude_path = find_claude_executable()?;
        log::info!("Found Claude at: {}", claude_path);

        // Build args for Claude
        let mut claude_args = vec![];
        if yolo_mode {
            claude_args.push("--dangerously-skip-permissions");
        }
        claude_args.push("-p");
        claude_args.push(HYDRA_INIT_PROMPT);

        // Try Windows Terminal first
        let wt_result = Command::new("wt")
            .args([
                "-d", &hydra_path,
                "cmd", "/k",
                &claude_path,
            ])
            .args(&claude_args)
            .spawn();

        match wt_result {
            Ok(_) => {
                log::info!("Launched Claude via Windows Terminal");
            }
            Err(wt_err) => {
                log::warn!("Windows Terminal not available: {}", wt_err);

                // Fallback to start command with proper escaping
                // Use 'start' to open new window, then run claude directly
                let status = Command::new("cmd")
                    .current_dir(&hydra_path)
                    .args(["/c", "start", "cmd", "/k", &claude_path])
                    .args(&claude_args)
                    .spawn();

                match status {
                    Ok(_) => {
                        log::info!("Launched Claude via cmd /c start");
                    }
                    Err(cmd_err) => {
                        // Last resort: just run claude directly without new window
                        log::warn!("Start command failed: {}", cmd_err);
                        Command::new(&claude_path)
                            .current_dir(&hydra_path)
                            .args(&claude_args)
                            .spawn()
                            .map_err(|e| format!("Failed to launch Claude CLI: {}", e))?;
                        log::info!("Launched Claude directly");
                    }
                }
            }
        }
    }

    #[cfg(not(windows))]
    {
        let mut args = vec![];
        if yolo_mode {
            args.push("--dangerously-skip-permissions".to_string());
        }
        args.push("-p".to_string());
        args.push(HYDRA_INIT_PROMPT.to_string());

        Command::new("claude")
            .args(&args)
            .current_dir(&hydra_path)
            .spawn()
            .map_err(|e| format!("Failed to launch Claude CLI: {}", e))?;
    }

    Ok("Claude CLI launched successfully".to_string())
}

/// Find the Claude executable path on Windows
#[cfg(windows)]
fn find_claude_executable() -> Result<String, String> {
    use std::path::Path;

    let user_profile = std::env::var("USERPROFILE").unwrap_or_default();

    let possible_paths = [
        format!("{}\\AppData\\Roaming\\npm\\claude.cmd", user_profile),
        format!("{}\\bin\\claude.cmd", user_profile),
    ];

    for path in &possible_paths {
        if Path::new(path).exists() {
            return Ok(path.clone());
        }
    }

    // Try to find via 'where' command
    if let Ok(output) = Command::new("where").arg("claude").output() {
        if output.status.success() {
            let paths = String::from_utf8_lossy(&output.stdout);
            if let Some(first_path) = paths.lines().next() {
                let path = first_path.trim();
                if !path.is_empty() {
                    return Ok(path.to_string());
                }
            }
        }
    }

    Err("Claude CLI not found. Install with: npm install -g @anthropic-ai/claude-code".to_string())
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
