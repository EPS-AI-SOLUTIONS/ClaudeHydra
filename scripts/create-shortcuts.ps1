# Create Desktop Shortcuts for Gemini CLI
# Run: powershell -ExecutionPolicy Bypass -File scripts\create-shortcuts.ps1

$ProjectPath = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$DesktopPath = [Environment]::GetFolderPath("Desktop")
$IconPath = Join-Path $ProjectPath "icon.ico"

$WshShell = New-Object -ComObject WScript.Shell

# Shortcut 1: Gemini CLI (Terminal)
$Shortcut1 = $WshShell.CreateShortcut("$DesktopPath\Gemini CLI.lnk")
$Shortcut1.TargetPath = "cmd.exe"
$Shortcut1.Arguments = "/k cd /d `"$ProjectPath`" && gemini"
$Shortcut1.WorkingDirectory = $ProjectPath
$Shortcut1.IconLocation = $IconPath
$Shortcut1.Description = "Gemini CLI - Terminal Mode"
$Shortcut1.Save()
Write-Host "Created: Gemini CLI.lnk" -ForegroundColor Green

# Shortcut 2: Gemini CLI GUI (Tauri)
$GuiPath = Join-Path $ProjectPath "src\gui"
$Shortcut2 = $WshShell.CreateShortcut("$DesktopPath\Gemini CLI GUI.lnk")
$Shortcut2.TargetPath = "cmd.exe"
$Shortcut2.Arguments = "/k cd /d `"$GuiPath`" && npm run tauri dev"
$Shortcut2.WorkingDirectory = $GuiPath
$Shortcut2.IconLocation = $IconPath
$Shortcut2.Description = "Gemini CLI - GUI Mode (Tauri)"
$Shortcut2.Save()
Write-Host "Created: Gemini CLI GUI.lnk" -ForegroundColor Green

# Shortcut 3: Gemini CLI (Quick Query)
$Shortcut3 = $WshShell.CreateShortcut("$DesktopPath\Gemini Query.lnk")
$Shortcut3.TargetPath = "cmd.exe"
$Shortcut3.Arguments = "/k cd /d `"$ProjectPath`" && set /p PROMPT=Enter prompt: && gemini -p `"%PROMPT%`" && pause"
$Shortcut3.WorkingDirectory = $ProjectPath
$Shortcut3.IconLocation = $IconPath
$Shortcut3.Description = "Gemini CLI - Quick Query"
$Shortcut3.Save()
Write-Host "Created: Gemini Query.lnk" -ForegroundColor Green

Write-Host "`nAll shortcuts created on Desktop!" -ForegroundColor Cyan
