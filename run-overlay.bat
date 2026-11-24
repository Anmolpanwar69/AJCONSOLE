@echo off
title AJ Console Overlay (Ctrl+Space)
cd /d "%~dp0overlay"
start "" "node_modules\electron\dist\electron.exe" .
