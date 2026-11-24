@echo off
:: ============================================================
:: AJ Console for Premiere Pro — Setup & 1-Click Installer
:: ============================================================

echo.
echo  ==============================================
echo   AJ Console for Premiere Pro - 1-Click Setup
echo  ==============================================
echo.

:: ── Step 1: Terminate running instances ─────────────────────
echo [1/5] Stopping any running overlay / hook processes...
taskkill /F /IM "fxconsole-hook.exe" >nul 2>&1
taskkill /F /IM "electron.exe" >nul 2>&1

:: ── Step 2: Enable CEP Debug Mode in Registry ───────────────
echo [2/5] Enabling Adobe CEP Debug Mode (CSXS 9-16)...

reg add "HKCU\SOFTWARE\Adobe\CSXS.9" /v PlayerDebugMode /t REG_SZ /d 1 /f >nul 2>&1
reg add "HKCU\SOFTWARE\Adobe\CSXS.10" /v PlayerDebugMode /t REG_SZ /d 1 /f >nul 2>&1
reg add "HKCU\SOFTWARE\Adobe\CSXS.11" /v PlayerDebugMode /t REG_SZ /d 1 /f >nul 2>&1
reg add "HKCU\SOFTWARE\Adobe\CSXS.12" /v PlayerDebugMode /t REG_SZ /d 1 /f >nul 2>&1
reg add "HKCU\SOFTWARE\Adobe\CSXS.13" /v PlayerDebugMode /t REG_SZ /d 1 /f >nul 2>&1
reg add "HKCU\SOFTWARE\Adobe\CSXS.14" /v PlayerDebugMode /t REG_SZ /d 1 /f >nul 2>&1
reg add "HKCU\SOFTWARE\Adobe\CSXS.15" /v PlayerDebugMode /t REG_SZ /d 1 /f >nul 2>&1
reg add "HKCU\SOFTWARE\Adobe\CSXS.16" /v PlayerDebugMode /t REG_SZ /d 1 /f >nul 2>&1

echo       PlayerDebugMode enabled.

:: ── Step 3: Install Extension & Overlay ─────────────────────
echo [3/5] Installing CEP Extension and Overlay...

set "EXT_DIR=%APPDATA%\Adobe\CEP\extensions"
if not exist "%EXT_DIR%" mkdir "%EXT_DIR%"

:: Remove previous junctions/folders safely
if exist "%EXT_DIR%\com.fxconsole.premiere" rmdir "%EXT_DIR%\com.fxconsole.premiere" >nul 2>&1
if exist "%EXT_DIR%\com.fxconsole.premiere" rmdir /S /Q "%EXT_DIR%\com.fxconsole.premiere" >nul 2>&1

if exist "%EXT_DIR%\overlay" rmdir "%EXT_DIR%\overlay" >nul 2>&1
if exist "%EXT_DIR%\overlay" rmdir /S /Q "%EXT_DIR%\overlay" >nul 2>&1

:: Create directory junctions (or copy fallback)
mklink /J "%EXT_DIR%\com.fxconsole.premiere" "%~dp0com.fxconsole.premiere" >nul 2>&1
if not exist "%EXT_DIR%\com.fxconsole.premiere" (
    xcopy /E /I /Y "%~dp0com.fxconsole.premiere" "%EXT_DIR%\com.fxconsole.premiere" >nul
)

mklink /J "%EXT_DIR%\overlay" "%~dp0overlay" >nul 2>&1
if not exist "%EXT_DIR%\overlay" (
    xcopy /E /I /Y "%~dp0overlay" "%EXT_DIR%\overlay" >nul
)

echo       Installed to %EXT_DIR%

:: ── Step 4: Clean up any legacy Startup entry ───────────────
echo [4/5] Configuring Premiere-only auto-launch...

set "STARTUP_BAT=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\AJConsole.bat"
if exist "%STARTUP_BAT%" del /F /Q "%STARTUP_BAT%" >nul 2>&1

echo       AJ Console will now activate strictly when Adobe Premiere Pro is running.

:: ── Step 5: Start Service only if Premiere Pro is running ────
echo [5/5] Checking if Premiere Pro is running...
tasklist /FI "IMAGENAME eq Adobe Premiere Pro.exe" /NH | find /I "Premiere" >nul 2>&1
if %errorlevel%==0 (
    cd /d "%~dp0overlay"
    start "" "node_modules\electron\dist\electron.exe" .
    echo       Premiere Pro is active - Overlay service started.
) else (
    echo       Premiere Pro is closed - Service will start automatically when you launch Premiere Pro.
)

echo.
echo  ==============================================
echo   AJ Console is Ready!
echo  ==============================================
echo.
echo  1. Launch Adobe Premiere Pro.
echo  2. Open Window ^> Extensions ^> AJ Console once.
echo  3. Press Ctrl+Space anywhere to search and apply effects!
echo.
pause
