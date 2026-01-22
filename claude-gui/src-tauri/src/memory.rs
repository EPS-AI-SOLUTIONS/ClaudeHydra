use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MemoryEntry {
    pub id: String,
    pub timestamp: String,
    pub agent: String,
    #[serde(rename = "type")]
    pub entry_type: String,
    pub content: String,
    pub tags: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct KnowledgeNode {
    pub id: String,
    #[serde(rename = "type")]
    pub node_type: String,
    pub label: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct KnowledgeEdge {
    pub source: String,
    pub target: String,
    pub label: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct KnowledgeGraph {
    pub nodes: Vec<KnowledgeNode>,
    pub edges: Vec<KnowledgeEdge>,
}

impl Default for KnowledgeGraph {
    fn default() -> Self {
        Self {
            nodes: vec![
                KnowledgeNode {
                    id: "ClaudeHydra".to_string(),
                    node_type: "project".to_string(),
                    label: Some("ClaudeHydra".to_string()),
                },
                KnowledgeNode {
                    id: "React".to_string(),
                    node_type: "framework".to_string(),
                    label: Some("React 19".to_string()),
                },
                KnowledgeNode {
                    id: "Tauri".to_string(),
                    node_type: "framework".to_string(),
                    label: Some("Tauri 2".to_string()),
                },
                KnowledgeNode {
                    id: "TypeScript".to_string(),
                    node_type: "language".to_string(),
                    label: Some("TypeScript".to_string()),
                },
                KnowledgeNode {
                    id: "Rust".to_string(),
                    node_type: "language".to_string(),
                    label: Some("Rust".to_string()),
                },
            ],
            edges: vec![
                KnowledgeEdge {
                    source: "ClaudeHydra".to_string(),
                    target: "React".to_string(),
                    label: "frontend".to_string(),
                },
                KnowledgeEdge {
                    source: "ClaudeHydra".to_string(),
                    target: "Tauri".to_string(),
                    label: "desktop".to_string(),
                },
                KnowledgeEdge {
                    source: "ClaudeHydra".to_string(),
                    target: "TypeScript".to_string(),
                    label: "written_in".to_string(),
                },
                KnowledgeEdge {
                    source: "Tauri".to_string(),
                    target: "Rust".to_string(),
                    label: "powered_by".to_string(),
                },
            ],
        }
    }
}

fn get_memories_path() -> PathBuf {
    let mut path = dirs::data_local_dir().unwrap_or_else(|| PathBuf::from("."));
    path.push("claude-cli");
    path.push("memories");

    // Ensure directory exists
    let _ = fs::create_dir_all(&path);

    path
}

fn get_agent_memory_file(agent: &str) -> PathBuf {
    let mut path = get_memories_path();
    path.push(format!("{}.jsonl", agent.to_lowercase()));
    path
}

#[tauri::command]
pub fn get_agent_memories(agent: String, limit: Option<u32>) -> Result<Vec<MemoryEntry>, String> {
    let path = get_agent_memory_file(&agent);
    let limit = limit.unwrap_or(50) as usize;

    if !path.exists() {
        // Return empty with default initialization message
        return Ok(vec![
            MemoryEntry {
                id: uuid::Uuid::new_v4().to_string(),
                timestamp: chrono::Utc::now().to_rfc3339(),
                agent: agent.clone(),
                entry_type: "fact".to_string(),
                content: format!("{} initialized. Ready for tasks.", agent),
                tags: "init,system".to_string(),
            }
        ]);
    }

    let content = fs::read_to_string(&path).map_err(|e| e.to_string())?;
    let mut entries: Vec<MemoryEntry> = content
        .lines()
        .filter_map(|line| serde_json::from_str(line).ok())
        .collect();

    // Sort by timestamp descending and limit
    entries.sort_by(|a, b| b.timestamp.cmp(&a.timestamp));
    entries.truncate(limit);

    Ok(entries)
}

#[tauri::command]
pub fn add_agent_memory(
    agent: String,
    entry_type: String,
    content: String,
    tags: String,
) -> Result<MemoryEntry, String> {
    let entry = MemoryEntry {
        id: uuid::Uuid::new_v4().to_string(),
        timestamp: chrono::Utc::now().to_rfc3339(),
        agent: agent.clone(),
        entry_type,
        content,
        tags,
    };

    let path = get_agent_memory_file(&agent);
    let line = serde_json::to_string(&entry).map_err(|e| e.to_string())?;

    // Append to file
    use std::io::Write;
    let mut file = fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&path)
        .map_err(|e| e.to_string())?;

    writeln!(file, "{}", line).map_err(|e| e.to_string())?;

    Ok(entry)
}

#[tauri::command]
pub fn clear_agent_memories(agent: String) -> Result<(), String> {
    let path = get_agent_memory_file(&agent);

    if path.exists() {
        fs::remove_file(&path).map_err(|e| e.to_string())?;
    }

    Ok(())
}

#[tauri::command]
pub fn get_knowledge_graph() -> Result<KnowledgeGraph, String> {
    let mut path = get_memories_path();
    path.push("knowledge_graph.json");

    if path.exists() {
        let content = fs::read_to_string(&path).map_err(|e| e.to_string())?;
        let graph: KnowledgeGraph = serde_json::from_str(&content).unwrap_or_default();
        Ok(graph)
    } else {
        // Return default graph
        Ok(KnowledgeGraph::default())
    }
}

#[tauri::command]
pub fn update_knowledge_graph(graph: KnowledgeGraph) -> Result<(), String> {
    let mut path = get_memories_path();
    path.push("knowledge_graph.json");

    let content = serde_json::to_string_pretty(&graph).map_err(|e| e.to_string())?;
    fs::write(&path, content).map_err(|e| e.to_string())?;

    Ok(())
}
