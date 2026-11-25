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
echo Use the Local URL printed above. The port may change if another app is using it.
pause
endlocal
