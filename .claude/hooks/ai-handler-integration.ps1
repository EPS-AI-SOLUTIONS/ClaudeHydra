# AI Handler Integration for Claude Code (GeminiCLI)
# Provides context and recommendations for each prompt
# Uses shared AI Handler from ClaudeCLI

param(
    [Parameter(ValueFromPipeline=$true)]
    [string]$InputJson
)

$ErrorActionPreference = 'SilentlyContinue'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

# Parse hook input
$hookData = $null
if ($InputJson) {
    try { $hookData = $InputJson | ConvertFrom-Json } catch { }
}

# Extract prompt
$prompt = if ($hookData.prompt) { $hookData.prompt }
          elseif ($hookData.user_prompt) { $hookData.user_prompt }
          elseif ($env:CLAUDE_USER_PROMPT) { $env:CLAUDE_USER_PROMPT }
          else { $null }

# Skip for empty, short, or command prompts
if (-not $prompt -or $prompt.Length -lt 5 -or $prompt.StartsWith('/')) {
    exit 0
}

# Initialize AI Handler (shared from ClaudeCLI)
[Environment]::SetEnvironmentVariable('CLAUDECLI_ENCRYPTION_KEY', 'ClaudeCLI-2024', 'Process')
$aiHandlerPath = "C:\Users\BIURODOM\Desktop\ClaudeCLI\ai-handler"

# Quietly load modules
$null = Import-Module "$aiHandlerPath\AIModelHandler.psm1" -Force 2>&1
$null = Import-Module "$aiHandlerPath\modules\PromptOptimizer.psm1" -Force 2>&1

# Quick analysis
$category = "general"
$modelRec = "llama3.2:3b"

# Detect category from keywords
$promptLower = $prompt.ToLower()
if ($promptLower -match 'write|code|function|implement|script|class|def |fn ') {
    $category = "code"
    $modelRec = "qwen2.5-coder:1.5b"
} elseif ($promptLower -match 'explain|analyze|compare|why|how does') {
    $category = "analysis"
    $modelRec = "llama3.2:3b"
} elseif ($promptLower -match 'quick|fast|simple|what is|\?$') {
    $category = "quick"
    $modelRec = "llama3.2:1b"
} elseif ($promptLower -match 'debug|fix|error|issue|bug') {
    $category = "debug"
    $modelRec = "phi3:mini"
}

# Get CPU load
$cpu = 0
try {
    $cpu = [math]::Round((Get-CimInstance Win32_Processor).LoadPercentage, 0)
} catch { $cpu = 50 }

$provider = if ($cpu -lt 70) { "local" } elseif ($cpu -lt 90) { "hybrid" } else { "cloud" }

# Output context for Claude
Write-Output @"

<user-prompt-submit-hook>
AI Handler Active - Prompt Analysis:
  Category: $category
  Model: $modelRec
  Provider: $provider (CPU: $cpu%)
  Project: GeminiCLI

Quick Commands:
  /ai <query>     - Local AI (free)
  /ai-batch       - Parallel queries
  /ai-status      - Check providers
</user-prompt-submit-hook>
"@
