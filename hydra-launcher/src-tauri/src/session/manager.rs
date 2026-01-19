use super::conflict::ConflictDetector;
use super::queue::{create_shared_queue, SharedQueue};
use super::types::*;
use std::collections::HashMap;
use std::io::{BufRead, BufReader, Write};
use std::process::{Child, Command, Stdio};
use std::sync::Arc;
use std::thread;
use std::time::SystemTime;
use tokio::sync::{mpsc, Mutex, RwLock};

/// Message from CLI process
#[derive(Debug, Clone)]
pub enum ProcessMessage {
    Output(String),
    Error(String),
    Exited(i32),
}

/// A running CLI process session
struct CliProcess {
    child: Child,
    provider: CLIProvider,
    output_rx: mpsc::Receiver<ProcessMessage>,
}

/// Manages multiple tab sessions with their own CLI processes
pub struct SessionManager {
    /// All active tab sessions
    tabs: RwLock<HashMap<TabId, TabSession>>,
    /// Running CLI processes per session
    processes: Mutex<HashMap<SessionId, CliProcess>>,
    /// Prompt queue for fair scheduling
    queue: SharedQueue,
    /// Conflict detector
    conflicts: Mutex<ConflictDetector>,
    /// HYDRA project path
    hydra_path: String,
    /// Max concurrent prompts
    max_concurrent: usize,
}

impl SessionManager {
    pub async fn new(hydra_path: String, max_concurrent: usize) -> Arc<Self> {
        Arc::new(Self {
            tabs: RwLock::new(HashMap::new()),
            processes: Mutex::new(HashMap::new()),
            queue: create_shared_queue(max_concurrent),
            conflicts: Mutex::new(ConflictDetector::new()),
            hydra_path,
            max_concurrent,
        })
    }

    /// Create a new tab with a session
    pub async fn create_tab(
        &self,
        name: String,
        provider: CLIProvider,
    ) -> Result<TabSession, String> {
        let tab_id = format!(
            "tab_{}",
            SystemTime::now()
                .duration_since(SystemTime::UNIX_EPOCH)
                .unwrap()
                .as_millis()
        );

        let tab = TabSession::new(tab_id.clone(), name, provider);

        // Store tab
        let mut tabs = self.tabs.write().await;
        tabs.insert(tab_id.clone(), tab.clone());

        // Start CLI process for this session
        if provider == CLIProvider::Hydra {
            self.start_cli_process(&tab.session_id, provider, tab.yolo_mode)
                .await?;
        }

        Ok(tab)
    }

    /// Close a tab and cleanup its resources
    pub async fn close_tab(&self, tab_id: &TabId) -> Result<(), String> {
        let mut tabs = self.tabs.write().await;

        if let Some(tab) = tabs.remove(tab_id) {
            // Kill associated process
            let mut processes = self.processes.lock().await;
            if let Some(mut process) = processes.remove(&tab.session_id) {
                let _ = process.child.kill();
            }

            // Cancel pending prompts
            let mut queue = self.queue.lock().await;
            queue.cancel_tab(tab_id);

            // Unregister from conflict detector
            let mut conflicts = self.conflicts.lock().await;
            conflicts.unregister_tab(tab_id);
        }

        Ok(())
    }

    /// Get all tabs
    pub async fn get_tabs(&self) -> Vec<TabInfo> {
        let tabs = self.tabs.read().await;
        let conflicts = self.conflicts.lock().await;
        let queue = self.queue.lock().await;

        tabs.values()
            .map(|tab| TabInfo {
                tab_id: tab.tab_id.clone(),
                name: tab.name.clone(),
                provider: tab.provider,
                is_active: tab.is_active,
                has_unread: false, // TODO: track unread messages
                message_count: tab.conversation.len(),
                last_activity: tab.last_activity,
                has_conflict: conflicts.has_conflicts(&tab.tab_id),
            })
            .collect()
    }

    /// Get a specific tab
    pub async fn get_tab(&self, tab_id: &TabId) -> Option<TabSession> {
        let tabs = self.tabs.read().await;
        tabs.get(tab_id).cloned()
    }

    /// Rename a tab
    pub async fn rename_tab(&self, tab_id: &TabId, new_name: String) -> Result<(), String> {
        let mut tabs = self.tabs.write().await;
        if let Some(tab) = tabs.get_mut(tab_id) {
            tab.name = new_name;
            Ok(())
        } else {
            Err("Tab not found".to_string())
        }
    }

    /// Send a prompt to a tab's session
    pub async fn send_prompt(
        &self,
        tab_id: &TabId,
        content: String,
        priority: PromptPriority,
    ) -> Result<String, String> {
        let tabs = self.tabs.read().await;
        let tab = tabs.get(tab_id).ok_or("Tab not found")?;

        // Create queued prompt
        let mut prompt =
            QueuedPrompt::new(tab_id.clone(), tab.session_id.clone(), content, tab.provider);
        prompt.priority = priority;

        // Check for potential conflicts
        let conflicts = self.conflicts.lock().await;
        let potential_conflicts = conflicts.would_conflict(tab_id, &prompt.affected_files);
        drop(conflicts);

        // Enqueue
        let mut queue = self.queue.lock().await;
        let prompt_id = queue.enqueue(prompt);

        Ok(prompt_id)
    }

    /// Process the queue (should be called in a loop)
    pub async fn process_queue(&self) -> Option<(String, String)> {
        // Get next prompt
        let prompt = {
            let mut queue = self.queue.lock().await;
            queue.dequeue()
        };

        let prompt = match prompt {
            Some(p) => p,
            None => return None,
        };

        // Execute the prompt
        let result = self.execute_prompt(&prompt).await;

        // Update queue with result
        match result {
            Ok(response) => {
                // Add to conversation
                {
                    let mut tabs = self.tabs.write().await;
                    if let Some(tab) = tabs.get_mut(&prompt.tab_id) {
                        tab.add_message("user", &prompt.content, prompt.provider);
                        tab.add_message("assistant", &response, prompt.provider);
                    }
                }

                // Mark complete
                let mut queue = self.queue.lock().await;
                queue.complete(&prompt.id, response.clone());

                Some((prompt.id, response))
            }
            Err(error) => {
                let mut queue = self.queue.lock().await;
                queue.fail(&prompt.id, error.clone());

                Some((prompt.id, format!("Error: {}", error)))
            }
        }
    }

    /// Execute a single prompt
    async fn execute_prompt(&self, prompt: &QueuedPrompt) -> Result<String, String> {
        match prompt.provider {
            CLIProvider::Hydra => self.execute_claude(&prompt.content).await,
            CLIProvider::Gemini => self.execute_gemini(&prompt.content).await,
            CLIProvider::Jules => self.execute_jules(&prompt.content).await,
            CLIProvider::DeepSeek => self.execute_deepseek(&prompt.content).await,
            CLIProvider::Ollama => self.execute_ollama(&prompt.content).await,
            _ => Err(format!("Provider {} not implemented yet", prompt.provider)),
        }
    }

    /// Execute a prompt using Claude CLI
    async fn execute_claude(&self, content: &str) -> Result<String, String> {
        let claude_path = Self::find_claude_executable()?;

        let output = Command::new(&claude_path)
            .current_dir(&self.hydra_path)
            .args(["-p", content, "--output-format", "text"])
            .output()
            .map_err(|e| format!("Failed to run Claude: {}", e))?;

        if output.status.success() {
            Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
        } else {
            Err(String::from_utf8_lossy(&output.stderr).to_string())
        }
    }

    /// Execute a prompt using Gemini CLI
    async fn execute_gemini(&self, content: &str) -> Result<String, String> {
        // Check if gemini CLI is available
        let gemini_path = Self::find_executable("gemini")?;

        let output = Command::new(&gemini_path)
            .current_dir(&self.hydra_path)
            .args(["-p", content])
            .output()
            .map_err(|e| format!("Failed to run Gemini: {}", e))?;

        if output.status.success() {
            Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
        } else {
            Err(String::from_utf8_lossy(&output.stderr).to_string())
        }
    }

    /// Execute a prompt using Jules CLI (async background task)
    async fn execute_jules(&self, content: &str) -> Result<String, String> {
        // Jules is for async background tasks
        let jules_path = Self::find_executable("jules")?;

        let output = Command::new(&jules_path)
            .current_dir(&self.hydra_path)
            .args(["run", content])
            .output()
            .map_err(|e| format!("Failed to run Jules: {}", e))?;

        if output.status.success() {
            Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
        } else {
            Err(String::from_utf8_lossy(&output.stderr).to_string())
        }
    }

    /// Execute a prompt using DeepSeek CLI
    async fn execute_deepseek(&self, content: &str) -> Result<String, String> {
        let deepseek_path = Self::find_executable("deepseek")?;

        let output = Command::new(&deepseek_path)
            .current_dir(&self.hydra_path)
            .args(["chat", "-m", content])
            .output()
            .map_err(|e| format!("Failed to run DeepSeek: {}", e))?;

        if output.status.success() {
            Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
        } else {
            Err(String::from_utf8_lossy(&output.stderr).to_string())
        }
    }

    /// Execute a prompt using local Ollama
    async fn execute_ollama(&self, content: &str) -> Result<String, String> {
        let client = reqwest::Client::new();

        let response = client
            .post("http://localhost:11434/api/generate")
            .json(&serde_json::json!({
                "model": "llama3.2:3b",
                "prompt": content,
                "stream": false
            }))
            .send()
            .await
            .map_err(|e| format!("Ollama request failed: {}", e))?;

        let data: serde_json::Value = response
            .json()
            .await
            .map_err(|e| format!("Failed to parse Ollama response: {}", e))?;

        data["response"]
            .as_str()
            .map(|s| s.to_string())
            .ok_or_else(|| "Invalid Ollama response".to_string())
    }

    /// Start a CLI process for a session
    async fn start_cli_process(
        &self,
        session_id: &SessionId,
        provider: CLIProvider,
        yolo_mode: bool,
    ) -> Result<(), String> {
        let (cmd, args) = match provider {
            CLIProvider::Hydra => {
                let path = Self::find_claude_executable()?;
                let mut args = vec![];
                if yolo_mode {
                    args.push("--dangerously-skip-permissions".to_string());
                }
                (path, args)
            }
            _ => return Ok(()), // Other providers don't need persistent process
        };

        let mut child = Command::new(&cmd)
            .current_dir(&self.hydra_path)
            .args(&args)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|e| format!("Failed to start {} process: {}", provider, e))?;

        // Create channel for output
        let (tx, rx) = mpsc::channel(100);

        // Spawn thread to read stdout
        if let Some(stdout) = child.stdout.take() {
            let tx = tx.clone();
            thread::spawn(move || {
                let reader = BufReader::new(stdout);
                for line in reader.lines() {
                    if let Ok(line) = line {
                        let _ = tx.blocking_send(ProcessMessage::Output(line));
                    }
                }
            });
        }

        // Spawn thread to read stderr
        if let Some(stderr) = child.stderr.take() {
            let tx = tx.clone();
            thread::spawn(move || {
                let reader = BufReader::new(stderr);
                for line in reader.lines() {
                    if let Ok(line) = line {
                        let _ = tx.blocking_send(ProcessMessage::Error(line));
                    }
                }
            });
        }

        let process = CliProcess {
            child,
            provider,
            output_rx: rx,
        };

        let mut processes = self.processes.lock().await;
        processes.insert(session_id.clone(), process);

        Ok(())
    }

    /// Register files being worked on by a tab
    pub async fn register_tab_files(&self, tab_id: &TabId, files: Vec<String>) {
        let mut tabs = self.tabs.write().await;
        if let Some(tab) = tabs.get_mut(tab_id) {
            tab.update_active_files(files.clone());
        }
        drop(tabs);

        let mut conflicts = self.conflicts.lock().await;
        conflicts.register_files(tab_id, files);
    }

    /// Get conflicts for a tab
    pub async fn get_tab_conflicts(&self, tab_id: &TabId) -> Vec<FileConflict> {
        let conflicts = self.conflicts.lock().await;
        conflicts.get_tab_conflicts(tab_id).into_iter().cloned().collect()
    }

    /// Get queue statistics
    pub async fn get_queue_stats(&self) -> QueueStats {
        let queue = self.queue.lock().await;
        queue.get_stats()
    }

    /// Check if tab is currently processing
    pub async fn is_tab_busy(&self, tab_id: &TabId) -> bool {
        let queue = self.queue.lock().await;
        queue.is_tab_busy(tab_id)
    }

    /// Cancel a prompt
    pub async fn cancel_prompt(&self, prompt_id: &str) -> bool {
        let mut queue = self.queue.lock().await;
        queue.cancel(prompt_id)
    }

    /// Find Claude executable
    fn find_claude_executable() -> Result<String, String> {
        Self::find_executable("claude")
    }

    /// Find any executable in PATH
    fn find_executable(name: &str) -> Result<String, String> {
        #[cfg(windows)]
        {
            let possible_paths = [
                format!(
                    "{}\\AppData\\Roaming\\npm\\{}.cmd",
                    std::env::var("USERPROFILE").unwrap_or_default(),
                    name
                ),
                format!(
                    "{}\\bin\\{}.cmd",
                    std::env::var("USERPROFILE").unwrap_or_default(),
                    name
                ),
                name.to_string(),
            ];

            for path in &possible_paths {
                if path == name {
                    if let Ok(output) = Command::new("where").arg(name).output() {
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
        }

        #[cfg(not(windows))]
        {
            if let Ok(output) = Command::new("which").arg(name).output() {
                if output.status.success() {
                    let path = String::from_utf8_lossy(&output.stdout);
                    return Ok(path.trim().to_string());
                }
            }
        }

        Err(format!(
            "{} CLI not found. Please install it first.",
            name
        ))
    }
}

/// Shared session manager
pub type SharedSessionManager = Arc<SessionManager>;
