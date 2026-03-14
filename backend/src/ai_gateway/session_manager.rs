// session_manager.rs — Cookie/Session management for providers without official OAuth
// OpenAI (ChatGPT Plus) uses JWT session tokens
// xAI (Grok) uses X.com auth cookies
// Sessions are refreshed via browser proxy (gemini-browser-proxy on :3001)

use std::collections::HashMap;
use std::fmt;
use std::time::Duration;

use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use tracing::{debug, error, info, warn};

// ── SessionProvider ────────────────────────────────────────────────────────────

/// Providers that require cookie/session-based auth (no official OAuth).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SessionProvider {
    /// ChatGPT Plus/Pro — JWT session token from chatgpt.com
    OpenAI,
    /// X Premium+ / SuperGrok — X.com auth cookies
    Xai,
}

impl fmt::Display for SessionProvider {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::OpenAI => write!(f, "openai"),
            Self::Xai => write!(f, "xai"),
        }
    }
}

// ── SessionConfig ──────────────────────────────────────────────────────────────

/// Configuration for a session-based provider.
#[derive(Debug, Clone)]
pub struct SessionConfig {
    /// Which provider this config is for.
    pub provider: SessionProvider,
    /// Cookie names to extract from the browser session.
    pub cookie_names: Vec<String>,
    /// How often to check if the session is still valid.
    pub refresh_interval: Duration,
    /// Optional override for the browser proxy URL (default: from SessionManager).
    pub browser_proxy_url: Option<String>,
    /// URL to hit to validate the current session.
    pub validation_url: String,
    /// Vault namespace for credential storage.
    pub vault_namespace: String,
    /// Vault service name for credential storage.
    pub vault_service: String,
}

// ── SessionStatus ──────────────────────────────────────────────────────────────

/// Current status of a session-based auth credential.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "status", rename_all = "snake_case")]
pub enum SessionStatus {
    /// Session is valid and can be used for API calls.
    Valid {
        /// Estimated time until expiry (if determinable from JWT exp claim or cookie maxAge).
        #[serde(
            skip_serializing_if = "Option::is_none",
            with = "option_duration_secs"
        )]
        expires_in: Option<Duration>,
    },
    /// Session has expired and needs refresh.
    Expired,
    /// Session is invalid (rejected by the provider).
    Invalid { reason: String },
    /// Session status could not be determined (e.g., network error).
    Unknown,
}

/// Serde helper: serialize `Option<Duration>` as optional seconds (u64).
mod option_duration_secs {
    use serde::{Deserialize, Deserializer, Serializer};
    use std::time::Duration;

    pub fn serialize<S: Serializer>(
        val: &Option<Duration>,
        serializer: S,
    ) -> Result<S::Ok, S::Error> {
        match val {
            Some(d) => serializer.serialize_u64(d.as_secs()),
            None => serializer.serialize_none(),
        }
    }

    #[allow(dead_code)]
    pub fn deserialize<'de, D: Deserializer<'de>>(
        deserializer: D,
    ) -> Result<Option<Duration>, D::Error> {
        let opt: Option<u64> = Option::deserialize(deserializer)?;
        Ok(opt.map(Duration::from_secs))
    }
}

// ── Browser proxy response types ───────────────────────────────────────────────

/// Response from browser proxy `/api/session/extract` endpoint.
#[derive(Debug, Deserialize)]
#[allow(dead_code)]
struct BrowserExtractResponse {
    #[serde(default)]
    success: bool,
    #[serde(default)]
    cookies: HashMap<String, String>,
    #[serde(default)]
    error: Option<String>,
}

/// Response from browser proxy `/api/session/refresh` endpoint.
#[derive(Debug, Deserialize)]
struct BrowserRefreshResponse {
    #[serde(default)]
    success: bool,
    #[serde(default)]
    cookies: HashMap<String, String>,
    #[serde(default)]
    error: Option<String>,
}

/// Response shape when validating an OpenAI session via /backend-api/me.
#[derive(Debug, Deserialize)]
struct OpenAIMeResponse {
    #[serde(default)]
    email: Option<String>,
    #[serde(default)]
    name: Option<String>,
}

// ── SessionManager ─────────────────────────────────────────────────────────────

/// Manages cookie/session-based authentication for providers that lack official OAuth.
///
/// Uses the gemini-browser-proxy for headless browser login and cookie extraction.
/// Sessions are stored in Jaskier Vault (never in PostgreSQL).
pub struct SessionManager {
    /// Per-provider session configurations.
    configs: HashMap<SessionProvider, SessionConfig>,
    /// HTTP client for validation requests and browser proxy communication.
    http: reqwest::Client,
    /// Base URL for the browser proxy service.
    browser_proxy_url: String,
}

impl SessionManager {
    /// Create a new SessionManager with default provider configs.
    ///
    /// # Arguments
    /// * `browser_proxy_url` — Override for the browser proxy URL.
    ///   Defaults to `"http://localhost:3001"` if `None`.
    #[allow(clippy::expect_used)]
    pub fn new(browser_proxy_url: Option<String>) -> Self {
        let proxy_url = browser_proxy_url.unwrap_or_else(|| "http://localhost:3001".to_string());

        let mut configs = HashMap::new();
        configs.insert(SessionProvider::OpenAI, Self::openai_config());
        configs.insert(SessionProvider::Xai, Self::xai_config());

        let http = reqwest::Client::builder()
            .timeout(Duration::from_secs(30))
            .user_agent("JaskierSessionManager/1.0")
            .build()
            .expect("failed to build reqwest client");

        Self {
            configs,
            http,
            browser_proxy_url: proxy_url,
        }
    }

    /// Default session config for OpenAI (ChatGPT Plus/Pro).
    ///
    /// Uses JWT session token (`__Secure-next-auth.session-token`) extracted from chatgpt.com.
    /// Validation: `GET https://chatgpt.com/backend-api/me` with Bearer token.
    fn openai_config() -> SessionConfig {
        SessionConfig {
            provider: SessionProvider::OpenAI,
            cookie_names: vec!["__Secure-next-auth.session-token".to_string()],
            refresh_interval: Duration::from_secs(30 * 60), // 30 minutes
            browser_proxy_url: None,
            validation_url: "https://chatgpt.com/backend-api/me".to_string(),
            vault_namespace: "ai_providers".to_string(),
            vault_service: "openai_session".to_string(),
        }
    }

    /// Default session config for xAI (Grok via X.com).
    ///
    /// Uses X.com cookies (`auth_token`, `ct0` CSRF token, `twid` user ID).
    /// Validation: `GET https://grok.x.com/rest/app-chat/conversations` with cookie header.
    fn xai_config() -> SessionConfig {
        SessionConfig {
            provider: SessionProvider::Xai,
            cookie_names: vec![
                "auth_token".to_string(),
                "ct0".to_string(),
                "twid".to_string(),
            ],
            refresh_interval: Duration::from_secs(60 * 60), // 60 minutes
            browser_proxy_url: None,
            validation_url: "https://grok.x.com/rest/app-chat/conversations".to_string(),
            vault_namespace: "ai_providers".to_string(),
            vault_service: "xai_grok".to_string(),
        }
    }

    /// Get the session config for a given provider.
    pub fn config(&self, provider: SessionProvider) -> Option<&SessionConfig> {
        self.configs.get(&provider)
    }

    /// Get the effective browser proxy URL for a provider (config override or global default).
    fn effective_proxy_url(&self, provider: SessionProvider) -> &str {
        self.configs
            .get(&provider)
            .and_then(|c| c.browser_proxy_url.as_deref())
            .unwrap_or(&self.browser_proxy_url)
    }

    // ── Session validation ─────────────────────────────────────────────────────

    /// Validate whether the current session token/cookies are still accepted by the provider.
    ///
    /// # Arguments
    /// * `provider` — Which provider to validate.
    /// * `token_or_cookies` — For OpenAI: the JWT session token.
    ///   For xAI: a semicolon-separated cookie string (e.g., `"auth_token=xxx; ct0=yyy; twid=zzz"`).
    pub async fn validate_session(
        &self,
        provider: SessionProvider,
        token_or_cookies: &str,
    ) -> SessionStatus {
        let config = match self.configs.get(&provider) {
            Some(c) => c,
            None => {
                return SessionStatus::Invalid {
                    reason: format!("no config for provider {provider}"),
                }
            }
        };

        debug!(
            provider = %provider,
            url = %config.validation_url,
            "validating session"
        );

        match provider {
            SessionProvider::OpenAI => self.validate_openai(config, token_or_cookies).await,
            SessionProvider::Xai => self.validate_xai(config, token_or_cookies).await,
        }
    }

    /// Validate OpenAI session by calling `/backend-api/me` with the JWT token.
    async fn validate_openai(&self, config: &SessionConfig, token: &str) -> SessionStatus {
        let result = self
            .http
            .get(&config.validation_url)
            .header("Authorization", format!("Bearer {token}"))
            .send()
            .await;

        match result {
            Ok(resp) => {
                let status = resp.status();
                if status.is_success() {
                    // Try to parse the response — if it has user info, session is valid
                    match resp.json::<OpenAIMeResponse>().await {
                        Ok(me) => {
                            info!(
                                provider = "openai",
                                email = ?me.email,
                                name = ?me.name,
                                "session valid"
                            );
                            // JWT exp claim extraction for expires_in estimation
                            let expires_in = Self::extract_jwt_expiry(token);
                            SessionStatus::Valid { expires_in }
                        }
                        Err(e) => {
                            warn!(provider = "openai", error = %e, "valid status but failed to parse /me response");
                            SessionStatus::Valid { expires_in: None }
                        }
                    }
                } else if status == reqwest::StatusCode::UNAUTHORIZED
                    || status == reqwest::StatusCode::FORBIDDEN
                {
                    info!(provider = "openai", status = %status, "session expired or invalid");
                    SessionStatus::Expired
                } else {
                    warn!(provider = "openai", status = %status, "unexpected status from validation");
                    SessionStatus::Unknown
                }
            }
            Err(e) => {
                error!(provider = "openai", error = %e, "validation request failed");
                SessionStatus::Unknown
            }
        }
    }

    /// Validate xAI/Grok session by calling the conversations endpoint with cookies.
    async fn validate_xai(&self, config: &SessionConfig, cookies: &str) -> SessionStatus {
        // Extract ct0 from the cookie string for the CSRF header
        let ct0 = Self::extract_cookie_value(cookies, "ct0");

        let mut req = self
            .http
            .get(&config.validation_url)
            .header("Cookie", cookies);

        // xAI requires x-csrf-token header matching the ct0 cookie
        if let Some(csrf) = &ct0 {
            req = req
                .header("x-csrf-token", csrf)
                .header("x-twitter-auth-type", "OAuth2Session");
        }

        match req.send().await {
            Ok(resp) => {
                let status = resp.status();
                if status.is_success() {
                    info!(provider = "xai", "session valid (conversations endpoint OK)");
                    SessionStatus::Valid { expires_in: None }
                } else if status == reqwest::StatusCode::UNAUTHORIZED
                    || status == reqwest::StatusCode::FORBIDDEN
                {
                    info!(provider = "xai", status = %status, "session expired or invalid");
                    SessionStatus::Expired
                } else {
                    warn!(provider = "xai", status = %status, "unexpected status from validation");
                    SessionStatus::Unknown
                }
            }
            Err(e) => {
                error!(provider = "xai", error = %e, "validation request failed");
                SessionStatus::Unknown
            }
        }
    }

    // ── Session refresh via browser proxy ──────────────────────────────────────

    /// Ask the browser proxy to re-login to the provider and extract fresh cookies.
    ///
    /// The browser proxy (gemini-browser-proxy on :3001) handles headless Chrome automation:
    /// 1. Navigates to the provider's login page
    /// 2. Uses stored persistent context (or prompts for manual login)
    /// 3. Extracts the required cookies after successful auth
    ///
    /// # Returns
    /// A map of cookie name → cookie value for the requested provider.
    pub async fn refresh_session_via_browser(
        &self,
        provider: SessionProvider,
    ) -> Result<HashMap<String, String>> {
        let config = self
            .configs
            .get(&provider)
            .context("no config for provider")?;

        let proxy_url = self.effective_proxy_url(provider);
        let refresh_url = format!("{proxy_url}/api/session/refresh");

        info!(
            provider = %provider,
            proxy_url = %proxy_url,
            "requesting session refresh via browser proxy"
        );

        let payload = serde_json::json!({
            "provider": provider.to_string(),
            "cookie_names": config.cookie_names,
        });

        let resp = self
            .http
            .post(&refresh_url)
            .json(&payload)
            .timeout(Duration::from_secs(120)) // browser automation can be slow
            .send()
            .await
            .context("failed to reach browser proxy for session refresh")?;

        let status = resp.status();
        if !status.is_success() {
            let body = resp.text().await.unwrap_or_default();
            anyhow::bail!(
                "browser proxy returned {status} for {provider} refresh: {body}"
            );
        }

        let body: BrowserRefreshResponse = resp
            .json()
            .await
            .context("failed to parse browser proxy refresh response")?;

        if !body.success {
            let reason = body.error.unwrap_or_else(|| "unknown error".to_string());
            anyhow::bail!("browser proxy refresh failed for {provider}: {reason}");
        }

        // Verify we got all the required cookies
        let mut missing: Vec<&str> = Vec::new();
        for name in &config.cookie_names {
            if !body.cookies.contains_key(name) {
                missing.push(name);
            }
        }
        if !missing.is_empty() {
            warn!(
                provider = %provider,
                missing = ?missing,
                "browser proxy refresh succeeded but some cookies are missing"
            );
        }

        info!(
            provider = %provider,
            cookie_count = body.cookies.len(),
            "session refresh successful"
        );

        Ok(body.cookies)
    }

    // ── Utility helpers ────────────────────────────────────────────────────────

    /// Extract a named value from a semicolon-separated cookie string.
    ///
    /// e.g., `extract_cookie_value("auth_token=abc; ct0=xyz", "ct0")` → `Some("xyz")`
    fn extract_cookie_value(cookie_str: &str, name: &str) -> Option<String> {
        cookie_str.split(';').find_map(|pair| {
            let pair = pair.trim();
            let (key, value) = pair.split_once('=')?;
            if key.trim() == name {
                Some(value.trim().to_string())
            } else {
                None
            }
        })
    }

    /// Try to extract the `exp` claim from a JWT token to estimate remaining validity.
    ///
    /// JWTs are base64url(header).base64url(payload).signature — we decode the payload
    /// and look for the `exp` field (Unix timestamp).
    fn extract_jwt_expiry(token: &str) -> Option<Duration> {
        let parts: Vec<&str> = token.split('.').collect();
        if parts.len() != 3 {
            return None;
        }

        // Decode the payload (second part) — base64url without padding
        let payload_b64 = parts[1];
        let payload_bytes = base64_url_decode(payload_b64)?;
        let payload: serde_json::Value = serde_json::from_slice(&payload_bytes).ok()?;

        let exp = payload.get("exp")?.as_u64()?;
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .ok()?
            .as_secs();

        if exp > now {
            Some(Duration::from_secs(exp - now))
        } else {
            None // already expired
        }
    }
}

/// Decode a base64url string (no padding) into bytes.
fn base64_url_decode(input: &str) -> Option<Vec<u8>> {
    // base64url: replace `-` with `+`, `_` with `/`, add padding
    let mut s = input.replace('-', "+").replace('_', "/");
    match s.len() % 4 {
        2 => s.push_str("=="),
        3 => s.push('='),
        0 => {}
        _ => return None,
    }

    use base64::Engine;
    base64::engine::general_purpose::STANDARD.decode(&s).ok()
}

// ── SessionRefreshTask ─────────────────────────────────────────────────────────

/// Spawn a background task that periodically validates and refreshes sessions.
///
/// For each session provider:
/// 1. Fetch current credentials from Vault via HTTP
/// 2. Validate against the provider's API
/// 3. If expired/invalid → attempt browser proxy refresh
/// 4. If refresh succeeds → store new credentials in Vault
/// 5. If refresh fails 3 consecutive times → log error, emit warning, back off
///
/// # Arguments
/// * `vault_url` — Base URL of the Vault HTTP interface (e.g., `"http://localhost:5190"`)
/// * `browser_proxy_url` — Base URL of the browser proxy (e.g., `"http://localhost:3001"`)
///
/// # Returns
/// A `JoinHandle` for the background task (can be aborted on shutdown).
pub fn spawn_refresh_task(
    vault_url: String,
    browser_proxy_url: String,
) -> tokio::task::JoinHandle<()> {
    tokio::spawn(async move {
        info!("session refresh task started");

        let manager = SessionManager::new(Some(browser_proxy_url));
        let http = reqwest::Client::builder()
            .timeout(Duration::from_secs(15))
            .build()
            .unwrap_or_default();

        // Track consecutive failures per provider for backoff
        let mut failure_counts: HashMap<SessionProvider, u32> = HashMap::new();

        // Use the shortest refresh interval as the tick period
        let tick_interval = manager
            .configs
            .values()
            .map(|c| c.refresh_interval)
            .min()
            .unwrap_or(Duration::from_secs(30 * 60));

        let mut interval = tokio::time::interval(tick_interval);
        // Don't immediately fire on first tick — let the app start up
        interval.tick().await;

        loop {
            interval.tick().await;

            for (&provider, config) in &manager.configs {
                let failures = failure_counts.get(&provider).copied().unwrap_or(0);

                // Back off if we've failed too many times (exponential: skip 2^failures ticks)
                if failures >= 3 {
                    warn!(
                        provider = %provider,
                        failures = failures,
                        "skipping refresh — too many consecutive failures (backing off)"
                    );
                    // Reset after a long backoff period (failures resets to 0 after 10 cycles)
                    if failures >= 13 {
                        failure_counts.insert(provider, 0);
                    } else {
                        failure_counts.insert(provider, failures + 1);
                    }
                    continue;
                }

                // Step 1: Fetch current credentials from Vault
                let credentials = match fetch_vault_credentials(
                    &http,
                    &vault_url,
                    &config.vault_namespace,
                    &config.vault_service,
                )
                .await
                {
                    Ok(Some(creds)) => creds,
                    Ok(None) => {
                        debug!(
                            provider = %provider,
                            "no credentials in vault — skipping validation"
                        );
                        continue;
                    }
                    Err(e) => {
                        warn!(
                            provider = %provider,
                            error = %e,
                            "failed to fetch credentials from vault"
                        );
                        continue;
                    }
                };

                // Step 2: Build the token/cookie string for validation
                let token_or_cookies = build_validation_string(provider, &credentials);

                // Step 3: Validate the current session
                let status = manager
                    .validate_session(provider, &token_or_cookies)
                    .await;

                match &status {
                    SessionStatus::Valid { expires_in } => {
                        debug!(
                            provider = %provider,
                            expires_in = ?expires_in,
                            "session valid"
                        );
                        failure_counts.insert(provider, 0);
                    }
                    SessionStatus::Expired | SessionStatus::Invalid { .. } => {
                        info!(
                            provider = %provider,
                            status = ?status,
                            "session needs refresh — triggering browser proxy"
                        );

                        // Step 4: Attempt refresh via browser proxy
                        match manager.refresh_session_via_browser(provider).await {
                            Ok(new_cookies) => {
                                // Step 5: Store refreshed credentials in Vault
                                if let Err(e) = store_vault_credentials(
                                    &http,
                                    &vault_url,
                                    &config.vault_namespace,
                                    &config.vault_service,
                                    &new_cookies,
                                )
                                .await
                                {
                                    error!(
                                        provider = %provider,
                                        error = %e,
                                        "failed to store refreshed credentials in vault"
                                    );
                                    *failure_counts.entry(provider).or_insert(0) += 1;
                                } else {
                                    info!(
                                        provider = %provider,
                                        "session refreshed and stored in vault"
                                    );
                                    failure_counts.insert(provider, 0);
                                }
                            }
                            Err(e) => {
                                let count = failure_counts.entry(provider).or_insert(0);
                                *count += 1;
                                error!(
                                    provider = %provider,
                                    error = %e,
                                    consecutive_failures = *count,
                                    "session refresh via browser proxy failed"
                                );
                            }
                        }
                    }
                    SessionStatus::Unknown => {
                        debug!(
                            provider = %provider,
                            "session status unknown — will retry next tick"
                        );
                    }
                }
            }
        }
    })
}

// ── Vault HTTP helpers (used by the refresh task) ──────────────────────────────

/// Fetch credentials from Vault via its HTTP API.
///
/// Uses `vault_get` semantics — returns masked values by default, but the refresh
/// task needs the actual values for validation, so it requests unmask.
async fn fetch_vault_credentials(
    http: &reqwest::Client,
    vault_url: &str,
    namespace: &str,
    service: &str,
) -> Result<Option<HashMap<String, String>>> {
    let url = format!("{vault_url}/api/vault/get");
    let payload = serde_json::json!({
        "namespace": namespace,
        "service": service,
        "unmask": true,
    });

    let resp = http
        .post(&url)
        .json(&payload)
        .send()
        .await
        .context("vault get request failed")?;

    if resp.status() == reqwest::StatusCode::NOT_FOUND {
        return Ok(None);
    }

    if !resp.status().is_success() {
        let body = resp.text().await.unwrap_or_default();
        anyhow::bail!("vault get returned error: {body}");
    }

    let body: serde_json::Value = resp.json().await.context("failed to parse vault response")?;

    // Extract the data fields from the vault response
    if let Some(data) = body.get("data").and_then(|d| d.as_object()) {
        let map: HashMap<String, String> = data
            .iter()
            .filter_map(|(k, v)| v.as_str().map(|s| (k.clone(), s.to_string())))
            .collect();
        Ok(Some(map))
    } else {
        Ok(None)
    }
}

/// Store credentials in Vault via its HTTP API.
async fn store_vault_credentials(
    http: &reqwest::Client,
    vault_url: &str,
    namespace: &str,
    service: &str,
    credentials: &HashMap<String, String>,
) -> Result<()> {
    let url = format!("{vault_url}/api/vault/set");
    let payload = serde_json::json!({
        "namespace": namespace,
        "service": service,
        "data": credentials,
    });

    let resp = http
        .post(&url)
        .json(&payload)
        .send()
        .await
        .context("vault set request failed")?;

    if !resp.status().is_success() {
        let body = resp.text().await.unwrap_or_default();
        anyhow::bail!("vault set returned error: {body}");
    }

    Ok(())
}

/// Build a validation string (token or cookie header) from Vault credentials.
fn build_validation_string(
    provider: SessionProvider,
    credentials: &HashMap<String, String>,
) -> String {
    match provider {
        SessionProvider::OpenAI => {
            // OpenAI: use the session_token field directly as a Bearer token
            credentials
                .get("session_token")
                .cloned()
                .unwrap_or_default()
        }
        SessionProvider::Xai => {
            // xAI: build a Cookie header from individual cookie fields
            let parts: Vec<String> = ["auth_token", "ct0", "twid"]
                .iter()
                .filter_map(|name| {
                    credentials
                        .get(*name)
                        .map(|val| format!("{name}={val}"))
                })
                .collect();
            parts.join("; ")
        }
    }
}

// ── Tests ──────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_session_provider_display() {
        assert_eq!(SessionProvider::OpenAI.to_string(), "openai");
        assert_eq!(SessionProvider::Xai.to_string(), "xai");
    }

    #[test]
    fn test_openai_config_defaults() {
        let config = SessionManager::openai_config();
        assert_eq!(config.provider, SessionProvider::OpenAI);
        assert_eq!(
            config.cookie_names,
            vec!["__Secure-next-auth.session-token"]
        );
        assert_eq!(config.refresh_interval, Duration::from_secs(30 * 60));
        assert_eq!(
            config.validation_url,
            "https://chatgpt.com/backend-api/me"
        );
        assert_eq!(config.vault_namespace, "ai_providers");
        assert_eq!(config.vault_service, "openai_session");
        assert!(config.browser_proxy_url.is_none());
    }

    #[test]
    fn test_xai_config_defaults() {
        let config = SessionManager::xai_config();
        assert_eq!(config.provider, SessionProvider::Xai);
        assert_eq!(
            config.cookie_names,
            vec!["auth_token", "ct0", "twid"]
        );
        assert_eq!(config.refresh_interval, Duration::from_secs(60 * 60));
        assert_eq!(
            config.validation_url,
            "https://grok.x.com/rest/app-chat/conversations"
        );
        assert_eq!(config.vault_namespace, "ai_providers");
        assert_eq!(config.vault_service, "xai_grok");
    }

    #[test]
    fn test_session_manager_new_defaults() {
        let mgr = SessionManager::new(None);
        assert_eq!(mgr.browser_proxy_url, "http://localhost:3001");
        assert!(mgr.configs.contains_key(&SessionProvider::OpenAI));
        assert!(mgr.configs.contains_key(&SessionProvider::Xai));
    }

    #[test]
    fn test_session_manager_new_custom_proxy() {
        let mgr = SessionManager::new(Some("http://proxy:4000".to_string()));
        assert_eq!(mgr.browser_proxy_url, "http://proxy:4000");
    }

    #[test]
    fn test_extract_cookie_value() {
        let cookies = "auth_token=abc123; ct0=csrf_xyz; twid=u%3D12345";
        assert_eq!(
            SessionManager::extract_cookie_value(cookies, "auth_token"),
            Some("abc123".to_string())
        );
        assert_eq!(
            SessionManager::extract_cookie_value(cookies, "ct0"),
            Some("csrf_xyz".to_string())
        );
        assert_eq!(
            SessionManager::extract_cookie_value(cookies, "twid"),
            Some("u%3D12345".to_string())
        );
        assert_eq!(
            SessionManager::extract_cookie_value(cookies, "nonexistent"),
            None
        );
    }

    #[test]
    fn test_extract_jwt_expiry_valid() {
        // Craft a JWT with exp = now + 3600 seconds
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs();
        let exp = now + 3600;

        let header = base64_url_encode(b"{\"alg\":\"HS256\",\"typ\":\"JWT\"}");
        let payload_json = format!("{{\"sub\":\"test\",\"exp\":{exp}}}");
        let payload = base64_url_encode(payload_json.as_bytes());
        let token = format!("{header}.{payload}.fakesignature");

        let result = SessionManager::extract_jwt_expiry(&token);
        assert!(result.is_some());
        let dur = result.unwrap();
        // Should be roughly 3600 seconds (allow 5s tolerance for test execution)
        assert!(dur.as_secs() >= 3595 && dur.as_secs() <= 3605);
    }

    #[test]
    fn test_extract_jwt_expiry_expired() {
        let header = base64_url_encode(b"{\"alg\":\"HS256\"}");
        let payload = base64_url_encode(b"{\"exp\":1000000000}"); // year 2001
        let token = format!("{header}.{payload}.sig");

        let result = SessionManager::extract_jwt_expiry(&token);
        assert!(result.is_none()); // expired → None
    }

    #[test]
    fn test_extract_jwt_expiry_invalid_token() {
        assert!(SessionManager::extract_jwt_expiry("not-a-jwt").is_none());
        assert!(SessionManager::extract_jwt_expiry("a.b").is_none());
        assert!(SessionManager::extract_jwt_expiry("").is_none());
    }

    #[test]
    fn test_build_validation_string_openai() {
        let mut creds = HashMap::new();
        creds.insert("session_token".to_string(), "jwt_token_here".to_string());
        let result = build_validation_string(SessionProvider::OpenAI, &creds);
        assert_eq!(result, "jwt_token_here");
    }

    #[test]
    fn test_build_validation_string_xai() {
        let mut creds = HashMap::new();
        creds.insert("auth_token".to_string(), "aaa".to_string());
        creds.insert("ct0".to_string(), "bbb".to_string());
        creds.insert("twid".to_string(), "ccc".to_string());
        let result = build_validation_string(SessionProvider::Xai, &creds);
        assert!(result.contains("auth_token=aaa"));
        assert!(result.contains("ct0=bbb"));
        assert!(result.contains("twid=ccc"));
    }

    #[test]
    fn test_build_validation_string_missing_keys() {
        let creds = HashMap::new();
        let result = build_validation_string(SessionProvider::OpenAI, &creds);
        assert_eq!(result, ""); // empty when key is missing

        let result = build_validation_string(SessionProvider::Xai, &creds);
        assert_eq!(result, ""); // empty when all cookies missing
    }

    #[test]
    fn test_session_status_serialization() {
        let valid = SessionStatus::Valid {
            expires_in: Some(Duration::from_secs(3600)),
        };
        let json = serde_json::to_string(&valid).unwrap();
        assert!(json.contains("\"status\":\"valid\""));
        assert!(json.contains("\"expires_in\":3600"));

        let expired = SessionStatus::Expired;
        let json = serde_json::to_string(&expired).unwrap();
        assert!(json.contains("\"status\":\"expired\""));

        let invalid = SessionStatus::Invalid {
            reason: "token revoked".to_string(),
        };
        let json = serde_json::to_string(&invalid).unwrap();
        assert!(json.contains("\"status\":\"invalid\""));
        assert!(json.contains("token revoked"));
    }

    /// Helper: base64url encode (for test JWT construction).
    fn base64_url_encode(data: &[u8]) -> String {
        use base64::Engine;
        base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(data)
    }
}
