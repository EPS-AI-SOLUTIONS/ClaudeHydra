$WshShell = New-Object -ComObject WScript.Shell
$DesktopPath = [Environment]::GetFolderPath("Desktop")
$ShortcutPath = Join-Path $DesktopPath "HYDRA Dashboard.lnk"
$Target = Join-Path $PSScriptRoot "run-dashboard.cmd"

# Create a wrapper CMD to run cargo
$CmdPath = Join-Path $PSScriptRoot "run-dashboard.cmd"
"@echo off
cd %~dp0\..\src\dashboard
cargo run
pause" | Out-File -FilePath $CmdPath -Encoding ASCII

$Shortcut = $WshShell.CreateShortcut($ShortcutPath)
$Shortcut.TargetPath = $CmdPath
$Shortcut.IconLocation = Join-Path (Join-Path $PSScriptRoot "..") "icon.ico"
$Shortcut.Description = "Launch HYDRA Dashboard"
$Shortcut.Save()

Write-Host "Shortcut created at: $ShortcutPath" -ForegroundColor Green
