@echo off
REM Quick shortcut creator for ClaudeHydra
REM Usage: create-shortcut.bat [mode] [--all]

cd /d %~dp0..

if "%1"=="--all" (
    powershell -ExecutionPolicy Bypass -File "%~dp0create-shortcut.ps1" -AllModes
) else if "%1"=="--verbose" (
    powershell -ExecutionPolicy Bypass -File "%~dp0create-shortcut.ps1" -Verbose
) else if "%1"=="" (
    powershell -ExecutionPolicy Bypass -File "%~dp0create-shortcut.ps1"
) else (
    powershell -ExecutionPolicy Bypass -File "%~dp0create-shortcut.ps1" -Mode %1
)

pause
