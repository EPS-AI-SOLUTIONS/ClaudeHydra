use serde::Serialize;
use std::sync::Arc;
use tauri::{State, Window};
use tokio::sync::Mutex;

use crate::ollama::client::OllamaClient;
use crate::ollama::types::{ChatMessage, GenerateOptions};

/// Shared Ollama state managed by Tauri
pub struct OllamaState {
    pub client: Arc<Mutex<OllamaClient>>,
}

impl OllamaState {
    pub fn new() -> Self {
        Self {
            client: Arc::new(Mutex::new(OllamaClient::new(None))),
        }
    }
}

#[derive(Debug, Clone, Serialize)]
pub struct BatchResult {
    pub index: usize,
    pub prompt: String,
    pub response: String,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct CpuInfo {
    pub cores: usize,
    pub arch: String,
}

#[tauri::command]
pub async fn ollama_list_models(
    state: State<'_, OllamaState>,
) -> Result<Vec<crate::ollama::types::OllamaModel>, String> {
    let client = state.client.lock().await;
    client.list_models().await
}

#[tauri::command]
pub async fn ollama_health_check(
    state: State<'_, OllamaState>,
) -> Result<bool, String> {
    let client = state.client.lock().await;
    client.health_check().await
}

#[tauri::command]
pub async fn ollama_generate(
    window: Window,
    state: State<'_, OllamaState>,
    request_id: String,
    model: String,
    prompt: String,
    system: Option<String>,
) -> Result<String, String> {
    let client = state.client.lock().await;
    client
        .generate_stream(&window, &request_id, &model, &prompt, system)
        .await
}

#[tauri::command]
pub async fn ollama_generate_sync(
    state: State<'_, OllamaState>,
    model: String,
    prompt: String,
    options: Option<GenerateOptions>,
) -> Result<String, String> {
    let client = state.client.lock().await;
    client.generate_sync(&model, &prompt, options).await
}

#[tauri::command]
pub async fn ollama_chat(
    window: Window,
    state: State<'_, OllamaState>,
    request_id: String,
    model: String,
    messages: Vec<ChatMessage>,
) -> Result<String, String> {
    let client = state.client.lock().await;
    client
        .chat_stream(&window, &request_id, &model, messages)
        .await
}

#[tauri::command]
pub async fn ollama_batch_generate(
    state: State<'_, OllamaState>,
    model: String,
    prompts: Vec<String>,
    options: Option<GenerateOptions>,
) -> Result<Vec<BatchResult>, String> {
    let client = state.client.lock().await;
    let mut results = Vec::new();

    for (index, prompt) in prompts.iter().enumerate() {
        let result = client
            .generate_sync(&model, prompt, options.clone())
            .await;

        results.push(BatchResult {
            index,
            prompt: prompt.clone(),
            response: result.clone().unwrap_or_default(),
            error: result.err(),
        });
    }

    Ok(results)
}

#[tauri::command]
pub fn get_cpu_info() -> Result<CpuInfo, String> {
    Ok(CpuInfo {
        cores: std::thread::available_parallelism()
            .map(|n| n.get())
            .unwrap_or(1),
        arch: std::env::consts::ARCH.to_string(),
    })
}
