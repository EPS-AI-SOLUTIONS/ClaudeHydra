//! Prompt history endpoints — bash-like Arrow Up/Down recall.
//! Delegates to `jaskier_core::sessions` via `HasSessionsState`.

pub use jaskier_core::sessions::{list_prompt_history, add_prompt_history, clear_prompt_history};
