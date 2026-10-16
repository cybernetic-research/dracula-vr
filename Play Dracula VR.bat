@echo off
rem Double-click to play (Windows). Starts the game server and opens the game in your browser.
rem The media folder is the one prepared from your disc; set DRACULA_MEDIA to use another one.
setlocal
cd /d "%~dp0"
title Dracula Unleashed VR
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is needed: install it from https://nodejs.org, then double-click this again.
  pause
  exit /b 1
)
set "MEDIA=%DRACULA_MEDIA%"
if not defined MEDIA if exist "%USERPROFILE%\Videos\dracula-vr-media\game.json" set "MEDIA=%USERPROFILE%\Videos\dracula-vr-media"
if not defined MEDIA if exist "%USERPROFILE%\Movies\dracula-vr-media\game.json" set "MEDIA=%USERPROFILE%\Movies\dracula-vr-media"
if not defined MEDIA if exist "%~dp0..\dracula-vr-media\game.json" set "MEDIA=%~dp0..\dracula-vr-media"
if not defined MEDIA (
  echo No prepared media folder found. Put the dracula-vr-media folder made from your own disc in
  echo   %USERPROFILE%\Videos\dracula-vr-media
  echo or set DRACULA_MEDIA to where it is.
  pause
  exit /b 1
)
echo Dracula Unleashed VR. Close this window to stop the game server.
echo If Windows asks whether Node.js may use the network, allow "Private networks" so the Quest can connect.
echo.
node tools\serve.mjs --https --open --media "%MEDIA%"
pause
