@echo off
title Adauga regula firewall pentru CRM (port 3000)
cd /d "%~dp0"
echo.
echo Trebuie rulat cu drepturi de Administrator.
echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0add-firewall-rule.ps1"
echo.
pause
