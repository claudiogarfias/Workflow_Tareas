# Workflow de Tareas

Plataforma de gestión de tareas, auditorías y desviaciones, construida en Python (Flask) y SQLite.

## Requisitos
- Python 3.8+
- Entorno de Windows recomendado (scripts batch incluidos)

## Instalación y Configuración

1. Instalar dependencias:
   ```bash
   pip install -r requirements.txt
   ```

2. Configurar la base de datos:
   (La base de datos SQLite se autogenera en la primera ejecución o usando `migrate_db.py`).

## Uso

- Para iniciar el servidor de desarrollo:
  ```bash
  python server.py
  ```
- Para producción en Windows, utilizar los scripts proporcionados (`iniciar.bat`, `run_waitress.py`).
