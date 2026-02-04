# Update shortcuts for ClaudeHydra
$shell = New-Object -ComObject WScript.Shell

# ClaudeHydra Chat shortcut
$shortcut = $shell.CreateShortcut('C:\Users\BIURODOM\Desktop\ClaudeHydra Chat.lnk')
$shortcut.TargetPath = 'C:\Users\BIURODOM\Desktop\ClaudeHydra\claude-code.bat'
$shortcut.WorkingDirectory = 'C:\Users\BIURODOM\Desktop\ClaudeHydra'
$shortcut.IconLocation = 'C:\Users\BIURODOM\Desktop\ClaudeHydra\icon.ico'
$shortcut.Save()
Write-Host 'ClaudeHydra Chat.lnk utworzony' -ForegroundColor Green

# GeminiHydra Chat shortcut  
$shortcut2 = $shell.CreateShortcut('C:\Users\BIURODOM\Desktop\GeminiHydra Chat.lnk')
$shortcut2.TargetPath = 'C:\Users\BIURODOM\Desktop\GeminiHydra\claude-code.bat'
$shortcut2.WorkingDirectory = 'C:\Users\BIURODOM\Desktop\GeminiHydra'
$shortcut2.IconLocation = 'C:\Users\BIURODOM\Desktop\GeminiHydra\public\icon.ico'
$shortcut2.Save()
Write-Host 'GeminiHydra Chat.lnk zaktualizowany (Gemini CLI)' -ForegroundColor Green
