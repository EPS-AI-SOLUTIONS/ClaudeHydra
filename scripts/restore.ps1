param([string]$BackupFile)

if (-not $BackupFile) {
    Write-Error "Please specify backup file path."
    exit
}

Write-Host "♻️ Restoring backup from $BackupFile..." -ForegroundColor Cyan

Expand-Archive -Path $BackupFile -DestinationPath (Join-Path $PSScriptRoot "..") -Force

Write-Host "✔ Restore complete." -ForegroundColor Green
