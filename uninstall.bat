@echo off
setlocal enabledelayedexpansion
title IFC VIEWER 3D - Uninstaller
color 0C

echo ========================================================
echo        IFC VIEWER 3D - AUTOMATED UNINSTALLER
echo        Copyright (c) 2026 Arman Arisman - MIT License
echo ========================================================
echo.
echo This script will cleanly remove IFC Viewer installation,
echo shortcuts, and build cache from your computer.
echo.

set "TARGET_DIR=%LOCALAPPDATA%\Programs\IFC Viewer"
set "DESKTOP_LNK=%USERPROFILE%\Desktop\IFC Viewer.lnk"
set "START_LNK=%APPDATA%\Microsoft\Windows\Start Menu\Programs\IFC Viewer.lnk"

:: 1. Remove Target Installed Program
if exist "%TARGET_DIR%" (
    echo [1/3] Removing installation folder...
    rmdir /S /Q "%TARGET_DIR%"
    echo Installation folder deleted.
) else (
    echo [1/3] Installation folder not found.
)

:: 2. Remove Shortcuts
echo [2/3] Removing Desktop and Start Menu Shortcuts...
if exist "%DESKTOP_LNK%" (
    del /F /Q "%DESKTOP_LNK%"
    echo Desktop shortcut removed.
)

if exist "%START_LNK%" (
    del /F /Q "%START_LNK%"
    echo Start Menu shortcut removed.
)

:: 3. Clean Project Build Cache
echo [3/3] Cleaning local build cache folders...
if exist "dist" rmdir /S /Q "dist"
if exist "build" rmdir /S /Q "build"
if exist "IFCViewer.spec" del /F /Q "IFCViewer.spec"

color 0A
echo.
echo ========================================================
echo [SUCCESS] IFC VIEWER UNINSTALLED CLEANLY!
echo ========================================================
echo.
pause
