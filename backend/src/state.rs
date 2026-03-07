// Jaskier Shared Pattern — state
// ClaudeHydra v4 - Application state

use std::collections::{HashMap, VecDeque};
use std::sync::atomic::{AtomicBool, AtomicU32, Ordering};
use std::sync::Arc;
use std::time::Instant;

use sqlx::PgPool;
use tokio::sync::RwLock;

use crate::mcp::client::McpClientManager;
use crate::model_registry::ModelCache;
use crate::models::WitcherAgent;
use crate::tools::ToolExecutor;

// ── Log Ring Buffer — Jaskier Shared Pattern ────────────────────────────────
/// In-memory ring buffer for backend log entries (last N events).
/// Uses `std::sync::Mutex` because writes happen in the tracing Layer
/// (sync context — not inside a tokio runtime poll).

#[derive(Clone, serde::Serialize)]
pub struct LogEntry {
    pub timestamp: String,
    pub level: String,
    pub target: String,
    pub message: String,
}

pub struct LogRingBuffer {
    entries: std::sync::Mutex<VecDeque<LogEntry>>,
    capacity: usize,
}

impl LogRingBuffer {
    pub fn new(capacity: usize) -> Self {
        Self {
            entries: std::sync::Mutex::new(VecDeque::with_capacity(capacity)),
            capacity,
        }
    }

    pub fn push(&self, entry: LogEntry) {
        let mut buf = self.entries.lock().unwrap_or_else(|p| p.into_inner());
        if buf.len() >= self.capacity {
            buf.pop_front();
        }
        buf.push_back(entry);
    }

    pub fn clear(&self) {
        let mut buf = self.entries.lock().unwrap_or_else(|p| p.into_inner());
        buf.clear();
    }

    pub fn recent(&self, limit: usize, min_level: Option<&str>, search: Option<&str>) -> Vec<LogEntry> {
        let buf = self.entries.lock().unwrap_or_else(|p| p.into_inner());
        buf.iter()
            .rev()
            .filter(|e| {
                min_level.map_or(true, |lvl| level_ord(&e.level) >= level_ord(lvl))
            })
            .filter(|e| {
                search.map_or(true, |s| {
                    let s_lower = s.to_lowercase();
                    e.message.to_lowercase().contains(&s_lower)
                        || e.target.to_lowercase().contains(&s_lower)
                })
            })
            .take(limit)
            .cloned()
            .collect()
    }
}

fn level_ord(level: &str) -> u8 {
    match level.to_uppercase().as_str() {
        "ERROR" => 5,
        "WARN" => 4,
        "INFO" => 3,
        "DEBUG" => 2,
        "TRACE" => 1,
        _ => 0,
    }
}

// ── Circuit Breaker — Jaskier Shared Pattern ────────────────────────────────
/// Simple circuit breaker for upstream API providers.
///
/// After `FAILURE_THRESHOLD` consecutive failures the circuit **trips** for
/// `COOLDOWN_SECS` seconds. While tripped, `allow_request()` returns `false`
/// so callers can fail fast without hitting the upstream.
///
/// Thread-safe — uses atomics only, no mutex/rwlock.
pub struct CircuitBreaker {
    consecutive_failures: AtomicU32,
    /// `None` = circuit is closed (healthy).
    /// `Some(instant)` = tripped at this wall-clock instant.
    tripped_at: RwLock<Option<Instant>>,
    /// `true` = circuit is half-open (one probe request allowed).
    half_open: AtomicBool,
}

const FAILURE_THRESHOLD: u32 = 3;
const COOLDOWN_SECS: u64 = 60;

impl CircuitBreaker {
    pub fn new() -> Self {
        Self {
            consecutive_failures: AtomicU32::new(0),
            tripped_at: RwLock::new(None),
            half_open: AtomicBool::new(false),
        }
    }

    /// Returns `true` if the circuit is closed (allow the request).
    /// Returns `false` if tripped and the cooldown has NOT elapsed yet.
    /// After cooldown: transitions to HALF_OPEN and allows exactly ONE probe request.
    pub async fn allow_request(&self) -> bool {
        let guard = self.tripped_at.read().await;
        match *guard {
            None => {
                // Circuit is closed — but check if half-open (probe in progress)
                if self.half_open.load(Ordering::Acquire) {
                    return false; // Another request is already probing
                }
                true
            }
            Some(tripped) => {
                if tripped.elapsed().as_secs() < COOLDOWN_SECS {
                    return false;
                }
                drop(guard);
                // Cooldown elapsed — CAS to become the single probe request
                if self
                    .half_open
                    .compare_exchange(false, true, Ordering::AcqRel, Ordering::Acquire)
                    .is_ok()
                {
                    tracing::info!(
                        "circuit_breaker: cooldown elapsed, entering HALF_OPEN — allowing probe request"
                    );
                    true
                } else {
                    false // Another task already became the probe
                }
            }
        }
    }

    /// Record a successful request — resets the failure counter and closes the circuit.
    pub async fn record_success(&self) {
        let was_half_open = self.half_open.swap(false, Ordering::Release);
        let prev = self.consecutive_failures.swap(0, Ordering::Relaxed);
        if was_half_open || prev > 0 {
            let mut wg = self.tripped_at.write().await;
            *wg = None;
            tracing::info!(
                "circuit_breaker: success recorded, circuit CLOSED (was {} failures, half_open={})",
                prev,
                was_half_open
            );
        }
    }

    /// Record a failed request. Trips the circuit after `FAILURE_THRESHOLD` consecutive failures.
    /// If in HALF_OPEN state, re-trips immediately.
    pub async fn record_failure(&self) {
        let was_half_open = self.half_open.swap(false, Ordering::Release);
        if was_half_open {
            // Probe failed — re-trip immediately with fresh cooldown
            let mut wg = self.tripped_at.write().await;
            *wg = Some(Instant::now());
            tracing::error!(
                "circuit_breaker: HALF_OPEN probe failed — re-tripped for {}s",
                COOLDOWN_SECS
            );
            return;
        }
        let count = self.consecutive_failures.fetch_add(1, Ordering::Relaxed) + 1;
        tracing::warn!("circuit_breaker: failure #{}", count);
        if count >= FAILURE_THRESHOLD {
            let mut wg = self.tripped_at.write().await;
            if wg.is_none() {
                *wg = Some(Instant::now());
                tracing::error!(
                    "circuit_breaker: TRIPPED after {} consecutive failures — blocking requests for {}s",
                    count, COOLDOWN_SECS
                );
            }
        }
    }
}

// ── Shared: RuntimeState ────────────────────────────────────────────────────
/// Mutable runtime state (not persisted — lost on restart).
pub struct RuntimeState {
    pub api_keys: HashMap<String, String>,
}

/// Temporary PKCE state for an in-progress OAuth flow.
pub struct OAuthPkceState {
    pub code_verifier: String,
    pub state: String,
}

// ── Shared: SystemSnapshot ───────────────────────────────────────────────────
/// Cached system statistics snapshot, refreshed every 5s by background task.
#[derive(Clone)]
pub struct SystemSnapshot {
    pub cpu_usage_percent: f32,
    pub memory_used_mb: f64,
    pub memory_total_mb: f64,
    pub platform: String,
}

impl Default for SystemSnapshot {
    fn default() -> Self {
        Self {
            cpu_usage_percent: 0.0,
            memory_used_mb: 0.0,
            memory_total_mb: 0.0,
            platform: std::env::consts::OS.to_string(),
        }
    }
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
    pub oauth_pkce: Arc<RwLock<Option<OAuthPkceState>>>,
    /// Google OAuth PKCE state (separate from Anthropic OAuth PKCE).
    pub google_oauth_pkce: Arc<RwLock<Option<OAuthPkceState>>>,
    /// GitHub OAuth state (CSRF protection for GitHub OAuth flow).
    pub github_oauth_state: Arc<RwLock<Option<String>>>,
    /// Vercel OAuth state (CSRF protection for Vercel OAuth flow).
    pub vercel_oauth_state: Arc<RwLock<Option<String>>>,
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

        let tool_executor = Arc::new(ToolExecutor::new(
            http_client.clone(),
            api_keys.clone(),
        ));

        let mcp_client = Arc::new(McpClientManager::new(
            db.clone(),
            http_client.clone(),
        ));

        Self {
            db,
            agents,
            runtime: Arc::new(RwLock::new(RuntimeState { api_keys })),
            model_cache: Arc::new(RwLock::new(ModelCache::new())),
            start_time: Instant::now(),
            http_client,
            tool_executor,
            oauth_pkce: Arc::new(RwLock::new(None)),
            google_oauth_pkce: Arc::new(RwLock::new(None)),
            github_oauth_state: Arc::new(RwLock::new(None)),
            vercel_oauth_state: Arc::new(RwLock::new(None)),
            ready: Arc::new(AtomicBool::new(false)),
            system_monitor: Arc::new(RwLock::new(SystemSnapshot::default())),
            auth_secret,
            circuit_breaker: Arc::new(CircuitBreaker::new()),
            mcp_client,
            oauth_gemini_valid: Arc::new(AtomicBool::new(true)),
            log_buffer,
            prompt_cache: Arc::new(RwLock::new(HashMap::new())),
            browser_proxy_status: Arc::new(RwLock::new(crate::browser_proxy::BrowserProxyStatus::default())),
            browser_proxy_history: Arc::new(crate::browser_proxy::ProxyHealthHistory::new(50)),
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

        Self {
            mcp_client: Arc::new(McpClientManager::new(db.clone(), http_client.clone())),
            db,
            agents,
            runtime: Arc::new(RwLock::new(RuntimeState { api_keys: HashMap::new() })),
            model_cache: Arc::new(RwLock::new(ModelCache::new())),
            start_time: Instant::now(),
            http_client: http_client.clone(),
            tool_executor: Arc::new(ToolExecutor::new(http_client, HashMap::new())),
            oauth_pkce: Arc::new(RwLock::new(None)),
            google_oauth_pkce: Arc::new(RwLock::new(None)),
            github_oauth_state: Arc::new(RwLock::new(None)),
            vercel_oauth_state: Arc::new(RwLock::new(None)),
            ready: Arc::new(AtomicBool::new(false)),
            system_monitor: Arc::new(RwLock::new(SystemSnapshot::default())),
            auth_secret: None,
            circuit_breaker: Arc::new(CircuitBreaker::new()),
            oauth_gemini_valid: Arc::new(AtomicBool::new(true)),
            log_buffer: Arc::new(LogRingBuffer::new(1000)),
            prompt_cache: Arc::new(RwLock::new(HashMap::new())),
            browser_proxy_status: Arc::new(RwLock::new(crate::browser_proxy::BrowserProxyStatus::default())),
            browser_proxy_history: Arc::new(crate::browser_proxy::ProxyHealthHistory::new(50)),
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

fn init_witcher_agents() -> Vec<WitcherAgent> {
    let defs: &[(&str, &str, &str, &str)] = &[
        ("Geralt",    "Security",      "Commander",  "Master witcher and security specialist — hunts vulnerabilities like monsters"),
        ("Yennefer",  "Architecture",  "Commander",  "Powerful sorceress of system architecture — designs elegant magical structures"),
        ("Vesemir",   "Testing",       "Commander",  "Veteran witcher mentor — rigorously tests and validates all operations"),
        ("Triss",     "Data",          "Coordinator","Skilled sorceress of data management — weaves information with precision"),
        ("Jaskier",   "Documentation", "Coordinator","Legendary bard — chronicles every detail with flair and accuracy"),
        ("Ciri",      "Performance",   "Coordinator","Elder Blood carrier — optimises performance with dimensional speed"),
        ("Dijkstra",  "Strategy",      "Coordinator","Spymaster strategist — plans operations with cunning intelligence"),
        ("Lambert",   "DevOps",        "Executor",   "Bold witcher — executes deployments and infrastructure operations"),
        ("Eskel",     "Backend",       "Executor",   "Steady witcher — builds and maintains robust backend services"),
        ("Regis",     "Research",      "Executor",   "Scholarly higher vampire — researches and analyses with ancient wisdom"),
        ("Zoltan",    "Frontend",      "Executor",   "Dwarven warrior — forges powerful and resilient frontend interfaces"),
        ("Philippa",  "Monitoring",    "Executor",   "All-seeing sorceress — monitors systems with her magical owl familiar"),
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
