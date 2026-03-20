// providers.rs — Provider management handlers (list, status, connect, callback,
// disconnect, refresh, test).

use std::time::Instant;

use axum::extract::{Json, Path, State};
use axum::http::StatusCode;
use axum::response::IntoResponse;
use serde_json::json;

use crate::ai_gateway::{
    AiProvider, AuthType, HasAiGateway,
    oauth_flows::OAuthProvider,
    vault_bridge::HasVaultBridge,
};

use super::helpers::{build_test_payload, extract_response_preview, resolve_upstream_url};
use super::router::{parse_provider, vault_error_response};
use super::types::*;

// ═══════════════════════════════════════════════════════════════════════════
//  GET /api/ai/providers — list all providers + auth status
// ═══════════════════════════════════════════════════════════════════════════

/// Lists all configured AI providers with their connection status.
///
/// For each provider, queries Jaskier Vault to check if credentials exist
/// and whether they're still valid. Returns an array of `GatewayProviderInfo`.
pub(crate) async fn list_providers<S>(
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
pub(crate) async fn provider_status<S>(
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
pub(crate) async fn connect_provider<S>(
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
            let oauth_provider = match provider_enum {
                AiProvider::Anthropic => OAuthProvider::Anthropic,
                AiProvider::Google => OAuthProvider::Google,
                _ => {
                    return Json(json!({
                        "error": "oauth_not_supported",
                        "message": format!("{} does not support OAuth PKCE", provider_enum),
                    }))
                    .into_response();
                }
            };

            let oauth_manager = state.oauth_manager();
            match oauth_manager.initiate_login(oauth_provider).await {
                Ok(login_resp) => {
                    tracing::info!(
                        provider = %provider_enum,
                        authorize_url_len = login_resp.authorize_url.len(),
                        "OAuth PKCE flow initiated via OAuthFlowManager",
                    );
                    Json(json!({
                        "provider": provider_enum.to_string(),
                        "auth_type": "oauth_pkce",
                        "status": "login_initiated",
                        "authorize_url": login_resp.authorize_url,
                        "state": login_resp.state,
                        "next_step": "POST /api/ai/providers/{provider}/callback with authorization code",
                    }))
                    .into_response()
                }
                Err(e) => {
                    tracing::error!(provider = %provider_enum, error = %e, "OAuth initiation failed");
                    (
                        StatusCode::INTERNAL_SERVER_ERROR,
                        Json(json!({
                            "error": "oauth_initiation_failed",
                            "message": e.to_string(),
                        })),
                    )
                        .into_response()
                }
            }
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
                        "vault_set(namespace='{}', service='{}', data={{api_key: 'mock-key-...'}})",
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
pub(crate) async fn provider_callback<S>(
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

    // Exchange authorization code for tokens via OAuthFlowManager
    let oauth_manager = state.oauth_manager();
    let tokens = match oauth_manager.handle_callback(&body.state, &body.code).await {
        Ok((_oauth_provider, tokens)) => tokens,
        Err(e) => {
            tracing::error!(
                provider = %provider_enum,
                error = %e,
                "OAuth code exchange failed",
            );
            return (
                StatusCode::BAD_REQUEST,
                Json(json!({
                    "error": "oauth_exchange_failed",
                    "message": e.to_string(),
                })),
            )
                .into_response();
        }
    };

    // Store exchanged tokens in Vault (NEVER in PostgreSQL)
    let vault = state.vault_client();
    let credential_data = json!({
        "access_token": tokens.access_token,
        "refresh_token": tokens.refresh_token,
        "expires_in": tokens.expires_in,
        "token_type": tokens.token_type,
        "scope": tokens.scope,
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
            tracing::info!(provider = %provider_enum, "OAuth tokens exchanged and stored in Vault");
            Json(json!({
                "provider": provider_enum.to_string(),
                "status": "connected",
                "message": "OAuth tokens exchanged and stored in Jaskier Vault.",
                "expires_in": tokens.expires_in,
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
pub(crate) async fn disconnect_provider<S>(
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
pub(crate) async fn refresh_provider<S>(
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
            let vault = state.vault_client();
            let status = vault.get_provider_status(&provider).await;

            if status.is_connected {
                Json(json!({
                    "provider": provider_enum.to_string(),
                    "status": "valid",
                    "auth_type": "oauth_pkce",
                    "message": "OAuth credential is currently valid. If expired, reconnect via /connect.",
                    "last_verified": status.last_verified,
                    "expires_at": status.expires_at,
                }))
                .into_response()
            } else {
                Json(json!({
                    "provider": provider_enum.to_string(),
                    "status": "reconnect_required",
                    "auth_type": "oauth_pkce",
                    "message": "OAuth credential expired or not found. Reconnect via POST /api/ai/providers/{provider}/connect.",
                    "action": format!("POST /api/ai/providers/{}/connect", provider_enum),
                }))
                .into_response()
            }
        }
        AuthType::SessionToken | AuthType::CookieSession => {
            Json(json!({
                "provider": provider_enum.to_string(),
                "status": "manual_refresh_required",
                "auth_type": config.auth_type.to_string(),
                "message": "Session refresh requires browser proxy re-login. Trigger via /api/browser-proxy/login.",
                "action": "POST /api/browser-proxy/login",
            }))
            .into_response()
        }
        AuthType::ApiKeyViaVault => {
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
pub(crate) async fn test_provider<S>(
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
