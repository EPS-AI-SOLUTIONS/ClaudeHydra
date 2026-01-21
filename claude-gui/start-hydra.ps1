# Claude HYDRA - Startup Script
# Uruchamia aplikację z terminalem zminimalizowanym

param(
    [string]$InitialPrompt = ""
)

$HydraPath = "$PSScriptRoot\src-tauri\target\debug\claude-gui.exe"
$DevMode = $false

# Sprawdź czy jest zbudowana wersja
if (-not (Test-Path $HydraPath)) {
    Write-Host "[HYDRA] Building application..." -ForegroundColor Cyan
    $DevMode = $true
}

if ($DevMode) {
    # Dev mode - uruchom tauri dev w zminimalizowanym oknie
    $process = Start-Process -FilePath "cmd.exe" -ArgumentList "/c cd /d `"$PSScriptRoot`" && npm run tauri dev" -WindowStyle Minimized -PassThru
    Write-Host "[HYDRA] Dev server started (PID: $($process.Id))" -ForegroundColor Green
    Write-Host "[HYDRA] Terminal minimized. App will open automatically." -ForegroundColor Yellow
} else {
    # Production mode - uruchom exe bezpośrednio
    Start-Process -FilePath $HydraPath
    Write-Host "[HYDRA] Application started" -ForegroundColor Green
}

# Jeśli podano prompt, zapisz go do pliku konfiguracyjnego
if ($InitialPrompt) {
    $configPath = "$PSScriptRoot\.hydra-init-prompt"
    $InitialPrompt | Out-File -FilePath $configPath -Encoding UTF8
    Write-Host "[HYDRA] Initial prompt saved: $InitialPrompt" -ForegroundColor Cyan
}

Write-Host "[HYDRA] Ready!" -ForegroundColor Green
