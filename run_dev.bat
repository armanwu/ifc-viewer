@echo off
setlocal enabledelayedexpansion
title IFC VIEWER - Development Launcher
color 0A

echo ========================================================
echo        IFC VIEWER 3D - DEVELOPMENT LAUNCHER
echo        Copyright (c) 2026 Arman Arisman - MIT License
echo ========================================================
echo.

where python >nul 2>nul
if %errorlevel% neq 0 (
    color 0C
    echo [ERROR] Python not detected. Please install Python 3.8+ first.
    pause
    exit /b 1
)

echo [1/2] Checking Python pywebview dependency...
python -c "import webview" >nul 2>nul
if %errorlevel% neq 0 (
    echo [INFO] Installing pywebview...
    python -m pip install pywebview
)

echo.
echo [2/2] Launching IFC Viewer Desktop in Development Mode...
echo.
python src/app.py

if %errorlevel% neq 0 (
    color 0C
    echo.
    echo [ERROR] Application stopped with an error.
    pause
)
