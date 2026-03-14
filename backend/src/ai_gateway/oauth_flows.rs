// oauth_flows.rs — Zunifikowane OAuth PKCE flows dla wszystkich dostawców
// Po token exchange -> vault_set (NIE DB insert). PKCE state in-memory z TTL 10 min.
//
// This module consolidates OAuth login, callback, and refresh for ALL providers
// (Anthropic, Google, GitHub, Vercel) into a single PKCE handler. After a
// successful token exchange the *caller* (handlers.rs) stores tokens in Vault
// via vault_bridge — this module does NOT interact with Vault directly.

use std::collections::HashMap;
use std::sync::Arc;
use std::time::{Duration, Instant};

use base64::Engine;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sha2::Digest;
use tokio::sync::RwLock;
use tracing;

// ═══════════════════════════════════════════════════════════════════════════════
//  Types & Enums
// ═══════════════════════════════════════════════════════════════════════════════

/// Supported AI providers for the unified OAuth flow.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AiProvider {
    Anthropic,
    Google,
    GitHub,
    Vercel,
}

impl std::fmt::Display for AiProvider {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Anthropic => write!(f, "anthropic"),
            Self::Google => write!(f, "google"),
            Self::GitHub => write!(f, "github"),
            Self::Vercel => write!(f, "vercel"),
        }
    }
}

/// PKCE challenge method.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum PkceMethod {
    /// SHA-256 challenge (recommended).
    S256,
    /// Plain challenge (code_challenge == code_verifier). Less secure — use only
    /// when the provider does not support S256.
    Plain,
}

// ═══════════════════════════════════════════════════════════════════════════════
//  Configuration
// ═══════════════════════════════════════════════════════════════════════════════

/// Per-provider OAuth configuration. Immutable after construction — providers
/// whose client_id/secret come from Vault supply them at `new()` time.
#[derive(Debug, Clone)]
pub struct OAuthProviderConfig {
    pub provider: AiProvider,
    pub authorize_url: String,
    pub token_url: String,
    pub redirect_uri: String,
    pub client_id: String,
    pub client_secret: Option<String>,
    pub scopes: Vec<String>,
    pub pkce_method: PkceMethod,
    /// Extra query parameters appended to the authorize URL (e.g. `access_type=offline`).
    pub extra_params: HashMap<String, String>,
}

// ═══════════════════════════════════════════════════════════════════════════════
//  Token types
// ═══════════════════════════════════════════════════════════════════════════════

/// Tokens returned by a successful OAuth code exchange or refresh.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OAuthTokens {
    pub access_token: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub refresh_token: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub expires_in: Option<i64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub scope: Option<String>,
    #[serde(default = "default_token_type")]
    pub token_type: String,
    /// Provider-specific extra fields returned alongside the token (e.g.
    /// `id_token` for Google, `team_id` for Vercel).
    #[serde(default, skip_serializing_if = "HashMap::is_empty")]
    pub extra: HashMap<String, Value>,
}

fn default_token_type() -> String {
    "Bearer".to_string()
}

/// Response returned to the frontend after initiating a login flow.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LoginResponse {
    pub authorize_url: String,
    pub state: String,
    pub provider: AiProvider,
}

// ═══════════════════════════════════════════════════════════════════════════════
//  In-memory PKCE state
// ═══════════════════════════════════════════════════════════════════════════════

/// Ephemeral PKCE state kept between `initiate_login` and `handle_callback`.
/// Automatically purged after `PKCE_STATE_TTL`.
#[derive(Debug, Clone)]
pub struct PkceState {
    pub code_verifier: String,
    pub provider: AiProvider,
    pub created_at: Instant,
}

/// Maximum lifetime of a pending PKCE state entry (10 minutes).
const PKCE_STATE_TTL: Duration = Duration::from_secs(600);

// ═══════════════════════════════════════════════════════════════════════════════
//  Anthropic constants
// ═══════════════════════════════════════════════════════════════════════════════

const ANTHROPIC_CLIENT_ID: &str = "9d1c250a-e61b-44d9-88ed-5944d1962f5e";
const ANTHROPIC_AUTHORIZE_URL: &str = "https://claude.ai/oauth/authorize";
const ANTHROPIC_TOKEN_URL: &str = "https://console.anthropic.com/v1/oauth/token";
const ANTHROPIC_REDIRECT_URI: &str = "https://console.anthropic.com/oauth/code/callback";
const ANTHROPIC_SCOPE: &str = "org:create_api_key user:profile user:inference";

// ═══════════════════════════════════════════════════════════════════════════════
//  Google constants
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
    pkce_states: Arc<RwLock<HashMap<String, PkceState>>>,
    /// Static provider configurations (populated at construction time).
    provider_configs: HashMap<AiProvider, OAuthProviderConfig>,
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
        provider_configs.insert(AiProvider::Anthropic, Self::default_anthropic_config());

        // Google — available only when env vars are set.
        if let Some(cfg) = Self::default_google_config() {
            provider_configs.insert(AiProvider::Google, cfg);
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
    pub fn has_provider(&self, provider: AiProvider) -> bool {
        self.provider_configs.contains_key(&provider)
    }

    /// Returns an immutable reference to the provider configs map.
    pub fn provider_configs(&self) -> &HashMap<AiProvider, OAuthProviderConfig> {
        &self.provider_configs
    }

    // ── Login (generate authorize URL) ─────────────────────────────────────

    /// Generate a PKCE challenge, store ephemeral state, and return the
    /// authorization URL the frontend should redirect/open.
    pub async fn initiate_login(
        &self,
        provider: AiProvider,
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
            if provider == AiProvider::Anthropic {
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
                    created_at: Instant::now(),
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
    /// Returns `(AiProvider, OAuthTokens)` — the caller is responsible for
    /// persisting tokens to Vault via vault_bridge.
    pub async fn handle_callback(
        &self,
        state: &str,
        code: &str,
    ) -> anyhow::Result<(AiProvider, OAuthTokens)> {
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
            AiProvider::Anthropic => {
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
        provider: AiProvider,
        refresh_token: &str,
    ) -> anyhow::Result<OAuthTokens> {
        let config = self
            .provider_configs
            .get(&provider)
            .ok_or_else(|| anyhow::anyhow!("Provider {provider} is not configured for refresh"))?;

        let tokens = match provider {
            AiProvider::Anthropic => {
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
            provider: AiProvider::Anthropic,
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
            provider: AiProvider::Google,
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

// ═══════════════════════════════════════════════════════════════════════════════
//  PKCE utilities (self-contained, no dependency on jaskier-oauth::pkce)
// ═══════════════════════════════════════════════════════════════════════════════

/// Generate a cryptographically secure random base64url string (no padding).
/// `byte_len` is the number of random bytes; the resulting string is ~4/3 as long.
fn random_base64url(byte_len: usize) -> String {
    let buf: Vec<u8> = (0..byte_len).map(|_| rand::random::<u8>()).collect();
    base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(&buf)
}

/// SHA-256 hash encoded as base64url (no padding) — PKCE S256 challenge.
fn sha256_base64url(input: &str) -> String {
    base64::engine::general_purpose::URL_SAFE_NO_PAD
        .encode(sha2::Sha256::digest(input.as_bytes()))
}

// ═══════════════════════════════════════════════════════════════════════════════
//  Token response parser
// ═══════════════════════════════════════════════════════════════════════════════

/// Known top-level fields extracted into `OAuthTokens` — everything else goes
/// into `extra`.
const KNOWN_TOKEN_FIELDS: &[&str] = &[
    "access_token",
    "refresh_token",
    "expires_in",
    "scope",
    "token_type",
];

/// Parse a raw JSON token response into `OAuthTokens`, collecting unknown
/// fields into `extra`.
fn parse_token_response(
    raw: Value,
    configured_scopes: &[String],
) -> anyhow::Result<OAuthTokens> {
    let obj = raw
        .as_object()
        .ok_or_else(|| anyhow::anyhow!("Token response is not a JSON object"))?;

    let access_token = obj
        .get("access_token")
        .and_then(|v| v.as_str())
        .ok_or_else(|| anyhow::anyhow!("Token response missing access_token"))?
        .to_string();

    let refresh_token = obj
        .get("refresh_token")
        .and_then(|v| v.as_str())
        .map(String::from);

    let expires_in = obj.get("expires_in").and_then(|v| v.as_i64());

    let scope = obj
        .get("scope")
        .and_then(|v| v.as_str())
        .map(String::from)
        .or_else(|| {
            if configured_scopes.is_empty() {
                None
            } else {
                Some(configured_scopes.join(" "))
            }
        });

    let token_type = obj
        .get("token_type")
        .and_then(|v| v.as_str())
        .unwrap_or("Bearer")
        .to_string();

    // Collect extra fields.
    let extra: HashMap<String, Value> = obj
        .iter()
        .filter(|(k, _)| !KNOWN_TOKEN_FIELDS.contains(&k.as_str()))
        .map(|(k, v)| (k.clone(), v.clone()))
        .collect();

    Ok(OAuthTokens {
        access_token,
        refresh_token,
        expires_in,
        scope,
        token_type,
        extra,
    })
}

// ═══════════════════════════════════════════════════════════════════════════════
//  Tests
// ═══════════════════════════════════════════════════════════════════════════════

#[cfg(test)]
mod tests {
    use super::*;

    // ── AiProvider Display + Serialize ──────────────────────────────────────

    #[test]
    fn ai_provider_display() {
        assert_eq!(AiProvider::Anthropic.to_string(), "anthropic");
        assert_eq!(AiProvider::Google.to_string(), "google");
        assert_eq!(AiProvider::GitHub.to_string(), "github");
        assert_eq!(AiProvider::Vercel.to_string(), "vercel");
    }

    #[test]
    fn ai_provider_serde_roundtrip() {
        let json = serde_json::to_string(&AiProvider::Anthropic).unwrap();
        assert_eq!(json, r#""anthropic""#);
        let back: AiProvider = serde_json::from_str(&json).unwrap();
        assert_eq!(back, AiProvider::Anthropic);
    }

    #[test]
    fn ai_provider_hash_eq() {
        let mut map = HashMap::new();
        map.insert(AiProvider::Google, "test");
        assert_eq!(map.get(&AiProvider::Google), Some(&"test"));
        assert_eq!(map.get(&AiProvider::Anthropic), None);
    }

    // ── PkceMethod ─────────────────────────────────────────────────────────

    #[test]
    fn pkce_method_serde() {
        let json = serde_json::to_string(&PkceMethod::S256).unwrap();
        assert_eq!(json, r#""s256""#);
        let plain: PkceMethod = serde_json::from_str(r#""plain""#).unwrap();
        assert_eq!(plain, PkceMethod::Plain);
    }

    // ── OAuthTokens serialization ──────────────────────────────────────────

    #[test]
    fn oauth_tokens_minimal_serialize() {
        let tokens = OAuthTokens {
            access_token: "at-123".into(),
            refresh_token: None,
            expires_in: None,
            scope: None,
            token_type: "Bearer".into(),
            extra: HashMap::new(),
        };
        let json = serde_json::to_value(&tokens).unwrap();
        assert_eq!(json["access_token"], "at-123");
        assert_eq!(json["token_type"], "Bearer");
        // Optional fields with skip_serializing_if should be absent.
        assert!(json.get("refresh_token").is_none());
        assert!(json.get("expires_in").is_none());
        assert!(json.get("scope").is_none());
        assert!(json.get("extra").is_none());
    }

    #[test]
    fn oauth_tokens_full_serialize() {
        let mut extra = HashMap::new();
        extra.insert("id_token".to_string(), Value::String("jwt-xxx".into()));
        let tokens = OAuthTokens {
            access_token: "ya29.xxx".into(),
            refresh_token: Some("1//0xxx".into()),
            expires_in: Some(3600),
            scope: Some("email profile".into()),
            token_type: "Bearer".into(),
            extra,
        };
        let json = serde_json::to_value(&tokens).unwrap();
        assert_eq!(json["refresh_token"], "1//0xxx");
        assert_eq!(json["expires_in"], 3600);
        assert_eq!(json["extra"]["id_token"], "jwt-xxx");
    }

    #[test]
    fn oauth_tokens_deserialize_default_token_type() {
        let json = r#"{"access_token": "tok"}"#;
        let tokens: OAuthTokens = serde_json::from_str(json).unwrap();
        assert_eq!(tokens.token_type, "Bearer");
        assert!(tokens.extra.is_empty());
    }

    // ── LoginResponse ──────────────────────────────────────────────────────

    #[test]
    fn login_response_serde() {
        let resp = LoginResponse {
            authorize_url: "https://example.com/auth".into(),
            state: "csrf-123".into(),
            provider: AiProvider::Google,
        };
        let json = serde_json::to_value(&resp).unwrap();
        assert_eq!(json["provider"], "google");
        assert_eq!(json["state"], "csrf-123");
    }

    // ── PKCE utilities ─────────────────────────────────────────────────────

    #[test]
    fn random_base64url_128_bytes_correct_length() {
        let s = random_base64url(128);
        // 128 bytes -> base64url no padding: (128 * 4 + 2) / 3 = 171 chars
        assert_eq!(s.len(), 171);
    }

    #[test]
    fn random_base64url_no_padding() {
        let s = random_base64url(32);
        assert!(!s.contains('='));
    }

    #[test]
    fn random_base64url_url_safe_chars() {
        let s = random_base64url(64);
        assert!(!s.contains('+'), "should use - not +");
        assert!(!s.contains('/'), "should use _ not /");
    }

    #[test]
    fn random_base64url_unique() {
        let a = random_base64url(32);
        let b = random_base64url(32);
        assert_ne!(a, b);
    }

    #[test]
    fn sha256_base64url_known_empty() {
        // SHA-256("") = e3b0c44298fc1c14... base64url = 47DEQpj8HBSa-_TImW-5JCeuQeRkm5NMpJWZG3hSuFU
        assert_eq!(
            sha256_base64url(""),
            "47DEQpj8HBSa-_TImW-5JCeuQeRkm5NMpJWZG3hSuFU"
        );
    }

    #[test]
    fn sha256_base64url_deterministic() {
        let a = sha256_base64url("test-verifier");
        let b = sha256_base64url("test-verifier");
        assert_eq!(a, b);
    }

    #[test]
    fn sha256_base64url_length() {
        // SHA-256 = 32 bytes -> 43 base64url chars
        assert_eq!(sha256_base64url("anything").len(), 43);
    }

    // ── parse_token_response ───────────────────────────────────────────────

    #[test]
    fn parse_token_response_minimal() {
        let raw = serde_json::json!({
            "access_token": "at-abc"
        });
        let tokens = parse_token_response(raw, &[]).unwrap();
        assert_eq!(tokens.access_token, "at-abc");
        assert_eq!(tokens.token_type, "Bearer");
        assert!(tokens.refresh_token.is_none());
        assert!(tokens.expires_in.is_none());
        assert!(tokens.scope.is_none());
        assert!(tokens.extra.is_empty());
    }

    #[test]
    fn parse_token_response_full() {
        let raw = serde_json::json!({
            "access_token": "ya29.xxx",
            "refresh_token": "1//0abc",
            "expires_in": 3600,
            "scope": "email",
            "token_type": "Bearer",
            "id_token": "eyJhbG..."
        });
        let tokens = parse_token_response(raw, &[]).unwrap();
        assert_eq!(tokens.access_token, "ya29.xxx");
        assert_eq!(tokens.refresh_token.as_deref(), Some("1//0abc"));
        assert_eq!(tokens.expires_in, Some(3600));
        assert_eq!(tokens.scope.as_deref(), Some("email"));
        assert_eq!(
            tokens.extra.get("id_token"),
            Some(&Value::String("eyJhbG...".into()))
        );
    }

    #[test]
    fn parse_token_response_falls_back_to_configured_scopes() {
        let raw = serde_json::json!({
            "access_token": "tok",
        });
        let scopes = vec!["read".to_string(), "write".to_string()];
        let tokens = parse_token_response(raw, &scopes).unwrap();
        assert_eq!(tokens.scope.as_deref(), Some("read write"));
    }

    #[test]
    fn parse_token_response_missing_access_token() {
        let raw = serde_json::json!({
            "refresh_token": "rt"
        });
        let err = parse_token_response(raw, &[]);
        assert!(err.is_err());
        assert!(
            err.unwrap_err()
                .to_string()
                .contains("missing access_token")
        );
    }

    #[test]
    fn parse_token_response_not_object() {
        let raw = serde_json::json!("just a string");
        let err = parse_token_response(raw, &[]);
        assert!(err.is_err());
    }

    // ── Default configs ────────────────────────────────────────────────────

    #[test]
    fn default_anthropic_config_constants() {
        let cfg = OAuthFlowManager::default_anthropic_config();
        assert_eq!(cfg.provider, AiProvider::Anthropic);
        assert_eq!(cfg.client_id, ANTHROPIC_CLIENT_ID);
        assert_eq!(cfg.authorize_url, ANTHROPIC_AUTHORIZE_URL);
        assert_eq!(cfg.token_url, ANTHROPIC_TOKEN_URL);
        assert_eq!(cfg.redirect_uri, ANTHROPIC_REDIRECT_URI);
        assert!(cfg.client_secret.is_none());
        assert_eq!(cfg.pkce_method, PkceMethod::S256);
        assert!(cfg.scopes.contains(&"user:inference".to_string()));
        assert!(cfg.scopes.contains(&"org:create_api_key".to_string()));
        assert!(cfg.scopes.contains(&"user:profile".to_string()));
    }

    #[test]
    fn default_anthropic_config_urls_are_valid() {
        let cfg = OAuthFlowManager::default_anthropic_config();
        assert!(url::Url::parse(&cfg.authorize_url).is_ok());
        assert!(url::Url::parse(&cfg.token_url).is_ok());
        assert!(url::Url::parse(&cfg.redirect_uri).is_ok());
    }

    // ── OAuthFlowManager construction ──────────────────────────────────────

    #[test]
    fn manager_always_has_anthropic() {
        let mgr = OAuthFlowManager::new(reqwest::Client::new());
        assert!(mgr.has_provider(AiProvider::Anthropic));
    }

    #[test]
    fn manager_register_provider() {
        let mut mgr = OAuthFlowManager::new(reqwest::Client::new());
        assert!(!mgr.has_provider(AiProvider::GitHub));

        mgr.register_provider(OAuthProviderConfig {
            provider: AiProvider::GitHub,
            authorize_url: "https://github.com/login/oauth/authorize".into(),
            token_url: "https://github.com/login/oauth/access_token".into(),
            redirect_uri: "http://localhost:8082/api/auth/github/callback".into(),
            client_id: "gh-client-id".into(),
            client_secret: Some("gh-secret".into()),
            scopes: vec!["repo".into(), "user".into()],
            pkce_method: PkceMethod::S256,
            extra_params: HashMap::new(),
        });

        assert!(mgr.has_provider(AiProvider::GitHub));
    }

    // ── PkceState TTL ──────────────────────────────────────────────────────

    #[test]
    fn pkce_state_ttl_is_10_minutes() {
        assert_eq!(PKCE_STATE_TTL.as_secs(), 600);
    }

    // ── Async tests ────────────────────────────────────────────────────────

    #[tokio::test]
    async fn initiate_login_returns_valid_url() {
        let mgr = OAuthFlowManager::new(reqwest::Client::new());
        let resp = mgr.initiate_login(AiProvider::Anthropic).await.unwrap();

        assert_eq!(resp.provider, AiProvider::Anthropic);
        assert!(!resp.state.is_empty());

        let parsed = url::Url::parse(&resp.authorize_url).unwrap();
        assert_eq!(parsed.scheme(), "https");
        assert_eq!(parsed.host_str(), Some("claude.ai"));

        let params: HashMap<_, _> = parsed.query_pairs().collect();
        assert_eq!(params.get("client_id").map(|c| c.as_ref()), Some(ANTHROPIC_CLIENT_ID));
        assert_eq!(params.get("response_type").map(|c| c.as_ref()), Some("code"));
        assert_eq!(params.get("code_challenge_method").map(|c| c.as_ref()), Some("S256"));
        assert!(params.contains_key("code_challenge"));
        assert!(params.contains_key("state"));
        assert_eq!(params.get("code").map(|c| c.as_ref()), Some("true"));
    }

    #[tokio::test]
    async fn initiate_login_stores_pkce_state() {
        let mgr = OAuthFlowManager::new(reqwest::Client::new());
        assert_eq!(mgr.pending_states_count().await, 0);

        let resp = mgr.initiate_login(AiProvider::Anthropic).await.unwrap();
        assert_eq!(mgr.pending_states_count().await, 1);

        let states = mgr.pkce_states.read().await;
        let pkce = states.get(&resp.state).unwrap();
        assert_eq!(pkce.provider, AiProvider::Anthropic);
        assert!(!pkce.code_verifier.is_empty());
    }

    #[tokio::test]
    async fn initiate_login_unconfigured_provider_errors() {
        let mgr = OAuthFlowManager::new(reqwest::Client::new());
        let result = mgr.initiate_login(AiProvider::GitHub).await;
        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("not configured"));
    }

    #[tokio::test]
    async fn handle_callback_invalid_state_errors() {
        let mgr = OAuthFlowManager::new(reqwest::Client::new());
        let result = mgr.handle_callback("nonexistent-state", "some-code").await;
        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("Invalid"));
    }

    #[tokio::test]
    async fn handle_callback_consumes_state() {
        let mgr = OAuthFlowManager::new(reqwest::Client::new());
        let resp = mgr.initiate_login(AiProvider::Anthropic).await.unwrap();
        assert_eq!(mgr.pending_states_count().await, 1);

        // The actual HTTP call will fail (no server), but the state should be
        // consumed regardless.
        let _ = mgr.handle_callback(&resp.state, "fake-code").await;
        assert_eq!(mgr.pending_states_count().await, 0);
    }

    #[tokio::test]
    async fn cleanup_expired_states_removes_old_entries() {
        let mgr = OAuthFlowManager::new(reqwest::Client::new());

        // Insert an already-expired state manually.
        {
            let mut states = mgr.pkce_states.write().await;
            states.insert(
                "old-state".to_string(),
                PkceState {
                    code_verifier: "v".into(),
                    provider: AiProvider::Anthropic,
                    created_at: Instant::now() - Duration::from_secs(700),
                },
            );
            states.insert(
                "fresh-state".to_string(),
                PkceState {
                    code_verifier: "v2".into(),
                    provider: AiProvider::Google,
                    created_at: Instant::now(),
                },
            );
        }

        assert_eq!(mgr.pending_states_count().await, 2);
        mgr.cleanup_expired_states().await;
        assert_eq!(mgr.pending_states_count().await, 1);

        let states = mgr.pkce_states.read().await;
        assert!(states.contains_key("fresh-state"));
        assert!(!states.contains_key("old-state"));
    }

    #[tokio::test]
    async fn refresh_unconfigured_provider_errors() {
        let mgr = OAuthFlowManager::new(reqwest::Client::new());
        let result = mgr.refresh_token(AiProvider::Vercel, "rt-xxx").await;
        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("not configured"));
    }
}
