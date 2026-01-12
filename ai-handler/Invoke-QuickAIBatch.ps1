#Requires -Version 5.1
<#
.SYNOPSIS
    Batch parallel AI queries - wrapper for /ai-batch command
.DESCRIPTION
    Sends multiple queries to local Ollama in parallel.
    Used by /ai-batch slash command.
.PARAMETER Queries
    Array of queries (semicolon-separated or from file)
.PARAMETER File
    Path to file with queries (one per line)
.PARAMETER Model
    Model to use (default: llama3.2:3b)
.PARAMETER MaxConcurrent
    Max parallel requests (default: 4)
.EXAMPLE
    .\Invoke-QuickAIBatch.ps1 "What is 2+2?; What is 3+3?; What is 4+4?"
.EXAMPLE
    .\Invoke-QuickAIBatch.ps1 -File "queries.txt"
#>

param(
    [Parameter(Position = 0, ValueFromRemainingArguments)]
    [string[]]$Queries,

    [string]$File,

    [string]$Model = "llama3.2:3b",

    [int]$MaxConcurrent = 4,

    [int]$MaxTokens = 512
)

$ErrorActionPreference = "Stop"

# Import module
$modulePath = Join-Path $PSScriptRoot "AIModelHandler.psm1"
Import-Module $modulePath -Force

# Parse queries
$queryList = @()

if ($File -and (Test-Path $File)) {
    # Read from file
    $queryList = Get-Content $File | Where-Object { $_.Trim() -ne "" }
    Write-Host "[AI-BATCH] Loaded $($queryList.Count) queries from file" -ForegroundColor Cyan
} elseif ($Queries) {
    # Parse semicolon-separated or array
    $joinedQuery = $Queries -join " "
    if ($joinedQuery -match ";") {
        $queryList = $joinedQuery -split ";" | ForEach-Object { $_.Trim() } | Where-Object { $_ -ne "" }
    } else {
        $queryList = @($joinedQuery)
    }
}

if ($queryList.Count -eq 0) {
    Write-Host "[ERROR] No queries provided" -ForegroundColor Red
    Write-Host ""
    Write-Host "Usage:" -ForegroundColor Yellow
    Write-Host '  /ai-batch "Query 1; Query 2; Query 3"' -ForegroundColor Gray
    Write-Host '  /ai-batch -File "queries.txt"' -ForegroundColor Gray
    exit 1
}

# Check Ollama
if (-not (Test-OllamaAvailable)) {
    Write-Host "[ERROR] Ollama is not running" -ForegroundColor Red
    $ollamaExe = "$env:LOCALAPPDATA\Programs\Ollama\ollama.exe"
    if (Test-Path $ollamaExe) {
        Write-Host "[AI-BATCH] Starting Ollama..." -ForegroundColor Yellow
        Start-Process -FilePath $ollamaExe -ArgumentList "serve" -WindowStyle Hidden
        Start-Sleep -Seconds 3
        if (-not (Test-OllamaAvailable)) {
            Write-Host "[ERROR] Failed to start Ollama" -ForegroundColor Red
            exit 1
        }
    } else {
        exit 1
    }
}

# Display info
Write-Host ""
Write-Host "  ============================================" -ForegroundColor Cyan
Write-Host "         AI-BATCH: Parallel Processing" -ForegroundColor Cyan
Write-Host "  ============================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "  Queries: $($queryList.Count)" -ForegroundColor White
Write-Host "  Model: $Model" -ForegroundColor White
Write-Host "  Parallel: $MaxConcurrent" -ForegroundColor White
Write-Host ""

# Execute batch
$startTime = Get-Date
$results = Invoke-AIBatch -Prompts $queryList -Model $Model -MaxConcurrent $MaxConcurrent -MaxTokens $MaxTokens
$elapsed = ((Get-Date) - $startTime).TotalSeconds

# Display results
Write-Host "  ============================================" -ForegroundColor Green
Write-Host "                   RESULTS" -ForegroundColor Green
Write-Host "  ============================================" -ForegroundColor Green
Write-Host ""

$successCount = 0
$totalTokens = 0

for ($i = 0; $i -lt $results.Count; $i++) {
    $r = $results[$i]
    $num = $i + 1

    Write-Host "[$num] " -ForegroundColor Yellow -NoNewline

    # Truncate query for display
    $queryShort = $r.Prompt
    if ($queryShort.Length -gt 50) {
        $queryShort = $queryShort.Substring(0, 47) + "..."
    }
    Write-Host $queryShort -ForegroundColor Gray

    if ($r.Success) {
        $successCount++
        Write-Host $r.Content.Trim() -ForegroundColor White
        if ($r.Tokens) {
            $totalTokens += ($r.Tokens.input_tokens + $r.Tokens.output_tokens)
        }
    } else {
        Write-Host "[ERROR] $($r.Error)" -ForegroundColor Red
    }
    Write-Host ""
}

# Summary
Write-Host "  ============================================" -ForegroundColor Cyan
Write-Host "                   SUMMARY" -ForegroundColor Cyan
Write-Host "  ============================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "  Success: $successCount/$($results.Count)" -ForegroundColor $(if ($successCount -eq $results.Count) { "Green" } else { "Yellow" })
Write-Host "  Time: $([math]::Round($elapsed, 2))s total ($([math]::Round($elapsed / $results.Count, 2))s avg)" -ForegroundColor White
Write-Host "  Tokens: $totalTokens" -ForegroundColor White
Write-Host "  Cost: `$0.00 (local)" -ForegroundColor Green
Write-Host ""
