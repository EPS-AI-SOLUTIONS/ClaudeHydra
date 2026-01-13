# ═══════════════════════════════════════════════════════════════════════════════
# GEMINI CLI - HYDRA LAUNCHER
# Enhanced terminal experience with Ollama integration
# ═══════════════════════════════════════════════════════════════════════════════

Set-Location 'C:\Users\BIURODOM\Desktop\GeminiCLI'
$Host.UI.RawUI.WindowTitle = 'Gemini CLI (HYDRA)'

# ═══ COLORS ═══
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

# ═══ SPLASH SCREEN ═══
function Show-SplashScreen {
    Clear-Host
    $splash = @"

    [36m██████╗ ███████╗███╗   ███╗██╗███╗   ██╗██╗[0m
    [36m██╔════╝ ██╔════╝████╗ ████║██║████╗  ██║██║[0m
    [34m██║  ███╗█████╗  ██╔████╔██║██║██╔██╗ ██║██║[0m
    [34m██║   ██║██╔══╝  ██║╚██╔╝██║██║██║╚██╗██║██║[0m
    [35m╚██████╔╝███████╗██║ ╚═╝ ██║██║██║ ╚████║██║[0m
    [35m ╚═════╝ ╚══════╝╚═╝     ╚═╝╚═╝╚═╝  ╚═══╝╚═╝[0m

    [33m╦ ╦╦ ╦╔╦╗╦═╗╔═╗[0m  [90mOllama + Prompt Optimizer[0m
    [33m╠═╣╚╦╝ ║║╠╦╝╠═╣[0m  [90mSpeculative Decoding Engine[0m
    [33m╩ ╩ ╩ ═╩╝╩╚═╩ ╩[0m  [90mv2.2.0 | MCP Server[0m

"@
    Write-Host $splash
    Write-Host ""
}

# ═══ STATUS BAR ═══
function Show-StatusBar {
    Write-Host "  ┌─────────────────────────────────────────────────────────────┐" -ForegroundColor $colors.Muted

    # Working Directory
    $dir = (Get-Location).Path
    if ($dir.Length -gt 45) { $dir = "..." + $dir.Substring($dir.Length - 42) }
    Write-Host "  │ " -NoNewline -ForegroundColor $colors.Muted
    Write-Host "📁 " -NoNewline
    Write-Host $dir.PadRight(56) -NoNewline -ForegroundColor $colors.Text
    Write-Host " │" -ForegroundColor $colors.Muted

    Write-Host "  ├─────────────────────────────────────────────────────────────┤" -ForegroundColor $colors.Muted

    # Ollama Status
    Write-Host "  │ " -NoNewline -ForegroundColor $colors.Muted
    $ollamaStatus = try {
        $response = Invoke-RestMethod -Uri 'http://localhost:11434/api/tags' -TimeoutSec 2
        $response.models.Count
    } catch { 0 }

    if ($ollamaStatus -gt 0) {
        Write-Host "🟢 Ollama: " -NoNewline
        Write-Host "$ollamaStatus models ready".PadRight(44) -NoNewline -ForegroundColor $colors.Success
    } else {
        Write-Host "🔴 Ollama: " -NoNewline
        Write-Host "Not responding".PadRight(44) -NoNewline -ForegroundColor $colors.Error
    }
    Write-Host " │" -ForegroundColor $colors.Muted

    # API Key Status
    Write-Host "  │ " -NoNewline -ForegroundColor $colors.Muted
    $apiKey = Get-APIKey -KeyName 'GEMINI_API_KEY'
    if ($apiKey) {
        $masked = $apiKey.Value.Substring(0, [Math]::Min(12, $apiKey.Value.Length)) + "..."
        Write-Host "🔑 API Key: " -NoNewline
        Write-Host "$masked ($($apiKey.Source))".PadRight(44) -NoNewline -ForegroundColor $colors.Success
    } else {
        Write-Host "🔑 API Key: " -NoNewline
        Write-Host "Not found".PadRight(44) -NoNewline -ForegroundColor $colors.Warning
    }
    Write-Host " │" -ForegroundColor $colors.Muted

    # MCP Status
    Write-Host "  │ " -NoNewline -ForegroundColor $colors.Muted
    Write-Host "🔷 MCP: " -NoNewline
    Write-Host "ollama-hydra, serena, desktop-commander, playwright".PadRight(47) -NoNewline -ForegroundColor $colors.Secondary
    Write-Host " │" -ForegroundColor $colors.Muted

    Write-Host "  └─────────────────────────────────────────────────────────────┘" -ForegroundColor $colors.Muted
    Write-Host ""
}

# ═══ FUNCTION: Get API Key with fallback chain ═══
function Get-APIKey {
    param([string]$KeyName)

    # 1. Check .env file first
    $envFile = Join-Path $PSScriptRoot '.env'
    if (Test-Path $envFile) {
        $match = Get-Content $envFile | Where-Object { $_ -match "^$KeyName=" }
        if ($match) {
            $value = ($match -split '=', 2)[1].Trim() -replace '^["'']|["'']$', ''
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

# ═══ LOAD ENVIRONMENT ═══
function Initialize-Environment {
    $envFile = Join-Path $PSScriptRoot '.env'
    if (Test-Path $envFile) {
        Get-Content $envFile | ForEach-Object {
            if ($_ -match '^([^#=]+)=(.*)$') {
                $name = $matches[1].Trim()
                $value = $matches[2].Trim() -replace '^["'']|["'']$', ''
                [Environment]::SetEnvironmentVariable($name, $value, 'Process')
            }
        }
    }
}

# ═══ TIPS ═══
function Show-Tips {
    $tips = @(
        "💡 Use /help to see available commands",
        "💡 Type /ollama to switch to local Ollama models",
        "💡 Use /gemini:models to list available Gemini models",
        "💡 Try /queue:status to check prompt queue",
        "💡 Press Ctrl+C to cancel current generation"
    )
    $tip = $tips | Get-Random
    Write-Host "  $tip" -ForegroundColor $colors.Muted
    Write-Host ""
}

# ═══ MAIN ═══
Show-SplashScreen
Initialize-Environment
Show-StatusBar
Show-Tips

Write-Host "  Starting Gemini CLI..." -ForegroundColor $colors.Secondary
Write-Host ""

try {
    gemini
} catch {
    Write-Host "  ❌ ERROR: $_" -ForegroundColor $colors.Error
    Write-Host "  Trying npx @google/gemini-cli..." -ForegroundColor $colors.Warning
    npx @google/gemini-cli
}

Write-Host ""
Write-Host "  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor $colors.Muted
Write-Host "  Gemini CLI session ended. Press any key to close..." -ForegroundColor $colors.Accent
$null = $Host.UI.RawUI.ReadKey('NoEcho,IncludeKeyDown')
