<#
.SYNOPSIS
    HYDRA LAUNCHER v10.1
    Initializes the ClaudeCLI environment with Maximum Autonomy and AI Orchestration.
#>

param(
    [ValidateSet("Dev", "Prod", "Offline")]
    [string]$Profile = "Dev",
    [switch]$NoClear,
    [switch]$Diagnostics
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

# Set project root
$script:Root = $PSScriptRoot
$env:CLAUDECLI_ROOT = $script:Root

$launcherModules = @(
    "launcher\Launcher.Logging.psm1",
    "launcher\Launcher.Env.psm1",
    "launcher\Launcher.Preflight.psm1"
)

foreach ($module in $launcherModules) {
    $modulePath = Join-Path $script:Root $module
    if (-not (Test-Path $modulePath)) {
        throw "Launcher module missing: $modulePath"
    }
    Import-Module $modulePath -Force
}

$script:LogState = Initialize-LauncherLogging -Root $script:Root

# === UTILITIES ===
function Write-Banner {
    if (-not $NoClear) {
        Clear-Host
    }
    Write-Host @"
 _   ___   ______  ____   ___
| | | \ \ / /  _ \|  _ \ / \ \
| |_| |\ V /| | | | |_) / _ \ \
|  _  | | | | |_| |  _ / ___ \ \
|_| |_| |_| |____/|_| /_/   \_\_\

HYDRA 10.1 - Maximum Autonomy Mode
Three Heads, One Goal. Hydra Executes In Parallel.
"@ -ForegroundColor Cyan
}


# === AI HANDLER ===
function Initialize-AI {
    Write-Host "Initializing AI Handler..." -ForegroundColor Gray
    $aiInit = Join-Path $script:Root "ai-handler\Initialize-AIHandler.ps1"

    if (Test-Path $aiInit) {
        . $aiInit -Quiet
        # Initialize-AIHandler.ps1 loads AIFacade globally
        Write-Log "AI Handler initialized."
    } else {
        Write-Host "[ERROR] AI Handler init script not found at $aiInit" -ForegroundColor Red
        Write-Log "AI Handler init script missing at $aiInit" "ERROR"
    }
}

# === STARTUP SEQUENCE ===
try {
    Import-EnvFile -Root $script:Root
    Write-Banner
    Check-Requirements -Profile $Profile -Root $script:Root
    Initialize-AI

    Write-Host "`n[READY] System initialized." -ForegroundColor Green
    Write-Host "Type 'ai <query>' to use the AI assistant." -ForegroundColor Gray
    Write-Host "Type 'exit' to quit." -ForegroundColor Gray

    Write-LauncherSummary -Profile $Profile -Root $script:Root -PowerShellVersion $PSVersionTable.PSVersion.ToString() -Offline ([bool]$env:HYDRA_OFFLINE)

    if ($Diagnostics) {
        Write-Panel -Title "Diagnostics" -Color Cyan -Lines @(
            "Profile: $Profile",
            "Offline: $($env:HYDRA_OFFLINE -eq '1')",
            "Logs: $($script:LogState.LogFile)",
            "Last run: $($script:LogState.LastRunFile)"
        )
    }

    # Enter interactive mode if not run from another script
    if ($MyInvocation.InvocationName -notmatch "\\.") {
        # Being dot-sourced, do nothing
    } else {
        # Running directly
        # Optional: Start Hydra Interactive Mode if available
        # Or just exit and let user type commands
    }
}
catch {
    Write-Host "[FATAL] Startup failed: $_" -ForegroundColor Red
    Write-Log "Startup failed: $_" "ERROR"
    exit 1
}
