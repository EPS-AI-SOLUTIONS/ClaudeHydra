pub mod ai_gateway;
pub mod audit;
pub mod auth;
pub mod auto_qa;
pub mod browser_proxy;
pub mod collab;
pub mod handlers;
pub mod mcp;
pub mod memory_pruning;
pub mod model_registry;
pub mod models;
pub mod ocr;
pub mod rate_limits;
pub mod sandbox;
pub mod semantic_cache;
pub mod state;
pub mod swarm;
pub mod system_monitor;
pub mod tools;
pub mod watchdog;

use axum::Router;
use axum::routing::{delete, get, patch, post};
use jaskier_core::router_builder::{HydraRouterConfig, build_hydra_router, build_hydra_test_router};
use utoipa::OpenApi;

use state::AppState;

// ── OpenAPI documentation ────────────────────────────────────────────────────

#[derive(OpenApi)]
#[openapi(
    info(
        title = "ClaudeHydra v4 API",
        version = "4.0.0",
        description = "AI Swarm Control Center — Backend API",
        license(name = "MIT")
    ),
    paths(
        // Health
        handlers::health_check,
        handlers::readiness,
        handlers::auth_mode,
        handlers::system_stats,
        handlers::system_metrics,
        handlers::system_audit,
        // Agents
        handlers::list_agents,
        handlers::get_agent,
        handlers::create_agent,
        handlers::update_agent,
        handlers::delete_agent,
        handlers::list_delegations,
        handlers::delegations_stream,
        // Chat
        handlers::claude_models,
        handlers::claude_chat,
        handlers::claude_chat_stream,
        // Settings
        handlers::get_settings,
        handlers::update_settings,
        handlers::set_api_key,
        // Sessions (local overrides with utoipa annotations)
        handlers::get_session,
        handlers::add_session_message,
        // Tags & search
        handlers::get_session_tags,
        handlers::add_session_tags,
        handlers::delete_session_tag,
        handlers::search_sessions,
        handlers::list_all_tags,
        // Model registry
        model_registry::list_models,
        model_registry::refresh_models,
        model_registry::pin_model,
        model_registry::unpin_model,
        model_registry::list_pins,
    ),
    components(schemas(
        // Core models
        models::HealthResponse,
        models::ProviderInfo,
        models::SystemStats,
        models::SystemMetricsResponse,
        models::MetricItem,
        models::NetworkMetric,
        // Agents
        models::WitcherAgent,
        models::CreateAgentRequest,
        models::UpdateAgentRequest,
        // Chat
        models::ChatRequest,
        models::ChatMessage,
        models::ChatResponse,
        models::UsageInfo,
        models::ClaudeModelInfo,
        // Settings
        models::AppSettings,
        models::ApiKeyRequest,
        // Sessions
        models::Session,
        models::SessionSummary,
        models::HistoryEntry,
        models::ToolInteractionInfo,
        models::CreateSessionRequest,
        models::UpdateSessionRequest,
        models::AddMessageRequest,
        // Model registry
        model_registry::ModelInfo,
        model_registry::ResolvedModels,
        model_registry::PinModelRequest,
        // Prompt history
        models::AddPromptRequest,
        // Tags
        handlers::tags::AddTagsRequest,
        handlers::tags::SearchResult,
    )),
    tags(
        (name = "health", description = "Health & readiness endpoints"),
        (name = "auth", description = "Authentication & API key management"),
        (name = "agents", description = "Agent configuration"),
        (name = "chat", description = "Claude chat & streaming"),
        (name = "settings", description = "Application settings"),
        (name = "sessions", description = "Chat session management"),
        (name = "models", description = "Dynamic model registry & pinning"),
        (name = "system", description = "System monitoring"),
        (name = "tags", description = "Session tagging & full-text search"),
    )
)]
pub struct ApiDoc;

// ═══════════════════════════════════════════════════════════════════════
//  Route group builders — CH-specific fragments
// ═══════════════════════════════════════════════════════════════════════

/// CH primary auth routes — Anthropic OAuth (PKCE).
///
/// These are provided via `HydraRouterConfig.primary_auth_override` to replace
/// the shared router's default Google OAuth handlers at `/api/auth/status`,
/// `/api/auth/login`, and `/api/auth/logout`. The `/api/auth/callback` path
/// (Anthropic PKCE callback) is CH-specific and has no conflict.
fn ch_primary_auth_routes() -> Router<AppState> {
    Router::new()
        // Anthropic OAuth PKCE — replaces shared Google OAuth at these paths.
        // Uses jaskier_oauth shared crate directly (local oauth.rs removed).
        .route("/api/auth/status", get(jaskier_oauth::anthropic::anthropic_auth_status::<AppState>))
        .route("/api/auth/login", post(jaskier_oauth::anthropic::anthropic_auth_login::<AppState>))
        .route("/api/auth/callback", post(jaskier_oauth::anthropic::anthropic_auth_callback::<AppState>))
        .route("/api/auth/logout", post(jaskier_oauth::anthropic::anthropic_auth_logout::<AppState>))
}

/// CH WebSocket chat route (maps to `ws_route` config slot).
fn ch_ws_route() -> Router<AppState> {
    Router::new().route("/ws/chat", get(handlers::ws_chat))
}

/// CH streaming + non-streaming chat routes (maps to `execute_routes` config slot).
/// The shared router applies `require_auth` and rate limiting to this group.
fn ch_chat_routes() -> Router<AppState> {
    Router::new()
        .route("/api/claude/chat/stream", post(handlers::claude_chat_stream))
        .route("/api/claude/chat", post(handlers::claude_chat))
        .route("/api/prefetch/hints", post(handlers::prefetch_hints))
}

/// CH agents router — full agents CRUD + delegation monitoring (with auth).
/// Passed as `agents_router` (auth is applied by the caller via `route_layer`).
fn ch_agents_router(state: AppState) -> Router<AppState> {
    Router::new()
        .route(
            "/api/agents",
            get(handlers::list_agents).post(handlers::create_agent),
        )
        .route(
            "/api/agents/{id}",
            get(handlers::get_agent)
                .put(handlers::update_agent)
                .delete(handlers::delete_agent),
        )
        .route("/api/agents/refresh", post(handlers::refresh_agents))
        .route("/api/agents/delegations", get(handlers::list_delegations))
        .route(
            "/api/agents/delegations/stream",
            get(handlers::delegations_stream),
        )
        .route_layer(axum::middleware::from_fn_with_state(
            state,
            auth::require_auth::<AppState>,
        ))
}

/// CH files router (with auth).
fn ch_files_router(state: AppState) -> Router<AppState> {
    Router::new()
        .route("/api/files/list", post(handlers::list_files))
        .route("/api/files/browse", post(handlers::browse_directory))
        .route_layer(axum::middleware::from_fn_with_state(
            state,
            auth::require_auth::<AppState>,
        ))
}

/// CH system router — stats, admin, and API-key-auth routes.
///
/// Note: `/api/health`, `/api/health/ready`, `/api/health/detailed`, and
/// `/api/auth/mode` are provided by `build_hydra_router` via `HasHealthState`
/// handlers, so they are NOT registered here to avoid duplicate-route panics.
fn ch_system_router(state: AppState) -> Router<AppState> {
    // Protected system endpoints (require auth)
    let protected = Router::new()
        .route("/api/system/stats", get(handlers::system_stats))
        .route("/api/admin/rotate-key", post(handlers::rotate_key))
        .route(
            "/api/admin/rate-limits",
            get(rate_limits::list_rate_limits::<AppState>),
        )
        .route(
            "/api/admin/rate-limits/{endpoint_group}",
            patch(rate_limits::update_rate_limit::<AppState>),
        )
        .route_layer(axum::middleware::from_fn_with_state(
            state.clone(),
            auth::require_auth::<AppState>,
        ));

    // API key auth required for metrics/audit
    let api_key_auth = Router::new()
        .route("/api/system/metrics", get(handlers::system_metrics))
        .route("/api/system/audit", get(handlers::system_audit))
        .route_layer(axum::middleware::from_fn_with_state(
            state,
            auth::require_api_key_auth,
        ));

    protected.merge(api_key_auth)
}

/// CH browser proxy routes (public, no auth).
///
/// Note: `/api/browser-proxy/history` is provided by `build_hydra_router`
/// via the shared `browser_proxy_history` handler, so it is NOT registered
/// here to avoid duplicate-route panics.
fn ch_browser_proxy_routes() -> Router<AppState> {
    Router::new()
        .route(
            "/api/browser-proxy/status",
            get(browser_proxy::proxy_status::<AppState>),
        )
        .route("/api/browser-proxy/login", post(browser_proxy::proxy_login::<AppState>))
        .route(
            "/api/browser-proxy/login/status",
            get(browser_proxy::proxy_login_status::<AppState>),
        )
        .route(
            "/api/browser-proxy/reinit",
            post(browser_proxy::proxy_reinit::<AppState>),
        )
        .route(
            "/api/browser-proxy/logout",
            delete(browser_proxy::proxy_logout::<AppState>),
        )
}

/// CH OCR routes (protected — auth applied by the shared router's protected group).
fn ch_ocr_routes() -> Router<AppState> {
    Router::new()
        .route("/api/ocr", post(ocr::ocr))
        .route("/api/ocr/stream", post(ocr::ocr_stream))
        .route("/api/ocr/batch/stream", post(ocr::ocr_batch_stream))
        .route("/api/ocr/history", get(ocr::ocr_history))
        .route(
            "/api/ocr/history/{id}",
            get(ocr::ocr_history_item).delete(ocr::ocr_history_delete),
        )
}

/// CH-specific protected routes not covered by the shared router.
/// The shared router's `app_protected_routes` slot — auth is applied by the builder.
///
/// Routes excluded here (handled by `build_hydra_router` shared logic):
/// - `/api/models*`        — shared model registry handlers
/// - `/api/logs/backend`   — shared log ring buffer handlers
/// - `/api/tokens*`        — shared service token handlers
/// - `/api/sessions*`      — shared `session_routes::<S>()` (list, CRUD, messages,
///   working-directory, generate-title, prompt-history)
/// - `/mcp`                — shared MCP server endpoint
/// - `/api/mcp/*`          — shared MCP config endpoints
///
/// CH-specific session extensions that ARE safe to add here (not in `session_routes`):
/// - `/api/sessions/search`         — CH full-text search (not in shared session_routes)
/// - `/api/sessions/{id}/tags*`     — CH session tagging (not in shared session_routes)
/// - `/api/tags`                    — CH global tag listing
fn ch_app_protected_routes() -> Router<AppState> {
    Router::new()
        // Claude model list (CH-specific — Anthropic models, not Google)
        .route("/api/claude/models", get(handlers::claude_models))
        // Session search (literal path, NOT in shared session_routes)
        .route("/api/sessions/search", get(handlers::search_sessions))
        // Session tags (NOT in shared session_routes)
        .route(
            "/api/sessions/{id}/tags",
            get(handlers::get_session_tags).post(handlers::add_session_tags),
        )
        .route(
            "/api/sessions/{id}/tags/{tag}",
            delete(handlers::delete_session_tag),
        )
        // Global tags listing (NOT in shared session_routes)
        .route("/api/tags", get(handlers::list_all_tags))
        // Settings API key endpoint (CH-specific Anthropic key storage,
        // not in shared session_routes which only has /api/settings GET+PATCH)
        .route("/api/settings/api-key", post(handlers::set_api_key))
        // Analytics — agent performance dashboard (CH-specific)
        .route("/api/analytics/tokens", get(handlers::analytics_tokens))
        .route("/api/analytics/latency", get(handlers::analytics_latency))
        .route(
            "/api/analytics/success-rate",
            get(handlers::analytics_success_rate),
        )
        .route("/api/analytics/top-tools", get(handlers::analytics_top_tools))
        .route("/api/analytics/cost", get(handlers::analytics_cost))
}

/// Prometheus metrics endpoint (public, no auth).
fn ch_metrics_router() -> Router<AppState> {
    Router::new().route(
        "/api/metrics",
        get(jaskier_core::metrics::metrics_handler::<AppState>),
    )
}

/// Web Vitals collection + profiling routes (public, no auth — beacon API).
fn ch_profiling_routes() -> Router<AppState> {
    Router::new()
        .route(
            "/api/vitals",
            post(jaskier_core::profiling::vitals_handler::<AppState>),
        )
}

// ═══════════════════════════════════════════════════════════════════════
//  Vault proxy routes — forward to Jaskier Vault MCP for the frontend
// ═══════════════════════════════════════════════════════════════════════

/// Vault proxy: public health endpoint (no auth).
fn ch_vault_public_routes() -> Router<AppState> {
    Router::new()
        .route("/api/vault/health", get(vault_proxy::vault_health))
        .route("/api/vault/audit", get(vault_proxy::vault_audit))
}

/// Vault proxy: protected endpoints (auth required).
fn ch_vault_protected_routes(state: AppState) -> Router<AppState> {
    Router::new()
        .route("/api/vault/panic", post(vault_proxy::vault_panic))
        .route("/api/vault/rotate", post(vault_proxy::vault_rotate))
        .route_layer(axum::middleware::from_fn_with_state(
            state,
            auth::require_auth::<AppState>,
        ))
}

/// Vault proxy handler implementations.
///
/// These forward requests to the Jaskier Vault MCP Server (default: localhost:5190).
/// The frontend calls these CH backend endpoints instead of hitting Vault directly,
/// keeping the Vault URL internal to the backend.
mod vault_proxy {
    use axum::extract::State;
    use axum::http::StatusCode;
    use axum::response::IntoResponse;
    use axum::Json;
    use serde_json::{json, Value};

    use super::state::AppState;
    use crate::ai_gateway::vault_bridge::HasVaultBridge;

    /// GET /api/vault/health — forward to VaultClient health check.
    pub async fn vault_health(State(state): State<AppState>) -> impl IntoResponse {
        let status = state.vault_client().health().await;
        Json(serde_json::to_value(status).unwrap_or_else(|_| json!({"online": false})))
    }

    /// GET /api/vault/audit — forward to Vault audit endpoint.
    pub async fn vault_audit(State(state): State<AppState>) -> impl IntoResponse {
        let vault_url = state.vault_client().vault_url();
        let url = format!("{}/api/vault/audit", vault_url);

        match reqwest::get(&url).await {
            Ok(resp) if resp.status().is_success() => {
                let body: Value = resp.json().await.unwrap_or(json!([]));
                (StatusCode::OK, Json(body))
            }
            Ok(resp) => {
                let status = resp.status().as_u16();
                (
                    StatusCode::from_u16(status).unwrap_or(StatusCode::BAD_GATEWAY),
                    Json(json!({"error": "vault_audit_failed", "status": status})),
                )
            }
            Err(e) => (
                StatusCode::BAD_GATEWAY,
                Json(json!({"error": "vault_unreachable", "message": e.to_string()})),
            ),
        }
    }

    /// POST /api/vault/panic — forward vault panic (PROTECTED).
    pub async fn vault_panic(State(state): State<AppState>) -> impl IntoResponse {
        let vault_url = state.vault_client().vault_url();
        let url = format!("{}/api/vault/panic", vault_url);
        let client = reqwest::Client::new();

        match client.post(&url).send().await {
            Ok(resp) if resp.status().is_success() => {
                let body: Value = resp.json().await.unwrap_or(json!({"status": "panic_executed"}));
                (StatusCode::OK, Json(body))
            }
            Ok(resp) => {
                let status = resp.status().as_u16();
                (
                    StatusCode::from_u16(status).unwrap_or(StatusCode::BAD_GATEWAY),
                    Json(json!({"error": "vault_panic_failed", "status": status})),
                )
            }
            Err(e) => (
                StatusCode::BAD_GATEWAY,
                Json(json!({"error": "vault_unreachable", "message": e.to_string()})),
            ),
        }
    }

    /// POST /api/vault/rotate — forward vault rotate (PROTECTED).
    pub async fn vault_rotate(State(state): State<AppState>) -> impl IntoResponse {
        let vault_url = state.vault_client().vault_url();
        let url = format!("{}/api/vault/rotate", vault_url);
        let client = reqwest::Client::new();

        match client.post(&url).send().await {
            Ok(resp) if resp.status().is_success() => {
                let body: Value = resp.json().await.unwrap_or(json!({"status": "rotate_executed"}));
                (StatusCode::OK, Json(body))
            }
            Ok(resp) => {
                let status = resp.status().as_u16();
                (
                    StatusCode::from_u16(status).unwrap_or(StatusCode::BAD_GATEWAY),
                    Json(json!({"error": "vault_rotate_failed", "status": status})),
                )
            }
            Err(e) => (
                StatusCode::BAD_GATEWAY,
                Json(json!({"error": "vault_unreachable", "message": e.to_string()})),
            ),
        }
    }
}

// ═══════════════════════════════════════════════════════════════════════
//  HydraRouterConfig builder
// ═══════════════════════════════════════════════════════════════════════

fn build_ch_config(state: AppState) -> HydraRouterConfig<AppState> {
    HydraRouterConfig {
        // Primary auth override: Anthropic OAuth replaces shared Google OAuth
        // at /api/auth/status, /api/auth/login, /api/auth/logout.
        primary_auth_override: Some(ch_primary_auth_routes()),

        // WebSocket streaming (Anthropic-native via claude_chat_stream fallback)
        ws_route: ch_ws_route(),

        // Streaming + non-streaming Claude chat (auth + rate limiting applied by builder)
        execute_routes: ch_chat_routes(),

        // Pre-built sub-routers (already have auth middleware)
        agents_router: ch_agents_router(state.clone()),
        files_router: ch_files_router(state.clone()),
        system_router: ch_system_router(state.clone()),

        // Browser proxy routes (public, no auth)
        browser_proxy_routes: ch_browser_proxy_routes(),

        // OCR routes (auth applied by shared router's protected group)
        ocr_routes: ch_ocr_routes(),

        // CH-specific protected routes (auth applied by builder)
        app_protected_routes: ch_app_protected_routes(),

        // CH has no ADK sidecar bridge
        internal_tool_route: Router::new(),

        // Prometheus metrics
        metrics_router: ch_metrics_router(),

        // OpenAPI spec
        openapi: ApiDoc::openapi(),
    }
}

// ═══════════════════════════════════════════════════════════════════════
//  Public API
// ═══════════════════════════════════════════════════════════════════════

/// Webhook routes for Grafana alerts
fn ch_auto_qa_routes() -> Router<AppState> {
    Router::new()
        .route("/api/webhooks/grafana", post(auto_qa::grafana_webhook::<AppState>))
}

/// Build the application router with the given shared state.
/// Extracted from `main()` so integration tests can construct the app
/// without binding to a network port.
///
/// Uses `build_hydra_router` from jaskier-core as the foundation.
/// CH-specific routes are injected via `HydraRouterConfig`:
/// - `primary_auth_override`: Anthropic OAuth replaces shared Google OAuth at `/api/auth/*`
/// - `execute_routes`: claude_chat + claude_chat_stream (with auth + rate limiting)
/// - `agents_router`, `files_router`, `system_router`: CH-specific CRUD + admin
/// - `app_protected_routes`: analytics, tags, settings/api-key, OCR, claude/models
///
/// The ai_gateway router is merged BEFORE the HydraRouter (higher priority) to
/// ensure `/api/ai/*` and `/api/vault/*` routes take precedence.
/// TODO: Remove old auth routes after full migration to ai_gateway
pub fn create_router(state: AppState) -> Router {
    let hydra_router = build_hydra_router(state.clone(), build_ch_config(state.clone()));

    // ai_gateway routes merged first — higher priority than old auth routes.
    // .with_state() converts Router<AppState> → Router<()> so it can merge
    // with the hydra_router (which already has state applied).
    let gateway_routes = ai_gateway::handlers::ai_gateway_router::<AppState>()
        .merge(ch_vault_public_routes())
        .merge(ch_vault_protected_routes(state.clone()))
        // Webhooks: Grafana incidents
        .merge(ch_auto_qa_routes())
        // Profiling: Web Vitals collection endpoint (/api/vitals)
        .merge(ch_profiling_routes())
        // Swarm IPC: Cross-Agent Communication Protocol endpoints
        .merge(jaskier_swarm::swarm_router::<AppState>())
        // CRDT Real-time Collaboration: WebSocket sync + stats endpoints
        .merge(jaskier_collab::collab_router::<AppState>())
        // Semantic Cache: Qdrant-backed semantic router + AST compression
        .merge(semantic_cache::handlers::semantic_cache_router::<AppState>())
        // Sandbox: Isolated code execution environment for safe agent testing
        .merge(sandbox::sandbox_router::<AppState>())
        // Memory Pruning: Self-Reflection & Knowledge Graph cleanup
        .merge(memory_pruning::memory_pruning_router::<AppState>())
        .with_state(state.clone());

    // PERF: HTTP latency tracking middleware — records every request duration
    gateway_routes.merge(hydra_router)
        .layer(axum::middleware::from_fn_with_state(
            state,
            jaskier_core::profiling::latency_middleware::<AppState>,
        ))
}

/// Test-only router — identical routes but **without** `GovernorLayer` rate
/// limiting. `tower_governor` extracts the peer IP via `ConnectInfo`, which
/// is absent in `oneshot()` integration tests, causing a blanket 500
/// "Unable To Extract Key!" error. Removing the layer keeps all handler
/// logic intact while allowing pure in-memory tests.
#[doc(hidden)]
pub fn create_test_router(state: AppState) -> Router {
    let hydra_router = build_hydra_test_router(state.clone(), build_ch_config(state.clone()));

    // ai_gateway routes merged first — higher priority than old auth routes.
    let gateway_routes = ai_gateway::handlers::ai_gateway_router::<AppState>()
        .merge(ch_vault_public_routes())
        .merge(ch_vault_protected_routes(state.clone()))
        // Webhooks: Grafana incidents
        .merge(ch_auto_qa_routes())
        .merge(ch_profiling_routes())
        // CRDT Real-time Collaboration
        .merge(jaskier_collab::collab_router::<AppState>())
        // Semantic Cache
        .merge(semantic_cache::handlers::semantic_cache_router::<AppState>())
        // Sandbox (test router)
        .merge(sandbox::sandbox_router::<AppState>())
        // Memory Pruning (test router)
        .merge(memory_pruning::memory_pruning_router::<AppState>())
        .with_state(state.clone());

    gateway_routes.merge(hydra_router)
        .layer(axum::middleware::from_fn_with_state(
            state,
            jaskier_core::profiling::latency_middleware::<AppState>,
        ))
}
