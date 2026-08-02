@echo off
title Sales & Inventory App
color 0A

cd /d "%~dp0"

:: Start PostgreSQL service if not already running
net start postgresql-16 >nul 2>&1

:: Open browser
start "" http://localhost:3000

:: Start the Next.js app
npm start
