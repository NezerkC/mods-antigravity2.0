@echo off
setlocal
cd /d "%~dp0"
title Antigravity Mod Daemon Control

:: Si se pasaron argumentos por linea de comandos, ejecutarlos directamente
if not "%~1"=="" (
    node framework/daemon.js %*
    exit /b %ERRORLEVEL%
)

:MENU
cls
echo ===================================================
echo     ANTIGRAVITY 2.0 - MOD DAEMON CONTROL
echo ===================================================
echo.
echo  [1] Iniciar en segundo plano (con System Tray)
echo  [2] Ver estado del daemon y persistencia
echo  [3] Detener daemon y System Tray
echo  [4] Instalar en el inicio de Windows (Auto-start)
echo  [5] Desinstalar del inicio de Windows
echo  [6] Salir
echo.
set /p opt="Selecciona una opcion (1-6): "

if "%opt%"=="1" goto OP_START
if "%opt%"=="2" goto OP_STATUS
if "%opt%"=="3" goto OP_STOP
if "%opt%"=="4" goto OP_INSTALL
if "%opt%"=="5" goto OP_UNINSTALL
if "%opt%"=="6" goto OP_EXIT
goto MENU

:OP_START
echo.
echo [*] Iniciando daemon en segundo plano...
call npm run daemon:start
echo.
pause
goto MENU

:OP_STATUS
echo.
call npm run daemon:status
echo.
pause
goto MENU

:OP_STOP
echo.
echo [*] Deteniendo procesos...
call npm run daemon:stop
echo.
pause
goto MENU

:OP_INSTALL
echo.
call npm run daemon:install
echo.
pause
goto MENU

:OP_UNINSTALL
echo.
call npm run daemon:uninstall
echo.
pause
goto MENU

:OP_EXIT
exit /b 0
