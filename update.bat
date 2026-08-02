@echo off
title Sales & Inventory App — Update
color 0A

cd /d "%~dp0"

echo ============================================================
echo   Sales ^& Inventory App — Applying Update
echo ============================================================
echo.

echo [1/2] Installing updated dependencies...
call npm install --loglevel error
if errorlevel 1 (
    echo  ERROR: npm install failed.
    pause
    exit /b 1
)
echo  Done.
echo.

echo [2/2] Applying database schema changes...
call npx prisma db push
if errorlevel 1 (
    echo  ERROR: Database update failed.
    pause
    exit /b 1
)
echo  Done.
echo.

echo ============================================================
echo   Update complete! Start the app from your desktop shortcut.
echo ============================================================
echo.
pause
