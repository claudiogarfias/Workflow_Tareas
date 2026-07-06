import zipfile
import os
import datetime

def create_backup():
    # Ruta de destino y nombre del archivo zip con la fecha actual
    dest_dir = r"C:\Personal\Proyectos IA\1. Wokflow de Tareas"
    if not os.path.exists(dest_dir):
        os.makedirs(dest_dir)
        
    date_str = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
    zip_filename = os.path.join(dest_dir, f"Workflow_v1.0_{date_str}.zip")
    
    # Archivos y carpetas a incluir
    targets = [
        "server.py", 
        "workflow_tareas.db", 
        "requirements.txt",
        "iniciar.bat",
        "detener_servidor.bat",
        "iniciar_oculto.vbs",
        "static"
    ]
    
    print(f"Creando respaldo en: {zip_filename}...")
    
    try:
        with zipfile.ZipFile(zip_filename, 'w', zipfile.ZIP_DEFLATED) as zipf:
            for target in targets:
                if not os.path.exists(target):
                    print(f"Advertencia: no se encontró '{target}', omitiendo...")
                    continue
                    
                if os.path.isfile(target):
                    zipf.write(target, target)
                    print(f"Agregado: {target}")
                elif os.path.isdir(target):
                    for root, dirs, files in os.walk(target):
                        # Omitir cache de python
                        if '__pycache__' in dirs:
                            dirs.remove('__pycache__')
                        for file in files:
                            file_path = os.path.join(root, file)
                            arcname = os.path.relpath(file_path, start='.')
                            zipf.write(file_path, arcname)
                    print(f"Agregada carpeta: {target}")
                    
        print(f"\n¡Respaldo exitoso! Se ha creado el archivo: {zip_filename}")
        print("Puedes guardarlo en un lugar seguro para restaurar el sistema a esta versión en el futuro.")
    except Exception as e:
        print(f"\nOcurrió un error al crear el respaldo: {e}")
        
    input("\nPresiona Enter para salir...")

if __name__ == "__main__":
    create_backup()
