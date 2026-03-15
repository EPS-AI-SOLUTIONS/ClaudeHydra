// semantic_cache — Thin re-export module.
//
// All implementation has been extracted to the shared `jaskier-semantic-cache` crate.
// This module re-exports everything for backward compatibility with existing CH code.

pub use jaskier_semantic_cache::*;

// Re-export sub-modules so `crate::semantic_cache::embeddings::EmbeddingClient` still works.
pub use jaskier_semantic_cache::compressor;
pub use jaskier_semantic_cache::embeddings;
pub use jaskier_semantic_cache::handlers;
pub use jaskier_semantic_cache::metrics;
pub use jaskier_semantic_cache::qdrant;
pub use jaskier_semantic_cache::types;
