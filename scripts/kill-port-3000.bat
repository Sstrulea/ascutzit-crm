@echo off
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :3000 ^| findstr LISTENING') do (
  taskkill /F /PID %%a >nul 2>&1
  echo Procesul de pe portul 3000 a fost oprit (PID %%a).
  exit /b 0
)
echo Niciun proces nu asculta pe portul 3000.
exit /b 0
