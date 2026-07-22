from flask import Flask, request, jsonify, send_from_directory, session, abort
from flask_cors import CORS
import sqlite3
import os
import json
import uuid
from datetime import datetime, date, timedelta
from werkzeug.security import generate_password_hash, check_password_hash
from werkzeug.utils import secure_filename
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
UPLOAD_FOLDER = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'uploads', 'audits')
os.makedirs(UPLOAD_FOLDER, exist_ok=True)
app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER
app.config['MAX_CONTENT_LENGTH'] = 50 * 1024 * 1024 # 50MB max-limit

def get_db():
    conn = sqlite3.connect(DB_FILE, timeout=30.0)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA journal_mode = WAL")
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

def log_activity(c, action, entity_type, entity_id, details=""):
    try:
        user = get_user_from_request()
        now = datetime.now().isoformat()
        c.execute('''
            INSERT INTO activity_logs (id, user, action, entity_type, entity_id, details, timestamp)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        ''', (gen_id(), user, action, entity_type, entity_id, details, now))
    except Exception as e:
        print("Error en log_activity:", e)

@app.after_request
def auto_log_activity(response):
    try:
        if request.method in ['POST', 'PUT', 'DELETE', 'PATCH'] and response.status_code < 400:
            path = request.path
            if path.startswith('/api/') and 'login' not in path and 'logout' not in path and 'recycle-bin' not in path:
                action_map = {'POST': 'CREAR', 'PUT': 'MODIFICAR', 'PATCH': 'MODIFICAR', 'DELETE': 'ELIMINAR'}
                action = action_map.get(request.method, request.method)
                
                parts = [p for p in path.strip('/').split('/') if p]
                entity_type = parts[1].upper() if len(parts) >= 2 else 'SISTEMA'
                
                # Try to guess entity_id
                entity_id = 'N/A'
                if len(parts) > 2 and parts[-1] != parts[1]:
                    entity_id = parts[-1]
                
                # Add context details if json is present
                details = f"Endpoint: {path}"
                if request.is_json and request.json:
                    name = request.json.get('name') or request.json.get('title')
                    if name:
                        details += f" | Nombre: {name}"
                        
                conn = get_db()
                c = conn.cursor()
                log_activity(c, action, entity_type, entity_id, details)
                conn.commit()
                conn.close()
    except Exception as e:
        print("Auto log activity error:", e)
    return response

def append_auth_filter(q, params, table_alias='', audit_id_column='id', task_alias=None):
    role = session.get('role', 'auditor')
    if role in ('admin', 'gerente'):
        return q
    
    prefix = f"{table_alias}." if table_alias else ""
    if role in ('jefe', 'auditor'):
        linked = session.get('linked_auditors', [])
        if role == 'auditor' and not linked and session.get('full_name'):
            linked = [session.get('full_name')]
            
        if linked:
            placeholders = ','.join(['?']*len(linked))
            cond = f"{prefix}{audit_id_column} IN (SELECT audit_id FROM audit_tasks WHERE responsible IN ({placeholders}) AND deleted_at IS NULL AND audit_id IS NOT NULL)"
            params.extend(linked)
            if task_alias:
                cond = f"({cond} OR {task_alias}.responsible IN ({placeholders}))"
                params.extend(linked)
            q += f" AND {cond}"
        else:
            q += " AND 1=0"
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
        role TEXT DEFAULT 'auditor', status TEXT DEFAULT 'active', failed_attempts INTEGER DEFAULT 0,
        linked_auditors TEXT DEFAULT '[]'
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
    c.execute('''CREATE TABLE IF NOT EXISTS audit_attachments (
        id TEXT PRIMARY KEY, audit_id TEXT NOT NULL, filename TEXT NOT NULL,
        filepath TEXT NOT NULL, size INTEGER, uploaded_by TEXT, uploaded_at TEXT,
        FOREIGN KEY (audit_id) REFERENCES audits(id) ON DELETE CASCADE
    )''')
    c.execute('''CREATE TABLE IF NOT EXISTS activity_logs (
        id TEXT PRIMARY KEY, user TEXT NOT NULL, action TEXT NOT NULL,
        entity_type TEXT NOT NULL, entity_id TEXT NOT NULL,
        details TEXT, timestamp TEXT NOT NULL
    )''')

    # Survey Module Tables
    c.execute('''CREATE TABLE IF NOT EXISTS survey_templates (
        id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT, created_at TEXT, updated_at TEXT
    )''')
    c.execute('''CREATE TABLE IF NOT EXISTS survey_questions (
        id TEXT PRIMARY KEY, template_id TEXT NOT NULL, question_text TEXT NOT NULL, 
        question_type TEXT DEFAULT 'scale', weight REAL DEFAULT 1.0, 
        require_comment_if_below REAL DEFAULT 2.0, order_num INTEGER DEFAULT 0,
        FOREIGN KEY (template_id) REFERENCES survey_templates(id) ON DELETE CASCADE
    )''')
    c.execute('''CREATE TABLE IF NOT EXISTS audit_stakeholders (
        id TEXT PRIMARY KEY, audit_id TEXT NOT NULL, name TEXT NOT NULL, 
        email TEXT NOT NULL, role_title TEXT DEFAULT 'Auditado', created_at TEXT,
        FOREIGN KEY (audit_id) REFERENCES audits(id) ON DELETE CASCADE
    )''')
    c.execute('''CREATE TABLE IF NOT EXISTS master_stakeholders (
        id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL, 
        role_title TEXT NOT NULL, created_at TEXT
    )''')
    c.execute('''CREATE TABLE IF NOT EXISTS survey_dispatches (
        id TEXT PRIMARY KEY, audit_id TEXT NOT NULL, template_id TEXT NOT NULL, 
        stakeholder_id TEXT NOT NULL, token TEXT UNIQUE NOT NULL, 
        status TEXT DEFAULT 'Enviada', sent_at TEXT, responded_at TEXT,
        FOREIGN KEY (audit_id) REFERENCES audits(id) ON DELETE CASCADE,
        FOREIGN KEY (template_id) REFERENCES survey_templates(id) ON DELETE CASCADE,
        FOREIGN KEY (stakeholder_id) REFERENCES audit_stakeholders(id) ON DELETE CASCADE
    )''')
    c.execute('''CREATE TABLE IF NOT EXISTS survey_responses (
        id TEXT PRIMARY KEY, dispatch_id TEXT NOT NULL, question_id TEXT NOT NULL, 
        score REAL, comment TEXT, responded_at TEXT,
        FOREIGN KEY (dispatch_id) REFERENCES survey_dispatches(id) ON DELETE CASCADE,
        FOREIGN KEY (question_id) REFERENCES survey_questions(id) ON DELETE CASCADE
    )''')
    c.execute('''CREATE TABLE IF NOT EXISTS global_settings (
        key TEXT PRIMARY KEY, value TEXT
    )''')
    
    # Initialize default settings if empty
    defaults = {
        'smtp_host': 'smtp.office365.com',
        'smtp_port': '587',
        'smtp_user': '',
        'smtp_pass': '',
        'survey_email_subject': 'Encuesta de Satisfacción Post-Auditoría - {{audit_name}}',
        'survey_email_body': 'Estimado(a) {{evaluator_name}},\n\nPor favor, responde la siguiente encuesta de satisfacción:\n{{link}}\n\nSaludos.'
    }
    for k, v in defaults.items():
        c.execute("INSERT OR IGNORE INTO global_settings (key, value) VALUES (?, ?)", (k, v))
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
    try: c.execute("ALTER TABLE users ADD COLUMN linked_auditors TEXT DEFAULT '[]'")
    except: pass
    for col, dflt in [('is_required','1'), ('created_at',"NULL")]:
        try: c.execute(f"ALTER TABLE survey_questions ADD COLUMN {col} INTEGER DEFAULT {dflt}")
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

    # Survey Templates seed
    c.execute('SELECT COUNT(*) FROM survey_templates')
    if c.fetchone()[0] == 0:
        stid = gen_id()
        now = datetime.now().isoformat()
        c.execute('INSERT INTO survey_templates (id, name, description, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
                  (stid, 'Cuestionario Post-Auditoría', 'Plantilla base institucional de encuestas', now, now))
        
        survey_data = [
            ("¿Considera que la reunión de 'Kick Off' o 'Mail de Inicio de la Auditoría' fue clara respecto de los objetivos de la auditoría?", 'scale', 3.0, 2.0),
            ("La auditoría se desarrolló de manera objetiva y profesional.", 'scale', 3.0, 2.0),
            ("En el transcurso de la auditoría, ¿se mantuvo una comunicación permanente?", 'scale', 3.0, 2.0),
            ("¿Se consideraron plazos suficientes para la entrega de información?", 'scale', 2.0, 2.0),
            ("¿La comunicación de los resultados de la auditoría tuvo instancias para la revisión de ellos en forma oportuna?", 'scale', 1.0, 2.0),
            ("El área tuvo el tiempo acordado para la entrega de respuestas.", 'scale', 3.0, 2.0),
            ("¿La auditoría interna realizada en su proceso / área, aportó oportunidades de mejora para su gestión y operación?", 'scale', 2.0, 2.0),
            ("¿Considera que existen aspectos positivos destacables?", 'text', 0.0, 0.0),
            ("¿Considera que existen aspectos mejorables acerca de la auditoría interna?", 'text', 0.0, 0.0)
        ]
        
        for idx, (qtext, qtype, qweight, qreq) in enumerate(survey_data):
            c.execute('INSERT INTO survey_questions (id, template_id, question_text, question_type, weight, require_comment_if_below, order_num) VALUES (?, ?, ?, ?, ?, ?, ?)',
                      (gen_id(), stid, qtext, qtype, qweight, qreq, idx))

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
    try:
        session['linked_auditors'] = json.loads(user['linked_auditors']) if user['linked_auditors'] else []
    except:
        session['linked_auditors'] = []
    session.permanent = True
    
    return jsonify({"status":"success","username":username,"role":user['role'],"full_name":user['full_name'],"linked_auditors":session['linked_auditors']})

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
        "full_name": session.get('full_name'),
        "linked_auditors": session.get('linked_auditors', [])
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
        SELECT u.username, u.full_name, u.role, u.status, u.failed_attempts, u.linked_auditors, ua.area_id 
        FROM users u 
        LEFT JOIN user_areas ua ON u.username = ua.username
    ''')
    r = []
    for x in c.fetchall():
        d = dict(x)
        try: d['linked_auditors'] = json.loads(d.get('linked_auditors', '[]')) if d.get('linked_auditors') else []
        except: d['linked_auditors'] = []
        r.append(d)
    conn.close(); return jsonify(r)

@app.route('/api/users', methods=['POST'])
def create_user():
    p = request.json
    if not p.get('username') or not p.get('password'): return jsonify({"error":"Requeridos"}), 400
    conn = get_db(); c = conn.cursor()
    try:
        linked_auditors = json.dumps(p.get('linked_auditors', []))
        c.execute('INSERT INTO users (username,password,full_name,role,status,linked_auditors) VALUES (?,?,?,?,?,?)',
                  (p['username'], generate_password_hash(p['password']), p.get('full_name',''), p.get('role','auditor'), 'active', linked_auditors))
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
    if 'linked_auditors' in p: c.execute('UPDATE users SET linked_auditors=? WHERE username=?', (json.dumps(p['linked_auditors']), username))
    
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

# ─── MASTER STAKEHOLDERS ─────────────────────────────────────────────────────

@app.route('/api/master/stakeholders', methods=['GET'])
def get_master_stakeholders():
    conn = get_db(); c = conn.cursor()
    c.execute('SELECT * FROM master_stakeholders ORDER BY name')
    r = [dict(x) for x in c.fetchall()]; conn.close(); return jsonify(r)

@app.route('/api/master/stakeholders', methods=['POST'])
def create_master_stakeholder():
    p = request.json; conn = get_db(); c = conn.cursor(); sid = gen_id()
    c.execute('INSERT INTO master_stakeholders (id, name, email, role_title, created_at) VALUES (?, ?, ?, ?, ?)',
              (sid, p['name'], p['email'], p.get('role_title', 'Auditado'), datetime.now().isoformat()))
    conn.commit(); conn.close(); return jsonify({"status":"success", "id": sid})

@app.route('/api/master/stakeholders/<sid>', methods=['PUT'])
def update_master_stakeholder(sid):
    p = request.json; conn = get_db(); c = conn.cursor()
    c.execute('UPDATE master_stakeholders SET name=?, email=?, role_title=? WHERE id=?',
              (p['name'], p['email'], p.get('role_title', 'Auditado'), sid))
    conn.commit(); conn.close(); return jsonify({"status":"success"})

@app.route('/api/master/stakeholders/<sid>', methods=['DELETE'])
def delete_master_stakeholder(sid):
    conn = get_db(); c = conn.cursor()
    c.execute('DELETE FROM master_stakeholders WHERE id=?', (sid,))
    conn.commit(); conn.close(); return jsonify({"status":"success"})

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
                c.execute('SELECT id FROM audit_tasks WHERE audit_id=? AND name=? AND deleted_at IS NOT NULL ORDER BY weight DESC, deleted_at ASC LIMIT 1', (aid, tk['name']))
                deleted = c.fetchone()
                if deleted:
                    c.execute('UPDATE audit_tasks SET deleted_at=NULL, updated_at=?, weight=? WHERE id=?', (now, tk['weight'], deleted['id']))
                else:
                    c.execute('INSERT INTO audit_tasks (id,audit_id,name,description,category,responsible,status,priority,order_num,created_at,updated_at,weight) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',
                              (gen_id(), aid, tk['name'], tk['description'], tk['stage_name'], assigned_resp, 'Pendiente', 'Media', tk['order_num'], now, now, tk['weight']))
                restored += 1
                
        log_activity(c, 'RESTAURAR PLANTILLA', 'Auditoría', aid, f"{restored} tareas restauradas")
        conn.commit(); conn.close(); return jsonify({"status":"success", "restored": restored})
    except Exception as e:
        conn.close(); return jsonify({"error": str(e)}), 500

# ─── AUDIT ATTACHMENTS ────────────────────────────────────────────────────────

ALLOWED_EXTENSIONS = {'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'zip', '7z', 'rar', 'txt', 'csv'}

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

@app.route('/api/audits/<aid>/attachments', methods=['GET'])
@login_required
def get_audit_attachments(aid):
    conn = get_db(); c = conn.cursor()
    c.execute('SELECT id, filename, size, uploaded_by, uploaded_at FROM audit_attachments WHERE audit_id=? ORDER BY uploaded_at DESC', (aid,))
    attachments = [dict(r) for r in c.fetchall()]
    conn.close()
    return jsonify(attachments)

@app.route('/api/audits/<aid>/attachments', methods=['POST'])
@login_required
def upload_audit_attachment(aid):
    if 'file' not in request.files:
        return jsonify({"error": "No hay archivo"}), 400
    file = request.files['file']
    if file.filename == '':
        return jsonify({"error": "No seleccionaste archivo"}), 400
    if not allowed_file(file.filename):
        return jsonify({"error": "Tipo de archivo no permitido"}), 400
        
    filename = secure_filename(file.filename)
    if not filename:
        filename = f"file_{gen_id()}"
        
    att_id = gen_id()
    # Save with unique name to prevent collisions
    unique_filename = f"{att_id}_{filename}"
    filepath = os.path.join(app.config['UPLOAD_FOLDER'], unique_filename)
    
    try:
        file.save(filepath)
        size = os.path.getsize(filepath)
    except Exception as e:
        return jsonify({"error": f"Error al guardar: {str(e)}"}), 500
        
    user = get_user_from_request()
    now = datetime.now().isoformat()
    
    conn = get_db(); c = conn.cursor()
    c.execute('INSERT INTO audit_attachments (id, audit_id, filename, filepath, size, uploaded_by, uploaded_at) VALUES (?,?,?,?,?,?,?)',
              (att_id, aid, filename, unique_filename, size, user, now))
    log_activity(c, 'SUBIR ADJUNTO', 'Auditoría', aid, f"Archivo: {filename}")
    conn.commit(); conn.close()
    return jsonify({"status": "success", "id": att_id, "filename": filename})

@app.route('/api/attachments/<att_id>', methods=['DELETE'])
@login_required
def delete_attachment(att_id):
    conn = get_db(); c = conn.cursor()
    c.execute('SELECT filepath, audit_id FROM audit_attachments WHERE id=?', (att_id,))
    att = c.fetchone()
    if not att:
        conn.close(); return jsonify({"error": "Adjunto no encontrado"}), 404
        
    try:
        os.remove(os.path.join(app.config['UPLOAD_FOLDER'], att['filepath']))
    except OSError:
        pass # Ignorar si no existe en disco
        
    c.execute('DELETE FROM audit_attachments WHERE id=?', (att_id,))
    log_activity(c, 'ELIMINAR ADJUNTO', 'Auditoría', att['audit_id'], f"Adjunto ID: {att_id}")
    conn.commit(); conn.close()
    return jsonify({"status": "success"})

@app.route('/api/attachments/<att_id>/download', methods=['GET'])
def download_attachment(att_id):
    # No @login_required here so window.open works easily without passing tokens if using cookies (which we are)
    # But for security, better to check session manually
    if 'username' not in session:
        return "No autenticado", 401
    conn = get_db(); c = conn.cursor()
    c.execute('SELECT filename, filepath FROM audit_attachments WHERE id=?', (att_id,))
    att = c.fetchone()
    conn.close()
    if not att:
        return "Adjunto no encontrado", 404
        
    return send_from_directory(app.config['UPLOAD_FOLDER'], att['filepath'], as_attachment=True, download_name=att['filename'])
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
    
    q = append_auth_filter(q, params, table_alias='a', task_alias='t')
    
    if audit_id: q += ' AND t.audit_id=?'; params.append(audit_id)
    if responsible: q += ' AND t.responsible=?'; params.append(responsible)
    if status:
        status_list = [s.strip() for s in status.split(',')]
        placeholders = ','.join(['?']*len(status_list))
        q += f' AND t.status IN ({placeholders})'
        params.extend(status_list)
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
@require_role('admin', 'gerente', 'jefe')
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
    q = append_auth_filter(q, params, table_alias='a', task_alias='t')
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
    q = append_auth_filter(q, params, table_alias='a', task_alias='d')
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
    base = append_auth_filter(base, params, table_alias='t', audit_id_column='audit_id', task_alias='t')
    
    if responsible: base += ' AND t.responsible LIKE ?'; params.append(f'%{responsible}%')
    w = " AND"
    c.execute(f'SELECT COUNT(*) {base}', params); total = c.fetchone()[0]
    c.execute(f'SELECT COUNT(*) {base}{w} t.status="Completada"', params); completed = c.fetchone()[0]
    c.execute(f'SELECT COUNT(*) {base}{w} t.status="En Progreso"', params); in_progress = c.fetchone()[0]
    c.execute(f'SELECT COUNT(*) {base}{w} t.status="Pendiente"', params); pending = c.fetchone()[0]
    c.execute(f'SELECT COUNT(*) {base}{w} t.status!="Completada" AND t.due_date<? AND t.due_date!=""', params + [today]); overdue = c.fetchone()[0]
    db = 'FROM deviations d WHERE 1=1'; dp = []
    db = append_auth_filter(db, dp, table_alias='d', audit_id_column='audit_id', task_alias='d')
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
    w = append_auth_filter(w, params, table_alias='t', audit_id_column='audit_id', task_alias='t')
    
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
    w = append_auth_filter(w, params, table_alias='a', task_alias='t')
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
    w = append_auth_filter(w, params, table_alias='t', audit_id_column='audit_id', task_alias='t')
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
    w = append_auth_filter(w, params, table_alias='t', audit_id_column='audit_id', task_alias='t')
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
@require_role('admin', 'gerente', 'jefe')
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
@require_role('admin', 'gerente', 'jefe')
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

# ─── SATISFACTION SURVEYS (V2.0) ─────────────────────────────────────────────

import smtplib
import io
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from email.mime.application import MIMEApplication

def generate_survey_pdf(audit_name, evaluator_name, evaluator_role, sat_pct, questions_data, responded_at):
    try:
        from reportlab.lib.pagesizes import letter
        from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, HRFlowable
        from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
        from reportlab.lib import colors
        
        buffer = io.BytesIO()
        doc = SimpleDocTemplate(buffer, pagesize=letter, rightMargin=36, leftMargin=36, topMargin=36, bottomMargin=36)
        story = []
        styles = getSampleStyleSheet()
        
        title_style = ParagraphStyle('DocTitle', parent=styles['Heading1'], fontSize=16, textColor=colors.HexColor('#002D72'), spaceAfter=6)
        sub_style = ParagraphStyle('DocSub', parent=styles['Normal'], fontSize=10, textColor=colors.HexColor('#475569'), spaceAfter=12)
        cell_style = ParagraphStyle('Cell', parent=styles['Normal'], fontSize=9, textColor=colors.HexColor('#1e293b'))
        cell_bold = ParagraphStyle('CellB', parent=styles['Normal'], fontSize=9, fontName='Helvetica-Bold', textColor=colors.HexColor('#002D72'))
        
        story.append(Paragraph("Informe de Resultados - Encuesta de Satisfacción", title_style))
        date_str = str(responded_at)[:10] if responded_at else datetime.now().strftime('%Y-%m-%d')
        story.append(Paragraph(f"<b>Auditoría:</b> {audit_name}<br/><b>Evaluador:</b> {evaluator_name} ({evaluator_role})<br/><b>Fecha de Respuesta:</b> {date_str}", sub_style))
        story.append(HRFlowable(width="100%", thickness=1, color=colors.HexColor('#cbd5e1'), spaceAfter=12))
        
        color_hex = '#16a34a' if sat_pct >= 75 else ('#ca8a04' if sat_pct >= 50 else '#dc2626')
        story.append(Paragraph(f"<b>% DE SATISFACCIÓN GLOBAL: <font color='{color_hex}'>{sat_pct:.1f}%</font></b>", ParagraphStyle('Score', parent=styles['Heading2'], fontSize=15, spaceAfter=14)))
        
        table_data = [[Paragraph('<b>Pregunta</b>', cell_bold), Paragraph('<b>Puntaje (0-4)</b>', cell_bold), Paragraph('<b>% Sat.</b>', cell_bold), Paragraph('<b>Comentarios / Justificación</b>', cell_bold)]]
        
        for q in questions_data:
            q_text = q.get('question_text', '')
            score = q.get('score')
            score_val = score if score is not None else 0
            pct = (score_val / 4.0 * 100) if score is not None else 0
            comment = q.get('comment', '') or '-'
            table_data.append([
                Paragraph(q_text, cell_style),
                Paragraph(str(score_val), cell_style),
                Paragraph(f"{pct:.0f}%", cell_style),
                Paragraph(comment, cell_style)
            ])
            
        t = Table(table_data, colWidths=[200, 60, 60, 220])
        t.setStyle(TableStyle([
            ('BACKGROUND', (0,0), (-1,0), colors.HexColor('#f1f5f9')),
            ('ALIGN', (1,0), (2,-1), 'CENTER'),
            ('GRID', (0,0), (-1,-1), 0.5, colors.HexColor('#cbd5e1')),
            ('VALIGN', (0,0), (-1,-1), 'TOP'),
            ('TOPPADDING', (0,0), (-1,-1), 6),
            ('BOTTOMPADDING', (0,0), (-1,-1), 6),
        ]))
        story.append(t)
        
        doc.build(story)
        pdf_data = buffer.getvalue()
        buffer.close()
        return pdf_data
    except Exception as e:
        print(f"[PDF ERROR] No se pudo generar PDF: {e}")
        return None

def send_survey_completion_notification(dispatch_id):
    conn = get_db(); c = conn.cursor()
    c.execute("SELECT key, value FROM global_settings")
    settings = {row['key']: row['value'] for row in c.fetchall()}
    
    enabled = settings.get('survey_notify_enabled', 'false')
    emails_str = settings.get('survey_notify_emails', '')
    if enabled not in ('true', '1', True) or not emails_str:
        conn.close(); return
        
    recipients = [e.strip() for e in emails_str.split(',') if e.strip()]
    if not recipients:
        conn.close(); return
        
    c.execute('SELECT * FROM survey_dispatches WHERE id=?', (dispatch_id,))
    dispatch = c.fetchone()
    if not dispatch:
        conn.close(); return
        
    c.execute('SELECT name FROM audits WHERE id=?', (dispatch['audit_id'],))
    audit_row = c.fetchone()
    audit_name = audit_row['name'] if audit_row else 'Auditoría'
    
    c.execute('SELECT name, role_title FROM audit_stakeholders WHERE id=?', (dispatch['stakeholder_id'],))
    stk = c.fetchone()
    evaluator_name = stk['name'] if stk else 'Auditado'
    evaluator_role = stk['role_title'] if stk else 'Auditado'
    
    c.execute('''
        SELECT q.question_text, r.score, r.comment
        FROM survey_responses r
        JOIN survey_questions q ON r.question_id = q.id
        WHERE r.dispatch_id = ?
        ORDER BY q.order_num
    ''', (dispatch_id,))
    responses = [dict(r) for r in c.fetchall()]
    conn.close()
    
    if not responses:
        return
        
    scores = [r['score'] for r in responses if r['score'] is not None]
    avg_pct = ((sum(scores) / (len(scores) * 4)) * 100) if scores else 0.0
    
    subject_template = settings.get('survey_notify_subject', '[Notificación] Encuesta Respondida: {{audit_name}} - {{score_pct}}% Satisfacción')
    body_template = settings.get('survey_notify_body', "Estimados,\n\nSe ha recibido la respuesta a la Encuesta de Satisfacción para la auditoría '{{audit_name}}'.\n\nEvaluador: {{evaluator_name}}\n% de Satisfacción Alcanzado: {{score_pct}}%\n\nSe adjunta el reporte detallado en formato PDF.\n\nSaludos,\nSistema de Auditoría Interna")
    
    subject = subject_template.replace('{{audit_name}}', audit_name).replace('{{evaluator_name}}', evaluator_name).replace('{{score_pct}}', f"{avg_pct:.1f}")
    body_text = body_template.replace('{{audit_name}}', audit_name).replace('{{evaluator_name}}', evaluator_name).replace('{{score_pct}}', f"{avg_pct:.1f}")
    
    pdf_bytes = generate_survey_pdf(audit_name, evaluator_name, evaluator_role, avg_pct, responses, dispatch['responded_at'] or datetime.now().isoformat())
    
    smtp_host = settings.get('smtp_host', '')
    smtp_port = settings.get('smtp_port', '587')
    smtp_user = settings.get('smtp_user', '')
    smtp_pass = settings.get('smtp_pass', '')
    
    for to_email in recipients:
        if not smtp_host or not smtp_user or not smtp_pass:
            print(f"\n[NOTIFICACIÓN SIMULADA - CONTROL DE GESTIÓN] Para: {to_email}")
            print(f"Asunto: {subject}")
            print(f"Sat %: {avg_pct:.1f}% | PDF adjunto generado: {len(pdf_bytes) if pdf_bytes else 0} bytes\n")
            continue
            
        try:
            msg = MIMEMultipart()
            msg['From'] = smtp_user
            msg['To'] = to_email
            msg['Subject'] = subject
            msg.attach(MIMEText(body_text, 'plain'))
            
            if pdf_bytes:
                part = MIMEApplication(pdf_bytes, Name=f"Reporte_Encuesta.pdf")
                part['Content-Disposition'] = f'attachment; filename="Reporte_Encuesta.pdf"'
                msg.attach(part)
                
            server = smtplib.SMTP(smtp_host, int(smtp_port))
            server.starttls()
            server.login(smtp_user, smtp_pass)
            server.send_message(msg)
            server.quit()
            print(f"[NOTIFICACIÓN CORREO REAL] Enviada a {to_email}")
        except Exception as e:
            print(f"[ERROR NOTIFICACIÓN SMTP] {to_email}: {e}")

def send_survey_email(to_email, name, audit_name, token):
    app_url = f"http://localhost:5001/static/survey_fill.html?token={token}"
    
    conn = get_db(); c = conn.cursor()
    c.execute("SELECT key, value FROM global_settings")
    settings = {row['key']: row['value'] for row in c.fetchall()}
    conn.close()
    
    subject = settings.get('survey_email_subject', 'Encuesta de Satisfacción Post-Auditoría - {{audit_name}}')
    body = settings.get('survey_email_body', 'Estimado(a) {{evaluator_name}},\n\nPor favor, responde la siguiente encuesta de satisfacción:\n{{link}}\n\nSaludos.')
    
    subject = subject.replace('{{audit_name}}', audit_name).replace('{{evaluator_name}}', name).replace('{{link}}', app_url)
    body = body.replace('{{audit_name}}', audit_name).replace('{{evaluator_name}}', name).replace('{{link}}', app_url)
    
    smtp_host = settings.get('smtp_host', '')
    smtp_port = settings.get('smtp_port', '587')
    smtp_user = settings.get('smtp_user', '')
    smtp_pass = settings.get('smtp_pass', '')
    
    if not smtp_host or not smtp_user or not smtp_pass:
        print(f"\n[CORREO SIMULADO - SMTP NO CONFIGURADO] Enviando a: {to_email}")
        print(f"Asunto: {subject}")
        print(f"Cuerpo:\n{body}\n")
        return
        
    try:
        msg = MIMEMultipart()
        msg['From'] = smtp_user
        msg['To'] = to_email
        msg['Subject'] = subject
        msg.attach(MIMEText(body, 'plain'))
        
        server = smtplib.SMTP(smtp_host, int(smtp_port))
        server.starttls()
        server.login(smtp_user, smtp_pass)
        server.send_message(msg)
        server.quit()
        print(f"[CORREO REAL] Enviado con éxito a {to_email}")
    except Exception as e:
        print(f"[ERROR SMTP] No se pudo enviar el correo a {to_email}: {e}")
        # Opcional: Fallback a simulado
        print(f"\n[CORREO SIMULADO - FALLBACK] Asunto: {subject}\nEnlace: {app_url}\n")

@app.route('/api/survey-templates', methods=['GET'])
def get_survey_templates():
    conn = get_db(); c = conn.cursor()
    c.execute('SELECT * FROM survey_templates ORDER BY created_at DESC')
    r = [dict(x) for x in c.fetchall()]; conn.close(); return jsonify(r)

@app.route('/api/survey-templates', methods=['POST'])
def create_survey_template():
    p = request.json; conn = get_db(); c = conn.cursor(); tid = gen_id(); now = datetime.now().isoformat()
    c.execute('INSERT INTO survey_templates (id, name, description, created_at) VALUES (?, ?, ?, ?)',
              (tid, p.get('name', 'Nueva Plantilla'), p.get('description', ''), now))
    conn.commit(); conn.close(); return jsonify({"status": "success", "id": tid})

@app.route('/api/survey-templates/<tid>', methods=['PUT'])
def update_survey_template(tid):
    p = request.json; conn = get_db(); c = conn.cursor()
    c.execute('UPDATE survey_templates SET name=?, description=? WHERE id=?',
              (p.get('name'), p.get('description'), tid))
    conn.commit(); conn.close(); return jsonify({"status": "success"})

@app.route('/api/survey-templates/<tid>', methods=['DELETE'])
def delete_survey_template(tid):
    conn = get_db(); c = conn.cursor()
    c.execute('DELETE FROM survey_templates WHERE id=?', (tid,))
    c.execute('DELETE FROM survey_questions WHERE template_id=?', (tid,))
    conn.commit(); conn.close(); return jsonify({"status": "success"})

@app.route('/api/survey-templates/<tid>', methods=['GET'])
def get_survey_template_details(tid):
    conn = get_db(); c = conn.cursor()
    c.execute('SELECT * FROM survey_templates WHERE id=?', (tid,))
    t = c.fetchone()
    if not t: conn.close(); return jsonify({"error": "No encontrado"}), 404
    t_dict = dict(t)
    c.execute('SELECT * FROM survey_questions WHERE template_id=? ORDER BY order_num', (tid,))
    
    questions = []
    for q in c.fetchall():
        q_dict = dict(q)
        q_dict['requires_justification_below'] = q_dict.get('require_comment_if_below')
        questions.append(q_dict)
    
    t_dict['questions'] = questions
    conn.close(); return jsonify(t_dict)

@app.route('/api/survey-templates/<tid>/questions', methods=['PUT'])
def update_survey_template_questions(tid):
    questions = request.json.get('questions', [])
    conn = get_db(); c = conn.cursor(); now = datetime.now().isoformat()
    c.execute('DELETE FROM survey_questions WHERE template_id=?', (tid,))
    for idx, q in enumerate(questions):
        qid = gen_id()
        c.execute('''
            INSERT INTO survey_questions 
            (id, template_id, question_text, question_type, order_num, is_required, 
             require_comment_if_below, weight, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''', (
            qid, tid, q.get('question_text', ''), q.get('question_type', 'escala'),
            idx, 1 if q.get('is_required', True) else 0,
            q.get('requires_justification_below'),
            q.get('weight', 1.0),
            now
        ))
    conn.commit(); conn.close(); return jsonify({"status": "success"})

@app.route('/api/audits/<aid>/survey-results', methods=['GET'])
def get_audit_survey_results(aid):
    conn = get_db(); c = conn.cursor()
    c.execute('''
        SELECT 
            s.id, s.name, s.email, s.role_title,
            (SELECT status FROM survey_dispatches WHERE stakeholder_id = s.id AND audit_id = ? ORDER BY sent_at DESC LIMIT 1) as status,
            (SELECT sent_at FROM survey_dispatches WHERE stakeholder_id = s.id AND audit_id = ? ORDER BY sent_at DESC LIMIT 1) as sent_at
        FROM audit_stakeholders s WHERE audit_id = ?
    ''', (aid, aid, aid))
    stakeholders = [dict(x) for x in c.fetchall()]
    
    total = len(stakeholders)
    sent_list = [s for s in stakeholders if s['status'] in ('Enviada', 'Respondida')]
    responded_list = [s for s in stakeholders if s['status'] == 'Respondida']
    pending_list = [s for s in stakeholders if s['status'] == 'Enviada']
    
    now = datetime.now()
    for s in pending_list:
        if s['sent_at']:
            sent_date = datetime.fromisoformat(s['sent_at'].replace('Z', '+00:00') if 'Z' in s['sent_at'] else s['sent_at'])
            s['days_pending'] = (now - sent_date.replace(tzinfo=None)).days
        else:
            s['days_pending'] = 0
            
    c.execute('''
        SELECT d.id as dispatch_id, s.name, s.role_title, r.question_id, r.score, r.comment, r.responded_at, q.question_text, q.question_type
        FROM survey_responses r
        JOIN survey_dispatches d ON r.dispatch_id = d.id
        JOIN audit_stakeholders s ON d.stakeholder_id = s.id
        JOIN survey_questions q ON r.question_id = q.id
        WHERE d.audit_id = ?
        ORDER BY d.id, q.order_num ASC
    ''', (aid,))
    raw_responses = c.fetchall()
    
    responses_dict = {}
    for row in raw_responses:
        did = row['dispatch_id']
        if did not in responses_dict:
            responses_dict[did] = {
                "stakeholder": row['name'],
                "role": row['role_title'],
                "created_at": row['responded_at'],
                "data": []
            }
            
        responses_dict[did]["data"].append({
            "question": row['question_text'],
            "type": row['question_type'],
            "value": row['score'] if row['question_type'] in ('escala', 'scale') else row['comment'],
            "justification": row['comment'] if row['question_type'] in ('escala', 'scale') else ""
        })
    
    responses = list(responses_dict.values())
    conn.close()
    return jsonify({
        "stats": {
            "total_stakeholders": total,
            "total_sent": len(sent_list),
            "total_responded": len(responded_list),
            "total_pending": len(pending_list)
        },
        "pending_details": pending_list,
        "responses": responses
    })

@app.route('/api/audits/<aid>/stakeholders', methods=['GET'])
def get_audit_stakeholders(aid):
    conn = get_db(); c = conn.cursor()
    c.execute('''
        SELECT s.*, 
               (SELECT status FROM survey_dispatches WHERE stakeholder_id = s.id AND audit_id = ? ORDER BY sent_at DESC LIMIT 1) as survey_status,
               (SELECT token FROM survey_dispatches WHERE stakeholder_id = s.id AND audit_id = ? ORDER BY sent_at DESC LIMIT 1) as survey_token,
               (SELECT sent_at FROM survey_dispatches WHERE stakeholder_id = s.id AND audit_id = ? ORDER BY sent_at DESC LIMIT 1) as last_sent,
               (SELECT AVG(CAST(r.score AS FLOAT)) FROM survey_responses r JOIN survey_dispatches d2 ON r.dispatch_id = d2.id JOIN survey_questions q ON r.question_id = q.id WHERE d2.stakeholder_id = s.id AND d2.audit_id = ? AND q.question_type IN ('escala', 'scale')) as avg_score
        FROM audit_stakeholders s WHERE audit_id = ? ORDER BY created_at DESC
    ''', (aid, aid, aid, aid, aid))
    r = [dict(x) for x in c.fetchall()]; conn.close(); return jsonify(r)

@app.route('/api/audits/<aid>/stakeholders', methods=['POST'])
def add_audit_stakeholder(aid):
    p = request.json; conn = get_db(); c = conn.cursor(); sid = gen_id(); now = datetime.now().isoformat()
    c.execute('INSERT INTO audit_stakeholders (id, audit_id, name, email, role_title, created_at) VALUES (?, ?, ?, ?, ?, ?)',
              (sid, aid, p['name'], p['email'], p.get('role_title', 'Auditado'), now))
    conn.commit(); conn.close(); return jsonify({"status": "success", "id": sid})

@app.route('/api/audits/<aid>/stakeholders/<sid>', methods=['DELETE'])
def delete_audit_stakeholder(aid, sid):
    conn = get_db(); c = conn.cursor()
    c.execute('DELETE FROM audit_stakeholders WHERE id=?', (sid,))
    conn.commit(); conn.close(); return jsonify({"status": "success"})

@app.route('/api/audits/<aid>/distribute-survey', methods=['POST'])
def distribute_survey(aid):
    p = request.json; conn = get_db(); c = conn.cursor(); now = datetime.now().isoformat()
    stakeholder_ids = p.get('stakeholders', []); template_id = p.get('template_id')
    if not template_id or not stakeholder_ids: return jsonify({"error": "Faltan datos"}), 400
    
    c.execute('SELECT name FROM audits WHERE id=?', (aid,)); audit_row = c.fetchone()
    if not audit_row: return jsonify({"error": "Auditoría no encontrada"}), 404
    
    for sid in stakeholder_ids:
        c.execute('SELECT name, email FROM audit_stakeholders WHERE id=?', (sid,)); stk = c.fetchone()
        if stk:
            token = str(uuid.uuid4()); did = gen_id()
            c.execute('INSERT INTO survey_dispatches (id, audit_id, template_id, stakeholder_id, token, status, sent_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
                      (did, aid, template_id, sid, token, 'Enviada', now))
            send_survey_email(stk['email'], stk['name'], audit_row['name'], token)
            
    conn.commit(); conn.close(); return jsonify({"status": "success"})

@app.route('/api/audits/<aid>/stakeholders/<sid>/resend', methods=['POST'])
def resend_survey(aid, sid):
    conn = get_db(); c = conn.cursor(); now = datetime.now().isoformat()
    c.execute('SELECT name FROM audits WHERE id=?', (aid,)); audit_row = c.fetchone()
    if not audit_row: return jsonify({"error": "Auditoría no encontrada"}), 404
    
    c.execute('SELECT * FROM survey_dispatches WHERE stakeholder_id=? AND audit_id=? ORDER BY sent_at DESC LIMIT 1', (sid, aid))
    last_dispatch = c.fetchone()
    if not last_dispatch: return jsonify({"error": "No hay envío previo"}), 400
    
    c.execute('SELECT name, email FROM audit_stakeholders WHERE id=?', (sid,)); stk = c.fetchone()
    if stk:
        send_survey_email(stk['email'], stk['name'], audit_row['name'], last_dispatch['token'])
        c.execute('UPDATE survey_dispatches SET sent_at=? WHERE id=?', (now, last_dispatch['id']))
        
    conn.commit(); conn.close(); return jsonify({"status": "success"})

@app.route('/api/public/survey/<token>', methods=['GET'])
def get_public_survey(token):
    conn = get_db(); c = conn.cursor()
    c.execute('SELECT * FROM survey_dispatches WHERE token=?', (token,)); d = c.fetchone()
    if not d: conn.close(); return jsonify({"error": "Enlace inválido o caducado"}), 404
    if d['status'] == 'Respondida': conn.close(); return jsonify({"status": "Respondida"})
    
    c.execute('SELECT name, auditors FROM audits WHERE id=?', (d['audit_id'],)); a = c.fetchone()
    c.execute('SELECT * FROM survey_questions WHERE template_id=? ORDER BY order_num', (d['template_id'],)); qs = [dict(q) for q in c.fetchall()]
    c.execute('SELECT name, role_title FROM audit_stakeholders WHERE id=?', (d['stakeholder_id'],)); stk = c.fetchone()
    conn.close()
    return jsonify({"audit_name": a['name'], "evaluator_name": stk['name'], "evaluator_role": stk['role_title'], "questions": qs, "dispatch_id": d['id']})

@app.route('/api/public/survey/<token>', methods=['POST'])
def submit_public_survey(token):
    p = request.json; conn = get_db(); c = conn.cursor(); now = datetime.now().isoformat()
    c.execute('SELECT * FROM survey_dispatches WHERE token=?', (token,)); d = c.fetchone()
    if not d or d['status'] == 'Respondida': conn.close(); return jsonify({"error": "Enlace inválido o ya respondido"}), 400
    
    for resp in p.get('responses', []):
        c.execute('INSERT INTO survey_responses (id, dispatch_id, question_id, score, comment, responded_at) VALUES (?, ?, ?, ?, ?, ?)',
                  (gen_id(), d['id'], resp['question_id'], resp.get('score'), resp.get('comment', ''), now))
        
    c.execute("UPDATE survey_dispatches SET status='Respondida', responded_at=? WHERE id=?", (now, d['id']))
    conn.commit(); conn.close()
    
    try:
        send_survey_completion_notification(d['id'])
    except Exception as e:
        print(f"[ERROR NOTIFICACION COMPLETADA] {e}")
        
    return jsonify({"status": "success"})

@app.route('/api/surveys/dashboard', methods=['GET'])
@login_required
def get_surveys_dashboard():
    conn = get_db(); c = conn.cursor()
    
    area_id = request.args.get('area_id')
    role = session.get('role', 'auditor')
    def apply_dashboard_filters(q, params, table_alias='d', audit_id_column='audit_id'):
        q = append_auth_filter(q, params, table_alias=table_alias, audit_id_column=audit_id_column)
        if area_id and role in ('admin', 'gerente'):
            c_temp = get_db().cursor()
            c_temp.execute('SELECT name FROM areas WHERE id=?', (area_id,))
            area_row = c_temp.fetchone()
            if area_row:
                area_name = area_row['name']
                prefix = f"{table_alias}." if table_alias else ""
                q += f" AND ({prefix}{audit_id_column} IN (SELECT audit_id FROM audit_areas WHERE area_id=?) OR a.responsible_area LIKE ? OR a.responsible_area = ?)"
                params.extend([area_id, f'%"{area_name}"%', area_name])
            else:
                q += " AND 1=0"
        return q
    
    q_dis = "SELECT d.status, d.audit_id, a.name as audit_name FROM survey_dispatches d JOIN audits a ON d.audit_id = a.id WHERE a.deleted_at IS NULL"
    params_dis = []
    q_dis = apply_dashboard_filters(q_dis, params_dis)
    c.execute(q_dis, params_dis)
    dispatches = c.fetchall()
    
    total_sent = len(dispatches)
    total_completed = sum(1 for d in dispatches if d['status'] == 'Respondida')
    
    q_res = """
    SELECT r.score
    FROM survey_responses r
    JOIN survey_dispatches d ON r.dispatch_id = d.id
    JOIN survey_questions q ON r.question_id = q.id
    JOIN audits a ON d.audit_id = a.id
    WHERE q.question_type IN ('escala', 'scale') AND a.deleted_at IS NULL
    """
    params_res = []
    q_res = apply_dashboard_filters(q_res, params_res)
    c.execute(q_res, params_res)
    responses = c.fetchall()
    
    avg_score = 0
    if responses:
        valid_scores = [float(r['score']) for r in responses if r['score'] is not None]
        if valid_scores:
            avg_score = sum(valid_scores) / len(valid_scores)
            
    # Rankings de Auditorías
    q_audits = """
    SELECT a.name as audit_name, AVG(CAST(r.score AS FLOAT)) as avg_score
    FROM survey_responses r
    JOIN survey_dispatches d ON r.dispatch_id = d.id
    JOIN survey_questions q ON r.question_id = q.id
    JOIN audits a ON d.audit_id = a.id
    WHERE q.question_type IN ('escala', 'scale') AND a.deleted_at IS NULL
    """
    params_aud = []
    q_audits = apply_dashboard_filters(q_audits, params_aud)
    q_audits += " GROUP BY a.id, a.name HAVING count(r.id) > 0 ORDER BY avg_score DESC"
    c.execute(q_audits, params_aud)
    audit_ranking = [dict(r) for r in c.fetchall()]

    # Rankings de Preguntas
    q_questions = """
    SELECT q.question_text, AVG(CAST(r.score AS FLOAT)) as avg_score
    FROM survey_responses r
    JOIN survey_dispatches d ON r.dispatch_id = d.id
    JOIN survey_questions q ON r.question_id = q.id
    JOIN audits a ON d.audit_id = a.id
    WHERE q.question_type IN ('escala', 'scale') AND a.deleted_at IS NULL
    """
    params_q = []
    q_questions = apply_dashboard_filters(q_questions, params_q)
    q_questions += " GROUP BY q.question_text HAVING count(r.id) > 0 ORDER BY avg_score DESC"
    c.execute(q_questions, params_q)
    question_ranking = [dict(r) for r in c.fetchall()]

    conn.close()
    return jsonify({
        "total_sent": total_sent,
        "total_completed": total_completed,
        "response_rate": round(total_completed / total_sent * 100, 1) if total_sent > 0 else 0,
        "avg_score": round(avg_score, 1),
        "audit_ranking": audit_ranking,
        "question_ranking": question_ranking
    })

@app.route('/api/surveys/history', methods=['GET'])
@login_required
def get_surveys_history():
    conn = get_db(); c = conn.cursor()
    q = """
    SELECT d.id, d.audit_id, d.status, d.sent_at, d.responded_at, d.token,
           a.name as audit_name, a.responsible_area,
           s.name as stakeholder_name, s.email as stakeholder_email, s.role_title as stakeholder_role,
           (SELECT AVG(CAST(r.score AS FLOAT)) FROM survey_responses r JOIN survey_questions q ON r.question_id = q.id WHERE r.dispatch_id = d.id AND q.question_type IN ('escala', 'scale')) as avg_score
    FROM survey_dispatches d
    JOIN audits a ON d.audit_id = a.id
    JOIN audit_stakeholders s ON d.stakeholder_id = s.id
    WHERE a.deleted_at IS NULL
    """
    params = []
    area_id = request.args.get('area_id')
    year = request.args.get('year')
    search = request.args.get('search')
    status_filter = request.args.get('status')
    
    role = session.get('role', 'auditor')
    q = append_auth_filter(q, params, table_alias='d', audit_id_column='audit_id')
    if area_id and role in ('admin', 'gerente'):
        c_temp = get_db().cursor()
        c_temp.execute('SELECT name FROM areas WHERE id=?', (area_id,))
        area_row = c_temp.fetchone()
        if area_row:
            area_name = area_row['name']
            q += " AND (d.audit_id IN (SELECT audit_id FROM audit_areas WHERE area_id=?) OR a.responsible_area LIKE ? OR a.responsible_area = ?)"
            params.extend([area_id, f'%"{area_name}"%', area_name])
        else:
            q += " AND 1=0"
            
    if year:
        q += " AND strftime('%Y', d.sent_at) = ?"
        params.append(year)
    if status_filter:
        q += " AND d.status = ?"
        params.append(status_filter)
    if search:
        term = f"%{search}%"
        q += " AND (a.name LIKE ? OR s.name LIKE ? OR s.email LIKE ?)"
        params.extend([term, term, term])
        
    q += " ORDER BY d.sent_at DESC"
    c.execute(q, params)
    history = [dict(r) for r in c.fetchall()]
    conn.close()
    return jsonify(history)

@app.route('/api/settings/survey', methods=['GET'])
@login_required
def get_survey_settings():
    if session.get('role') != 'admin':
        return jsonify({"error": "No autorizado"}), 403
    conn = get_db(); c = conn.cursor()
    c.execute("SELECT key, value FROM global_settings")
    settings = {row['key']: row['value'] for row in c.fetchall()}
    conn.close()
    
    # Hide password
    if settings.get('smtp_pass'):
        settings['smtp_pass'] = '********'
        
    return jsonify(settings)

@app.route('/api/settings/survey', methods=['POST'])
@login_required
def update_survey_settings():
    if session.get('role') != 'admin':
        return jsonify({"error": "No autorizado"}), 403
    data = request.json
    conn = get_db(); c = conn.cursor()
    
    for key in ['smtp_host', 'smtp_port', 'smtp_user', 'survey_email_subject', 'survey_email_body']:
        if key in data:
            c.execute("UPDATE global_settings SET value = ? WHERE key = ?", (data[key], key))
            
    if 'smtp_pass' in data and data['smtp_pass'] != '********':
        c.execute("UPDATE global_settings SET value = ? WHERE key = ?", (data['smtp_pass'], 'smtp_pass'))
        
    conn.commit()
    log_activity(c, 'EDITAR', 'Configuración', 'email', 'Actualización de configuración de correo')
    conn.close()
    return jsonify({"status": "success"})

@app.route('/api/surveys/<did>/resend', methods=['POST'])
@login_required
def resend_global_survey(did):
    conn = get_db(); c = conn.cursor()
    q = "SELECT d.*, s.email, s.name, a.name as audit_name FROM survey_dispatches d JOIN audit_stakeholders s ON d.stakeholder_id = s.id JOIN audits a ON d.audit_id = a.id WHERE d.id = ?"
    params = [did]
    q = append_auth_filter(q, params, table_alias='d', audit_id_column='audit_id')
    c.execute(q, params)
    dispatch = c.fetchone()
    
    if not dispatch:
        conn.close()
        return jsonify({"status":"error", "message":"No encontrado o sin permiso"}), 404
        
    try:
        send_survey_email(dispatch['email'], dispatch['name'], dispatch['audit_name'], dispatch['token'])
        c.execute("UPDATE survey_dispatches SET sent_at = ? WHERE id = ?", (datetime.now().isoformat(), did))
        conn.commit()
        log_activity(c, 'REENVIAR', 'Encuesta', did, f"Reenvío de encuesta a {dispatch['email']}")
        conn.close()
        return jsonify({"status":"success"})
    except Exception as e:
        conn.close()
        return jsonify({"status":"error", "message": str(e)}), 500

# ─── Main ────────────────────────────────────────────────────────────────────


if __name__ == '__main__':
    init_db()
    print("═══════════════════════════════════════════════════")
    print("  Workflow de Tareas v2 — Servidor iniciado")
    print(f"  http://localhost:5001")
    print(f"  Base de datos: {os.path.abspath(DB_FILE)}")
    print("═══════════════════════════════════════════════════")
    app.run(host='0.0.0.0', port=5001, debug=True)
