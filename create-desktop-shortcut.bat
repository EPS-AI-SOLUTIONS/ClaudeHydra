@echo off
echo.
echo ╔══════════════════════════════════════╗
echo ║  ClaudeHydra Shortcut Creator  ║
echo ╚══════════════════════════════════════╝
echo.

set "DESKTOP=%USERPROFILE%\Desktop"
set "PROJECT_DIR=%~dp0"

echo Creating shortcut on Desktop...

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$WshShell = New-Object -ComObject WScript.Shell; ^
   $Shortcut = $WshShell.CreateShortcut('%DESKTOP%\ClaudeHydra CLI.lnk'); ^
   $Shortcut.TargetPath = 'cmd.exe'; ^
   $Shortcut.Arguments = '/k cd /d \\"%PROJECT_DIR%\\" ^&^& pnpm hydra'; ^
   $Shortcut.WorkingDirectory = '%PROJECT_DIR%'; ^
   $Shortcut.Description = 'ClaudeHydra CLI - Witcher Swarm Mode'; ^
   $Shortcut.Save(); ^
   Write-Host ''; ^
   Write-Host 'Skrot utworzony na pulpicie:' -ForegroundColor Green; ^
   Write-Host '  %DESKTOP%\ClaudeHydra CLI.lnk' -ForegroundColor White"

if %ERRORLEVEL% EQU 0 (
    echo.
    echo ✓ Sukces! Skrot "ClaudeHydra CLI.lnk" jest na pulpicie.
    echo.
    echo Teraz mozesz uruchomic ClaudeHydra przez double-click na skrocie.
) else (
    echo.
    echo × Blad podczas tworzenia skrotu.
    echo   Sprawdz uprawnienia PowerShell.
)

echo.
pause
