from flask import Flask, request, jsonify, send_from_directory, session, abort
from flask_cors import CORS
import sqlite3
import os
import json
import uuid
from datetime import datetime, date, timedelta
from werkzeug.security import generate_password_hash, check_password_hash
from functools import wraps

app = Flask(__name__, static_folder='static')
app.secret_key = 'super_secret_key_v2_2026' # Change in production
CORS(app)

@app.after_request
def add_cache_control(response):
    if request.path.startswith('/api/'):
        response.headers['Cache-Control'] = 'no-store, no-cache, must-revalidate, max-age=0'
        response.headers['Pragma'] = 'no-cache'
        response.headers['Expires'] = '0'
    return response

@app.before_request
def check_auth():
    if request.path.startswith('/api/') and request.path not in ['/api/login', '/api/reset-admin']:
        if 'username' not in session:
            return jsonify({"status":"error", "message":"No autenticado"}), 401

DB_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'workflow_tareas.db')

def get_db():
    conn = sqlite3.connect(DB_FILE)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn

def gen_id():
    return str(uuid.uuid4())[:8]

def today_str():
    return date.today().isoformat()

def get_calculated_status(c, audit_id, db_status):
    if db_status == 'Cerrada':
        return 'Cerrada'
    c.execute('SELECT COUNT(*), SUM(CASE WHEN status="Completada" THEN 1 ELSE 0 END), SUM(CASE WHEN status="En Progreso" THEN 1 ELSE 0 END) FROM audit_tasks WHERE audit_id=?', (audit_id,))
    res = c.fetchone()
    total = res[0] or 0
    completed = res[1] or 0
    in_progress = res[2] or 0
    if total == 0:
        return 'Planificación'
    if completed == total:
        return 'Finalizada'
    if completed > 0 or in_progress > 0:
        return 'En Ejecución'
    return 'Planificación'

def get_user_from_request():
    return session.get('username', request.headers.get('X-User', 'Sistema'))

def append_auth_filter(q, params, table_alias='', audit_id_column='id'):
    role = session.get('role', 'auditor')
    if role in ('admin', 'gerente'):
        return q
    
    prefix = f"{table_alias}." if table_alias else ""
    if role == 'jefe':
        username = session.get('username')
        q += f" AND {prefix}{audit_id_column} IN (SELECT audit_id FROM audit_areas WHERE area_id IN (SELECT area_id FROM user_areas WHERE username=?))"
        params.append(username)
    elif role == 'auditor':
        full_name = session.get('full_name')
        q += f" AND {prefix}{audit_id_column} IN (SELECT audit_id FROM audit_tasks WHERE responsible=? AND deleted_at IS NULL)"
        params.append(full_name)
    return q

def get_current_user_role():
    return session.get('role', 'auditor')

def login_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if 'username' not in session:
            return jsonify({"status":"error", "message":"No autenticado"}), 401
        return f(*args, **kwargs)
    return decorated_function

def require_role(*roles):
    def decorator(f):
        @wraps(f)
        def decorated_function(*args, **kwargs):
            if 'username' not in session:
                return jsonify({"status":"error", "message":"No autenticado"}), 401
            if session.get('role') not in roles and 'admin' not in roles: # Admin is explicitly checked or assumed to have all access elsewhere if needed
                if session.get('role') != 'admin': # Admin can do anything
                    return jsonify({"status":"error", "message":"Permiso denegado"}), 403
            return f(*args, **kwargs)
        return decorated_function
    return decorator

def log_activity(c, action, entity_type, entity_id, details=""):
    user = get_user_from_request()
    now = datetime.now().isoformat()
    c.execute('INSERT INTO activity_logs (id, user, action, entity_type, entity_id, details, timestamp) VALUES (?,?,?,?,?,?,?)',
              (gen_id(), user, action, entity_type, entity_id, details, now))

# ─── Schema ──────────────────────────────────────────────────────────────────

def init_db():
    conn = get_db(); c = conn.cursor()

    c.execute('''CREATE TABLE IF NOT EXISTS users (
        username TEXT PRIMARY KEY, password TEXT NOT NULL, full_name TEXT,
        role TEXT DEFAULT 'auditor', status TEXT DEFAULT 'active', failed_attempts INTEGER DEFAULT 0
    )''')

    c.execute('''CREATE TABLE IF NOT EXISTS auditors (
        id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE
    )''')

    c.execute('''CREATE TABLE IF NOT EXISTS areas (
        id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE
    )''')
    c.execute('''CREATE TABLE IF NOT EXISTS user_areas (
        username TEXT, area_id TEXT,
        PRIMARY KEY (username, area_id),
        FOREIGN KEY (username) REFERENCES users(username) ON DELETE CASCADE,
        FOREIGN KEY (area_id) REFERENCES areas(id) ON DELETE CASCADE
    )''')
    c.execute('''CREATE TABLE IF NOT EXISTS audit_areas (
        audit_id TEXT, area_id TEXT,
        PRIMARY KEY (audit_id, area_id),
        FOREIGN KEY (audit_id) REFERENCES audits(id) ON DELETE CASCADE,
        FOREIGN KEY (area_id) REFERENCES areas(id) ON DELETE CASCADE
    )''')

    c.execute('''CREATE TABLE IF NOT EXISTS plans (
        id TEXT PRIMARY KEY, name TEXT NOT NULL, year INTEGER, description TEXT,
        status TEXT DEFAULT 'Activo', created_at TEXT
    )''')

    c.execute('''CREATE TABLE IF NOT EXISTS audit_templates (
        id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT, created_at TEXT, updated_at TEXT
    )''')
    c.execute('''CREATE TABLE IF NOT EXISTS template_tasks (
        id TEXT PRIMARY KEY, template_id TEXT NOT NULL, name TEXT NOT NULL, description TEXT, order_num INTEGER DEFAULT 0, weight REAL DEFAULT 0.0,
        FOREIGN KEY (template_id) REFERENCES audit_templates(id) ON DELETE CASCADE
    )''')

    c.execute('''CREATE TABLE IF NOT EXISTS audits (
        id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT,
        status TEXT DEFAULT 'Planificación', start_date TEXT, end_date TEXT,
        responsible TEXT, template_id TEXT, plan_id TEXT,
        created_at TEXT, updated_at TEXT, closed_at TEXT,
        auditors TEXT, responsible_area TEXT, audit_type TEXT
    )''')

    c.execute('''CREATE TABLE IF NOT EXISTS audit_tasks (
        id TEXT PRIMARY KEY, audit_id TEXT, name TEXT NOT NULL,
        description TEXT, responsible TEXT, status TEXT DEFAULT 'Pendiente',
        priority TEXT DEFAULT 'Media', category TEXT DEFAULT '', weight REAL DEFAULT 0.0,
        start_date TEXT, due_date TEXT, completed_date TEXT,
        order_num INTEGER DEFAULT 0, created_at TEXT, updated_at TEXT,
        FOREIGN KEY (audit_id) REFERENCES audits(id) ON DELETE CASCADE
    )''')

    c.execute('''CREATE TABLE IF NOT EXISTS deviations (
        id TEXT PRIMARY KEY, audit_id TEXT NOT NULL, task_id TEXT,
        title TEXT NOT NULL, description TEXT, severity TEXT DEFAULT 'Media',
        status TEXT DEFAULT 'Abierta', responsible TEXT, detected_date TEXT,
        resolution_date TEXT, action_plan TEXT, comments TEXT,
        created_at TEXT, updated_at TEXT,
        FOREIGN KEY (audit_id) REFERENCES audits(id) ON DELETE CASCADE
    )''')
    c.execute('''CREATE TABLE IF NOT EXISTS task_categories (
        id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE
    )''')
    c.execute('''CREATE TABLE IF NOT EXISTS activity_logs (
        id TEXT PRIMARY KEY, user TEXT NOT NULL, action TEXT NOT NULL,
        entity_type TEXT NOT NULL, entity_id TEXT NOT NULL,
        details TEXT, timestamp TEXT NOT NULL
    )''')

    # Migrations for existing DBs
    for col, dflt in [('order_num','0'),('category',"''"),('deleted_at',"NULL"),('weight','0.0')]:
        try: c.execute(f"ALTER TABLE audit_tasks ADD COLUMN {col} TEXT DEFAULT {dflt}")
        except: pass
    for col, dflt in [('plan_id',"NULL"),('closed_at',"NULL"),('auditors',"NULL"),('responsible_area',"NULL"),('audit_type',"NULL"),('deleted_at',"NULL")]:
        try: c.execute(f"ALTER TABLE audits ADD COLUMN {col} TEXT DEFAULT {dflt}")
        except: pass
    for col, dflt in [('weight','0.0'), ('template_id', "''")]:
        try: c.execute(f"ALTER TABLE template_tasks ADD COLUMN {col} TEXT DEFAULT {dflt}")
        except: pass

    # Admin seed
    c.execute('SELECT COUNT(*) FROM users')
    if c.fetchone()[0] == 0:
        c.execute("INSERT INTO users (username, password, full_name, role) VALUES (?,?,?,?)",
                  ('admin', generate_password_hash('auditoria2026'), 'Administrador', 'admin'))

    # Areas seed
    c.execute('SELECT COUNT(*) FROM areas')
    if c.fetchone()[0] == 0:
        for area_name in ['TI', 'ROCF', 'SPF', 'Compartida']:
            c.execute("INSERT INTO areas (id, name) VALUES (?, ?)", (gen_id(), area_name))

    # Categories seed
    c.execute('SELECT COUNT(*) FROM task_categories')
    if c.fetchone()[0] == 0:
        for cat_name in ['Otras Actividades TI', 'Actividades Auditoría Continua', 'Desarrollo CAATs']:
            c.execute("INSERT INTO task_categories (id, name) VALUES (?, ?)", (gen_id(), cat_name))

    # Templates seed
    c.execute('SELECT COUNT(*) FROM audit_templates')
    if c.fetchone()[0] == 0:
        tid = gen_id()
        now = datetime.now().isoformat()
        c.execute('INSERT INTO audit_templates (id, name, description, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
                  (tid, 'Auditoría TI', 'Auditoría a proceso Tecnológico', now, now))
        
        stages_data = [
            ("Planificación", [
                ("Levantamiento de información preliminar", 5.0),
                ("Reunión de inicio (Kick-off)", 5.0),
                ("Solicitud de evidencias", 5.0)
            ]),
            ("Ejecución", [
                ("Revisión de políticas y procedimientos", 10.0),
                ("Evaluación de controles de acceso físico", 5.0),
                ("Evaluación de controles de acceso lógico", 15.0),
                ("Revisión de gestión de cambios", 10.0),
                ("Evaluación de respaldos y recuperación (Backup/Restore)", 10.0),
                ("Revisión de seguridad perimetral (Firewalls, VPN)", 10.0),
                ("Entrevistas con responsables del proceso", 5.0)
            ]),
            ("Cierre", [
                ("Elaboración de matriz de riesgos y controles", 5.0),
                ("Redacción de hallazgos preliminares", 5.0),
                ("Reunión de cierre", 5.0),
                ("Elaboración de informe borrador", 5.0),
                ("Emisión de informe final", 0.0)
            ])
        ]
        
        for i, (sname, stasks) in enumerate(stages_data):
            sid = gen_id()
            c.execute('INSERT INTO template_stages (id, template_id, name, order_num) VALUES (?, ?, ?, ?)',
                      (sid, tid, sname, i))
            for j, (tname, tweight) in enumerate(stasks):
                c.execute('INSERT INTO template_tasks (id, stage_id, name, description, order_num, weight) VALUES (?, ?, ?, ?, ?, ?)',
                          (gen_id(), sid, tname, "", j, tweight))

    # FIX missing categories based on (P), (E), (C) prefixes
    c.execute("UPDATE audit_tasks SET category = 'Etapa de Preparación' WHERE (category IS NULL OR category = '') AND (name LIKE '(P) %' OR name LIKE '(P)-%')")
    c.execute("UPDATE audit_tasks SET category = 'Etapa de Ejecución' WHERE (category IS NULL OR category = '') AND (name LIKE '(E) %' OR name LIKE '(E)-%')")
    c.execute("UPDATE audit_tasks SET category = 'Etapa de Cierre' WHERE (category IS NULL OR category = '') AND (name LIKE '(C) %' OR name LIKE '(C)-%')")

    conn.commit(); conn.close()

# ─── Static ──────────────────────────────────────────────────────────────────

@app.route('/api/reset-admin', methods=['GET'])
def reset_admin():
    conn = get_db(); c = conn.cursor()
    c.execute("UPDATE users SET password=?, status='active', failed_attempts=0 WHERE username='admin'", 
              (generate_password_hash('admin'),))
    conn.commit(); conn.close()
    return jsonify({"status": "success", "message": "Admin reset to 'admin'"})

@app.route('/')
def index():
    return send_from_directory(app.static_folder, 'index.html')

@app.route('/<path:path>')
def serve_static(path):
    return send_from_directory(app.static_folder, path)

# ─── AUTH ────────────────────────────────────────────────────────────────────





@app.route('/api/login', methods=['POST'])
def login():
    p = request.json; username = p.get('username','').strip(); password = p.get('password','')
    conn = get_db(); c = conn.cursor()
    c.execute('SELECT * FROM users WHERE username = ?', (username,))
    user = c.fetchone()
    if not user: conn.close(); return jsonify({"status":"error","message":"Credenciales inválidas"}), 401
    if user['status'] == 'locked': conn.close(); return jsonify({"status":"error","message":"Cuenta bloqueada."}), 403
    if not check_password_hash(user['password'], password):
        att = user['failed_attempts'] + 1
        if att >= 5: c.execute("UPDATE users SET failed_attempts=?, status='locked' WHERE username=?", (att, username))
        else: c.execute("UPDATE users SET failed_attempts=? WHERE username=?", (att, username))
        conn.commit(); conn.close()
        return jsonify({"status":"error","message":f"Credenciales inválidas. Quedan {max(0,5-att)} intentos."}), 401
    c.execute("UPDATE users SET failed_attempts=0 WHERE username=?", (username,))
    conn.commit(); conn.close()
    
    session['username'] = username
    session['role'] = user['role']
    session['full_name'] = user['full_name']
    session.permanent = True
    
    return jsonify({"status":"success","username":username,"role":user['role'],"full_name":user['full_name']})

@app.route('/api/logout', methods=['POST'])
def logout():
    session.clear()
    return jsonify({"status":"success"})

@app.route('/api/me', methods=['GET'])
@login_required
def me():
    return jsonify({
        "username": session.get('username'),
        "role": session.get('role'),
        "full_name": session.get('full_name')
    })

@app.route('/api/change-password', methods=['POST'])
def change_password():
    p = request.json; conn = get_db(); c = conn.cursor()
    c.execute('SELECT password FROM users WHERE username=?', (p.get('username'),))
    user = c.fetchone()
    if not user or not check_password_hash(user['password'], p.get('old_password','')): conn.close(); return jsonify({"error":"Contraseña incorrecta"}), 401
    c.execute('UPDATE users SET password=? WHERE username=?', (generate_password_hash(p['new_password']), p['username']))
    conn.commit(); conn.close(); return jsonify({"status":"success"})

# ─── USERS ───────────────────────────────────────────────────────────────────

@app.route('/api/users', methods=['GET'])
def get_users():
    conn = get_db(); c = conn.cursor()
    c.execute('''
        SELECT u.username, u.full_name, u.role, u.status, u.failed_attempts, ua.area_id 
        FROM users u 
        LEFT JOIN user_areas ua ON u.username = ua.username
    ''')
    r = [dict(x) for x in c.fetchall()]; conn.close(); return jsonify(r)

@app.route('/api/users', methods=['POST'])
def create_user():
    p = request.json
    if not p.get('username') or not p.get('password'): return jsonify({"error":"Requeridos"}), 400
    conn = get_db(); c = conn.cursor()
    try:
        c.execute('INSERT INTO users (username,password,full_name,role,status) VALUES (?,?,?,?,?)',
                  (p['username'], generate_password_hash(p['password']), p.get('full_name',''), p.get('role','auditor'), 'active'))
        if p.get('area_id'):
            c.execute('INSERT INTO user_areas (username, area_id) VALUES (?,?)', (p['username'], p['area_id']))
        conn.commit()
    except sqlite3.IntegrityError: conn.close(); return jsonify({"error":"Ya existe"}), 400
    conn.close(); return jsonify({"status":"success"})

@app.route('/api/users/<username>', methods=['PUT'])
def update_user(username):
    p = request.json; conn = get_db(); c = conn.cursor()
    if 'status' in p: c.execute('UPDATE users SET status=?, failed_attempts=? WHERE username=?', (p['status'], 0 if p['status']=='active' else 5, username))
    if 'role' in p: c.execute('UPDATE users SET role=? WHERE username=?', (p['role'], username))
    if 'full_name' in p: c.execute('UPDATE users SET full_name=? WHERE username=?', (p['full_name'], username))
    if p.get('password'): c.execute('UPDATE users SET password=? WHERE username=?', (generate_password_hash(p['password']), username))
    
    if 'area_id' in p:
        c.execute('DELETE FROM user_areas WHERE username=?', (username,))
        if p['area_id']:
            c.execute('INSERT INTO user_areas (username, area_id) VALUES (?,?)', (username, p['area_id']))
            
    conn.commit(); conn.close(); return jsonify({"status":"success"})

@app.route('/api/users/<username>', methods=['DELETE'])
def delete_user(username):
    if username == 'admin': return jsonify({"error":"No se puede eliminar admin"}), 403
    conn = get_db(); c = conn.cursor(); c.execute('DELETE FROM users WHERE username=?', (username,))
    conn.commit(); conn.close(); return jsonify({"status":"success"})

# ─── AUDITORS ────────────────────────────────────────────────────────────────

@app.route('/api/auditors', methods=['GET'])
def get_auditors():
    conn = get_db(); c = conn.cursor(); c.execute('SELECT * FROM auditors ORDER BY name')
    r = [dict(x) for x in c.fetchall()]; conn.close(); return jsonify(r)

@app.route('/api/auditors', methods=['POST'])
def create_auditor():
    p = request.json; conn = get_db(); c = conn.cursor(); aid = gen_id()
    try: c.execute('INSERT INTO auditors (id,name) VALUES (?,?)', (aid, p['name'])); conn.commit()
    except sqlite3.IntegrityError: conn.close(); return jsonify({"error":"Ya existe"}), 400
    conn.close(); return jsonify({"status":"success","id":aid})

@app.route('/api/auditors/<aid>', methods=['PUT'])
def update_auditor(aid):
    p = request.json; new_name = p.get('name','').strip()
    if not new_name: return jsonify({"error":"Nombre requerido"}), 400
    conn = get_db(); c = conn.cursor()
    try:
        c.execute('SELECT name FROM auditors WHERE id=?', (aid,))
        old = c.fetchone()
        if not old: conn.close(); return jsonify({"error":"No encontrado"}), 404
        old_name = old['name']
        c.execute('UPDATE auditors SET name=? WHERE id=?', (new_name, aid))
        # Update references in other tables
        c.execute('UPDATE audits SET responsible=? WHERE responsible=?', (new_name, old_name))
        c.execute('UPDATE audit_tasks SET responsible=? WHERE responsible=?', (new_name, old_name))
        conn.commit(); conn.close(); return jsonify({"status":"success"})
    except sqlite3.IntegrityError: conn.close(); return jsonify({"error":"Ya existe un auditor con ese nombre"}), 400

@app.route('/api/auditors/<aid>', methods=['DELETE'])
def delete_auditor(aid):
    conn = get_db(); c = conn.cursor()
    try:
        c.execute('DELETE FROM auditors WHERE id=?', (aid,))
        conn.commit(); conn.close(); return jsonify({"status":"success"})
    except: conn.close(); return jsonify({"error":"Error"}), 400

# ─── CATEGORIES ──────────────────────────────────────────────────────────────

@app.route('/api/categories', methods=['GET'])
def get_categories():
    conn = get_db(); c = conn.cursor(); c.execute('SELECT * FROM task_categories ORDER BY name')
    r = [dict(x) for x in c.fetchall()]; conn.close(); return jsonify(r)

@app.route('/api/categories', methods=['POST'])
def create_category():
    p = request.json; conn = get_db(); c = conn.cursor(); cid = gen_id()
    try: c.execute('INSERT INTO task_categories (id,name) VALUES (?,?)', (cid, p['name'])); conn.commit()
    except sqlite3.IntegrityError: conn.close(); return jsonify({"error":"Ya existe"}), 400
    conn.close(); return jsonify({"status":"success","id":cid})

@app.route('/api/categories/<cid>', methods=['PUT'])
def update_category(cid):
    p = request.json; new_name = p.get('name','').strip()
    if not new_name: return jsonify({"error":"Nombre requerido"}), 400
    conn = get_db(); c = conn.cursor()
    try:
        c.execute('SELECT name FROM task_categories WHERE id=?', (cid,))
        old = c.fetchone()
        if not old: conn.close(); return jsonify({"error":"No encontrado"}), 404
        old_name = old['name']
        c.execute('UPDATE task_categories SET name=? WHERE id=?', (new_name, cid))
        c.execute('UPDATE audit_tasks SET category=? WHERE category=?', (new_name, old_name))
        conn.commit(); conn.close(); return jsonify({"status":"success"})
    except sqlite3.IntegrityError: conn.close(); return jsonify({"error":"Ya existe una categoría con ese nombre"}), 400

@app.route('/api/categories/<cid>', methods=['DELETE'])
def delete_category(cid):
    conn = get_db(); c = conn.cursor()
    try:
        c.execute('DELETE FROM task_categories WHERE id=?', (cid,))
        conn.commit(); conn.close(); return jsonify({"status":"success"})
    except Exception as e:
        conn.close(); return jsonify({"error": str(e)}), 400

# ─── AREAS ───────────────────────────────────────────────────────────────────

@app.route('/api/areas', methods=['GET'])
def get_areas():
    conn = get_db(); c = conn.cursor(); c.execute('SELECT * FROM areas ORDER BY name')
    r = [dict(x) for x in c.fetchall()]; conn.close(); return jsonify(r)

@app.route('/api/areas', methods=['POST'])
def create_area():
    p = request.json; conn = get_db(); c = conn.cursor(); aid = gen_id()
    try:
        c.execute('INSERT INTO areas (id,name) VALUES (?,?)', (aid, p['name'])); conn.commit()
    except sqlite3.IntegrityError: conn.close(); return jsonify({"error":"Ya existe una área con ese nombre"}), 400
    conn.close(); return jsonify({"status":"success","id":aid})

@app.route('/api/areas/<aid>', methods=['PUT'])
def update_area(aid):
    p = request.json; new_name = p.get('name','').strip()
    if not new_name: return jsonify({"error":"Nombre requerido"}), 400
    conn = get_db(); c = conn.cursor()
    try:
        c.execute('SELECT name FROM areas WHERE id=?', (aid,))
        old = c.fetchone()
        if not old: conn.close(); return jsonify({"error":"No encontrado"}), 404
        c.execute('UPDATE areas SET name=? WHERE id=?', (new_name, aid))
        # Update references in audits if we store area name
        c.execute('UPDATE audits SET responsible_area=? WHERE responsible_area=?', (new_name, old['name']))
        conn.commit(); conn.close(); return jsonify({"status":"success"})
    except sqlite3.IntegrityError: conn.close(); return jsonify({"error":"Ya existe una área con ese nombre"}), 400

@app.route('/api/areas/<aid>', methods=['DELETE'])
def delete_area(aid):
    conn = get_db(); c = conn.cursor()
    try:
        c.execute('DELETE FROM areas WHERE id=?', (aid,))
        conn.commit(); conn.close(); return jsonify({"status":"success"})
    except Exception as e:
        conn.close(); return jsonify({"error": str(e)}), 400

# ─── PLANS ───────────────────────────────────────────────────────────────────

@app.route('/api/plans', methods=['GET'])
def get_plans():
    conn = get_db(); c = conn.cursor(); c.execute('SELECT * FROM plans ORDER BY year DESC, name')
    r = [dict(x) for x in c.fetchall()]; conn.close(); return jsonify(r)

@app.route('/api/plans/<pid>', methods=['GET'])
def get_plan(pid):
    conn = get_db(); c = conn.cursor(); c.execute('SELECT * FROM plans WHERE id=?', (pid,))
    r = c.fetchone(); conn.close()
    if not r: return jsonify({"error":"No encontrado"}), 404
    return jsonify(dict(r))

@app.route('/api/plans', methods=['POST'])
def create_plan():
    p = request.json; conn = get_db(); c = conn.cursor(); pid = gen_id()
    c.execute('INSERT INTO plans (id,name,year,description,status,created_at) VALUES (?,?,?,?,?,?)',
              (pid, p['name'], p.get('year', date.today().year), p.get('description',''), 'Activo', datetime.now().isoformat()))
    conn.commit(); conn.close(); return jsonify({"status":"success","id":pid})

@app.route('/api/plans/<pid>', methods=['PUT'])
def update_plan(pid):
    p = request.json; conn = get_db(); c = conn.cursor()
    c.execute('UPDATE plans SET name=?, year=?, description=?, status=? WHERE id=?',
              (p['name'], p.get('year'), p.get('description',''), p.get('status','Activo'), pid))
    conn.commit(); conn.close(); return jsonify({"status":"success"})

@app.route('/api/plans/<pid>', methods=['DELETE'])
def delete_plan(pid):
    conn = get_db(); c = conn.cursor(); c.execute('DELETE FROM plans WHERE id=?', (pid,))
    conn.commit(); conn.close(); return jsonify({"status":"success"})

# ─── TEMPLATES ───────────────────────────────────────────────────────────────

@app.route('/api/templates', methods=['GET'])
def get_templates():
    try:
        conn = get_db(); c = conn.cursor(); c.execute('SELECT * FROM audit_templates ORDER BY name')
        templates = []
        for t in c.fetchall():
            td = dict(t)
            c.execute('SELECT * FROM template_stages WHERE template_id=? ORDER BY order_num', (t['id'],))
            stages = []
            for s in c.fetchall():
                sd = dict(s)
                c.execute('SELECT * FROM template_tasks WHERE stage_id=? ORDER BY order_num', (s['id'],))
                sd['tasks'] = [dict(tk) for tk in c.fetchall()]
                stages.append(sd)
            td['stages'] = stages; templates.append(td)
        conn.close(); return jsonify(templates)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/templates', methods=['POST'])
def create_template():
    p = request.json
    stages = p.get('stages', [])
    total_weight = 0.0
    has_tasks = False
    for stage in stages:
        for task in stage.get('tasks', []):
            has_tasks = True
            try: total_weight += float(task.get('weight', 0))
            except (ValueError, TypeError): pass
    if has_tasks and abs(total_weight - 100.0) > 0.05:
        return jsonify({"error": "La suma total de pesos de las tareas debe ser exactamente 100%"}), 400

    conn = get_db(); c = conn.cursor(); tid = gen_id(); now = datetime.now().isoformat()
    c.execute('INSERT INTO audit_templates (id,name,description,created_at,updated_at) VALUES (?,?,?,?,?)', (tid, p['name'], p.get('description',''), now, now))
    for i, stage in enumerate(stages):
        sid = gen_id()
        c.execute('INSERT INTO template_stages (id,template_id,name,order_num) VALUES (?,?,?,?)', (sid, tid, stage['name'], i))
        for j, task in enumerate(stage.get('tasks', [])):
            c.execute('INSERT INTO template_tasks (id,template_id,stage_id,name,description,order_num,weight) VALUES (?,?,?,?,?,?,?)', (gen_id(), tid, sid, task['name'], task.get('description',''), j, float(task.get('weight', 0))))
    conn.commit(); conn.close(); return jsonify({"status":"success","id":tid})

@app.route('/api/templates/<tid>', methods=['GET'])
def get_template(tid):
    conn = get_db(); c = conn.cursor(); c.execute('SELECT * FROM audit_templates WHERE id=?', (tid,))
    t = c.fetchone()
    if not t: conn.close(); return jsonify({"error":"No encontrado"}), 404
    td = dict(t)
    c.execute('SELECT * FROM template_stages WHERE template_id=? ORDER BY order_num', (tid,))
    stages = []
    for s in c.fetchall():
        sd = dict(s)
        c.execute('SELECT * FROM template_tasks WHERE stage_id=? ORDER BY order_num', (s['id'],))
        sd['tasks'] = [dict(tk) for tk in c.fetchall()]
        stages.append(sd)
    td['stages'] = stages
    conn.close(); return jsonify(td)

@app.route('/api/templates/<tid>', methods=['PUT'])
def update_template(tid):
    p = request.json
    stages = p.get('stages', [])
    total_weight = 0.0
    has_tasks = False
    for stage in stages:
        for task in stage.get('tasks', []):
            has_tasks = True
            try: total_weight += float(task.get('weight', 0))
            except (ValueError, TypeError): pass
    if has_tasks and abs(total_weight - 100.0) > 0.05:
        return jsonify({"error": "La suma total de pesos de las tareas debe ser exactamente 100%"}), 400

    conn = get_db(); c = conn.cursor(); now = datetime.now().isoformat()
    try:
        # Update template details
        c.execute('UPDATE audit_templates SET name=?, description=?, updated_at=? WHERE id=?', (p['name'], p.get('description',''), now, tid))
        
        # Get existing stage IDs to delete their tasks
        c.execute('SELECT id FROM template_stages WHERE template_id=?', (tid,))
        existing_stage_ids = [r['id'] for r in c.fetchall()]
        
        if existing_stage_ids:
            placeholders = ','.join('?' for _ in existing_stage_ids)
            c.execute(f'DELETE FROM template_tasks WHERE stage_id IN ({placeholders})', existing_stage_ids)
            
        c.execute('DELETE FROM template_stages WHERE template_id=?', (tid,))
        
        # Insert new stages and tasks and store new weights for syncing
        weight_updates = {}
        for i, stage in enumerate(stages):
            sid = gen_id()
            c.execute('INSERT INTO template_stages (id,template_id,name,order_num) VALUES (?,?,?,?)', (sid, tid, stage['name'], i))
            for j, task in enumerate(stage.get('tasks', [])):
                tweight = float(task.get('weight', 0))
                c.execute('INSERT INTO template_tasks (id,template_id,stage_id,name,description,order_num,weight) VALUES (?,?,?,?,?,?,?)', 
                          (gen_id(), tid, sid, task['name'], task.get('description',''), j, tweight))
                weight_updates[(stage['name'].strip().lower(), task['name'].strip().lower())] = tweight

        # Synchronize weights in existing audits that use this template
        c.execute('SELECT id FROM audits WHERE template_id=?', (tid,))
        audit_ids = [r['id'] for r in c.fetchall()]
        for aid in audit_ids:
            c.execute('SELECT id, name, category FROM audit_tasks WHERE audit_id=? AND deleted_at IS NULL', (aid,))
            audit_tasks = c.fetchall()
            for at in audit_tasks:
                at_id = at['id']
                at_name = (at['name'] or '').strip().lower()
                at_category = (at['category'] or '').strip().lower()
                if (at_category, at_name) in weight_updates:
                    new_weight = weight_updates[(at_category, at_name)]
                    c.execute('UPDATE audit_tasks SET weight=?, updated_at=? WHERE id=?', (new_weight, now, at_id))
                    
        conn.commit(); conn.close(); return jsonify({"status":"success"})
    except Exception as e:
        conn.rollback(); conn.close(); return jsonify({"error": str(e)}), 500

@app.route('/api/templates/<tid>', methods=['DELETE'])
@require_role('admin')
def delete_template(tid):
    conn = get_db(); c = conn.cursor(); c.execute('DELETE FROM audit_templates WHERE id=?', (tid,))
    conn.commit(); conn.close(); return jsonify({"status":"success"})

@app.route('/api/templates/<tid>/duplicate', methods=['POST'])
def duplicate_template(tid):
    conn = get_db(); c = conn.cursor()
    c.execute('SELECT * FROM audit_templates WHERE id=?', (tid,)); t = c.fetchone()
    if not t: conn.close(); return jsonify({"error":"No encontrado"}), 404
    new_id = gen_id(); now = datetime.now().isoformat()
    c.execute('INSERT INTO audit_templates (id,name,description,created_at,updated_at) VALUES (?,?,?,?,?)', (new_id, t['name']+' (copia)', t['description'], now, now))
    c.execute('SELECT * FROM template_stages WHERE template_id=? ORDER BY order_num', (tid,))
    for s in c.fetchall():
        nsid = gen_id()
        c.execute('INSERT INTO template_stages (id,template_id,name,order_num) VALUES (?,?,?,?)', (nsid, new_id, s['name'], s['order_num']))
        c.execute('SELECT * FROM template_tasks WHERE stage_id=? ORDER BY order_num', (s['id'],))
        for tk in c.fetchall():
            c.execute('INSERT INTO template_tasks (id,stage_id,name,description,order_num,weight) VALUES (?,?,?,?,?,?)', (gen_id(), nsid, tk['name'], tk['description'], tk['order_num'], tk['weight']))
    conn.commit(); conn.close(); return jsonify({"status":"success","id":new_id})

# ─── AUDITS ──────────────────────────────────────────────────────────────────

@app.route('/api/audits', methods=['GET'])
def get_audits():
    conn = get_db(); c = conn.cursor()
    status_filter = request.args.get('status')
    plan_id = request.args.get('plan_id')
    q = 'SELECT * FROM audits WHERE deleted_at IS NULL'
    params = []
    
    q = append_auth_filter(q, params)
    
    if status_filter == 'active':
        q += " AND status != 'Cerrada'"
    elif status_filter == 'closed':
        q += " AND status = 'Cerrada'"
    if plan_id:
        q += ' AND plan_id=?'; params.append(plan_id)
    q += ' ORDER BY created_at DESC'
    c.execute(q, params)
    audits = []
    for a in c.fetchall():
        ad = dict(a)
        try:
            ad['auditors'] = json.loads(ad['auditors']) if ad.get('auditors') else []
        except Exception:
            ad['auditors'] = []
        if not ad['auditors'] and ad.get('responsible'):
            ad['auditors'] = [ad['responsible']]
            
        c.execute('SELECT COUNT(*) as total, SUM(CASE WHEN status="Completada" THEN 1 ELSE 0 END) as done, SUM(CASE WHEN status!="Completada" AND due_date<? AND due_date!="" THEN 1 ELSE 0 END) as overdue, SUM(weight) as total_weight, SUM(CASE WHEN status="Completada" THEN weight ELSE 0 END) as done_weight FROM audit_tasks WHERE audit_id=? AND deleted_at IS NULL', (today_str(), a['id']))
        cnt = c.fetchone()
        ad['task_total'] = cnt['total'] or 0; ad['task_done'] = cnt['done'] or 0; ad['task_overdue'] = cnt['overdue'] or 0
        total_w = cnt['total_weight'] or 0.0
        done_w = cnt['done_weight'] or 0.0
        if total_w > 0.1:
            ad['progress_pct'] = round(done_w, 1)
        else:
            ad['progress_pct'] = round((ad['task_done'] / ad['task_total'] * 100), 1) if ad['task_total'] > 0 else 0
            
        c.execute('SELECT COUNT(*) as total, SUM(CASE WHEN status="Abierta" THEN 1 ELSE 0 END) as open FROM deviations WHERE audit_id=?', (a['id'],))
        dc = c.fetchone()
        ad['deviation_total'] = dc['total'] or 0; ad['deviation_open'] = dc['open'] or 0
        ad['status'] = get_calculated_status(c, a['id'], a['status'])
        audits.append(ad)
    conn.close(); return jsonify(audits)

@app.route('/api/audits', methods=['POST'])
def create_audit():
    p = request.json; conn = get_db(); c = conn.cursor(); aid = gen_id(); now = datetime.now().isoformat()
    auditors_list = p.get('auditors', [])
    auditors_val = json.dumps(auditors_list)
    responsible_val = p.get('responsible','')
    if not responsible_val and auditors_list:
        responsible_val = auditors_list[0]
        
    areas_list = p.get('responsible_area', [])
    if isinstance(areas_list, str): areas_list = [areas_list] if areas_list else []
    areas_val = json.dumps(areas_list)
    
    c.execute('INSERT INTO audits (id,name,description,status,start_date,end_date,responsible,template_id,plan_id,created_at,updated_at,auditors,responsible_area,audit_type) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
              (aid, p['name'], p.get('description',''), p.get('status','Planificación'), p.get('start_date',''), p.get('end_date',''), responsible_val, p.get('template_id'), p.get('plan_id'), now, now, auditors_val, areas_val, p.get('audit_type')))
              
    for area_name in areas_list:
        c.execute('SELECT id FROM areas WHERE name=?', (area_name,))
        area_res = c.fetchone()
        if area_res:
            c.execute('INSERT INTO audit_areas (audit_id, area_id) VALUES (?,?)', (aid, area_res['id']))
            
    log_activity(c, 'CREAR', 'Auditoría', aid, f"Nombre: {p['name']}")
    conn.commit(); conn.close(); return jsonify({"status":"success","id":aid})

@app.route('/api/audits/<aid>', methods=['GET'])
def get_audit(aid):
    conn = get_db(); c = conn.cursor()
    q = 'SELECT * FROM audits WHERE id=? AND deleted_at IS NULL'
    params = [aid]
    q = append_auth_filter(q, params)
    c.execute(q, params)
    a = c.fetchone()
    if not a: conn.close(); return jsonify({"error":"No encontrada"}), 404
    ad = dict(a)
    try:
        ad['auditors'] = json.loads(ad['auditors']) if ad.get('auditors') else []
    except Exception:
        ad['auditors'] = []
    if not ad['auditors'] and ad.get('responsible'):
        ad['auditors'] = [ad['responsible']]
    
    # Calculate progress_pct
    c.execute('SELECT COUNT(*) as total, SUM(CASE WHEN status="Completada" THEN 1 ELSE 0 END) as done, SUM(weight) as total_weight, SUM(CASE WHEN status="Completada" THEN weight ELSE 0 END) as done_weight FROM audit_tasks WHERE audit_id=? AND deleted_at IS NULL', (aid,))
    cnt = c.fetchone()
    total_cnt = cnt['total'] or 0
    done_cnt = cnt['done'] or 0
    total_w = cnt['total_weight'] or 0.0
    done_w = cnt['done_weight'] or 0.0
    if total_w > 0.1:
        ad['progress_pct'] = round(done_w, 1)
    else:
        ad['progress_pct'] = round((done_cnt / total_cnt * 100), 1) if total_cnt > 0 else 0

    c.execute('SELECT * FROM audit_tasks WHERE audit_id=? AND deleted_at IS NULL ORDER BY CAST(order_num AS INTEGER), created_at', (aid,))
    ad['tasks'] = [dict(tk) for tk in c.fetchall()]
    c.execute('SELECT * FROM deviations WHERE audit_id=? ORDER BY created_at DESC', (aid,))
    ad['deviations'] = [dict(d) for d in c.fetchall()]
    ad['status'] = get_calculated_status(c, aid, a['status'])
    conn.close(); return jsonify(ad)

@app.route('/api/audits/<aid>', methods=['PUT'])
def update_audit(aid):
    p = request.json; conn = get_db(); c = conn.cursor(); now = datetime.now().isoformat()
    closed = p.get('closed_at','')
    if p.get('status') == 'Cerrada' and not closed: closed = now
    auditors_list = p.get('auditors', [])
    auditors_val = json.dumps(auditors_list)
    responsible_val = p.get('responsible','')
    if not responsible_val and auditors_list:
        responsible_val = auditors_list[0]
        
    areas_list = p.get('responsible_area', [])
    if isinstance(areas_list, str): areas_list = [areas_list] if areas_list else []
    areas_val = json.dumps(areas_list)
    
    c.execute('UPDATE audits SET name=?, description=?, status=?, start_date=?, end_date=?, responsible=?, plan_id=?, updated_at=?, closed_at=?, auditors=?, responsible_area=?, audit_type=? WHERE id=?',
              (p['name'], p.get('description',''), p.get('status','Planificación'), p.get('start_date',''), p.get('end_date',''), responsible_val, p.get('plan_id'), now, closed, auditors_val, areas_val, p.get('audit_type'), aid))
              
    c.execute('DELETE FROM audit_areas WHERE audit_id=?', (aid,))
    for area_name in areas_list:
        c.execute('SELECT id FROM areas WHERE name=?', (area_name,))
        area_res = c.fetchone()
        if area_res:
            c.execute('INSERT INTO audit_areas (audit_id, area_id) VALUES (?,?)', (aid, area_res['id']))
            
    log_activity(c, 'ACTUALIZAR', 'Auditoría', aid, f"Se actualizó la información general")
    conn.commit(); conn.close(); return jsonify({"status":"success"})

@app.route('/api/audits/<aid>', methods=['DELETE'])
@require_role('admin', 'auditor')
def delete_audit(aid):
    conn = get_db(); c = conn.cursor(); now = datetime.now().isoformat()
    c.execute('UPDATE audits SET deleted_at=? WHERE id=?', (now, aid))
    c.execute('UPDATE audit_tasks SET deleted_at=? WHERE audit_id=? AND deleted_at IS NULL', (now, aid))
    log_activity(c, 'ELIMINAR', 'Auditoría', aid, "Se movió a la papelera")
    conn.commit(); conn.close(); return jsonify({"status":"success"})

@app.route('/api/audits/<aid>/apply-template/<tid>', methods=['POST'])
def apply_template(aid, tid):
    conn = get_db(); c = conn.cursor(); now = datetime.now().isoformat()
    # Fetch audit responsible and auditors list
    c.execute('SELECT responsible, auditors FROM audits WHERE id=?', (aid,))
    audit = c.fetchone()
    audit_dict = dict(audit) if audit else {}
    audit_resp = audit_dict.get('responsible', '')
    auditors_list = []
    if audit_dict:
        try:
            val = audit_dict.get('auditors')
            auditors_list = json.loads(val) if val else []
        except:
            pass
    if not auditors_list and audit_resp:
        auditors_list = [audit_resp]
    
    assigned_resp = " / ".join(auditors_list) if auditors_list else ''
    
    try:
        # Flatten template tasks directly to the audit, preserving order by stage and then by task
        c.execute('''
            SELECT s.name as stage_name, t.name, t.description, t.weight 
            FROM template_tasks t 
            JOIN template_stages s ON t.stage_id = s.id
            WHERE s.template_id=? 
            ORDER BY s.order_num ASC, t.order_num ASC
        ''', (tid,))
        tasks = c.fetchall()
        for j, tk in enumerate(tasks):
            # We map stage_name to category
            c.execute('INSERT INTO audit_tasks (id,audit_id,name,description,category,responsible,status,priority,order_num,created_at,updated_at,weight) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',
                      (gen_id(), aid, tk['name'], tk['description'], tk['stage_name'], assigned_resp, 'Pendiente', 'Media', j, now, now, tk['weight']))
        c.execute('UPDATE audits SET template_id=?, updated_at=? WHERE id=?', (tid, now, aid))
        log_activity(c, 'APLICAR PLANTILLA', 'Auditoría', aid, f"Plantilla ID: {tid} aplicada con {len(tasks)} tareas")
        conn.commit(); conn.close(); return jsonify({"status":"success", "tasks_applied": len(tasks)})
    except Exception as e:
        conn.close(); return jsonify({"error": str(e)}), 500

@app.route('/api/audits/<aid>/restore-template', methods=['POST'])
def restore_template(aid):
    conn = get_db(); c = conn.cursor()
    c.execute('SELECT template_id, responsible, auditors FROM audits WHERE id=?', (aid,))
    audit = c.fetchone()
    if not audit or not audit['template_id']:
        conn.close(); return jsonify({"error":"La auditoría no tiene plantilla asociada"}), 400
        
    audit_dict = dict(audit)
    audit_resp = audit_dict.get('responsible', '')
    auditors_list = []
    try:
        val = audit_dict.get('auditors')
        auditors_list = json.loads(val) if val else []
    except:
        pass
    if not auditors_list and audit_resp:
        auditors_list = [audit_resp]
    assigned_resp = auditors_list[0] if auditors_list else ''
    
    try:
        c.execute('''
            SELECT s.name as stage_name, t.name, t.description, t.weight, t.order_num
            FROM template_tasks t 
            JOIN template_stages s ON t.stage_id = s.id
            WHERE s.template_id=? 
            ORDER BY s.order_num ASC, t.order_num ASC
        ''', (audit['template_id'],))
        template_tasks = c.fetchall()
        
        c.execute('SELECT name FROM audit_tasks WHERE audit_id=? AND deleted_at IS NULL', (aid,))
        existing_tasks = {row['name'] for row in c.fetchall()}
        
        now = datetime.now().isoformat()
        restored = 0
        for tk in template_tasks:
            if tk['name'] not in existing_tasks:
                c.execute('INSERT INTO audit_tasks (id,audit_id,name,description,category,responsible,status,priority,order_num,created_at,updated_at,weight) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',
                          (gen_id(), aid, tk['name'], tk['description'], tk['stage_name'], assigned_resp, 'Pendiente', 'Media', tk['order_num'], now, now, tk['weight']))
                restored += 1
                
        log_activity(c, 'RESTAURAR PLANTILLA', 'Auditoría', aid, f"{restored} tareas restauradas")
        conn.commit(); conn.close(); return jsonify({"status":"success", "restored": restored})
    except Exception as e:
        conn.close(); return jsonify({"error": str(e)}), 500


# ─── TASKS ───────────────────────────────────────────────────────────────────

@app.route('/api/debug/counts', methods=['GET'])
def debug_counts():
    try:
        conn = get_db(); c = conn.cursor()
        counts = {}
        for table in ['audit_templates', 'template_tasks', 'audits', 'audit_tasks', 'users']:
            c.execute(f"SELECT COUNT(*) FROM {table}")
            counts[table] = c.fetchone()[0]
        conn.close()
        return jsonify(counts)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/tasks', methods=['GET'])
def get_tasks():
    conn = get_db(); c = conn.cursor()
    audit_id = request.args.get('audit_id')
    responsible = request.args.get('responsible')
    status = request.args.get('status')
    overdue_only = request.args.get('overdue')
    standalone = request.args.get('standalone')
    category = request.args.get('category')
    q = 'SELECT t.*, a.name as audit_name FROM audit_tasks t LEFT JOIN audits a ON t.audit_id=a.id WHERE t.deleted_at IS NULL AND (t.audit_id IS NULL OR a.deleted_at IS NULL)'
    params = []
    
    q = append_auth_filter(q, params, table_alias='a')
    
    if audit_id: q += ' AND t.audit_id=?'; params.append(audit_id)
    if responsible: q += ' AND t.responsible=?'; params.append(responsible)
    if status: q += ' AND t.status=?'; params.append(status)
    if category:
        if category == '__empty__': q += ' AND (t.category IS NULL OR t.category="")'
        else: q += ' AND (t.category=? OR a.name=?)'; params.extend([category, category])
    if overdue_only == '1': q += " AND t.status!='Completada' AND t.due_date<? AND t.due_date!=''"; params.append(today_str())
    if standalone == '1': q += ' AND t.audit_id IS NULL'
    q += ' ORDER BY t.due_date ASC, CAST(t.order_num AS INTEGER), t.created_at ASC'
    c.execute(q, params); r = [dict(x) for x in c.fetchall()]; conn.close(); return jsonify(r)

@app.route('/api/tasks', methods=['POST'])
def create_task():
    p = request.json; conn = get_db(); c = conn.cursor(); tid = gen_id(); now = datetime.now().isoformat()
    resp = p.get('responsible','')
    if not resp and p.get('audit_id'):
        c.execute('SELECT responsible FROM audits WHERE id=?', (p['audit_id'],))
        audit = c.fetchone()
        if audit: resp = audit['responsible']
        
    c.execute('SELECT COALESCE(MAX(order_num),0)+1 FROM audit_tasks WHERE audit_id=?', (p.get('audit_id'),))
    order = p.get('order_num', c.fetchone()[0])
    c.execute('INSERT INTO audit_tasks (id,audit_id,name,description,responsible,status,priority,category,due_date,order_num,created_at,updated_at,weight) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)',
              (tid, p.get('audit_id'), p['name'], p.get('description',''), resp, p.get('status','Pendiente'), p.get('priority','Media'), p.get('category',''), p.get('due_date',''), order, now, now, float(p.get('weight', 0.0))))
    log_activity(c, 'CREAR', 'Tarea', tid, f"Nombre: {p['name']}")
    conn.commit(); conn.close(); return jsonify({"status":"success","id":tid})

@app.route('/api/tasks/<tid>', methods=['GET'])
def get_task(tid):
    conn = get_db(); c = conn.cursor()
    c.execute('SELECT t.*, a.name as audit_name FROM audit_tasks t LEFT JOIN audits a ON t.audit_id=a.id WHERE t.id=? AND t.deleted_at IS NULL', (tid,))
    t = c.fetchone(); conn.close()
    if not t: return jsonify({"error":"No encontrada"}), 404
    return jsonify(dict(t))

@app.route('/api/tasks/<tid>', methods=['PUT'])
def update_task(tid):
    p = request.json; conn = get_db(); c = conn.cursor(); now = datetime.now().isoformat()
    completed = p.get('completed_date','')
    if p.get('status') == 'Completada' and not completed: completed = today_str()
    elif p.get('status') != 'Completada': completed = ''
    if 'order_num' in p:
        order_num = p['order_num']
    else:
        c.execute('SELECT order_num FROM audit_tasks WHERE id=?', (tid,))
        row = c.fetchone()
        order_num = row['order_num'] if row else 0

    c.execute('UPDATE audit_tasks SET name=?, description=?, responsible=?, status=?, priority=?, category=?, start_date=?, due_date=?, completed_date=?, order_num=?, updated_at=?, weight=? WHERE id=?',
              (p['name'], p.get('description',''), p.get('responsible',''), p.get('status','Pendiente'),
               p.get('priority','Media'), p.get('category',''), p.get('start_date',''), p.get('due_date',''), completed, order_num, now, float(p.get('weight', 0.0)), tid))
    log_activity(c, 'ACTUALIZAR', 'Tarea', tid, "Datos generales actualizados")
    conn.commit(); conn.close(); return jsonify({"status":"success"})

@app.route('/api/tasks/<tid>', methods=['DELETE'])
@require_role('admin', 'auditor')
def delete_task(tid):
    conn = get_db(); c = conn.cursor(); now = datetime.now().isoformat()
    c.execute('UPDATE audit_tasks SET deleted_at=? WHERE id=?', (now, tid))
    log_activity(c, 'ELIMINAR', 'Tarea', tid, "Movida a papelera")
    conn.commit(); conn.close(); return jsonify({"status":"success"})

# Inline field update
@app.route('/api/tasks/<tid>/field', methods=['PATCH'])
def update_task_field(tid):
    p = request.json; conn = get_db(); c = conn.cursor(); now = datetime.now().isoformat()
    field = p.get('field'); value = p.get('value')
    allowed = ['name','responsible','status','priority','start_date','due_date','stage_id','category','description','weight']
    if field not in allowed: conn.close(); return jsonify({"error":"Campo no permitido"}), 400
    c.execute(f'UPDATE audit_tasks SET {field}=?, updated_at=? WHERE id=?', (float(value) if field == 'weight' else value, now, tid))
    if field == 'status' and value == 'Completada':
        c.execute('UPDATE audit_tasks SET completed_date=? WHERE id=?', (today_str(), tid))
    elif field == 'status' and value != 'Completada':
        c.execute('UPDATE audit_tasks SET completed_date="" WHERE id=?', (tid,))
    log_activity(c, 'ACTUALIZAR', 'Tarea', tid, f"Campo {field} actualizado a {value}")
    conn.commit(); conn.close(); return jsonify({"status":"success"})

# Move / reorder task
@app.route('/api/tasks/<tid>/move', methods=['PATCH'])
def move_task(tid):
    p = request.json; conn = get_db(); c = conn.cursor(); now = datetime.now().isoformat()
    new_stage = p.get('stage_id')  # can be None
    new_order = p.get('order_num', 0)
    c.execute('UPDATE audit_tasks SET stage_id=?, order_num=?, updated_at=? WHERE id=?', (new_stage, new_order, now, tid))
    log_activity(c, 'REORDENAR', 'Tarea', tid, f"Nuevo orden: {new_order}")
    # Reorder siblings
    if new_stage:
        c.execute('SELECT id FROM audit_tasks WHERE stage_id=? AND id!=? ORDER BY order_num', (new_stage, tid))
    else:
        c.execute('SELECT id FROM audit_tasks WHERE audit_id=(SELECT audit_id FROM audit_tasks WHERE id=?) AND stage_id IS NULL AND id!=? ORDER BY order_num', (tid, tid))
    siblings = [r['id'] for r in c.fetchall()]
    siblings.insert(min(new_order, len(siblings)), tid)
    for i, sid in enumerate(siblings):
        c.execute('UPDATE audit_tasks SET order_num=? WHERE id=?', (i, sid))
    conn.commit(); conn.close(); return jsonify({"status":"success"})

# Quick status toggle
@app.route('/api/tasks/<tid>/status', methods=['PUT'])
def update_task_status(tid):
    p = request.json; conn = get_db(); c = conn.cursor(); now = datetime.now().isoformat()
    completed = today_str() if p['status']=='Completada' else ''
    c.execute('UPDATE audit_tasks SET status=?, completed_date=?, updated_at=? WHERE id=?', (p['status'], completed, now, tid))
    conn.commit(); conn.close(); return jsonify({"status":"success"})

# Daily view
@app.route('/api/tasks/daily', methods=['GET'])
def daily_tasks():
    conn = get_db(); c = conn.cursor()
    days = int(request.args.get('days', 7))
    responsible = request.args.get('responsible')
    audit_id = request.args.get('audit_id')
    start = today_str()
    end = (date.today() + timedelta(days=days)).isoformat()
    q = """SELECT t.*, a.name as audit_name
           FROM audit_tasks t LEFT JOIN audits a ON t.audit_id=a.id
           WHERE t.deleted_at IS NULL AND (t.audit_id IS NULL OR a.deleted_at IS NULL) AND 
           ((t.due_date >= ? AND t.due_date <= ?) OR (t.due_date < ? AND t.due_date != '' AND t.status != 'Completada'))"""
    params = [start, end, start]
    q = append_auth_filter(q, params, table_alias='a')
    if responsible: q += ' AND t.responsible=?'; params.append(responsible)
    if audit_id:
        if audit_id == 'standalone': q += ' AND t.audit_id IS NULL'
        else: q += ' AND t.audit_id=?'; params.append(audit_id)
    q += ' ORDER BY a.id, t.order_num'
    c.execute(q, params); r = [dict(x) for x in c.fetchall()]; conn.close(); return jsonify(r)

# ─── DEVIATIONS ──────────────────────────────────────────────────────────────

@app.route('/api/deviations', methods=['GET'])
def get_deviations():
    conn = get_db(); c = conn.cursor(); audit_id = request.args.get('audit_id')
    q = 'SELECT d.*, a.name as audit_name FROM deviations d LEFT JOIN audits a ON d.audit_id=a.id WHERE 1=1'; params = []
    q = append_auth_filter(q, params, table_alias='a')
    if audit_id: q += ' AND d.audit_id=?'; params.append(audit_id)
    q += ' ORDER BY d.created_at DESC'; c.execute(q, params); r = [dict(x) for x in c.fetchall()]; conn.close(); return jsonify(r)

@app.route('/api/deviations', methods=['POST'])
def create_deviation():
    p = request.json; conn = get_db(); c = conn.cursor(); did = gen_id(); now = datetime.now().isoformat()
    c.execute('INSERT INTO deviations (id,audit_id,task_id,title,description,severity,status,responsible,detected_date,action_plan,comments,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)',
              (did, p['audit_id'], p.get('task_id'), p['title'], p.get('description',''),
               p.get('severity','Media'), 'Abierta', p.get('responsible',''), p.get('detected_date', today_str()), p.get('action_plan',''), p.get('comments',''), now, now))
    conn.commit(); conn.close(); return jsonify({"status":"success","id":did})

@app.route('/api/deviations/<did>', methods=['PUT'])
def update_deviation(did):
    p = request.json; conn = get_db(); c = conn.cursor(); now = datetime.now().isoformat()
    resolution = p.get('resolution_date','')
    if p.get('status') == 'Cerrada' and not resolution: resolution = today_str()
    c.execute('UPDATE deviations SET title=?, description=?, severity=?, status=?, responsible=?, detected_date=?, resolution_date=?, action_plan=?, comments=?, updated_at=? WHERE id=?',
              (p['title'], p.get('description',''), p.get('severity','Media'), p.get('status','Abierta'), p.get('responsible',''), p.get('detected_date',''), resolution, p.get('action_plan',''), p.get('comments',''), now, did))
    conn.commit(); conn.close(); return jsonify({"status":"success"})

@app.route('/api/deviations/<did>', methods=['DELETE'])
@require_role('admin', 'auditor')
def delete_deviation(did):
    conn = get_db(); c = conn.cursor(); c.execute('DELETE FROM deviations WHERE id=?', (did,))
    conn.commit(); conn.close(); return jsonify({"status":"success"})

# ─── DASHBOARD ───────────────────────────────────────────────────────────────

@app.route('/api/dashboard/summary', methods=['GET'])
def dashboard_summary():
    conn = get_db(); c = conn.cursor(); responsible = request.args.get('responsible'); today = today_str()
    base = 'FROM audit_tasks t WHERE t.deleted_at IS NULL AND (t.audit_id IS NULL OR t.audit_id NOT IN (SELECT id FROM audits WHERE deleted_at IS NOT NULL))'
    params = []
    base = append_auth_filter(base, params, table_alias='t', audit_id_column='audit_id')
    
    if responsible: base += ' AND t.responsible LIKE ?'; params.append(f'%{responsible}%')
    w = " AND"
    c.execute(f'SELECT COUNT(*) {base}', params); total = c.fetchone()[0]
    c.execute(f'SELECT COUNT(*) {base}{w} t.status="Completada"', params); completed = c.fetchone()[0]
    c.execute(f'SELECT COUNT(*) {base}{w} t.status="En Progreso"', params); in_progress = c.fetchone()[0]
    c.execute(f'SELECT COUNT(*) {base}{w} t.status="Pendiente"', params); pending = c.fetchone()[0]
    c.execute(f'SELECT COUNT(*) {base}{w} t.status!="Completada" AND t.due_date<? AND t.due_date!=""', params + [today]); overdue = c.fetchone()[0]
    db = 'FROM deviations d WHERE 1=1'; dp = []
    db = append_auth_filter(db, dp, table_alias='d', audit_id_column='audit_id')
    if responsible: db += ' AND d.responsible LIKE ?'; dp.append(f'%{responsible}%')
    dw = " AND"
    c.execute(f'SELECT COUNT(*) {db}', dp); dev_total = c.fetchone()[0]
    c.execute(f'SELECT COUNT(*) {db}{dw} d.status="Abierta"', dp); dev_open = c.fetchone()[0]
    
    compliance = 0
    if total > 0:
        if responsible:
            compliance = round((completed / total * 100), 1)
        else:
            # Aggregate compliance across all audits using average of their compliance
            # Fetch all audits and calculate their compliance
            c.execute('SELECT id FROM audits WHERE deleted_at IS NULL')
            all_audits = c.fetchall()
            if all_audits:
                sum_comp = 0
                count_audits = 0
                for audit in all_audits:
                    c.execute('SELECT COUNT(*) as t, SUM(CASE WHEN status="Completada" THEN 1 ELSE 0 END) as comp, SUM(weight) as total_w, SUM(CASE WHEN status="Completada" THEN weight ELSE 0 END) as done_w FROM audit_tasks WHERE audit_id=? AND deleted_at IS NULL', (audit['id'],))
                    res = c.fetchone()
                    if res['t'] > 0:
                        count_audits += 1
                        if (res['total_w'] or 0) > 0.1:
                            sum_comp += res['done_w'] or 0
                        else:
                            sum_comp += (res['comp'] / res['t'] * 100)
                compliance = round(sum_comp / count_audits, 1) if count_audits > 0 else 0
            else:
                compliance = round((completed / total * 100), 1)
    
    conn.close()
    return jsonify({"total":total,"completed":completed,"in_progress":in_progress,"pending":pending,"overdue":overdue,"compliance":compliance,"dev_total":dev_total,"dev_open":dev_open})

@app.route('/api/dashboard/by-responsible', methods=['GET'])
def dashboard_by_responsible():
    conn = get_db(); c = conn.cursor(); responsible = request.args.get('responsible'); today = today_str()
    w = 'WHERE t.responsible != "" AND t.deleted_at IS NULL AND (t.audit_id IS NULL OR t.audit_id NOT IN (SELECT id FROM audits WHERE deleted_at IS NOT NULL))'
    params = []
    w = append_auth_filter(w, params, table_alias='t', audit_id_column='audit_id')
    
    if responsible: w += ' AND t.responsible LIKE ?'; params.append(f'%{responsible}%')
    c.execute(f'''SELECT t.responsible, COUNT(*) as total,
        SUM(CASE WHEN t.status='Completada' THEN 1 ELSE 0 END) as completed,
        SUM(CASE WHEN t.status='En Progreso' THEN 1 ELSE 0 END) as in_progress,
        SUM(CASE WHEN t.status='Pendiente' THEN 1 ELSE 0 END) as pending,
        SUM(CASE WHEN t.status!='Completada' AND t.due_date<? AND t.due_date!='' THEN 1 ELSE 0 END) as overdue
        FROM audit_tasks t {w} GROUP BY t.responsible ORDER BY t.responsible''', [today] + params)
    r = [dict(x) for x in c.fetchall()]; conn.close(); return jsonify(r)

@app.route('/api/dashboard/by-category', methods=['GET'])
def dashboard_by_category():
    conn = get_db(); c = conn.cursor(); responsible = request.args.get('responsible'); today = today_str()
    w = 'WHERE t.deleted_at IS NULL AND (t.audit_id IS NULL OR a.deleted_at IS NULL) AND t.status != "Completada"'
    params = []
    w = append_auth_filter(w, params, table_alias='a')
    if responsible: w += ' AND t.responsible LIKE ?'; params.append(f'%{responsible}%')
    c.execute(f'''SELECT COALESCE(a.name, NULLIF(t.category, ''), 'Libres (Sin Categoría)') as category, COUNT(*) as total,
        SUM(CASE WHEN t.status='En Progreso' THEN 1 ELSE 0 END) as in_progress,
        SUM(CASE WHEN t.status='Pendiente' THEN 1 ELSE 0 END) as pending,
        SUM(CASE WHEN t.status!='Completada' AND t.due_date<? AND t.due_date!='' THEN 1 ELSE 0 END) as overdue
        FROM audit_tasks t LEFT JOIN audits a ON t.audit_id = a.id {w} GROUP BY COALESCE(a.name, NULLIF(t.category, ''), 'Libres (Sin Categoría)') ORDER BY total DESC''', [today] + params)
    r = [dict(x) for x in c.fetchall()]; conn.close(); return jsonify(r)

@app.route('/api/dashboard/overdue-deviation', methods=['GET'])
def dashboard_overdue_deviation():
    conn = get_db(); c = conn.cursor(); responsible = request.args.get('responsible')
    today = datetime.now().date()
    today_s = today_str()
    w = 'WHERE t.deleted_at IS NULL AND t.status != "Completada" AND t.due_date < ? AND t.due_date != "" AND (t.audit_id IS NULL OR t.audit_id NOT IN (SELECT id FROM audits WHERE deleted_at IS NOT NULL))'
    params = [today_s]
    w = append_auth_filter(w, params, table_alias='t', audit_id_column='audit_id')
    if responsible: w += ' AND t.responsible LIKE ?'; params.append(f'%{responsible}%')
    
    c.execute(f'SELECT t.due_date, COUNT(*) as count FROM audit_tasks t {w} GROUP BY t.due_date', params)
    rows = c.fetchall()
    
    ranges = {"1 a 7 días": 0, "8 a 15 días": 0, "16 a 30 días": 0, "Más de 30 días": 0}
    for r in rows:
        try:
            due = datetime.strptime(r['due_date'], '%Y-%m-%d').date()
            diff = (today - due).days
            if diff <= 7: ranges["1 a 7 días"] += r['count']
            elif diff <= 15: ranges["8 a 15 días"] += r['count']
            elif diff <= 30: ranges["16 a 30 días"] += r['count']
            else: ranges["Más de 30 días"] += r['count']
        except:
            pass
            
    conn.close()
    return jsonify([
        {"category": "1 a 7 días", "count": ranges["1 a 7 días"]},
        {"category": "8 a 15 días", "count": ranges["8 a 15 días"]},
        {"category": "16 a 30 días", "count": ranges["16 a 30 días"]},
        {"category": "Más de 30 días", "count": ranges["Más de 30 días"]}
    ])

@app.route('/api/dashboard/by-status', methods=['GET'])
def dashboard_by_status():
    conn = get_db(); c = conn.cursor(); responsible = request.args.get('responsible')
    w = 'WHERE t.deleted_at IS NULL AND (t.audit_id IS NULL OR t.audit_id NOT IN (SELECT id FROM audits WHERE deleted_at IS NOT NULL))'
    params = []
    w = append_auth_filter(w, params, table_alias='t', audit_id_column='audit_id')
    if responsible: w += ' AND t.responsible LIKE ?'; params.append(f'%{responsible}%')
    c.execute(f'SELECT t.status, COUNT(*) as count FROM audit_tasks t {w} GROUP BY t.status', params)
    r = [dict(x) for x in c.fetchall()]; conn.close(); return jsonify(r)

@app.route('/api/debug/audit-tasks', methods=['GET'])
def debug_audit_tasks():
    conn = get_db(); c = conn.cursor()
    c.execute("SELECT id, name FROM audits WHERE name LIKE '%Pagos de Servicios%'")
    r = [dict(x) for x in c.fetchall()]; conn.close(); return jsonify(r)

# ─── RECYCLE BIN & LOGS ─────────────────────────────────────────────────────────

def auto_clean_recycle_bin(c):
    thirty_days_ago = (datetime.now() - timedelta(days=30)).isoformat()
    c.execute('DELETE FROM audits WHERE deleted_at IS NOT NULL AND deleted_at < ?', (thirty_days_ago,))
    c.execute('DELETE FROM audit_tasks WHERE deleted_at IS NOT NULL AND deleted_at < ?', (thirty_days_ago,))

@app.route('/api/recycle-bin', methods=['GET'])
def get_recycle_bin():
    conn = get_db(); c = conn.cursor()
    auto_clean_recycle_bin(c)
    
    c.execute('SELECT id, name, deleted_at, "Auditoría" as type, "" as parent_name FROM audits WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC')
    audits = [dict(r) for r in c.fetchall()]
    
    c.execute('''
        SELECT t.id, t.name, t.deleted_at, "Tarea" as type, a.name as parent_name 
        FROM audit_tasks t 
        LEFT JOIN audits a ON t.audit_id = a.id 
        WHERE t.deleted_at IS NOT NULL 
        ORDER BY t.deleted_at DESC
    ''')
    tasks = [dict(r) for r in c.fetchall()]
    
    conn.commit(); conn.close()
    return jsonify({"audits": audits, "tasks": tasks})

@app.route('/api/recycle-bin/restore', methods=['POST'])
def restore_recycled_item():
    p = request.json; conn = get_db(); c = conn.cursor()
    ent_type = p.get('type'); eid = p.get('id')
    table = 'audits' if ent_type == 'Auditoría' else 'audit_tasks'
    now = datetime.now().isoformat()
    c.execute(f'UPDATE {table} SET deleted_at=NULL, updated_at=? WHERE id=?', (now, eid))
    if ent_type == 'Auditoría':
        c.execute('UPDATE audit_tasks SET deleted_at=NULL, updated_at=? WHERE audit_id=?', (now, eid))
    log_activity(c, 'RESTAURAR', ent_type, eid, "Restaurado de papelera")
    conn.commit(); conn.close(); return jsonify({"status":"success"})

@app.route('/api/recycle-bin/permanent', methods=['DELETE'])
@require_role('admin')
def permanent_delete_recycled_item():
    p = request.json; conn = get_db(); c = conn.cursor()
    ent_type = p.get('type'); eid = p.get('id')
    table = 'audits' if ent_type == 'Auditoría' else 'audit_tasks'
    c.execute(f'DELETE FROM {table} WHERE id=?', (eid,))
    if ent_type == 'Auditoría':
        c.execute('DELETE FROM audit_tasks WHERE audit_id=?', (eid,))
    log_activity(c, 'ELIMINAR PERMANENTE', ent_type, eid, "Eliminado permanentemente")
    conn.commit(); conn.close(); return jsonify({"status":"success"})

@app.route('/api/logs', methods=['GET'])
def get_activity_logs():
    conn = get_db(); c = conn.cursor()
    c.execute('SELECT * FROM activity_logs ORDER BY timestamp DESC LIMIT 500')
    logs = [dict(r) for r in c.fetchall()]
    conn.close(); return jsonify(logs)

# ─── Main ────────────────────────────────────────────────────────────────────

if __name__ == '__main__':
    init_db()
    print("═══════════════════════════════════════════════════")
    print("  Workflow de Tareas v2 — Servidor iniciado")
    print(f"  http://localhost:5001")
    print(f"  Base de datos: {os.path.abspath(DB_FILE)}")
    print("═══════════════════════════════════════════════════")
    app.run(host='0.0.0.0', port=5001, debug=True)
