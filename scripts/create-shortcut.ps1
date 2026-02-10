# ClaudeHydra Desktop Shortcut Creator
# Creates shortcuts with icons and multiple modes

param(
    [string]$Mode = "swarm",
    [switch]$Verbose,
    [switch]$AllModes
)

# Auto-detect project directory
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectDir = Split-Path -Parent $ScriptDir
$DesktopPath = [Environment]::GetFolderPath("Desktop")

Write-Host "╔══════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║  ClaudeHydra Shortcut Creator  ║" -ForegroundColor Cyan
Write-Host "╚══════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""

# Shortcut configurations
$shortcuts = @{
    "swarm" = @{
        Name = "ClaudeHydra CLI (Swarm)"
        Args = "--mode swarm"
        Desc = "ClaudeHydra - 12 Witcher Agents (Swarm Mode)"
        Icon = "🐍"
    }
    "swarm-verbose" = @{
        Name = "ClaudeHydra CLI (Swarm Verbose)"
        Args = "--mode swarm --verbose"
        Desc = "ClaudeHydra - Swarm Mode with Debug Logging"
        Icon = "🔍"
    }
    "swarm-trace" = @{
        Name = "ClaudeHydra CLI (Swarm Trace)"
        Args = "--mode swarm --trace"
        Desc = "ClaudeHydra - Swarm Mode with Full Trace Logging"
        Icon = "📊"
    }
    "enhanced" = @{
        Name = "ClaudeHydra CLI (Enhanced)"
        Args = "--mode enhanced"
        Desc = "ClaudeHydra - Enhanced Mode (Advanced Features)"
        Icon = "⚡"
    }
    "basic" = @{
        Name = "ClaudeHydra CLI (Basic)"
        Args = "--mode basic"
        Desc = "ClaudeHydra - Basic Mode (Minimal Features)"
        Icon = "📝"
    }
}

function Create-Shortcut {
    param(
        [string]$Name,
        [string]$Args,
        [string]$Description,
        [string]$IconEmoji
    )

    $WshShell = New-Object -ComObject WScript.Shell
    $ShortcutPath = Join-Path $DesktopPath "$Name.lnk"
    $Shortcut = $WshShell.CreateShortcut($ShortcutPath)

    # Use pnpm start for consistency
    $Shortcut.TargetPath = "C:\Windows\System32\cmd.exe"
    $Shortcut.Arguments = "/k cd /d `"$ProjectDir`" && pnpm start $Args"
    $Shortcut.WorkingDirectory = $ProjectDir
    $Shortcut.Description = $Description

    # Try to set icon (fallback to cmd.exe if custom icon not found)
    $IconPath = Join-Path $ProjectDir "assets\icon.ico"
    if (Test-Path $IconPath) {
        $Shortcut.IconLocation = $IconPath
    }

    $Shortcut.Save()

    Write-Host "$IconEmoji Created: " -ForegroundColor Green -NoNewline
    Write-Host $Name -ForegroundColor White
    Write-Host "   Path: $ShortcutPath" -ForegroundColor Gray
}

# Create shortcuts
if ($AllModes) {
    Write-Host "Creating all shortcut variants..." -ForegroundColor Yellow
    Write-Host ""

    foreach ($key in $shortcuts.Keys) {
        $config = $shortcuts[$key]
        Create-Shortcut -Name $config.Name `
                       -Args $config.Args `
                       -Description $config.Desc `
                       -IconEmoji $config.Icon
    }
} else {
    # Create single shortcut based on mode
    $configKey = if ($Verbose) { "$Mode-verbose" } else { $Mode }

    if (-not $shortcuts.ContainsKey($configKey)) {
        Write-Host "❌ Unknown mode: $configKey" -ForegroundColor Red
        Write-Host ""
        Write-Host "Available modes:" -ForegroundColor Yellow
        foreach ($key in $shortcuts.Keys) {
            Write-Host "  - $key" -ForegroundColor White
        }
        exit 1
    }

    $config = $shortcuts[$configKey]
    Create-Shortcut -Name $config.Name `
                   -Args $config.Args `
                   -Description $config.Desc `
                   -IconEmoji $config.Icon
}

Write-Host ""
Write-Host "✅ Shortcut(s) created successfully!" -ForegroundColor Green
Write-Host ""
Write-Host "💡 Usage:" -ForegroundColor Cyan
Write-Host "   Double-click the shortcut on your desktop to launch ClaudeHydra" -ForegroundColor Gray
Write-Host ""
Write-Host "📖 More shortcuts:" -ForegroundColor Cyan
Write-Host "   .\scripts\create-shortcut.ps1 -AllModes    # Create all variants" -ForegroundColor Gray
Write-Host "   .\scripts\create-shortcut.ps1 -Verbose     # Create verbose mode" -ForegroundColor Gray
Write-Host "   .\scripts\create-shortcut.ps1 -Mode basic  # Create basic mode" -ForegroundColor Gray
