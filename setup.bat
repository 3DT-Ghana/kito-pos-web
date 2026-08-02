@echo off
setlocal EnableDelayedExpansion
title Sales & Inventory App — First-Time Setup
color 0A

echo ============================================================
echo   Sales ^& Inventory App — First-Time Setup
echo ============================================================
echo.

:: ---------------------------------------------------------------
:: Step 1 — Check Node.js
:: ---------------------------------------------------------------
echo [1/6] Checking Node.js...
node -v >nul 2>&1
if errorlevel 1 (
    echo.
    echo  ERROR: Node.js is not installed.
    echo.
    echo  Please download and install Node.js from:
    echo    https://nodejs.org/
    echo.
    echo  Choose the "LTS" version, run the installer, then
    echo  re-run this setup script.
    echo.
    pause
    exit /b 1
)
for /f "tokens=*" %%V in ('node -v') do echo  Found Node.js %%V
echo.

:: ---------------------------------------------------------------
:: Step 2 — Install / detect PostgreSQL
:: ---------------------------------------------------------------
echo [2/6] Checking PostgreSQL...

:: Try to find pg_ctl in common locations
set PG_BIN=
for %%D in (
    "C:\Program Files\PostgreSQL\16\bin"
    "C:\Program Files\PostgreSQL\15\bin"
    "C:\Program Files\PostgreSQL\17\bin"
) do (
    if exist "%%~D\pg_ctl.exe" (
        set PG_BIN=%%~D
        goto :pg_found
    )
)

:: Not found — download and install silently
echo  PostgreSQL not found. Downloading installer (this may take a few minutes)...
echo.

set PG_INSTALLER=%TEMP%\postgresql-16-setup.exe
set PG_URL=https://get.enterprisedb.com/postgresql/postgresql-16-windows-x64.exe

:: Use PowerShell to download
powershell -NoProfile -Command "& { $ProgressPreference='SilentlyContinue'; Invoke-WebRequest -Uri '%PG_URL%' -OutFile '%PG_INSTALLER%' }" 2>nul
if not exist "%PG_INSTALLER%" (
    echo  ERROR: Could not download PostgreSQL installer.
    echo  Check your internet connection and try again.
    echo.
    pause
    exit /b 1
)

echo  Installing PostgreSQL 16 (this takes 1-2 minutes, please wait)...
"%PG_INSTALLER%" --mode unattended --superpassword "localpass" --servicename "postgresql-16" --servicepassword "localpass" --serverport 5432
if errorlevel 1 (
    echo  ERROR: PostgreSQL installation failed.
    echo  Try running setup.bat again as Administrator.
    echo.
    pause
    exit /b 1
)
del /f /q "%PG_INSTALLER%" >nul 2>&1

:: Locate freshly installed bin directory
for %%D in (
    "C:\Program Files\PostgreSQL\16\bin"
    "C:\Program Files\PostgreSQL\15\bin"
    "C:\Program Files\PostgreSQL\17\bin"
) do (
    if exist "%%~D\pg_ctl.exe" (
        set PG_BIN=%%~D
        goto :pg_found
    )
)

echo  ERROR: PostgreSQL installed but bin directory not found.
pause
exit /b 1

:pg_found
echo  Found PostgreSQL at: %PG_BIN%
set PATH=%PG_BIN%;%PATH%
echo.

:: ---------------------------------------------------------------
:: Step 3 — Ensure PostgreSQL service is running
:: ---------------------------------------------------------------
echo [3/6] Starting PostgreSQL service...
net start postgresql-16 >nul 2>&1
:: Give it a moment to be ready
timeout /t 3 /nobreak >nul
echo  PostgreSQL service is running.
echo.

:: ---------------------------------------------------------------
:: Step 4 — Create database
:: ---------------------------------------------------------------
echo [4/6] Creating database...

:: Check if DB already exists
"%PG_BIN%\psql.exe" -U postgres -c "\l" 2>nul | findstr /i "salesinventory" >nul 2>&1
if not errorlevel 1 (
    echo  Database "salesinventory" already exists — skipping creation.
) else (
    "%PG_BIN%\createdb.exe" -U postgres salesinventory 2>nul
    if errorlevel 1 (
        :: Try again in case the service needed more time
        timeout /t 5 /nobreak >nul
        "%PG_BIN%\createdb.exe" -U postgres salesinventory
        if errorlevel 1 (
            echo  ERROR: Could not create database. Make sure PostgreSQL is running.
            pause
            exit /b 1
        )
    )
    echo  Database "salesinventory" created successfully.
)
echo.

:: ---------------------------------------------------------------
:: Step 5 — Install Node dependencies
:: ---------------------------------------------------------------
echo [5/6] Installing app dependencies (this may take a few minutes)...
call npm install --loglevel error
if errorlevel 1 (
    echo  ERROR: npm install failed. Check your internet connection.
    pause
    exit /b 1
)
echo  Dependencies installed.
echo.

:: ---------------------------------------------------------------
:: Step 6 — Push database schema
:: ---------------------------------------------------------------
echo [6/6] Setting up database tables...
call npx prisma db push
if errorlevel 1 (
    echo  ERROR: Database schema setup failed.
    echo  Make sure the .env file has the correct DATABASE_URL.
    pause
    exit /b 1
)
echo  Database tables created.
echo.

:: ---------------------------------------------------------------
:: Create Desktop Shortcut
:: ---------------------------------------------------------------
echo Creating desktop shortcut...
set SHORTCUT_PATH=%USERPROFILE%\Desktop\Sales App.lnk
set APP_DIR=%~dp0

powershell -NoProfile -Command "& { $ws = New-Object -ComObject WScript.Shell; $sc = $ws.CreateShortcut('%SHORTCUT_PATH%'); $sc.TargetPath = '%APP_DIR%start.bat'; $sc.WorkingDirectory = '%APP_DIR%'; $sc.WindowStyle = 1; $sc.Description = 'Sales and Inventory App'; $sc.Save() }" >nul 2>&1
echo  Shortcut created on Desktop: "Sales App.lnk"
echo.

:: ---------------------------------------------------------------
:: Done
:: ---------------------------------------------------------------
echo ============================================================
echo   Setup complete!
echo ============================================================
echo.
echo  To start the app daily, double-click "Sales App" on your Desktop
echo  or run start.bat in this folder.
echo.
set /p LAUNCH="Launch the app now? (y/n): "
if /i "%LAUNCH%"=="y" (
    start "" http://localhost:3000
    call npm start
) else (
    echo.
    echo  Run start.bat whenever you want to open the app.
    echo.
    pause
)
