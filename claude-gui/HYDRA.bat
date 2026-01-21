@echo off
title Claude HYDRA Launcher
cd /d "%~dp0"

REM Sprawdź czy jest zbudowana wersja
if exist "src-tauri\target\debug\claude-gui.exe" (
    echo [HYDRA] Starting application...
    start "" "src-tauri\target\debug\claude-gui.exe"
    exit
)

REM Dev mode - uruchom tauri dev zminimalizowany
echo [HYDRA] Dev mode - building and starting...
start /min cmd /c "npm run tauri dev"
echo [HYDRA] Terminal minimized. App will open when ready.
timeout /t 3 >nul
