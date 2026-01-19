param(
    [int]$DaysToKeep = 7
)

$LogDir = Join-Path $PSScriptRoot "..\.hydra-data\logs"
$ArchiveDir = Join-Path $PSScriptRoot "..\.hydra-data\archive"

if (-not (Test-Path $LogDir)) {
    Write-Warning "Log directory not found: $LogDir"
    exit
}

if (-not (Test-Path $ArchiveDir)) {
    New-Item -Path $ArchiveDir -ItemType Directory | Out-Null
}

$CutoffDate = (Get-Date).AddDays(-$DaysToKeep)
$OldFiles = Get-ChildItem -Path $LogDir -Filter "*.log" | Where-Object { $_.LastWriteTime -lt $CutoffDate }

if ($OldFiles) {
    $DateStr = (Get-Date).ToString("yyyy-MM-dd")
    $ZipName = "logs-$DateStr.zip"
    $ZipPath = Join-Path $ArchiveDir $ZipName

    Write-Host "Archiving $($OldFiles.Count) files to $ZipPath..." -ForegroundColor Cyan
    
    Compress-Archive -Path $OldFiles.FullName -DestinationPath $ZipPath -Update
    $OldFiles | Remove-Item -Force
    
    Write-Host "Done." -ForegroundColor Green
} else {
    Write-Host "No old logs to archive." -ForegroundColor Gray
}
