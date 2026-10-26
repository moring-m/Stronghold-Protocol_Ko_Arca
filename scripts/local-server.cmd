@echo off
rem Double-click: update claude-work, prepare official resources, start http://localhost:3000 (no tunnel).
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0local-server.ps1" %*
pause
