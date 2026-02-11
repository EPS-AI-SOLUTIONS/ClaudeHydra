@echo off
REM ========================================
REM  Claude HYDRA - Clean Rebuild
REM  Czyści cache Vite/Tauri i buduje od nowa
REM ========================================
setlocal

cd /d "%~dp0"

echo.
echo [1/4] Czyszczenie cache Vite...
if exist "node_modules\.vite" rmdir /s /q "node_modules\.vite"

echo [2/4] Czyszczenie dist...
if exist "dist" rmdir /s /q "dist"

echo [3/4] Czyszczenie cache Tauri...
if exist "src-tauri\target\debug\build" (
    echo        (pomijam Rust cache - tylko frontend)
)

echo [4/4] Budowanie...
echo.

REM Parse arguments
if "%1"=="--dev" goto dev
if "%1"=="-d" goto dev
if "%1"=="--release" goto release
if "%1"=="-r" goto release
goto dev

:dev
echo Uruchamiam tauri dev (z czystym cache)...
call pnpm tauri dev
goto end

:release
echo Budowanie RELEASE (z czystym cache)...
set RUSTC_WRAPPER=C:\Users\BIURODOM\Desktop\ClaudeHydra\bin\sccache\sccache.exe
"%RUSTC_WRAPPER%" --start-server 2>nul
call pnpm tauri build --no-bundle
goto end

:end
endlocal
