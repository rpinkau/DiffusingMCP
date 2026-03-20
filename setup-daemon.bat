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

echo [4/5] Installiere globales Kommando (Link)...
call npm link

echo [5/5] Richtie Windows-Autostart ein...
call pm2-startup install
call pm2 save

echo ======================================================
echo SETUP ERFOLGREICH!
echo Die Kapsel ist jetzt gebuendelt (gepackt).
echo [TIPP] Du kannst jetzt den 'node_modules'-Ordner loeschen,
echo da alles Wichtige in 'build/index.js' steckt.
echo.
echo - Logs ansehen: pm2 logs diffusing-mcp
echo - Status pruefen: pm2 status
echo ======================================================
pause
