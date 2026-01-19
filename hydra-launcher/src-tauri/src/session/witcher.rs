use super::types::*;
use std::time::SystemTime;

/// Witcher Mode - Intelligent CLI routing based on task characteristics
pub struct WitcherRouter {
    /// Route history for learning
    route_history: Vec<RouteDecision>,
}

/// A routing decision record
#[derive(Debug, Clone)]
pub struct RouteDecision {
    pub prompt: String,
    pub detected_type: TaskType,
    pub routed_to: CLIProvider,
    pub timestamp: u64,
    pub success: bool,
}

/// Types of tasks for intelligent routing
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TaskType {
    /// Code generation/editing
    CodeGeneration,
    /// Long context analysis (>100K tokens likely)
    LongContextAnalysis,
    /// Background/async task
    BackgroundTask,
    /// Multi-language code (non-English/non-standard)
    MultiLanguageCode,
    /// Symbolic code analysis
    SymbolicAnalysis,
    /// System operations
    SystemOperation,
    /// Security audit
    SecurityAudit,
    /// General query
    General,
}

/// Witcher Signs for specialized operations
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum WitcherSign {
    /// Aard - Fast code generation (Codex → DeepSeek)
    Aard,
    /// Igni - Deep analysis (Gemini with 2M context)
    Igni,
    /// Yrden - Background tasks (Jules)
    Yrden,
    /// Quen - Security audit (Grok → HYDRA)
    Quen,
    /// Axii - Multi-model consensus (All CLIs)
    Axii,
}

impl WitcherRouter {
    pub fn new() -> Self {
        Self {
            route_history: Vec::new(),
        }
    }

    /// Analyze prompt and determine the best CLI provider
    pub fn route(&mut self, prompt: &str) -> (CLIProvider, TaskType, Option<WitcherSign>) {
        let task_type = self.detect_task_type(prompt);
        let sign = self.detect_witcher_sign(prompt);

        let provider = if let Some(sign) = sign {
            self.route_by_sign(sign)
        } else {
            self.route_by_task_type(task_type)
        };

        // Record decision
        self.route_history.push(RouteDecision {
            prompt: prompt.chars().take(100).collect(),
            detected_type: task_type,
            routed_to: provider,
            timestamp: SystemTime::now()
                .duration_since(SystemTime::UNIX_EPOCH)
                .unwrap()
                .as_millis() as u64,
            success: true, // Will be updated later
        });

        (provider, task_type, sign)
    }

    /// Detect task type from prompt content
    fn detect_task_type(&self, prompt: &str) -> TaskType {
        let lower = prompt.to_lowercase();

        // Check for code generation patterns
        let code_patterns = [
            "napisz kod", "write code", "implement", "zaimplementuj",
            "create function", "stwórz funkcję", "add method", "dodaj metodę",
            "generate", "wygeneruj", "code", "kod",
        ];
        if code_patterns.iter().any(|p| lower.contains(p)) {
            return TaskType::CodeGeneration;
        }

        // Check for long context patterns
        let long_context_patterns = [
            "całą bazę", "entire codebase", "all files", "wszystkie pliki",
            "full repository", "cały projekt", "analyze everything",
            "przeanalizuj wszystko", "deep dive", "comprehensive",
        ];
        if long_context_patterns.iter().any(|p| lower.contains(p)) {
            return TaskType::LongContextAnalysis;
        }

        // Check for background task patterns
        let background_patterns = [
            "in background", "w tle", "async", "asynchronously",
            "później", "later", "schedule", "zaplanuj",
        ];
        if background_patterns.iter().any(|p| lower.contains(p)) {
            return TaskType::BackgroundTask;
        }

        // Check for symbolic analysis patterns
        let symbolic_patterns = [
            "find symbol", "znajdź symbol", "references", "referencje",
            "refactor", "rename", "zmień nazwę", "call graph",
        ];
        if symbolic_patterns.iter().any(|p| lower.contains(p)) {
            return TaskType::SymbolicAnalysis;
        }

        // Check for system operation patterns
        let system_patterns = [
            "run command", "uruchom", "execute", "wykonaj",
            "terminal", "shell", "bash", "powershell",
            "install", "zainstaluj", "build", "zbuduj",
        ];
        if system_patterns.iter().any(|p| lower.contains(p)) {
            return TaskType::SystemOperation;
        }

        // Check for security patterns
        let security_patterns = [
            "security", "bezpieczeństwo", "audit", "audyt",
            "vulnerability", "podatność", "pentest", "owasp",
        ];
        if security_patterns.iter().any(|p| lower.contains(p)) {
            return TaskType::SecurityAudit;
        }

        // Check for multi-language code
        let multilang_patterns = [
            "python", "rust", "java", "kotlin", "swift",
            "go ", "golang", "ruby", "php", "scala",
        ];
        if multilang_patterns.iter().any(|p| lower.contains(p)) {
            return TaskType::MultiLanguageCode;
        }

        TaskType::General
    }

    /// Detect if a Witcher sign is being invoked
    fn detect_witcher_sign(&self, prompt: &str) -> Option<WitcherSign> {
        let lower = prompt.to_lowercase();

        if lower.contains("/witcher aard") || lower.contains("aard") {
            return Some(WitcherSign::Aard);
        }
        if lower.contains("/witcher igni") || lower.contains("igni") {
            return Some(WitcherSign::Igni);
        }
        if lower.contains("/witcher yrden") || lower.contains("yrden") {
            return Some(WitcherSign::Yrden);
        }
        if lower.contains("/witcher quen") || lower.contains("quen") {
            return Some(WitcherSign::Quen);
        }
        if lower.contains("/witcher axii") || lower.contains("axii") {
            return Some(WitcherSign::Axii);
        }

        None
    }

    /// Route based on Witcher sign
    fn route_by_sign(&self, sign: WitcherSign) -> CLIProvider {
        match sign {
            WitcherSign::Aard => CLIProvider::DeepSeek, // Fast code gen
            WitcherSign::Igni => CLIProvider::Gemini,   // Deep analysis with 2M context
            WitcherSign::Yrden => CLIProvider::Jules,   // Background tasks
            WitcherSign::Quen => CLIProvider::Hydra,    // Security (HYDRA for now)
            WitcherSign::Axii => CLIProvider::Hydra,    // Multi-model consensus (orchestrate from HYDRA)
        }
    }

    /// Route based on task type
    fn route_by_task_type(&self, task_type: TaskType) -> CLIProvider {
        match task_type {
            TaskType::CodeGeneration => CLIProvider::Hydra,      // HYDRA is primary
            TaskType::LongContextAnalysis => CLIProvider::Gemini, // Gemini has 2M context
            TaskType::BackgroundTask => CLIProvider::Jules,       // Jules for async
            TaskType::MultiLanguageCode => CLIProvider::DeepSeek, // DeepSeek for 100+ languages
            TaskType::SymbolicAnalysis => CLIProvider::Hydra,     // HYDRA has Serena
            TaskType::SystemOperation => CLIProvider::Hydra,      // HYDRA has Desktop Commander
            TaskType::SecurityAudit => CLIProvider::Hydra,        // HYDRA for security
            TaskType::General => CLIProvider::Hydra,              // Default to HYDRA
        }
    }

    /// Update the success status of the last routing decision
    pub fn mark_result(&mut self, success: bool) {
        if let Some(last) = self.route_history.last_mut() {
            last.success = success;
        }
    }

    /// Get routing statistics
    pub fn get_stats(&self) -> WitcherStats {
        let total = self.route_history.len();
        let successful = self.route_history.iter().filter(|r| r.success).count();

        let mut by_provider: std::collections::HashMap<CLIProvider, usize> = std::collections::HashMap::new();
        for decision in &self.route_history {
            *by_provider.entry(decision.routed_to).or_insert(0) += 1;
        }

        WitcherStats {
            total_routed: total,
            successful,
            by_provider,
        }
    }
}

/// Statistics about Witcher routing
#[derive(Debug)]
pub struct WitcherStats {
    pub total_routed: usize,
    pub successful: usize,
    pub by_provider: std::collections::HashMap<CLIProvider, usize>,
}

impl Default for WitcherRouter {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_code_generation_routing() {
        let mut router = WitcherRouter::new();

        // Use "napisz kod" which is the actual pattern
        let (provider, task_type, _) = router.route("Proszę napisz kod do sortowania tablicy");
        assert_eq!(task_type, TaskType::CodeGeneration);
        assert_eq!(provider, CLIProvider::Hydra);
    }

    #[test]
    fn test_long_context_routing() {
        let mut router = WitcherRouter::new();

        // Use "całą bazę" without "kod" to avoid CodeGeneration match
        let (provider, task_type, _) = router.route("Przeanalizuj całą bazę projektu");
        assert_eq!(task_type, TaskType::LongContextAnalysis);
        assert_eq!(provider, CLIProvider::Gemini);
    }

    #[test]
    fn test_witcher_sign_routing() {
        let mut router = WitcherRouter::new();

        let (provider, _, sign) = router.route("/witcher igni analyze");
        assert_eq!(sign, Some(WitcherSign::Igni));
        assert_eq!(provider, CLIProvider::Gemini);
    }
}
