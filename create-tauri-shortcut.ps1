$WshShell = New-Object -ComObject WScript.Shell
$Shortcut = $WshShell.CreateShortcut("C:\Users\BIURODOM\Desktop\Claude HYDRA.lnk")
$Shortcut.TargetPath = "C:\Users\BIURODOM\Desktop\ClaudeHydra\claude-gui\src-tauri\target\release\claude-gui.exe"
$Shortcut.WorkingDirectory = "C:\Users\BIURODOM\Desktop\ClaudeHydra"
$Shortcut.IconLocation = "C:\Users\BIURODOM\Desktop\ClaudeHydra\claude-gui\src-tauri\icons\icon.ico"
$Shortcut.Description = "Claude HYDRA - AI Swarm Control Center (Tauri)"
$Shortcut.Save()
Write-Host "Shortcut 'Claude HYDRA' created on Desktop!" -ForegroundColor Green
