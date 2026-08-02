@echo off
setlocal
title Package App for Customer
color 0B

cd /d "%~dp0"

:: ---------------------------------------------------------------
:: Build the Next.js app first
:: ---------------------------------------------------------------
echo Building app...
call npm run build
if errorlevel 1 (
    echo ERROR: Build failed. Fix errors before packaging.
    pause
    exit /b 1
)
echo Build complete.
echo.

:: ---------------------------------------------------------------
:: Create output zip
:: ---------------------------------------------------------------
set ZIP_NAME=SalesInventoryApp-%date:~-4,4%%date:~-7,2%%date:~-10,2%.zip
set STAGING=%TEMP%\salesapp-staging

:: Clean staging
if exist "%STAGING%" rmdir /s /q "%STAGING%"
mkdir "%STAGING%"

:: Copy files to include
echo Copying files...
xcopy /e /i /q ".next"          "%STAGING%\.next"
xcopy /e /i /q "public"         "%STAGING%\public"
xcopy /e /i /q "prisma"         "%STAGING%\prisma"
copy /y "package.json"          "%STAGING%\package.json"      >nul
copy /y "package-lock.json"     "%STAGING%\package-lock.json" >nul
copy /y "setup.bat"             "%STAGING%\setup.bat"         >nul
copy /y "start.bat"             "%STAGING%\start.bat"         >nul
copy /y "update.bat"            "%STAGING%\update.bat"        >nul
:: Generate a fresh NEXTAUTH_SECRET and write the customer .env
for /f "tokens=*" %%S in ('powershell -NoProfile -Command "[Convert]::ToBase64String((1..32 | ForEach-Object { [byte][char][System.Security.Cryptography.RandomNumberGenerator]::GetInt32(33,126) }))"') do set NEXTAUTH_SEC=%%S
(
  echo DATABASE_URL="postgresql://postgres:localpass@localhost:5432/salesinventory"
  echo DIRECT_URL="postgresql://postgres:localpass@localhost:5432/salesinventory"
  echo NEXTAUTH_SECRET="%NEXTAUTH_SEC%"
  echo NEXTAUTH_URL="http://localhost:3000"
) > "%STAGING%\.env"

:: Zip using PowerShell
echo Creating zip archive: %ZIP_NAME%
powershell -NoProfile -Command "Compress-Archive -Path '%STAGING%\*' -DestinationPath '%~dp0%ZIP_NAME%' -Force"
if errorlevel 1 (
    echo ERROR: Failed to create zip.
    pause
    exit /b 1
)

:: Clean up staging
rmdir /s /q "%STAGING%"

echo.
echo ============================================================
echo   Package ready: %ZIP_NAME%
echo ============================================================
echo.
echo  Send this zip to the customer. They should:
echo   1. Install Node.js from https://nodejs.org/ (LTS version)
echo   2. Extract the zip to a folder (e.g. C:\SalesApp)
echo   3. Run setup.bat (first time only)
echo   4. Use the Desktop shortcut or start.bat daily
echo.
pause
