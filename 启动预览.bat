@echo off
title ellipse
cd /d "%~dp0"

rem 双击本文件 = 起一个本地服务器 + 自动打开浏览器。
rem 直接双击 index.html 是不行的：file:// 下浏览器会拦掉模块加载。

where node >nul 2>nul
if errorlevel 1 goto nonode

echo.
echo   正在启动本地预览，稍等一下会自动打开浏览器...
echo.
start "ellipse-server" cmd /k node scripts\serve.mjs 5173
ping -n 3 127.0.0.1 >nul
start "" "http://localhost:5173/index.html"
echo   预览地址： http://localhost:5173/index.html
echo   要停止预览，关掉那个标题为 ellipse-server 的黑色窗口即可。
echo.
ping -n 6 127.0.0.1 >nul
exit /b 0

:nonode
echo.
echo   没有找到 Node.js。
echo.
echo   请先打开 https://nodejs.org 下载安装 LTS 版本，
echo   一路「下一步」装完，再回来双击本文件。
echo.
pause
exit /b 1
