@echo off
setlocal
where node >nul 2>nul
if errorlevel 1 (
  echo Install Node.js 22 LTS or newer from https://nodejs.org/
  pause
  exit /b 1
)
node "%~dp0start-local.mjs"
echo.
echo Local URL: http://127.0.0.1:8765/
pause
endlocal
