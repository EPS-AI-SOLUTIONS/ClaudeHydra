# HYDRA 10.6.1 Launcher
# Sprawdza build, buduje jeśli brak, uruchamia aplikację

$ErrorActionPreference = "Stop"
$HydraRoot = $PSScriptRoot
$LauncherPath = "$HydraRoot\hydra-launcher"
$ExePath = "$LauncherPath\src-tauri\target\release\hydra-launcher.exe"
$LogFile = "$HydraRoot\hydra-launcher.log"

function Write-Log {
    param([string]$Message, [string]$Level = "INFO")
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $entry = "[$timestamp] [$Level] $Message"
    Add-Content -Path $LogFile -Value $entry
    if ($Level -eq "ERROR") {
        Write-Host $entry -ForegroundColor Red
    } elseif ($Level -eq "WARN") {
        Write-Host $entry -ForegroundColor Yellow
    } else {
        Write-Host $entry -ForegroundColor Cyan
    }
}

Write-Log "=== HYDRA Launcher Started ==="

# Sprawdź czy exe istnieje
if (-not (Test-Path $ExePath)) {
    Write-Log "Build not found at: $ExePath" "WARN"
    Write-Log "Building HYDRA... (this may take a few minutes)"
    
    try {
        Set-Location $LauncherPath
        $buildOutput = & pnpm tauri build 2>&1
        
        if ($LASTEXITCODE -ne 0) {
            Write-Log "Build failed: $buildOutput" "ERROR"
            Write-Host "`nPress any key to exit..."
            $null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
            exit 1
        }
        
        Write-Log "Build completed successfully"
    } catch {
        Write-Log "Build error: $_" "ERROR"
        Write-Host "`nPress any key to exit..."
        $null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
        exit 1
    }
}

# Sprawdź ponownie
if (-not (Test-Path $ExePath)) {
    Write-Log "EXE still not found after build!" "ERROR"
    Write-Host "`nPress any key to exit..."
    $null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
    exit 1
}

# Uruchom HYDRA
Write-Log "Launching: $ExePath"

try {
    $process = Start-Process -FilePath $ExePath -WorkingDirectory $HydraRoot -PassThru
    Write-Log "HYDRA started with PID: $($process.Id)"
    
    # Poczekaj chwilę i sprawdź czy proces działa
    Start-Sleep -Seconds 2
    
    if ($process.HasExited) {
        Write-Log "HYDRA exited unexpectedly with code: $($process.ExitCode)" "ERROR"
        Write-Host "`nPress any key to exit..."
        $null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
        exit 1
    }
    
    Write-Log "HYDRA running OK - launcher closing"
    exit 0
    
} catch {
    Write-Log "Failed to start HYDRA: $_" "ERROR"
    Write-Host "`nPress any key to exit..."
    $null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
    exit 1
}
