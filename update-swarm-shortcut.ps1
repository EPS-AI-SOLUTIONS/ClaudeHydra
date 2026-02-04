$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut('C:\Users\BIURODOM\Desktop\ClaudeHydra Swarm.lnk')
$shortcut.TargetPath = 'C:\Users\BIURODOM\Desktop\ClaudeHydra\swarm.bat'
$shortcut.WorkingDirectory = 'C:\Users\BIURODOM\Desktop\ClaudeHydra'
$shortcut.IconLocation = 'C:\Users\BIURODOM\Desktop\ClaudeHydra\icon.ico'
$shortcut.Save()
Write-Host 'ClaudeHydra Swarm.lnk zaktualizowany' -ForegroundColor Green
