// model_router.rs — Inteligentny routing modeli AI
// Wybiera providera na podstawie model ID, fallback chain, tier-based selection
// Fallback order: Anthropic -> Google -> OpenAI -> DeepSeek -> Ollama

use std::collections::HashMap;

use anyhow::{Context, Result, bail};
use serde::{Deserialize, Serialize};
use tracing;

use super::{AiProvider, default_provider_configs};

// ── ModelTier ────────────────────────────────────────────────────────────────

/// Operational tier for model selection.
/// Maps to agent roles in the Jaskier swarm architecture.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ModelTier {
    /// Strongest model — complex reasoning, architecture decisions, multi-step planning.
    /// Examples: claude-opus-4-6, gemini-2.5-pro, gpt-4o, grok-3, deepseek-reasoner.
    Commander,
    /// Balanced model — general-purpose coordination, tool use, moderate complexity.
    /// Examples: claude-sonnet-4-6, gemini-2.5-flash, gpt-4o-mini, grok-3-mini.
    Coordinator,
    /// Fastest/cheapest model — simple tasks, classification, quick responses.
    /// Examples: claude-haiku-4-5, gemini-2.0-flash, grok-3-mini-fast.
    Executor,
}

impl std::fmt::Display for ModelTier {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            ModelTier::Commander => write!(f, "commander"),
            ModelTier::Coordinator => write!(f, "coordinator"),
            ModelTier::Executor => write!(f, "executor"),
        }
    }
}

impl ModelTier {
    /// All tier variants for iteration.
    pub const ALL: [ModelTier; 3] = [
        ModelTier::Commander,
        ModelTier::Coordinator,
        ModelTier::Executor,
    ];
}

// ── ModelRoute ───────────────────────────────────────────────────────────────

/// A resolved route for an AI model request.
/// Contains everything needed to dispatch the request to the correct provider.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModelRoute {
    /// The AI provider that will handle this request.
    pub provider: AiProvider,
    /// The model ID as requested by the caller.
    pub model_id: String,
    /// The actual model name to send upstream to the provider API.
    /// May differ from `model_id` (e.g., alias resolution).
    pub upstream_model: String,
    /// The operational tier this model belongs to.
    pub tier: ModelTier,
    /// Priority within the tier (0 = highest priority, used for fallback ordering).
    pub priority: u8,
}

impl std::fmt::Display for ModelRoute {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(
            f,
            "{}:{} [{}] (priority={})",
            self.provider, self.upstream_model, self.tier, self.priority
        )
    }
}

// ── ModelRouter ──────────────────────────────────────────────────────────────

/// Intelligent model router — resolves model IDs to provider routes,
/// supports fallback chains and tier-based selection.
///
/// The router is initialized from `default_provider_configs()` and can be
/// extended at runtime with custom routes and overrides.
pub struct ModelRouter {
    /// All known model routes, ordered by priority within each tier.
    routes: Vec<ModelRoute>,
    /// Ordered list of providers for fallback when the primary is unavailable.
    fallback_chain: Vec<AiProvider>,
    /// Default model for each (tier, provider) combination.
    /// Key: ModelTier -> Vec<(provider, model_id)> ordered by priority.
    tier_defaults: HashMap<ModelTier, Vec<(AiProvider, String)>>,
}

impl ModelRouter {
    /// Create a new ModelRouter with default routes from all provider configs.
    ///
    /// Initializes the fallback chain as:
    ///   Anthropic -> Google -> OpenAI -> DeepSeek -> Ollama
    ///
    /// Populates tier_defaults from each provider's `model_tiers` configuration.
    pub fn new() -> Self {
        let configs = default_provider_configs();

        let fallback_chain = vec![
            AiProvider::Anthropic,
            AiProvider::Google,
            AiProvider::OpenAI,
            AiProvider::Xai,
            AiProvider::DeepSeek,
            AiProvider::Ollama,
        ];

        let mut routes = Vec::new();
        let mut tier_defaults: HashMap<ModelTier, Vec<(AiProvider, String)>> = HashMap::new();

        // Build routes and tier defaults from provider configs
        for (priority, provider) in fallback_chain.iter().enumerate() {
            if let Some(config) = configs.get(provider) {
                let pri = priority as u8;

                // Commander route
                routes.push(ModelRoute {
                    provider: *provider,
                    model_id: config.model_tiers.commander.clone(),
                    upstream_model: config.model_tiers.commander.clone(),
                    tier: ModelTier::Commander,
                    priority: pri,
                });
                tier_defaults
                    .entry(ModelTier::Commander)
                    .or_default()
                    .push((*provider, config.model_tiers.commander.clone()));

                // Coordinator route
                routes.push(ModelRoute {
                    provider: *provider,
                    model_id: config.model_tiers.coordinator.clone(),
                    upstream_model: config.model_tiers.coordinator.clone(),
                    tier: ModelTier::Coordinator,
                    priority: pri,
                });
                tier_defaults
                    .entry(ModelTier::Coordinator)
                    .or_default()
                    .push((*provider, config.model_tiers.coordinator.clone()));

                // Executor route
                routes.push(ModelRoute {
                    provider: *provider,
                    model_id: config.model_tiers.executor.clone(),
                    upstream_model: config.model_tiers.executor.clone(),
                    tier: ModelTier::Executor,
                    priority: pri,
                });
                tier_defaults
                    .entry(ModelTier::Executor)
                    .or_default()
                    .push((*provider, config.model_tiers.executor.clone()));
            }
        }

        tracing::debug!(
            "model_router: initialized with {} routes, {} providers in fallback chain",
            routes.len(),
            fallback_chain.len()
        );

        Self {
            routes,
            fallback_chain,
            tier_defaults,
        }
    }

    /// Resolve a model ID to a `ModelRoute`.
    ///
    /// Resolution order:
    /// 1. Exact match in known routes
    /// 2. Provider detection from model ID prefix + tier detection
    /// 3. Error if model cannot be mapped to any provider
    pub fn resolve_model(&self, requested_model: &str) -> Result<ModelRoute> {
        // 1. Exact match in known routes
        if let Some(route) = self.routes.iter().find(|r| r.model_id == requested_model) {
            tracing::debug!(
                "model_router: exact match for '{}' -> {}:{}",
                requested_model,
                route.provider,
                route.upstream_model
            );
            return Ok(route.clone());
        }

        // 2. Detect provider and tier from model ID
        let provider = Self::detect_provider(requested_model).context(format!(
            "cannot detect AI provider for model '{}'",
            requested_model
        ))?;
        let tier = Self::detect_tier(requested_model);

        // Find priority for this provider from fallback chain
        let priority = self
            .fallback_chain
            .iter()
            .position(|p| *p == provider)
            .unwrap_or(99) as u8;

        let route = ModelRoute {
            provider,
            model_id: requested_model.to_string(),
            upstream_model: requested_model.to_string(),
            tier,
            priority,
        };

        tracing::debug!(
            "model_router: detected '{}' -> {} [{}] (priority={})",
            requested_model,
            route.provider,
            route.tier,
            route.priority
        );

        Ok(route)
    }

    /// Select the best available model for a given tier, considering which
    /// providers are currently available.
    ///
    /// Iterates through `tier_defaults` in priority order, returning the first
    /// model whose provider is in the `available_providers` list.
    pub fn resolve_by_tier(
        &self,
        tier: ModelTier,
        available_providers: &[AiProvider],
    ) -> Result<ModelRoute> {
        let defaults = self.tier_defaults.get(&tier).context(format!(
            "no default models configured for tier '{}'",
            tier
        ))?;

        for (provider, model_id) in defaults {
            if available_providers.contains(provider) {
                let priority = self
                    .fallback_chain
                    .iter()
                    .position(|p| p == provider)
                    .unwrap_or(99) as u8;

                let route = ModelRoute {
                    provider: *provider,
                    model_id: model_id.clone(),
                    upstream_model: model_id.clone(),
                    tier,
                    priority,
                };

                tracing::info!(
                    "model_router: tier={} -> {} ({}, priority={})",
                    tier,
                    model_id,
                    provider,
                    priority
                );

                return Ok(route);
            }
        }

        bail!(
            "no available provider for tier '{}' — available: {:?}, needed one of: {:?}",
            tier,
            available_providers,
            defaults.iter().map(|(p, _)| p).collect::<Vec<_>>()
        )
    }

    /// Return the ordered fallback chain starting from the given primary provider.
    ///
    /// The primary provider is placed first, followed by the remaining providers
    /// in the default fallback order with the primary removed.
    ///
    /// Example: `fallback_chain(Google)` -> `[Google, Anthropic, OpenAI, Xai, DeepSeek, Ollama]`
    pub fn fallback_chain(&self, primary: AiProvider) -> Vec<AiProvider> {
        let mut chain = vec![primary];
        for provider in &self.fallback_chain {
            if *provider != primary {
                chain.push(*provider);
            }
        }
        chain
    }

    /// Detect the AI provider from a model ID prefix.
    ///
    /// Rules:
    /// - `claude-*` or `anthropic-*` -> Anthropic
    /// - `gpt-*` or `o1-*` or `o3-*` -> OpenAI
    /// - `gemini-*` -> Google
    /// - `grok-*` -> Xai
    /// - `deepseek-*` -> DeepSeek
    /// - `llama*` or `mistral*` or `phi*` or `qwen*` -> Ollama
    pub fn detect_provider(model_id: &str) -> Option<AiProvider> {
        let lower = model_id.to_lowercase();

        if lower.starts_with("claude-") || lower.starts_with("anthropic-") {
            Some(AiProvider::Anthropic)
        } else if lower.starts_with("gpt-")
            || lower.starts_with("o1-")
            || lower.starts_with("o3-")
        {
            Some(AiProvider::OpenAI)
        } else if lower.starts_with("gemini-") {
            Some(AiProvider::Google)
        } else if lower.starts_with("grok-") {
            Some(AiProvider::Xai)
        } else if lower.starts_with("deepseek-") {
            Some(AiProvider::DeepSeek)
        } else if lower.starts_with("llama")
            || lower.starts_with("mistral")
            || lower.starts_with("phi")
            || lower.starts_with("qwen")
        {
            Some(AiProvider::Ollama)
        } else {
            None
        }
    }

    /// Detect the operational tier from a model ID.
    ///
    /// Tier detection rules (checked in order):
    /// - **Executor**: contains "haiku", "fast", "lite", "nano"
    /// - **Commander**: contains "opus", "pro" (not "preview" alone), "4o" (not "4o-mini"),
    ///   "grok-3" (not "grok-3-mini"), "reasoner", ":70b"
    /// - **Coordinator**: everything else (default tier)
    ///
    /// Executor is checked first to avoid false positives (e.g., "grok-3-mini-fast"
    /// should be Executor, not Coordinator).
    pub fn detect_tier(model_id: &str) -> ModelTier {
        let lower = model_id.to_lowercase();

        // Executor indicators — check first (most specific)
        if lower.contains("haiku")
            || lower.contains("-fast")
            || lower.contains("-lite")
            || lower.contains("nano")
        {
            return ModelTier::Executor;
        }

        // Commander indicators
        if lower.contains("opus") {
            return ModelTier::Commander;
        }

        // "pro" but not just in "preview" — actual "pro" model tier
        // Match: "gemini-2.5-pro", "gemini-2.5-pro-preview-06-05"
        // Don't match: some random "pro" in unrelated context
        if lower.contains("-pro") || lower.contains(":pro") {
            return ModelTier::Commander;
        }

        // "4o" but not "4o-mini"
        if lower.contains("4o") && !lower.contains("4o-mini") {
            return ModelTier::Commander;
        }

        // "grok-3" but not "grok-3-mini"
        if lower.contains("grok-3") && !lower.contains("grok-3-mini") {
            return ModelTier::Commander;
        }

        // Other commander signals
        if lower.contains("reasoner") || lower.contains(":70b") || lower.contains(":65b") {
            return ModelTier::Commander;
        }

        // Coordinator indicators (explicit)
        // "sonnet", "flash", "mini", "chat", ":8b" — all balanced-tier models
        if lower.contains("sonnet")
            || lower.contains("flash")
            || lower.contains("mini")
            || lower.contains("-chat")
            || lower.contains(":8b")
            || lower.contains(":7b")
        {
            return ModelTier::Coordinator;
        }

        // Default: Coordinator (safest default — not too expensive, not too weak)
        ModelTier::Coordinator
    }

    /// Get the default fallback chain (class method).
    pub fn default_fallback_chain() -> Vec<AiProvider> {
        vec![
            AiProvider::Anthropic,
            AiProvider::Google,
            AiProvider::OpenAI,
            AiProvider::Xai,
            AiProvider::DeepSeek,
            AiProvider::Ollama,
        ]
    }

    /// Get all registered routes (for diagnostics / admin API).
    pub fn routes(&self) -> &[ModelRoute] {
        &self.routes
    }

    /// Get the number of registered routes.
    pub fn route_count(&self) -> usize {
        self.routes.len()
    }

    /// Get tier defaults (for diagnostics).
    pub fn tier_defaults(&self) -> &HashMap<ModelTier, Vec<(AiProvider, String)>> {
        &self.tier_defaults
    }
}

impl Default for ModelRouter {
    fn default() -> Self {
        Self::new()
    }
}

// ── Tests ────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    // ── ModelTier tests ──────────────────────────────────────────────────

    #[test]
    fn tier_display() {
        assert_eq!(ModelTier::Commander.to_string(), "commander");
        assert_eq!(ModelTier::Coordinator.to_string(), "coordinator");
        assert_eq!(ModelTier::Executor.to_string(), "executor");
    }

    #[test]
    fn tier_serde_roundtrip() {
        for tier in ModelTier::ALL {
            let json = serde_json::to_string(&tier).unwrap();
            let parsed: ModelTier = serde_json::from_str(&json).unwrap();
            assert_eq!(parsed, tier);
        }
    }

    // ── Provider detection tests ─────────────────────────────────────────

    #[test]
    fn detect_provider_anthropic() {
        assert_eq!(
            ModelRouter::detect_provider("claude-opus-4-6"),
            Some(AiProvider::Anthropic)
        );
        assert_eq!(
            ModelRouter::detect_provider("claude-sonnet-4-6"),
            Some(AiProvider::Anthropic)
        );
        assert_eq!(
            ModelRouter::detect_provider("claude-haiku-4-5-20251001"),
            Some(AiProvider::Anthropic)
        );
        assert_eq!(
            ModelRouter::detect_provider("anthropic-custom-model"),
            Some(AiProvider::Anthropic)
        );
    }

    #[test]
    fn detect_provider_openai() {
        assert_eq!(
            ModelRouter::detect_provider("gpt-4o"),
            Some(AiProvider::OpenAI)
        );
        assert_eq!(
            ModelRouter::detect_provider("gpt-4o-mini"),
            Some(AiProvider::OpenAI)
        );
        assert_eq!(
            ModelRouter::detect_provider("o1-preview"),
            Some(AiProvider::OpenAI)
        );
        assert_eq!(
            ModelRouter::detect_provider("o3-mini"),
            Some(AiProvider::OpenAI)
        );
    }

    #[test]
    fn detect_provider_google() {
        assert_eq!(
            ModelRouter::detect_provider("gemini-2.5-pro-preview-06-05"),
            Some(AiProvider::Google)
        );
        assert_eq!(
            ModelRouter::detect_provider("gemini-2.5-flash-preview-05-20"),
            Some(AiProvider::Google)
        );
        assert_eq!(
            ModelRouter::detect_provider("gemini-2.0-flash"),
            Some(AiProvider::Google)
        );
    }

    #[test]
    fn detect_provider_xai() {
        assert_eq!(
            ModelRouter::detect_provider("grok-3"),
            Some(AiProvider::Xai)
        );
        assert_eq!(
            ModelRouter::detect_provider("grok-3-mini"),
            Some(AiProvider::Xai)
        );
        assert_eq!(
            ModelRouter::detect_provider("grok-3-mini-fast"),
            Some(AiProvider::Xai)
        );
    }

    #[test]
    fn detect_provider_deepseek() {
        assert_eq!(
            ModelRouter::detect_provider("deepseek-reasoner"),
            Some(AiProvider::DeepSeek)
        );
        assert_eq!(
            ModelRouter::detect_provider("deepseek-chat"),
            Some(AiProvider::DeepSeek)
        );
    }

    #[test]
    fn detect_provider_ollama() {
        assert_eq!(
            ModelRouter::detect_provider("llama3.1:70b"),
            Some(AiProvider::Ollama)
        );
        assert_eq!(
            ModelRouter::detect_provider("llama3.1:8b"),
            Some(AiProvider::Ollama)
        );
        assert_eq!(
            ModelRouter::detect_provider("mistral:latest"),
            Some(AiProvider::Ollama)
        );
        assert_eq!(
            ModelRouter::detect_provider("phi3:latest"),
            Some(AiProvider::Ollama)
        );
        assert_eq!(
            ModelRouter::detect_provider("qwen2:7b"),
            Some(AiProvider::Ollama)
        );
    }

    #[test]
    fn detect_provider_unknown() {
        assert_eq!(ModelRouter::detect_provider("unknown-model"), None);
        assert_eq!(ModelRouter::detect_provider("my-custom-thing"), None);
    }

    #[test]
    fn detect_provider_case_insensitive() {
        assert_eq!(
            ModelRouter::detect_provider("Claude-Opus-4-6"),
            Some(AiProvider::Anthropic)
        );
        assert_eq!(
            ModelRouter::detect_provider("GPT-4o"),
            Some(AiProvider::OpenAI)
        );
        assert_eq!(
            ModelRouter::detect_provider("GEMINI-2.5-pro"),
            Some(AiProvider::Google)
        );
    }

    // ── Tier detection tests ─────────────────────────────────────────────

    #[test]
    fn detect_tier_commander_models() {
        assert_eq!(
            ModelRouter::detect_tier("claude-opus-4-6"),
            ModelTier::Commander
        );
        assert_eq!(
            ModelRouter::detect_tier("gemini-2.5-pro-preview-06-05"),
            ModelTier::Commander
        );
        assert_eq!(
            ModelRouter::detect_tier("gpt-4o"),
            ModelTier::Commander
        );
        assert_eq!(
            ModelRouter::detect_tier("grok-3"),
            ModelTier::Commander
        );
        assert_eq!(
            ModelRouter::detect_tier("deepseek-reasoner"),
            ModelTier::Commander
        );
        assert_eq!(
            ModelRouter::detect_tier("llama3.1:70b"),
            ModelTier::Commander
        );
    }

    #[test]
    fn detect_tier_coordinator_models() {
        assert_eq!(
            ModelRouter::detect_tier("claude-sonnet-4-6"),
            ModelTier::Coordinator
        );
        assert_eq!(
            ModelRouter::detect_tier("gemini-2.5-flash-preview-05-20"),
            ModelTier::Coordinator
        );
        assert_eq!(
            ModelRouter::detect_tier("gpt-4o-mini"),
            ModelTier::Coordinator
        );
        assert_eq!(
            ModelRouter::detect_tier("grok-3-mini"),
            ModelTier::Coordinator
        );
        assert_eq!(
            ModelRouter::detect_tier("deepseek-chat"),
            ModelTier::Coordinator
        );
        assert_eq!(
            ModelRouter::detect_tier("llama3.1:8b"),
            ModelTier::Coordinator
        );
    }

    #[test]
    fn detect_tier_executor_models() {
        assert_eq!(
            ModelRouter::detect_tier("claude-haiku-4-5-20251001"),
            ModelTier::Executor
        );
        assert_eq!(
            ModelRouter::detect_tier("grok-3-mini-fast"),
            ModelTier::Executor
        );
        assert_eq!(
            ModelRouter::detect_tier("gemini-2.0-flash-lite"),
            ModelTier::Executor
        );
        assert_eq!(
            ModelRouter::detect_tier("some-model-nano"),
            ModelTier::Executor
        );
    }

    #[test]
    fn detect_tier_gpt4o_not_mini_is_commander() {
        assert_eq!(ModelRouter::detect_tier("gpt-4o"), ModelTier::Commander);
        assert_eq!(
            ModelRouter::detect_tier("gpt-4o-mini"),
            ModelTier::Coordinator
        );
    }

    #[test]
    fn detect_tier_grok3_not_mini_is_commander() {
        assert_eq!(ModelRouter::detect_tier("grok-3"), ModelTier::Commander);
        assert_eq!(
            ModelRouter::detect_tier("grok-3-mini"),
            ModelTier::Coordinator
        );
        assert_eq!(
            ModelRouter::detect_tier("grok-3-mini-fast"),
            ModelTier::Executor
        );
    }

    #[test]
    fn detect_tier_unknown_defaults_to_coordinator() {
        assert_eq!(
            ModelRouter::detect_tier("some-unknown-model"),
            ModelTier::Coordinator
        );
    }

    // ── ModelRouter construction tests ───────────────────────────────────

    #[test]
    fn router_initializes_with_routes() {
        let router = ModelRouter::new();
        // 6 providers * 3 tiers = 18 routes
        assert_eq!(router.route_count(), 18);
    }

    #[test]
    fn router_has_all_tiers_in_defaults() {
        let router = ModelRouter::new();
        for tier in ModelTier::ALL {
            assert!(
                router.tier_defaults().contains_key(&tier),
                "Missing tier defaults for {}",
                tier
            );
        }
    }

    #[test]
    fn router_tier_defaults_have_all_providers() {
        let router = ModelRouter::new();
        for tier in ModelTier::ALL {
            let defaults = &router.tier_defaults()[&tier];
            assert_eq!(
                defaults.len(),
                6,
                "Tier {} should have 6 provider defaults",
                tier
            );
        }
    }

    // ── resolve_model tests ──────────────────────────────────────────────

    #[test]
    fn resolve_model_exact_match() {
        let router = ModelRouter::new();

        let route = router.resolve_model("claude-opus-4-6").unwrap();
        assert_eq!(route.provider, AiProvider::Anthropic);
        assert_eq!(route.upstream_model, "claude-opus-4-6");
        assert_eq!(route.tier, ModelTier::Commander);
        assert_eq!(route.priority, 0); // Anthropic is first in fallback chain
    }

    #[test]
    fn resolve_model_exact_match_google() {
        let router = ModelRouter::new();

        let route = router
            .resolve_model("gemini-2.5-flash-preview-05-20")
            .unwrap();
        assert_eq!(route.provider, AiProvider::Google);
        assert_eq!(route.tier, ModelTier::Coordinator);
        assert_eq!(route.priority, 1); // Google is second in fallback chain
    }

    #[test]
    fn resolve_model_detected_unknown_model() {
        let router = ModelRouter::new();

        // A claude model not in the default routes — should detect provider + tier
        let route = router.resolve_model("claude-sonnet-5-0").unwrap();
        assert_eq!(route.provider, AiProvider::Anthropic);
        assert_eq!(route.model_id, "claude-sonnet-5-0");
        assert_eq!(route.upstream_model, "claude-sonnet-5-0");
        assert_eq!(route.tier, ModelTier::Coordinator); // "sonnet" -> coordinator
    }

    #[test]
    fn resolve_model_unknown_provider_fails() {
        let router = ModelRouter::new();
        let result = router.resolve_model("completely-unknown-model");
        assert!(result.is_err());
    }

    // ── resolve_by_tier tests ────────────────────────────────────────────

    #[test]
    fn resolve_by_tier_picks_highest_priority_available() {
        let router = ModelRouter::new();

        // All providers available — should pick Anthropic (priority 0)
        let route = router
            .resolve_by_tier(ModelTier::Commander, &AiProvider::ALL)
            .unwrap();
        assert_eq!(route.provider, AiProvider::Anthropic);
        assert_eq!(route.upstream_model, "claude-opus-4-6");
    }

    #[test]
    fn resolve_by_tier_skips_unavailable() {
        let router = ModelRouter::new();

        // Only Google and DeepSeek available — should pick Google (priority 1)
        let available = vec![AiProvider::Google, AiProvider::DeepSeek];
        let route = router
            .resolve_by_tier(ModelTier::Commander, &available)
            .unwrap();
        assert_eq!(route.provider, AiProvider::Google);
        assert_eq!(route.upstream_model, "gemini-2.5-pro-preview-06-05");
    }

    #[test]
    fn resolve_by_tier_falls_back_to_ollama() {
        let router = ModelRouter::new();

        let available = vec![AiProvider::Ollama];
        let route = router
            .resolve_by_tier(ModelTier::Coordinator, &available)
            .unwrap();
        assert_eq!(route.provider, AiProvider::Ollama);
        assert_eq!(route.upstream_model, "llama3.1:8b");
    }

    #[test]
    fn resolve_by_tier_no_available_provider_fails() {
        let router = ModelRouter::new();

        let result = router.resolve_by_tier(ModelTier::Commander, &[]);
        assert!(result.is_err());
    }

    // ── fallback_chain tests ─────────────────────────────────────────────

    #[test]
    fn fallback_chain_starts_with_primary() {
        let router = ModelRouter::new();

        let chain = router.fallback_chain(AiProvider::Google);
        assert_eq!(chain[0], AiProvider::Google);
        assert_eq!(chain.len(), 6);
        // Primary should not appear again
        assert_eq!(chain.iter().filter(|p| **p == AiProvider::Google).count(), 1);
    }

    #[test]
    fn fallback_chain_anthropic_first() {
        let router = ModelRouter::new();

        let chain = router.fallback_chain(AiProvider::Anthropic);
        assert_eq!(
            chain,
            vec![
                AiProvider::Anthropic,
                AiProvider::Google,
                AiProvider::OpenAI,
                AiProvider::Xai,
                AiProvider::DeepSeek,
                AiProvider::Ollama,
            ]
        );
    }

    #[test]
    fn fallback_chain_ollama_first() {
        let router = ModelRouter::new();

        let chain = router.fallback_chain(AiProvider::Ollama);
        assert_eq!(chain[0], AiProvider::Ollama);
        assert_eq!(chain[1], AiProvider::Anthropic);
        assert_eq!(chain.len(), 6);
    }

    // ── Default fallback chain test ──────────────────────────────────────

    #[test]
    fn default_fallback_chain_order() {
        let chain = ModelRouter::default_fallback_chain();
        assert_eq!(
            chain,
            vec![
                AiProvider::Anthropic,
                AiProvider::Google,
                AiProvider::OpenAI,
                AiProvider::Xai,
                AiProvider::DeepSeek,
                AiProvider::Ollama,
            ]
        );
    }

    // ── Integration: full routing flow ───────────────────────────────────

    #[test]
    fn full_routing_flow_anthropic_commander() {
        let router = ModelRouter::new();

        // User requests "claude-opus-4-6"
        let route = router.resolve_model("claude-opus-4-6").unwrap();
        assert_eq!(route.provider, AiProvider::Anthropic);
        assert_eq!(route.tier, ModelTier::Commander);
        assert_eq!(route.upstream_model, "claude-opus-4-6");

        // Verify fallback if Anthropic is down
        let chain = router.fallback_chain(route.provider);
        assert_eq!(chain[0], AiProvider::Anthropic);
        assert_eq!(chain[1], AiProvider::Google); // First fallback
    }

    #[test]
    fn full_routing_flow_tier_based() {
        let router = ModelRouter::new();

        // Agent needs an executor, only xAI and Ollama are online
        let available = vec![AiProvider::Xai, AiProvider::Ollama];
        let route = router
            .resolve_by_tier(ModelTier::Executor, &available)
            .unwrap();
        assert_eq!(route.provider, AiProvider::Xai);
        assert_eq!(route.upstream_model, "grok-3-mini-fast");
        assert_eq!(route.tier, ModelTier::Executor);
    }

    #[test]
    fn model_route_display_format() {
        let route = ModelRoute {
            provider: AiProvider::Anthropic,
            model_id: "claude-opus-4-6".to_string(),
            upstream_model: "claude-opus-4-6".to_string(),
            tier: ModelTier::Commander,
            priority: 0,
        };
        let display = format!("{}", route);
        assert!(display.contains("anthropic"));
        assert!(display.contains("claude-opus-4-6"));
        assert!(display.contains("commander"));
    }

    // ── Edge cases ───────────────────────────────────────────────────────

    #[test]
    fn detect_tier_gemini_flash_is_coordinator_not_executor() {
        // "flash" without "lite" or "fast" is coordinator-tier
        assert_eq!(
            ModelRouter::detect_tier("gemini-2.5-flash"),
            ModelTier::Coordinator
        );
        assert_eq!(
            ModelRouter::detect_tier("gemini-2.0-flash"),
            ModelTier::Coordinator
        );
    }

    #[test]
    fn detect_tier_gemini_flash_lite_is_executor() {
        assert_eq!(
            ModelRouter::detect_tier("gemini-2.0-flash-lite"),
            ModelTier::Executor
        );
    }

    #[test]
    fn resolve_model_deepseek_chat() {
        let router = ModelRouter::new();
        let route = router.resolve_model("deepseek-chat").unwrap();
        assert_eq!(route.provider, AiProvider::DeepSeek);
        // deepseek-chat appears as both coordinator and executor in defaults;
        // exact match should find the first occurrence (coordinator)
        assert!(
            route.tier == ModelTier::Coordinator || route.tier == ModelTier::Executor
        );
    }
}
