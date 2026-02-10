@echo off
REM Fast Build Script with sccache for Claude HYDRA
REM Uses sccache for compilation caching - ~44% faster rebuilds
REM Uses "tauri build" to ensure frontend (Vite) is built before Rust

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
echo Building DEV version (frontend + Rust)...
cd /d "%~dp0"
call pnpm tauri build --debug --no-bundle
goto end

:release
echo Building RELEASE version (frontend + Rust)...
cd /d "%~dp0"
call pnpm tauri build --no-bundle
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
