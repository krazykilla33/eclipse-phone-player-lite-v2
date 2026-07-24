@echo off
setlocal
title Build Eclipse Phone Player Lite

where node >nul 2>nul || (
  echo Node.js is not installed. Install Node.js 22 or newer first.
  pause
  exit /b 1
)

where cargo >nul 2>nul || (
  echo Rust is not installed. Install Rust from https://rustup.rs first.
  pause
  exit /b 1
)

call npm install
if errorlevel 1 goto :failed

call npm run tauri build
if errorlevel 1 goto :failed

echo.
echo Build complete.
echo Portable EXE: src-tauri\target\release\eclipse-phone-player-lite.exe
echo Installers:   src-tauri\target\release\bundle
pause
exit /b 0

:failed
echo.
echo The build did not complete. Review the error shown above.
pause
exit /b 1
