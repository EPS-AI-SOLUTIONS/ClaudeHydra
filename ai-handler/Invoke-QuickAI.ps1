#Requires -Version 5.1
<#
.SYNOPSIS
    Quick local AI query - wrapper for /ai command
.DESCRIPTION
    Sends a quick query to local Ollama and returns response.
    Used by /ai slash command.
.PARAMETER Query
    The question or task for the AI
.PARAMETER Model
    Model to use (default: auto-select based on query)
.PARAMETER Code
    Use code-specialized model (qwen2.5-coder:1.5b)
.PARAMETER Fast
    Use fastest model (llama3.2:1b)
.EXAMPLE
    .\Invoke-QuickAI.ps1 "What is 2+2?"
.EXAMPLE
    .\Invoke-QuickAI.ps1 "Write a function to sort array" -Code
.EXAMPLE
    .\Invoke-QuickAI.ps1 "Quick answer: capital of France?" -Fast
#>

param(
    [Parameter(Mandatory, Position = 0, ValueFromRemainingArguments)]
    [string[]]$Query,

    [string]$Model,

    [switch]$Code,

    [switch]$Fast,

    [switch]$Batch,

    [int]$MaxTokens = 1024
)

$ErrorActionPreference = "Stop"

# Import module
$modulePath = Join-Path $PSScriptRoot "AIModelHandler.psm1"
Import-Module $modulePath -Force

# Join query parts
$queryText = $Query -join " "

# Auto-select model
if (-not $Model) {
    if ($Code) {
        $Model = "qwen2.5-coder:1.5b"
    } elseif ($Fast) {
        $Model = "llama3.2:1b"
    } else {
        # Auto-detect code query (specific patterns)
        $codePatterns = @(
            "write.*(function|code|script|class|method)",
            "create.*(function|code|script|class|method)",
            "implement\s+",
            "fix.*(bug|error|code)",
            "\b(regex|regexp)\b",
            "\b(sql|query)\s+(to|for|that)",
            "\bapi\s+(endpoint|call|request)",
            "in\s+(python|javascript|powershell|bash|rust|go|java|c#|typescript)"
        )
        $isCodeQuery = $false
        foreach ($pattern in $codePatterns) {
            if ($queryText -match $pattern) {
                $isCodeQuery = $true
                break
            }
        }

        if ($isCodeQuery) {
            $Model = "qwen2.5-coder:1.5b"
        } else {
            $Model = "llama3.2:3b"
        }
    }
}

# Check Ollama
if (-not (Test-OllamaAvailable)) {
    Write-Host "[ERROR] Ollama is not running. Starting..." -ForegroundColor Red
    $ollamaExe = "$env:LOCALAPPDATA\Programs\Ollama\ollama.exe"
    if (Test-Path $ollamaExe) {
        Start-Process -FilePath $ollamaExe -ArgumentList "serve" -WindowStyle Hidden
        Start-Sleep -Seconds 3
        if (-not (Test-OllamaAvailable)) {
            Write-Host "[ERROR] Failed to start Ollama" -ForegroundColor Red
            exit 1
        }
    } else {
        Write-Host "[ERROR] Ollama not installed" -ForegroundColor Red
        exit 1
    }
}

# Execute query
Write-Host "[AI] $Model" -ForegroundColor Cyan -NoNewline
Write-Host " | " -NoNewline
Write-Host "Processing..." -ForegroundColor Gray

$messages = @(
    @{ role = "user"; content = $queryText }
)

try {
    $startTime = Get-Date
    $response = Invoke-AIRequest -Provider "ollama" -Model $Model -Messages $messages -MaxTokens $MaxTokens
    $elapsed = ((Get-Date) - $startTime).TotalSeconds

    Write-Host ""
    Write-Host $response.content
    Write-Host ""
    Write-Host "---" -ForegroundColor Gray
    Write-Host "[Done] $([math]::Round($elapsed, 2))s | $($response.usage.input_tokens + $response.usage.output_tokens) tokens | cost=`$0" -ForegroundColor Gray

} catch {
    Write-Host "[ERROR] $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}
