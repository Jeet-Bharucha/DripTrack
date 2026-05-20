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
echo  Killing anything on port 3000...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":3000 "') do (
    taskkill /PID %%a /F >nul 2>&1
)
echo  Done. Starting DripTrack...
echo.
cd /d "%~dp0backend"
npm start
pause
