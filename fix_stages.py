import sqlite3
import os

db_path = 'workflow_tareas.db'
if not os.path.exists(db_path):
    print("DB not found")
    exit(1)

conn = sqlite3.connect(db_path)
c = conn.cursor()

# Set category based on (P)
c.execute("UPDATE audit_tasks SET category = 'Etapa de Preparación' WHERE name LIKE '(P) %' OR name LIKE '(P)-%'")
# Set category based on (E)
c.execute("UPDATE audit_tasks SET category = 'Etapa de Ejecución' WHERE name LIKE '(E) %' OR name LIKE '(E)-%'")
# Set category based on (C)
c.execute("UPDATE audit_tasks SET category = 'Etapa de Cierre' WHERE name LIKE '(C) %' OR name LIKE '(C)-%'")

conn.commit()
print("Updated tasks successfully")
conn.close()
