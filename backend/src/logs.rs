// Jaskier Shared Pattern — logs
// Generic log handlers live in the shared crate.
// AppState implements HasLogBuffer in state.rs.

pub use jaskier_core::logs::{BackendLogsQuery, backend_logs, clear_backend_logs};
