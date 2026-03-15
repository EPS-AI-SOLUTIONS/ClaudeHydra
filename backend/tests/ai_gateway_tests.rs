// ai_gateway_tests.rs — Integration tests for AI Gateway + Vault Bridge
//
// Tests cross-module interactions between:
// - VaultClient (vault_bridge.rs) — health check, credential caching, offline fallback
// - ModelRouter (model_router.rs) — model resolution, tier-based selection, fallback chain
// - OAuthFlowManager (oauth_flows.rs) — PKCE login flow, state management, cleanup
// - AiProvider (mod.rs) — from_model_id, FromStr, serde roundtrip
// - ProviderConfig (mod.rs) — default configs completeness
//
// All tests run WITHOUT a running Vault or DB (pure offline/mock).

use std::collections::HashMap;
use std::str::FromStr;

use claudehydra_backend::ai_gateway::{
    AiProvider, AuthType,
    default_provider_configs,
    model_router::{ModelRouter, ModelTier},
    oauth_flows::{
        OAuthProvider, OAuthFlowManager, OAuthProviderConfig, OAuthTokens,
        PkceMethod,
    },
    vault_bridge::{MaskedCredential, VaultClient, VaultError, VaultHealthStatus},
};

// ═══════════════════════════════════════════════════════════════════════════════
//  1. VaultClient health check (offline fallback)
// ═══════════════════════════════════════════════════════════════════════════════

#[tokio::test]
async fn vault_health_offline_returns_default_without_panic() {
    // Connect to a non-existent port — no Vault running
    let client = VaultClient::with_url("http://localhost:19999");
    let status = client.health().await;

    // Should return the Default::default() VaultHealthStatus, not panic
    assert!(
        !status.online,
        "health.online should be false when Vault is unreachable"
    );
    assert_eq!(status.credential_count, 0);
    assert!(status.last_audit.is_none());
}

#[tokio::test]
async fn vault_health_graceful_degradation_with_invalid_url() {
    let client = VaultClient::with_url("http://[::1]:19998");
    let status = client.health().await;
    assert!(!status.online);
}

#[tokio::test]
async fn vault_health_returns_consistent_default() {
    // Multiple health checks in sequence should all return the same default
    let client = VaultClient::with_url("http://localhost:19999");
    let s1 = client.health().await;
    let s2 = client.health().await;
    assert_eq!(s1.online, s2.online);
    assert_eq!(s1.credential_count, s2.credential_count);
}

// ═══════════════════════════════════════════════════════════════════════════════
//  2. VaultClient get with no vault (cache miss)
// ═══════════════════════════════════════════════════════════════════════════════

#[tokio::test]
async fn vault_get_unreachable_returns_connection_failed() {
    let client = VaultClient::with_url("http://localhost:19999");
    let result = client.get("ai_providers", "anthropic_max").await;

    assert!(result.is_err(), "get() should fail when Vault is unreachable");
    match result.unwrap_err() {
        VaultError::ConnectionFailed(_) | VaultError::Timeout => {
            // Expected — either connection refused or timeout
        }
        other => panic!("Expected ConnectionFailed or Timeout, got: {:?}", other),
    }
}

#[tokio::test]
async fn vault_get_unreachable_does_not_panic_on_repeated_calls() {
    let client = VaultClient::with_url("http://localhost:19999");
    // Multiple consecutive calls — verify no panic or resource leak
    for _ in 0..3 {
        let result = client.get("test", "nonexistent").await;
        assert!(result.is_err());
    }
    // If we get here without panicking, the test passes
}

#[tokio::test]
async fn vault_set_unreachable_returns_connection_failed() {
    let client = VaultClient::with_url("http://localhost:19999");
    let result = client
        .set(
            "ai_providers",
            "test",
            serde_json::json!({"token": "xxx"}),
        )
        .await;
    assert!(result.is_err());
}

#[tokio::test]
async fn vault_delegate_unreachable_returns_connection_failed() {
    let client = VaultClient::with_url("http://localhost:19999");
    let result = client
        .delegate(
            "https://api.anthropic.com/v1/messages",
            "POST",
            "ai_providers",
            "anthropic_max",
            Some(serde_json::json!({"messages": []})),
        )
        .await;
    assert!(result.is_err());
}

#[tokio::test]
async fn vault_request_ticket_unreachable_returns_error() {
    let client = VaultClient::with_url("http://localhost:19999");
    let result = client.request_ticket("ai_providers", "anthropic_max", 300).await;
    assert!(result.is_err());
}

// ═══════════════════════════════════════════════════════════════════════════════
//  3. VaultClient cache operations
// ═══════════════════════════════════════════════════════════════════════════════

#[tokio::test]
async fn vault_cache_starts_empty() {
    let client = VaultClient::with_url("http://localhost:19999");
    let (total, expired) = client.cache_stats().await;
    assert_eq!(total, 0);
    assert_eq!(expired, 0);
}

#[tokio::test]
async fn vault_invalidate_cache_on_empty_is_noop() {
    let client = VaultClient::with_url("http://localhost:19999");
    // Should not panic or error
    client.invalidate_cache("ai_providers", "nonexistent").await;
    let (total, _) = client.cache_stats().await;
    assert_eq!(total, 0);
}

#[tokio::test]
async fn vault_clear_cache_on_empty_is_noop() {
    let client = VaultClient::with_url("http://localhost:19999");
    client.clear_cache().await;
    let (total, _) = client.cache_stats().await;
    assert_eq!(total, 0);
}

#[tokio::test]
async fn vault_get_provider_status_returns_disconnected_when_offline() {
    let client = VaultClient::with_url("http://localhost:19999");
    let status = client.get_provider_status("anthropic").await;

    // Should still return a valid ProviderAuthStatus (not panic)
    assert_eq!(status.provider, "anthropic");
    assert!(
        !status.is_connected,
        "Should not be connected when Vault is unreachable"
    );
    assert!(
        status.last_verified.is_some(),
        "Should have a last_verified timestamp"
    );
    assert!(
        status.last_error.is_some(),
        "Should have an error message when Vault is offline"
    );
}

#[tokio::test]
async fn vault_get_provider_status_for_all_providers_offline() {
    let client = VaultClient::with_url("http://localhost:19999");

    // Check status for each provider — all should be disconnected but not panic
    for provider in AiProvider::ALL {
        let status = client.get_provider_status(&provider.to_string()).await;
        assert_eq!(status.provider, provider.to_string());
        assert!(!status.is_connected);
        assert!(status.last_verified.is_some());
    }
}

#[tokio::test]
async fn vault_client_url_stripping() {
    // Trailing slash should be stripped
    let client = VaultClient::with_url("https://vault.example.com/");
    assert_eq!(client.vault_url(), "https://vault.example.com");

    // No trailing slash is preserved as-is
    let client2 = VaultClient::with_url("http://localhost:5190");
    assert_eq!(client2.vault_url(), "http://localhost:5190");
}

#[tokio::test]
async fn vault_client_default_url() {
    let client = VaultClient::new();
    assert_eq!(client.vault_url(), "http://localhost:5190");
}

// ═══════════════════════════════════════════════════════════════════════════════
//  4. ModelRouter resolution tests
// ═══════════════════════════════════════════════════════════════════════════════

#[test]
fn router_resolve_claude_sonnet_to_anthropic_coordinator() {
    let router = ModelRouter::new();
    let route = router.resolve_model("claude-sonnet-4-6").unwrap();
    assert_eq!(route.provider, AiProvider::Anthropic);
    assert_eq!(route.tier, ModelTier::Coordinator);
    assert_eq!(route.upstream_model, "claude-sonnet-4-6");
    assert_eq!(route.priority, 0, "Anthropic should be priority 0 (highest)");
}

#[test]
fn router_resolve_gpt4o_to_openai_commander() {
    let router = ModelRouter::new();
    let route = router.resolve_model("gpt-4o").unwrap();
    assert_eq!(route.provider, AiProvider::OpenAI);
    assert_eq!(route.tier, ModelTier::Commander);
}

#[test]
fn router_resolve_gemini_flash_to_google_executor() {
    let router = ModelRouter::new();
    let route = router.resolve_model("gemini-2.0-flash").unwrap();
    assert_eq!(route.provider, AiProvider::Google);
    // gemini-2.0-flash is the executor tier model for Google in default configs
    assert_eq!(route.tier, ModelTier::Executor);
}

#[test]
fn router_resolve_nonexistent_model_returns_error() {
    let router = ModelRouter::new();
    let result = router.resolve_model("nonexistent-model");
    assert!(result.is_err());
    let err_msg = result.unwrap_err().to_string();
    assert!(
        err_msg.contains("cannot detect AI provider"),
        "Error should explain the model was unrecognized: {}",
        err_msg
    );
}

#[test]
fn router_resolve_by_tier_picks_anthropic_first() {
    let router = ModelRouter::new();
    let available = vec![AiProvider::Anthropic, AiProvider::Google];
    let route = router
        .resolve_by_tier(ModelTier::Commander, &available)
        .unwrap();
    assert_eq!(
        route.provider,
        AiProvider::Anthropic,
        "Anthropic should be picked when available (highest priority)"
    );
    assert_eq!(route.tier, ModelTier::Commander);
    assert_eq!(route.upstream_model, "claude-opus-4-6");
}

#[test]
fn router_resolve_by_tier_skips_anthropic_when_unavailable() {
    let router = ModelRouter::new();
    let available = vec![AiProvider::Google, AiProvider::DeepSeek];
    let route = router
        .resolve_by_tier(ModelTier::Commander, &available)
        .unwrap();
    assert_eq!(
        route.provider,
        AiProvider::Google,
        "Google should be picked as second priority"
    );
    assert_eq!(route.upstream_model, "gemini-2.5-pro-preview-06-05");
}

#[test]
fn router_resolve_by_tier_no_available_providers_returns_error() {
    let router = ModelRouter::new();
    let result = router.resolve_by_tier(ModelTier::Coordinator, &[]);
    assert!(result.is_err());
}

#[test]
fn router_resolve_by_tier_all_tiers_pick_anthropic_when_all_available() {
    let router = ModelRouter::new();
    for tier in ModelTier::ALL {
        let route = router.resolve_by_tier(tier, &AiProvider::ALL).unwrap();
        assert_eq!(route.tier, tier);
        assert_eq!(
            route.provider,
            AiProvider::Anthropic,
            "All tiers should pick Anthropic first when all are available"
        );
    }
}

#[test]
fn router_resolve_novel_claude_model_detects_correctly() {
    let router = ModelRouter::new();
    // A hypothetical future model not in the default routes
    let route = router.resolve_model("claude-opus-5-0").unwrap();
    assert_eq!(route.provider, AiProvider::Anthropic);
    assert_eq!(route.tier, ModelTier::Commander); // "opus" -> Commander
    assert_eq!(route.upstream_model, "claude-opus-5-0");
}

#[test]
fn router_resolve_novel_openai_model_detects_tier() {
    let router = ModelRouter::new();
    // A future O3 model
    let route = router.resolve_model("o3-preview").unwrap();
    assert_eq!(route.provider, AiProvider::OpenAI);
    // "o3-preview" — no specific tier markers, defaults to Coordinator
    assert_eq!(route.tier, ModelTier::Coordinator);
}

#[test]
fn router_fallback_chain_anthropic_primary() {
    let router = ModelRouter::new();
    let chain = router.fallback_chain(AiProvider::Anthropic);
    assert_eq!(chain[0], AiProvider::Anthropic);
    assert_eq!(chain.len(), 6);
    // Ensure no duplicates
    let mut seen = std::collections::HashSet::new();
    for p in &chain {
        assert!(
            seen.insert(p),
            "Duplicate provider in fallback chain: {:?}",
            p
        );
    }
}

#[test]
fn router_fallback_chain_google_primary_reorders() {
    let router = ModelRouter::new();
    let chain = router.fallback_chain(AiProvider::Google);
    assert_eq!(chain[0], AiProvider::Google, "Primary should be first");
    assert_eq!(chain[1], AiProvider::Anthropic, "Anthropic should follow");
    assert_eq!(chain.len(), 6);
}

#[test]
fn router_has_correct_number_of_routes() {
    let router = ModelRouter::new();
    // 6 providers * 3 tiers = 18 routes
    assert_eq!(router.route_count(), 18);
}

#[test]
fn router_tier_defaults_have_all_tiers() {
    let router = ModelRouter::new();
    for tier in ModelTier::ALL {
        assert!(
            router.tier_defaults().contains_key(&tier),
            "Missing tier defaults for {}",
            tier
        );
        let defaults = &router.tier_defaults()[&tier];
        assert_eq!(
            defaults.len(),
            6,
            "Tier {} should have 6 provider defaults",
            tier
        );
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
//  5. OAuthFlowManager tests
// ═══════════════════════════════════════════════════════════════════════════════

#[tokio::test]
async fn oauth_initiate_login_anthropic_returns_valid_pkce_url() {
    let mgr = OAuthFlowManager::new(reqwest::Client::new());
    let resp = mgr
        .initiate_login(OAuthProvider::Anthropic)
        .await
        .unwrap();

    assert_eq!(resp.provider, OAuthProvider::Anthropic);
    assert!(!resp.state.is_empty(), "State parameter should not be empty");

    // Parse the URL and verify PKCE parameters
    let parsed = url::Url::parse(&resp.authorize_url).unwrap();
    assert_eq!(parsed.host_str(), Some("claude.ai"));

    let params: HashMap<_, _> = parsed.query_pairs().collect();
    assert!(params.contains_key("client_id"));
    assert!(params.contains_key("code_challenge"));
    assert_eq!(
        params.get("code_challenge_method").map(|v| v.as_ref()),
        Some("S256")
    );
    assert_eq!(
        params.get("response_type").map(|v| v.as_ref()),
        Some("code")
    );
    assert!(params.contains_key("state"));
    // Anthropic-specific: code=true
    assert_eq!(params.get("code").map(|v| v.as_ref()), Some("true"));
}

#[tokio::test]
async fn oauth_initiate_login_twice_produces_different_states() {
    let mgr = OAuthFlowManager::new(reqwest::Client::new());

    let resp1 = mgr
        .initiate_login(OAuthProvider::Anthropic)
        .await
        .unwrap();
    let resp2 = mgr
        .initiate_login(OAuthProvider::Anthropic)
        .await
        .unwrap();

    assert_ne!(
        resp1.state, resp2.state,
        "Each login attempt should produce a unique CSRF state"
    );

    // Both should be stored
    assert_eq!(mgr.pending_states_count().await, 2);
}

#[tokio::test]
async fn oauth_handle_callback_with_invalid_state_returns_error() {
    let mgr = OAuthFlowManager::new(reqwest::Client::new());
    let result = mgr.handle_callback("invalid-state-xyz", "some-code").await;

    assert!(result.is_err());
    let err_msg = result.unwrap_err().to_string();
    assert!(
        err_msg.contains("Invalid") || err_msg.contains("already-consumed"),
        "Error should indicate invalid state: {}",
        err_msg
    );
}

#[tokio::test]
async fn oauth_handle_callback_consumes_state_atomically() {
    let mgr = OAuthFlowManager::new(reqwest::Client::new());
    let resp = mgr
        .initiate_login(OAuthProvider::Anthropic)
        .await
        .unwrap();

    assert_eq!(mgr.pending_states_count().await, 1);

    // First callback attempt (will fail because there's no real OAuth server,
    // but it should still consume the PKCE state)
    let _ = mgr.handle_callback(&resp.state, "fake-code").await;

    // State should be consumed after callback (even if the HTTP exchange failed)
    assert_eq!(mgr.pending_states_count().await, 0);

    // Second attempt with the same state should fail
    let result2 = mgr.handle_callback(&resp.state, "fake-code").await;
    assert!(result2.is_err(), "Reusing a consumed state should fail");
}

#[tokio::test]
async fn oauth_cleanup_expired_states_on_empty_is_noop() {
    let mgr = OAuthFlowManager::new(reqwest::Client::new());
    assert_eq!(mgr.pending_states_count().await, 0);

    // Should not panic
    mgr.cleanup_expired_states().await;

    assert_eq!(mgr.pending_states_count().await, 0);
}

#[tokio::test]
async fn oauth_cleanup_preserves_fresh_states() {
    let mgr = OAuthFlowManager::new(reqwest::Client::new());

    // Insert a fresh state via the normal API
    let _ = mgr
        .initiate_login(OAuthProvider::Anthropic)
        .await
        .unwrap();
    assert_eq!(mgr.pending_states_count().await, 1);

    // Cleanup should NOT remove a state that was just created
    mgr.cleanup_expired_states().await;
    assert_eq!(
        mgr.pending_states_count().await,
        1,
        "Fresh state should survive cleanup"
    );
}

#[tokio::test]
async fn oauth_unconfigured_provider_returns_error() {
    let mgr = OAuthFlowManager::new(reqwest::Client::new());

    // GitHub is not configured by default (requires env vars)
    let result = mgr.initiate_login(OAuthProvider::GitHub).await;
    assert!(result.is_err());
    assert!(
        result.unwrap_err().to_string().contains("not configured"),
        "Should indicate the provider is not configured"
    );
}

#[tokio::test]
async fn oauth_manager_always_has_anthropic() {
    let mgr = OAuthFlowManager::new(reqwest::Client::new());
    assert!(mgr.has_provider(OAuthProvider::Anthropic));
    // GitHub and Vercel require env vars — may or may not be present
    // Just verify the check doesn't panic
    let _ = mgr.has_provider(OAuthProvider::GitHub);
    let _ = mgr.has_provider(OAuthProvider::Vercel);
}

#[tokio::test]
async fn oauth_register_provider_makes_it_available() {
    let mut mgr = OAuthFlowManager::new(reqwest::Client::new());
    assert!(!mgr.has_provider(OAuthProvider::GitHub));

    mgr.register_provider(OAuthProviderConfig {
        provider: OAuthProvider::GitHub,
        authorize_url: "https://github.com/login/oauth/authorize".into(),
        token_url: "https://github.com/login/oauth/access_token".into(),
        redirect_uri: "http://localhost:8082/api/auth/github/callback".into(),
        client_id: "test-client-id".into(),
        client_secret: Some("test-secret".into()),
        scopes: vec!["repo".into(), "user".into()],
        pkce_method: PkceMethod::S256,
        extra_params: HashMap::new(),
    });

    assert!(mgr.has_provider(OAuthProvider::GitHub));

    // Should now be able to initiate login
    let resp = mgr
        .initiate_login(OAuthProvider::GitHub)
        .await
        .unwrap();
    assert_eq!(resp.provider, OAuthProvider::GitHub);
    let parsed = url::Url::parse(&resp.authorize_url).unwrap();
    assert_eq!(parsed.host_str(), Some("github.com"));
}

#[tokio::test]
async fn oauth_refresh_unconfigured_provider_errors() {
    let mgr = OAuthFlowManager::new(reqwest::Client::new());
    let result = mgr
        .refresh_token(OAuthProvider::Vercel, "rt-xxx")
        .await;
    assert!(result.is_err());
    assert!(result.unwrap_err().to_string().contains("not configured"));
}

#[tokio::test]
async fn oauth_anthropic_config_has_correct_constants() {
    let cfg = OAuthFlowManager::default_anthropic_config();
    assert_eq!(cfg.provider, OAuthProvider::Anthropic);
    assert!(cfg.authorize_url.contains("claude.ai"));
    assert!(cfg.token_url.contains("anthropic.com"));
    assert!(cfg.client_secret.is_none(), "Anthropic is a public client");
    assert_eq!(cfg.pkce_method, PkceMethod::S256);
    assert!(cfg.scopes.contains(&"user:inference".to_string()));
    // URLs should be valid
    assert!(url::Url::parse(&cfg.authorize_url).is_ok());
    assert!(url::Url::parse(&cfg.token_url).is_ok());
    assert!(url::Url::parse(&cfg.redirect_uri).is_ok());
}

// ═══════════════════════════════════════════════════════════════════════════════
//  6. AiProvider enum tests
// ═══════════════════════════════════════════════════════════════════════════════

#[test]
fn ai_provider_from_model_id_all_prefixes() {
    // Anthropic
    assert_eq!(
        AiProvider::from_model_id("claude-opus-4-6"),
        Some(AiProvider::Anthropic)
    );
    assert_eq!(
        AiProvider::from_model_id("claude-sonnet-4-6"),
        Some(AiProvider::Anthropic)
    );
    assert_eq!(
        AiProvider::from_model_id("claude-haiku-4-5"),
        Some(AiProvider::Anthropic)
    );

    // OpenAI
    assert_eq!(
        AiProvider::from_model_id("gpt-4o"),
        Some(AiProvider::OpenAI)
    );
    assert_eq!(
        AiProvider::from_model_id("gpt-4o-mini"),
        Some(AiProvider::OpenAI)
    );
    assert_eq!(
        AiProvider::from_model_id("o1-preview"),
        Some(AiProvider::OpenAI)
    );
    assert_eq!(
        AiProvider::from_model_id("o3-mini"),
        Some(AiProvider::OpenAI)
    );

    // Google
    assert_eq!(
        AiProvider::from_model_id("gemini-2.5-pro"),
        Some(AiProvider::Google)
    );
    assert_eq!(
        AiProvider::from_model_id("gemini-2.0-flash"),
        Some(AiProvider::Google)
    );

    // xAI
    assert_eq!(
        AiProvider::from_model_id("grok-3"),
        Some(AiProvider::Xai)
    );
    assert_eq!(
        AiProvider::from_model_id("grok-3-mini-fast"),
        Some(AiProvider::Xai)
    );

    // DeepSeek
    assert_eq!(
        AiProvider::from_model_id("deepseek-reasoner"),
        Some(AiProvider::DeepSeek)
    );
    assert_eq!(
        AiProvider::from_model_id("deepseek-chat"),
        Some(AiProvider::DeepSeek)
    );

    // Ollama
    assert_eq!(
        AiProvider::from_model_id("llama3.1:70b"),
        Some(AiProvider::Ollama)
    );
    assert_eq!(
        AiProvider::from_model_id("mistral:latest"),
        Some(AiProvider::Ollama)
    );
    assert_eq!(
        AiProvider::from_model_id("codellama:13b"),
        Some(AiProvider::Ollama)
    );
    assert_eq!(
        AiProvider::from_model_id("phi3:latest"),
        Some(AiProvider::Ollama)
    );

    // Unknown
    assert_eq!(AiProvider::from_model_id("unknown-xyz"), None);
    assert_eq!(AiProvider::from_model_id(""), None);
}

#[test]
fn ai_provider_from_model_id_case_insensitive() {
    assert_eq!(
        AiProvider::from_model_id("Claude-Opus-4-6"),
        Some(AiProvider::Anthropic)
    );
    assert_eq!(
        AiProvider::from_model_id("GPT-4o"),
        Some(AiProvider::OpenAI)
    );
    assert_eq!(
        AiProvider::from_model_id("GEMINI-2.5-pro"),
        Some(AiProvider::Google)
    );
    assert_eq!(
        AiProvider::from_model_id("GROK-3"),
        Some(AiProvider::Xai)
    );
    assert_eq!(
        AiProvider::from_model_id("DEEPSEEK-chat"),
        Some(AiProvider::DeepSeek)
    );
    assert_eq!(
        AiProvider::from_model_id("LLAMA3.1:70b"),
        Some(AiProvider::Ollama)
    );
}

#[test]
fn ai_provider_from_str_case_insensitive() {
    assert_eq!(AiProvider::from_str("anthropic"), Ok(AiProvider::Anthropic));
    assert_eq!(AiProvider::from_str("ANTHROPIC"), Ok(AiProvider::Anthropic));
    assert_eq!(AiProvider::from_str("Anthropic"), Ok(AiProvider::Anthropic));
    assert_eq!(AiProvider::from_str("OPENAI"), Ok(AiProvider::OpenAI));
    assert_eq!(AiProvider::from_str("openai"), Ok(AiProvider::OpenAI));
    assert_eq!(AiProvider::from_str("google"), Ok(AiProvider::Google));
    assert_eq!(AiProvider::from_str("Gemini"), Ok(AiProvider::Google)); // alias
    assert_eq!(AiProvider::from_str("xai"), Ok(AiProvider::Xai));
    assert_eq!(AiProvider::from_str("Grok"), Ok(AiProvider::Xai)); // alias
    assert_eq!(AiProvider::from_str("deepseek"), Ok(AiProvider::DeepSeek));
    assert_eq!(AiProvider::from_str("ollama"), Ok(AiProvider::Ollama));
    assert_eq!(AiProvider::from_str("OLLAMA"), Ok(AiProvider::Ollama));
}

#[test]
fn ai_provider_from_str_unknown_returns_error() {
    assert!(AiProvider::from_str("unknown").is_err());
    assert!(AiProvider::from_str("").is_err());
    assert!(AiProvider::from_str("chatgpt").is_err());
}

#[test]
fn ai_provider_serde_roundtrip_all_variants() {
    for provider in AiProvider::ALL {
        let json = serde_json::to_string(&provider).unwrap();
        let parsed: AiProvider = serde_json::from_str(&json).unwrap();
        assert_eq!(parsed, provider, "Serde roundtrip failed for {:?}", provider);
    }
}

#[test]
fn ai_provider_display_matches_serde() {
    for provider in AiProvider::ALL {
        let display = provider.to_string();
        let serde = serde_json::to_string(&provider)
            .unwrap()
            .trim_matches('"')
            .to_string();
        assert_eq!(
            display, serde,
            "Display ({}) should match serde ({}) for {:?}",
            display, serde, provider
        );
    }
}

#[test]
fn ai_provider_all_has_six_variants() {
    assert_eq!(AiProvider::ALL.len(), 6);
}

// ═══════════════════════════════════════════════════════════════════════════════
//  7. Default configs completeness
// ═══════════════════════════════════════════════════════════════════════════════

#[test]
fn default_configs_all_6_providers_present() {
    let configs = default_provider_configs();
    assert_eq!(configs.len(), 6, "Should have exactly 6 provider configs");

    for provider in AiProvider::ALL {
        assert!(
            configs.contains_key(&provider),
            "Missing config for {:?}",
            provider
        );
    }
}

#[test]
fn default_configs_all_vault_namespace_is_ai_providers() {
    let configs = default_provider_configs();
    for (provider, config) in &configs {
        assert_eq!(
            config.vault_namespace, "ai_providers",
            "Provider {:?} should use 'ai_providers' namespace, got '{}'",
            provider, config.vault_namespace
        );
    }
}

#[test]
fn default_configs_all_endpoints_start_with_api_ai() {
    let configs = default_provider_configs();
    for (provider, config) in &configs {
        assert!(
            config.chat_endpoint.starts_with("/api/ai/"),
            "Provider {:?} chat_endpoint should start with /api/ai/, got '{}'",
            provider, config.chat_endpoint
        );
        assert!(
            config.stream_endpoint.starts_with("/api/ai/"),
            "Provider {:?} stream_endpoint should start with /api/ai/, got '{}'",
            provider, config.stream_endpoint
        );
    }
}

#[test]
fn default_configs_model_tiers_not_empty() {
    let configs = default_provider_configs();
    for (provider, config) in &configs {
        assert!(
            !config.model_tiers.commander.is_empty(),
            "{:?} commander model should not be empty",
            provider
        );
        assert!(
            !config.model_tiers.coordinator.is_empty(),
            "{:?} coordinator model should not be empty",
            provider
        );
        assert!(
            !config.model_tiers.executor.is_empty(),
            "{:?} executor model should not be empty",
            provider
        );
    }
}

#[test]
fn default_configs_auth_types_match_expected() {
    let configs = default_provider_configs();
    assert_eq!(configs[&AiProvider::Anthropic].auth_type, AuthType::OAuthPkce);
    assert_eq!(configs[&AiProvider::Google].auth_type, AuthType::OAuthPkce);
    assert_eq!(configs[&AiProvider::OpenAI].auth_type, AuthType::SessionToken);
    assert_eq!(configs[&AiProvider::Xai].auth_type, AuthType::CookieSession);
    assert_eq!(
        configs[&AiProvider::DeepSeek].auth_type,
        AuthType::ApiKeyViaVault
    );
    assert_eq!(configs[&AiProvider::Ollama].auth_type, AuthType::None);
}

#[test]
fn default_configs_upstream_urls_are_valid() {
    let configs = default_provider_configs();
    for (provider, config) in &configs {
        // All upstream URLs should be parseable (even if they contain {model} template)
        let url_str = config.upstream_url.replace("{model}", "test-model");
        assert!(
            url::Url::parse(&url_str).is_ok(),
            "Provider {:?} upstream_url is not a valid URL: '{}'",
            provider, config.upstream_url
        );
    }
}

#[test]
fn default_configs_total_monthly_cost() {
    let configs = default_provider_configs();
    let total_cents: u32 = configs.values().map(|c| c.monthly_cost_cents).sum();
    // $100 + $20 + $19.99 + $16 + $0 + $0 = $155.99 = 15599 cents
    assert_eq!(total_cents, 15599, "Total monthly cost should be $155.99");
}

#[test]
fn default_configs_vault_services_are_unique() {
    let configs = default_provider_configs();
    let services: Vec<&str> = configs.values().map(|c| c.vault_service.as_str()).collect();
    let unique: std::collections::HashSet<&str> = services.iter().copied().collect();
    assert_eq!(
        services.len(),
        unique.len(),
        "All vault_service names should be unique"
    );
}

#[test]
fn default_configs_plan_names_not_empty() {
    let configs = default_provider_configs();
    for (provider, config) in &configs {
        assert!(
            !config.plan_name.is_empty(),
            "Provider {:?} should have a non-empty plan_name",
            provider
        );
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
//  Cross-module integration: ModelRouter + AiProvider + ProviderConfig
// ═══════════════════════════════════════════════════════════════════════════════

#[test]
fn router_models_match_provider_configs() {
    let configs = default_provider_configs();
    let router = ModelRouter::new();

    // Every commander model from provider configs should resolve correctly
    for (provider, config) in &configs {
        let route = router.resolve_model(&config.model_tiers.commander).unwrap();
        assert_eq!(
            route.provider, *provider,
            "Commander model '{}' should resolve to {:?} but got {:?}",
            config.model_tiers.commander, provider, route.provider
        );
    }
}

#[test]
fn router_tier_detection_consistent_with_provider_defaults() {
    let configs = default_provider_configs();

    for (_provider, config) in &configs {
        // Commander models should be detected as Commander tier
        let tier = ModelRouter::detect_tier(&config.model_tiers.commander);
        assert_eq!(
            tier,
            ModelTier::Commander,
            "Model '{}' should be Commander tier",
            config.model_tiers.commander
        );

        // Coordinator models should be Coordinator
        let tier = ModelRouter::detect_tier(&config.model_tiers.coordinator);
        assert_eq!(
            tier,
            ModelTier::Coordinator,
            "Model '{}' should be Coordinator tier",
            config.model_tiers.coordinator
        );

        // Executor models — at minimum should not be Commander
        let executor = &config.model_tiers.executor;
        let tier = ModelRouter::detect_tier(executor);
        assert_ne!(
            tier,
            ModelTier::Commander,
            "Executor model '{}' should not be Commander tier",
            executor
        );
    }
}

#[test]
fn router_resolve_all_default_coordinator_models() {
    let configs = default_provider_configs();
    let router = ModelRouter::new();

    for (provider, config) in &configs {
        let route = router
            .resolve_model(&config.model_tiers.coordinator)
            .unwrap();
        assert_eq!(
            route.provider, *provider,
            "Coordinator model '{}' should resolve to {:?}",
            config.model_tiers.coordinator, provider
        );
    }
}

#[test]
fn router_resolve_all_default_executor_models() {
    let configs = default_provider_configs();
    let router = ModelRouter::new();

    for (provider, config) in &configs {
        let route = router.resolve_model(&config.model_tiers.executor).unwrap();
        assert_eq!(
            route.provider, *provider,
            "Executor model '{}' should resolve to {:?}",
            config.model_tiers.executor, provider
        );
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
//  Cross-module: VaultClient + ProviderConfig (credential lookup paths)
// ═══════════════════════════════════════════════════════════════════════════════

#[tokio::test]
async fn vault_get_uses_correct_namespace_for_each_provider() {
    let client = VaultClient::with_url("http://localhost:19999");
    let configs = default_provider_configs();

    // Verify each provider's vault lookup path is reachable (offline = error, but correct path)
    for (_provider, config) in &configs {
        let result = client.get(&config.vault_namespace, &config.vault_service).await;
        // Should fail with ConnectionFailed (not NotFound or parsing error)
        assert!(result.is_err());
        match result.unwrap_err() {
            VaultError::ConnectionFailed(_) | VaultError::Timeout => {
                // This is the expected path — namespace/service are correctly formatted
            }
            other => panic!(
                "Expected ConnectionFailed for {}/{}, got: {:?}",
                config.vault_namespace, config.vault_service, other
            ),
        }
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
//  VaultError behavior tests
// ═══════════════════════════════════════════════════════════════════════════════

#[test]
fn vault_error_is_anomaly_only_for_anomaly_variant() {
    assert!(VaultError::AnomalyDetected("breach".into()).is_anomaly());
    assert!(!VaultError::NotFound.is_anomaly());
    assert!(!VaultError::Unauthorized.is_anomaly());
    assert!(!VaultError::Timeout.is_anomaly());
    assert!(!VaultError::ConnectionFailed("err".into()).is_anomaly());
    assert!(!VaultError::InvalidResponse("err".into()).is_anomaly());
}

#[test]
fn vault_error_display_messages() {
    assert_eq!(
        VaultError::NotFound.to_string(),
        "credential not found in vault"
    );
    assert!(VaultError::Unauthorized.to_string().contains("unauthorized"));
    assert_eq!(VaultError::Timeout.to_string(), "vault request timed out");
    assert!(VaultError::AnomalyDetected("test".into())
        .to_string()
        .contains("ANOMALY DETECTED"));
    assert!(VaultError::ConnectionFailed("refused".into())
        .to_string()
        .contains("refused"));
    assert!(VaultError::InvalidResponse("bad json".into())
        .to_string()
        .contains("bad json"));
}

// ═══════════════════════════════════════════════════════════════════════════════
//  MaskedCredential + VaultHealthStatus serialization
// ═══════════════════════════════════════════════════════════════════════════════

#[test]
fn masked_credential_serde_roundtrip() {
    let cred = MaskedCredential {
        service: "anthropic_max".into(),
        masked_value: "sk-ant-***...xyz".into(),
        expires_at: Some(1735689600),
        plan_tier: Some("max".into()),
        is_connected: true,
    };

    let json = serde_json::to_value(&cred).unwrap();
    let back: MaskedCredential = serde_json::from_value(json).unwrap();
    assert_eq!(back.service, "anthropic_max");
    assert_eq!(back.masked_value, "sk-ant-***...xyz");
    assert_eq!(back.expires_at, Some(1735689600));
    assert_eq!(back.plan_tier.as_deref(), Some("max"));
    assert!(back.is_connected);
}

#[test]
fn masked_credential_minimal_serde() {
    let cred = MaskedCredential {
        service: "test".into(),
        masked_value: "***".into(),
        expires_at: None,
        plan_tier: None,
        is_connected: false,
    };

    let json = serde_json::to_value(&cred).unwrap();
    assert_eq!(json["service"], "test");
    assert!(!json["is_connected"].as_bool().unwrap());

    let back: MaskedCredential = serde_json::from_value(json).unwrap();
    assert!(back.expires_at.is_none());
    assert!(back.plan_tier.is_none());
}

#[test]
fn vault_health_status_default_is_offline() {
    let status = VaultHealthStatus::default();
    assert!(!status.online);
    assert_eq!(status.credential_count, 0);
    assert!(status.last_audit.is_none());
}

#[test]
fn vault_health_status_serde_roundtrip() {
    let status = VaultHealthStatus {
        online: true,
        credential_count: 12,
        last_audit: Some("2026-03-14T12:00:00Z".into()),
    };

    let json = serde_json::to_value(&status).unwrap();
    let back: VaultHealthStatus = serde_json::from_value(json).unwrap();
    assert!(back.online);
    assert_eq!(back.credential_count, 12);
    assert_eq!(back.last_audit.as_deref(), Some("2026-03-14T12:00:00Z"));
}

// ═══════════════════════════════════════════════════════════════════════════════
//  OAuthTokens serialization
// ═══════════════════════════════════════════════════════════════════════════════

#[test]
fn oauth_tokens_serde_minimal() {
    let json = r#"{"access_token": "tok-123"}"#;
    let tokens: OAuthTokens = serde_json::from_str(json).unwrap();
    assert_eq!(tokens.access_token, "tok-123");
    assert_eq!(tokens.token_type, "Bearer"); // default
    assert!(tokens.refresh_token.is_none());
    assert!(tokens.expires_in.is_none());
    assert!(tokens.extra.is_empty());
}

#[test]
fn oauth_tokens_serde_full_roundtrip() {
    let mut extra = HashMap::new();
    extra.insert("id_token".to_string(), serde_json::json!("jwt-abc"));
    let tokens = OAuthTokens {
        access_token: "ya29.xxx".into(),
        refresh_token: Some("1//0rr".into()),
        expires_in: Some(3600),
        scope: Some("email profile".into()),
        token_type: "Bearer".into(),
        extra,
    };

    let json = serde_json::to_value(&tokens).unwrap();
    let back: OAuthTokens = serde_json::from_value(json).unwrap();
    assert_eq!(back.access_token, "ya29.xxx");
    assert_eq!(back.refresh_token.as_deref(), Some("1//0rr"));
    assert_eq!(back.expires_in, Some(3600));
    assert_eq!(back.scope.as_deref(), Some("email profile"));
    assert!(back.extra.contains_key("id_token"));
}

// ═══════════════════════════════════════════════════════════════════════════════
//  ModelTier serialization
// ═══════════════════════════════════════════════════════════════════════════════

#[test]
fn model_tier_serde_roundtrip() {
    for tier in ModelTier::ALL {
        let json = serde_json::to_string(&tier).unwrap();
        let parsed: ModelTier = serde_json::from_str(&json).unwrap();
        assert_eq!(parsed, tier);
    }
}

#[test]
fn model_tier_display() {
    assert_eq!(ModelTier::Commander.to_string(), "commander");
    assert_eq!(ModelTier::Coordinator.to_string(), "coordinator");
    assert_eq!(ModelTier::Executor.to_string(), "executor");
}

// ═══════════════════════════════════════════════════════════════════════════════
//  AuthType serialization
// ═══════════════════════════════════════════════════════════════════════════════

#[test]
fn auth_type_display_all_variants() {
    assert_eq!(AuthType::OAuthPkce.to_string(), "oauth_pkce");
    assert_eq!(AuthType::SessionToken.to_string(), "session_token");
    assert_eq!(AuthType::CookieSession.to_string(), "cookie_session");
    assert_eq!(AuthType::ApiKeyViaVault.to_string(), "api_key_via_vault");
    assert_eq!(AuthType::None.to_string(), "none");
}
