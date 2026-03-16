// ClaudeHydra — CRDT Real-time Collaboration (thin re-export)
//
// All logic lives in jaskier-collab. This module re-exports for backward compat.

pub use jaskier_collab::{CollabState, spawn_crdt_gc, spawn_idle_room_cleanup};
