# Wrapper to start Hydra Client

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Continue' # Changed from 'Stop' to 'Continue' to allow for more graceful error handling
$Root = $PSScriptRoot

$clientModule = Join-Path $Root 'src/Hydra.Client/Hydra.Client.psd1'

if (Test-Path $clientModule) {
    try {
        Import-Module $clientModule -Force
        Start-HydraChat
    }
    catch {
        Write-Error "Error starting Hydra Chat: $($_.Exception.Message)"
        exit 1
    }
} else {
    Write-Error "Hydra Client module not found at '$clientModule'"
    exit 1
}

# Ensure the HYDRA roaming directory exists
if ($env:APPDATA) {
    $HydraRoamingPath = Join-Path $env:APPDATA 'HYDRA'
} else {
    # Fallback for non-Windows or when APPDATA is not set
    # Using .config/HYDRA as a standard location for Linux/macOS
    $HydraRoamingPath = Join-Path $env:HOME '.config/HYDRA'
}

if (-not (Test-Path $HydraRoamingPath)) {
    New-Item -Path $HydraRoamingPath -ItemType Directory -Force | Out-Null
}
