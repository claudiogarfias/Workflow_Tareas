import os
from waitress import serve
from server import app, init_db

if __name__ == '__main__':
    # Inicializar la base de datos (crear tablas si no existen)
    init_db()
    
    # Obtener el puerto dinámico asignado por IIS HttpPlatformHandler
    # Si no existe, usar el puerto por defecto 5001
    port = int(os.environ.get('HTTP_PLATFORM_PORT', 5001))
    
    print(f"Iniciando servidor de producción Waitress en el puerto {port}...")
    # Escuchar en loopback local ya que IIS actúa como proxy reverso
    serve(app, host='127.0.0.1', port=port, threads=8)
