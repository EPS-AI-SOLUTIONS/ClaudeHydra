# ======================================================================
# GEMINI CLI - HYDRA LAUNCHER
# Enhanced terminal experience with Ollama integration
# ======================================================================

# Start Ollama as early as possible
$ollamaCmd = Get-Command ollama -ErrorAction SilentlyContinue
if ($ollamaCmd) {
    $ollamaRunning = Get-Process -Name 'ollama' -ErrorAction SilentlyContinue
    if (-not $ollamaRunning) {
        Start-Process -FilePath 'ollama' -ArgumentList 'serve' -WindowStyle Hidden
        Start-Sleep -Milliseconds 800
    }
}

Set-Location 'C:\Users\BIURODOM\Desktop\GeminiCLI'
$Host.UI.RawUI.WindowTitle = 'Gemini CLI (HYDRA)'

# === COLORS ===
$colors = @{
    Primary   = 'Blue'
    Secondary = 'Cyan'
    Accent    = 'Yellow'
    Success   = 'Green'
    Warning   = 'DarkYellow'
    Error     = 'Red'
    Muted     = 'DarkGray'
    Text      = 'White'
}

# === SPLASH SCREEN ===
function Show-SplashScreen {
    Clear-Host
    $splash = @"

    GEMINI CLI (HYDRA)
    Ollama + Prompt Optimizer
    Speculative Decoding Engine
    v2.2.0 | MCP Server

"@
    Write-Host $splash
    Write-Host ""
}

# === STATUS BAR ===
function Show-StatusBar {
    Write-Host "  +-------------------------------------------------------------+" -ForegroundColor $colors.Muted

    # Working Directory
    $dir = (Get-Location).Path
    if ($dir.Length -gt 45) { $dir = "..." + $dir.Substring($dir.Length - 42) }
    Write-Host "  | " -NoNewline -ForegroundColor $colors.Muted
    Write-Host "DIR " -NoNewline
    Write-Host $dir.PadRight(56) -NoNewline -ForegroundColor $colors.Text
    Write-Host " |" -ForegroundColor $colors.Muted

    Write-Host "  +-------------------------------------------------------------+" -ForegroundColor $colors.Muted

    # Ollama Status
    Write-Host "  | " -NoNewline -ForegroundColor $colors.Muted
    $ollamaStatus = try {
        $response = Invoke-RestMethod -Uri 'http://localhost:11434/api/tags' -TimeoutSec 2
        $response.models.Count
    } catch { 0 }

    if ($ollamaStatus -gt 0) {
        Write-Host "Ollama: " -NoNewline
        Write-Host "$ollamaStatus models ready".PadRight(44) -NoNewline -ForegroundColor $colors.Success
    } else {
        Write-Host "Ollama: " -NoNewline
        Write-Host "Not responding".PadRight(44) -NoNewline -ForegroundColor $colors.Error
    }
    Write-Host " |" -ForegroundColor $colors.Muted

    # API Key Status
    Write-Host "  | " -NoNewline -ForegroundColor $colors.Muted
    $apiKey = Get-APIKey -KeyName 'GEMINI_API_KEY'
    if ($apiKey) {
        $masked = $apiKey.Value.Substring(0, [Math]::Min(12, $apiKey.Value.Length)) + "..."
        Write-Host "API Key: " -NoNewline
        Write-Host "$masked ($($apiKey.Source))".PadRight(44) -NoNewline -ForegroundColor $colors.Success
    } else {
        Write-Host "API Key: " -NoNewline
        Write-Host "Not found".PadRight(44) -NoNewline -ForegroundColor $colors.Warning
    }
    Write-Host " |" -ForegroundColor $colors.Muted

    # MCP Status
    Write-Host "  | " -NoNewline -ForegroundColor $colors.Muted
    Write-Host "MCP: " -NoNewline
    Write-Host "ollama-hydra, serena, desktop-commander, playwright".PadRight(47) -NoNewline -ForegroundColor $colors.Secondary
    Write-Host " |" -ForegroundColor $colors.Muted

    Write-Host "  +-------------------------------------------------------------+" -ForegroundColor $colors.Muted
    Write-Host ""
}

# === FUNCTION: Get API Key with fallback chain ===
function Get-APIKey {
    param([string]$KeyName)

    # 1. Check .env file first
    $envFile = Join-Path $PSScriptRoot '.env'
    if (Test-Path $envFile) {
        $match = Get-Content $envFile | Where-Object { $_ -match "^$KeyName=" }
        if ($match) {
            $value = ($match -split '=', 2)[1].Trim().Trim([char]34, [char]39)
            if ($value) { return @{ Value = $value; Source = '.env' } }
        }
    }

    # 2. Check Process scope (current session)
    $processVal = [Environment]::GetEnvironmentVariable($KeyName, 'Process')
    if ($processVal) { return @{ Value = $processVal; Source = 'Process' } }

    # 3. Check User scope
    $userVal = [Environment]::GetEnvironmentVariable($KeyName, 'User')
    if ($userVal) { return @{ Value = $userVal; Source = 'User' } }

    # 4. Check Machine scope
    $machineVal = [Environment]::GetEnvironmentVariable($KeyName, 'Machine')
    if ($machineVal) { return @{ Value = $machineVal; Source = 'Machine' } }

    return $null
}

# === LOAD ENVIRONMENT ===
function Initialize-Environment {
    $envFile = Join-Path $PSScriptRoot '.env'
    if (Test-Path $envFile) {
        Get-Content $envFile | ForEach-Object {
            if ($_ -match '^([^#=]+)=(.*)$') {
                $name = $matches[1].Trim()
                $value = $matches[2].Trim().Trim([char]34, [char]39)
                [Environment]::SetEnvironmentVariable($name, $value, 'Process')
            }
        }
    }
}

# === TIPS ===
function Show-Tips {
    $tips = @(
        "TIP: Use /help to see available commands",
        "TIP: Type /ollama to switch to local Ollama models",
        "TIP: Use /gemini:models to list available Gemini models",
        "TIP: Try /queue:status to check prompt queue",
        "TIP: Press Ctrl+C to cancel current generation"
    )
    $tip = $tips | Get-Random
    Write-Host "  $tip" -ForegroundColor $colors.Muted
    Write-Host ""
}

# === MAIN ===
Show-SplashScreen
Initialize-Environment
Show-StatusBar
Show-Tips

Write-Host "  Starting Gemini CLI..." -ForegroundColor $colors.Secondary
Write-Host ""

try {
    gemini
} catch {
    Write-Host "  ERROR: $_" -ForegroundColor $colors.Error
    Write-Host "  Trying npx @google/gemini-cli..." -ForegroundColor $colors.Warning
    npx @google/gemini-cli
}

Write-Host ""
Write-Host "  -------------------------------------------------------------" -ForegroundColor $colors.Muted
Write-Host "  Gemini CLI session ended." -ForegroundColor $colors.Accent
