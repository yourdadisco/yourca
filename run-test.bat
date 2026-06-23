@echo off
chcp 65001 >nul
cd /d "%~dp0"

REM Read API key from config
for /f "tokens=2 delims=:" %%a in ('type "%USERPROFILE%\.yourca\config.json" ^| find "api_key"') do set KEY=%%a
set KEY=%KEY:"=%
set KEY=%KEY: =%
set KEY=%KEY:,=%

REM Run yourca
set DEEPSEEK_API_KEY=%KEY%
node dist\index.js %* > tty-capture.log 2>&1
type tty-capture.log
