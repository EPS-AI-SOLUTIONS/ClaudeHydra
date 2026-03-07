pub mod audit;
pub mod auth;
pub mod browser_proxy;
pub mod handlers;
pub mod logs;
pub mod mcp;
pub mod model_registry;
pub mod models;
pub mod oauth;
pub mod oauth_google;
pub mod ocr;
pub mod oauth_github;
pub mod oauth_vercel;
pub mod service_tokens;
pub mod state;
pub mod system_monitor;
pub mod tools;
pub mod watchdog;

use axum::extract::{DefaultBodyLimit, State};
use axum::middleware;
use axum::routing::{delete, get, patch, post};
use axum::Router;
use tower_governor::{governor::GovernorConfigBuilder, GovernorLayer};
use utoipa::OpenApi;
use utoipa_swagger_ui::SwaggerUi;

use state::AppState;

// ═══════════════════════════════════════════════════════════════════════
//  Request correlation ID middleware — Jaskier Shared Pattern
// ═══════════════════════════════════════════════════════════════════════

/// Middleware that generates a UUID v4 correlation ID for each request.
///
/// - Adds it to the current tracing span as `request_id`
/// - Returns it in the `X-Request-Id` response header
/// - Accepts an incoming `X-Request-Id` header to propagate from upstream
async fn request_id_middleware(
    req: axum::http::Request<axum::body::Body>,
    next: axum::middleware::Next,
) -> axum::response::Response {
    // Use the incoming X-Request-Id if present, otherwise generate one
    let request_id = req
        .headers()
        .get("x-request-id")
        .and_then(|v| v.to_str().ok())
        .map(|s| s.to_string())
        .unwrap_or_else(|| uuid::Uuid::new_v4().to_string());

    // Add to current tracing span
    tracing::Span::current().record("request_id", &request_id.as_str());
    tracing::debug!(request_id = %request_id, "request correlation ID assigned");

    let mut response = next.run(req).await;

    // Add X-Request-Id to response headers
    if let Ok(header_value) = axum::http::HeaderValue::from_str(&request_id) {
        response.headers_mut().insert("x-request-id", header_value);
    }

    response
}

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
        // Agents
        handlers::list_agents,
        // Chat
        handlers::claude_models,
        handlers::claude_chat,
        handlers::claude_chat_stream,
        // Settings
        handlers::get_settings,
        handlers::update_settings,
        handlers::set_api_key,
        // Sessions
        handlers::list_sessions,
        handlers::create_session,
        handlers::get_session,
        handlers::update_session,
        handlers::delete_session,
        handlers::add_session_message,
        handlers::generate_session_title,
        // Model registry
        model_registry::list_models,
        model_registry::refresh_models,
        model_registry::pin_model,
        model_registry::unpin_model,
        model_registry::list_pins,
        // Prompt history
        handlers::list_prompt_history,
        handlers::add_prompt_history,
        handlers::clear_prompt_history,
    ),
    components(schemas(
        // Core models
        models::HealthResponse,
        models::ProviderInfo,
        models::SystemStats,
        // Agents
        models::WitcherAgent,
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
    )
)]
pub struct ApiDoc;

/// Build the application router with the given shared state.
/// Extracted from `main()` so integration tests can construct the app
/// without binding to a network port.
pub fn create_router(state: AppState) -> Router {
    // ── #21 Per-endpoint rate limiting — Jaskier Shared Pattern ──────
    // Streaming chat: 20 req/min (1 per 3s burst 20)
    let rl_chat_stream = GovernorConfigBuilder::default()
        .per_second(3)
        .burst_size(20)
        .finish()
        .expect("rate limiter config: chat_stream");
    // Non-streaming chat: 30 req/min (1 per 2s burst 30)
    let rl_chat = GovernorConfigBuilder::default()
        .per_second(2)
        .burst_size(30)
        .finish()
        .expect("rate limiter config: chat");
    // Other protected routes: 120 req/min (1 per 0.5s burst 120)
    let rl_default = GovernorConfigBuilder::default()
        .per_millisecond(500)
        .burst_size(120)
        .finish()
        .expect("rate limiter config: default");

    // ── Public routes (no auth) ──────────────────────────────────────
    let public = Router::new()
        .route("/api/health", get(handlers::health_check))
        .route("/api/health/ready", get(handlers::readiness))
        // Anthropic OAuth (PKCE)
        .route("/api/auth/status", get(oauth::auth_status))
        .route("/api/auth/login", post(oauth::auth_login))
        .route("/api/auth/callback", post(oauth::auth_callback))
        .route("/api/auth/logout", post(oauth::auth_logout))
        .route("/api/auth/mode", get(handlers::auth_mode))
        // Google OAuth (public — must be accessible to complete auth flow)
        .route("/api/auth/google/status", get(oauth_google::google_auth_status))
        .route("/api/auth/google/login", post(oauth_google::google_auth_login))
        .route("/api/auth/google/redirect", get(oauth_google::google_redirect))
        .route("/api/auth/google/logout", post(oauth_google::google_auth_logout))
        .route("/api/auth/google/apikey", post(oauth_google::google_save_api_key).delete(oauth_google::google_delete_api_key))
        // GitHub OAuth (public — must be accessible to complete auth flow)
        .route("/api/auth/github/status", get(oauth_github::github_auth_status))
        .route("/api/auth/github/login", post(oauth_github::github_auth_login))
        .route("/api/auth/github/callback", post(oauth_github::github_auth_callback))
        .route("/api/auth/github/logout", post(oauth_github::github_auth_logout))
        // Vercel OAuth (public — must be accessible to complete auth flow)
        .route("/api/auth/vercel/status", get(oauth_vercel::vercel_auth_status))
        .route("/api/auth/vercel/login", post(oauth_vercel::vercel_auth_login))
        .route("/api/auth/vercel/callback", post(oauth_vercel::vercel_auth_callback))
        .route("/api/auth/vercel/logout", post(oauth_vercel::vercel_auth_logout))
        // Browser proxy management (public — no auth, proxy handles its own state)
        .route("/api/browser-proxy/status", get(browser_proxy::proxy_status))
        .route("/api/browser-proxy/login", post(browser_proxy::proxy_login))
        .route("/api/browser-proxy/login/status", get(browser_proxy::proxy_login_status))
        .route("/api/browser-proxy/reinit", post(browser_proxy::proxy_reinit))
        .route("/api/browser-proxy/logout", delete(browser_proxy::proxy_logout));

    // ── Protected: streaming chat — 20 req/min ──────────────────────
    let chat_stream_routes = Router::new()
        .route(
            "/api/claude/chat/stream",
            post(handlers::claude_chat_stream),
        )
        .layer(GovernorLayer::new(rl_chat_stream));

    // ── Protected: non-streaming chat — 30 req/min ──────────────────
    let chat_routes = Router::new()
        .route("/api/claude/chat", post(handlers::claude_chat))
        .layer(GovernorLayer::new(rl_chat));

    // ── Protected: other routes — 120 req/min ───────────────────────
    let other_routes = Router::new()
        .route("/api/system/stats", get(handlers::system_stats))
        // Admin — hot-reload API keys
        .route("/api/admin/rotate-key", post(handlers::rotate_key))
        // Service tokens (Fly.io PAT, etc.) — protected
        .route(
            "/api/tokens",
            get(service_tokens::list_tokens).post(service_tokens::store_token),
        )
        .route(
            "/api/tokens/{service}",
            delete(service_tokens::delete_token),
        )
        // Logs — backend log ring buffer
        .route("/api/logs/backend", get(logs::backend_logs).delete(logs::clear_backend_logs))
        .route("/api/agents", get(handlers::list_agents))
        .route("/api/agents/refresh", post(handlers::refresh_agents))
        .route("/api/claude/models", get(handlers::claude_models))
        .route("/api/models", get(model_registry::list_models))
        .route("/api/models/refresh", post(model_registry::refresh_models))
        .route("/api/models/pin", post(model_registry::pin_model))
        .route(
            "/api/models/pin/{use_case}",
            delete(model_registry::unpin_model),
        )
        .route("/api/models/pins", get(model_registry::list_pins))
        .route(
            "/api/settings",
            get(handlers::get_settings).post(handlers::update_settings),
        )
        .route("/api/settings/api-key", post(handlers::set_api_key))
        .route(
            "/api/sessions",
            get(handlers::list_sessions).post(handlers::create_session),
        )
        .route(
            "/api/sessions/{id}",
            get(handlers::get_session)
                .patch(handlers::update_session)
                .delete(handlers::delete_session),
        )
        .route(
            "/api/sessions/{id}/working-directory",
            patch(handlers::update_session_working_directory),
        )
        .route("/api/files/list", post(handlers::list_files))
        .route("/api/files/browse", post(handlers::browse_directory))
        .route(
            "/api/sessions/{id}/messages",
            post(handlers::add_session_message),
        )
        .route(
            "/api/sessions/{id}/generate-title",
            post(handlers::generate_session_title),
        )
        // ── MCP routes (Phase 9 + 10) ────────────────────────────────
        .route(
            "/api/mcp/servers",
            get(mcp::config::list_servers_handler).post(mcp::config::create_server_handler),
        )
        .route(
            "/api/mcp/servers/{id}",
            patch(mcp::config::update_server_handler).delete(mcp::config::delete_server_handler),
        )
        .route(
            "/api/mcp/servers/{id}/connect",
            post(mcp::config::connect_server_handler),
        )
        .route(
            "/api/mcp/servers/{id}/disconnect",
            post(mcp::config::disconnect_server_handler),
        )
        .route(
            "/api/mcp/servers/{id}/tools",
            get(mcp::config::list_server_tools_handler),
        )
        .route("/api/mcp/tools", get(mcp::config::list_all_tools_handler))
        .route("/mcp", post(mcp::server::mcp_handler))
        // OCR — text extraction from images and PDFs
        .route("/api/ocr", post(ocr::ocr))
        .route("/api/ocr/stream", post(ocr::ocr_stream))
        .route("/api/ocr/batch/stream", post(ocr::ocr_batch_stream))
        .route("/api/ocr/history", get(ocr::ocr_history))
        .route(
            "/api/ocr/history/{id}",
            get(ocr::ocr_history_item).delete(ocr::ocr_history_delete),
        )
        // Prompt history
        .route(
            "/api/prompt-history",
            get(handlers::list_prompt_history)
                .post(handlers::add_prompt_history)
                .delete(handlers::clear_prompt_history),
        )
        .layer(GovernorLayer::new(rl_default));

    // ── Merge all protected routes with auth layer ──────────────────
    let protected = chat_stream_routes
        .merge(chat_routes)
        .merge(other_routes)
        .route_layer(middleware::from_fn_with_state(
            state.clone(),
            auth::require_auth,
        ));

    // ── Metrics endpoint (public, no auth) ─────────────────────────
    let metrics = Router::new().route("/api/metrics", get(metrics_handler));

    // ── API v1 prefix alias (mirrors /api routes for forward compat) ─
    let v1_public = Router::new()
        .route("/api/v1/health", get(handlers::health_check))
        .route("/api/v1/health/ready", get(handlers::readiness))
        .route("/api/v1/auth/mode", get(handlers::auth_mode));

    // ── WebSocket route (auth via ?token query param, outside middleware) ─
    let ws_routes = Router::new()
        .route("/ws/chat", get(handlers::ws_chat));

    public
        .merge(protected)
        .merge(ws_routes)
        .merge(metrics)
        .merge(v1_public)
        // Swagger UI — no auth required
        .merge(SwaggerUi::new("/swagger-ui").url("/api-docs/openapi.json", ApiDoc::openapi()))
        // 60 MB body limit — must be before .with_state() for Json extractor
        .layer(DefaultBodyLimit::max(60 * 1024 * 1024))
        // Request correlation ID — adds X-Request-Id header to every response
        .layer(axum::middleware::from_fn(request_id_middleware))
        .with_state(state)
}

// ── Prometheus-compatible metrics endpoint ───────────────────────────────────

async fn metrics_handler(State(state): State<AppState>) -> String {
    let snapshot = state.system_monitor.read().await;
    let uptime = state.start_time.elapsed().as_secs();
    format!(
        "# HELP cpu_usage_percent CPU usage percentage\n\
         # TYPE cpu_usage_percent gauge\n\
         cpu_usage_percent {:.1}\n\
         # HELP memory_used_bytes Memory used in bytes\n\
         # TYPE memory_used_bytes gauge\n\
         memory_used_bytes {}\n\
         # HELP memory_total_bytes Total memory in bytes\n\
         # TYPE memory_total_bytes gauge\n\
         memory_total_bytes {}\n\
         # HELP uptime_seconds Backend uptime in seconds\n\
         # TYPE uptime_seconds counter\n\
         uptime_seconds {}\n",
        snapshot.cpu_usage_percent,
        (snapshot.memory_used_mb * 1024.0 * 1024.0) as u64,
        (snapshot.memory_total_mb * 1024.0 * 1024.0) as u64,
        uptime,
    )
}
