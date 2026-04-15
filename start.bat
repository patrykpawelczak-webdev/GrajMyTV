@echo off
chcp 65001 >nul
title GrajMyTV - Serwer

cls
echo.
echo  =====================================
echo        GrajMyTV - SERWER LOKALNY
echo  =====================================
echo.

node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo  [BLAD] Node.js nie jest zainstalowany!
    echo  Pobierz ze strony: https://nodejs.org
    pause
    exit /b 1
)

cd /d "%~dp0"

if not exist "server.js" (
    echo  [BLAD] Nie znaleziono server.js
    pause
    exit /b 1
)

if not exist "node_modules" (
    echo  [INFO] Instaluje zaleznosci...
    npm install
    if %errorlevel% neq 0 (
        echo  [BLAD] npm install nie powiodl sie!
        pause
        exit /b 1
    )
)

node -e "require('qrcode-terminal')" >nul 2>&1
if %errorlevel% neq 0 (
    echo  [INFO] Instaluje qrcode-terminal...
    npm install qrcode-terminal --save
)

echo  [INFO] Uruchamiam serwer...
echo.

start "" cmd /c "timeout /t 2 /nobreak >nul & start http://localhost:3000"

node server.js

echo.
echo  =====================================
echo       Serwer zostal zatrzymany.
echo  =====================================
pause