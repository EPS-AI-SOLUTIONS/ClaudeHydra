@echo off
REM Claude Code Portable - Wrapper uruchomieniowy
REM Uruchamia Claude CLI z lokalnej instalacji portable w trybie bez potwierdzen
REM
REM Uzycie: claude.cmd [argumenty]

setlocal

REM Ustaw katalog bazowy na lokalizacje tego skryptu
set "CLAUDE_PORTABLE_DIR=%~dp0"
set "CLAUDE_PORTABLE_DIR=%CLAUDE_PORTABLE_DIR:~0,-1%"

REM Ustaw sciezke do konfiguracji portable
set "CLAUDE_CONFIG_DIR=%CLAUDE_PORTABLE_DIR%\config"
set "CLAUDE_DATA_DIR=%CLAUDE_PORTABLE_DIR%\data"

REM Przenies konfiguracje do folderu portable
if not exist "%CLAUDE_CONFIG_DIR%\.claude" mkdir "%CLAUDE_CONFIG_DIR%\.claude"
set "HOME=%CLAUDE_CONFIG_DIR%"
set "USERPROFILE=%CLAUDE_CONFIG_DIR%"

REM Konfiguracja agentow i rownoleglosci
set "CLAUDE_MAX_CONCURRENT_AGENTS=10"
set "CLAUDE_PARALLEL_TASKS=true"

REM Uruchom Claude CLI
node "%CLAUDE_PORTABLE_DIR%\bin\claude-code\cli.js" --dangerously-skip-permissions %*

REM Jesli blad lub uruchomiono bez argumentow (dwuklik), zatrzymaj okno
if %ERRORLEVEL% neq 0 (
    echo.
    echo [BLAD] Claude zakonczyl sie z kodem: %ERRORLEVEL%
    pause
)

REM Jesli uruchomiono przez dwuklik, zatrzymaj na koniec
if "%~1"=="" pause

endlocal
