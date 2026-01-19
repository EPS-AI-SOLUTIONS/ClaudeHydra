use serde::{Deserialize, Serialize};
use std::time::SystemTime;

/// Unique identifier for a tab/session
pub type TabId = String;
pub type SessionId = String;

/// CLI Provider enum - which AI backend to use
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum CLIProvider {
    Hydra,    // Claude CLI with HYDRA context
    Gemini,   // Google Gemini CLI
    Jules,    // Google Jules (async)
    DeepSeek, // DeepSeek CLI
    Codex,    // OpenAI Codex
    Grok,     // xAI Grok
    Ollama,   // Local Ollama
}

impl Default for CLIProvider {
    fn default() -> Self {
        Self::Hydra
    }
}

impl std::fmt::Display for CLIProvider {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Hydra => write!(f, "hydra"),
            Self::Gemini => write!(f, "gemini"),
            Self::Jules => write!(f, "jules"),
            Self::DeepSeek => write!(f, "deepseek"),
            Self::Codex => write!(f, "codex"),
            Self::Grok => write!(f, "grok"),
            Self::Ollama => write!(f, "ollama"),
        }
    }
}

/// Status of a prompt in the queue
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum PromptStatus {
    Queued,
    Processing,
    Completed,
    Failed,
    Cancelled,
}

/// Priority levels for prompt queue
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum PromptPriority {
    Low = 0,
    Normal = 1,
    High = 2,
    Critical = 3,
}

impl Default for PromptPriority {
    fn default() -> Self {
        Self::Normal
    }
}

/// A queued prompt request
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QueuedPrompt {
    pub id: String,
    pub tab_id: TabId,
    pub session_id: SessionId,
    pub content: String,
    pub provider: CLIProvider,
    pub priority: PromptPriority,
    pub status: PromptStatus,
    pub created_at: u64, // Unix timestamp ms
    pub started_at: Option<u64>,
    pub completed_at: Option<u64>,
    pub response: Option<String>,
    pub error: Option<String>,
    /// Files this prompt may affect (for conflict detection)
    pub affected_files: Vec<String>,
}

impl QueuedPrompt {
    pub fn new(tab_id: TabId, session_id: SessionId, content: String, provider: CLIProvider) -> Self {
        let now = SystemTime::now()
            .duration_since(SystemTime::UNIX_EPOCH)
            .unwrap()
            .as_millis() as u64;

        Self {
            id: format!("prompt_{}_{}", tab_id, now),
            tab_id,
            session_id,
            content,
            provider,
            priority: PromptPriority::Normal,
            status: PromptStatus::Queued,
            created_at: now,
            started_at: None,
            completed_at: None,
            response: None,
            error: None,
            affected_files: Vec::new(),
        }
    }

    pub fn with_priority(mut self, priority: PromptPriority) -> Self {
        self.priority = priority;
        self
    }

    pub fn with_affected_files(mut self, files: Vec<String>) -> Self {
        self.affected_files = files;
        self
    }
}

/// Message in conversation history
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConversationMessage {
    pub id: String,
    pub role: String, // "user", "assistant", "system"
    pub content: String,
    pub timestamp: u64,
    pub provider: CLIProvider,
}

/// A tab with its own session state
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TabSession {
    pub tab_id: TabId,
    pub session_id: SessionId,
    pub name: String,
    pub provider: CLIProvider,
    pub is_active: bool,
    pub created_at: u64,
    pub last_activity: u64,
    pub conversation: Vec<ConversationMessage>,
    /// Files currently being worked on in this tab
    pub active_files: Vec<String>,
    pub yolo_mode: bool,
}

impl TabSession {
    pub fn new(tab_id: TabId, name: String, provider: CLIProvider) -> Self {
        let now = SystemTime::now()
            .duration_since(SystemTime::UNIX_EPOCH)
            .unwrap()
            .as_millis() as u64;

        Self {
            tab_id: tab_id.clone(),
            session_id: format!("session_{}_{}", tab_id, now),
            name,
            provider,
            is_active: true,
            created_at: now,
            last_activity: now,
            conversation: Vec::new(),
            active_files: Vec::new(),
            yolo_mode: true,
        }
    }

    pub fn add_message(&mut self, role: &str, content: &str, provider: CLIProvider) {
        let now = SystemTime::now()
            .duration_since(SystemTime::UNIX_EPOCH)
            .unwrap()
            .as_millis() as u64;

        self.conversation.push(ConversationMessage {
            id: format!("msg_{}_{}", self.tab_id, now),
            role: role.to_string(),
            content: content.to_string(),
            timestamp: now,
            provider,
        });
        self.last_activity = now;
    }

    pub fn update_active_files(&mut self, files: Vec<String>) {
        self.active_files = files;
        self.last_activity = SystemTime::now()
            .duration_since(SystemTime::UNIX_EPOCH)
            .unwrap()
            .as_millis() as u64;
    }
}

/// Conflict information between tabs
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileConflict {
    pub file_path: String,
    pub tabs_involved: Vec<TabId>,
    pub conflict_type: ConflictType,
    pub detected_at: u64,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ConflictType {
    /// Same file being edited in multiple tabs
    ConcurrentEdit,
    /// File changed on disk since read
    ExternalChange,
    /// Pending changes not yet written
    UncommittedChanges,
}

/// Queue statistics for dashboard
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QueueStats {
    pub total_queued: usize,
    pub processing: usize,
    pub completed_today: usize,
    pub failed_today: usize,
    pub average_wait_ms: u64,
    pub average_process_ms: u64,
}

/// Tab list for frontend
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TabInfo {
    pub tab_id: TabId,
    pub name: String,
    pub provider: CLIProvider,
    pub is_active: bool,
    pub has_unread: bool,
    pub message_count: usize,
    pub last_activity: u64,
    pub has_conflict: bool,
}
