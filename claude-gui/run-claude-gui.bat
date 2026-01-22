@echo off
title Claude HYDRA - Starting...
cd /d C:\Users\BIURODOM\Desktop\ClaudeHydra\claude-gui

echo.
echo  ╔═══════════════════════════════════════════╗
echo  ║     CLAUDE HYDRA - AI Swarm Control       ║
echo  ╚═══════════════════════════════════════════╝
echo.

:: 1. Start Ollama (jeśli nie działa)
echo [1/3] Checking Ollama...
tasklist /FI "IMAGENAME eq ollama.exe" 2>nul | find /I "ollama.exe" >nul
if %errorlevel% neq 0 (
    echo       Starting Ollama...
    start "" /B "C:\Users\BIURODOM\AppData\Local\Programs\Ollama\ollama app.exe"
    timeout /t 3 /nobreak >nul
) else (
    echo       Ollama already running
)

:: 2. Kill existing dev server on port 4200
echo [2/3] Preparing dev server...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":4200" ^| findstr "LISTENING" 2^>nul') do (
    taskkill /PID %%a /F >nul 2>nul
)
timeout /t 1 /nobreak >nul

:: 3. Start Tauri dev
echo [3/3] Starting Claude HYDRA...
echo.
echo  ══════════════════════════════════════════════
echo   App: http://localhost:4200
echo   Press Ctrl+C to stop
echo  ══════════════════════════════════════════════
echo.

call npm run tauri dev

echo.
echo  ══════════════════════════════════════════════
echo   Claude HYDRA stopped (code: %errorlevel%)
echo  ══════════════════════════════════════════════
pause
