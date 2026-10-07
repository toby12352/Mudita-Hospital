@echo off
REM Restarts mudita-api.exe after clean exit (used for Admin DB restore).
setlocal
cd /d "%~dp0"
:loop
mudita-api.exe -config config.json
set EXITCODE=%ERRORLEVEL%
echo [%DATE% %TIME%] mudita-api exited with %EXITCODE% — restarting in 3s...
timeout /t 3 /nobreak >nul
goto loop
