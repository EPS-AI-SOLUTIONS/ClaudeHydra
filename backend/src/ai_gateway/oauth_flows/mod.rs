// oauth_flows/ — Unified OAuth PKCE flows for all providers.
//
// Split into focused submodules:
// - `types` — OAuthProvider enum, PkceMethod, OAuthTokens, configs
// - `manager` — OAuthFlowManager (login, callback, refresh, cleanup)
// - `pkce` — PKCE utilities (random_base64url, sha256_base64url, parse_token_response)

mod types;
pub mod manager;
pub(crate) mod pkce;

// ── Public re-exports ────────────────────────────────────────────────────
pub use types::*;
pub use manager::OAuthFlowManager;

// ═══════════════════════════════════════════════════════════════════════════
//  Tests
// ═══════════════════════════════════════════════════════════════════════════

#[cfg(test)]
mod tests {
    use std::collections::HashMap;
    use std::time::{Duration, Instant};

    use serde_json::Value;

    use super::pkce::*;
    use super::types::*;
    use super::manager::OAuthFlowManager;

    // ── OAuthProvider Display + Serialize ──────────────────────────────────────

    #[test]
    fn ai_provider_display() {
        assert_eq!(OAuthProvider::Anthropic.to_string(), "anthropic");
        assert_eq!(OAuthProvider::Google.to_string(), "google");
        assert_eq!(OAuthProvider::GitHub.to_string(), "github");
        assert_eq!(OAuthProvider::Vercel.to_string(), "vercel");
    }

    #[test]
    fn ai_provider_serde_roundtrip() {
        let json = serde_json::to_string(&OAuthProvider::Anthropic).unwrap();
        assert_eq!(json, r#""anthropic""#);
        let back: OAuthProvider = serde_json::from_str(&json).unwrap();
        assert_eq!(back, OAuthProvider::Anthropic);
    }

    #[test]
    fn ai_provider_hash_eq() {
        let mut map = HashMap::new();
        map.insert(OAuthProvider::Google, "test");
        assert_eq!(map.get(&OAuthProvider::Google), Some(&"test"));
        assert_eq!(map.get(&OAuthProvider::Anthropic), None);
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
            provider: OAuthProvider::Google,
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
        assert_eq!(cfg.provider, OAuthProvider::Anthropic);
        assert_eq!(cfg.authorize_url, "https://claude.ai/oauth/authorize");
        assert_eq!(cfg.token_url, "https://console.anthropic.com/v1/oauth/token");
        assert_eq!(cfg.redirect_uri, "https://console.anthropic.com/oauth/code/callback");
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
        assert!(mgr.has_provider(OAuthProvider::Anthropic));
    }

    #[test]
    fn manager_register_provider() {
        let mut mgr = OAuthFlowManager::new(reqwest::Client::new());
        assert!(!mgr.has_provider(OAuthProvider::GitHub));

        mgr.register_provider(OAuthProviderConfig {
            provider: OAuthProvider::GitHub,
            authorize_url: "https://github.com/login/oauth/authorize".into(),
            token_url: "https://github.com/login/oauth/access_token".into(),
            redirect_uri: "http://localhost:8082/api/auth/github/callback".into(),
            client_id: "gh-client-id".into(),
            client_secret: Some("gh-secret".into()),
            scopes: vec!["repo".into(), "user".into()],
            pkce_method: PkceMethod::S256,
            extra_params: HashMap::new(),
        });

        assert!(mgr.has_provider(OAuthProvider::GitHub));
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
        let resp = mgr.initiate_login(OAuthProvider::Anthropic).await.unwrap();

        assert_eq!(resp.provider, OAuthProvider::Anthropic);
        assert!(!resp.state.is_empty());

        let parsed = url::Url::parse(&resp.authorize_url).unwrap();
        assert_eq!(parsed.scheme(), "https");
        assert_eq!(parsed.host_str(), Some("claude.ai"));

        let params: HashMap<_, _> = parsed.query_pairs().collect();
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

        let resp = mgr.initiate_login(OAuthProvider::Anthropic).await.unwrap();
        assert_eq!(mgr.pending_states_count().await, 1);

        let states = mgr.pkce_states.read().await;
        let pkce = states.get(&resp.state).unwrap();
        assert_eq!(pkce.provider, OAuthProvider::Anthropic);
        assert!(!pkce.code_verifier.is_empty());
    }

    #[tokio::test]
    async fn initiate_login_unconfigured_provider_errors() {
        let mgr = OAuthFlowManager::new(reqwest::Client::new());
        let result = mgr.initiate_login(OAuthProvider::GitHub).await;
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
        let resp = mgr.initiate_login(OAuthProvider::Anthropic).await.unwrap();
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
                    provider: OAuthProvider::Anthropic,
                    created_at: Instant::now() - Duration::from_secs(700),
                },
            );
            states.insert(
                "fresh-state".to_string(),
                PkceState {
                    code_verifier: "v2".into(),
                    provider: OAuthProvider::Google,
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
        let result = mgr.refresh_token(OAuthProvider::Vercel, "rt-xxx").await;
        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("not configured"));
    }
}
