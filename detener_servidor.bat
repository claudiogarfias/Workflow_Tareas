@echo off
echo Buscando servidor de Workflow de Tareas en el puerto 5001...

for /f "tokens=5" %%a in ('netstat -aon ^| find ":5001" ^| find "LISTENING"') do (
    echo Deteniendo el proceso con PID: %%a...
    taskkill /F /PID %%a
    echo.
    echo Servidor detenido correctamente.
    timeout /t 3 >nul
    exit
)

echo No se encontro ningun servidor corriendo en el puerto 5001.
timeout /t 3 >nul
exit
