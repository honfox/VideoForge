@echo off
chcp 65001 >nul 2>&1
cd /d "%~dp0"
title VideoForge 视频格式转换器

rem 优先使用已打包的单文件版（dist\VideoForge.exe）
if exist "%~dp0dist\VideoForge.exe" (
  echo.
  echo   正在启动 VideoForge 单文件版，浏览器会自动打开...
  echo.
  "%~dp0dist\VideoForge.exe"
  exit /b 0
)

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo   [!] 没有找到 Node.js
  echo.
  echo       方式一：安装 Node.js 20 或更高版本后重新双击本文件
  echo                https://nodejs.org
  echo.
  echo       方式二：直接使用已打包的 dist\VideoForge.exe（无需 Node.js）
  echo.
  pause
  exit /b 1
)

echo.
echo   正在启动本地服务，浏览器会自动打开...
echo.

node server.js --open

echo.
echo   服务已停止，窗口即将关闭。
timeout /t 2 >nul
