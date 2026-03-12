// Re-export stub -- system monitoring is provided by the shared `jaskier-tools` crate.
// Jaskier Shared Pattern -- system_monitor
//
// The `SystemSnapshot` type is re-exported from state.rs.
// The `spawn()` function is re-exported here so main.rs call-sites remain unchanged.

pub use jaskier_tools::system_monitor::spawn;
