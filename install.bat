@echo off
setlocal enabledelayedexpansion
title IFC VIEWER 3D - 1-Click Installer
color 0B

echo ========================================================
echo       IFC VIEWER 3D - SETUP AND AUTOMATED INSTALLER
echo       Copyright (c) 2026 Arman Arisman - MIT License
echo ========================================================
echo.

:: 1. Check Python
where python >nul 2>nul
if %errorlevel% neq 0 (
    color 0C
    echo [ERROR] Python was not detected in your system PATH.
    echo Please install Python 3.8+ from https://www.python.org/
    echo Make sure to check "Add Python to PATH" during installation.
    echo.
    pause
    exit /b 1
)

:: 2. Install / Verify Dependencies
echo [1/4] Installing Python dependencies pywebview and pyinstaller...
python -m pip install --upgrade pywebview pyinstaller
if %errorlevel% neq 0 (
    color 0C
    echo [ERROR] Failed to install Python dependencies via pip.
    pause
    exit /b 1
)

:: 3. Build Executable via Python Builder
echo.
echo [2/4] Building IFC Viewer executable package with PyInstaller...
python installer/build_installer.py
if %errorlevel% neq 0 (
    color 0C
    echo [ERROR] Application build compilation failed.
    pause
    exit /b 1
)

:: 4. Target Installation Folder Setup
set "TARGET_DIR=%LOCALAPPDATA%\Programs\IFC Viewer"

echo.
echo [3/4] Installing application files to: "%TARGET_DIR%"...
if not exist "%TARGET_DIR%" mkdir "%TARGET_DIR%"

xcopy /E /Y /I "dist\IFCViewer\*" "%TARGET_DIR%\" >nul
if %errorlevel% neq 0 (
    color 0C
    echo [ERROR] Failed to copy installation files.
    pause
    exit /b 1
)

:: 5. Create Desktop & Start Menu Shortcuts via PowerShell
echo.
echo [4/4] Creating Desktop and Start Menu Shortcuts...

set "TARGET_EXE=%TARGET_DIR%\IFCViewer.exe"
set "DESKTOP_LNK=%USERPROFILE%\Desktop\IFC Viewer.lnk"
set "START_LNK=%APPDATA%\Microsoft\Windows\Start Menu\Programs\IFC Viewer.lnk"

powershell -NoProfile -ExecutionPolicy Bypass -Command "$ws = New-Object -ComObject WScript.Shell; $s1 = $ws.CreateShortcut('%DESKTOP_LNK%'); $s1.TargetPath = '%TARGET_EXE%'; $s1.WorkingDirectory = '%TARGET_DIR%'; $s1.Save(); $s2 = $ws.CreateShortcut('%START_LNK%'); $s2.TargetPath = '%TARGET_EXE%'; $s2.WorkingDirectory = '%TARGET_DIR%'; $s2.Save()"

color 0A
echo.
echo ========================================================
echo [SUCCESS] IFC VIEWER INSTALLED SUCCESSFULLY!
echo ========================================================
echo.
echo Application installed at:
echo %TARGET_DIR%\IFCViewer.exe
echo.
echo Shortcuts created at:
echo  1. Desktop ("IFC Viewer")
echo  2. Start Menu ("IFC Viewer")
echo.
echo Press any key to launch IFC Viewer now...
pause >nul

start "" "%TARGET_DIR%\IFCViewer.exe"
