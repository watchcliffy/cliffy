@echo off
title Cliffy Sunucusu
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js bulunamadi. Lutfen https://nodejs.org adresinden kurun.
  pause
  exit /b
)

rem Sunucu zaten aciksa sadece tarayiciyi ac.
powershell -NoProfile -Command "try { (New-Object Net.Sockets.TcpClient('localhost', 3000)).Close(); exit 0 } catch { exit 1 }"
if not errorlevel 1 (
  echo Cliffy zaten calisiyor, tarayici aciliyor...
  start "" http://localhost:3000
  timeout /t 3 >nul
  exit /b
)

if not exist "media\demo\clip1.mp4" (
  echo Demo videolar indiriliyor...
  node download-demo.js
)

echo.
echo  Programi kapatmak icin bu pencereyi kapatin.
set OPEN_BROWSER=1
node server.js
pause
