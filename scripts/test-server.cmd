@echo off
rem Double-click: update claude-work, prepare official resources, start the server and the Cloudflare tunnel.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0test-server.ps1" %*
pause
