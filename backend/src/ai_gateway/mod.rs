// ai_gateway/mod.rs — Unified AI Provider Gateway
// Strategia STRICT_PLAN_ONLY: zero API billing, wszystko przez subskrypcje konsumenckie

pub mod vault_bridge;
pub mod vault_handlers;
pub mod handlers;
pub mod oauth_flows;
pub mod session_manager;
pub mod model_router;

use std::collections::HashMap;
use std::fmt;

use serde::{Deserialize, Serialize};

// ── Re-exports from submodules ────────────────────────────────────────────────
pub use handlers::*;
pub use model_router::*;
pub use oauth_flows::*;
pub use session_manager::*;
pub use vault_bridge::*;
// vault_handlers types/functions are re-exported through vault_bridge (jaskier_vault::*)
//
// NOTE: AiProvider, ModelTier, ModelTiers, ModelRouter, ModelRoute, detect_provider,
// detect_tier, etc. are all re-exported from jaskier-model-router via model_router::*.

// ── AuthType ──────────────────────────────────────────────────────────────────

/// Authentication mechanism used by each provider.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AuthType {
    /// Standard OAuth 2.0 PKCE flow (Anthropic Claude Max, Google Gemini Advanced).
    OAuthPkce,
    /// JWT session token extracted from web UI (OpenAI ChatGPT Plus/Pro).
    SessionToken,
    /// Cookie-based session auth (xAI Grok via X.com cookies).
    CookieSession,
    /// API key stored and proxied through Jaskier Vault Bouncer (DeepSeek).
    ApiKeyViaVault,
    /// No authentication required (Ollama local).
    None,
}

impl fmt::Display for AuthType {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        let name = match self {
            AuthType::OAuthPkce => "oauth_pkce",
            AuthType::SessionToken => "session_token",
            AuthType::CookieSession => "cookie_session",
            AuthType::ApiKeyViaVault => "api_key_via_vault",
            AuthType::None => "none",
        };
        write!(f, "{}", name)
    }
}

// NOTE: ModelTiers is now defined in jaskier-model-router crate,
// re-exported via `pub use model_router::*` above.

// ── ProviderConfig ────────────────────────────────────────────────────────────

/// Full configuration for a single AI provider.
/// Credentials are NOT stored here — they live in Jaskier Vault.
/// This struct holds routing, metadata, and vault lookup coordinates.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProviderConfig {
    /// Which provider this config belongs to.
    pub provider: AiProvider,
    /// Human-readable subscription plan name (e.g. "Claude Max").
    pub plan_name: String,
    /// Authentication mechanism for this provider.
    pub auth_type: AuthType,
    /// Vault namespace for credential lookup (always "ai_providers").
    pub vault_namespace: String,
    /// Vault service name for credential lookup (e.g. "anthropic_max").
    pub vault_service: String,
    /// Local backend endpoint for non-streaming chat (e.g. "/api/ai/anthropic/chat").
    pub chat_endpoint: String,
    /// Local backend endpoint for streaming chat (e.g. "/api/ai/anthropic/stream").
    pub stream_endpoint: String,
    /// Upstream provider API URL (e.g. "https://api.anthropic.com/v1/messages").
    pub upstream_url: String,
    /// Extra headers required by the provider (e.g. anthropic-version).
    pub extra_headers: HashMap<String, String>,
    /// Monthly subscription cost in cents (e.g. 10000 = $100.00).
    pub monthly_cost_cents: u32,
    /// Default model tiers for this provider.
    pub model_tiers: ModelTiers,
}

// ── AiGatewayState ────────────────────────────────────────────────────────────

/// Central gateway state holding all provider configurations and the Vault client.
/// Stored in `AppState` and accessed via the `HasAiGateway` trait.
pub struct AiGatewayState {
    /// Provider configurations indexed by provider enum.
    pub providers: HashMap<AiProvider, ProviderConfig>,
    /// Client for communicating with Jaskier Vault (The Sentinel).
    pub vault_client: vault_bridge::VaultClient,
}

// ── HasAiGateway trait ────────────────────────────────────────────────────────

/// Trait for accessing the unified AI Gateway from AppState.
/// Implement this on your AppState to enable the gateway handlers.
pub trait HasAiGateway: Send + Sync + 'static {
    /// Returns a reference to the AI Gateway state.
    fn ai_gateway(&self) -> &AiGatewayState;

    /// Convenience: look up a single provider's config.
    fn provider_config(&self, provider: AiProvider) -> Option<&ProviderConfig> {
        self.ai_gateway().providers.get(&provider)
    }
}

// ── Default provider configs ──────────────────────────────────────────────────

/// Returns default configurations for all 6 providers based on the
/// Skarbiec Krasnali auth-rebuild-plan (STRICT_PLAN_ONLY strategy).
///
/// These are the "factory defaults" — actual runtime state may differ
/// once providers are connected/disconnected via the Settings UI.
pub fn default_provider_configs() -> HashMap<AiProvider, ProviderConfig> {
    let mut configs = HashMap::with_capacity(6);

    // ── Anthropic (Claude Max — $100/mo, OAuth PKCE) ──────────────────
    configs.insert(AiProvider::Anthropic, ProviderConfig {
        provider: AiProvider::Anthropic,
        plan_name: "Claude Max".to_string(),
        auth_type: AuthType::OAuthPkce,
        vault_namespace: "ai_providers".to_string(),
        vault_service: "anthropic_max".to_string(),
        chat_endpoint: "/api/ai/anthropic/chat".to_string(),
        stream_endpoint: "/api/ai/anthropic/stream".to_string(),
        upstream_url: "https://api.anthropic.com/v1/messages".to_string(),
        extra_headers: HashMap::from([
            ("anthropic-version".to_string(), "2023-06-01".to_string()),
            ("anthropic-beta".to_string(), "oauth-2025-04-20,prompt-caching-2024-07-31".to_string()),
        ]),
        monthly_cost_cents: 10000,
        model_tiers: ModelTiers {
            commander: "claude-opus-4-6".to_string(),
            coordinator: "claude-sonnet-4-6".to_string(),
            executor: "claude-haiku-4-5-20251001".to_string(),
        },
    });

    // ── OpenAI (ChatGPT Plus — $20/mo, Session Token) ─────────────────
    configs.insert(AiProvider::OpenAI, ProviderConfig {
        provider: AiProvider::OpenAI,
        plan_name: "ChatGPT Plus".to_string(),
        auth_type: AuthType::SessionToken,
        vault_namespace: "ai_providers".to_string(),
        vault_service: "openai_session".to_string(),
        chat_endpoint: "/api/ai/openai/chat".to_string(),
        stream_endpoint: "/api/ai/openai/stream".to_string(),
        upstream_url: "https://chatgpt.com/backend-api/conversation".to_string(),
        extra_headers: HashMap::from([
            ("oai-language".to_string(), "en-US".to_string()),
        ]),
        monthly_cost_cents: 2000,
        model_tiers: ModelTiers {
            commander: "gpt-4o".to_string(),
            coordinator: "gpt-4o-mini".to_string(),
            executor: "gpt-4o-mini".to_string(),
        },
    });

    // ── Google (Gemini Advanced — $19.99/mo, Google OAuth PKCE) ────────
    configs.insert(AiProvider::Google, ProviderConfig {
        provider: AiProvider::Google,
        plan_name: "Gemini Advanced".to_string(),
        auth_type: AuthType::OAuthPkce,
        vault_namespace: "ai_providers".to_string(),
        vault_service: "google_gemini".to_string(),
        chat_endpoint: "/api/ai/google/chat".to_string(),
        stream_endpoint: "/api/ai/google/stream".to_string(),
        upstream_url: "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent".to_string(),
        extra_headers: HashMap::new(),
        monthly_cost_cents: 1999,
        model_tiers: ModelTiers {
            commander: "gemini-2.5-pro-preview-06-05".to_string(),
            coordinator: "gemini-2.5-flash-preview-05-20".to_string(),
            executor: "gemini-2.0-flash".to_string(),
        },
    });

    // ── xAI (X Premium+ / Grok — $16/mo, Cookie Session) ─────────────
    configs.insert(AiProvider::Xai, ProviderConfig {
        provider: AiProvider::Xai,
        plan_name: "X Premium+".to_string(),
        auth_type: AuthType::CookieSession,
        vault_namespace: "ai_providers".to_string(),
        vault_service: "xai_grok".to_string(),
        chat_endpoint: "/api/ai/xai/chat".to_string(),
        stream_endpoint: "/api/ai/xai/stream".to_string(),
        upstream_url: "https://grok.x.com/rest/app-chat/conversations/new".to_string(),
        extra_headers: HashMap::from([
            ("x-twitter-auth-type".to_string(), "OAuth2Session".to_string()),
        ]),
        monthly_cost_cents: 1600,
        model_tiers: ModelTiers {
            commander: "grok-3".to_string(),
            coordinator: "grok-3-mini".to_string(),
            executor: "grok-3-mini-fast".to_string(),
        },
    });

    // ── DeepSeek (free/Pro — $0, API Key via Vault Bouncer) ───────────
    configs.insert(AiProvider::DeepSeek, ProviderConfig {
        provider: AiProvider::DeepSeek,
        plan_name: "DeepSeek".to_string(),
        auth_type: AuthType::ApiKeyViaVault,
        vault_namespace: "ai_providers".to_string(),
        vault_service: "deepseek".to_string(),
        chat_endpoint: "/api/ai/deepseek/chat".to_string(),
        stream_endpoint: "/api/ai/deepseek/stream".to_string(),
        upstream_url: "https://api.deepseek.com/v1/chat/completions".to_string(),
        extra_headers: HashMap::new(),
        monthly_cost_cents: 0,
        model_tiers: ModelTiers {
            commander: "deepseek-reasoner".to_string(),
            coordinator: "deepseek-chat".to_string(),
            executor: "deepseek-chat".to_string(),
        },
    });

    // ── Ollama (local, free — no auth) ────────────────────────────────
    configs.insert(AiProvider::Ollama, ProviderConfig {
        provider: AiProvider::Ollama,
        plan_name: "Ollama Local".to_string(),
        auth_type: AuthType::None,
        vault_namespace: "ai_providers".to_string(),
        vault_service: "ollama_local".to_string(),
        chat_endpoint: "/api/ai/ollama/chat".to_string(),
        stream_endpoint: "/api/ai/ollama/stream".to_string(),
        upstream_url: "http://localhost:11434/api/chat".to_string(),
        extra_headers: HashMap::new(),
        monthly_cost_cents: 0,
        model_tiers: ModelTiers {
            commander: "llama3.1:70b".to_string(),
            coordinator: "llama3.1:8b".to_string(),
            executor: "llama3.1:8b".to_string(),
        },
    });

    configs
}

// ── Tests ─────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    // NOTE: AiProvider, ModelTier, ModelTiers, detect_provider, detect_tier tests
    // are now in jaskier-model-router crate (43 tests). These tests cover only
    // the gateway-specific types (AuthType, ProviderConfig, default_provider_configs).

    #[test]
    fn default_configs_has_all_providers() {
        let configs = default_provider_configs();
        assert_eq!(configs.len(), 6);
        for provider in AiProvider::ALL {
            assert!(configs.contains_key(&provider), "Missing config for {}", provider);
        }
    }

    #[test]
    fn default_configs_vault_namespace_consistent() {
        let configs = default_provider_configs();
        for config in configs.values() {
            assert_eq!(config.vault_namespace, "ai_providers");
        }
    }

    #[test]
    fn default_configs_anthropic_details() {
        let configs = default_provider_configs();
        let anthropic = &configs[&AiProvider::Anthropic];
        assert_eq!(anthropic.plan_name, "Claude Max");
        assert_eq!(anthropic.auth_type, AuthType::OAuthPkce);
        assert_eq!(anthropic.vault_service, "anthropic_max");
        assert_eq!(anthropic.monthly_cost_cents, 10000);
        assert_eq!(anthropic.model_tiers.commander, "claude-opus-4-6");
        assert_eq!(anthropic.model_tiers.coordinator, "claude-sonnet-4-6");
        assert!(anthropic.extra_headers.contains_key("anthropic-version"));
    }

    #[test]
    fn default_configs_ollama_no_auth() {
        let configs = default_provider_configs();
        let ollama = &configs[&AiProvider::Ollama];
        assert_eq!(ollama.auth_type, AuthType::None);
        assert_eq!(ollama.monthly_cost_cents, 0);
        assert!(ollama.extra_headers.is_empty());
    }

    #[test]
    fn auth_type_display() {
        assert_eq!(AuthType::OAuthPkce.to_string(), "oauth_pkce");
        assert_eq!(AuthType::SessionToken.to_string(), "session_token");
        assert_eq!(AuthType::CookieSession.to_string(), "cookie_session");
        assert_eq!(AuthType::ApiKeyViaVault.to_string(), "api_key_via_vault");
        assert_eq!(AuthType::None.to_string(), "none");
    }

    #[test]
    fn total_monthly_cost() {
        let configs = default_provider_configs();
        let total: u32 = configs.values().map(|c| c.monthly_cost_cents).sum();
        // $100 + $20 + $19.99 + $16 + $0 + $0 = $155.99 = 15599 cents
        assert_eq!(total, 15599);
    }
}
