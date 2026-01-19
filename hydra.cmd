@echo off
SETLOCAL EnableDelayedExpansion
chcp 65001 >nul 2>&1

:: ═══════════════════════════════════════════════════════════════════
:: HYDRA Launcher v5.0 - Entry Point
:: ═══════════════════════════════════════════════════════════════════
::
:: Usage:
::   hydra.cmd              Normal launch
::   hydra.cmd --yolo       YOLO mode (safety disabled)
::   hydra.cmd --doctor     Run system diagnostics
::   hydra.cmd --watchdog   Monitor Ollama health continuously
::   hydra.cmd --ping       Network diagnostics
::   hydra.cmd --models     List available models
::   hydra.cmd --gpu        Show GPU information
::
:: ═══════════════════════════════════════════════════════════════════

:: Check for help flag
if "%1"=="--help" goto :help
if "%1"=="-h" goto :help
if "%1"=="/?" goto :help

:: Check for Node.js
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo.
    echo [ERROR] Node.js not found!
    echo         Install Node.js 20+ from https://nodejs.org
    echo.
    pause
    exit /b 1
)

:: Get script directory
set "SCRIPT_DIR=%~dp0"

:: Run the JS launcher, pass all arguments
node "%SCRIPT_DIR%scripts\hydra-launcher.js" %*

:: If JS fails immediately, pause to show error
if %errorlevel% neq 0 (
    echo.
    echo [ERROR] Launcher failed with code %errorlevel%
    pause
)

goto :eof

:help
echo.
echo HYDRA Launcher v5.0
echo Three-Headed Beast - Ollama + Gemini CLI + MCP
echo ═══════════════════════════════════════════════════════════════════
echo.
echo Usage: hydra.cmd [options]
echo.
echo COMMANDS:
echo   --doctor, -d       Run system diagnostics
echo   --watchdog, -w     Monitor Ollama health continuously
echo   --ping             Run network diagnostics
echo   --models           List available models
echo   --stats            Show model usage statistics
echo   --gpu              Show GPU information
echo   --crashes          List crash reports
echo   --benchmarks       Show startup benchmarks
echo   --completions      Generate shell completions
echo   --show-config      Show current configuration
echo   --version, -v      Show version
echo   --help, -h         Show this help message
echo.
echo OPTIONS:
echo   --yolo             Enable YOLO mode (disable safety)
echo   --no-banner        Hide ASCII banner
echo   --no-color         Disable colors
echo   --portable         Run in portable mode
echo   --host URL         Override Ollama host URL
echo   --model NAME       Override default model
echo   --log-level LVL    Set log level (debug/info/warn/error)
echo.
echo EXAMPLES:
echo   hydra.cmd                       Start normally
echo   hydra.cmd --doctor              Check system health
echo   hydra.cmd --watchdog            Run as Ollama watchdog
echo   hydra.cmd --ping                Test network connectivity
echo   hydra.cmd --models              Show available models
echo   hydra.cmd --gpu                 Show GPU info
echo   hydra.cmd --yolo                Start in YOLO mode
echo   hydra.cmd --completions pwsh    Generate PowerShell completions
echo   hydra.cmd --host http://x:11434 Use remote Ollama
echo.
echo Config: Edit hydra.config.json to customize settings
echo.
goto :eof

ENDLOCAL
