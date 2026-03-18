@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0"
set "LIB=C:\Users\BIURODOM\Desktop\JaskierWorkspace\jaskier-lib.bat"

:: Init colors
call "%LIB%" :init_colors
:: Kill previous instances
taskkill /F /IM claudehydra-backend.exe >nul 2>&1
title [Jaskier] ClaudeHydra v4 Release
echo !BOLD!!MAGENTA!=== ClaudeHydra v4 Release ===!RESET!

:: Log init
call "%LIB%" :log_init "claudehydra" "release"

:: Validate .env
call "%LIB%" :env_check "%~dp0.env" "GOOGLE_API_KEY ANTHROPIC_API_KEY"
call "%LIB%" :env_check "%~dp0backend\.env" "DATABASE_URL GOOGLE_API_KEY ANTHROPIC_API_KEY"

:: Docker DB check
call "%LIB%" :docker_db_check "claudehydra-db-1" "%~dp0backend"

:: Cargo build pre-check
call "%LIB%" :cargo_check "%~dp0backend" "claudehydra-backend.exe"

:: OAuth Router (port 3001)
netstat -ano 2>nul | findstr ":3001 " | findstr "LISTENING" >nul 2>&1
if errorlevel 1 (
    echo !CYAN![START]!RESET! OAuth router on port 3001...
    start /B "" npx anthropic-max-router --port 3001 --quiet
    %SYSTEMROOT%\System32\timeout.exe /t 3 /nobreak >nul
) else (
    echo !GREEN![OK]!RESET! OAuth router already running on port 3001
)

:: Kill old processes (graceful)
call "%LIB%" :kill_port 8082 "backend"
call "%LIB%" :wait_port_free 8082
call "%LIB%" :kill_port 4199 "preview"

:: Partner check
call "%LIB%" :partner_check 8081 "GeminiHydra"

:: Start backend
echo !CYAN![START]!RESET! Backend on port 8082...
set DATABASE_URL=postgres://claude:claude_local@localhost:5433/claudehydra
call "%LIB%" :log_rotate "jaskier-claudehydra-backend"
powershell -NoProfile -WindowStyle Hidden -Command "Start-Process cmd -ArgumentList '/c \"%~dp0backend\target\release\claudehydra-backend.exe\" > \"%TEMP%\jaskier-claudehydra-backend.log\" 2>&1' -WindowStyle Hidden"
%SYSTEMROOT%\System32\timeout.exe /t 2 /nobreak >nul

:: Health check
call "%LIB%" :health_check 8082 15

:: Build frontend
echo !CYAN![BUILD]!RESET! Building frontend...
call bun run build

:: Open Chrome in app mode
start "" chrome --app=http://localhost:4199

:: Toast notification
call "%LIB%" :toast "ClaudeHydra v4" "Release preview on port 4199"

:: Start preview (foreground)
echo !CYAN![PREVIEW]!RESET! Starting preview on port 4199...
endlocal && cd /d "%~dp0" && bun run preview

