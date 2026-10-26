@echo off
chcp 65001 >nul
title Cliffy - GitHub'a yukle
cd /d "%~dp0"
echo Kod GitHub'a yukleniyor...
echo Giris penceresi acilirsa "Sign in with your browser" deyip tarayicida "Authorize" butonuna basin.
echo.
"C:\Program Files\Git\cmd\git.exe" push -u origin main
echo.
if %errorlevel%==0 (echo TAMAM: Kod GitHub'a yuklendi.) else (echo HATA: Yukleme basarisiz. Bu pencerenin ekran goruntusunu Claude'a gonderin.)
echo.
pause
