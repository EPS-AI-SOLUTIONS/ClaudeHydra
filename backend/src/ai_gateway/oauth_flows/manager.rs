// manager.rs — OAuthFlowManager: unified OAuth PKCE flow for all providers.

use std::collections::HashMap;
use std::sync::Arc;
use std::time::Duration;

use serde_json::Value;
use tokio::sync::RwLock;

use super::pkce::{parse_token_response, random_base64url, sha256_base64url};
use super::types::*;

// ═══════════════════════════════════════════════════════════════════════════════
//  Provider constants — Anthropic
// ═══════════════════════════════════════════════════════════════════════════════

const ANTHROPIC_CLIENT_ID: &str = "9d1c250a-e61b-44d9-88ed-5944d1962f5e";
const ANTHROPIC_AUTHORIZE_URL: &str = "https://claude.ai/oauth/authorize";
const ANTHROPIC_TOKEN_URL: &str = "https://console.anthropic.com/v1/oauth/token";
const ANTHROPIC_REDIRECT_URI: &str = "https://console.anthropic.com/oauth/code/callback";
const ANTHROPIC_SCOPE: &str = "org:create_api_key user:profile user:inference";

// ═══════════════════════════════════════════════════════════════════════════════
//  Provider constants — Google
// ═══════════════════════════════════════════════════════════════════════════════

const GOOGLE_AUTHORIZE_URL: &str = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL: &str = "https://oauth2.googleapis.com/token";
const GOOGLE_SCOPE: &str = "https://www.googleapis.com/auth/cloud-platform \
    https://www.googleapis.com/auth/generative-language.retriever \
    https://www.googleapis.com/auth/generative-language.tuning \
    https://www.googleapis.com/auth/userinfo.email \
    https://www.googleapis.com/auth/userinfo.profile";

// ═══════════════════════════════════════════════════════════════════════════════
//  OAuthFlowManager
// ═══════════════════════════════════════════════════════════════════════════════

/// Unified OAuth flow manager. Holds per-provider configs and ephemeral PKCE
/// states. Thread-safe — designed to live inside `Arc<AppState>`.
#[derive(Debug, Clone)]
pub struct OAuthFlowManager {
    /// Pending PKCE states keyed by the random `state` parameter.
    pub(crate) pkce_states: Arc<RwLock<HashMap<String, PkceState>>>,
    /// Static provider configurations (populated at construction time).
    provider_configs: HashMap<OAuthProvider, OAuthProviderConfig>,
    /// Shared HTTP client for token exchange / refresh requests.
    http_client: reqwest::Client,
}

impl OAuthFlowManager {
    // ── Construction ────────────────────────────────────────────────────────

    /// Create a new manager with default Anthropic config and optional Google
    /// config. GitHub and Vercel configs can be added later via
    /// `register_provider`.
    ///
    /// Google requires `GOOGLE_OAUTH_CLIENT_ID` and
    /// `GOOGLE_OAUTH_CLIENT_SECRET` env vars. If absent the Google provider is
    /// simply not registered (login attempts will return an error).
    pub fn new(http_client: reqwest::Client) -> Self {
        let mut provider_configs = HashMap::new();

        // Anthropic — always available (hardcoded client_id, no client_secret).
        provider_configs.insert(OAuthProvider::Anthropic, Self::default_anthropic_config());

        // Google — available only when env vars are set.
        if let Some(cfg) = Self::default_google_config() {
            provider_configs.insert(OAuthProvider::Google, cfg);
        }

        Self {
            pkce_states: Arc::new(RwLock::new(HashMap::new())),
            provider_configs,
            http_client,
        }
    }

    /// Register (or replace) a provider configuration at runtime.
    /// Used for GitHub / Vercel whose client_id/secret may come from Vault.
    pub fn register_provider(&mut self, config: OAuthProviderConfig) {
        self.provider_configs.insert(config.provider, config);
    }

    /// Returns `true` if the given provider has a registered config.
    pub fn has_provider(&self, provider: OAuthProvider) -> bool {
        self.provider_configs.contains_key(&provider)
    }

    /// Returns an immutable reference to the provider configs map.
    pub fn provider_configs(&self) -> &HashMap<OAuthProvider, OAuthProviderConfig> {
        &self.provider_configs
    }

    // ── Login (generate authorize URL) ─────────────────────────────────────

    /// Generate a PKCE challenge, store ephemeral state, and return the
    /// authorization URL the frontend should redirect/open.
    pub async fn initiate_login(
        &self,
        provider: OAuthProvider,
    ) -> anyhow::Result<LoginResponse> {
        let config = self
            .provider_configs
            .get(&provider)
            .ok_or_else(|| anyhow::anyhow!("Provider {provider} is not configured"))?;

        // Generate PKCE values.
        let code_verifier = random_base64url(128);
        let code_challenge = match config.pkce_method {
            PkceMethod::S256 => sha256_base64url(&code_verifier),
            PkceMethod::Plain => code_verifier.clone(),
        };
        let challenge_method = match config.pkce_method {
            PkceMethod::S256 => "S256",
            PkceMethod::Plain => "plain",
        };

        // Random anti-CSRF state parameter.
        let state = random_base64url(32);

        // Build authorize URL.
        let mut auth_url = url::Url::parse(&config.authorize_url)
            .map_err(|e| anyhow::anyhow!("Invalid authorize URL for {provider}: {e}"))?;

        {
            let mut pairs = auth_url.query_pairs_mut();
            pairs
                .append_pair("client_id", &config.client_id)
                .append_pair("redirect_uri", &config.redirect_uri)
                .append_pair("response_type", "code")
                .append_pair("code_challenge", &code_challenge)
                .append_pair("code_challenge_method", challenge_method)
                .append_pair("state", &state);

            // Scopes — join with space.
            if !config.scopes.is_empty() {
                let scope_str = config.scopes.join(" ");
                pairs.append_pair("scope", &scope_str);
            }

            // Anthropic-specific: `code=true` param.
            if provider == OAuthProvider::Anthropic {
                pairs.append_pair("code", "true");
            }

            // Extra provider-specific params.
            for (k, v) in &config.extra_params {
                pairs.append_pair(k, v);
            }
        }

        // Store PKCE state (prune expired first).
        {
            let mut states = self.pkce_states.write().await;
            states.retain(|_, s| s.created_at.elapsed() < PKCE_STATE_TTL);
            states.insert(
                state.clone(),
                PkceState {
                    code_verifier,
                    provider,
                    created_at: std::time::Instant::now(),
                },
            );
        }

        tracing::info!(provider = %provider, "OAuth login initiated");

        Ok(LoginResponse {
            authorize_url: auth_url.to_string(),
            state,
            provider,
        })
    }

    // ── Callback (exchange code for tokens) ────────────────────────────────

    /// Validate the CSRF state, consume the stored PKCE verifier, and exchange
    /// the authorization code for tokens at the provider's token endpoint.
    ///
    /// Returns `(OAuthProvider, OAuthTokens)` — the caller is responsible for
    /// persisting tokens to Vault via vault_bridge.
    pub async fn handle_callback(
        &self,
        state: &str,
        code: &str,
    ) -> anyhow::Result<(OAuthProvider, OAuthTokens)> {
        // Consume PKCE state (validates + removes atomically).
        let pkce = {
            let mut states = self.pkce_states.write().await;
            match states.remove(state) {
                Some(s) if s.created_at.elapsed() < PKCE_STATE_TTL => s,
                Some(_) => anyhow::bail!("OAuth state expired (older than 10 min)"),
                None => anyhow::bail!("Invalid or already-consumed OAuth state"),
            }
        };

        let provider = pkce.provider;
        let config = self
            .provider_configs
            .get(&provider)
            .ok_or_else(|| anyhow::anyhow!("Provider {provider} config missing during callback"))?;

        // Build token exchange request — provider-specific format.
        let tokens = match provider {
            OAuthProvider::Anthropic => {
                self.exchange_anthropic(config, code, state, &pkce.code_verifier)
                    .await?
            }
            _ => {
                self.exchange_standard(config, code, &pkce.code_verifier)
                    .await?
            }
        };

        tracing::info!(
            provider = %provider,
            expires_in = ?tokens.expires_in,
            "OAuth token exchange successful"
        );

        Ok((provider, tokens))
    }

    // ── Token refresh ──────────────────────────────────────────────────────

    /// Refresh an OAuth access token using the stored refresh_token.
    /// Google and standard providers use form-encoded POST; Anthropic uses JSON.
    pub async fn refresh_token(
        &self,
        provider: OAuthProvider,
        refresh_token: &str,
    ) -> anyhow::Result<OAuthTokens> {
        let config = self
            .provider_configs
            .get(&provider)
            .ok_or_else(|| anyhow::anyhow!("Provider {provider} is not configured for refresh"))?;

        let tokens = match provider {
            OAuthProvider::Anthropic => {
                self.refresh_anthropic(config, refresh_token).await?
            }
            _ => {
                self.refresh_standard(config, refresh_token).await?
            }
        };

        tracing::info!(
            provider = %provider,
            expires_in = ?tokens.expires_in,
            "OAuth token refreshed"
        );

        Ok(tokens)
    }

    // ── State cleanup ──────────────────────────────────────────────────────

    /// Remove all PKCE states older than `PKCE_STATE_TTL`. Intended to be
    /// called periodically (e.g. from a background timer) or inline before
    /// inserting new states.
    pub async fn cleanup_expired_states(&self) {
        let mut states = self.pkce_states.write().await;
        let before = states.len();
        states.retain(|_, s| s.created_at.elapsed() < PKCE_STATE_TTL);
        let removed = before - states.len();
        if removed > 0 {
            tracing::debug!(removed, "Cleaned up expired PKCE states");
        }
    }

    /// Returns the number of pending PKCE states (for diagnostics).
    pub async fn pending_states_count(&self) -> usize {
        self.pkce_states.read().await.len()
    }

    // ═══════════════════════════════════════════════════════════════════════
    //  Default provider configs
    // ═══════════════════════════════════════════════════════════════════════

    /// Build the default Anthropic OAuth config.
    /// Anthropic uses JSON-encoded token exchange with `code=true` in the
    /// authorize URL. No client_secret is required (public client).
    pub fn default_anthropic_config() -> OAuthProviderConfig {
        OAuthProviderConfig {
            provider: OAuthProvider::Anthropic,
            authorize_url: ANTHROPIC_AUTHORIZE_URL.to_string(),
            token_url: ANTHROPIC_TOKEN_URL.to_string(),
            redirect_uri: ANTHROPIC_REDIRECT_URI.to_string(),
            client_id: ANTHROPIC_CLIENT_ID.to_string(),
            client_secret: None,
            scopes: ANTHROPIC_SCOPE
                .split_whitespace()
                .map(String::from)
                .collect(),
            pkce_method: PkceMethod::S256,
            extra_params: HashMap::new(),
        }
    }

    /// Build the default Google OAuth config from env vars.
    /// Returns `None` if `GOOGLE_OAUTH_CLIENT_ID` or `GOOGLE_OAUTH_CLIENT_SECRET`
    /// are not set.
    pub fn default_google_config() -> Option<OAuthProviderConfig> {
        let client_id = std::env::var("GOOGLE_OAUTH_CLIENT_ID").ok()?;
        let client_secret = std::env::var("GOOGLE_OAUTH_CLIENT_SECRET").ok()?;
        if client_id.is_empty() || client_secret.is_empty() {
            return None;
        }

        let port = std::env::var("PORT").unwrap_or_else(|_| "8082".to_string());
        let redirect_uri = format!("http://localhost:{port}/api/auth/google/redirect");

        let mut extra_params = HashMap::new();
        extra_params.insert("access_type".to_string(), "offline".to_string());
        extra_params.insert("prompt".to_string(), "consent".to_string());

        Some(OAuthProviderConfig {
            provider: OAuthProvider::Google,
            authorize_url: GOOGLE_AUTHORIZE_URL.to_string(),
            token_url: GOOGLE_TOKEN_URL.to_string(),
            redirect_uri,
            client_id,
            client_secret: Some(client_secret),
            scopes: GOOGLE_SCOPE
                .split_whitespace()
                .map(String::from)
                .collect(),
            pkce_method: PkceMethod::S256,
            extra_params,
        })
    }

    // ═══════════════════════════════════════════════════════════════════════
    //  Private — provider-specific exchange / refresh
    // ═══════════════════════════════════════════════════════════════════════

    /// Anthropic token exchange — JSON body, no client_secret.
    async fn exchange_anthropic(
        &self,
        config: &OAuthProviderConfig,
        code: &str,
        state: &str,
        code_verifier: &str,
    ) -> anyhow::Result<OAuthTokens> {
        let body = serde_json::json!({
            "code": code,
            "state": state,
            "grant_type": "authorization_code",
            "client_id": config.client_id,
            "redirect_uri": config.redirect_uri,
            "code_verifier": code_verifier,
        });

        let resp = self
            .http_client
            .post(&config.token_url)
            .header("content-type", "application/json")
            .json(&body)
            .timeout(Duration::from_secs(30))
            .send()
            .await
            .map_err(|e| anyhow::anyhow!("Anthropic token exchange request failed: {e}"))?;

        if !resp.status().is_success() {
            let status = resp.status();
            let err = resp.text().await.unwrap_or_default();
            anyhow::bail!("Anthropic token exchange rejected ({status}): {err}");
        }

        let raw: Value = resp.json().await
            .map_err(|e| anyhow::anyhow!("Invalid JSON from Anthropic token endpoint: {e}"))?;

        parse_token_response(raw, &config.scopes)
    }

    /// Standard OAuth token exchange — form-encoded body, includes client_secret.
    /// Used for Google, GitHub, Vercel.
    async fn exchange_standard(
        &self,
        config: &OAuthProviderConfig,
        code: &str,
        code_verifier: &str,
    ) -> anyhow::Result<OAuthTokens> {
        let mut form: Vec<(&str, &str)> = vec![
            ("code", code),
            ("client_id", &config.client_id),
            ("redirect_uri", &config.redirect_uri),
            ("grant_type", "authorization_code"),
            ("code_verifier", code_verifier),
        ];

        // client_secret is required for confidential clients (Google, GitHub, Vercel).
        let secret_ref;
        if let Some(ref secret) = config.client_secret {
            secret_ref = secret.clone();
            form.push(("client_secret", &secret_ref));
        }

        let resp = self
            .http_client
            .post(&config.token_url)
            .form(&form)
            .timeout(Duration::from_secs(30))
            .send()
            .await
            .map_err(|e| {
                anyhow::anyhow!("{} token exchange request failed: {e}", config.provider)
            })?;

        if !resp.status().is_success() {
            let status = resp.status();
            let err = resp.text().await.unwrap_or_default();
            anyhow::bail!("{} token exchange rejected ({status}): {err}", config.provider);
        }

        let raw: Value = resp.json().await.map_err(|e| {
            anyhow::anyhow!("Invalid JSON from {} token endpoint: {e}", config.provider)
        })?;

        parse_token_response(raw, &config.scopes)
    }

    /// Anthropic token refresh — JSON body.
    async fn refresh_anthropic(
        &self,
        config: &OAuthProviderConfig,
        refresh_token: &str,
    ) -> anyhow::Result<OAuthTokens> {
        let body = serde_json::json!({
            "grant_type": "refresh_token",
            "client_id": config.client_id,
            "refresh_token": refresh_token,
        });

        let resp = self
            .http_client
            .post(&config.token_url)
            .header("content-type", "application/json")
            .json(&body)
            .timeout(Duration::from_secs(30))
            .send()
            .await
            .map_err(|e| anyhow::anyhow!("Anthropic token refresh request failed: {e}"))?;

        if !resp.status().is_success() {
            let status = resp.status();
            let err = resp.text().await.unwrap_or_default();
            anyhow::bail!("Anthropic token refresh rejected ({status}): {err}");
        }

        let raw: Value = resp.json().await
            .map_err(|e| anyhow::anyhow!("Invalid JSON from Anthropic refresh endpoint: {e}"))?;

        parse_token_response(raw, &config.scopes)
    }

    /// Standard token refresh — form-encoded body with client_secret.
    async fn refresh_standard(
        &self,
        config: &OAuthProviderConfig,
        refresh_token: &str,
    ) -> anyhow::Result<OAuthTokens> {
        let mut form: Vec<(&str, &str)> = vec![
            ("grant_type", "refresh_token"),
            ("client_id", &config.client_id),
            ("refresh_token", refresh_token),
        ];

        let secret_ref;
        if let Some(ref secret) = config.client_secret {
            secret_ref = secret.clone();
            form.push(("client_secret", &secret_ref));
        }

        let resp = self
            .http_client
            .post(&config.token_url)
            .form(&form)
            .timeout(Duration::from_secs(30))
            .send()
            .await
            .map_err(|e| {
                anyhow::anyhow!("{} token refresh request failed: {e}", config.provider)
            })?;

        if !resp.status().is_success() {
            let status = resp.status();
            let err = resp.text().await.unwrap_or_default();
            anyhow::bail!("{} token refresh rejected ({status}): {err}", config.provider);
        }

        let raw: Value = resp.json().await.map_err(|e| {
            anyhow::anyhow!("Invalid JSON from {} refresh endpoint: {e}", config.provider)
        })?;

        parse_token_response(raw, &config.scopes)
    }
}
