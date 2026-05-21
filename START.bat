@echo off
title DripTrack Server
echo.
echo  ██████╗ ██████╗ ██╗██████╗ ████████╗██████╗  █████╗  ██████╗██╗  ██╗
echo  ██╔══██╗██╔══██╗██║██╔══██╗╚══██╔══╝██╔══██╗██╔══██╗██╔════╝██║ ██╔╝
echo  ██║  ██║██████╔╝██║██████╔╝   ██║   ██████╔╝███████║██║     █████╔╝
echo  ██║  ██║██╔══██╗██║██╔═══╝    ██║   ██╔══██╗██╔══██║██║     ██╔═██╗
echo  ██████╔╝██║  ██║██║██║        ██║   ██║  ██║██║  ██║╚██████╗██║  ██╗
echo  ╚═════╝ ╚═╝  ╚═╝╚═╝╚═╝        ╚═╝   ╚═╝  ╚═╝╚═╝  ╚═╝ ╚═════╝╚═╝  ╚═╝
echo.
echo  Starting on port 3001 (separate from any other projects)...
echo.
echo  Killing anything already on port 3001...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":3001 "') do (
    taskkill /PID %%a /F >nul 2>&1
)
echo  Done.
echo.
echo  Opening http://localhost:3001 in 3 seconds...
timeout /t 3 /nobreak >nul
start "" "http://localhost:3001"
echo.
cd /d "%~dp0backend"
npm start
pause
