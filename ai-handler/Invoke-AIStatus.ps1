#Requires -Version 5.1
<#
.SYNOPSIS
    Check AI providers status - wrapper for /ai-status command
.DESCRIPTION
    Displays status of all configured AI providers, models, and settings.
.PARAMETER Test
    Run connectivity test for each provider
.PARAMETER Models
    Show detailed model list
.EXAMPLE
    .\Invoke-AIStatus.ps1
.EXAMPLE
    .\Invoke-AIStatus.ps1 -Test
#>

param(
    [switch]$Test,
    [switch]$Models
)

$ErrorActionPreference = "SilentlyContinue"

# Import module
$modulePath = Join-Path $PSScriptRoot "AIModelHandler.psm1"
Import-Module $modulePath -Force

$config = Get-AIConfig

Write-Host ""
Write-Host "  ============================================" -ForegroundColor Cyan
Write-Host "            AI HANDLER STATUS" -ForegroundColor Cyan
Write-Host "  ============================================" -ForegroundColor Cyan
Write-Host ""

# 1. Provider Status
Write-Host "  PROVIDERS" -ForegroundColor Yellow
Write-Host "  -----------------------------------------" -ForegroundColor Gray

foreach ($providerName in $config.providerFallbackOrder) {
    $provider = $config.providers[$providerName]
    $priority = $provider.priority

    Write-Host "  [$priority] " -NoNewline -ForegroundColor Gray
    Write-Host "$providerName" -NoNewline -ForegroundColor White
    Write-Host " ($($provider.name))" -NoNewline -ForegroundColor Gray

    # Check status
    if ($providerName -eq "ollama") {
        if (Test-OllamaAvailable) {
            Write-Host " [OK]" -ForegroundColor Green
        } else {
            Write-Host " [OFFLINE]" -ForegroundColor Red
        }
    } else {
        if ($provider.apiKeyEnv) {
            $key = [Environment]::GetEnvironmentVariable($provider.apiKeyEnv)
            if ($key) {
                $masked = $key.Substring(0, [Math]::Min(10, $key.Length)) + "..."
                Write-Host " [OK] " -ForegroundColor Green -NoNewline
                Write-Host $masked -ForegroundColor Gray
            } else {
                Write-Host " [NO KEY] " -ForegroundColor Red -NoNewline
                Write-Host "Set $($provider.apiKeyEnv)" -ForegroundColor Gray
            }
        }
    }
}

Write-Host ""

# 2. Local Models (Ollama)
Write-Host "  LOCAL MODELS (Ollama)" -ForegroundColor Yellow
Write-Host "  -----------------------------------------" -ForegroundColor Gray

if (Test-OllamaAvailable) {
    $localModels = Get-LocalModels
    if ($localModels.Count -gt 0) {
        foreach ($model in $localModels) {
            $isDefault = $model.Name -eq $config.settings.ollamaDefaultModel
            Write-Host "  " -NoNewline
            if ($isDefault) {
                Write-Host "[*] " -NoNewline -ForegroundColor Green
            } else {
                Write-Host "[ ] " -NoNewline -ForegroundColor Gray
            }
            Write-Host "$($model.Name)" -NoNewline -ForegroundColor White
            Write-Host " ($($model.Size) GB)" -ForegroundColor Gray
        }
    } else {
        Write-Host "  No models installed" -ForegroundColor Red
    }
} else {
    Write-Host "  Ollama not running" -ForegroundColor Red
}

Write-Host ""

# 3. Configuration
Write-Host "  CONFIGURATION" -ForegroundColor Yellow
Write-Host "  -----------------------------------------" -ForegroundColor Gray

Write-Host "  Prefer Local: " -NoNewline -ForegroundColor Gray
if ($config.settings.preferLocal) {
    Write-Host "YES" -ForegroundColor Green
} else {
    Write-Host "NO" -ForegroundColor Yellow
}

Write-Host "  Auto Fallback: " -NoNewline -ForegroundColor Gray
if ($config.settings.autoFallback) {
    Write-Host "YES" -ForegroundColor Green
} else {
    Write-Host "NO" -ForegroundColor Yellow
}

Write-Host "  Cost Optimization: " -NoNewline -ForegroundColor Gray
if ($config.settings.costOptimization) {
    Write-Host "YES" -ForegroundColor Green
} else {
    Write-Host "NO" -ForegroundColor Yellow
}

Write-Host "  Default Model: " -NoNewline -ForegroundColor Gray
Write-Host $config.settings.ollamaDefaultModel -ForegroundColor White

Write-Host "  Max Concurrent: " -NoNewline -ForegroundColor Gray
Write-Host $config.settings.parallelExecution.maxConcurrent -ForegroundColor White

Write-Host ""

# 4. Fallback Chain
Write-Host "  FALLBACK CHAIN" -ForegroundColor Yellow
Write-Host "  -----------------------------------------" -ForegroundColor Gray

# Read directly from JSON for accurate display
$jsonPath = Join-Path $PSScriptRoot "ai-config.json"
$jsonText = Get-Content $jsonPath -Raw
$jsonObj = $jsonText | ConvertFrom-Json

Write-Host "  anthropic : " -NoNewline -ForegroundColor White
Write-Host ($jsonObj.fallbackChain.anthropic -join " -> ") -ForegroundColor Gray

Write-Host "  openai : " -NoNewline -ForegroundColor White
Write-Host ($jsonObj.fallbackChain.openai -join " -> ") -ForegroundColor Gray

Write-Host "  ollama : " -NoNewline -ForegroundColor White
Write-Host ($jsonObj.fallbackChain.ollama -join " -> ") -ForegroundColor Gray

Write-Host ""

# 5. Connectivity Test (if -Test flag)
if ($Test) {
    Write-Host "  CONNECTIVITY TEST" -ForegroundColor Yellow
    Write-Host "  -----------------------------------------" -ForegroundColor Gray

    $testProviders = @(
        @{ Name = "ollama"; Model = "llama3.2:1b" }
        @{ Name = "openai"; Model = "gpt-4o-mini" }
        @{ Name = "anthropic"; Model = "claude-3-5-haiku-20241022" }
    )

    foreach ($provider in $testProviders) {
        Write-Host "  Testing $($provider.Name)... " -NoNewline -ForegroundColor Gray

        try {
            $testMessages = @(
                @{ role = "user"; content = "Say OK" }
            )

            $startTime = Get-Date
            $response = Invoke-AIRequest -Provider $provider.Name -Model $provider.Model `
                -Messages $testMessages -MaxTokens 10
            $elapsed = ((Get-Date) - $startTime).TotalMilliseconds

            Write-Host "[OK] " -ForegroundColor Green -NoNewline
            Write-Host "$([math]::Round($elapsed))ms" -ForegroundColor Gray
        } catch {
            $errMsg = $_.Exception.Message
            if ($errMsg.Length -gt 40) { $errMsg = $errMsg.Substring(0, 40) }
            Write-Host "[FAIL] " -ForegroundColor Red -NoNewline
            Write-Host $errMsg -ForegroundColor Gray
        }
    }
    Write-Host ""
}

# 6. Cost Summary
Write-Host "  COST PER 1K TOKENS" -ForegroundColor Yellow
Write-Host "  -----------------------------------------" -ForegroundColor Gray

$costData = @(
    @{ Provider = "ollama"; Model = "*"; Input = 0; Output = 0 }
    @{ Provider = "openai"; Model = "gpt-4o-mini"; Input = 0.15; Output = 0.60 }
    @{ Provider = "openai"; Model = "gpt-4o"; Input = 2.50; Output = 10.00 }
    @{ Provider = "anthropic"; Model = "claude-3-5-haiku"; Input = 0.80; Output = 4.00 }
    @{ Provider = "anthropic"; Model = "claude-sonnet-4"; Input = 3.00; Output = 15.00 }
)

foreach ($cost in $costData) {
    $total = $cost.Input + $cost.Output
    Write-Host "  $($cost.Provider)/$($cost.Model): " -NoNewline -ForegroundColor Gray
    if ($total -eq 0) {
        Write-Host "`$0.00 (FREE)" -ForegroundColor Green
    } else {
        Write-Host "`$$($cost.Input)/`$$($cost.Output)" -ForegroundColor Yellow
    }
}

Write-Host ""
Write-Host "  ============================================" -ForegroundColor Cyan
Write-Host ""
