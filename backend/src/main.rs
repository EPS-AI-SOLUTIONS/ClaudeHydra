use http::{Method, header};
use tower_http::compression::CompressionLayer;
use tower_http::cors::CorsLayer;
use tower_http::set_header::SetResponseHeaderLayer;
use tower_http::trace::TraceLayer;

use claudehydra_backend::handlers;
use claudehydra_backend::model_registry;
#[cfg(feature = "shuttle")]
use claudehydra_backend::state::LogRingBuffer;
use claudehydra_backend::state::AppState;
use claudehydra_backend::watchdog;

use jaskier_core::app_builder;

fn build_app(state: AppState) -> axum::Router {
    // CORS — allow Vite dev server + Vercel production
    let cors = CorsLayer::new()
        .allow_origin([
            "http://localhost:4173"
                .parse()
                .expect("localhost:4173 is a valid hardcoded URL"),
            "http://localhost:5199"
                .parse()
                .expect("localhost:5199 is a valid hardcoded URL"),
            "http://127.0.0.1:5199"
                .parse()
                .expect("127.0.0.1:5199 is a valid hardcoded URL"),
            // GeminiHydra frontend (partner app cross-session access)
            "http://localhost:5176"
                .parse()
                .expect("localhost:5176 is a valid hardcoded URL"),
            "http://127.0.0.1:5176"
                .parse()
                .expect("127.0.0.1:5176 is a valid hardcoded URL"),
            "https://claudehydra-v4.vercel.app"
                .parse()
                .expect("claudehydra-v4.vercel.app is a valid hardcoded URL"),
            "https://claudehydra-v4-pawelserkowskis-projects.vercel.app"
                .parse()
                .expect(
                    "claudehydra-v4-pawelserkowskis-projects.vercel.app is a valid hardcoded URL",
                ),
        ])
        .allow_methods([
            Method::GET,
            Method::POST,
            Method::PATCH,
            Method::DELETE,
            Method::OPTIONS,
        ])
        .allow_headers([header::CONTENT_TYPE, header::AUTHORIZATION])
        .max_age(std::time::Duration::from_secs(86_400));

    // Rate limiting: per-endpoint governors configured in lib.rs (#21)
    claudehydra_backend::create_router(state)
        .layer(cors)
        // ── #11 Security headers ────────────────────────────────────────
        .layer(SetResponseHeaderLayer::overriding(
            header::X_CONTENT_TYPE_OPTIONS,
            header::HeaderValue::from_static("nosniff"),
        ))
        .layer(SetResponseHeaderLayer::overriding(
            header::X_FRAME_OPTIONS,
            header::HeaderValue::from_static("DENY"),
        ))
        .layer(SetResponseHeaderLayer::overriding(
            header::REFERRER_POLICY,
            header::HeaderValue::from_static("strict-origin-when-cross-origin"),
        ))
        .layer(SetResponseHeaderLayer::overriding(
            header::CONTENT_SECURITY_POLICY,
            header::HeaderValue::from_static(
                "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self' https://generativelanguage.googleapis.com https://api.anthropic.com https://api.openai.com; img-src 'self' data: blob:",
            ),
        ))
        .layer(SetResponseHeaderLayer::overriding(
            header::STRICT_TRANSPORT_SECURITY,
            header::HeaderValue::from_static("max-age=63072000; includeSubDomains"),
        ))
        // #11 X-XSS-Protection (legacy but still used by older browsers)
        .layer(SetResponseHeaderLayer::overriding(
            http::HeaderName::from_static("x-xss-protection"),
            header::HeaderValue::from_static("1; mode=block"),
        ))
        // #11 Permissions-Policy — disable sensitive browser APIs
        .layer(SetResponseHeaderLayer::overriding(
            http::HeaderName::from_static("permissions-policy"),
            header::HeaderValue::from_static(
                "camera=(), microphone=(), geolocation=(), payment=(), usb=(), magnetometer=(), gyroscope=(), accelerometer=()",
            ),
        ))
        // #12 tower_governor already injects X-RateLimit-Limit, X-RateLimit-Remaining,
        // X-RateLimit-After, and Retry-After headers automatically via GovernorLayer.
        // No additional middleware needed — the headers are set by the governor layer above.
        .layer(
            TraceLayer::new_for_http().make_span_with(|request: &http::Request<_>| {
                // Log only path (not query string) to avoid leaking WS token (?token=xxx)
                tracing::info_span!(
                    "http_request",
                    method = %request.method(),
                    uri = %request.uri().path(),
                )
            }),
        )
        .layer(CompressionLayer::new())
}

// ── Shuttle deployment entry point ──────────────────────────────────
#[cfg(feature = "shuttle")]
#[shuttle_runtime::main]
async fn main() -> shuttle_axum::ShuttleAxum {
    dotenvy::dotenv().ok();

    let database_url = std::env::var("DATABASE_URL").expect("DATABASE_URL required");
    let pool = sqlx::postgres::PgPoolOptions::new()
        .max_connections(5)
        .acquire_timeout(std::time::Duration::from_secs(3))
        .idle_timeout(std::time::Duration::from_secs(600))
        .max_lifetime(std::time::Duration::from_secs(1800))
        .connect(&database_url)
        .await
        .expect("DB connection failed");
    sqlx::migrate!("./migrations")
        .run(&pool)
        .await
        .expect("Migrations failed");

    let log_buffer = std::sync::Arc::new(LogRingBuffer::new(1000));
    let state = AppState::new(pool, log_buffer);

    // ── Spawn system monitor (CPU/memory stats, refreshed every 5s) ──
    claudehydra_backend::system_monitor::spawn(state.system_monitor.clone());

    model_registry::startup_sync(&state).await;
    handlers::warm_prompt_cache(&state).await;
    state.mark_ready();
    Ok(build_app(state).into())
}

// ── Local development entry point ───────────────────────────────────
#[cfg(not(feature = "shuttle"))]
#[tokio::main]
async fn main() -> anyhow::Result<()> {
    app_builder::enable_ansi();
    let log_buffer = app_builder::init_tracing(1000);

    dotenvy::dotenv().ok();

    let database_url = std::env::var("DATABASE_URL").expect("DATABASE_URL required");
    let pool = sqlx::postgres::PgPoolOptions::new()
        .max_connections(5)
        .acquire_timeout(std::time::Duration::from_secs(3))
        .idle_timeout(std::time::Duration::from_secs(600))
        .max_lifetime(std::time::Duration::from_secs(1800))
        .connect(&database_url)
        .await
        .expect("DB connection failed");
    // Skip migrations if schema already exists (avoids checksum mismatch)
    if let Err(e) = sqlx::migrate!("./migrations").run(&pool).await {
        tracing::warn!("Migration skipped (schema likely exists): {}", e);
    }

    let state = AppState::new(pool, log_buffer);

    // ── Spawn system monitor (CPU/memory stats, refreshed every 5s) ──
    claudehydra_backend::system_monitor::spawn(state.system_monitor.clone());

    // ── Non-blocking startup: model sync in background with retry (#8) ──
    let startup_state = state.clone();
    tokio::spawn(async move {
        let retry_delays = [
            std::time::Duration::from_secs(5),
            std::time::Duration::from_secs(15),
            std::time::Duration::from_secs(30),
        ];
        let sync_timeout = std::time::Duration::from_secs(90);
        let mut synced = false;

        for (attempt, delay) in std::iter::once(&std::time::Duration::ZERO)
            .chain(retry_delays.iter())
            .enumerate()
        {
            if attempt > 0 {
                tracing::warn!(
                    "startup: model registry sync retry {}/{} after {}s",
                    attempt,
                    retry_delays.len(),
                    delay.as_secs()
                );
                tokio::time::sleep(*delay).await;
            }

            match tokio::time::timeout(sync_timeout, model_registry::startup_sync(&startup_state))
                .await
            {
                Ok(()) => {
                    tracing::info!(
                        "startup: model registry sync complete (attempt {})",
                        attempt + 1
                    );
                    synced = true;
                    break;
                }
                Err(_) => {
                    tracing::error!(
                        "startup: model registry sync timed out after {}s (attempt {})",
                        sync_timeout.as_secs(),
                        attempt + 1
                    );
                }
            }
        }

        if !synced {
            tracing::error!(
                "startup: model registry sync failed after {} attempts — using fallback models",
                retry_delays.len() + 1
            );
        }

        handlers::warm_prompt_cache(&startup_state).await;
        startup_state.mark_ready();
    });

    // ── Spawn background watchdog ──
    let _watchdog = watchdog::spawn(state.clone());

    // ── Spawn MCP client startup (connect to enabled MCP servers) ──
    let mcp_state = state.clone();
    tokio::spawn(async move {
        if let Err(e) = mcp_state.mcp_client.startup_connect().await {
            tracing::error!("MCP startup_connect failed: {}", e);
        }
    });

    // ── Browser proxy mode logging ──
    if claudehydra_backend::browser_proxy::is_enabled() {
        let auto_restart = claudehydra_backend::browser_proxy::proxy_dir().is_some();
        tracing::info!(
            "BROWSER PROXY ENABLED — routing through {} (auto-restart: {})",
            std::env::var("BROWSER_PROXY_URL").unwrap_or_default(),
            if auto_restart { "ON" } else { "OFF" }
        );
    }

    let app = build_app(state);

    let port: u16 = std::env::var("PORT")
        .unwrap_or_else(|_| "8082".to_string())
        .parse()?;
    let addr = std::net::SocketAddr::from(([0, 0, 0, 0], port));

    app_builder::print_banner("CLAUDEHYDRA v4", "AI Swarm Control Center", "33", port);
    tracing::info!("ClaudeHydra v4 backend listening on {}", addr);

    let listener = tokio::net::TcpListener::bind(addr).await?;
    axum::serve(
        listener,
        app.into_make_service_with_connect_info::<std::net::SocketAddr>(),
    )
    .with_graceful_shutdown(app_builder::shutdown_signal())
    .await?;

    Ok(())
}
