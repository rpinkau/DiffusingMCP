@echo off
setlocal
echo ======================================================
echo Diffusing MCP Capsule - Daemon Setup
echo ======================================================

:: Check if Node/NPM is installed
where npm >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] npm wurde nicht gefunden. Bitte installiere Node.js zuerst!
    pause
    exit /b 1
)

echo [1/5] Installiere PM2 global...
call npm install -g pm2 pm2-windows-startup

echo [2/5] Installiere lokale Abhaengigkeiten...
call npm install

echo [3/5] Baue das Projekt...
call npm run build
if %errorlevel% neq 0 (
    echo [ERROR] Build fehlgeschlagen. Abbruch!
    pause
    exit /b 1
)

echo [4/5] Installiere globales Kommando (Link)...
call npm link

echo [5/5] Starte den MCP-Daemon...
call pm2 delete diffusing-mcp 2>nul
call pm2 start build/daemon.js --name diffusing-mcp --watch

echo [6/5] Richtie Windows-Autostart ein...
call pm2-startup install
call pm2 save

echo ======================================================
echo SETUP ERFOLGREICH!
echo Die Kapsel läuft nun im Hintergrund (pm2 status).
echo.
echo - Logs ansehen: pm2 logs diffusing-mcp
echo - Status prüfen: pm2 status
echo ======================================================
