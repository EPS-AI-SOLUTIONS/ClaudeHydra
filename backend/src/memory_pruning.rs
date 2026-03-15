// memory_pruning — Thin re-export from jaskier-memory-pruning shared crate.
//
// All logic (types, clustering, pruning cycle, handlers, metrics, watchdog)
// now lives in crates/jaskier-memory-pruning/. This module re-exports
// everything for backward compatibility with existing CH imports.

pub use jaskier_memory_pruning::*;
