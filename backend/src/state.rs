// Jaskier Shared Pattern — state
// ClaudeHydra v4 - Application state

use std::collections::HashMap;
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Instant;

use sqlx::PgPool;
use tokio::sync::RwLock;

// Re-export log types from shared crate so main.rs and other modules can use `crate::state::LogEntry` etc.
pub use jaskier_core::logs::{LogEntry, LogRingBuffer};
// Re-export CircuitBreaker from shared crate.
pub use jaskier_core::circuit_breaker::CircuitBreaker;
// Re-export PKCE types from shared crate so other modules can use `crate::state::OAuthPkceState`.
pub use jaskier_oauth::pkce::{OAUTH_STATE_TTL, OAuthPkceState};
// Re-export SystemSnapshot from shared crate.
pub use jaskier_tools::system_monitor::SystemSnapshot;

use crate::mcp::client::McpClientManager;
use crate::model_registry::ModelCache;
use crate::models::WitcherAgent;
use crate::tools::ToolExecutor;

// ── Shared: RuntimeState ────────────────────────────────────────────────────
/// Mutable runtime state (not persisted — lost on restart).
pub struct RuntimeState {
    pub api_keys: HashMap<String, String>,
}

// ── Shared: AppState (project-specific fields vary) ─────────────────────────
/// Central application state. Clone-friendly — PgPool and Arc are both Clone.
#[derive(Clone)]
pub struct AppState {
    pub db: PgPool,
    pub agents: Arc<RwLock<Vec<WitcherAgent>>>,
    pub runtime: Arc<RwLock<RuntimeState>>,
    pub model_cache: Arc<RwLock<ModelCache>>,
    pub start_time: Instant,
    pub http_client: reqwest::Client,
    pub tool_executor: Arc<ToolExecutor>,
    /// Anthropic OAuth PKCE states keyed by state param (concurrent-safe, TTL 10min).
    pub oauth_pkce: Arc<RwLock<HashMap<String, OAuthPkceState>>>,
    /// Google OAuth PKCE states keyed by state param (concurrent-safe, TTL 10min).
    pub google_oauth_pkce: Arc<RwLock<HashMap<String, OAuthPkceState>>>,
    /// GitHub OAuth states keyed by state param (concurrent-safe, TTL 10min).
    pub github_oauth_states: Arc<RwLock<HashMap<String, tokio::time::Instant>>>,
    /// Vercel OAuth states keyed by state param (concurrent-safe, TTL 10min).
    pub vercel_oauth_states: Arc<RwLock<HashMap<String, tokio::time::Instant>>>,
    /// Runtime API keys map (mirrors `runtime.api_keys`) — required by `HasGoogleOAuthState`.
    pub api_keys: Arc<RwLock<HashMap<String, String>>>,
    /// `true` once startup_sync completes (or times out).
    pub ready: Arc<AtomicBool>,
    /// Cached system stats (CPU, memory) refreshed every 5s by background task.
    pub system_monitor: Arc<RwLock<SystemSnapshot>>,
    /// Optional auth secret from AUTH_SECRET env. None = dev mode (no auth).
    pub auth_secret: Option<String>,
    /// Circuit breaker for upstream Anthropic API — Jaskier Shared Pattern
    pub circuit_breaker: Arc<CircuitBreaker>,
    /// MCP client manager — connects to external MCP servers
    pub mcp_client: Arc<McpClientManager>,
    /// `false` when OAuth token was rejected by Gemini API (401/403).
    /// Causes credential resolution to skip OAuth and use API key.
    /// Reset to `true` on new OAuth login.
    pub oauth_gemini_valid: Arc<AtomicBool>,
    /// In-memory ring buffer for backend log entries (last 1000).
    pub log_buffer: Arc<LogRingBuffer>,
    /// Cached system prompts for agent warm pool (key: "{language}", value: system prompt).
    pub prompt_cache: Arc<RwLock<HashMap<String, String>>>,
    /// Cached browser proxy health status, updated by watchdog every 30s.
    pub browser_proxy_status: Arc<RwLock<crate::browser_proxy::BrowserProxyStatus>>,
    /// Ring buffer of proxy health status change events (last 50).
    pub browser_proxy_history: Arc<crate::browser_proxy::ProxyHealthHistory>,
    /// Broadcast channel for real-time A2A delegation updates.
    pub a2a_task_tx: tokio::sync::broadcast::Sender<serde_json::Value>,
    /// Semaphore limiting concurrent A2A delegations (max 5 system-wide).
    pub a2a_semaphore: Arc<tokio::sync::Semaphore>,
}

// ── Shared: readiness helpers ───────────────────────────────────────────────
impl AppState {
    pub fn is_ready(&self) -> bool {
        self.ready.load(Ordering::Relaxed)
    }

    pub fn mark_ready(&self) {
        self.ready.store(true, Ordering::Relaxed);
        tracing::info!("Backend marked as READY");
    }

    /// Refresh agents list from the hardcoded definitions.
    /// In the future, this could reload from DB.
    pub async fn refresh_agents(&self) {
        let new_agents = init_witcher_agents();
        let count = new_agents.len();
        let mut lock = self.agents.write().await;
        *lock = new_agents;
        tracing::info!("Agents refreshed — {} agents loaded", count);
    }
}

impl AppState {
    pub fn new(db: PgPool, log_buffer: Arc<LogRingBuffer>) -> Self {
        let mut api_keys = HashMap::new();
        if let Ok(key) = std::env::var("ANTHROPIC_API_KEY") {
            api_keys.insert("ANTHROPIC_API_KEY".to_string(), key);
        }
        if let Ok(key) = std::env::var("GOOGLE_API_KEY") {
            api_keys.insert("GOOGLE_API_KEY".to_string(), key);
        }

        let auth_secret = std::env::var("AUTH_SECRET").ok().filter(|s| !s.is_empty());
        if auth_secret.is_some() {
            tracing::info!("AUTH_SECRET configured — authentication enabled");
        } else {
            tracing::info!("AUTH_SECRET not set — authentication disabled (dev mode)");
        }

        let agents = Arc::new(RwLock::new(init_witcher_agents()));

        tracing::info!(
            "AppState initialised — keys: {:?}",
            api_keys.keys().collect::<Vec<_>>()
        );

        let http_client = reqwest::Client::builder()
            .pool_max_idle_per_host(10)
            .timeout(std::time::Duration::from_secs(120))
            .connect_timeout(std::time::Duration::from_secs(5))
            .build()
            .expect("Failed to build HTTP client");

        let tool_executor = Arc::new(ToolExecutor::new(http_client.clone(), api_keys.clone()));

        let mcp_client = Arc::new(McpClientManager::new(db.clone(), http_client.clone()));

        let (a2a_task_tx, _) = tokio::sync::broadcast::channel(100);

        let api_keys_arc = Arc::new(RwLock::new(api_keys.clone()));

        Self {
            db,
            agents,
            runtime: Arc::new(RwLock::new(RuntimeState { api_keys })),
            api_keys: api_keys_arc,
            model_cache: Arc::new(RwLock::new(ModelCache::new())),
            start_time: Instant::now(),
            http_client,
            tool_executor,
            oauth_pkce: Arc::new(RwLock::new(HashMap::new())),
            google_oauth_pkce: Arc::new(RwLock::new(HashMap::new())),
            github_oauth_states: Arc::new(RwLock::new(HashMap::new())),
            vercel_oauth_states: Arc::new(RwLock::new(HashMap::new())),
            ready: Arc::new(AtomicBool::new(false)),
            system_monitor: Arc::new(RwLock::new(SystemSnapshot::default())),
            auth_secret,
            circuit_breaker: Arc::new(CircuitBreaker::new("anthropic")),
            mcp_client,
            oauth_gemini_valid: Arc::new(AtomicBool::new(true)),
            log_buffer,
            prompt_cache: Arc::new(RwLock::new(HashMap::new())),
            browser_proxy_status: Arc::new(RwLock::new(
                crate::browser_proxy::BrowserProxyStatus::default(),
            )),
            browser_proxy_history: Arc::new(crate::browser_proxy::ProxyHealthHistory::new(50)),
            a2a_task_tx,
            a2a_semaphore: Arc::new(tokio::sync::Semaphore::new(5)),
        }
    }

    /// Test-only constructor — uses `connect_lazy` so no real DB is needed.
    /// Only suitable for endpoints that don't issue SQL queries (or that
    /// gracefully handle DB errors, e.g. `.ok()?`).
    #[doc(hidden)]
    pub fn new_test() -> Self {
        let agents = Arc::new(RwLock::new(init_witcher_agents()));

        let http_client = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(5))
            .build()
            .expect("Failed to build HTTP client");

        let db = PgPool::connect_lazy("postgres://test@localhost:19999/test").expect("lazy pool");

        let (a2a_task_tx, _) = tokio::sync::broadcast::channel(100);

        Self {
            mcp_client: Arc::new(McpClientManager::new(db.clone(), http_client.clone())),
            db,
            agents,
            runtime: Arc::new(RwLock::new(RuntimeState {
                api_keys: HashMap::new(),
            })),
            api_keys: Arc::new(RwLock::new(HashMap::new())),
            model_cache: Arc::new(RwLock::new(ModelCache::new())),
            start_time: Instant::now(),
            http_client: http_client.clone(),
            tool_executor: Arc::new(ToolExecutor::new(http_client, HashMap::new())),
            oauth_pkce: Arc::new(RwLock::new(HashMap::new())),
            google_oauth_pkce: Arc::new(RwLock::new(HashMap::new())),
            github_oauth_states: Arc::new(RwLock::new(HashMap::new())),
            vercel_oauth_states: Arc::new(RwLock::new(HashMap::new())),
            ready: Arc::new(AtomicBool::new(false)),
            system_monitor: Arc::new(RwLock::new(SystemSnapshot::default())),
            auth_secret: None,
            circuit_breaker: Arc::new(CircuitBreaker::new("anthropic")),
            oauth_gemini_valid: Arc::new(AtomicBool::new(true)),
            log_buffer: Arc::new(LogRingBuffer::new(1000)),
            prompt_cache: Arc::new(RwLock::new(HashMap::new())),
            browser_proxy_status: Arc::new(RwLock::new(
                crate::browser_proxy::BrowserProxyStatus::default(),
            )),
            browser_proxy_history: Arc::new(crate::browser_proxy::ProxyHealthHistory::new(50)),
            a2a_task_tx,
            a2a_semaphore: Arc::new(tokio::sync::Semaphore::new(5)),
        }
    }
}

// ── jaskier-core trait implementations ───────────────────────────────────────

impl jaskier_core::auth::HasAuthSecret for AppState {
    fn auth_secret(&self) -> Option<&str> {
        self.auth_secret.as_deref()
    }
}

impl jaskier_core::logs::HasLogBuffer for AppState {
    fn log_buffer(&self) -> &Arc<LogRingBuffer> {
        &self.log_buffer
    }
}

// ── jaskier-oauth trait implementations ──────────────────────────────────────

impl jaskier_oauth::google::HasGoogleOAuthState for AppState {
    fn db(&self) -> &sqlx::PgPool { &self.db }
    fn http_client(&self) -> &reqwest::Client { &self.http_client }
    fn runtime_api_keys(&self) -> &Arc<RwLock<HashMap<String, String>>> { &self.api_keys }
    fn oauth_pkce_states(&self) -> &Arc<RwLock<HashMap<String, OAuthPkceState>>> { &self.google_oauth_pkce }
    fn oauth_gemini_valid(&self) -> &Arc<std::sync::atomic::AtomicBool> { &self.oauth_gemini_valid }
    fn google_auth_table(&self) -> &'static str { "ch_google_auth" }
    fn default_port(&self) -> &'static str { "8082" }
}

impl jaskier_oauth::github::HasGitHubOAuthState for AppState {
    fn db(&self) -> &sqlx::PgPool { &self.db }
    fn http_client(&self) -> &reqwest::Client { &self.http_client }
    fn github_oauth_states(&self) -> &Arc<RwLock<HashMap<String, tokio::time::Instant>>> { &self.github_oauth_states }
    fn github_oauth_table(&self) -> &'static str { "ch_oauth_github" }
}

impl jaskier_oauth::vercel::HasVercelOAuthState for AppState {
    fn db(&self) -> &sqlx::PgPool { &self.db }
    fn http_client(&self) -> &reqwest::Client { &self.http_client }
    fn vercel_oauth_states(&self) -> &Arc<RwLock<HashMap<String, tokio::time::Instant>>> { &self.vercel_oauth_states }
    fn vercel_oauth_table(&self) -> &'static str { "ch_oauth_vercel" }
}

impl jaskier_oauth::service_tokens::HasServiceTokensState for AppState {
    fn db(&self) -> &sqlx::PgPool { &self.db }
    fn service_tokens_table(&self) -> &'static str { "ch_service_tokens" }
}

impl jaskier_browser::browser_proxy::HasBrowserProxyState for AppState {
    fn http_client(&self) -> &reqwest::Client { &self.http_client }
    fn browser_proxy_status(&self) -> &Arc<RwLock<jaskier_browser::browser_proxy::BrowserProxyStatus>> {
        &self.browser_proxy_status
    }
}

impl jaskier_core::model_registry::HasModelRegistryState for AppState {
    fn model_cache(&self) -> &Arc<RwLock<crate::model_registry::ModelCache>> { &self.model_cache }
    fn anthropic_api_key(&self) -> Option<String> {
        self.api_keys.try_read().ok()?.get("ANTHROPIC_API_KEY").cloned()
    }
    fn model_pins_table(&self) -> &'static str { "ch_model_pins" }
    fn settings_table(&self) -> &'static str { "ch_settings" }
    fn audit_log_table(&self) -> &'static str { "ch_audit_log" }
}

impl jaskier_browser::watchdog::HasWatchdogState for AppState {
    fn browser_proxy_status(&self) -> &Arc<RwLock<jaskier_browser::browser_proxy::BrowserProxyStatus>> {
        &self.browser_proxy_status
    }
    fn browser_proxy_history(&self) -> &Arc<jaskier_browser::browser_proxy::ProxyHealthHistory> {
        &self.browser_proxy_history
    }
}

// ── jaskier-core sessions trait implementation ───────────────────────────────

impl jaskier_core::sessions::HasSessionsState for AppState {
    fn db(&self) -> &sqlx::PgPool { &self.db }

    // ── Table names ──────────────────────────────────────────────────────
    fn sessions_table(&self) -> &'static str { "ch_sessions" }
    fn messages_table(&self) -> &'static str { "ch_messages" }
    fn settings_table(&self) -> &'static str { "ch_settings" }
    fn memory_table(&self) -> &'static str { "ch_memories" }
    fn knowledge_nodes_table(&self) -> &'static str { "ch_knowledge_nodes" }
    fn knowledge_edges_table(&self) -> &'static str { "ch_knowledge_edges" }
    fn prompt_history_table(&self) -> &'static str { "ch_prompt_history" }
    fn ratings_table(&self) -> &'static str { "ch_ratings" }
    fn audit_log_table(&self) -> &'static str { "ch_audit_log" }

    // ── Delegated operations ─────────────────────────────────────────────

    async fn log_audit_entry(
        &self,
        action: &str,
        data: serde_json::Value,
        ip: Option<&str>,
    ) {
        crate::audit::log_audit(&self.db, action, data, ip).await;
    }

    async fn get_best_model_id(&self, _use_case: &str) -> String {
        // ClaudeHydra uses Anthropic models — return coordinator tier default
        let cache = self.model_cache.read().await;
        // Iterate all provider buckets and find the best sonnet model
        for models in cache.models.values() {
            if let Some(m) = models.iter().find(|m| m.id.contains("sonnet")) {
                return m.id.clone();
            }
        }
        "claude-sonnet-4-6".to_string()
    }

    async fn generate_title_with_ai(&self, first_message: &str) -> Option<String> {
        use serde_json::json;

        let snippet: &str = if first_message.len() > 500 {
            let end = first_message
                .char_indices()
                .take_while(|(i, _)| *i < 500)
                .last()
                .map(|(i, c)| i + c.len_utf8())
                .unwrap_or(500.min(first_message.len()));
            &first_message[..end]
        } else {
            first_message
        };

        let body = json!({
            "model": "claude-haiku-4-5-20251001",
            "max_tokens": 64,
            "messages": [{
                "role": "user",
                "content": format!(
                    "Generate a concise 3-7 word title for a chat that starts with this message. \
                     Return ONLY the title text, no quotes, no explanation.\n\nMessage: {}",
                    snippet
                )
            }]
        });

        let resp = crate::handlers::send_to_anthropic(self, &body, 15).await.ok()?;

        if !resp.status().is_success() {
            tracing::error!("generate_title_with_ai: Anthropic API returned {}", resp.status());
            return None;
        }

        let json_resp: serde_json::Value = resp.json().await.ok()?;
        let raw_title = json_resp
            .get("content")
            .and_then(|c| c.get(0))
            .and_then(|c0| c0.get("text"))
            .and_then(|t| t.as_str())
            .unwrap_or("");
        let raw_title = raw_title.trim().trim_matches('"').trim();

        if raw_title.is_empty() {
            tracing::warn!(
                "generate_title_with_ai: Anthropic response missing text, response keys: {:?}",
                json_resp.as_object().map(|o| o.keys().collect::<Vec<_>>())
            );
            return None;
        }

        Some(raw_title.to_string())
    }
}

fn model_for_tier(tier: &str) -> &'static str {
    match tier {
        "Commander" => "claude-opus-4-6",
        "Coordinator" => "claude-sonnet-4-6",
        "Executor" => "claude-haiku-4-5-20251001",
        _ => "claude-sonnet-4-6",
    }
}

fn init_witcher_agents() -> Vec<WitcherAgent> {
    let defs: &[(&str, &str, &str, &str)] = &[
        (
            "Geralt",
            "Security",
            "Commander",
            "Master witcher and security specialist — hunts vulnerabilities like monsters",
        ),
        (
            "Yennefer",
            "Architecture",
            "Commander",
            "Powerful sorceress of system architecture — designs elegant magical structures",
        ),
        (
            "Vesemir",
            "Testing",
            "Commander",
            "Veteran witcher mentor — rigorously tests and validates all operations",
        ),
        (
            "Triss",
            "Data",
            "Coordinator",
            "Skilled sorceress of data management — weaves information with precision",
        ),
        (
            "Jaskier",
            "Documentation",
            "Coordinator",
            "Legendary bard — chronicles every detail with flair and accuracy",
        ),
        (
            "Ciri",
            "Performance",
            "Coordinator",
            "Elder Blood carrier — optimises performance with dimensional speed",
        ),
        (
            "Dijkstra",
            "Strategy",
            "Coordinator",
            "Spymaster strategist — plans operations with cunning intelligence",
        ),
        (
            "Lambert",
            "DevOps",
            "Executor",
            "Bold witcher — executes deployments and infrastructure operations",
        ),
        (
            "Eskel",
            "Backend",
            "Executor",
            "Steady witcher — builds and maintains robust backend services",
        ),
        (
            "Regis",
            "Research",
            "Executor",
            "Scholarly higher vampire — researches and analyses with ancient wisdom",
        ),
        (
            "Zoltan",
            "Frontend",
            "Executor",
            "Dwarven warrior — forges powerful and resilient frontend interfaces",
        ),
        (
            "Philippa",
            "Monitoring",
            "Executor",
            "All-seeing sorceress — monitors systems with her magical owl familiar",
        ),
    ];

    defs.iter()
        .enumerate()
        .map(|(i, (name, role, tier, desc))| WitcherAgent {
            id: format!("agent-{:03}", i + 1),
            name: name.to_string(),
            role: role.to_string(),
            tier: tier.to_string(),
            status: "active".to_string(),
            description: desc.to_string(),
            model: model_for_tier(tier).to_string(),
        })
        .collect()
}
