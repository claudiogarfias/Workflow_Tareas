@echo off
setlocal
cd /d "%~dp0"

:: 1. Verificamos/Instalamos dependencias de forma silenciosa (como hacía tu BAT anterior)
pip install flask flask-cors werkzeug >nul 2>&1

:: 2. Lanzamos el script VBS que inicia Chrome y el servidor de forma OCULTA
start /b wscript.exe "iniciar_oculto.vbs"

:: 3. Salimos del CMD para que se cierre la ventana de inmediato
exit


