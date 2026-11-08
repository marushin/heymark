@echo off
cd /d "%~dp0"
setlocal disabledelayedexpansion

echo ========================================
echo hey, mark! Deployment Asset Collector (Auto-Signing)
echo ========================================

:: Read version - Using PowerShell to be 100% safe
set "VERSION="
for /f "usebackq delims=" %%v in (`powershell "$v=(Get-Content 'src-tauri\tauri.conf.json' | ConvertFrom-Json).version; $v"`) do set VERSION=%%v

if "%VERSION%"=="" (
    echo [ERROR] Could not detect version from tauri.conf.json
    pause
    exit /b 1
)

echo.
echo Detected Version: v%VERSION%
set "RELEASE_DIR=releases\v%VERSION%"

if not exist "%RELEASE_DIR%" (
    mkdir "%RELEASE_DIR%"
    echo Created directory: %RELEASE_DIR%
)

echo.
echo [1/3] Copying binaries...
powershell -Command "if (Test-Path 'src-tauri\target\release\bundle\nsis\*_%VERSION%_x64-setup.exe') { Copy-Item 'src-tauri\target\release\bundle\nsis\*_%VERSION%_x64-setup.exe' -Destination '%RELEASE_DIR%\' -Force; '  [OK] Installer copied.' } else { '  [ERROR] Installer not found.' }"
powershell -Command "if (Test-Path 'src-tauri\target\release\heymark.exe') { Copy-Item 'src-tauri\target\release\heymark.exe' -Destination '%RELEASE_DIR%\heymark_%VERSION%_portable.exe' -Force; '  [OK] Portable file copied from build dir.' } else { '  [ERROR] Portable file not found in build dir.' }"

echo.
echo [2/2] Deployment assets collected!
echo.
echo ========================================
echo Deployment process completed!
echo Location: %RELEASE_DIR%
echo.
echo Files to upload to GitHub:
echo 1. Installer (*.exe)
echo 2. Portable (*.exe)
echo ========================================
pause
