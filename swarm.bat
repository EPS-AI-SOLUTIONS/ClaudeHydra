@echo off
REM ══════════════════════════════════════════════════════════════
REM  ClaudeHydra Swarm - Witcher Swarm (12 Agents)
REM ══════════════════════════════════════════════════════════════
cd /d "%~dp0"

echo.
echo ========================================
echo   ClaudeHydra Swarm - 12 Agents
echo ========================================
echo.

:loop
call npm run swarm

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
