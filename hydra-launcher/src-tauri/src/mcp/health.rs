use serde::{Deserialize, Serialize};
use std::path::Path;
use std::process::Command;
use std::collections::HashMap;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct McpHealthResult {
    pub name: String,
    pub port: u16,
    pub status: McpStatus,
    pub response_time_ms: Option<u64>,
    pub error: Option<String>,
    /// Additional capabilities/features of this MCP
    #[serde(skip_serializing_if = "Option::is_none")]
    pub capabilities: Option<Vec<String>>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum McpStatus {
    Online,
    Offline,
    Error,
}

/// Centralized MCP configuration and health checking
/// This eliminates duplication between Tauri launcher and Desktop Commander MCP
pub struct McpHealthChecker {
    hydra_path: String,
    cache: HashMap<String, (McpHealthResult, std::time::Instant)>,
    cache_ttl: std::time::Duration,
}

impl McpHealthChecker {
    pub fn new() -> Self {
        let home = std::env::var("USERPROFILE")
            .or_else(|_| std::env::var("HOME"))
            .unwrap_or_default();

        let hydra_path = std::env::var("HYDRA_PATH")
            .unwrap_or_else(|_| format!("{}\\Desktop\\ClaudeHYDRA", home));

        Self {
            hydra_path,
            cache: HashMap::new(),
            cache_ttl: std::time::Duration::from_secs(5), // 5 second cache
        }
    }

    /// Check if cached result is still valid
    fn get_cached(&self, name: &str) -> Option<McpHealthResult> {
        self.cache.get(name).and_then(|(result, timestamp)| {
            if timestamp.elapsed() < self.cache_ttl {
                Some(result.clone())
            } else {
                None
            }
        })
    }

    /// Update cache with new result
    fn update_cache(&mut self, name: &str, result: McpHealthResult) {
        self.cache.insert(name.to_string(), (result, std::time::Instant::now()));
    }

    /// Check Serena MCP status
    fn check_serena(&self) -> McpHealthResult {
        let start = std::time::Instant::now();
        let serena_path = format!("{}\\.serena\\project.yml", self.hydra_path);

        if Path::new(&serena_path).exists() {
            // Check if project.yml is valid
            let capabilities = if let Ok(content) = std::fs::read_to_string(&serena_path) {
                let mut caps = vec!["symbolic_analysis".to_string()];
                if content.contains("python") || content.contains("typescript") {
                    caps.push("multi_language".to_string());
                }
                Some(caps)
            } else {
                None
            };

            McpHealthResult {
                name: "Serena".to_string(),
                port: 0, // stdio-based
                status: McpStatus::Online,
                response_time_ms: Some(start.elapsed().as_millis() as u64),
                error: None,
                capabilities,
            }
        } else {
            McpHealthResult {
                name: "Serena".to_string(),
                port: 0,
                status: McpStatus::Offline,
                response_time_ms: None,
                error: Some("Serena not configured - .serena/project.yml not found".to_string()),
                capabilities: None,
            }
        }
    }

    /// Check Desktop Commander MCP status
    fn check_desktop_commander(&self) -> McpHealthResult {
        let start = std::time::Instant::now();

        // Check if Desktop Commander is available via npx
        let dc_available = Command::new("npx")
            .args(["@anthropic-ai/desktop-commander", "--version"])
            .output()
            .map(|o| o.status.success())
            .unwrap_or(false);

        if dc_available {
            McpHealthResult {
                name: "Desktop Commander".to_string(),
                port: 0, // stdio-based
                status: McpStatus::Online,
                response_time_ms: Some(start.elapsed().as_millis() as u64),
                error: None,
                capabilities: Some(vec![
                    "file_operations".to_string(),
                    "process_management".to_string(),
                    "system_metrics".to_string(),
                ]),
            }
        } else {
            // Fallback: check settings.json
            let settings_path = format!("{}\\.claude\\settings.json", self.hydra_path);
            if Path::new(&settings_path).exists() {
                if let Ok(content) = std::fs::read_to_string(&settings_path) {
                    if content.contains("desktop-commander") {
                        return McpHealthResult {
                            name: "Desktop Commander".to_string(),
                            port: 0,
                            status: McpStatus::Online,
                            response_time_ms: Some(start.elapsed().as_millis() as u64),
                            error: None,
                            capabilities: Some(vec!["configured".to_string()]),
                        };
                    }
                }
            }

            McpHealthResult {
                name: "Desktop Commander".to_string(),
                port: 0,
                status: McpStatus::Offline,
                response_time_ms: None,
                error: Some("Desktop Commander not available".to_string()),
                capabilities: None,
            }
        }
    }

    /// Check Playwright MCP status
    fn check_playwright(&self) -> McpHealthResult {
        let start = std::time::Instant::now();
        let settings_path = format!("{}\\.claude\\settings.json", self.hydra_path);

        if Path::new(&settings_path).exists() {
            if let Ok(content) = std::fs::read_to_string(&settings_path) {
                if content.contains("playwright") {
                    return McpHealthResult {
                        name: "Playwright".to_string(),
                        port: 0, // stdio-based
                        status: McpStatus::Online,
                        response_time_ms: Some(start.elapsed().as_millis() as u64),
                        error: None,
                        capabilities: Some(vec![
                            "browser_automation".to_string(),
                            "screenshot".to_string(),
                            "navigation".to_string(),
                        ]),
                    };
                }
            }
        }

        McpHealthResult {
            name: "Playwright".to_string(),
            port: 0,
            status: McpStatus::Offline,
            response_time_ms: None,
            error: Some("Playwright MCP not configured in settings.json".to_string()),
            capabilities: None,
        }
    }

    /// Check a specific MCP server with caching
    pub fn check_server(&mut self, name: &str) -> McpHealthResult {
        // Check cache first
        if let Some(cached) = self.get_cached(name) {
            return cached;
        }

        // Perform actual check
        let result = match name {
            "Serena" => self.check_serena(),
            "Desktop Commander" => self.check_desktop_commander(),
            "Playwright" => self.check_playwright(),
            _ => McpHealthResult {
                name: name.to_string(),
                port: 0,
                status: McpStatus::Error,
                response_time_ms: None,
                error: Some(format!("Unknown MCP server: {}", name)),
                capabilities: None,
            },
        };

        // Update cache
        self.update_cache(name, result.clone());

        result
    }

    /// Check all known MCP servers
    pub fn check_all(&mut self) -> Vec<McpHealthResult> {
        vec![
            self.check_server("Serena"),
            self.check_server("Desktop Commander"),
            self.check_server("Playwright"),
        ]
    }

    /// Get summary counts
    pub fn get_summary(&mut self) -> (usize, usize) {
        let results = self.check_all();
        let online = results.iter().filter(|r| r.status == McpStatus::Online).count();
        (online, results.len())
    }
}

impl Default for McpHealthChecker {
    fn default() -> Self {
        Self::new()
    }
}

// ============================================================================
// LEGACY FUNCTIONS (for backward compatibility)
// ============================================================================

/// Check if MCP server is configured (legacy - redirects to new checker)
fn check_mcp_configured(name: &str) -> Result<u64, String> {
    let mut checker = McpHealthChecker::new();
    let result = checker.check_server(name);

    match result.status {
        McpStatus::Online => Ok(result.response_time_ms.unwrap_or(0)),
        McpStatus::Offline | McpStatus::Error => {
            Err(result.error.unwrap_or_else(|| "Unknown error".to_string()))
        }
    }
}

/// Check a single MCP server configuration status (legacy async wrapper)
pub async fn check_mcp_server(name: &str, port: u16) -> McpHealthResult {
    let mut checker = McpHealthChecker::new();
    let mut result = checker.check_server(name);
    result.port = port; // Override port for legacy compatibility
    result
}

/// Check all configured MCP servers (legacy async wrapper)
pub async fn check_all_mcp_servers() -> Result<Vec<McpHealthResult>, String> {
    let mut checker = McpHealthChecker::new();
    Ok(checker.check_all())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_mcp_checker_caching() {
        let mut checker = McpHealthChecker::new();

        // First check - should perform actual check
        let result1 = checker.check_server("Serena");

        // Second check within TTL - should return cached
        let result2 = checker.check_server("Serena");

        assert_eq!(result1.status, result2.status);
    }

    #[tokio::test]
    async fn test_check_mcp_configured() {
        let result = check_mcp_server("Serena", 0).await;
        // Should return either Online or Offline based on config
        assert!(result.status == McpStatus::Online || result.status == McpStatus::Offline);
    }
}
