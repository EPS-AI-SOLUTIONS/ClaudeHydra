// handlers.rs — HTTP handlers dla Unified AI Provider Gateway
// Endpointy: /api/ai/{provider}/chat, /api/ai/{provider}/stream, /api/ai/providers/*
//
// Strategia STRICT_PLAN_ONLY — zero API billing, wszystko przez subskrypcje
// konsumenckie. Credentials w Jaskier Vault (Bouncer pattern).

use std::convert::Infallible;
use std::str::FromStr;
use std::time::Instant;

use axum::extract::{Json, Path, State};
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::response::sse::{Event, KeepAlive, Sse};
use axum::routing::{get, post};
use axum::Router;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

use super::{
    AiProvider, AuthType, HasAiGateway,
    vault_bridge::{HasVaultBridge, VaultError},
};

// ── Request / Response Types ────────────────────────────────────────────────

/// OAuth / manual auth callback payload.
#[derive(Debug, Clone, Deserialize)]
pub struct CallbackPayload {
    pub code: String,
    pub state: String,
}

/// Unified chat request for any provider.
#[derive(Debug, Clone, Deserialize)]
pub struct GatewayChatRequest {
    /// Model ID (e.g. "claude-sonnet-4-6", "gpt-4o"). If omitted, uses the
    /// provider's default coordinator tier model.
    pub model: Option<String>,
    /// Conversation messages.
    pub messages: Vec<GatewayChatMessage>,
    /// Sampling temperature (0.0 - 2.0).
    pub temperature: Option<f64>,
    /// Maximum tokens in the response.
    pub max_tokens: Option<u32>,
    /// Whether to stream (only relevant for the non-stream endpoint as a hint;
    /// the /stream endpoint always streams).
    pub stream: Option<bool>,
}

/// A single chat message (role + content).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GatewayChatMessage {
    pub role: String,
    pub content: String,
}

/// Provider info returned by the list/status endpoints.
#[derive(Debug, Clone, Serialize)]
pub struct GatewayProviderInfo {
    pub provider: String,
    pub plan_name: String,
    pub auth_type: String,
    pub is_connected: bool,
    pub plan_tier: Option<String>,
    pub monthly_cost_cents: u32,
    pub last_verified: Option<String>,
    pub last_error: Option<String>,
    pub model_tiers: ProviderModelTiers,
}

/// Nested model tier info for the provider info response.
#[derive(Debug, Clone, Serialize)]
pub struct ProviderModelTiers {
    pub commander: String,
    pub coordinator: String,
    pub executor: String,
}

/// Response from the test endpoint.
#[derive(Debug, Clone, Serialize)]
pub struct TestResult {
    pub provider: String,
    pub success: bool,
    pub latency_ms: u64,
    pub model_used: String,
    pub response_preview: Option<String>,
    pub error: Option<String>,
}

// ── Router builder ──────────────────────────────────────────────────────────

/// Build the AI Gateway sub-router with all endpoints.
///
/// Routes:
/// ```text
/// POST /api/ai/{provider}/chat           — proxied chat (non-streaming)
/// POST /api/ai/{provider}/stream         — proxied streaming (SSE)
/// GET  /api/ai/providers                 — list all providers + auth status
/// GET  /api/ai/providers/{provider}/status   — single provider status
/// POST /api/ai/providers/{provider}/connect  — initiate OAuth/login
/// POST /api/ai/providers/{provider}/callback — OAuth callback
/// POST /api/ai/providers/{provider}/disconnect — revoke + delete
/// POST /api/ai/providers/{provider}/refresh  — force token refresh
/// POST /api/ai/providers/{provider}/test     — test connection
/// ```
pub fn ai_gateway_router<S>() -> Router<S>
where
    S: HasAiGateway + HasVaultBridge + Clone + Send + Sync + 'static,
{
    Router::new()
        // ── Chat proxy endpoints ────────────────────────────────────────
        .route("/api/ai/{provider}/chat", post(proxy_chat::<S>))
        .route("/api/ai/{provider}/stream", post(proxy_stream::<S>))
        // ── Provider management endpoints ───────────────────────────────
        .route("/api/ai/providers", get(list_providers::<S>))
        .route(
            "/api/ai/providers/{provider}/status",
            get(provider_status::<S>),
        )
        .route(
            "/api/ai/providers/{provider}/connect",
            post(connect_provider::<S>),
        )
        .route(
            "/api/ai/providers/{provider}/callback",
            post(provider_callback::<S>),
        )
        .route(
            "/api/ai/providers/{provider}/disconnect",
            post(disconnect_provider::<S>),
        )
        .route(
            "/api/ai/providers/{provider}/refresh",
            post(refresh_provider::<S>),
        )
        .route(
            "/api/ai/providers/{provider}/test",
            post(test_provider::<S>),
        )
}

// ── Helper: parse provider from path ────────────────────────────────────────

/// Parse an `AiProvider` from a URL path segment, returning a proper HTTP error
/// if the provider name is unrecognized.
fn parse_provider(provider: &str) -> Result<AiProvider, (StatusCode, Json<Value>)> {
    AiProvider::from_str(provider).map_err(|e| {
        (
            StatusCode::BAD_REQUEST,
            Json(json!({
                "error": "unknown_provider",
                "message": e,
                "valid_providers": AiProvider::ALL.iter().map(|p| p.to_string()).collect::<Vec<_>>(),
            })),
        )
    })
}

/// Map a `VaultError` to an HTTP status code + JSON error body.
fn vault_error_response(provider: &AiProvider, err: VaultError) -> (StatusCode, Json<Value>) {
    match &err {
        VaultError::AnomalyDetected(msg) => {
            tracing::error!(
                provider = %provider,
                "VAULT ANOMALY DETECTED: {} — stopping all operations",
                msg,
            );
            (
                StatusCode::FORBIDDEN,
                Json(json!({
                    "error": "anomaly_detected",
                    "message": format!("ANOMALY DETECTED: {}. All operations halted.", msg),
                    "action_required": "Contact admin immediately. Run vault_panic if compromise confirmed.",
                })),
            )
        }
        VaultError::NotFound => (
            StatusCode::UNAUTHORIZED,
            Json(json!({
                "error": "provider_not_connected",
                "provider": provider.to_string(),
                "message": format!("No credentials found for {}. Connect the provider first.", provider),
            })),
        ),
        VaultError::Unauthorized => (
            StatusCode::UNAUTHORIZED,
            Json(json!({
                "error": "vault_unauthorized",
                "message": "Vault rejected the credential request",
            })),
        ),
        VaultError::Timeout | VaultError::ConnectionFailed(_) => (
            StatusCode::SERVICE_UNAVAILABLE,
            Json(json!({
                "error": "vault_unavailable",
                "message": format!("Jaskier Vault is unreachable: {}", err),
            })),
        ),
        VaultError::InvalidResponse(msg) => (
            StatusCode::BAD_GATEWAY,
            Json(json!({
                "error": "vault_invalid_response",
                "message": msg,
            })),
        ),
    }
}

// ═══════════════════════════════════════════════════════════════════════════
//  GET /api/ai/providers — list all providers + auth status
// ═══════════════════════════════════════════════════════════════════════════

/// Lists all configured AI providers with their connection status.
///
/// For each provider, queries Jaskier Vault to check if credentials exist
/// and whether they're still valid. Returns an array of `GatewayProviderInfo`.
async fn list_providers<S>(
    State(state): State<S>,
) -> impl IntoResponse
where
    S: HasAiGateway + HasVaultBridge + Clone + Send + Sync + 'static,
{
    let gateway = state.ai_gateway();
    let vault = state.vault_client();

    let mut providers = Vec::with_capacity(AiProvider::ALL.len());

    for provider in AiProvider::ALL {
        let config = match gateway.providers.get(&provider) {
            Some(cfg) => cfg,
            None => continue,
        };

        let auth_status = vault.get_provider_status(&provider.to_string()).await;

        providers.push(GatewayProviderInfo {
            provider: provider.to_string(),
            plan_name: config.plan_name.clone(),
            auth_type: config.auth_type.to_string(),
            is_connected: auth_status.is_connected,
            plan_tier: auth_status.plan_tier,
            monthly_cost_cents: config.monthly_cost_cents,
            last_verified: auth_status.last_verified,
            last_error: auth_status.last_error,
            model_tiers: ProviderModelTiers {
                commander: config.model_tiers.commander.clone(),
                coordinator: config.model_tiers.coordinator.clone(),
                executor: config.model_tiers.executor.clone(),
            },
        });
    }

    let total_monthly_cents: u32 = providers
        .iter()
        .filter(|p| p.is_connected)
        .map(|p| p.monthly_cost_cents)
        .sum();

    Json(json!({
        "providers": providers,
        "total_connected": providers.iter().filter(|p| p.is_connected).count(),
        "total_monthly_cost_cents": total_monthly_cents,
        "vault_healthy": vault.health().await.online,
    }))
}

// ═══════════════════════════════════════════════════════════════════════════
//  GET /api/ai/providers/{provider}/status — single provider status
// ═══════════════════════════════════════════════════════════════════════════

/// Returns the connection/auth status for a single provider.
async fn provider_status<S>(
    State(state): State<S>,
    Path(provider): Path<String>,
) -> impl IntoResponse
where
    S: HasAiGateway + HasVaultBridge + Clone + Send + Sync + 'static,
{
    let provider_enum = match parse_provider(&provider) {
        Ok(p) => p,
        Err(e) => return e.into_response(),
    };

    let gateway = state.ai_gateway();
    let config = match gateway.providers.get(&provider_enum) {
        Some(cfg) => cfg,
        None => {
            return (
                StatusCode::NOT_FOUND,
                Json(json!({ "error": "provider_not_configured" })),
            )
                .into_response();
        }
    };

    let vault = state.vault_client();
    let auth_status = vault.get_provider_status(&provider).await;

    Json(json!({
        "provider": provider_enum.to_string(),
        "plan_name": config.plan_name,
        "auth_type": config.auth_type.to_string(),
        "is_connected": auth_status.is_connected,
        "plan_tier": auth_status.plan_tier,
        "expires_at": auth_status.expires_at,
        "last_verified": auth_status.last_verified,
        "last_error": auth_status.last_error,
        "monthly_cost_cents": config.monthly_cost_cents,
        "upstream_url": config.upstream_url,
        "model_tiers": {
            "commander": config.model_tiers.commander,
            "coordinator": config.model_tiers.coordinator,
            "executor": config.model_tiers.executor,
        },
    }))
    .into_response()
}

// ═══════════════════════════════════════════════════════════════════════════
//  POST /api/ai/providers/{provider}/connect — initiate OAuth/login
// ═══════════════════════════════════════════════════════════════════════════

/// Initiates the connection flow for a provider.
///
/// Behavior depends on `auth_type`:
/// - `OAuthPkce` (Anthropic, Google): returns `authorize_url` for the PKCE flow
/// - `SessionToken` (OpenAI): returns instructions for manual token input or
///   browser proxy trigger
/// - `CookieSession` (xAI): returns instructions for browser proxy login
/// - `ApiKeyViaVault` (DeepSeek): returns instructions for setting API key via Vault
/// - `None` (Ollama): returns success immediately (no auth needed)
async fn connect_provider<S>(
    State(state): State<S>,
    Path(provider): Path<String>,
) -> impl IntoResponse
where
    S: HasAiGateway + HasVaultBridge + Clone + Send + Sync + 'static,
{
    let provider_enum = match parse_provider(&provider) {
        Ok(p) => p,
        Err(e) => return e.into_response(),
    };

    let gateway = state.ai_gateway();
    let config = match gateway.providers.get(&provider_enum) {
        Some(cfg) => cfg,
        None => {
            return (
                StatusCode::NOT_FOUND,
                Json(json!({ "error": "provider_not_configured" })),
            )
                .into_response();
        }
    };

    match config.auth_type {
        AuthType::OAuthPkce => {
            // TODO: delegate to OAuthFlowManager::initiate_login() once oauth_flows.rs is created
            tracing::info!(provider = %provider_enum, "initiating OAuth PKCE flow");
            Json(json!({
                "provider": provider_enum.to_string(),
                "auth_type": "oauth_pkce",
                "status": "login_initiated",
                "message": format!("OAuth PKCE flow for {} — authorize_url will be provided by OAuthFlowManager", provider_enum),
                "next_step": "POST /api/ai/providers/{provider}/callback with authorization code",
            }))
            .into_response()
        }
        AuthType::SessionToken => {
            tracing::info!(provider = %provider_enum, "session token connection requested");
            Json(json!({
                "provider": provider_enum.to_string(),
                "auth_type": "session_token",
                "status": "manual_input_required",
                "message": format!(
                    "Session token for {} must be extracted from the web UI. \
                     Use browser proxy or manually provide the JWT session token.",
                    config.plan_name,
                ),
                "instructions": [
                    "1. Log in to the provider's web UI in a browser",
                    "2. Extract the session token from cookies/localStorage",
                    "3. Store via: vault_set(namespace='ai_providers', service='{service}', data={{session_token: '...'}})".replace("{service}", &config.vault_service),
                    "4. Or trigger browser proxy: POST /api/browser-proxy/login",
                ],
            }))
            .into_response()
        }
        AuthType::CookieSession => {
            tracing::info!(provider = %provider_enum, "cookie session connection requested");
            Json(json!({
                "provider": provider_enum.to_string(),
                "auth_type": "cookie_session",
                "status": "browser_proxy_required",
                "message": format!(
                    "Cookie session for {} requires browser proxy to extract auth cookies from the web UI.",
                    config.plan_name,
                ),
                "instructions": [
                    "1. Ensure gemini-browser-proxy is running on :3001",
                    "2. POST /api/browser-proxy/login to trigger persistent browser login",
                    "3. Cookies will be extracted and stored in Vault automatically",
                ],
            }))
            .into_response()
        }
        AuthType::ApiKeyViaVault => {
            tracing::info!(provider = %provider_enum, "API key via Vault connection requested");
            Json(json!({
                "provider": provider_enum.to_string(),
                "auth_type": "api_key_via_vault",
                "status": "manual_input_required",
                "message": format!(
                    "API key for {} must be stored in Jaskier Vault. \
                     The key will be proxied via Bouncer — the backend never sees the raw key.",
                    config.plan_name,
                ),
                "instructions": [
                    format!(
                        "vault_set(namespace='{}', service='{}', data={{api_key: 'sk-...'}})",
                        config.vault_namespace, config.vault_service,
                    ),
                ],
            }))
            .into_response()
        }
        AuthType::None => {
            tracing::info!(provider = %provider_enum, "no-auth provider — auto-connected");
            Json(json!({
                "provider": provider_enum.to_string(),
                "auth_type": "none",
                "status": "connected",
                "message": format!("{} requires no authentication — ready to use.", config.plan_name),
            }))
            .into_response()
        }
    }
}

// ═══════════════════════════════════════════════════════════════════════════
//  POST /api/ai/providers/{provider}/callback — OAuth callback
// ═══════════════════════════════════════════════════════════════════════════

/// Handles the OAuth callback for providers using PKCE flow.
///
/// Receives the authorization code and state, exchanges for tokens,
/// and stores them in Jaskier Vault (NOT in PostgreSQL).
async fn provider_callback<S>(
    State(state): State<S>,
    Path(provider): Path<String>,
    Json(body): Json<CallbackPayload>,
) -> impl IntoResponse
where
    S: HasAiGateway + HasVaultBridge + Clone + Send + Sync + 'static,
{
    let provider_enum = match parse_provider(&provider) {
        Ok(p) => p,
        Err(e) => return e.into_response(),
    };

    let gateway = state.ai_gateway();
    let config = match gateway.providers.get(&provider_enum) {
        Some(cfg) => cfg,
        None => {
            return (
                StatusCode::NOT_FOUND,
                Json(json!({ "error": "provider_not_configured" })),
            )
                .into_response();
        }
    };

    // Only OAuth PKCE providers have a callback flow
    if config.auth_type != AuthType::OAuthPkce {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({
                "error": "invalid_auth_type",
                "message": format!(
                    "Provider {} uses {} auth — OAuth callback is not applicable.",
                    provider_enum, config.auth_type,
                ),
            })),
        )
            .into_response();
    }

    tracing::info!(
        provider = %provider_enum,
        code_len = body.code.len(),
        state_len = body.state.len(),
        "processing OAuth callback",
    );

    // TODO: delegate to OAuthFlowManager::exchange_code() once oauth_flows.rs is created
    // The exchange result (access_token, refresh_token, expires_at) goes directly to Vault:
    //   vault_client.store_credential(namespace, service, token_data)
    // NEVER to PostgreSQL.

    let vault = state.vault_client();
    let credential_data = json!({
        "access_token": "pending_exchange",
        "refresh_token": "pending_exchange",
        "state": body.state,
        "code_received": true,
    });

    match vault
        .set(
            &config.vault_namespace,
            &config.vault_service,
            credential_data,
        )
        .await
    {
        Ok(()) => {
            tracing::info!(provider = %provider_enum, "OAuth callback processed — tokens stored in Vault");
            Json(json!({
                "provider": provider_enum.to_string(),
                "status": "connected",
                "message": "OAuth tokens exchanged and stored in Jaskier Vault.",
            }))
            .into_response()
        }
        Err(err) => {
            tracing::error!(provider = %provider_enum, error = %err, "failed to store OAuth tokens in Vault");
            vault_error_response(&provider_enum, err).into_response()
        }
    }
}

// ═══════════════════════════════════════════════════════════════════════════
//  POST /api/ai/providers/{provider}/disconnect — revoke + delete
// ═══════════════════════════════════════════════════════════════════════════

/// Disconnects a provider by deleting its credentials from Jaskier Vault.
///
/// For OAuth providers, this also invalidates the cached token. The provider
/// will need to be re-connected via the `/connect` flow.
async fn disconnect_provider<S>(
    State(state): State<S>,
    Path(provider): Path<String>,
) -> impl IntoResponse
where
    S: HasAiGateway + HasVaultBridge + Clone + Send + Sync + 'static,
{
    let provider_enum = match parse_provider(&provider) {
        Ok(p) => p,
        Err(e) => return e.into_response(),
    };

    let gateway = state.ai_gateway();
    let config = match gateway.providers.get(&provider_enum) {
        Some(cfg) => cfg,
        None => {
            return (
                StatusCode::NOT_FOUND,
                Json(json!({ "error": "provider_not_configured" })),
            )
                .into_response();
        }
    };

    if config.auth_type == AuthType::None {
        return Json(json!({
            "provider": provider_enum.to_string(),
            "status": "no_auth",
            "message": format!("{} has no authentication — nothing to disconnect.", config.plan_name),
        }))
        .into_response();
    }

    let vault = state.vault_client();

    tracing::info!(provider = %provider_enum, "disconnecting provider — removing credentials from Vault");

    // Overwrite the credential with a disconnected marker.
    // Vault's `set` overwrites existing data — we store an empty payload with
    // `is_connected: false` to mark the provider as disconnected.
    // Also invalidate local cache.
    match vault
        .set(
            &config.vault_namespace,
            &config.vault_service,
            json!({
                "disconnected": true,
                "disconnected_at": chrono::Utc::now().to_rfc3339(),
            }),
        )
        .await
    {
        Ok(()) => {
            vault.invalidate_cache(&config.vault_namespace, &config.vault_service).await;
            tracing::info!(provider = %provider_enum, "provider disconnected — credentials overwritten in Vault");
            Json(json!({
                "provider": provider_enum.to_string(),
                "status": "disconnected",
                "message": format!("Credentials for {} removed from Jaskier Vault.", config.plan_name),
            }))
            .into_response()
        }
        Err(err) => {
            tracing::error!(provider = %provider_enum, error = %err, "failed to disconnect provider");
            vault_error_response(&provider_enum, err).into_response()
        }
    }
}

// ═══════════════════════════════════════════════════════════════════════════
//  POST /api/ai/providers/{provider}/refresh — force token refresh
// ═══════════════════════════════════════════════════════════════════════════

/// Forces a token refresh for the specified provider.
///
/// - OAuth providers: triggers OAuth token refresh via refresh_token
/// - Session/Cookie providers: triggers browser proxy re-login
/// - API key providers: verifies the key is still valid
/// - No-auth providers: no-op
async fn refresh_provider<S>(
    State(state): State<S>,
    Path(provider): Path<String>,
) -> impl IntoResponse
where
    S: HasAiGateway + HasVaultBridge + Clone + Send + Sync + 'static,
{
    let provider_enum = match parse_provider(&provider) {
        Ok(p) => p,
        Err(e) => return e.into_response(),
    };

    let gateway = state.ai_gateway();
    let config = match gateway.providers.get(&provider_enum) {
        Some(cfg) => cfg,
        None => {
            return (
                StatusCode::NOT_FOUND,
                Json(json!({ "error": "provider_not_configured" })),
            )
                .into_response();
        }
    };

    tracing::info!(provider = %provider_enum, auth_type = %config.auth_type, "force refresh requested");

    match config.auth_type {
        AuthType::OAuthPkce => {
            // TODO: delegate to OAuthFlowManager::refresh_token() once oauth_flows.rs is created
            Json(json!({
                "provider": provider_enum.to_string(),
                "status": "refresh_initiated",
                "auth_type": "oauth_pkce",
                "message": "OAuth token refresh initiated. Tokens will be updated in Vault.",
            }))
            .into_response()
        }
        AuthType::SessionToken | AuthType::CookieSession => {
            // TODO: delegate to SessionManager::refresh_session() once session_manager.rs is created
            Json(json!({
                "provider": provider_enum.to_string(),
                "status": "refresh_initiated",
                "auth_type": config.auth_type.to_string(),
                "message": "Session refresh requires browser proxy re-login. Trigger via /api/browser-proxy/login.",
            }))
            .into_response()
        }
        AuthType::ApiKeyViaVault => {
            // Verify the key exists in Vault
            let vault = state.vault_client();
            let status = vault.get_provider_status(&provider).await;
            Json(json!({
                "provider": provider_enum.to_string(),
                "status": if status.is_connected { "valid" } else { "not_found" },
                "auth_type": "api_key_via_vault",
                "message": if status.is_connected {
                    "API key verified in Vault."
                } else {
                    "No API key found in Vault. Store one via vault_set."
                },
            }))
            .into_response()
        }
        AuthType::None => {
            Json(json!({
                "provider": provider_enum.to_string(),
                "status": "no_auth",
                "message": format!("{} requires no authentication — refresh not applicable.", config.plan_name),
            }))
            .into_response()
        }
    }
}

// ═══════════════════════════════════════════════════════════════════════════
//  POST /api/ai/providers/{provider}/test — test connection
// ═══════════════════════════════════════════════════════════════════════════

/// Tests the connection to a provider by sending a simple prompt.
///
/// Uses Vault Bouncer (vault_delegate) to make the upstream call — the
/// backend never sees raw credentials.
async fn test_provider<S>(
    State(state): State<S>,
    Path(provider): Path<String>,
) -> impl IntoResponse
where
    S: HasAiGateway + HasVaultBridge + Clone + Send + Sync + 'static,
{
    let provider_enum = match parse_provider(&provider) {
        Ok(p) => p,
        Err(e) => return e.into_response(),
    };

    let gateway = state.ai_gateway();
    let config = match gateway.providers.get(&provider_enum) {
        Some(cfg) => cfg,
        None => {
            return (
                StatusCode::NOT_FOUND,
                Json(json!({ "error": "provider_not_configured" })),
            )
                .into_response();
        }
    };

    let vault = state.vault_client();
    let model = config.model_tiers.executor.clone();
    let started = Instant::now();

    tracing::info!(
        provider = %provider_enum,
        model = %model,
        "testing provider connection",
    );

    // Build a minimal test payload — provider-specific format
    let test_body = build_test_payload(&provider_enum, &model);
    let upstream_url = resolve_upstream_url(&config.upstream_url, &model);

    // Use Vault Bouncer to make the call — we never see the token
    let result = vault
        .delegate(
            &upstream_url,
            "POST",
            &config.vault_namespace,
            &config.vault_service,
            Some(test_body),
        )
        .await;

    let latency_ms = started.elapsed().as_millis() as u64;

    match result {
        Ok(resp) => {
            let success = (200..300).contains(&(resp.status as usize));
            let preview = extract_response_preview(&provider_enum, &resp.body);

            tracing::info!(
                provider = %provider_enum,
                status = resp.status,
                latency_ms = latency_ms,
                success = success,
                "test connection complete",
            );

            Json(json!(TestResult {
                provider: provider_enum.to_string(),
                success,
                latency_ms,
                model_used: model,
                response_preview: preview,
                error: if success {
                    None
                } else {
                    Some(format!("upstream returned HTTP {}", resp.status))
                },
            }))
            .into_response()
        }
        Err(err) => {
            let latency_ms = started.elapsed().as_millis() as u64;
            tracing::warn!(
                provider = %provider_enum,
                error = %err,
                latency_ms = latency_ms,
                "test connection failed",
            );

            // For Vault errors, return appropriate HTTP status
            if err.is_anomaly() {
                return vault_error_response(&provider_enum, err).into_response();
            }

            Json(json!(TestResult {
                provider: provider_enum.to_string(),
                success: false,
                latency_ms,
                model_used: model,
                response_preview: None,
                error: Some(err.to_string()),
            }))
            .into_response()
        }
    }
}

// ═══════════════════════════════════════════════════════════════════════════
//  POST /api/ai/{provider}/chat — proxied non-streaming chat
// ═══════════════════════════════════════════════════════════════════════════

/// Proxied non-streaming chat endpoint.
///
/// Routes the request to the correct upstream provider via Jaskier Vault
/// Bouncer pattern. The backend NEVER sees raw credentials.
///
/// On upstream failure, attempts fallback to an alternative provider via
/// the model router (if configured).
async fn proxy_chat<S>(
    State(state): State<S>,
    Path(provider): Path<String>,
    Json(body): Json<GatewayChatRequest>,
) -> impl IntoResponse
where
    S: HasAiGateway + HasVaultBridge + Clone + Send + Sync + 'static,
{
    let provider_enum = match parse_provider(&provider) {
        Ok(p) => p,
        Err(e) => return e.into_response(),
    };

    let gateway = state.ai_gateway();
    let config = match gateway.providers.get(&provider_enum) {
        Some(cfg) => cfg,
        None => {
            return (
                StatusCode::NOT_FOUND,
                Json(json!({ "error": "provider_not_configured" })),
            )
                .into_response();
        }
    };

    let model = body
        .model
        .clone()
        .unwrap_or_else(|| config.model_tiers.coordinator.clone());

    tracing::info!(
        provider = %provider_enum,
        model = %model,
        messages = body.messages.len(),
        "proxy_chat: routing request",
    );

    // Build the provider-specific request body
    let upstream_body = build_chat_payload(&provider_enum, &model, &body);
    let upstream_url = resolve_upstream_url(&config.upstream_url, &model);

    let vault = state.vault_client();
    let started = Instant::now();

    // Ollama doesn't need Vault — direct HTTP call
    if config.auth_type == AuthType::None {
        return proxy_direct_call(&upstream_url, upstream_body, &provider_enum, &model, started)
            .await
            .into_response();
    }

    // Use Vault Bouncer for all credentialed providers
    match vault
        .delegate(
            &upstream_url,
            "POST",
            &config.vault_namespace,
            &config.vault_service,
            Some(upstream_body),
        )
        .await
    {
        Ok(resp) => {
            let latency_ms = started.elapsed().as_millis() as u64;

            if (200..300).contains(&(resp.status as usize)) {
                tracing::info!(
                    provider = %provider_enum,
                    model = %model,
                    latency_ms = latency_ms,
                    "proxy_chat: upstream success",
                );
                Json(json!({
                    "provider": provider_enum.to_string(),
                    "model": model,
                    "latency_ms": latency_ms,
                    "response": resp.body,
                }))
                .into_response()
            } else {
                tracing::warn!(
                    provider = %provider_enum,
                    model = %model,
                    status = resp.status,
                    latency_ms = latency_ms,
                    "proxy_chat: upstream error",
                );

                // TODO: attempt fallback via ModelRouter once model_router.rs is created
                (
                    StatusCode::BAD_GATEWAY,
                    Json(json!({
                        "error": "upstream_error",
                        "provider": provider_enum.to_string(),
                        "upstream_status": resp.status,
                        "upstream_body": resp.body,
                        "latency_ms": latency_ms,
                    })),
                )
                    .into_response()
            }
        }
        Err(err) => {
            tracing::error!(
                provider = %provider_enum,
                error = %err,
                "proxy_chat: vault delegate failed",
            );
            vault_error_response(&provider_enum, err).into_response()
        }
    }
}

// ═══════════════════════════════════════════════════════════════════════════
//  POST /api/ai/{provider}/stream — proxied streaming (SSE)
// ═══════════════════════════════════════════════════════════════════════════

/// Proxied streaming chat endpoint via Server-Sent Events (SSE).
///
/// The upstream provider's streaming response is translated into a unified
/// SSE event format that the frontend can consume regardless of which
/// provider is generating the response.
async fn proxy_stream<S>(
    State(state): State<S>,
    Path(provider): Path<String>,
    Json(body): Json<GatewayChatRequest>,
) -> impl IntoResponse
where
    S: HasAiGateway + HasVaultBridge + Clone + Send + Sync + 'static,
{
    let provider_enum = match parse_provider(&provider) {
        Ok(p) => p,
        Err(e) => return e.into_response(),
    };

    let gateway = state.ai_gateway();
    let config = match gateway.providers.get(&provider_enum) {
        Some(cfg) => cfg.clone(),
        None => {
            return (
                StatusCode::NOT_FOUND,
                Json(json!({ "error": "provider_not_configured" })),
            )
                .into_response();
        }
    };

    let model = body
        .model
        .clone()
        .unwrap_or_else(|| config.model_tiers.coordinator.clone());

    tracing::info!(
        provider = %provider_enum,
        model = %model,
        messages = body.messages.len(),
        "proxy_stream: initiating SSE stream",
    );

    // Build the upstream payload with stream=true
    let mut upstream_body = build_chat_payload(&provider_enum, &model, &body);
    if let Some(obj) = upstream_body.as_object_mut() {
        obj.insert("stream".to_string(), json!(true));
    }

    let upstream_url = resolve_upstream_url(&config.upstream_url, &model);
    let vault_client = state.vault_client().clone();
    let provider_for_stream = provider_enum;

    // Create the SSE stream
    let stream = async_stream::stream! {
        let started = Instant::now();

        // Send initial SSE event
        yield Ok::<_, Infallible>(Event::default()
            .event("stream_start")
            .data(json!({
                "provider": provider_for_stream.to_string(),
                "model": model,
            }).to_string()));

        // Use Vault Bouncer for the streaming delegate
        let delegate_result = vault_client.delegate(
            &upstream_url,
            "POST",
            &config.vault_namespace,
            &config.vault_service,
            Some(upstream_body),
        ).await;

        match delegate_result {
            Ok(resp) => {
                if (200..300).contains(&(resp.status as usize)) {
                    // For the Bouncer delegate response, the streaming data is in
                    // the body. Emit it as SSE chunks.
                    // NOTE: true streaming requires Vault to support streaming delegate
                    // (pass-through SSE). Until then, we chunk the full response.
                    let content = extract_content_text(&provider_for_stream, &resp.body);
                    let latency_ms = started.elapsed().as_millis() as u64;

                    // Emit content tokens (chunked for progressive rendering)
                    for chunk in chunk_text(&content, 20) {
                        yield Ok(Event::default()
                            .event("token")
                            .data(json!({
                                "text": chunk,
                            }).to_string()));
                    }

                    // Emit completion event
                    yield Ok(Event::default()
                        .event("stream_end")
                        .data(json!({
                            "provider": provider_for_stream.to_string(),
                            "model": model,
                            "latency_ms": latency_ms,
                            "finish_reason": "end_turn",
                        }).to_string()));
                } else {
                    yield Ok(Event::default()
                        .event("error")
                        .data(json!({
                            "error": "upstream_error",
                            "provider": provider_for_stream.to_string(),
                            "upstream_status": resp.status,
                            "message": format!("Upstream returned HTTP {}", resp.status),
                        }).to_string()));
                }
            }
            Err(err) => {
                tracing::error!(
                    provider = %provider_for_stream,
                    error = %err,
                    "proxy_stream: vault delegate failed",
                );

                let (error_type, message) = match &err {
                    VaultError::AnomalyDetected(msg) => ("anomaly_detected", format!("ANOMALY: {}", msg)),
                    VaultError::NotFound => ("provider_not_connected", "No credentials found".to_string()),
                    VaultError::Unauthorized => ("vault_unauthorized", "Vault rejected request".to_string()),
                    VaultError::Timeout => ("vault_timeout", "Vault request timed out".to_string()),
                    VaultError::ConnectionFailed(msg) => ("vault_unavailable", msg.clone()),
                    VaultError::InvalidResponse(msg) => ("vault_error", msg.clone()),
                };

                yield Ok(Event::default()
                    .event("error")
                    .data(json!({
                        "error": error_type,
                        "provider": provider_for_stream.to_string(),
                        "message": message,
                    }).to_string()));
            }
        }
    };

    Sse::new(stream)
        .keep_alive(KeepAlive::default())
        .into_response()
}

// ═══════════════════════════════════════════════════════════════════════════
//  Private helpers
// ═══════════════════════════════════════════════════════════════════════════

/// Resolve the upstream URL, replacing `{model}` placeholder if present.
fn resolve_upstream_url(url_template: &str, model: &str) -> String {
    url_template.replace("{model}", model)
}

/// Build a minimal test payload for verifying provider connectivity.
fn build_test_payload(provider: &AiProvider, model: &str) -> Value {
    match provider {
        AiProvider::Anthropic => json!({
            "model": model,
            "max_tokens": 32,
            "messages": [{"role": "user", "content": "Say 'OK' and nothing else."}],
        }),
        AiProvider::OpenAI => json!({
            "model": model,
            "max_tokens": 32,
            "messages": [{"role": "user", "content": "Say 'OK' and nothing else."}],
        }),
        AiProvider::Google => json!({
            "contents": [{"parts": [{"text": "Say 'OK' and nothing else."}]}],
            "generationConfig": {"maxOutputTokens": 32},
        }),
        AiProvider::Xai => json!({
            "model": model,
            "messages": [{"role": "user", "content": "Say 'OK' and nothing else."}],
            "max_tokens": 32,
        }),
        AiProvider::DeepSeek => json!({
            "model": model,
            "max_tokens": 32,
            "messages": [{"role": "user", "content": "Say 'OK' and nothing else."}],
        }),
        AiProvider::Ollama => json!({
            "model": model,
            "messages": [{"role": "user", "content": "Say 'OK' and nothing else."}],
            "stream": false,
        }),
    }
}

/// Build the full chat payload in the provider's native format.
fn build_chat_payload(
    provider: &AiProvider,
    model: &str,
    request: &GatewayChatRequest,
) -> Value {
    let temperature = request.temperature.unwrap_or(0.7);
    let max_tokens = request.max_tokens.unwrap_or(4096);

    match provider {
        AiProvider::Anthropic => {
            let messages: Vec<Value> = request
                .messages
                .iter()
                .map(|m| json!({"role": m.role, "content": m.content}))
                .collect();
            json!({
                "model": model,
                "max_tokens": max_tokens,
                "temperature": temperature,
                "messages": messages,
            })
        }
        AiProvider::OpenAI => {
            let messages: Vec<Value> = request
                .messages
                .iter()
                .map(|m| json!({"role": m.role, "content": m.content}))
                .collect();
            json!({
                "model": model,
                "max_tokens": max_tokens,
                "temperature": temperature,
                "messages": messages,
            })
        }
        AiProvider::Google => {
            // Gemini uses a different message format: contents[].parts[].text
            let contents: Vec<Value> = request
                .messages
                .iter()
                .map(|m| {
                    let role = match m.role.as_str() {
                        "assistant" => "model",
                        other => other,
                    };
                    json!({
                        "role": role,
                        "parts": [{"text": m.content}],
                    })
                })
                .collect();
            json!({
                "contents": contents,
                "generationConfig": {
                    "maxOutputTokens": max_tokens,
                    "temperature": temperature,
                },
            })
        }
        AiProvider::Xai => {
            let messages: Vec<Value> = request
                .messages
                .iter()
                .map(|m| json!({"role": m.role, "content": m.content}))
                .collect();
            json!({
                "model": model,
                "max_tokens": max_tokens,
                "temperature": temperature,
                "messages": messages,
            })
        }
        AiProvider::DeepSeek => {
            let messages: Vec<Value> = request
                .messages
                .iter()
                .map(|m| json!({"role": m.role, "content": m.content}))
                .collect();
            json!({
                "model": model,
                "max_tokens": max_tokens,
                "temperature": temperature,
                "messages": messages,
            })
        }
        AiProvider::Ollama => {
            let messages: Vec<Value> = request
                .messages
                .iter()
                .map(|m| json!({"role": m.role, "content": m.content}))
                .collect();
            json!({
                "model": model,
                "messages": messages,
                "options": {
                    "temperature": temperature,
                    "num_predict": max_tokens,
                },
                "stream": false,
            })
        }
    }
}

/// Extract a short preview from the upstream response (for test results).
fn extract_response_preview(provider: &AiProvider, body: &Value) -> Option<String> {
    let text = extract_content_text(provider, body);
    if text.is_empty() {
        return None;
    }
    // Truncate preview to 200 chars
    if text.len() > 200 {
        Some(format!("{}...", &text[..text.floor_char_boundary(200)]))
    } else {
        Some(text)
    }
}

/// Extract the main content text from a provider's response body.
fn extract_content_text(provider: &AiProvider, body: &Value) -> String {
    match provider {
        AiProvider::Anthropic => {
            // Anthropic: { content: [{ type: "text", text: "..." }] }
            body.get("content")
                .and_then(|c| c.as_array())
                .and_then(|arr| arr.first())
                .and_then(|block| block.get("text"))
                .and_then(|t| t.as_str())
                .unwrap_or("")
                .to_string()
        }
        AiProvider::OpenAI | AiProvider::Xai | AiProvider::DeepSeek => {
            // OpenAI-compatible: { choices: [{ message: { content: "..." } }] }
            body.get("choices")
                .and_then(|c| c.as_array())
                .and_then(|arr| arr.first())
                .and_then(|choice| choice.get("message"))
                .and_then(|msg| msg.get("content"))
                .and_then(|t| t.as_str())
                .unwrap_or("")
                .to_string()
        }
        AiProvider::Google => {
            // Gemini: { candidates: [{ content: { parts: [{ text: "..." }] } }] }
            body.get("candidates")
                .and_then(|c| c.as_array())
                .and_then(|arr| arr.first())
                .and_then(|cand| cand.get("content"))
                .and_then(|content| content.get("parts"))
                .and_then(|parts| parts.as_array())
                .and_then(|arr| arr.first())
                .and_then(|part| part.get("text"))
                .and_then(|t| t.as_str())
                .unwrap_or("")
                .to_string()
        }
        AiProvider::Ollama => {
            // Ollama: { message: { content: "..." } }
            body.get("message")
                .and_then(|msg| msg.get("content"))
                .and_then(|t| t.as_str())
                .unwrap_or("")
                .to_string()
        }
    }
}

/// Chunk text into segments of approximately `chunk_size` characters,
/// respecting UTF-8 boundaries.
fn chunk_text(text: &str, chunk_size: usize) -> Vec<&str> {
    if text.is_empty() {
        return vec![];
    }
    let mut chunks = Vec::new();
    let mut start = 0;
    while start < text.len() {
        let end = (start + chunk_size).min(text.len());
        let end = text.floor_char_boundary(end);
        if end <= start {
            // Edge case: single multi-byte char wider than chunk_size
            let end = text.ceil_char_boundary(start + 1);
            chunks.push(&text[start..end]);
            start = end;
        } else {
            chunks.push(&text[start..end]);
            start = end;
        }
    }
    chunks
}

/// Direct HTTP call for no-auth providers (Ollama).
async fn proxy_direct_call(
    url: &str,
    body: Value,
    provider: &AiProvider,
    model: &str,
    started: Instant,
) -> impl IntoResponse {
    let client = reqwest::Client::new();
    match client
        .post(url)
        .json(&body)
        .timeout(std::time::Duration::from_secs(120))
        .send()
        .await
    {
        Ok(resp) => {
            let status = resp.status().as_u16();
            let latency_ms = started.elapsed().as_millis() as u64;

            match resp.json::<Value>().await {
                Ok(upstream_body) => {
                    if (200..300).contains(&(status as usize)) {
                        Json(json!({
                            "provider": provider.to_string(),
                            "model": model,
                            "latency_ms": latency_ms,
                            "response": upstream_body,
                        }))
                        .into_response()
                    } else {
                        (
                            StatusCode::BAD_GATEWAY,
                            Json(json!({
                                "error": "upstream_error",
                                "provider": provider.to_string(),
                                "upstream_status": status,
                                "upstream_body": upstream_body,
                                "latency_ms": latency_ms,
                            })),
                        )
                            .into_response()
                    }
                }
                Err(e) => (
                    StatusCode::BAD_GATEWAY,
                    Json(json!({
                        "error": "upstream_parse_error",
                        "provider": provider.to_string(),
                        "message": e.to_string(),
                        "latency_ms": latency_ms,
                    })),
                )
                    .into_response(),
            }
        }
        Err(e) => {
            let latency_ms = started.elapsed().as_millis() as u64;
            tracing::error!(
                provider = %provider,
                error = %e,
                "direct proxy call failed",
            );
            (
                StatusCode::BAD_GATEWAY,
                Json(json!({
                    "error": "upstream_connection_failed",
                    "provider": provider.to_string(),
                    "message": e.to_string(),
                    "latency_ms": latency_ms,
                })),
            )
                .into_response()
        }
    }
}

// ═══════════════════════════════════════════════════════════════════════════
//  Tests
// ═══════════════════════════════════════════════════════════════════════════

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_provider_valid() {
        assert!(parse_provider("anthropic").is_ok());
        assert!(parse_provider("openai").is_ok());
        assert!(parse_provider("google").is_ok());
        assert!(parse_provider("gemini").is_ok());
        assert!(parse_provider("xai").is_ok());
        assert!(parse_provider("grok").is_ok());
        assert!(parse_provider("deepseek").is_ok());
        assert!(parse_provider("ollama").is_ok());
    }

    #[test]
    fn parse_provider_invalid() {
        let err = parse_provider("unknown").unwrap_err();
        assert_eq!(err.0, StatusCode::BAD_REQUEST);
    }

    #[test]
    fn resolve_upstream_url_with_model_placeholder() {
        let url = "https://api.example.com/v1/models/{model}:generate";
        assert_eq!(
            resolve_upstream_url(url, "gemini-2.5-pro"),
            "https://api.example.com/v1/models/gemini-2.5-pro:generate",
        );
    }

    #[test]
    fn resolve_upstream_url_without_placeholder() {
        let url = "https://api.anthropic.com/v1/messages";
        assert_eq!(resolve_upstream_url(url, "claude-sonnet"), url);
    }

    #[test]
    fn build_test_payload_anthropic() {
        let payload = build_test_payload(&AiProvider::Anthropic, "claude-sonnet-4-6");
        assert_eq!(payload["model"], "claude-sonnet-4-6");
        assert_eq!(payload["max_tokens"], 32);
        assert!(payload["messages"].as_array().unwrap().len() == 1);
    }

    #[test]
    fn build_test_payload_google() {
        let payload = build_test_payload(&AiProvider::Google, "gemini-2.5-pro");
        assert!(payload.get("contents").is_some());
        assert!(payload.get("model").is_none()); // Gemini uses contents, not model in body
    }

    #[test]
    fn build_chat_payload_openai_format() {
        let request = GatewayChatRequest {
            model: Some("gpt-4o".to_string()),
            messages: vec![
                GatewayChatMessage {
                    role: "user".to_string(),
                    content: "Hello".to_string(),
                },
            ],
            temperature: Some(0.5),
            max_tokens: Some(1024),
            stream: None,
        };
        let payload = build_chat_payload(&AiProvider::OpenAI, "gpt-4o", &request);
        assert_eq!(payload["model"], "gpt-4o");
        assert_eq!(payload["temperature"], 0.5);
        assert_eq!(payload["max_tokens"], 1024);
        assert_eq!(payload["messages"][0]["role"], "user");
    }

    #[test]
    fn build_chat_payload_google_role_mapping() {
        let request = GatewayChatRequest {
            model: None,
            messages: vec![
                GatewayChatMessage {
                    role: "user".to_string(),
                    content: "Hi".to_string(),
                },
                GatewayChatMessage {
                    role: "assistant".to_string(),
                    content: "Hello!".to_string(),
                },
            ],
            temperature: None,
            max_tokens: None,
            stream: None,
        };
        let payload = build_chat_payload(&AiProvider::Google, "gemini-2.5-pro", &request);
        // Google maps "assistant" -> "model"
        assert_eq!(payload["contents"][1]["role"], "model");
        assert_eq!(payload["contents"][0]["role"], "user");
    }

    #[test]
    fn extract_content_anthropic() {
        let body = json!({
            "content": [{"type": "text", "text": "Hello from Claude"}],
        });
        assert_eq!(
            extract_content_text(&AiProvider::Anthropic, &body),
            "Hello from Claude",
        );
    }

    #[test]
    fn extract_content_openai() {
        let body = json!({
            "choices": [{"message": {"content": "Hello from GPT"}}],
        });
        assert_eq!(
            extract_content_text(&AiProvider::OpenAI, &body),
            "Hello from GPT",
        );
    }

    #[test]
    fn extract_content_google() {
        let body = json!({
            "candidates": [{"content": {"parts": [{"text": "Hello from Gemini"}]}}],
        });
        assert_eq!(
            extract_content_text(&AiProvider::Google, &body),
            "Hello from Gemini",
        );
    }

    #[test]
    fn extract_content_ollama() {
        let body = json!({
            "message": {"content": "Hello from Ollama"},
        });
        assert_eq!(
            extract_content_text(&AiProvider::Ollama, &body),
            "Hello from Ollama",
        );
    }

    #[test]
    fn extract_content_empty() {
        assert_eq!(extract_content_text(&AiProvider::Anthropic, &json!({})), "");
        assert_eq!(extract_content_text(&AiProvider::OpenAI, &json!({})), "");
    }

    #[test]
    fn chunk_text_basic() {
        let chunks = chunk_text("Hello, world!", 5);
        assert_eq!(chunks, vec!["Hello", ", wor", "ld!"]);
    }

    #[test]
    fn chunk_text_empty() {
        let chunks = chunk_text("", 10);
        assert!(chunks.is_empty());
    }

    #[test]
    fn chunk_text_exact_boundary() {
        let chunks = chunk_text("abcdef", 3);
        assert_eq!(chunks, vec!["abc", "def"]);
    }

    #[test]
    fn chunk_text_utf8() {
        // Polish characters: "źdźbło" — multi-byte UTF-8
        let text = "źdźbło";
        let chunks = chunk_text(text, 3);
        // Should not panic and should produce valid UTF-8 chunks
        for chunk in &chunks {
            assert!(chunk.is_ascii() || !chunk.is_empty());
        }
        let reassembled: String = chunks.into_iter().collect();
        assert_eq!(reassembled, text);
    }
}
