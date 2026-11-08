@echo off
cd /d "%~dp0"
echo =========================================
echo Cleaning build remnants (dist, target)...
echo Core files are safe and will not be touched.
echo =========================================
echo.

echo [1/2] Deleting dist folder...
if exist "dist" rmdir /s /q "dist"

echo.
echo [2/2] Deleting src-tauri\target folder...
if exist "src-tauri\target" rmdir /s /q "src-tauri\target"

echo.
echo =========================================
echo Cleanup safely completed!
echo =========================================
pause
