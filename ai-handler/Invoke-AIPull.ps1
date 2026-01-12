#Requires -Version 5.1
<#
.SYNOPSIS
    Pull/download Ollama models - wrapper for /ai-pull command
.DESCRIPTION
    Download new Ollama models or list available models.
.PARAMETER Model
    Model name to pull (e.g., llama3.2:3b, codellama:7b)
.PARAMETER List
    List installed models
.PARAMETER Popular
    Show popular models to download
.PARAMETER Remove
    Remove a model
.EXAMPLE
    .\Invoke-AIPull.ps1 -List
.EXAMPLE
    .\Invoke-AIPull.ps1 llama3.2:3b
.EXAMPLE
    .\Invoke-AIPull.ps1 -Popular
#>

param(
    [Parameter(Position = 0)]
    [string]$Model,

    [switch]$List,
    [switch]$Popular,
    [switch]$Remove,
    [switch]$Help
)

$ErrorActionPreference = "Stop"

# Import module
$modulePath = Join-Path $PSScriptRoot "AIModelHandler.psm1"
Import-Module $modulePath -Force

# Check Ollama
if (-not (Test-OllamaAvailable)) {
    Write-Host ""
    Write-Host "  [ERROR] Ollama is not running" -ForegroundColor Red
    Write-Host "  Start Ollama first or run launcher" -ForegroundColor Gray
    Write-Host ""
    exit 1
}

# Help
if ($Help -or ($PSBoundParameters.Count -eq 0 -and -not $Model)) {
    Write-Host ""
    Write-Host "  ============================================" -ForegroundColor Cyan
    Write-Host "            AI PULL - Ollama Models" -ForegroundColor Cyan
    Write-Host "  ============================================" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "  COMMANDS:" -ForegroundColor Yellow
    Write-Host "  -List              List installed models" -ForegroundColor Gray
    Write-Host "  -Popular           Show popular models" -ForegroundColor Gray
    Write-Host "  <model>            Pull/download model" -ForegroundColor Gray
    Write-Host "  -Remove <model>    Remove installed model" -ForegroundColor Gray
    Write-Host ""
    Write-Host "  EXAMPLES:" -ForegroundColor Yellow
    Write-Host "  /ai-pull -List" -ForegroundColor White
    Write-Host "  /ai-pull llama3.2:3b" -ForegroundColor White
    Write-Host "  /ai-pull codellama:7b" -ForegroundColor White
    Write-Host "  /ai-pull -Remove phi3:mini" -ForegroundColor White
    Write-Host "  /ai-pull -Popular" -ForegroundColor White
    Write-Host ""
    return
}

# List installed models
if ($List) {
    Write-Host ""
    Write-Host "  ============================================" -ForegroundColor Cyan
    Write-Host "           INSTALLED OLLAMA MODELS" -ForegroundColor Cyan
    Write-Host "  ============================================" -ForegroundColor Cyan
    Write-Host ""

    $models = Get-LocalModels
    if ($models.Count -eq 0) {
        Write-Host "  No models installed" -ForegroundColor Yellow
    } else {
        $totalSize = 0
        foreach ($m in $models) {
            Write-Host "  [*] " -NoNewline -ForegroundColor Green
            Write-Host "$($m.Name)" -NoNewline -ForegroundColor White
            Write-Host " ($($m.Size) GB)" -ForegroundColor Gray
            $totalSize += $m.Size
        }
        Write-Host ""
        Write-Host "  Total: $($models.Count) models, $([math]::Round($totalSize, 2)) GB" -ForegroundColor Gray
    }
    Write-Host ""
    return
}

# Show popular models
if ($Popular) {
    Write-Host ""
    Write-Host "  ============================================" -ForegroundColor Cyan
    Write-Host "           POPULAR OLLAMA MODELS" -ForegroundColor Cyan
    Write-Host "  ============================================" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "  GENERAL PURPOSE:" -ForegroundColor Yellow
    Write-Host "  llama3.2:1b        1.3 GB   Fast, lightweight" -ForegroundColor Gray
    Write-Host "  llama3.2:3b        2.0 GB   Balanced (recommended)" -ForegroundColor Gray
    Write-Host "  llama3.1:8b        4.7 GB   High quality" -ForegroundColor Gray
    Write-Host "  mistral:7b         4.1 GB   Strong reasoning" -ForegroundColor Gray
    Write-Host "  gemma2:2b          1.6 GB   Google's compact model" -ForegroundColor Gray
    Write-Host ""
    Write-Host "  CODE SPECIALISTS:" -ForegroundColor Yellow
    Write-Host "  qwen2.5-coder:1.5b 0.9 GB   Code generation (fast)" -ForegroundColor Gray
    Write-Host "  qwen2.5-coder:7b   4.7 GB   Code generation (quality)" -ForegroundColor Gray
    Write-Host "  codellama:7b       3.8 GB   Meta's code model" -ForegroundColor Gray
    Write-Host "  deepseek-coder:6.7b 3.8 GB  DeepSeek code model" -ForegroundColor Gray
    Write-Host ""
    Write-Host "  REASONING:" -ForegroundColor Yellow
    Write-Host "  phi3:mini          2.2 GB   Microsoft reasoning" -ForegroundColor Gray
    Write-Host "  phi3:medium        7.9 GB   Microsoft (larger)" -ForegroundColor Gray
    Write-Host "  qwen2.5:3b         1.9 GB   Alibaba balanced" -ForegroundColor Gray
    Write-Host ""
    Write-Host "  MULTILINGUAL:" -ForegroundColor Yellow
    Write-Host "  aya:8b             4.8 GB   101 languages" -ForegroundColor Gray
    Write-Host "  qwen2.5:7b         4.7 GB   Strong multilingual" -ForegroundColor Gray
    Write-Host ""
    Write-Host "  Usage: /ai-pull <model-name>" -ForegroundColor Cyan
    Write-Host ""
    return
}

# Remove model
if ($Remove -and $Model) {
    Write-Host ""
    Write-Host "  Removing $Model..." -ForegroundColor Yellow

    $process = Start-Process -FilePath "ollama" -ArgumentList "rm $Model" -Wait -PassThru -NoNewWindow

    if ($process.ExitCode -eq 0) {
        Write-Host "  [OK] Model $Model removed" -ForegroundColor Green
    } else {
        Write-Host "  [ERROR] Failed to remove $Model" -ForegroundColor Red
    }
    Write-Host ""
    return
}

# Pull model
if ($Model) {
    Write-Host ""
    Write-Host "  ============================================" -ForegroundColor Cyan
    Write-Host "           PULLING: $Model" -ForegroundColor Cyan
    Write-Host "  ============================================" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "  This may take a few minutes depending on model size..." -ForegroundColor Gray
    Write-Host ""

    # Run ollama pull with output
    $pinfo = New-Object System.Diagnostics.ProcessStartInfo
    $pinfo.FileName = "ollama"
    $pinfo.Arguments = "pull $Model"
    $pinfo.RedirectStandardOutput = $true
    $pinfo.RedirectStandardError = $true
    $pinfo.UseShellExecute = $false
    $pinfo.CreateNoWindow = $true

    $process = New-Object System.Diagnostics.Process
    $process.StartInfo = $pinfo
    $process.Start() | Out-Null

    # Read output in real-time
    while (-not $process.HasExited) {
        $line = $process.StandardOutput.ReadLine()
        if ($line) {
            # Parse progress
            if ($line -match "pulling|downloading|verifying|writing") {
                Write-Host "  $line" -ForegroundColor Gray
            } elseif ($line -match "(\d+)%") {
                Write-Host "`r  Progress: $($Matches[1])%   " -NoNewline -ForegroundColor Yellow
            }
        }
        Start-Sleep -Milliseconds 100
    }

    # Read remaining output
    $remaining = $process.StandardOutput.ReadToEnd()
    $errors = $process.StandardError.ReadToEnd()

    Write-Host ""

    if ($process.ExitCode -eq 0) {
        Write-Host ""
        Write-Host "  [OK] Model $Model pulled successfully!" -ForegroundColor Green

        # Update config if it's a new model
        $configPath = Join-Path $PSScriptRoot "ai-config.json"
        $config = Get-Content $configPath -Raw | ConvertFrom-Json

        # Check if model already in ollama config
        $existingModels = $config.providers.ollama.models.PSObject.Properties.Name
        if ($Model -notin $existingModels) {
            Write-Host "  [INFO] Adding $Model to configuration..." -ForegroundColor Cyan

            # Add to models
            $newModel = @{
                tier = "lite"
                contextWindow = 128000
                maxOutput = 4096
                inputCost = 0.00
                outputCost = 0.00
                tokensPerMinute = 999999
                requestsPerMinute = 999999
                capabilities = @("code", "analysis")
            }

            $config.providers.ollama.models | Add-Member -NotePropertyName $Model -NotePropertyValue $newModel -Force

            # Add to fallback chain
            $currentChain = @($config.fallbackChain.ollama)
            if ($Model -notin $currentChain) {
                $currentChain += $Model
                $config.fallbackChain.ollama = $currentChain
            }

            $config | ConvertTo-Json -Depth 10 | Set-Content $configPath -Encoding UTF8
            Write-Host "  [OK] Configuration updated" -ForegroundColor Green
        }
    } else {
        Write-Host "  [ERROR] Failed to pull $Model" -ForegroundColor Red
        if ($errors) {
            Write-Host "  $errors" -ForegroundColor Red
        }
    }
    Write-Host ""
}
