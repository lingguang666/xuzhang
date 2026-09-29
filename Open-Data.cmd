@echo off
"%~dp0runtime\node\node.exe" "%~dp0launcher.cjs" data
if errorlevel 1 pause
