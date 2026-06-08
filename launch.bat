@echo off
:: Check if the terminal is already running on port 3000
netstat -ano | findstr ":3000 " | findstr "LISTENING" >nul 2>&1
if %errorlevel% == 0 (
    :: Already running — just open the browser
    start "" "http://localhost:3000"
) else (
    :: Start the production server minimised, then open browser after 4 seconds
    cd /d "%~dp0"
    start "Bloomberg Terminal" /min cmd /c "npm start"
    timeout /t 4 /nobreak >nul
    start "" "http://localhost:3000"
)
