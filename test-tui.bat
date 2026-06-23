@echo off
chcp 65001 >nul
title YourCA TUI Test
cd /d "%~dp0"
echo ========================================
echo  YourCA TUI Test
echo  This window IS a real terminal (TTY)
echo ========================================
echo.
echo Starting yourca with a test query...
echo (The Ink TUI will render here)
echo.
echo Press Ctrl+C to exit when done.
echo.
node dist\index.js "桌面上有哪些文件"
echo.
echo ========================================
echo  Test complete. If you saw the Ink UI
echo  render correctly above, the TUI works.
echo ========================================
pause
