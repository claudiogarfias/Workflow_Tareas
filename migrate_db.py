import sqlite3
DB_FILE = 'workflow_tareas.db'
conn = sqlite3.connect(DB_FILE)
c = conn.cursor()

try:
    c.execute("ALTER TABLE template_tasks ADD COLUMN weight REAL DEFAULT 0;")
    print("Added weight to template_tasks")
except Exception as e:
    print("template_tasks:", e)

try:
    c.execute("ALTER TABLE audit_tasks ADD COLUMN weight REAL DEFAULT 0;")
    print("Added weight to audit_tasks")
except Exception as e:
    print("audit_tasks:", e)

conn.commit()
conn.close()
