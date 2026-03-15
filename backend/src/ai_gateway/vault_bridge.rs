// vault_bridge.rs — Re-export from shared jaskier-vault crate
//
// All types, traits, and the VaultClient have been extracted to the
// `jaskier-vault` shared crate for reuse across all Hydra apps.

pub use jaskier_vault::*;
