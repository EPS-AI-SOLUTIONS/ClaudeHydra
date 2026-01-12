<#
.SYNOPSIS
    Auto-install Ollama in silent mode when not available
.DESCRIPTION
    Downloads and installs Ollama silently if not detected on system.
    Supports custom install paths and model directories.
.EXAMPLE
    .\Install-Ollama.ps1
.EXAMPLE
    .\Install-Ollama.ps1 -Force -ModelPath "D:\OllamaModels"
#>

[CmdletBinding()]
param(
    [string]$InstallPath,
    [string]$ModelPath,
    [switch]$Force,
    [switch]$SkipModelPull,
    [string]$DefaultModel = "llama3.2:3b"
)

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"  # Speed up downloads

$OllamaDownloadUrl = "https://ollama.com/download/OllamaSetup.exe"
$TempInstaller = Join-Path $env:TEMP "OllamaSetup.exe"

Write-Host @"

  ╔════════════════════════════════════════════════════════════╗
  ║           OLLAMA AUTO-INSTALLER (Silent Mode)              ║
  ╚════════════════════════════════════════════════════════════╝

"@ -ForegroundColor Cyan

#region Check if Ollama is already installed

function Test-OllamaInstalled {
    # Check common locations
    $paths = @(
        "$env:LOCALAPPDATA\Programs\Ollama\ollama.exe",
        "$env:ProgramFiles\Ollama\ollama.exe",
        "C:\Ollama\ollama.exe"
    )

    foreach ($path in $paths) {
        if (Test-Path $path) {
            return $path
        }
    }

    # Check if in PATH
    try {
        $ollamaPath = (Get-Command ollama -ErrorAction SilentlyContinue).Source
        if ($ollamaPath) { return $ollamaPath }
    } catch {}

    return $null
}

function Test-OllamaRunning {
    try {
        $response = Invoke-RestMethod -Uri "http://localhost:11434/api/tags" -Method Get -TimeoutSec 2
        return $true
    } catch {
        return $false
    }
}

#endregion

#region Main Installation Logic

$existingInstall = Test-OllamaInstalled

if ($existingInstall -and -not $Force) {
    Write-Host "[OK] Ollama already installed at: $existingInstall" -ForegroundColor Green

    if (Test-OllamaRunning) {
        Write-Host "[OK] Ollama service is running on port 11434" -ForegroundColor Green
    } else {
        Write-Host "[--] Ollama not running. Starting service..." -ForegroundColor Yellow
        Start-Process -FilePath $existingInstall -ArgumentList "serve" -WindowStyle Hidden
        Start-Sleep -Seconds 3

        if (Test-OllamaRunning) {
            Write-Host "[OK] Ollama service started successfully" -ForegroundColor Green
        } else {
            Write-Host "[WARNING] Could not start Ollama service" -ForegroundColor Red
        }
    }

    exit 0
}

Write-Host "[1/4] Downloading Ollama installer..." -ForegroundColor Yellow

try {
    # Get latest version info
    $downloadStart = Get-Date
    Invoke-WebRequest -Uri $OllamaDownloadUrl -OutFile $TempInstaller -UseBasicParsing
    $downloadTime = ((Get-Date) - $downloadStart).TotalSeconds
    $fileSize = [math]::Round((Get-Item $TempInstaller).Length / 1MB, 1)

    Write-Host "       Downloaded $fileSize MB in $([math]::Round($downloadTime, 1))s" -ForegroundColor Gray

} catch {
    Write-Host "[ERROR] Failed to download Ollama: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

Write-Host "[2/4] Installing Ollama (silent mode)..." -ForegroundColor Yellow

try {
    # Build install arguments
    $installArgs = @("/SP-", "/VERYSILENT", "/NORESTART", "/SUPPRESSMSGBOXES")

    if ($InstallPath) {
        $installArgs += "/DIR=`"$InstallPath`""
        Write-Host "       Custom install path: $InstallPath" -ForegroundColor Gray
    }

    # Run installer
    $process = Start-Process -FilePath $TempInstaller -ArgumentList ($installArgs -join " ") -Wait -PassThru

    if ($process.ExitCode -eq 0) {
        Write-Host "       Installation completed successfully" -ForegroundColor Gray
    } else {
        Write-Host "[WARNING] Installer exited with code: $($process.ExitCode)" -ForegroundColor Yellow
    }

} catch {
    Write-Host "[ERROR] Installation failed: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

# Set custom model path if specified
if ($ModelPath) {
    Write-Host "[3/4] Configuring model path..." -ForegroundColor Yellow
    Write-Host "       Setting OLLAMA_MODELS to: $ModelPath" -ForegroundColor Gray

    # Create directory if not exists
    if (-not (Test-Path $ModelPath)) {
        New-Item -ItemType Directory -Path $ModelPath -Force | Out-Null
    }

    # Set environment variable (User scope)
    [Environment]::SetEnvironmentVariable("OLLAMA_MODELS", $ModelPath, "User")
    $env:OLLAMA_MODELS = $ModelPath

    Write-Host "       Environment variable set" -ForegroundColor Gray
} else {
    Write-Host "[3/4] Using default model path" -ForegroundColor Yellow
}

# Start Ollama service
Write-Host "[4/4] Starting Ollama service..." -ForegroundColor Yellow

$ollamaExe = Test-OllamaInstalled
if ($ollamaExe) {
    Start-Process -FilePath $ollamaExe -ArgumentList "serve" -WindowStyle Hidden
    Start-Sleep -Seconds 5

    if (Test-OllamaRunning) {
        Write-Host "       Service running on http://localhost:11434" -ForegroundColor Gray

        # Pull default model if requested
        if (-not $SkipModelPull) {
            Write-Host ""
            Write-Host "[BONUS] Pulling default model: $DefaultModel" -ForegroundColor Cyan
            Write-Host "        This may take a few minutes..." -ForegroundColor Gray

            try {
                & $ollamaExe pull $DefaultModel
                Write-Host ""
                Write-Host "[OK] Model $DefaultModel ready to use" -ForegroundColor Green
            } catch {
                Write-Host "[WARNING] Could not pull model: $($_.Exception.Message)" -ForegroundColor Yellow
            }
        }
    } else {
        Write-Host "[WARNING] Service did not start properly" -ForegroundColor Red
    }
} else {
    Write-Host "[ERROR] Could not find Ollama executable after installation" -ForegroundColor Red
    exit 1
}

# Cleanup
if (Test-Path $TempInstaller) {
    Remove-Item $TempInstaller -Force
}

Write-Host @"

  ╔════════════════════════════════════════════════════════════╗
  ║              INSTALLATION COMPLETE                         ║
  ╠════════════════════════════════════════════════════════════╣
  ║  Ollama is now available as a fallback provider in         ║
  ║  AI Model Handler. Use Get-AIStatus to verify.             ║
  ║                                                            ║
  ║  Quick test: ollama run llama3.2:3b "Hello"               ║
  ╚════════════════════════════════════════════════════════════╝

"@ -ForegroundColor Green

#endregion
