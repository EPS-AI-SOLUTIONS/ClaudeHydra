@echo off
echo.
echo ╔══════════════════════════════════════╗
echo ║  ClaudeHydra Shortcut Creator  ║
echo ║      Standard + Verbose        ║
echo ╚══════════════════════════════════════╝
echo.

set "DESKTOP=%USERPROFILE%\Desktop"
set "PROJECT_DIR=%~dp0"

echo Tworzę 2 skróty na pulpicie...
echo.

REM ============================================================================
REM Skrót 1: Standardowy (Swarm Mode)
REM ============================================================================

echo [1/2] Standardowy skrót...

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$WshShell = New-Object -ComObject WScript.Shell; ^
   $Shortcut = $WshShell.CreateShortcut('%DESKTOP%\ClaudeHydra CLI.lnk'); ^
   $Shortcut.TargetPath = 'cmd.exe'; ^
   $Shortcut.Arguments = '/k cd /d \\"%PROJECT_DIR%\\" ^&^& pnpm hydra'; ^
   $Shortcut.WorkingDirectory = '%PROJECT_DIR%'; ^
   $Shortcut.Description = 'ClaudeHydra CLI - Witcher Swarm Mode'; ^
   $Shortcut.Save()"

if %ERRORLEVEL% EQU 0 (
    echo       ✓ ClaudeHydra CLI.lnk
) else (
    echo       × Błąd podczas tworzenia
)

echo.

REM ============================================================================
REM Skrót 2: Verbose Mode (z DEBUG logging)
REM ============================================================================

echo [2/2] Verbose skrót...

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$WshShell = New-Object -ComObject WScript.Shell; ^
   $Shortcut = $WshShell.CreateShortcut('%DESKTOP%\ClaudeHydra CLI (Verbose).lnk'); ^
   $Shortcut.TargetPath = 'cmd.exe'; ^
   $Shortcut.Arguments = '/k cd /d \\"%PROJECT_DIR%\\" ^&^& pnpm hydra --verbose'; ^
   $Shortcut.WorkingDirectory = '%PROJECT_DIR%'; ^
   $Shortcut.Description = 'ClaudeHydra CLI - Swarm Mode with Debug Logging'; ^
   $Shortcut.Save()"

if %ERRORLEVEL% EQU 0 (
    echo       ✓ ClaudeHydra CLI (Verbose).lnk
) else (
    echo       × Błąd podczas tworzenia
)

echo.
echo ══════════════════════════════════════
echo.
echo ✅ Gotowe! Skróty utworzone na pulpicie:
echo.
echo    🐍 ClaudeHydra CLI.lnk
echo       ^(Standardowy Swarm Mode^)
echo.
echo    🔍 ClaudeHydra CLI (Verbose).lnk
echo       ^(Swarm Mode + Debug Logs^)
echo.
echo 💡 Teraz możesz uruchomić ClaudeHydra przez double-click!
echo.
echo    Verbose mode pokazuje:
echo      - Wybór agenta i scoring
echo      - Parametry Ollama API
echo      - Czas wykonania query
echo      - MCP tool calls
echo.
pause
