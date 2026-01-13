<#
.SYNOPSIS
    Demonstrates AI Handler features
.DESCRIPTION
    Interactive demo showing all four AI handling capabilities:
    1. Auto-retry with fallback
    2. Rate limit aware switching
    3. Cost optimization
    4. Multi-provider support
#>

param(
    [switch]$SkipAPITests
)

$ErrorActionPreference = "Stop"

# Import module
$modulePath = Join-Path $PSScriptRoot "AIModelHandler.psm1"
Import-Module $modulePath -Force

Write-Host @"

╔════════════════════════════════════════════════════════════════════╗
║              AI MODEL HANDLER - FEATURE DEMONSTRATION              ║
╚════════════════════════════════════════════════════════════════════╝

"@ -ForegroundColor Cyan

#region Demo 1: Auto-Retry with Fallback Chain
Write-Host "═══════════════════════════════════════════════════════════════════" -ForegroundColor Yellow
Write-Host " DEMO 1: Auto-Retry with Model Fallback Chain" -ForegroundColor Yellow
Write-Host "═══════════════════════════════════════════════════════════════════" -ForegroundColor Yellow
Write-Host @"

When a model fails or rate limits, the system automatically:
  1. Retries with exponential backoff
  2. Falls back: Opus → Sonnet → Haiku
  3. Switches providers: Anthropic → OpenAI → Google → Mistral → Groq → Ollama

Fallback Chain Configuration:
"@ -ForegroundColor White

$config = Get-AIConfig
foreach ($provider in $config.providerFallbackOrder) {
    $chain = $config.fallbackChain[$provider] -join " → "
    Write-Host "  $provider`: $chain" -ForegroundColor Gray
}

Write-Host "`nProvider Fallback Order: $($config.providerFallbackOrder -join ' → ')" -ForegroundColor Gray
Write-Host ""
#endregion

#region Demo 2: Rate Limit Aware Switching
Write-Host "═══════════════════════════════════════════════════════════════════" -ForegroundColor Yellow
Write-Host " DEMO 2: Rate Limit Aware Switching" -ForegroundColor Yellow
Write-Host "═══════════════════════════════════════════════════════════════════" -ForegroundColor Yellow
Write-Host @"

The system monitors rate limits per model and auto-switches when:
  • Token usage > 85% of limit
  • Request count > 85% of limit

Current Rate Limit Status:
"@ -ForegroundColor White

foreach ($providerName in $config.providerFallbackOrder) {
    $provider = $config.providers[$providerName]
    $hasKey = -not $provider.apiKeyEnv -or [Environment]::GetEnvironmentVariable($provider.apiKeyEnv)
    if (-not $hasKey) { continue }

    Write-Host "`n  [$providerName]" -ForegroundColor Cyan
    foreach ($modelName in $provider.models.Keys) {
        $status = Get-RateLimitStatus -Provider $providerName -Model $modelName
        $model = $provider.models[$modelName]

        $tokColor = if ($status.tokensPercent -gt 85) { "Red" } elseif ($status.tokensPercent -gt 50) { "Yellow" } else { "Green" }
        $reqColor = if ($status.requestsPercent -gt 85) { "Red" } elseif ($status.requestsPercent -gt 50) { "Yellow" } else { "Green" }

        Write-Host "    $modelName" -ForegroundColor White
        Write-Host "      Limits: $($model.tokensPerMinute) tok/min | $($model.requestsPerMinute) req/min" -ForegroundColor Gray
        Write-Host "      Usage:  " -NoNewline -ForegroundColor Gray
        Write-Host "$($status.tokensPercent)% tokens" -NoNewline -ForegroundColor $tokColor
        Write-Host " | " -NoNewline -ForegroundColor Gray
        Write-Host "$($status.requestsPercent)% requests" -ForegroundColor $reqColor
    }
}
Write-Host ""
#endregion

#region Demo 3: Cost Optimization
Write-Host "═══════════════════════════════════════════════════════════════════" -ForegroundColor Yellow
Write-Host " DEMO 3: Cost Optimization" -ForegroundColor Yellow
Write-Host "═══════════════════════════════════════════════════════════════════" -ForegroundColor Yellow
Write-Host @"

Get-OptimalModel selects the best model based on:
  • Task type (simple, code, analysis, creative, vision)
  • Cost per token
  • Required capabilities
  • Current rate limits

"@ -ForegroundColor White

$tasks = @("simple", "code", "analysis", "creative", "vision")
Write-Host "Task-based Model Selection (with -PreferCheapest):" -ForegroundColor Cyan
Write-Host ""

foreach ($task in $tasks) {
    $optimal = Get-OptimalModel -Task $task -EstimatedTokens 1000 -PreferCheapest 6>$null
    if ($optimal) {
        Write-Host "  $($task.PadRight(10)) → $($optimal.provider)/$($optimal.model) " -NoNewline -ForegroundColor White
        Write-Host "(`$$([math]::Round($optimal.cost, 4)) est.)" -ForegroundColor Gray
    } else {
        Write-Host "  $($task.PadRight(10)) → No model available" -ForegroundColor Red
    }
}

Write-Host "`nModel Pricing Comparison:" -ForegroundColor Cyan
Write-Host "  Model                          Input     Output    Per 1K tokens" -ForegroundColor Gray
Write-Host "  ─────────────────────────────────────────────────────────────────" -ForegroundColor Gray

$allModels = @()
foreach ($providerName in $config.providers.Keys) {
    foreach ($modelName in $config.providers[$providerName].models.Keys) {
        $m = $config.providers[$providerName].models[$modelName]
        $allModels += @{
            name = "$providerName/$modelName"
            input = $m.inputCost
            output = $m.outputCost
            per1k = ($m.inputCost + $m.outputCost) / 1000
        }
    }
}

$allModels | Sort-Object per1k | ForEach-Object {
    $name = $_.name.Substring(0, [Math]::Min(32, $_.name.Length)).PadRight(32)
    Write-Host "  $name `$$($_.input.ToString('F2').PadLeft(6))   `$$($_.output.ToString('F2').PadLeft(6))   `$$($_.per1k.ToString('F4'))" -ForegroundColor White
}
Write-Host ""
#endregion

#region Demo 4: Multi-Provider Support
Write-Host "═══════════════════════════════════════════════════════════════════" -ForegroundColor Yellow
Write-Host " DEMO 4: Multi-Provider Support" -ForegroundColor Yellow
Write-Host "═══════════════════════════════════════════════════════════════════" -ForegroundColor Yellow
Write-Host @"

Supported providers with automatic failover:

"@ -ForegroundColor White

foreach ($providerName in $config.providerFallbackOrder) {
    $provider = $config.providers[$providerName]
    $keyEnv = $provider.apiKeyEnv
    $hasKey = -not $keyEnv -or [Environment]::GetEnvironmentVariable($keyEnv)

    $status = if ($hasKey) { "[AVAILABLE]" } else { "[MISSING KEY]" }
    $color = if ($hasKey) { "Green" } else { "Yellow" }

    Write-Host "  $providerName" -NoNewline -ForegroundColor Cyan
    Write-Host " $status" -ForegroundColor $color

    Write-Host "    Name: $($provider.name)" -ForegroundColor Gray
    Write-Host "    URL:  $($provider.baseUrl)" -ForegroundColor Gray
    if ($keyEnv) {
        $keyPreview = if ($hasKey) {
            $key = [Environment]::GetEnvironmentVariable($keyEnv)
            "$($key.Substring(0, [Math]::Min(15, $key.Length)))..."
        } else { "NOT SET" }
        Write-Host "    Key:  $keyEnv = $keyPreview" -ForegroundColor Gray
    }
    Write-Host "    Models: $($provider.models.Keys -join ', ')" -ForegroundColor Gray
    Write-Host ""
}
#endregion

#region Live API Test
if (-not $SkipAPITests) {
    Write-Host "═══════════════════════════════════════════════════════════════════" -ForegroundColor Yellow
    Write-Host " LIVE API TEST" -ForegroundColor Yellow
    Write-Host "═══════════════════════════════════════════════════════════════════" -ForegroundColor Yellow

    $runTest = Read-Host "`nRun live API test? This will make actual API calls (y/N)"

    if ($runTest -eq 'y') {
        Write-Host "`nTesting providers..." -ForegroundColor Cyan
        $results = Test-AIProviders

        Write-Host "`n--- Test Summary ---" -ForegroundColor Green
        $working = ($results | Where-Object { $_.status -eq "ok" }).Count
        Write-Host "Working providers: $working / $($results.Count)" -ForegroundColor $(if ($working -gt 0) { "Green" } else { "Red" })

        if ($working -gt 0) {
            Write-Host "`nMaking test request with auto-fallback..." -ForegroundColor Cyan

            try {
                $messages = @(
                    @{ role = "user"; content = "Say 'Hello from AI Handler!' and nothing else." }
                )

                $response = Invoke-AIRequest -Messages $messages -MaxTokens 50 -AutoFallback

                Write-Host "`nResponse: " -NoNewline -ForegroundColor Green
                Write-Host $response.content -ForegroundColor White
                Write-Host "Provider: $($response._meta.provider)" -ForegroundColor Gray
                Write-Host "Model: $($response._meta.model)" -ForegroundColor Gray
                Write-Host "Tokens: $($response.usage.input_tokens) in / $($response.usage.output_tokens) out" -ForegroundColor Gray

            } catch {
                Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Red
            }
        }
    }
}
#endregion

Write-Host @"

═══════════════════════════════════════════════════════════════════
 SUMMARY
═══════════════════════════════════════════════════════════════════

Files created in ai-handler/:
  • AIModelHandler.psm1    - Main module with all functions
  • ai-config.json         - Provider and model configuration
  • Invoke-AI.ps1          - Quick CLI wrapper
  • Initialize-AIHandler.ps1 - Setup and integration script
  • Demo-AIHandler.ps1     - This demo script

Usage:
  # Initialize (run once per session)
  . .\ai-handler\Initialize-AIHandler.ps1

  # Quick AI call
  .\ai-handler\Invoke-AI.ps1 -Prompt "Your question"

  # With options
  .\ai-handler\Invoke-AI.ps1 -Prompt "Write code" -Task code -PreferCheapest

  # Check status
  Get-AIStatus

  # Test providers
  Test-AIProviders

═══════════════════════════════════════════════════════════════════

"@ -ForegroundColor Cyan
