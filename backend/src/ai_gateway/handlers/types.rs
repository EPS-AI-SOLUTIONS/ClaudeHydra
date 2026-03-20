// types.rs — Request / Response types for the AI Gateway HTTP handlers.

use serde::{Deserialize, Serialize};

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
