Set WshShell = CreateObject("WScript.Shell")
DesktopPath = WshShell.SpecialFolders("Desktop")
ProjectPath = WshShell.CurrentDirectory

WScript.Echo ""
WScript.Echo "╔══════════════════════════════════════╗"
WScript.Echo "║  ClaudeHydra Shortcut Creator  ║"
WScript.Echo "║      Standard + Verbose        ║"
WScript.Echo "╚══════════════════════════════════════╝"
WScript.Echo ""

' ============================================================================
' Skrót 1: Standardowy (Swarm Mode)
' ============================================================================

WScript.Echo "[1/2] Tworzę standardowy skrót..."

Set Shortcut1 = WshShell.CreateShortcut(DesktopPath & "\ClaudeHydra CLI.lnk")
Shortcut1.TargetPath = "cmd.exe"
Shortcut1.Arguments = "/k cd /d """ & ProjectPath & """ && pnpm hydra"
Shortcut1.WorkingDirectory = ProjectPath
Shortcut1.Description = "ClaudeHydra CLI - Witcher Swarm Mode"
Shortcut1.Save

WScript.Echo "      ✓ ClaudeHydra CLI.lnk"
WScript.Echo ""

' ============================================================================
' Skrót 2: Verbose Mode (z DEBUG logging)
' ============================================================================

WScript.Echo "[2/2] Tworzę verbose skrót..."

Set Shortcut2 = WshShell.CreateShortcut(DesktopPath & "\ClaudeHydra CLI (Verbose).lnk")
Shortcut2.TargetPath = "cmd.exe"
Shortcut2.Arguments = "/k cd /d """ & ProjectPath & """ && pnpm hydra --verbose"
Shortcut2.WorkingDirectory = ProjectPath
Shortcut2.Description = "ClaudeHydra CLI - Swarm Mode with Debug Logging"
Shortcut2.Save

WScript.Echo "      ✓ ClaudeHydra CLI (Verbose).lnk"
WScript.Echo ""

WScript.Echo "══════════════════════════════════════"
WScript.Echo ""
WScript.Echo "✅ Gotowe! Skróty utworzone na pulpicie:"
WScript.Echo ""
WScript.Echo "   🐍 ClaudeHydra CLI.lnk"
WScript.Echo "      (Standardowy Swarm Mode)"
WScript.Echo ""
WScript.Echo "   🔍 ClaudeHydra CLI (Verbose).lnk"
WScript.Echo "      (Swarm Mode + Debug Logs)"
WScript.Echo ""
WScript.Echo "💡 Verbose mode pokazuje:"
WScript.Echo "     - Wybór agenta i scoring"
WScript.Echo "     - Parametry Ollama API"
WScript.Echo "     - Czas wykonania query"
WScript.Echo "     - MCP tool calls"
WScript.Echo ""
