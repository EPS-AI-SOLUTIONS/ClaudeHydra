// vault_handlers.rs — Re-export from shared jaskier-vault crate
//
// All handler types (AuditEntry, VaultNamespace) and the vault_proxy_router
// have been extracted to the `jaskier-vault` shared crate.

pub use jaskier_vault::handlers::*;
pub use jaskier_vault::{AuditEntry, VaultNamespace};
