@echo off
cd /d "%~dp0"
start "Servidor Dashboard" /min cmd /c "node scripts\static-server.mjs"
timeout /t 1 /nobreak >nul
start http://localhost:5173/
