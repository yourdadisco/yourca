@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo.
echo Pushing YourCA Stable to yourdadisco/yourca (main branch)
echo.
echo 1. Go to https://github.com/settings/tokens and create a token
echo 2. Paste the token below:
echo.
set /p TOKEN="GitHub Token: "
git remote set-url origin https://yourdadisco:%TOKEN%@github.com/yourdadisco/yourca.git
git push -u origin main
echo.
if %errorlevel% equ 0 (
    echo ✅ Push successful! View at: https://github.com/yourdadisco/yourca
) else (
    echo ❌ Push failed. Check your token and try again.
)
pause
