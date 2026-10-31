@echo off
REM ==========================================================================
REM  Heist Race - double-click this file to start the game on Windows.
REM  It installs what's needed the first time, starts the game server and
REM  opens the game in your browser. Close this window to stop the game.
REM ==========================================================================
title Heist Race
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo  Node.js is not installed.
  echo  Download the LTS version from https://nodejs.org, install it,
  echo  then double-click this file again.
  echo.
  start "" https://nodejs.org
  pause
  exit /b
)

if not exist node_modules (
  echo  First start: installing the game's dependencies, please wait...
  call npm install
)

echo.
echo  Starting Heist Race... your browser will open in a few seconds.
echo  To play with a second player, open the room link in another tab.
echo  Close this window to stop the game.
echo.
start "" cmd /c "timeout /t 6 >nul & start http://localhost:5173"
call npm run dev
pause
