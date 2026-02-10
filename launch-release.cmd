@echo off
:: ClaudeHydra - Build Release & Launch (with sccache)
title ClaudeHydra - Building Release...

echo ========================================
echo   ClaudeHydra - Build ^& Launch
echo ========================================
echo.

cd /d "%~dp0claude-gui"

REM Enable sccache for faster Rust compilation
set RUSTC_WRAPPER=C:\Users\BIURODOM\Desktop\ClaudeHydra\bin\sccache\sccache.exe
"%RUSTC_WRAPPER%" --start-server 2>nul

echo [1/2] Budowanie release (sccache enabled)...
echo.
call pnpm run tauri:build
if %errorlevel% neq 0 (
    echo.
    echo [ERROR] Build nie powiodl sie! Kod: %errorlevel%
    pause
    exit /b %errorlevel%
)

echo.
echo [2/2] Uruchamianie aplikacji...
set "EXE=%~dp0claude-gui\src-tauri\target\release\claude-gui.exe"
if not exist "%EXE%" (
    echo [ERROR] Nie znaleziono: %EXE%
    pause
    exit /b 1
)

"%RUSTC_WRAPPER%" --show-stats 2>nul | findstr "Cache hits rate"
start "" "%EXE%"
