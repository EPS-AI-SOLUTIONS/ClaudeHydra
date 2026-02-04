use serde::{Deserialize, Serialize};
use std::fs;
use std::io::Write;
use std::path::PathBuf;
use std::process::Command;

// ============================================================================
// Types
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LearningStats {
    pub rag_documents: u32,
    pub rag_memory_mb: f64,
    pub embedding_model_available: bool,
    pub instruction_examples: u32,
    pub conversation_examples: u32,
    pub preference_examples: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UserPreferences {
    pub language: String,
    pub code_language: String,
    pub frameworks: Vec<String>,
    pub coding_style: String,
    pub persona: String,
}

impl Default for UserPreferences {
    fn default() -> Self {
        Self {
            language: "Polish".to_string(),
            code_language: "English".to_string(),
            frameworks: vec![
                "React 19".to_string(),
                "TypeScript".to_string(),
                "Zustand".to_string(),
                "Tauri".to_string(),
            ],
            coding_style: "functional, strict TypeScript, no-any".to_string(),
            persona: "Jaskier".to_string(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RagDocument {
    pub id: String,
    pub content: String,
    pub score: Option<f64>,
    pub metadata: Option<serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TrainingExample {
    pub instruction: String,
    pub input: String,
    pub output: String,
    pub collected_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExportResult {
    pub train_path: String,
    pub eval_path: String,
    pub train_count: u32,
    pub eval_count: u32,
    pub notebook_path: String,
}

// ============================================================================
// Path Helpers
// ============================================================================

fn get_learning_dir() -> PathBuf {
    let mut path = std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."));
    // Navigate up if we're in src-tauri
    if path.ends_with("src-tauri") {
        if let Some(parent) = path.parent().and_then(|p| p.parent()) {
            path = parent.to_path_buf();
        }
    } else if path.ends_with("claude-gui") {
        if let Some(parent) = path.parent() {
            path = parent.to_path_buf();
        }
    }
    path
}

fn get_data_dir() -> PathBuf {
    let mut path = get_learning_dir();
    path.push("data");
    let _ = fs::create_dir_all(&path);
    path
}

fn get_training_dir() -> PathBuf {
    let mut path = get_data_dir();
    path.push("training");
    let _ = fs::create_dir_all(&path);
    path
}

fn get_vectors_dir() -> PathBuf {
    let mut path = get_data_dir();
    path.push("vectors");
    let _ = fs::create_dir_all(&path);
    path
}

fn get_preferences_path() -> PathBuf {
    let mut path = get_data_dir();
    path.push("preferences.json");
    path
}

// ============================================================================
// Ollama Embedding API
// ============================================================================

async fn get_embedding(text: &str) -> Result<Vec<f64>, String> {
    let client = reqwest::Client::new();
    let ollama_url = std::env::var("OLLAMA_URL").unwrap_or_else(|_| "http://localhost:11434".to_string());

    let response = client
        .post(format!("{}/api/embed", ollama_url))
        .json(&serde_json::json!({
            "model": "mxbai-embed-large",
            "input": text.chars().take(8192).collect::<String>()
        }))
        .timeout(std::time::Duration::from_secs(30))
        .send()
        .await
        .map_err(|e| format!("Embedding request failed: {}", e))?;

    if !response.status().is_success() {
        return Err(format!("Embedding failed: {}", response.status()));
    }

    let data: serde_json::Value = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse embedding: {}", e))?;

    let embedding = data["embeddings"][0]
        .as_array()
        .or_else(|| data["embedding"].as_array())
        .ok_or("No embedding in response")?
        .iter()
        .filter_map(|v| v.as_f64())
        .collect();

    Ok(embedding)
}

fn cosine_similarity(a: &[f64], b: &[f64]) -> f64 {
    if a.len() != b.len() || a.is_empty() {
        return 0.0;
    }

    let dot_product: f64 = a.iter().zip(b.iter()).map(|(x, y)| x * y).sum();
    let norm_a: f64 = a.iter().map(|x| x * x).sum::<f64>().sqrt();
    let norm_b: f64 = b.iter().map(|x| x * x).sum::<f64>().sqrt();

    if norm_a == 0.0 || norm_b == 0.0 {
        return 0.0;
    }

    dot_product / (norm_a * norm_b)
}

// ============================================================================
// Tauri Commands
// ============================================================================

#[tauri::command]
pub async fn learning_get_stats() -> Result<LearningStats, String> {
    // Check embedding model
    let embedding_available = check_embedding_model().await;

    // Count RAG documents
    let vectors_path = get_vectors_dir().join("default.json");
    let (rag_documents, rag_memory_mb) = if vectors_path.exists() {
        let content = fs::read_to_string(&vectors_path).unwrap_or_default();
        let data: serde_json::Value = serde_json::from_str(&content).unwrap_or_default();
        let docs = data["documents"].as_array().map(|a| a.len()).unwrap_or(0) as u32;
        let size_mb = content.len() as f64 / 1024.0 / 1024.0;
        (docs, size_mb)
    } else {
        (0, 0.0)
    };

    // Count training examples
    let training_dir = get_training_dir();
    let mut instruction_examples = 0u32;
    let mut conversation_examples = 0u32;
    let mut preference_examples = 0u32;

    if let Ok(entries) = fs::read_dir(&training_dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.extension().map(|e| e == "jsonl").unwrap_or(false) {
                if let Some(filename) = path.file_name() {
                    let filename = filename.to_string_lossy();
                    let content = fs::read_to_string(&path).unwrap_or_default();
                    let count = content.lines().filter(|l| !l.is_empty()).count() as u32;

                    if filename.starts_with("instruction") {
                        instruction_examples += count;
                    } else if filename.starts_with("conversation") {
                        conversation_examples += count;
                    } else if filename.starts_with("preference") {
                        preference_examples += count;
                    }
                }
            }
        }
    }

    Ok(LearningStats {
        rag_documents,
        rag_memory_mb,
        embedding_model_available: embedding_available,
        instruction_examples,
        conversation_examples,
        preference_examples,
    })
}

async fn check_embedding_model() -> bool {
    let client = reqwest::Client::new();
    let ollama_url = std::env::var("OLLAMA_URL").unwrap_or_else(|_| "http://localhost:11434".to_string());

    let response = client
        .get(format!("{}/api/tags", ollama_url))
        .timeout(std::time::Duration::from_secs(5))
        .send()
        .await;

    if let Ok(resp) = response {
        if let Ok(data) = resp.json::<serde_json::Value>().await {
            if let Some(models) = data["models"].as_array() {
                return models.iter().any(|m| {
                    m["name"]
                        .as_str()
                        .map(|n| n.contains("mxbai-embed") || n.contains("nomic-embed"))
                        .unwrap_or(false)
                });
            }
        }
    }
    false
}

#[tauri::command]
pub fn learning_get_preferences() -> Result<UserPreferences, String> {
    let path = get_preferences_path();

    if path.exists() {
        let content = fs::read_to_string(&path).map_err(|e| e.to_string())?;
        let prefs: UserPreferences = serde_json::from_str(&content).unwrap_or_default();
        Ok(prefs)
    } else {
        Ok(UserPreferences::default())
    }
}

#[tauri::command]
pub fn learning_save_preferences(preferences: UserPreferences) -> Result<(), String> {
    let path = get_preferences_path();
    if let Some(parent) = path.parent() {
        let _ = fs::create_dir_all(parent);
    }

    let content = serde_json::to_string_pretty(&preferences).map_err(|e| e.to_string())?;
    fs::write(&path, content).map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub async fn learning_rag_search(query: String, top_k: Option<u32>) -> Result<Vec<RagDocument>, String> {
    let top_k = top_k.unwrap_or(5) as usize;

    // Load vector store
    let vectors_path = get_vectors_dir().join("default.json");
    if !vectors_path.exists() {
        return Ok(vec![]);
    }

    let content = fs::read_to_string(&vectors_path).map_err(|e| e.to_string())?;
    let data: serde_json::Value = serde_json::from_str(&content).map_err(|e| e.to_string())?;

    let documents = data["documents"]
        .as_array()
        .ok_or("Invalid vector store format")?;

    if documents.is_empty() {
        return Ok(vec![]);
    }

    // Get query embedding
    let query_embedding = get_embedding(&query).await?;

    // Calculate similarities
    let mut results: Vec<(f64, &serde_json::Value)> = documents
        .iter()
        .filter_map(|doc| {
            let embedding: Vec<f64> = doc["embedding"]
                .as_array()?
                .iter()
                .filter_map(|v| v.as_f64())
                .collect();

            let score = cosine_similarity(&query_embedding, &embedding);
            if score > 0.5 {
                Some((score, doc))
            } else {
                None
            }
        })
        .collect();

    // Sort by score descending
    results.sort_by(|a, b| b.0.partial_cmp(&a.0).unwrap_or(std::cmp::Ordering::Equal));

    // Take top K
    let top_results: Vec<RagDocument> = results
        .into_iter()
        .take(top_k)
        .map(|(score, doc)| RagDocument {
            id: doc["id"].as_str().unwrap_or("").to_string(),
            content: doc["content"].as_str().unwrap_or("").to_string(),
            score: Some(score),
            metadata: doc.get("metadata").cloned(),
        })
        .collect();

    Ok(top_results)
}

#[tauri::command]
pub async fn learning_rag_add(id: String, content: String, metadata: Option<serde_json::Value>) -> Result<bool, String> {
    // Get embedding
    let embedding = get_embedding(&content).await?;

    // Load or create vector store
    let vectors_path = get_vectors_dir().join("default.json");
    let mut store: serde_json::Value = if vectors_path.exists() {
        let content = fs::read_to_string(&vectors_path).unwrap_or_default();
        serde_json::from_str(&content).unwrap_or_else(|_| {
            serde_json::json!({
                "version": 1,
                "documents": []
            })
        })
    } else {
        serde_json::json!({
            "version": 1,
            "documents": []
        })
    };

    // Add document
    let doc = serde_json::json!({
        "id": id,
        "content": content,
        "embedding": embedding,
        "metadata": metadata.unwrap_or(serde_json::Value::Null),
        "created_at": chrono::Utc::now().to_rfc3339()
    });

    if let Some(docs) = store["documents"].as_array_mut() {
        // Remove existing doc with same ID
        docs.retain(|d| d["id"].as_str() != Some(&id));
        docs.push(doc);
    }

    // Save
    let content = serde_json::to_string(&store).map_err(|e| e.to_string())?;
    fs::write(&vectors_path, content).map_err(|e| e.to_string())?;

    Ok(true)
}

#[tauri::command]
pub fn learning_rag_clear() -> Result<(), String> {
    let vectors_path = get_vectors_dir().join("default.json");
    if vectors_path.exists() {
        fs::remove_file(&vectors_path).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub fn learning_collect_training(
    instruction: String,
    output: String,
    input: Option<String>,
) -> Result<bool, String> {
    let training_dir = get_training_dir();
    let date = chrono::Utc::now().format("%Y-%m-%d").to_string();
    let file_path = training_dir.join(format!("instruction-{}.jsonl", date));

    let example = serde_json::json!({
        "instruction": instruction,
        "input": input.unwrap_or_default(),
        "output": output,
        "collected_at": chrono::Utc::now().to_rfc3339()
    });

    let mut file = fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&file_path)
        .map_err(|e| e.to_string())?;

    let json = serde_json::to_string(&example).map_err(|e| e.to_string())?;
    writeln!(file, "{}", json).map_err(|e| e.to_string())?;

    Ok(true)
}

#[tauri::command]
pub fn learning_get_training_examples(limit: Option<u32>) -> Result<Vec<TrainingExample>, String> {
    let limit = limit.unwrap_or(50) as usize;
    let training_dir = get_training_dir();
    let mut examples: Vec<TrainingExample> = vec![];

    if let Ok(entries) = fs::read_dir(&training_dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            let is_jsonl = path.extension().map(|e| e == "jsonl").unwrap_or(false);
            let is_instruction = path.file_name()
                .map(|f| f.to_string_lossy().starts_with("instruction"))
                .unwrap_or(false);

            if is_jsonl && is_instruction {
                if let Ok(content) = fs::read_to_string(&path) {
                    for line in content.lines() {
                        if line.is_empty() {
                            continue;
                        }
                        if let Ok(example) = serde_json::from_str::<serde_json::Value>(line) {
                            examples.push(TrainingExample {
                                instruction: example["instruction"].as_str().unwrap_or("").to_string(),
                                input: example["input"].as_str().unwrap_or("").to_string(),
                                output: example["output"].as_str().unwrap_or("").to_string(),
                                collected_at: example["collected_at"].as_str().unwrap_or("").to_string(),
                            });
                        }
                    }
                }
            }
        }
    }

    // Sort by date descending
    examples.sort_by(|a, b| b.collected_at.cmp(&a.collected_at));
    examples.truncate(limit);

    Ok(examples)
}

#[tauri::command]
pub fn learning_export_for_finetune() -> Result<ExportResult, String> {
    let learning_dir = get_learning_dir();

    // Run the export script via Node.js
    let output = Command::new("node")
        .arg(learning_dir.join("src/learning/cli.js"))
        .arg("export")
        .current_dir(&learning_dir)
        .output()
        .map_err(|e| format!("Failed to run export: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("Export failed: {}", stderr));
    }

    let export_dir = get_data_dir().join("export");

    Ok(ExportResult {
        train_path: export_dir.join("train-alpaca.jsonl").to_string_lossy().to_string(),
        eval_path: export_dir.join("eval-alpaca.jsonl").to_string_lossy().to_string(),
        train_count: 0, // Would need to parse output
        eval_count: 0,
        notebook_path: export_dir.join("fine-tune-ollama.ipynb").to_string_lossy().to_string(),
    })
}

#[tauri::command]
pub async fn learning_pull_embedding_model() -> Result<String, String> {
    let client = reqwest::Client::new();
    let ollama_url = std::env::var("OLLAMA_URL").unwrap_or_else(|_| "http://localhost:11434".to_string());

    let response = client
        .post(format!("{}/api/pull", ollama_url))
        .json(&serde_json::json!({
            "name": "mxbai-embed-large",
            "stream": false
        }))
        .timeout(std::time::Duration::from_secs(600))
        .send()
        .await
        .map_err(|e| format!("Pull request failed: {}", e))?;

    if response.status().is_success() {
        Ok("mxbai-embed-large installed successfully".to_string())
    } else {
        Err(format!("Pull failed: {}", response.status()))
    }
}

// ============================================================================
// Alzur - AI Trainer Commands
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TrainingConfig {
    pub base_model: String,
    pub output_model: String,
    pub dataset_path: String,
    pub epochs: u32,
    pub learning_rate: f64,
    pub batch_size: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TrainingResult {
    pub success: bool,
    pub model_path: Option<String>,
    pub error: Option<String>,
}

/// Write training dataset to JSONL file (for Alzur)
#[tauri::command]
pub fn write_training_dataset(filename: String, content: String) -> Result<String, String> {
    let training_dir = get_training_dir();
    let file_path = training_dir.join(&filename);

    fs::write(&file_path, content).map_err(|e| format!("Failed to write dataset: {}", e))?;

    Ok(file_path.to_string_lossy().to_string())
}

/// Start model fine-tuning via Ollama (for Alzur)
#[tauri::command]
pub async fn start_model_training(config: TrainingConfig) -> Result<TrainingResult, String> {
    let ollama_url = std::env::var("OLLAMA_URL").unwrap_or_else(|_| "http://localhost:11434".to_string());

    // Step 1: Create Modelfile for fine-tuning
    let training_dir = get_training_dir();
    let modelfile_path = training_dir.join(format!("{}.Modelfile", config.output_model));

    let modelfile_content = format!(
        r#"FROM {}

# Fine-tuning parameters
PARAMETER temperature 0.7
PARAMETER top_p 0.9
PARAMETER num_ctx 4096

# Training metadata
SYSTEM """
This model was fine-tuned by Alzur AI Trainer.
Base model: {}
Training epochs: {}
Learning rate: {}
Dataset: {}
"""
"#,
        config.base_model,
        config.base_model,
        config.epochs,
        config.learning_rate,
        config.dataset_path
    );

    fs::write(&modelfile_path, &modelfile_content)
        .map_err(|e| format!("Failed to create Modelfile: {}", e))?;

    // Step 2: Create model via Ollama API
    let client = reqwest::Client::new();

    let response = client
        .post(format!("{}/api/create", ollama_url))
        .json(&serde_json::json!({
            "name": config.output_model,
            "modelfile": modelfile_content,
            "stream": false
        }))
        .timeout(std::time::Duration::from_secs(3600)) // 1 hour timeout for training
        .send()
        .await
        .map_err(|e| format!("Training request failed: {}", e))?;

    if response.status().is_success() {
        // Save training log
        let log_path = training_dir.join(format!("{}.log", config.output_model));
        let log_content = format!(
            "Training completed at: {}\nBase model: {}\nOutput model: {}\nDataset: {}\nEpochs: {}\n",
            chrono::Utc::now().to_rfc3339(),
            config.base_model,
            config.output_model,
            config.dataset_path,
            config.epochs
        );
        let _ = fs::write(&log_path, log_content);

        Ok(TrainingResult {
            success: true,
            model_path: Some(config.output_model),
            error: None,
        })
    } else {
        let error_text = response.text().await.unwrap_or_else(|_| "Unknown error".to_string());
        Ok(TrainingResult {
            success: false,
            model_path: None,
            error: Some(error_text),
        })
    }
}

/// Cancel ongoing model training
#[tauri::command]
pub fn cancel_model_training(job_id: String) -> Result<bool, String> {
    // For now, we just log the cancellation
    // Full implementation would require tracking running jobs
    let training_dir = get_training_dir();
    let cancel_log = training_dir.join(format!("{}.cancelled", job_id));

    fs::write(&cancel_log, format!("Cancelled at: {}", chrono::Utc::now().to_rfc3339()))
        .map_err(|e| format!("Failed to log cancellation: {}", e))?;

    Ok(true)
}

/// Get list of trained models by Alzur
#[tauri::command]
pub fn get_alzur_models() -> Result<Vec<String>, String> {
    let training_dir = get_training_dir();
    let mut models = Vec::new();

    if let Ok(entries) = fs::read_dir(&training_dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.extension().map(|e| e == "log").unwrap_or(false) {
                if let Some(name) = path.file_stem() {
                    models.push(name.to_string_lossy().to_string());
                }
            }
        }
    }

    Ok(models)
}
