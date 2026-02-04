@echo off
REM ══════════════════════════════════════════════════════════════
REM  ClaudeHydra - Claude Code Launcher
REM ══════════════════════════════════════════════════════════════
cd /d "%~dp0"

echo [%date% %time%] START >> claude-launcher.log

:loop
echo.
echo ========================================
echo   ClaudeHydra - Claude Code
echo ========================================
echo.

echo [%date% %time%] Uruchamiam Claude Code... >> claude-launcher.log

REM Uruchom Claude Code
call "C:\Users\BIURODOM\AppData\Roaming\npm\claude.cmd"

echo [%date% %time%] Claude Code zakonczyl sie z kodem: %errorlevel% >> claude-launcher.log

echo.
echo ========================================
echo   Sesja zakonczona
echo   [R] Uruchom ponownie
echo   [Q] Zamknij
echo ========================================
echo.

choice /c RQ /n /m "Wybierz opcje: "
if errorlevel 2 goto end
if errorlevel 1 goto loop

:end
echo [%date% %time%] KONIEC >> claude-launcher.log
