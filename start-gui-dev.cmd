@echo off
:: Claude Code GUI - Development Launcher
:: Uruchamia frontend (Vite) + backend (Tauri) z hot reload

title Claude Code GUI - Dev Mode
echo ========================================
echo   Claude Code GUI - Development Mode
echo ========================================
echo   Frontend: http://localhost:1420
echo   HMR Port: 1421
echo ========================================
echo.

cd /d "%~dp0claude-gui"

:: Check if node_modules exists
if not exist "node_modules" (
    echo [INFO] Installing dependencies...
    call pnpm install
)

echo [INFO] Starting Tauri dev server...
echo [INFO] Press Ctrl+C to stop
echo.

call pnpm tauri dev
