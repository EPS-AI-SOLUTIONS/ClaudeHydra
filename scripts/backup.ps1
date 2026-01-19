$SourceDir = Join-Path $PSScriptRoot "..\.hydra-data"
$MemoryDir = Join-Path $PSScriptRoot "..\.serena"
$BackupDir = Join-Path $PSScriptRoot "..\backups"

if (-not (Test-Path $BackupDir)) { New-Item -ItemType Directory -Path $BackupDir | Out-Null }

$Timestamp = (Get-Date).ToString("yyyyMMdd-HHmm")
$ZipFile = Join-Path $BackupDir "hydra_backup_$Timestamp.zip"

Write-Host "📦 Backing up HYDRA data..." -ForegroundColor Cyan

$Files = @()
if (Test-Path $SourceDir) { $Files += $SourceDir }
if (Test-Path $MemoryDir) { $Files += $MemoryDir }

if ($Files.Count -gt 0) {
    Compress-Archive -Path $Files -DestinationPath $ZipFile
    Write-Host "✔ Backup created: $ZipFile" -ForegroundColor Green
} else {
    Write-Warning "No data found to backup."
}
