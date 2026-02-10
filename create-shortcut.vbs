Set WshShell = CreateObject("WScript.Shell")
DesktopPath = WshShell.SpecialFolders("Desktop")
ProjectPath = WshShell.CurrentDirectory

Set Shortcut = WshShell.CreateShortcut(DesktopPath & "\ClaudeHydra CLI.lnk")
Shortcut.TargetPath = "cmd.exe"
Shortcut.Arguments = "/k cd /d """ & ProjectPath & """ && pnpm hydra"
Shortcut.WorkingDirectory = ProjectPath
Shortcut.Description = "ClaudeHydra CLI - Witcher Swarm Mode"
Shortcut.Save

WScript.Echo "Skrot utworzony na pulpicie: ClaudeHydra CLI.lnk"
