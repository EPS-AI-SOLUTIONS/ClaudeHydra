#Requires -Version 5.1
<#
.SYNOPSIS
    Configure AI Handler settings - wrapper for /ai-config command
.DESCRIPTION
    View and modify AI Handler configuration settings.
.PARAMETER Show
    Show current configuration
.PARAMETER PreferLocal
    Set preferLocal (true/false)
.PARAMETER AutoFallback
    Set autoFallback (true/false)
.PARAMETER DefaultModel
    Set default Ollama model
.PARAMETER MaxConcurrent
    Set max concurrent parallel requests
.PARAMETER Reset
    Reset to default configuration
.EXAMPLE
    .\Invoke-AIConfig.ps1 -Show
.EXAMPLE
    .\Invoke-AIConfig.ps1 -PreferLocal true
.EXAMPLE
    .\Invoke-AIConfig.ps1 -DefaultModel "llama3.2:3b"
#>

param(
    [switch]$Show,
    [string]$PreferLocal,
    [string]$AutoFallback,
    [string]$CostOptimization,
    [string]$DefaultModel,
    [int]$MaxConcurrent,
    [int]$Timeout,
    [string]$Priority,
    [switch]$Reset,
    [switch]$Help
)

$ErrorActionPreference = "Stop"

# Import module
$modulePath = Join-Path $PSScriptRoot "AIModelHandler.psm1"
Import-Module $modulePath -Force

$configPath = Join-Path $PSScriptRoot "ai-config.json"

# Help
if ($Help -or ($PSBoundParameters.Count -eq 0)) {
    Write-Host ""
    Write-Host "  ============================================" -ForegroundColor Cyan
    Write-Host "            AI CONFIG - Usage" -ForegroundColor Cyan
    Write-Host "  ============================================" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "  COMMANDS:" -ForegroundColor Yellow
    Write-Host "  -Show                  Show current config" -ForegroundColor Gray
    Write-Host "  -PreferLocal <bool>    Prefer local Ollama (true/false)" -ForegroundColor Gray
    Write-Host "  -AutoFallback <bool>   Auto fallback on error (true/false)" -ForegroundColor Gray
    Write-Host "  -CostOptimization <bool> Optimize for cost (true/false)" -ForegroundColor Gray
    Write-Host "  -DefaultModel <name>   Set default Ollama model" -ForegroundColor Gray
    Write-Host "  -MaxConcurrent <N>     Max parallel requests (1-8)" -ForegroundColor Gray
    Write-Host "  -Timeout <ms>          Request timeout in ms" -ForegroundColor Gray
    Write-Host "  -Priority <order>      Provider order (e.g. 'ollama,openai,anthropic')" -ForegroundColor Gray
    Write-Host "  -Reset                 Reset to defaults" -ForegroundColor Gray
    Write-Host ""
    Write-Host "  EXAMPLES:" -ForegroundColor Yellow
    Write-Host "  /ai-config -Show" -ForegroundColor White
    Write-Host "  /ai-config -PreferLocal true" -ForegroundColor White
    Write-Host "  /ai-config -DefaultModel llama3.2:1b" -ForegroundColor White
    Write-Host "  /ai-config -MaxConcurrent 8" -ForegroundColor White
    Write-Host "  /ai-config -Priority 'anthropic,openai,ollama'" -ForegroundColor White
    Write-Host ""
    return
}

# Load config
$config = Get-Content $configPath -Raw | ConvertFrom-Json

$changes = @()

# Show current config
if ($Show) {
    Write-Host ""
    Write-Host "  ============================================" -ForegroundColor Cyan
    Write-Host "          CURRENT CONFIGURATION" -ForegroundColor Cyan
    Write-Host "  ============================================" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "  SETTINGS:" -ForegroundColor Yellow
    Write-Host "  preferLocal:       $($config.settings.preferLocal)" -ForegroundColor White
    Write-Host "  autoFallback:      $($config.settings.autoFallback)" -ForegroundColor White
    Write-Host "  costOptimization:  $($config.settings.costOptimization)" -ForegroundColor White
    Write-Host "  ollamaDefaultModel: $($config.settings.ollamaDefaultModel)" -ForegroundColor White
    Write-Host "  maxRetries:        $($config.settings.maxRetries)" -ForegroundColor White
    Write-Host "  retryDelayMs:      $($config.settings.retryDelayMs)" -ForegroundColor White
    Write-Host ""
    Write-Host "  PARALLEL EXECUTION:" -ForegroundColor Yellow
    Write-Host "  maxConcurrent:     $($config.settings.parallelExecution.maxConcurrent)" -ForegroundColor White
    Write-Host "  batchSize:         $($config.settings.parallelExecution.batchSize)" -ForegroundColor White
    Write-Host "  timeoutMs:         $($config.settings.parallelExecution.timeoutMs)" -ForegroundColor White
    Write-Host ""
    Write-Host "  PROVIDER PRIORITY:" -ForegroundColor Yellow
    $i = 1
    foreach ($p in $config.providerFallbackOrder) {
        Write-Host "  [$i] $p" -ForegroundColor White
        $i++
    }
    Write-Host ""
    Write-Host "  Config file: $configPath" -ForegroundColor Gray
    Write-Host ""
    return
}

# Reset config
if ($Reset) {
    $defaultConfig = @{
        providers = $config.providers
        fallbackChain = $config.fallbackChain
        providerFallbackOrder = @("ollama", "openai", "anthropic")
        settings = @{
            maxRetries = 3
            retryDelayMs = 1000
            rateLimitThreshold = 0.85
            costOptimization = $true
            preferLocal = $true
            autoFallback = $true
            autoInstallOllama = $true
            ollamaDefaultModel = "llama3.2:3b"
            parallelExecution = @{
                enabled = $true
                maxConcurrent = 4
                batchSize = 10
                timeoutMs = 30000
            }
            logLevel = "info"
        }
    }

    $defaultConfig | ConvertTo-Json -Depth 10 | Set-Content $configPath -Encoding UTF8
    Write-Host ""
    Write-Host "  [OK] Configuration reset to defaults" -ForegroundColor Green
    Write-Host ""
    return
}

# Apply changes
if ($PreferLocal) {
    $value = $PreferLocal -eq "true"
    $config.settings.preferLocal = $value
    $changes += "preferLocal = $value"
}

if ($AutoFallback) {
    $value = $AutoFallback -eq "true"
    $config.settings.autoFallback = $value
    $changes += "autoFallback = $value"
}

if ($CostOptimization) {
    $value = $CostOptimization -eq "true"
    $config.settings.costOptimization = $value
    $changes += "costOptimization = $value"
}

if ($DefaultModel) {
    $config.settings.ollamaDefaultModel = $DefaultModel
    $changes += "ollamaDefaultModel = $DefaultModel"
}

if ($MaxConcurrent -gt 0) {
    if ($MaxConcurrent -lt 1) { $MaxConcurrent = 1 }
    if ($MaxConcurrent -gt 16) { $MaxConcurrent = 16 }
    $config.settings.parallelExecution.maxConcurrent = $MaxConcurrent
    $changes += "maxConcurrent = $MaxConcurrent"
}

if ($Timeout -gt 0) {
    $config.settings.parallelExecution.timeoutMs = $Timeout
    $changes += "timeoutMs = $Timeout"
}

if ($Priority) {
    $providers = $Priority -split "," | ForEach-Object { $_.Trim() }
    $valid = @("ollama", "openai", "anthropic")
    $validProviders = $providers | Where-Object { $_ -in $valid }

    if ($validProviders.Count -gt 0) {
        $config.providerFallbackOrder = $validProviders

        # Update priorities in provider config
        $i = 1
        foreach ($p in $validProviders) {
            $config.providers.$p.priority = $i
            $i++
        }

        $changes += "providerFallbackOrder = $($validProviders -join ' -> ')"
    }
}

# Save if changes made
if ($changes.Count -gt 0) {
    $config | ConvertTo-Json -Depth 10 | Set-Content $configPath -Encoding UTF8

    Write-Host ""
    Write-Host "  ============================================" -ForegroundColor Green
    Write-Host "          CONFIGURATION UPDATED" -ForegroundColor Green
    Write-Host "  ============================================" -ForegroundColor Green
    Write-Host ""
    foreach ($change in $changes) {
        Write-Host "  [OK] $change" -ForegroundColor Green
    }
    Write-Host ""
    Write-Host "  Config saved to: $configPath" -ForegroundColor Gray
    Write-Host ""
}
