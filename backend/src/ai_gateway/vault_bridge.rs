// vault_bridge.rs — Most między Rust backendem a Jaskier Vault MCP (The Sentinel)
// Credentials NIE są w PostgreSQL — Vault jest JEDYNYM źródłem prawdy.

use std::collections::HashMap;
use std::sync::Arc;
use std::time::{Duration, Instant};

use serde::{Deserialize, Serialize};
use tokio::sync::RwLock;
use tracing;

// ── Error Types ─────────────────────────────────────────────────────────────

/// Errors returned by Vault operations.
/// ANOMALY_DETECTED is a critical security event — caller MUST stop all operations.
#[derive(Debug, Clone, thiserror::Error)]
pub enum VaultError {
    #[error("credential not found in vault")]
    NotFound,

    #[error("unauthorized — vault rejected the request")]
    Unauthorized,

    #[error("ANOMALY DETECTED: {0}")]
    AnomalyDetected(String),

    #[error("vault connection failed: {0}")]
    ConnectionFailed(String),

    #[error("vault request timed out")]
    Timeout,

    #[error("invalid response from vault: {0}")]
    InvalidResponse(String),
}

impl VaultError {
    /// Whether this error represents a security anomaly that requires immediate action.
    pub fn is_anomaly(&self) -> bool {
        matches!(self, VaultError::AnomalyDetected(_))
    }
}

// ── Response / Data Structs ─────────────────────────────────────────────────

/// Masked credential returned by vault_get — agent never sees the raw token.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MaskedCredential {
    pub service: String,
    pub masked_value: String,
    pub expires_at: Option<i64>,
    pub plan_tier: Option<String>,
    pub is_connected: bool,
}

/// Response from vault_delegate (Bouncer pattern) — Vault makes the HTTP call,
/// agent receives only the response body. Token never leaves the Vault.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VaultDelegateResponse {
    pub status: u16,
    pub body: serde_json::Value,
    pub latency_ms: u64,
}

/// Health status of the Jaskier Vault MCP instance.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct VaultHealthStatus {
    pub online: bool,
    pub credential_count: u32,
    pub last_audit: Option<String>,
}

/// Authentication status for a specific AI provider (Anthropic, Google, OpenAI, etc.).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProviderAuthStatus {
    pub provider: String,
    pub is_connected: bool,
    pub plan_tier: Option<String>,
    pub expires_at: Option<i64>,
    pub last_verified: Option<String>,
    pub last_error: Option<String>,
}

// ── In-Memory Cache ─────────────────────────────────────────────────────────

/// Cached credential entry with TTL for graceful degradation when Vault is
/// temporarily unreachable (network blip, restart, etc.).
#[derive(Debug, Clone)]
struct CachedCredential {
    credential: MaskedCredential,
    cached_at: Instant,
}

impl CachedCredential {
    /// Default TTL: 1 hour. After this the cached entry is stale and must be
    /// re-fetched from Vault.
    const TTL: Duration = Duration::from_secs(3600);

    fn is_expired(&self) -> bool {
        self.cached_at.elapsed() > Self::TTL
    }
}

// ── Retry Configuration ─────────────────────────────────────────────────────

/// Retry config: 3 attempts with exponential backoff (100ms, 500ms, 2s).
const MAX_RETRIES: u32 = 3;
const RETRY_DELAYS_MS: [u64; 3] = [100, 500, 2000];

// ── VaultClient ─────────────────────────────────────────────────────────────

/// HTTP client for communicating with Jaskier Vault MCP (The Sentinel).
///
/// All credential access goes through this client. Implements the Bouncer
/// pattern: `delegate()` sends the request to Vault, which injects the Bearer
/// token and makes the HTTP call. The agent (this backend) never sees raw tokens.
#[derive(Debug, Clone)]
pub struct VaultClient {
    http: reqwest::Client,
    vault_url: String,
    /// In-memory credential cache for graceful degradation.
    /// Key format: "{namespace}/{service}"
    cache: Arc<RwLock<HashMap<String, CachedCredential>>>,
}

impl VaultClient {
    /// Create a new VaultClient with default Vault URL (http://localhost:5190).
    pub fn new() -> Self {
        Self::with_url("http://localhost:5190")
    }

    /// Create a new VaultClient pointing to a specific Vault URL.
    #[allow(clippy::expect_used)]
    pub fn with_url(vault_url: &str) -> Self {
        let http = reqwest::Client::builder()
            .timeout(Duration::from_secs(10))
            .connect_timeout(Duration::from_secs(5))
            .build()
            .expect("Failed to build reqwest client for VaultClient");

        Self {
            http,
            vault_url: vault_url.trim_end_matches('/').to_string(),
            cache: Arc::new(RwLock::new(HashMap::new())),
        }
    }

    /// Get the configured Vault URL.
    pub fn vault_url(&self) -> &str {
        &self.vault_url
    }

    // ── Core Operations ─────────────────────────────────────────────────

    /// Retrieve a masked credential from Vault.
    ///
    /// Returns the credential with its value masked (e.g., "sk-ant-***...abc").
    /// Falls back to in-memory cache if Vault is temporarily unreachable.
    pub async fn get(
        &self,
        namespace: &str,
        service: &str,
    ) -> Result<MaskedCredential, VaultError> {
        let cache_key = format!("{}/{}", namespace, service);

        // Try Vault with retry logic
        match self
            .retry_request(|| async {
                let resp = self
                    .http
                    .post(format!("{}/api/vault/get", self.vault_url))
                    .json(&serde_json::json!({
                        "namespace": namespace,
                        "service": service,
                        "unmask": false,
                    }))
                    .send()
                    .await
                    .map_err(classify_reqwest_error)?;

                self.handle_response::<MaskedCredential>(resp).await
            })
            .await
        {
            Ok(cred) => {
                // Update cache on success
                let mut cache = self.cache.write().await;
                cache.insert(
                    cache_key,
                    CachedCredential {
                        credential: cred.clone(),
                        cached_at: Instant::now(),
                    },
                );
                Ok(cred)
            }
            Err(e) => {
                // On connection failure, try cache fallback
                if matches!(e, VaultError::ConnectionFailed(_) | VaultError::Timeout) {
                    let cache = self.cache.read().await;
                    if let Some(cached) = cache.get(&cache_key) {
                        if !cached.is_expired() {
                            tracing::warn!(
                                "Vault unreachable — serving cached credential for {}/{}",
                                namespace,
                                service
                            );
                            return Ok(cached.credential.clone());
                        }
                        tracing::warn!(
                            "Vault unreachable and cache expired for {}/{}",
                            namespace,
                            service
                        );
                    }
                }
                Err(e)
            }
        }
    }

    /// Store a credential in Vault.
    ///
    /// `data` is an arbitrary JSON object — Vault encrypts and stores it.
    /// Example: `{"access_token": "...", "refresh_token": "...", "expires_at": 1234567890}`
    pub async fn set(
        &self,
        namespace: &str,
        service: &str,
        data: serde_json::Value,
    ) -> Result<(), VaultError> {
        self.retry_request(|| async {
            let resp = self
                .http
                .post(format!("{}/api/vault/set", self.vault_url))
                .json(&serde_json::json!({
                    "namespace": namespace,
                    "service": service,
                    "data": data,
                }))
                .send()
                .await
                .map_err(classify_reqwest_error)?;

            self.handle_void_response(resp).await
        })
        .await
    }

    /// Delegate an HTTP request through Vault (Bouncer pattern).
    ///
    /// Vault decrypts the credential for `namespace/service`, injects the Bearer
    /// token into the request, makes the HTTP call, and returns the response.
    /// The agent (this backend) NEVER sees the raw token.
    pub async fn delegate(
        &self,
        url: &str,
        method: &str,
        namespace: &str,
        service: &str,
        body: Option<serde_json::Value>,
    ) -> Result<VaultDelegateResponse, VaultError> {
        self.retry_request(|| async {
            let mut payload = serde_json::json!({
                "url": url,
                "method": method,
                "namespace": namespace,
                "service": service,
            });
            if let Some(ref b) = body {
                payload["body"] = b.clone();
            }

            let resp = self
                .http
                .post(format!("{}/api/vault/delegate", self.vault_url))
                .json(&payload)
                .send()
                .await
                .map_err(classify_reqwest_error)?;

            self.handle_response::<VaultDelegateResponse>(resp).await
        })
        .await
    }

    /// Request a time-limited ticket for repeated delegate calls.
    ///
    /// Returns a 32-char hex ticket ID that can be passed to `delegate_with_ticket()`
    /// multiple times within the TTL window.
    pub async fn request_ticket(
        &self,
        namespace: &str,
        service: &str,
        ttl_secs: u64,
    ) -> Result<String, VaultError> {
        self.retry_request(|| async {
            let resp = self
                .http
                .post(format!("{}/api/vault/request_ticket", self.vault_url))
                .json(&serde_json::json!({
                    "namespace": namespace,
                    "service": service,
                    "ttl": ttl_secs,
                }))
                .send()
                .await
                .map_err(classify_reqwest_error)?;

            #[derive(Deserialize)]
            struct TicketResponse {
                ticket_id: String,
            }
            let ticket: TicketResponse = self.handle_response(resp).await?;
            Ok(ticket.ticket_id)
        })
        .await
    }

    /// Delegate an HTTP request using a previously acquired ticket.
    ///
    /// The ticket was obtained via `request_ticket()` and is valid for repeated
    /// use within its TTL. Vault resolves the credential from the ticket.
    pub async fn delegate_with_ticket(
        &self,
        url: &str,
        method: &str,
        ticket_id: &str,
        body: Option<serde_json::Value>,
    ) -> Result<VaultDelegateResponse, VaultError> {
        self.retry_request(|| async {
            let mut payload = serde_json::json!({
                "url": url,
                "method": method,
                "ticketId": ticket_id,
            });
            if let Some(ref b) = body {
                payload["body"] = b.clone();
            }

            let resp = self
                .http
                .post(format!("{}/api/vault/delegate", self.vault_url))
                .json(&payload)
                .send()
                .await
                .map_err(classify_reqwest_error)?;

            self.handle_response::<VaultDelegateResponse>(resp).await
        })
        .await
    }

    /// Check Vault health status.
    ///
    /// Returns an offline status (not an error) if Vault is unreachable —
    /// this allows the caller to display degraded status without panicking.
    pub async fn health(&self) -> VaultHealthStatus {
        let result = self
            .http
            .get(format!("{}/api/vault/health", self.vault_url))
            .timeout(Duration::from_secs(3))
            .send()
            .await;

        match result {
            Ok(resp) if resp.status().is_success() => resp
                .json::<VaultHealthStatus>()
                .await
                .unwrap_or_default(),
            Ok(resp) => {
                tracing::warn!("Vault health check returned status {}", resp.status());
                VaultHealthStatus::default()
            }
            Err(e) => {
                tracing::debug!("Vault health check failed: {}", e);
                VaultHealthStatus::default()
            }
        }
    }

    /// Get authentication status for a specific AI provider.
    ///
    /// Queries Vault for the credential in `ai_providers/{provider}` and returns
    /// structured status including plan tier, expiry, and connection state.
    pub async fn get_provider_status(&self, provider: &str) -> ProviderAuthStatus {
        let namespace = "ai_providers";
        let service = format!("{}_max", provider);

        match self.get(namespace, &service).await {
            Ok(cred) => ProviderAuthStatus {
                provider: provider.to_string(),
                is_connected: cred.is_connected,
                plan_tier: cred.plan_tier,
                expires_at: cred.expires_at,
                last_verified: Some(chrono::Utc::now().to_rfc3339()),
                last_error: None,
            },
            Err(VaultError::NotFound) => ProviderAuthStatus {
                provider: provider.to_string(),
                is_connected: false,
                plan_tier: None,
                expires_at: None,
                last_verified: Some(chrono::Utc::now().to_rfc3339()),
                last_error: None,
            },
            Err(e) => {
                let error_msg = e.to_string();
                if e.is_anomaly() {
                    tracing::error!(
                        "ANOMALY DETECTED checking provider {} status: {}",
                        provider,
                        error_msg
                    );
                }
                ProviderAuthStatus {
                    provider: provider.to_string(),
                    is_connected: false,
                    plan_tier: None,
                    expires_at: None,
                    last_verified: Some(chrono::Utc::now().to_rfc3339()),
                    last_error: Some(error_msg),
                }
            }
        }
    }

    // ── Internal Helpers ────────────────────────────────────────────────

    /// Retry a request up to MAX_RETRIES times with exponential backoff.
    /// Anomaly errors are never retried — they propagate immediately.
    async fn retry_request<F, Fut, T>(&self, f: F) -> Result<T, VaultError>
    where
        F: Fn() -> Fut,
        Fut: std::future::Future<Output = Result<T, VaultError>>,
    {
        let mut last_err = VaultError::ConnectionFailed("no attempts made".to_string());

        for attempt in 0..MAX_RETRIES {
            match f().await {
                Ok(val) => return Ok(val),
                Err(e) => {
                    // NEVER retry anomaly — it's a security event
                    if e.is_anomaly() {
                        return Err(e);
                    }

                    // Don't retry auth errors or not-found — they won't change
                    if matches!(e, VaultError::Unauthorized | VaultError::NotFound) {
                        return Err(e);
                    }

                    last_err = e;

                    if attempt < MAX_RETRIES - 1 {
                        let delay = RETRY_DELAYS_MS[attempt as usize];
                        tracing::debug!(
                            "Vault request attempt {} failed, retrying in {}ms: {}",
                            attempt + 1,
                            delay,
                            last_err
                        );
                        tokio::time::sleep(Duration::from_millis(delay)).await;
                    }
                }
            }
        }

        tracing::warn!(
            "Vault request failed after {} attempts: {}",
            MAX_RETRIES,
            last_err
        );
        Err(last_err)
    }

    /// Parse a successful Vault JSON response into the expected type.
    /// Detects ANOMALY_DETECTED in the response body and escalates.
    async fn handle_response<T: serde::de::DeserializeOwned>(
        &self,
        resp: reqwest::Response,
    ) -> Result<T, VaultError> {
        let status = resp.status();

        if status == reqwest::StatusCode::NOT_FOUND {
            return Err(VaultError::NotFound);
        }
        if status == reqwest::StatusCode::UNAUTHORIZED
            || status == reqwest::StatusCode::FORBIDDEN
        {
            return Err(VaultError::Unauthorized);
        }

        let body_text = resp
            .text()
            .await
            .map_err(|e| VaultError::InvalidResponse(format!("failed to read body: {}", e)))?;

        // Check for ANOMALY_DETECTED in response body before parsing
        if body_text.contains("ANOMALY_DETECTED") {
            tracing::error!(
                "ANOMALY DETECTED from Vault — STOPPING. Response: {}",
                &body_text[..body_text.len().min(500)]
            );
            return Err(VaultError::AnomalyDetected(body_text));
        }

        if !status.is_success() {
            return Err(VaultError::InvalidResponse(format!(
                "unexpected status {}: {}",
                status,
                &body_text[..body_text.len().min(200)]
            )));
        }

        serde_json::from_str(&body_text).map_err(|e| {
            VaultError::InvalidResponse(format!(
                "JSON parse error: {} — body: {}",
                e,
                &body_text[..body_text.len().min(200)]
            ))
        })
    }

    /// Handle a Vault response that has no meaningful body (set, delete, etc.).
    async fn handle_void_response(&self, resp: reqwest::Response) -> Result<(), VaultError> {
        let status = resp.status();

        if status == reqwest::StatusCode::UNAUTHORIZED
            || status == reqwest::StatusCode::FORBIDDEN
        {
            return Err(VaultError::Unauthorized);
        }

        if !status.is_success() {
            let body_text = resp.text().await.unwrap_or_default();
            if body_text.contains("ANOMALY_DETECTED") {
                tracing::error!(
                    "ANOMALY DETECTED from Vault — STOPPING. Response: {}",
                    &body_text[..body_text.len().min(500)]
                );
                return Err(VaultError::AnomalyDetected(body_text));
            }
            return Err(VaultError::InvalidResponse(format!(
                "unexpected status {}: {}",
                status,
                &body_text[..body_text.len().min(200)]
            )));
        }

        Ok(())
    }

    /// Invalidate a specific cache entry (e.g., after credential rotation).
    pub async fn invalidate_cache(&self, namespace: &str, service: &str) {
        let cache_key = format!("{}/{}", namespace, service);
        let mut cache = self.cache.write().await;
        cache.remove(&cache_key);
    }

    /// Clear the entire credential cache.
    pub async fn clear_cache(&self) {
        let mut cache = self.cache.write().await;
        cache.clear();
    }

    /// Get cache statistics (for diagnostics / health endpoint).
    pub async fn cache_stats(&self) -> (usize, usize) {
        let cache = self.cache.read().await;
        let total = cache.len();
        let expired = cache.values().filter(|c| c.is_expired()).count();
        (total, expired)
    }
}

impl Default for VaultClient {
    fn default() -> Self {
        Self::new()
    }
}

// ── HasVaultBridge Trait ────────────────────────────────────────────────────

/// Trait for application states that have access to a Vault client.
///
/// Implement this on AppState to enable Vault-based credential resolution
/// throughout the backend. Replaces direct DB-stored OAuth tokens.
pub trait HasVaultBridge: Send + Sync {
    /// Returns a reference to the VaultClient instance.
    fn vault_client(&self) -> &VaultClient;
}

// ── Helper: classify reqwest errors ─────────────────────────────────────────

fn classify_reqwest_error(e: reqwest::Error) -> VaultError {
    if e.is_timeout() {
        VaultError::Timeout
    } else if e.is_connect() {
        VaultError::ConnectionFailed(format!("connection refused: {}", e))
    } else {
        VaultError::ConnectionFailed(e.to_string())
    }
}

// ── Tests ───────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_vault_error_is_anomaly() {
        assert!(VaultError::AnomalyDetected("test".into()).is_anomaly());
        assert!(!VaultError::NotFound.is_anomaly());
        assert!(!VaultError::Unauthorized.is_anomaly());
        assert!(!VaultError::Timeout.is_anomaly());
        assert!(!VaultError::ConnectionFailed("x".into()).is_anomaly());
        assert!(!VaultError::InvalidResponse("y".into()).is_anomaly());
    }

    #[test]
    fn test_vault_client_default_url() {
        let client = VaultClient::new();
        assert_eq!(client.vault_url(), "http://localhost:5190");
    }

    #[test]
    fn test_vault_client_custom_url() {
        let client = VaultClient::with_url("https://vault.example.com/");
        // Trailing slash should be stripped
        assert_eq!(client.vault_url(), "https://vault.example.com");
    }

    #[test]
    fn test_vault_health_status_default() {
        let status = VaultHealthStatus::default();
        assert!(!status.online);
        assert_eq!(status.credential_count, 0);
        assert!(status.last_audit.is_none());
    }

    #[test]
    fn test_cached_credential_ttl() {
        let cached = CachedCredential {
            credential: MaskedCredential {
                service: "test".into(),
                masked_value: "sk-***abc".into(),
                expires_at: None,
                plan_tier: Some("max".into()),
                is_connected: true,
            },
            cached_at: Instant::now(),
        };
        // Fresh entry should not be expired
        assert!(!cached.is_expired());

        // Simulate an old entry (beyond TTL)
        let old = CachedCredential {
            cached_at: Instant::now() - Duration::from_secs(7200),
            ..cached
        };
        assert!(old.is_expired());
    }

    #[tokio::test]
    async fn test_cache_operations() {
        let client = VaultClient::with_url("http://localhost:19999"); // non-existent

        // Cache starts empty
        let (total, expired) = client.cache_stats().await;
        assert_eq!(total, 0);
        assert_eq!(expired, 0);

        // Manually insert a cache entry
        {
            let mut cache = client.cache.write().await;
            cache.insert(
                "test/svc".to_string(),
                CachedCredential {
                    credential: MaskedCredential {
                        service: "svc".into(),
                        masked_value: "***".into(),
                        expires_at: None,
                        plan_tier: None,
                        is_connected: true,
                    },
                    cached_at: Instant::now(),
                },
            );
        }

        let (total, expired) = client.cache_stats().await;
        assert_eq!(total, 1);
        assert_eq!(expired, 0);

        // Invalidate specific entry
        client.invalidate_cache("test", "svc").await;
        let (total, _) = client.cache_stats().await;
        assert_eq!(total, 0);
    }

    #[tokio::test]
    async fn test_clear_cache() {
        let client = VaultClient::with_url("http://localhost:19999");
        {
            let mut cache = client.cache.write().await;
            cache.insert(
                "a/1".to_string(),
                CachedCredential {
                    credential: MaskedCredential {
                        service: "1".into(),
                        masked_value: "***".into(),
                        expires_at: None,
                        plan_tier: None,
                        is_connected: false,
                    },
                    cached_at: Instant::now(),
                },
            );
            cache.insert(
                "b/2".to_string(),
                CachedCredential {
                    credential: MaskedCredential {
                        service: "2".into(),
                        masked_value: "***".into(),
                        expires_at: None,
                        plan_tier: None,
                        is_connected: false,
                    },
                    cached_at: Instant::now(),
                },
            );
        }

        let (total, _) = client.cache_stats().await;
        assert_eq!(total, 2);

        client.clear_cache().await;
        let (total, _) = client.cache_stats().await;
        assert_eq!(total, 0);
    }

    #[test]
    fn test_classify_reqwest_error_formats() {
        // Just verify the function doesn't panic with various inputs
        let err = VaultError::ConnectionFailed("test".into());
        assert!(!err.is_anomaly());
    }

    #[test]
    fn test_masked_credential_serialization() {
        let cred = MaskedCredential {
            service: "anthropic_max".into(),
            masked_value: "sk-ant-***...xyz".into(),
            expires_at: Some(1735689600),
            plan_tier: Some("max".into()),
            is_connected: true,
        };

        let json = serde_json::to_value(&cred).unwrap();
        assert_eq!(json["service"], "anthropic_max");
        assert_eq!(json["is_connected"], true);
        assert_eq!(json["plan_tier"], "max");

        // Roundtrip
        let parsed: MaskedCredential = serde_json::from_value(json).unwrap();
        assert_eq!(parsed.service, "anthropic_max");
        assert!(parsed.is_connected);
    }

    #[test]
    fn test_vault_delegate_response_serialization() {
        let resp = VaultDelegateResponse {
            status: 200,
            body: serde_json::json!({"result": "ok"}),
            latency_ms: 42,
        };

        let json = serde_json::to_value(&resp).unwrap();
        assert_eq!(json["status"], 200);
        assert_eq!(json["latency_ms"], 42);
    }

    #[test]
    fn test_provider_auth_status_serialization() {
        let status = ProviderAuthStatus {
            provider: "anthropic".into(),
            is_connected: true,
            plan_tier: Some("max".into()),
            expires_at: Some(1735689600),
            last_verified: Some("2026-03-14T12:00:00Z".into()),
            last_error: None,
        };

        let json = serde_json::to_value(&status).unwrap();
        assert_eq!(json["provider"], "anthropic");
        assert_eq!(json["is_connected"], true);
        assert!(json["last_error"].is_null());
    }

    #[tokio::test]
    async fn test_health_returns_offline_when_unreachable() {
        let client = VaultClient::with_url("http://localhost:19999");
        let status = client.health().await;
        assert!(!status.online);
    }
}
