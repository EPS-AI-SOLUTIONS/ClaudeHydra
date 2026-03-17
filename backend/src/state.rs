// Jaskier Shared Pattern — state (ARCH-001: BaseHydraState migration)
// ClaudeHydra v4 - Application state
//
// Uses BaseHydraState from jaskier-hydra-state shared crate for all common
// fields, constructor, and mechanical trait implementations.
// CH-specific fields (tool_executor, rate_limit_config, agents with local
// WitcherAgent type) are kept on the outer AppState struct.

use std::collections::HashMap;
use std::ops::Deref;
use std::sync::Arc;

use sqlx::PgPool;
use tokio::sync::RwLock;

use jaskier_hydra_state::{BaseHydraConfig, BaseHydraState};

// ── Re-exports for backward compatibility ───────────────────────────────
// Existing code (main.rs, handlers, streaming.rs, etc.) imports these from crate::state.
pub use jaskier_hydra_state::{
    CircuitBreaker, LogEntry, LogRingBuffer, ModelCache, OAuthPkceState,
    RuntimeState, SystemSnapshot, OAUTH_STATE_TTL,
};

use std::time::Instant;

use crate::ai_gateway::{self, AiGatewayState, HasAiGateway};
use crate::ai_gateway::vault_bridge::{HasVaultBridge, VaultClient};
use crate::collab::CollabState;
use crate::memory_pruning::{HasMemoryPruning, MemoryPruningState};
use crate::models::WitcherAgent;
use crate::sandbox::{HasSandboxState, SandboxState};
use crate::semantic_cache::{HasSemanticCache, SemanticCacheState};
use crate::swarm::SwarmState;
use crate::tools::ToolExecutor;

// ── AppState ────────────────────────────────────────────────────────────────
/// Central application state. Clone-friendly — PgPool and Arc are both Clone.
///
/// Wraps `BaseHydraState` (shared across all Hydras) and adds CH-specific fields:
/// - `agents` — uses CH's local `WitcherAgent` type (has `model: String` field)
/// - `tool_executor` — CH-specific tool execution engine
/// - `rate_limit_config` — per-endpoint rate limit configuration
/// - `http_client` — alias for `base.client` (backward compat field name)
/// - `circuit_breaker` — alias for `base.gemini_circuit` (backward compat field name)
/// - `a2a_task_tx` — CH uses `Sender<serde_json::Value>` (Quad Hydras use `Sender<()>`)
#[derive(Clone)]
pub struct AppState {
    pub base: BaseHydraState,
    // ── AI Gateway (unified multi-provider gateway + Vault bridge) ──
    /// Unified AI Gateway state — provider configs and Vault client.
    pub ai_gateway: Arc<AiGatewayState>,
    // ── CH-specific fields (not in BaseHydraState) ──────────────────
    /// Agents cache — CH uses local WitcherAgent type with `model` field.
    pub agents: Arc<RwLock<Vec<WitcherAgent>>>,
    /// CH-specific tool executor (Anthropic tool definitions).
    pub tool_executor: Arc<ToolExecutor>,
    /// Per-endpoint rate limit configuration loaded from DB at startup.
    pub rate_limit_config: crate::rate_limits::RateLimitConfig,
    // ── Backward-compatible field aliases ────────────────────────────
    // These shadow BaseHydraState fields with different names so existing
    // `state.http_client` / `state.circuit_breaker` field accesses still compile.
    /// HTTP client — cloned from `base.client` for backward-compat field access.
    pub http_client: reqwest::Client,
    /// Circuit breaker for Anthropic API — cloned from `base.gemini_circuit`.
    pub circuit_breaker: Arc<CircuitBreaker>,
    /// Broadcast channel for A2A delegation updates (CH uses `Sender<Value>`).
    pub a2a_task_tx: tokio::sync::broadcast::Sender<serde_json::Value>,
    /// Unit broadcast channel required by `HasAgentState` / `HasA2aState` trait bounds
    /// (shared router delegates `()` signals; CH's real A2A uses `Sender<Value>` above).
    pub a2a_unit_tx: tokio::sync::broadcast::Sender<()>,
    // ── Profiling (HTTP latency histogram + Web Vitals aggregator) ────
    pub request_metrics: Arc<jaskier_core::profiling::RequestMetrics>,
    pub web_vitals: Arc<jaskier_core::profiling::WebVitalsAggregator>,
    // ── Swarm IPC (Cross-Agent Communication Protocol) ────────────────
    pub swarm: SwarmState,
    // ── CRDT Real-time Collaboration ────────────────────────────────────
    pub collab: CollabState,
    // ── Semantic Cache (Qdrant + Gemini Embeddings) ──────────────────────
    pub semantic_cache: Arc<SemanticCacheState>,
    // ── Sandbox (Isolated code execution for agents) ──────────────────────
    pub sandbox: SandboxState,
    // ── Memory Pruning (Self-Reflection & Knowledge Graph cleanup) ──────
    pub memory_pruning: Arc<MemoryPruningState>,
}

impl Deref for AppState {
    type Target = BaseHydraState;
    fn deref(&self) -> &BaseHydraState {
        &self.base
    }
}

// ── Constructor ─────────────────────────────────────────────────────────────

impl AppState {
    pub async fn new(db: PgPool, log_buffer: Arc<LogRingBuffer>) -> Self {
        let base = BaseHydraState::new(db.clone(), log_buffer, BaseHydraConfig {
            app_name: "ClaudeHydra",
            google_auth_table: "ch_google_auth",
            agents_table: "ch_agents_config",
            circuit_provider: "anthropic",
            // ClaudeHydra uses Anthropic OAuth — env vars loaded below separately.
            api_key_env_vars: &["ANTHROPIC_API_KEY"],
            mcp_servers_table: "ch_mcp_servers",
            mcp_tools_table: "ch_mcp_discovered_tools",
        }).await;

        // ── Inject legacy key names for backward compatibility ──────
        // BaseHydraState inserts as "anthropic" / "google", but CH handlers
        // look up "ANTHROPIC_API_KEY" / "GOOGLE_API_KEY" in runtime.api_keys.
        {
            let mut rt = base.runtime.write().await;
            if let Some(key) = rt.api_keys.get("anthropic").cloned() {
                rt.api_keys.insert("ANTHROPIC_API_KEY".to_string(), key);
            }
            if let Some(key) = rt.api_keys.get("google").cloned() {
                rt.api_keys.insert("GOOGLE_API_KEY".to_string(), key);
            }
            let mut keys = base.api_keys.write().await;
            *keys = rt.api_keys.clone();
        }

        // ── Load CH-specific agents (local WitcherAgent type) ───────
        let agents = Arc::new(RwLock::new(load_agents_from_db(&base.db).await));

        // ── Build tool executor ─────────────────────────────────────
        let api_keys_snapshot = base.api_keys.read().await.clone();
        let tool_executor = Arc::new(ToolExecutor::new(base.client.clone(), api_keys_snapshot));

        // ── Load rate limit config ──────────────────────────────────
        let rate_limit_config = crate::rate_limits::load_from_db(&base.db).await;

        // ── CH-specific A2A broadcast (Sender<Value>, not Sender<()>) ──
        let (a2a_task_tx, _) = tokio::sync::broadcast::channel(100);
        // Unit broadcast required by HasAgentState / HasA2aState trait bounds
        let (a2a_unit_tx, _) = tokio::sync::broadcast::channel(100);

        // ── AI Gateway (unified multi-provider + Vault bridge) ─────
        let vault_client = VaultClient::new(); // default: http://localhost:5190
        let oauth_manager = ai_gateway::OAuthFlowManager::new(base.client.clone());
        let ai_gateway_state = Arc::new(AiGatewayState {
            providers: ai_gateway::default_provider_configs(),
            vault_client,
            oauth_manager,
        });

        // ── Backward-compat field aliases ───────────────────────────
        let http_client = base.client.clone();
        let circuit_breaker = base.gemini_circuit.clone();

        // ── Swarm IPC (Cross-Agent Communication Protocol) ────────────
        let swarm = SwarmState::new();

        // ── CRDT Real-time Collaboration ─────────────────────────────
        let collab = CollabState::new();

        // ── Semantic Cache (Qdrant + Gemini Embeddings) ──────────────
        let google_api_key = std::env::var("GOOGLE_API_KEY").ok();
        let semantic_cache = Arc::new(SemanticCacheState::new(google_api_key).await);

        // ── Sandbox (Docker-based isolated execution) ──────────────
        let sandbox = SandboxState::new();

        Self {
            base,
            ai_gateway: ai_gateway_state,
            agents,
            tool_executor,
            rate_limit_config,
            http_client,
            circuit_breaker,
            a2a_task_tx,
            a2a_unit_tx,
            request_metrics: Arc::new(jaskier_core::profiling::RequestMetrics::new()),
            web_vitals: Arc::new(jaskier_core::profiling::WebVitalsAggregator::new()),
            swarm,
            collab,
            semantic_cache,
            sandbox,
            memory_pruning: Arc::new(MemoryPruningState::new(&db).await),
        }
    }

    pub fn is_ready(&self) -> bool { self.base.is_ready() }
    pub fn mark_ready(&self) { self.base.mark_ready(); }

    /// Access the Web Vitals aggregator (used by /api/vitals endpoint).
    pub fn web_vitals_aggregator(&self) -> Arc<jaskier_core::profiling::WebVitalsAggregator> {
        self.web_vitals.clone()
    }

    /// Refresh agents list — loads from DB, falls back to hardcoded defaults.
    pub async fn refresh_agents(&self) {
        let new_agents = load_agents_from_db(&self.base.db).await;
        let count = new_agents.len();
        let mut lock = self.agents.write().await;
        *lock = new_agents;
        tracing::info!("Agents refreshed — {} agents loaded", count);
    }

    /// Test-only constructor — uses `connect_lazy` so no real DB is needed.
    #[doc(hidden)]
    pub fn new_test() -> Self {
        let agents = Arc::new(RwLock::new(init_witcher_agents()));

        let http_client = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(5))
            .build()
            .expect("Failed to build HTTP client");

        let db = PgPool::connect_lazy("postgres://test@localhost:19999/test").expect("lazy pool");
        let mcp_client = Arc::new(jaskier_hydra_state::McpClientManager::with_tables(
            db.clone(), http_client.clone(), "ch_mcp_servers", "ch_mcp_discovered_tools",
        ));
        let circuit_breaker = Arc::new(CircuitBreaker::new("anthropic"));
        let (a2a_task_tx_base, _) = tokio::sync::broadcast::channel(100);
        let (a2a_task_tx, _) = tokio::sync::broadcast::channel(100);
        let (a2a_unit_tx, _) = tokio::sync::broadcast::channel(100);

        let base = BaseHydraState {
            db: db.clone(),
            agents: Arc::new(RwLock::new(vec![])), // base agents unused by CH
            runtime: Arc::new(RwLock::new(RuntimeState { api_keys: HashMap::new() })),
            api_keys: Arc::new(RwLock::new(HashMap::new())),
            model_cache: Arc::new(RwLock::new(ModelCache::new())),
            start_time: std::time::Instant::now(),
            client: http_client.clone(),
            oauth_pkce: Arc::new(RwLock::new(HashMap::new())),
            system_monitor: Arc::new(RwLock::new(SystemSnapshot::default())),
            ready: Arc::new(std::sync::atomic::AtomicBool::new(false)),
            auth_secret: None,
            gemini_circuit: circuit_breaker.clone(),
            prompt_cache: Arc::new(RwLock::new(HashMap::new())),
            a2a_cancel_tokens: Arc::new(RwLock::new(HashMap::new())),
            oauth_gemini_valid: Arc::new(std::sync::atomic::AtomicBool::new(true)),
            log_buffer: Arc::new(LogRingBuffer::new(1000)),
            tool_defs_cache: Arc::new(std::sync::OnceLock::new()),
            mcp_client,
            google_oauth_pkce: Arc::new(RwLock::new(HashMap::new())),
            github_oauth_states: Arc::new(RwLock::new(HashMap::new())),
            vercel_oauth_states: Arc::new(RwLock::new(HashMap::new())),
            knowledge_api_url: None,
            knowledge_auth_secret: None,
            swarm_tx: tokio::sync::broadcast::channel(100).0,
            a2a_task_tx: a2a_task_tx_base,
            browser_proxy_status: Arc::new(RwLock::new(
                jaskier_hydra_state::BrowserProxyStatus::default(),
            )),
            browser_proxy_history: Arc::new(jaskier_hydra_state::ProxyHealthHistory::new(50)),
            global_rate_limiter: Arc::new(jaskier_core::rate_limiter::GlobalRateLimiter::new()),
            a2a_semaphore: Arc::new(tokio::sync::Semaphore::new(5)),
            ws_semaphore: Arc::new(tokio::sync::Semaphore::new(20)),
            api_key_env_vars: &["ANTHROPIC_API_KEY"],
        };

        let ai_gateway_state = Arc::new(AiGatewayState {
            providers: ai_gateway::default_provider_configs(),
            vault_client: VaultClient::with_url("http://localhost:19999"), // non-existent in tests
            oauth_manager: ai_gateway::OAuthFlowManager::new(http_client.clone()),
        });

        Self {
            base,
            ai_gateway: ai_gateway_state,
            agents,
            tool_executor: Arc::new(ToolExecutor::new(http_client.clone(), HashMap::new())),
            rate_limit_config: crate::rate_limits::RateLimitConfig { groups: std::collections::HashMap::new() },
            http_client,
            circuit_breaker,
            a2a_task_tx,
            a2a_unit_tx,
            request_metrics: Arc::new(jaskier_core::profiling::RequestMetrics::new()),
            web_vitals: Arc::new(jaskier_core::profiling::WebVitalsAggregator::new()),
            swarm: SwarmState::new(),
            collab: CollabState::new(),
            semantic_cache: Arc::new(SemanticCacheState::new_test()),
            sandbox: SandboxState::new(),
            memory_pruning: Arc::new(MemoryPruningState::new_test()),
        }
    }
}

// ── HasSemanticCache — Qdrant-backed semantic router ─────────────────────────

impl HasSemanticCache for AppState {
    fn semantic_cache(&self) -> &Arc<SemanticCacheState> {
        &self.semantic_cache
    }
}

// ── HasSandboxState — Docker-based isolated code execution ───────────────────

impl HasSandboxState for AppState {
    fn sandbox(&self) -> &SandboxState {
        &self.sandbox
    }
    fn sandbox_db(&self) -> &sqlx::PgPool {
        &self.base.db
    }
}

// ── HasMemoryPruning — Self-Reflection & Knowledge Graph cleanup ─────────────

impl HasMemoryPruning for AppState {
    fn memory_pruning(&self) -> &Arc<MemoryPruningState> {
        &self.memory_pruning
    }
    fn pruning_db(&self) -> &sqlx::PgPool {
        &self.base.db
    }
    fn mcp_client(&self) -> &Arc<jaskier_hydra_state::McpClientManager> {
        &self.base.mcp_client
    }
    async fn log_audit(&self, action: &str, data: serde_json::Value) {
        crate::audit::log_audit(&self.base.db, action, data, None).await;
    }
    fn pruning_app_name(&self) -> &'static str {
        "ClaudeHydra"
    }
}

// ── Mechanical trait delegations (12 of 13 base + 1 extra) ─────────────────
// These are identical across all Hydra apps and delegate to self.base fields.
// HasSessionsState is excluded because CH uses different table names and
// generate_title_via_anthropic (not gemini).
jaskier_hydra_state::delegate_trait_auth_secret!(AppState);
jaskier_hydra_state::delegate_trait_log_buffer!(AppState);
jaskier_hydra_state::delegate_trait_browser_proxy!(AppState);
jaskier_hydra_state::delegate_trait_google_oauth!(AppState, "8082", "ch");
jaskier_hydra_state::delegate_trait_model_registry!(AppState, "ch");
jaskier_hydra_state::delegate_trait_watchdog!(AppState);
jaskier_hydra_state::delegate_trait_github_oauth!(AppState, "ch");
jaskier_hydra_state::delegate_trait_vercel_oauth!(AppState, "ch");
jaskier_hydra_state::delegate_trait_service_tokens!(AppState, "ch");
jaskier_hydra_state::delegate_trait_mcp!(AppState, "ch");
jaskier_hydra_state::delegate_trait_tools!(AppState, "ch");
jaskier_hydra_state::delegate_trait_knowledge_api!(AppState);
jaskier_hydra_state::delegate_trait_rate_limiter!(AppState);

// Extra trait: Anthropic OAuth (CH-specific)
jaskier_hydra_state::delegate_trait_anthropic_oauth!(AppState, "ch");

// ── HasAiGateway — unified multi-provider gateway access ─────────────────────

impl HasAiGateway for AppState {
    fn ai_gateway(&self) -> &AiGatewayState {
        &self.ai_gateway
    }
}

// ── HasVaultBridge — Jaskier Vault client access ─────────────────────────────

impl HasVaultBridge for AppState {
    fn vault_client(&self) -> &VaultClient {
        &self.ai_gateway.vault_client
    }
}

// ── HasMetricsState — manual impl (CH overrides a2a_agent_column/error_filter)
impl jaskier_core::metrics::HasMetricsState for AppState {
    fn metrics_db(&self) -> &sqlx::PgPool { &self.base.db }

    fn metrics_start_time(&self) -> std::time::Instant { self.base.start_time }

    async fn metrics_snapshot(&self) -> jaskier_core::metrics::MetricsSnapshot {
        let snap = self.base.system_monitor.read().await;
        jaskier_core::metrics::MetricsSnapshot {
            cpu_usage_percent: snap.cpu_usage_percent,
            memory_used_mb: snap.memory_used_mb,
            memory_total_mb: snap.memory_total_mb,
        }
    }

    fn a2a_tasks_table(&self) -> Option<&'static str> {
        Some("ch_a2a_tasks")
    }

    fn a2a_agent_column(&self) -> &'static str {
        "agent_name"
    }

    fn a2a_error_filter(&self) -> &'static str {
        "is_error = TRUE"
    }

    async fn extra_metrics_lines(&self) -> String {
        let mut out = String::new();
        // HTTP request latency histogram
        out.push_str(&self.request_metrics.prometheus_output());
        // Web Vitals aggregated metrics
        out.push_str(&self.web_vitals.prometheus_output());
        // Semantic cache metrics
        out.push_str(&self.semantic_cache.metrics.prometheus_output());
        // Memory pruning metrics
        out.push_str(&self.memory_pruning.metrics.prometheus_output());
        out
    }
}

// ── HasProfilingState — HTTP latency + Web Vitals ──────────────────────────

impl jaskier_core::profiling::HasProfilingState for AppState {
    fn web_vitals(&self) -> &Arc<jaskier_core::profiling::WebVitalsAggregator> {
        &self.web_vitals
    }
    fn request_metrics(&self) -> &Arc<jaskier_core::profiling::RequestMetrics> {
        &self.request_metrics
    }
}

// ── HasSessionsState — manual impl (CH uses different table names + Anthropic title gen)
impl jaskier_core::sessions::HasSessionsState for AppState {
    fn db(&self) -> &sqlx::PgPool { &self.base.db }

    // ── Table names ──────────────────────────────────────────────────────
    // CH uses "ch_messages" (not "ch_chat_messages" like Quad Hydras).
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
        crate::audit::log_audit(&self.base.db, action, data, ip).await;
    }

    async fn get_best_model_id(&self, _use_case: &str) -> String {
        // ClaudeHydra uses Anthropic models — return coordinator tier default
        let cache = self.base.model_cache.read().await;
        // Iterate all provider buckets and find the best sonnet model
        for models in cache.models.values() {
            if let Some(m) = models.iter().find(|m| m.id.contains("sonnet")) {
                return m.id.clone();
            }
        }
        "claude-sonnet-4-6".to_string()
    }

    async fn generate_title_with_ai(&self, first_message: &str) -> Option<String> {
        jaskier_core::sessions::generate_title_via_anthropic(self, first_message).await
    }
}

// ── HasMcpServerState — app-specific (CH version, name, tool_executor) ──────

impl jaskier_core::mcp::server::HasMcpServerState for AppState {
    fn mcp_server_name(&self) -> &'static str { "ClaudeHydra" }
    fn mcp_server_version(&self) -> &'static str { "4.0.0" }
    fn mcp_server_instructions(&self) -> &'static str {
        "ClaudeHydra AI Swarm Control Center — Anthropic Claude-powered multi-agent system"
    }
    fn mcp_uri_scheme(&self) -> &'static str { "claudehydra" }

    fn mcp_settings_table(&self) -> &'static str { "ch_settings" }
    fn mcp_sessions_table(&self) -> &'static str { "ch_sessions" }

    async fn mcp_agents_json(&self) -> serde_json::Value {
        let agents = self.agents.read().await;
        serde_json::json!(agents.iter().map(|a| {
            serde_json::json!({
                "id": a.id,
                "name": a.name,
                "role": a.role,
                "status": a.status,
                "tier": a.tier,
            })
        }).collect::<Vec<_>>())
    }
    fn mcp_model_cache(&self) -> &Arc<RwLock<crate::model_registry::ModelCache>> { &self.base.model_cache }
    fn mcp_start_time(&self) -> std::time::Instant { self.base.start_time }
    fn mcp_is_ready(&self) -> bool { self.base.is_ready() }

    async fn mcp_system_snapshot_json(&self) -> serde_json::Value {
        let snap = self.base.system_monitor.read().await;
        serde_json::json!({
            "cpu_usage_percent": snap.cpu_usage_percent,
            "memory_used_mb": snap.memory_used_mb,
            "memory_total_mb": snap.memory_total_mb,
            "platform": snap.platform,
        })
    }

    fn mcp_tool_definitions(&self) -> Vec<serde_json::Value> {
        self.tool_executor
            .tool_definitions()
            .into_iter()
            .map(|td| {
                serde_json::json!({
                    "name": td.name,
                    "description": td.description,
                    "inputSchema": td.input_schema,
                })
            })
            .collect()
    }

    async fn mcp_execute_tool(
        &self,
        name: &str,
        args: &serde_json::Value,
        working_directory: &str,
    ) -> Result<(String, Option<serde_json::Value>), String> {
        let executor = self.tool_executor.with_working_directory(working_directory);
        let (result, is_error) = executor.execute_with_state(name, args, self).await;
        if is_error {
            Err(result)
        } else {
            Ok((result, None))
        }
    }
}

// ── HasAnthropicCredential — CH uses Vault → DB OAuth → API key chain ───────
//
// Dual resolution strategy for backward compatibility during Vault migration:
// 1. First try: Jaskier Vault (ai_providers/anthropic_max)
// 2. Fallback: Old DB path (jaskier_oauth::anthropic::get_valid_anthropic_access_token)
// 3. Last resort: Runtime API keys / ANTHROPIC_API_KEY env var
//
// NOTE: This trait is used by `generate_title_via_anthropic` in jaskier-core::sessions.
// Unlike the handler path (which can use vault_delegate for zero-trust Bouncer calls),
// title generation needs an actual token string for the Authorization header.
// When Vault returns is_connected=true but we don't have the raw token, we fall through
// to the DB OAuth path — Vault Bouncer delegation happens at the handler level only.

impl jaskier_core::sessions::HasAnthropicCredential for AppState {
    fn http_client(&self) -> &reqwest::Client { &self.http_client }

    async fn get_anthropic_credential(&self) -> Option<(String, bool)> {
        // 1. Try Vault first (ai_providers/anthropic_max)
        //    For this trait (title generation), we need the actual token.
        //    Vault.get() returns a masked credential — we can't use it directly.
        //    BUT: if Vault is connected, it confirms the credential exists and is valid,
        //    so we can trust the DB OAuth fallback more confidently.
        let vault_connected = match self.ai_gateway.vault_client.get("ai_providers", "anthropic_max").await {
            Ok(cred) if cred.is_connected => {
                tracing::debug!("Vault confirms Anthropic credential is connected (title gen path)");
                true
            }
            Ok(_) => false,
            Err(crate::ai_gateway::vault_bridge::VaultError::AnomalyDetected(msg)) => {
                tracing::error!("ANOMALY DETECTED from Vault during title gen credential resolution: {}", msg);
                return None;
            }
            Err(_) => false,
        };

        // 2. Fallback: Old DB OAuth path (will be removed after full Vault migration)
        if let Some(token) = jaskier_oauth::anthropic::get_valid_anthropic_access_token(self).await {
            if vault_connected {
                tracing::info!("Using DB OAuth token for title gen (Vault confirmed connected)");
            } else {
                tracing::info!("Falling back to DB OAuth for Anthropic (title gen)");
            }
            return Some((token, true));
        }
        // 3. Try runtime state (hot-loaded API key)
        {
            let rt = self.base.runtime.read().await;
            if let Some(key) = rt.api_keys.get("ANTHROPIC_API_KEY")
                && !key.is_empty()
            {
                tracing::info!("Falling back to runtime API key for Anthropic (title gen)");
                return Some((key.clone(), false));
            }
        }
        // 4. Last resort: env var
        std::env::var("ANTHROPIC_API_KEY")
            .ok()
            .filter(|k| !k.is_empty())
            .map(|k| {
                tracing::info!("Falling back to ANTHROPIC_API_KEY env var for Anthropic (title gen)");
                (k, false)
            })
    }
}

// ── CH-specific agent helpers ───────────────────────────────────────────────

/// Load agents from `ch_agents_config` table. Falls back to hardcoded defaults
/// when the table doesn't exist yet or is empty.
async fn load_agents_from_db(db: &PgPool) -> Vec<WitcherAgent> {
    match sqlx::query_as::<_, crate::models::AgentConfigRow>(
        "SELECT id, name, role, tier, status, description, model, created_at, updated_at \
         FROM ch_agents_config ORDER BY id",
    )
    .fetch_all(db)
    .await
    {
        Ok(rows) if !rows.is_empty() => {
            tracing::info!("Loaded {} agents from DB (ch_agents_config)", rows.len());
            rows.into_iter().map(WitcherAgent::from).collect()
        }
        Ok(_) => {
            tracing::info!("ch_agents_config is empty — using hardcoded defaults");
            init_witcher_agents()
        }
        Err(e) => {
            tracing::warn!("Failed to load agents from DB ({}), using hardcoded defaults", e);
            init_witcher_agents()
        }
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

/// Build default agent roster from shared jaskier-core list, converting to CH's
/// local `WitcherAgent` type (which includes a `model` field based on tier).
fn init_witcher_agents() -> Vec<WitcherAgent> {
    jaskier_core::models::default_agent_roster()
        .into_iter()
        .map(|shared| WitcherAgent {
            model: model_for_tier(&shared.tier).to_string(),
            id: shared.id,
            name: shared.name,
            role: shared.role,
            tier: shared.tier,
            status: shared.status,
            description: shared.description,
        })
        .collect()
}

// ── HasHealthState — required by HydraState supertrait (router_builder) ─────
//
// CH provides its own health/readiness handlers (handlers::health_check, handlers::readiness)
// via the agents_router / app_protected_routes config slots. This trait impl
// satisfies the HydraState bound without routing through the shared health handlers.

impl jaskier_core::handlers::system::HasHealthState for AppState {
    fn version(&self) -> &'static str { env!("CARGO_PKG_VERSION") }
    fn app_name(&self) -> &'static str { "ClaudeHydra" }
    fn start_time(&self) -> Instant { self.base.start_time }
    fn is_ready(&self) -> bool { self.base.is_ready() }
    fn has_auth_secret(&self) -> bool { self.base.auth_secret.is_some() }

    fn api_keys_snapshot(&self) -> std::collections::HashMap<String, String> {
        self.base.api_keys.try_read().map(|g| g.clone()).unwrap_or_default()
    }

    fn google_models_snapshot(&self) -> Vec<jaskier_core::model_registry::ModelInfo> {
        self.base.model_cache
            .try_read()
            .map(|c| c.models.get("google").cloned().unwrap_or_default())
            .unwrap_or_default()
    }

    fn system_stats_snapshot(&self) -> jaskier_core::handlers::system::SystemStatsSnapshot {
        let snap = self.base.system_monitor.try_read();
        match snap {
            Ok(s) => jaskier_core::handlers::system::SystemStatsSnapshot {
                cpu_usage_percent: s.cpu_usage_percent,
                memory_used_mb: s.memory_used_mb,
                memory_total_mb: s.memory_total_mb,
                platform: s.platform.clone(),
            },
            Err(_) => jaskier_core::handlers::system::SystemStatsSnapshot {
                cpu_usage_percent: 0.0,
                memory_used_mb: 0.0,
                memory_total_mb: 0.0,
                platform: std::env::consts::OS.to_string(),
            },
        }
    }

    async fn browser_proxy_json(&self) -> Option<serde_json::Value> {
        if !crate::browser_proxy::is_enabled() {
            return None;
        }
        let status = self.base.browser_proxy_status.read().await.clone();
        serde_json::to_value(status).ok()
    }

    fn browser_proxy_history_snapshot(&self, limit: usize) -> (Vec<serde_json::Value>, usize) {
        let events = self.base.browser_proxy_history.recent(limit);
        let total = self.base.browser_proxy_history.len();
        let json_events = events
            .into_iter()
            .filter_map(|e| serde_json::to_value(e).ok())
            .collect();
        (json_events, total)
    }
}

// ── HasAgentState — required by HydraState supertrait (router_builder) ──────
//
// CH provides its own agent handlers (handlers::agents::*) via the agents_router
// config slot. This trait impl satisfies the HydraState bound. The `base.agents`
// field holds `jaskier_core::models::WitcherAgent` (the shared type) which the
// shared router's classify / CRUD handlers use. CH's custom agents (with `model`)
// are in `self.agents` and served by CH's own route group.

impl jaskier_core::handlers::agents::HasAgentState for AppState {
    fn db(&self) -> &sqlx::PgPool { &self.base.db }

    fn agents(&self) -> &Arc<RwLock<Vec<jaskier_core::models::WitcherAgent>>> {
        &self.base.agents
    }

    fn a2a_task_tx(&self) -> &tokio::sync::broadcast::Sender<()> {
        &self.a2a_unit_tx
    }

    fn agent_table_prefix(&self) -> &'static str { "ch" }

    async fn refresh_agents(&self) {
        // Refresh base agents (shared WitcherAgent type used by shared router)
        let new_agents = match sqlx::query_as::<_, jaskier_core::models::WitcherAgent>(
            "SELECT * FROM ch_agents ORDER BY created_at ASC",
        )
        .fetch_all(&self.base.db)
        .await
        {
            Ok(rows) if !rows.is_empty() => rows,
            _ => jaskier_core::models::default_agent_roster(),
        };
        let mut lock = self.base.agents.write().await;
        *lock = new_agents;
        // Also refresh CH-specific agents (local WitcherAgent with `model` field)
        self.refresh_agents().await;
    }
}

// ── HasA2aState — required by HydraState supertrait (router_builder) ────────
//
// CH does not use the A2A protocol (it has its own delegation system via
// `/api/agents/delegations`). This minimal no-op impl satisfies the trait
// bound so `build_hydra_router` compiles. The A2A routes added by the shared
// router (/a2a/message/send etc.) are unreachable in production since CH's
// frontend does not call them.

impl jaskier_ai_modules::a2a::HasA2aState for AppState {
    type Agent = jaskier_core::models::WitcherAgent;

    fn agents(&self) -> &Arc<RwLock<Vec<jaskier_core::models::WitcherAgent>>> {
        &self.base.agents
    }

    fn a2a_app_name(&self) -> &str { "ClaudeHydra" }
    fn a2a_app_url(&self) -> &str { "http://localhost:8082" }
    fn a2a_app_version(&self) -> &str { env!("CARGO_PKG_VERSION") }

    fn a2a_semaphore(&self) -> &Arc<tokio::sync::Semaphore> { &self.base.a2a_semaphore }
    fn a2a_task_tx(&self) -> &tokio::sync::broadcast::Sender<()> { &self.a2a_unit_tx }
    fn a2a_cancel_tokens(&self) -> &Arc<RwLock<std::collections::HashMap<String, tokio_util::sync::CancellationToken>>> {
        &self.base.a2a_cancel_tokens
    }

    fn send_swarm_notification(&self, agent_id: &str, content: String) {
        let _ = self.base.swarm_tx.send(jaskier_core::models::AgentMessage {
            agent_id: agent_id.to_string(),
            content,
            is_final: false,
        });
    }

    async fn circuit_check(&self) -> Result<(), String> {
        self.base.gemini_circuit.check().await
    }
    async fn circuit_success(&self) { self.base.gemini_circuit.record_success().await; }
    async fn circuit_failure(&self) { self.base.gemini_circuit.record_failure().await; }

    async fn prepare_a2a_context(
        &self,
        _prompt: &str,
        _model_override: Option<String>,
        _agent_override: Option<(String, f64, String)>,
        _session_wd: &str,
    ) -> jaskier_ai_modules::a2a::A2aContext {
        // CH does not use the A2A protocol — return a no-op context.
        // Real CH delegations go through /api/claude/chat/stream (Anthropic).
        jaskier_ai_modules::a2a::A2aContext {
            agent_id: "claudehydra-noop".to_string(),
            model: "claude-sonnet-4-6".to_string(),
            api_key: String::new(),
            is_oauth: false,
            system_prompt: String::new(),
            final_user_prompt: _prompt.to_string(),
            temperature: 1.0,
            top_p: 1.0,
            max_tokens: 8192,
            max_iterations: 1,
            thinking_level: "none".to_string(),
            working_directory: _session_wd.to_string(),
            call_depth: 0,
        }
    }

    async fn build_a2a_tools(&self) -> serde_json::Value {
        serde_json::json!([])
    }

    async fn execute_a2a_tool(
        &self,
        _name: &str,
        _args: &serde_json::Value,
        _working_dir: &str,
    ) -> Result<String, String> {
        Err("A2A protocol not supported by ClaudeHydra".to_string())
    }

    fn build_a2a_thinking_config(&self, _model: &str, _thinking_level: &str) -> Option<serde_json::Value> {
        None
    }
}

// ── HasCollabState — CRDT Real-time Collaboration ───────────────────────────

impl jaskier_collab::HasCollabState for AppState {
    fn collab_hub(&self) -> &Arc<jaskier_collab::CollabHub> {
        &self.collab.hub
    }

    fn collab_db(&self) -> &sqlx::PgPool {
        &self.base.db
    }

    fn crdt_table(&self) -> &'static str {
        "ch_crdt_documents"
    }

    fn collab_app_id(&self) -> &'static str {
        "claudehydra"
    }
}
