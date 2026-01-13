<#
.SYNOPSIS
    Initialize AI Handler and integrate with existing systems
.DESCRIPTION
    Sets up the AI Model Handler module and provides integration
    with the api-usage-tracker for unified usage tracking.
.EXAMPLE
    . .\Initialize-AIHandler.ps1
#>

$ErrorActionPreference = "Stop"
$script:AIHandlerRoot = $PSScriptRoot

Write-Host @"

  ╔═══════════════════════════════════════════════════════════════╗
  ║     AI MODEL HANDLER v1.0 - Auto Fallback & Optimization      ║
  ╠═══════════════════════════════════════════════════════════════╣
  ║  Features:                                                    ║
  ║    • Auto-retry with model downgrade (Opus→Sonnet→Haiku)     ║
  ║    • Rate limit aware switching                               ║
  ║    • Cost optimizer for model selection                       ║
  ║    • Multi-provider fallback (Anthropic→OpenAI→Google→...)   ║
  ╚═══════════════════════════════════════════════════════════════╝

"@ -ForegroundColor Cyan

# Import the main module
$modulePath = Join-Path $script:AIHandlerRoot "AIModelHandler.psm1"
if (Test-Path $modulePath) {
    Import-Module $modulePath -Force -Global
    Write-Host "[OK] AIModelHandler module loaded" -ForegroundColor Green
} else {
    Write-Host "[ERROR] Module not found: $modulePath" -ForegroundColor Red
    return
}

# Initialize state
Initialize-AIState | Out-Null

# Check available providers
$config = Get-AIConfig
$available = @()

foreach ($providerName in $config.providerFallbackOrder) {
    $provider = $config.providers[$providerName]
    if (-not $provider.enabled) { continue }

    $hasKey = -not $provider.apiKeyEnv -or [Environment]::GetEnvironmentVariable($provider.apiKeyEnv)
    if ($hasKey) {
        $available += $providerName
        $keyInfo = if ($provider.apiKeyEnv) { "(via $($provider.apiKeyEnv))" } else { "(no key required)" }
        Write-Host "[OK] $($provider.name) available $keyInfo" -ForegroundColor Green
    } else {
        Write-Host "[--] $($provider.name) - missing $($provider.apiKeyEnv)" -ForegroundColor Yellow
    }
}

if ($available.Count -eq 0) {
    Write-Host "`n[WARNING] No providers available. Set at least ANTHROPIC_API_KEY" -ForegroundColor Red
} else {
    Write-Host "`n[READY] $($available.Count) provider(s) configured" -ForegroundColor Cyan
}

# Create convenience aliases
Set-Alias -Name ai -Value (Join-Path $script:AIHandlerRoot "Invoke-AI.ps1") -Scope Global -Force
Set-Alias -Name aistat -Value { Get-AIStatus } -Scope Global -Force
Set-Alias -Name aihealth -Value (Join-Path $script:AIHandlerRoot "Invoke-AIHealth.ps1") -Scope Global -Force

Write-Host @"

Quick Commands:
  Get-AIStatus          - View all providers and rate limits
  Get-AIHealth          - Health dashboard (status, tokens, cost)
  Test-AIProviders      - Test connectivity to all providers
  Get-OptimalModel      - Auto-select best model for task
  Invoke-AIRequest      - Make AI request with auto-fallback
  Reset-AIState         - Reset usage tracking

Invoke-AI.ps1 Examples:
  .\Invoke-AI.ps1 -Prompt "Hello"
  .\Invoke-AI.ps1 -Prompt "Write code" -Task code -PreferCheapest
  .\Invoke-AI.ps1 -Status
  .\Invoke-AI.ps1 -Test

"@ -ForegroundColor Gray

# Integration with existing api-usage-tracker
$trackerPath = Join-Path (Split-Path $script:AIHandlerRoot) "api-usage-tracker.ps1"
if (Test-Path $trackerPath) {
    Write-Host "[OK] Legacy api-usage-tracker.ps1 found - compatible mode enabled" -ForegroundColor Green

    # Create unified logging function
    function global:Log-AIUsage {
        param(
            [int]$InputTokens,
            [int]$OutputTokens,
            [string]$Model,
            [string]$Provider = "anthropic",
            [string]$Operation = "chat"
        )

        # Log to new system
        Update-UsageTracking -Provider $Provider -Model $Model `
            -InputTokens $InputTokens -OutputTokens $OutputTokens

        # Log to legacy system
        & $trackerPath -Command log -InputTokens $InputTokens `
            -OutputTokens $OutputTokens -Model $Model -Operation $Operation
    }

    Write-Host "[OK] Unified Log-AIUsage function created" -ForegroundColor Green
}

Write-Host "`n" # Spacing
