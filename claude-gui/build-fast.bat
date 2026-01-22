@echo off
REM Fast Build Script with sccache for Claude HYDRA
REM Uses sccache for compilation caching - ~44% faster rebuilds

setlocal

REM Set sccache as compiler wrapper
set RUSTC_WRAPPER=C:\Users\BIURODOM\Desktop\ClaudeHydra\bin\sccache\sccache.exe

REM Start sccache server if not running
"%RUSTC_WRAPPER%" --start-server 2>nul

echo ========================================
echo  Claude HYDRA Fast Build (sccache)
echo ========================================
echo.

REM Parse arguments
if "%1"=="--release" goto release
if "%1"=="-r" goto release
if "%1"=="--clean" goto clean
if "%1"=="--stats" goto stats
goto dev

:dev
echo Building DEV version...
cd /d "%~dp0src-tauri"
cargo build
goto end

:release
echo Building RELEASE version...
cd /d "%~dp0src-tauri"
cargo build --release
goto end

:clean
echo Cleaning build artifacts...
cd /d "%~dp0src-tauri"
cargo clean
echo Done!
goto end

:stats
echo sccache Statistics:
echo.
"%RUSTC_WRAPPER%" --show-stats
goto end

:end
echo.
echo ========================================
echo  Build Complete!
echo ========================================
"%RUSTC_WRAPPER%" --show-stats 2>nul | findstr "Cache hits rate"
endlocal
