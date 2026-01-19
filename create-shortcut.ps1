$WshShell = New-Object -ComObject WScript.Shell
$DesktopPath = [Environment]::GetFolderPath('Desktop')
$BasePath = "C:\Users\BIURODOM\Desktop\ClaudeHYDRA\hydra-launcher"

# Release shortcut
$Shortcut = $WshShell.CreateShortcut("$DesktopPath\HYDRA Launcher.lnk")
$Shortcut.TargetPath = "$BasePath\src-tauri\target\release\hydra-launcher.exe"
$Shortcut.WorkingDirectory = $BasePath
$Shortcut.IconLocation = "$BasePath\src-tauri\target\release\hydra-launcher.exe,0"
$Shortcut.Description = "HYDRA Multi-CLI Dashboard Launcher"
$Shortcut.Save()
Write-Host "HYDRA Launcher (Release) shortcut created!"

# Debug shortcut
$ShortcutDebug = $WshShell.CreateShortcut("$DesktopPath\HYDRA Launcher (Debug).lnk")
$ShortcutDebug.TargetPath = "$BasePath\src-tauri\target\debug\hydra-launcher.exe"
$ShortcutDebug.WorkingDirectory = $BasePath
$ShortcutDebug.IconLocation = "$BasePath\src-tauri\target\debug\hydra-launcher.exe,0"
$ShortcutDebug.Description = "HYDRA Multi-CLI Dashboard Launcher (Debug)"
$ShortcutDebug.Save()
Write-Host "HYDRA Launcher (Debug) shortcut created!"
