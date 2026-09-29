@echo off
"%~dp0runtime\node\node.exe" "%~dp0launcher.cjs"
if errorlevel 1 pause
