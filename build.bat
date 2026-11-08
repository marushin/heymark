@echo off
cd /d "%~dp0"
echo ========================================
echo hey, mark! Production Build
echo ========================================
echo.
echo [1/2] Installing dependencies...
call npm ci
if %ERRORLEVEL% neq 0 (
    echo Error during npm ci.
    pause
    exit /b %ERRORLEVEL%
)

echo.
echo [2/2] Building Tauri bundle...
call npm run tauri build
if %ERRORLEVEL% neq 0 (
    echo Error during tauri build.
    pause
    exit /b %ERRORLEVEL%
)

echo.
echo ========================================
echo Build Completed Successfully!
echo ========================================
echo Output files can be found in:
echo src-tauri\target\release\bundle\nsis\
echo.
pause
