use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tauri::{Emitter, State};
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Command;
use tokio::sync::Mutex;
use tracing::{error, info, warn};
use std::process::Stdio;
use thiserror::Error;

#[derive(Debug, Error)]
pub enum AppError {
    #[error("Request failed: {0}")]
    ReqwestError(#[from] reqwest::Error),
    #[error("JSON parse error: {0}")]
    JsonParseError(#[from] serde_json::Error),
    #[error("IO error: {0}")]
    IoError(#[from] std::io::Error),
    #[error("Command execution failed: {0}")]
    CommandError(String),
    #[error("No response from provider")]
    NoResponseError,
    #[error("No stdout from child process")]
    NoStdoutError,
    #[error("Task error: {0}")]
    TaskError(String),
    #[error("Other error: {0}")]
    Other(String),
}

impl Serialize for AppError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        serializer.serialize_str(self.to_string().as_ref())
    }
}

/// Response structure for all AI queries
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AiResponse {
    pub success: bool,
    pub content: String,
    pub error: Option<String>,
    pub duration_ms: u64,
    pub provider: String,
    pub model: Option<String>,
    pub complexity: Option<u8>,
    pub cost_saved: Option<f64>,
}

/// Swarm task for parallel execution
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SwarmTask {
    pub id: String,
    pub prompt: String,
    pub status: TaskStatus,
    pub provider: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum TaskStatus {
    Pending,
    Running,
    Completed,
    Failed,
}

/// Provider health status
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProviderHealth {
    pub ollama: bool,
    pub ollama_models: Vec<String>,
    pub gemini: bool,
    pub gemini_path: String,
}

/// Stream event for live updates
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StreamEvent {
    pub event_type: String,  // "start", "chunk", "step", "complete", "error"
    pub content: String,
    pub provider: Option<String>,
    pub model: Option<String>,
    pub step: Option<String>,
    pub progress: Option<u8>,
}

/// Application state
pub struct AppState {
    pub swarm_tasks: Mutex<Vec<SwarmTask>>,
}

impl Default for AppState {
    fn default() -> Self {
        Self {
            swarm_tasks: Mutex::new(Vec::new()),
        }
    }
}

/// Find gemini CLI path
fn get_gemini_path() -> String {
    let candidates = [
        std::env::var("USERPROFILE")
            .map(|p| format!("{}\\AppData\\Roaming\\npm\\gemini.cmd", p))
            .unwrap_or_default(),
        std::env::var("APPDATA")
            .map(|p| format!("{}\\npm\\gemini.cmd", p))
            .unwrap_or_default(),
        "gemini.cmd".to_string(),
        "gemini".to_string(),
    ];

    for path in &candidates {
        if !path.is_empty() && std::path::Path::new(path).exists() {
            return path.clone();
        }
    }

    "gemini".to_string()
}

/// Check Ollama availability
async fn check_ollama() -> (bool, Vec<String>) {
    match reqwest::Client::new()
        .get("http://localhost:11434/api/tags")
        .timeout(std::time::Duration::from_secs(5))
        .send()
        .await
    {
        Ok(resp) => {
            if let Ok(json) = resp.json::<serde_json::Value>().await {
                let models = json["models"]
                    .as_array()
                    .map(|arr| {
                        arr.iter()
                            .filter_map(|m| m["name"].as_str().map(String::from))
                            .collect()
                    })
                    .unwrap_or_default();
                (true, models)
            } else {
                (false, vec![])
            }
        }
        Err(_) => (false, vec![]),
    }
}

/// Execute Ollama query (non-streaming)
async fn execute_ollama(prompt: &str, model: &str) -> Result<String, String> {
    let client = reqwest::Client::new();

    let body = serde_json::json!({
        "model": model,
        "prompt": prompt,
        "stream": false,
        "options": {
            "temperature": 0.7
        }
    });

    let resp = client
        .post("http://localhost:11434/api/generate")
        .json(&body)
        .timeout(std::time::Duration::from_secs(120))
        .send()
        .await
        .map_err(|e| format!("Ollama request failed: {}", e))?;

    let json: serde_json::Value = resp
        .json()
        .await
        .map_err(|e| format!("Failed to parse Ollama response: {}", e))?;

    json["response"]
        .as_str()
        .map(String::from)
        .ok_or_else(|| "No response from Ollama".to_string())
}

/// Execute Ollama query with streaming
async fn execute_ollama_stream(
    prompt: &str,
    model: &str,
    window: &tauri::Window,
) -> Result<String, String> {
    let client = reqwest::Client::new();

    let body = serde_json::json!({
        "model": model,
        "prompt": prompt,
        "stream": true,
        "options": {
            "temperature": 0.7
        }
    });

    let resp = client
        .post("http://localhost:11434/api/generate")
        .json(&body)
        .timeout(std::time::Duration::from_secs(120))
        .send()
        .await
        .map_err(|e| format!("Ollama request failed: {}", e))?;

    let mut full_content = String::new();
    let mut stream = resp.bytes_stream();

    use futures_util::StreamExt;

    while let Some(chunk_result) = stream.next().await {
        if let Ok(chunk) = chunk_result {
            if let Ok(text) = std::str::from_utf8(&chunk) {
                // Ollama sends newline-delimited JSON
                for line in text.lines() {
                    if let Ok(json) = serde_json::from_str::<serde_json::Value>(line) {
                        if let Some(response) = json["response"].as_str() {
                            full_content.push_str(response);

                            // Emit stream event
                            let _ = window.emit("stream", StreamEvent {
                                event_type: "chunk".to_string(),
                                content: response.to_string(),
                                provider: Some("ollama".to_string()),
                                model: Some(model.to_string()),
                                step: None,
                                progress: None,
                            });
                        }
                    }
                }
            }
        }
    }

    Ok(full_content)
}

/// Execute Gemini CLI query (non-streaming)
async fn execute_gemini(prompt: &str) -> Result<String, String> {
    let gemini_path = get_gemini_path();

    let output = Command::new(&gemini_path)
        .arg(prompt)
        .output()
        .await
        .map_err(|e| format!("Failed to execute Gemini: {}", e))?;

    if output.status.success() {
        let content = String::from_utf8_lossy(&output.stdout)
            .lines()
            .filter(|line| !line.contains("GOOGLE_API_KEY") && !line.contains("GEMINI_API_KEY"))
            .collect::<Vec<_>>()
            .join("\n")
            .trim()
            .to_string();
        Ok(content)
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr);
        Err(format!("Gemini error: {}", stderr))
    }
}

/// Execute Gemini CLI query with streaming (line by line)
async fn execute_gemini_stream(prompt: &str, window: &tauri::Window) -> Result<String, String> {
    let gemini_path = get_gemini_path();

    let mut child = Command::new(&gemini_path)
        .arg(prompt)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to spawn Gemini: {}", e))?;

    let stdout = child.stdout.take().ok_or("No stdout")?;
    let mut reader = BufReader::new(stdout).lines();
    let mut full_content = String::new();

    while let Ok(Some(line)) = reader.next_line().await {
        // Skip API key warnings
        if line.contains("GOOGLE_API_KEY") || line.contains("GEMINI_API_KEY") {
            continue;
        }

        full_content.push_str(&line);
        full_content.push('\n');

        // Emit stream event for each line
        let _ = window.emit("stream", StreamEvent {
            event_type: "chunk".to_string(),
            content: format!("{}\n", line),
            provider: Some("gemini".to_string()),
            model: None,
            step: None,
            progress: None,
        });
    }

    let status = child.wait().await.map_err(|e| format!("Gemini failed: {}", e))?;

    if status.success() {
        Ok(full_content.trim().to_string())
    } else {
        Err("Gemini process failed".to_string())
    }
}

/// Analyze prompt complexity (1-5)
fn analyze_complexity(prompt: &str) -> u8 {
    let lower = prompt.to_lowercase();
    let words: Vec<&str> = prompt.split_whitespace().collect();
    let mut score: f32 = 1.0;

    // Length factor
    if words.len() > 20 { score += 0.5; }
    if words.len() > 40 { score += 0.5; }
    if words.len() > 60 { score += 0.5; }

    // High complexity keywords
    let high_complexity = ["architecture", "microservices", "comprehensive", "design",
        "deployment", "strategy", "production", "scalable", "distributed"];
    for kw in &high_complexity {
        if lower.contains(kw) {
            score = score.max(4.0);
            break;
        }
    }

    // Medium complexity
    let medium_complexity = ["multiple", "detailed", "system", "integration",
        "security", "authentication", "database", "api"];
    for kw in &medium_complexity {
        if lower.contains(kw) { score += 0.5; }
    }

    score.min(5.0).round() as u8
}

/// Route prompt to appropriate provider
fn route_prompt(prompt: &str, ollama_available: bool) -> (&'static str, &'static str) {
    let complexity = analyze_complexity(prompt);
    let words: Vec<&str> = prompt.split_whitespace().collect();

    // Simple prompts -> Ollama
    if complexity <= 1 && words.len() < 15 && ollama_available {
        return ("ollama", "llama3.2:1b");
    }

    // Code tasks -> Ollama Qwen or Gemini
    if prompt.to_lowercase().contains("code") || prompt.to_lowercase().contains("function") {
        if complexity <= 3 && ollama_available {
            return ("ollama", "qwen2.5-coder:1.5b");
        }
        return ("gemini", "");
    }

    // Complex tasks -> Gemini
    if complexity >= 4 {
        return ("gemini", "");
    }

    // Default: Ollama for medium complexity
    if ollama_available {
        ("ollama", "llama3.2:3b")
    } else {
        ("gemini", "")
    }
}

/// HYDRA query - intelligent routing between Ollama and Gemini
#[tauri::command]
async fn hydra_query(prompt: String) -> Result<AiResponse, String> {
    let start = std::time::Instant::now();
    let complexity = analyze_complexity(&prompt);

    info!("HYDRA query [complexity={}]: {}", complexity, &prompt[..prompt.len().min(50)]);

    // Check Ollama availability
    let (ollama_available, _models) = check_ollama().await;
    let (provider, model) = route_prompt(&prompt, ollama_available);

    info!("Routing to {} (model: {})", provider, model);

    let result = if provider == "ollama" {
        execute_ollama(&prompt, model).await
    } else {
        execute_gemini(&prompt).await
    };

    let duration_ms = start.elapsed().as_millis() as u64;

    match result {
        Ok(content) => {
            let cost_saved = if provider == "ollama" {
                Some(0.001 + (prompt.len() as f64 / 4.0 * 2.0 * 0.000001))
            } else {
                None
            };

            Ok(AiResponse {
                success: true,
                content,
                error: None,
                duration_ms,
                provider: provider.to_string(),
                model: if model.is_empty() { None } else { Some(model.to_string()) },
                complexity: Some(complexity),
                cost_saved,
            })
        }
        Err(e) => {
            warn!("{} failed: {}, trying fallback...", provider, e);

            // Fallback to the other provider
            let fallback_result = if provider == "ollama" {
                execute_gemini(&prompt).await
            } else if ollama_available {
                execute_ollama(&prompt, "llama3.2:3b").await
            } else {
                Err("No fallback available".to_string())
            };

            match fallback_result {
                Ok(content) => Ok(AiResponse {
                    success: true,
                    content,
                    error: Some(format!("Fallback used: {}", e)),
                    duration_ms: start.elapsed().as_millis() as u64,
                    provider: if provider == "ollama" { "gemini" } else { "ollama" }.to_string(),
                    model: None,
                    complexity: Some(complexity),
                    cost_saved: None,
                }),
                Err(fallback_err) => Ok(AiResponse {
                    success: false,
                    content: String::new(),
                    error: Some(format!("Primary: {} | Fallback: {}", e, fallback_err)),
                    duration_ms: start.elapsed().as_millis() as u64,
                    provider: provider.to_string(),
                    model: None,
                    complexity: Some(complexity),
                    cost_saved: None,
                }),
            }
        }
    }
}

/// HYDRA query with live streaming - emits events as tokens arrive
#[tauri::command]
async fn hydra_query_stream(prompt: String, window: tauri::Window) -> Result<AiResponse, String> {
    let start = std::time::Instant::now();
    let complexity = analyze_complexity(&prompt);

    info!("HYDRA stream query [complexity={}]: {}", complexity, &prompt[..prompt.len().min(50)]);

    // Emit start event
    let _ = window.emit("stream", StreamEvent {
        event_type: "start".to_string(),
        content: String::new(),
        provider: None,
        model: None,
        step: Some("Routing".to_string()),
        progress: Some(10),
    });

    // Check Ollama availability
    let (ollama_available, _models) = check_ollama().await;
    let (provider, model) = route_prompt(&prompt, ollama_available);

    // Emit routing decision
    let _ = window.emit("stream", StreamEvent {
        event_type: "step".to_string(),
        content: format!("Routed to {} (complexity: {})", provider, complexity),
        provider: Some(provider.to_string()),
        model: if model.is_empty() { None } else { Some(model.to_string()) },
        step: Some("Executing".to_string()),
        progress: Some(30),
    });

    info!("Streaming from {} (model: {})", provider, model);

    let result = if provider == "ollama" {
        execute_ollama_stream(&prompt, model, &window).await
    } else {
        execute_gemini_stream(&prompt, &window).await
    };

    let duration_ms = start.elapsed().as_millis() as u64;

    match result {
        Ok(content) => {
            let cost_saved = if provider == "ollama" {
                Some(0.001 + (prompt.len() as f64 / 4.0 * 2.0 * 0.000001))
            } else {
                None
            };

            // Emit complete event
            let _ = window.emit("stream", StreamEvent {
                event_type: "complete".to_string(),
                content: format!("Done in {}ms", duration_ms),
                provider: Some(provider.to_string()),
                model: if model.is_empty() { None } else { Some(model.to_string()) },
                step: Some("Complete".to_string()),
                progress: Some(100),
            });

            Ok(AiResponse {
                success: true,
                content,
                error: None,
                duration_ms,
                provider: provider.to_string(),
                model: if model.is_empty() { None } else { Some(model.to_string()) },
                complexity: Some(complexity),
                cost_saved,
            })
        }
        Err(e) => {
            warn!("{} stream failed: {}", provider, e);

            // Emit error event
            let _ = window.emit("stream", StreamEvent {
                event_type: "error".to_string(),
                content: e.clone(),
                provider: Some(provider.to_string()),
                model: None,
                step: Some("Failed".to_string()),
                progress: Some(0),
            });

            Ok(AiResponse {
                success: false,
                content: String::new(),
                error: Some(e),
                duration_ms,
                provider: provider.to_string(),
                model: None,
                complexity: Some(complexity),
                cost_saved: None,
            })
        }
    }
}

/// Direct Gemini query (bypass HYDRA routing)
#[tauri::command]
async fn gemini_query(prompt: String) -> Result<AiResponse, String> {
    let start = std::time::Instant::now();

    match execute_gemini(&prompt).await {
        Ok(content) => Ok(AiResponse {
            success: true,
            content,
            error: None,
            duration_ms: start.elapsed().as_millis() as u64,
            provider: "gemini".to_string(),
            model: None,
            complexity: None,
            cost_saved: None,
        }),
        Err(e) => Ok(AiResponse {
            success: false,
            content: String::new(),
            error: Some(e),
            duration_ms: start.elapsed().as_millis() as u64,
            provider: "gemini".to_string(),
            model: None,
            complexity: None,
            cost_saved: None,
        }),
    }
}

/// Direct Ollama query (bypass HYDRA routing)
#[tauri::command]
async fn ollama_query(prompt: String, model: Option<String>) -> Result<AiResponse, String> {
    let start = std::time::Instant::now();
    let model = model.unwrap_or_else(|| "llama3.2:3b".to_string());

    match execute_ollama(&prompt, &model).await {
        Ok(content) => Ok(AiResponse {
            success: true,
            content,
            error: None,
            duration_ms: start.elapsed().as_millis() as u64,
            provider: "ollama".to_string(),
            model: Some(model),
            complexity: None,
            cost_saved: Some(0.001),
        }),
        Err(e) => Ok(AiResponse {
            success: false,
            content: String::new(),
            error: Some(e),
            duration_ms: start.elapsed().as_millis() as u64,
            provider: "ollama".to_string(),
            model: Some(model),
            complexity: None,
            cost_saved: None,
        }),
    }
}

/// Add task to swarm queue
#[tauri::command]
async fn swarm_add_task(
    id: String,
    prompt: String,
    state: State<'_, Arc<AppState>>,
) -> Result<(), String> {
    let mut tasks = state.swarm_tasks.lock().await;

    tasks.push(SwarmTask {
        id,
        prompt,
        status: TaskStatus::Pending,
        provider: None,
    });

    Ok(())
}

/// Execute all swarm tasks in parallel using HYDRA routing
#[tauri::command]
async fn swarm_execute(
    state: State<'_, Arc<AppState>>,
    window: tauri::Window,
) -> Result<Vec<AiResponse>, String> {
    let mut tasks = state.swarm_tasks.lock().await;

    if tasks.is_empty() {
        return Err("No tasks in swarm queue".to_string());
    }

    info!("Executing {} swarm tasks in parallel", tasks.len());

    for task in tasks.iter_mut() {
        task.status = TaskStatus::Running;
    }

    let prompts: Vec<(String, String)> = tasks
        .iter()
        .map(|t| (t.id.clone(), t.prompt.clone()))
        .collect();

    drop(tasks);

    let handles: Vec<_> = prompts
        .into_iter()
        .map(|(id, prompt)| {
            let window = window.clone();
            tokio::spawn(async move {
                let result = hydra_query(prompt).await;
                let _ = window.emit("swarm-task-complete", (&id, &result));
                (id, result)
            })
        })
        .collect();

    let mut results = Vec::new();
    let mut tasks = state.swarm_tasks.lock().await;

    for handle in handles {
        if let Ok((id, result)) = handle.await {
            if let Some(task) = tasks.iter_mut().find(|t| t.id == id) {
                task.status = if result.as_ref().map(|r| r.success).unwrap_or(false) {
                    TaskStatus::Completed
                } else {
                    TaskStatus::Failed
                };
                task.provider = result.as_ref().ok().map(|r| r.provider.clone());
            }

            if let Ok(r) = result {
                results.push(r);
            }
        }
    }

    Ok(results)
}

/// Clear swarm queue
#[tauri::command]
async fn swarm_clear(state: State<'_, Arc<AppState>>) -> Result<(), String> {
    let mut tasks = state.swarm_tasks.lock().await;
    tasks.clear();
    Ok(())
}

/// Get swarm queue status
#[tauri::command]
async fn swarm_status(state: State<'_, Arc<AppState>>) -> Result<Vec<SwarmTask>, String> {
    let tasks = state.swarm_tasks.lock().await;
    Ok(tasks.clone())
}

/// Health check for all providers
#[tauri::command]
async fn health_check() -> Result<ProviderHealth, String> {
    let gemini_path = get_gemini_path();

    let gemini_ok = Command::new(&gemini_path)
        .arg("--version")
        .output()
        .await
        .map(|o| o.status.success())
        .unwrap_or(false);

    let (ollama_ok, ollama_models) = check_ollama().await;

    info!("Health check: Ollama={}, Gemini={}", ollama_ok, gemini_ok);

    Ok(ProviderHealth {
        ollama: ollama_ok,
        ollama_models,
        gemini: gemini_ok,
        gemini_path,
    })
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tracing_subscriber::fmt()
        .with_env_filter("gemini_gui=info,tauri=warn")
        .init();

    info!("Starting HYDRA GUI (Gemini + Ollama)");
    info!("Gemini path: {}", get_gemini_path());

    let app_state = Arc::new(AppState::default());

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .manage(app_state)
        .invoke_handler(tauri::generate_handler![
            hydra_query,
            hydra_query_stream,
            gemini_query,
            ollama_query,
            swarm_add_task,
            swarm_execute,
            swarm_clear,
            swarm_status,
            health_check,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
