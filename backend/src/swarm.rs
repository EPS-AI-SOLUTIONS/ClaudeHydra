// ClaudeHydra Swarm IPC integration
//
// Wires jaskier-swarm into ClaudeHydra's AppState and router.

use std::collections::HashMap;
use std::sync::Arc;
use std::time::Duration;

use tokio::sync::{RwLock, broadcast};

use jaskier_swarm::{
    SwarmEvent, SwarmOrchestrator, SwarmRegistry, SwarmTask,
    handlers::HasSwarmHub,
};

/// Swarm state embedded in AppState.
#[derive(Clone)]
pub struct SwarmState {
    pub registry: SwarmRegistry,
    pub orchestrator: SwarmOrchestrator,
    pub tasks: Arc<RwLock<HashMap<String, SwarmTask>>>,
    pub event_tx: broadcast::Sender<SwarmEvent>,
}

impl SwarmState {
    pub fn new() -> Self {
        let registry = SwarmRegistry::new("claudehydra");
        let (event_tx, _) = broadcast::channel(256);
        let orchestrator = SwarmOrchestrator::new(registry.clone(), event_tx.clone());

        Self {
            registry,
            orchestrator,
            tasks: Arc::new(RwLock::new(HashMap::new())),
            event_tx,
        }
    }

    /// Start background discovery loop (probes peers every 30s).
    pub fn start_discovery(&self) {
        let registry = self.registry.clone();
        let event_tx = self.event_tx.clone();

        tokio::spawn(async move {
            let mut interval = tokio::time::interval(Duration::from_secs(30));
            loop {
                interval.tick().await;
                let peers = registry.discover().await;
                let online = peers
                    .iter()
                    .filter(|p| p.status == jaskier_swarm::PeerStatus::Online)
                    .count();
                tracing::debug!("Swarm discovery: {}/{} peers online", online, peers.len());

                // Emit discovery events for newly found peers
                for peer in &peers {
                    if peer.status == jaskier_swarm::PeerStatus::Online && peer.id != "claudehydra" {
                        let _ = event_tx.send(
                            SwarmEvent::new(
                                jaskier_swarm::SwarmEventType::PeerDiscovered,
                                "discovery",
                                &format!("{} is online", peer.name),
                            )
                            .with_peer(&peer.id),
                        );
                    }
                }
            }
        });
    }
}

// ── HasSwarmHub impl for AppState ────────────────────────────────────────

impl HasSwarmHub for crate::state::AppState {
    fn swarm_registry(&self) -> &SwarmRegistry {
        &self.swarm.registry
    }

    fn swarm_orchestrator(&self) -> &SwarmOrchestrator {
        &self.swarm.orchestrator
    }

    fn swarm_tasks(&self) -> &Arc<RwLock<HashMap<String, SwarmTask>>> {
        &self.swarm.tasks
    }

    fn swarm_event_tx(&self) -> &broadcast::Sender<SwarmEvent> {
        &self.swarm.event_tx
    }

    fn swarm_db(&self) -> &sqlx::PgPool {
        &self.base.db
    }

    fn swarm_self_id(&self) -> &str {
        "claudehydra"
    }
}

/// MCP tool definition for `swarm_delegate_task`.
///
/// Returns the tool definition JSON for inclusion in CH's tool executor.
pub fn swarm_delegate_tool_def() -> serde_json::Value {
    serde_json::json!({
        "name": "swarm_delegate_task",
        "description": "Delegate a task to other AI agents in the Jaskier Swarm. Sends a prompt (with optional multimodal attachments — images, PDFs, documents) to one or more peer Hydra instances (GeminiHydra, GrokHydra, OpenAIHydra, DeepSeekHydra) for parallel or sequential execution. Returns aggregated results from all agents, including any attachments they produce.",
        "input_schema": {
            "type": "object",
            "properties": {
                "prompt": {
                    "type": "string",
                    "description": "The task prompt to delegate to other agents"
                },
                "pattern": {
                    "type": "string",
                    "enum": ["parallel", "sequential", "review", "fan_out"],
                    "description": "Orchestration pattern. 'parallel' sends to all targets simultaneously. 'sequential' chains output→input (including attachments). 'review' has one agent work and another review."
                },
                "targets": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "Target peer IDs (e.g. ['geminihydra', 'grokhydra']). Empty = all online peers."
                },
                "attachments": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "content_type": {"type": "string", "description": "MIME type (e.g. 'image/png', 'application/pdf')"},
                            "url": {"type": "string", "description": "URL or file path to the attachment"},
                            "name": {"type": "string", "description": "Human-readable filename"}
                        },
                        "required": ["content_type", "url"]
                    },
                    "description": "Optional multimodal attachments (images, PDFs, documents) to include with the task"
                },
                "timeout_secs": {
                    "type": "integer",
                    "description": "Timeout per peer in seconds (default: 120)"
                }
            },
            "required": ["prompt"]
        }
    })
}
