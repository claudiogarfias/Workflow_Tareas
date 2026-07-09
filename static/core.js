// ═══════════════════════════════════════════════════════════════
// WORKFLOW DE TAREAS v2 — Core Module
// ═══════════════════════════════════════════════════════════════

const API = '';
const app = {
  user: null, audits: [], templates: [], auditors: [], plans: [], areas: [],
  charts: {}, currentView: 'dashboard', currentAuditId: null,

  // ── API ──
  async api(url, opts = {}) {
    try {
      const headers = { 'Content-Type': 'application/json' };
      if (this.user) headers['X-User'] = this.user.full_name || this.user.username || 'Desconocido';
      const r = await fetch(API + url, {
        headers: headers,
        credentials: 'same-origin',
        ...opts, body: opts.body ? JSON.stringify(opts.body) : undefined
      });
      return await r.json();
    } catch (e) { console.error(e); return null; }
  },
  get(u) { return this.api(u); },
  post(u, d) { return this.api(u, { method: 'POST', body: d }); },
  put(u, d) { return this.api(u, { method: 'PUT', body: d }); },
  patch(u, d) { return this.api(u, { method: 'PATCH', body: d }); },
  del(u) { return this.api(u, { method: 'DELETE' }); },

  // ── Toast ──
  toast(msg, type = 'success') {
    const c = document.getElementById('toastContainer');
    const t = document.createElement('div');
    t.className = `toast toast-${type}`;
    t.textContent = msg;
    c.appendChild(t);
    setTimeout(() => t.remove(), 3500);
  },

  // ── Modal ──
  openModal(title, bodyHTML, footerHTML = '') {
    document.getElementById('modalTitle').textContent = title;
    document.getElementById('modalBody').innerHTML = bodyHTML;
    document.getElementById('modalFooter').innerHTML = footerHTML;
    const ov = document.getElementById('modalOverlay');
    if(ov) ov.classList.remove('hidden');
  },
  closeModal() {
    const ov = document.getElementById('modalOverlay');
    if(ov) ov.classList.add('hidden');
  },
  closeModalOnOverlay(e) { 
    // Deshabilitado por solicitud: Evita que el modal se cierre al hacer clic fuera (overlay)
    // para prevenir la pérdida accidental de datos en formularios.
  },

  // ── Auth ──
  async handleLogin() {
    const u = document.getElementById('loginUsername').value.trim();
    const p = document.getElementById('loginPassword').value;
    const r = await this.post('/api/login', { username: u, password: p });
    const err = document.getElementById('loginError');
    if (r && r.status === 'success') {
      this.user = r; localStorage.setItem('wdt_user', JSON.stringify(r)); this.showApp();
    } else { err.textContent = r?.message || 'Error'; err.style.display = 'block'; }
  },
  async logout() { await this.post('/api/logout'); this.user = null; localStorage.removeItem('wdt_user'); document.getElementById('appLayout').style.display = 'none'; document.getElementById('loginOverlay').style.display = 'flex'; },
  showApp() {
    document.getElementById('loginOverlay').style.display = 'none';
    document.getElementById('appLayout').style.display = 'flex';
    
    const role = this.user.role;
    
    // Hide/Show Admin Menu (Papelera/Logs)
    const adminMenu = document.getElementById('adminMenu');
    if (role === 'admin' || role === 'jefe') {
      adminMenu.classList.remove('hidden');
      adminMenu.classList.add('flex');
    } else {
      adminMenu.classList.add('hidden');
      adminMenu.classList.remove('flex');
    }

    // Hide/Show User Management
    document.getElementById('navUserManagement').style.display = (role === 'admin') ? '' : 'none';

    // Hide/Show Plantillas, Planes & Datos Maestros
    const btnTemplates = document.querySelector('[data-view="templates"]');
    const btnPlans = document.querySelector('[data-view="plans"]');
    const btnMaster = document.querySelector('[data-view="master"]');
    
    if (btnTemplates) btnTemplates.style.display = (role === 'admin' || role === 'jefe') ? '' : 'none';
    if (btnPlans) btnPlans.style.display = (role === 'admin' || role === 'jefe') ? '' : 'none';
    if (btnMaster) btnMaster.style.display = (role === 'admin' || role === 'jefe') ? '' : 'none';

    this.navigate('dashboard');
  },
  showProfileModal() {
    const u = this.user;
    const initials = (u.full_name || u.username).charAt(0).toUpperCase();
    const linked = (u.linked_auditors || []).join(', ') || 'Ninguno';
    const roleMap = { 'admin': 'Administrador', 'jefe': 'Jefe de Auditoría', 'gerente': 'Gerente', 'auditor': 'Auditor' };
    
    this.openModal('Perfil de Usuario', `
      <div class="flex flex-col items-center mb-6">
        <div class="w-24 h-24 rounded-[2rem] bg-primary flex items-center justify-center text-4xl font-headline font-extrabold text-white shadow-ambient mb-4">
          ${initials}
        </div>
        <h2 class="text-2xl font-headline font-extrabold text-on-surface">${u.full_name || u.username}</h2>
        <p class="text-sm font-bold text-on-surface-variant/60 uppercase tracking-widest mt-1">${roleMap[u.role] || u.role}</p>
      </div>
      
      <div class="space-y-4">
        <div class="bg-surface-container-low p-4 rounded-2xl flex justify-between items-center">
          <span class="text-xs font-bold uppercase tracking-widest text-on-surface-variant/60">Usuario del Sistema</span>
          <span class="text-sm font-bold text-on-surface">${u.username}</span>
        </div>
        <div class="bg-surface-container-low p-4 rounded-2xl flex flex-col gap-1">
          <span class="text-xs font-bold uppercase tracking-widest text-on-surface-variant/60">Auditores Vinculados (Datos Maestros)</span>
          <span class="text-sm font-bold text-on-surface">${linked}</span>
        </div>
      </div>
      
      <div class="mt-8">
        <button class="w-full flex items-center justify-center gap-2 bg-surface-variant text-on-surface font-bold py-3 rounded-2xl transition-all hover:bg-surface-container-highest" onclick="app.showChangePasswordModal()">
          <span class="material-symbols-outlined text-xl">password</span> Cambiar Contraseña
        </button>
      </div>
    `, `<button class="w-full bg-primary text-white font-bold px-6 py-3 rounded-2xl text-sm shadow-ambient transition-all hover:opacity-90 active:scale-95" onclick="app.closeModal()">Cerrar</button>`);
  },
  showChangePasswordModal() {
    this.openModal('Cambiar Contraseña', `
      <div class="form-group"><label class="form-label">Actual</label><input type="password" class="form-input" id="cpOld"></div>
      <div class="form-group"><label class="form-label">Nueva</label><input type="password" class="form-input" id="cpNew"></div>
      <div class="form-group"><label class="form-label">Confirmar</label><input type="password" class="form-input" id="cpConfirm"></div>`,
      `<button class="btn btn-secondary" onclick="app.showProfileModal()">Volver</button>
       <button class="btn btn-primary" onclick="app.doChangePassword()">Guardar</button>`);
  },
  async doChangePassword() {
    const o = document.getElementById('cpOld').value, n = document.getElementById('cpNew').value, c = document.getElementById('cpConfirm').value;
    if (n !== c) return this.toast('No coinciden', 'error');
    if (n.length < 4) return this.toast('Mínimo 4 caracteres', 'error');
    const r = await this.post('/api/change-password', { username: this.user.username, old_password: o, new_password: n });
    if (r?.status === 'success') { this.toast('Contraseña actualizada'); this.closeModal(); }
    else this.toast(r?.error || 'Error', 'error');
  },

  // ── Navigation ──
  toggleSidebar() { document.getElementById('sidebar').classList.toggle('open'); },
  navigate(view, params = {}) {
    this.currentView = view; this.navParams = params;
    document.querySelectorAll('.nav-item[data-view]').forEach(el => el.classList.toggle('active', el.dataset.view === view));
    document.getElementById('sidebar').classList.remove('open');
    const titles = {
      dashboard: [`Hola! ${this.user?.full_name || this.user?.username || ''}`, 'SEGUIMIENTO DE AUDITORIAS Y ACTIVIDADES'],
      daily: ['Daily', 'Vista diaria de tareas próximas'],
      audits: ['Auditorías', 'Gestión de trabajos de auditoría'],
      tasks: ['Tareas', 'Control y seguimiento de tareas'],
      deviations: ['Desviaciones', 'Registro y seguimiento de hallazgos'],
      templates: ['Plantillas', 'Plantillas reutilizables de auditoría'],
      plans: ['Planes', 'Planes anuales de auditoría'],
      planner: ['Planificador', 'Planificación estimada de auditorías'],
      master: ['Datos Maestros', 'Catálogos y configuración'],
      users: ['Usuarios', 'Gestión de cuentas de usuario'],
      logs: ['Actividad del Sistema', 'Auditoría de eventos y cambios'],
      recycle: ['Papelera de Reciclaje', 'Recuperación de registros eliminados']
    };
    const [t, s] = titles[view] || ['', ''];
    document.getElementById('pageTitle').textContent = t;
    document.getElementById('pageSubtitle').textContent = s;
    document.getElementById('headerActions').innerHTML = '';
    const fn = {
      dashboard: () => this.renderDashboard(), daily: () => this.renderDaily(),
      audits: () => this.renderAudits(), tasks: () => this.renderTasks(),
      deviations: () => this.renderDeviations(), templates: () => this.renderTemplates(),
      plans: () => this.renderPlans(), planner: () => this.renderPlanner(),
      master: () => this.renderMasterData(),
      users: () => this.renderUsers(),
      logs: () => this.loadLogsView(),
      recycle: () => this.loadRecycleView()
    };
    if (fn[view]) fn[view]();
  },

  // ── Helpers ──
  statusBadge(s) {
    const m = { 
      'Pendiente':'pending', 'En Progreso':'pending', 'Completada':'active', 
      'Bloqueada':'overdue', 'Abierta':'overdue', 'Cerrada':'active', 
      'Mitigada':'active', 'Planificación':'pending', 'En Ejecución':'pending', 
      'Finalizada':'active' 
    };
    const cls = m[s] || 'pending';
    return `<span class="status-badge badge-${cls}">${s}</span>`;
  },
  severityBadge(s) { 
    const cls = s === 'Alta' ? 'overdue' : s === 'Media' ? 'pending' : 'active';
    return `<span class="status-badge badge-${cls}">${s}</span>`; 
  },
  isOverdue(d) { return d && d < new Date().toISOString().slice(0, 10); },
  fmtDate(d) { if (!d) return '—'; const p = d.split('T')[0].split('-'); return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : d; },

  statusSelect(current, tid) {
    const low = (current||'').toLowerCase().replace(/ /g,'-');
    return `<select class="inline-select status-text status-${low}" onchange="app.inlineUpdate('${tid}','status',this.value)">
      ${['Pendiente','En Progreso','Completada'].map(o => `<option ${current===o?'selected':''}>${o}</option>`).join('')}</select>`;
  },
  prioritySelect(curr, tid) {
    const low = (curr||'Media').toLowerCase();
    return `<div class="priority-indicator">
      <div class="priority-dot dot-${low}"></div>
      <select class="inline-select" style="width:70px" onchange="app.inlineUpdate('${tid}','priority',this.value)">
        ${['Alta','Media','Baja'].map(o => `<option ${curr===o?'selected':''}>${o}</option>`).join('')}</select>
    </div>`;
  },
  responsibleSelect(current, tid, audit = null) {
    if (audit && audit.audit_type === 'Integral') {
      const auditorsList = audit.auditors || [];
      if (auditorsList.length > 0) {
        return `<div class="flex -space-x-1" title="Responsabilidad compartida: ${auditorsList.join(', ')}">
          ${auditorsList.map((a, i) => {
            const init = a.split(' ').map(n=>n[0]).join('').substring(0,2).toUpperCase();
            return `<div class="avatar-sm border-[1.5px] border-surface-container-lowest relative" style="z-index:${10-i}">${init}</div>`;
          }).join('')}
        </div>`;
      }
    }
    const initials = current ? current.split(' ').map(n=>n[0]).join('').substring(0,2).toUpperCase() : '?';
    return `<div class="avatar-stack group/resp">
      <div class="avatar-sm" title="${current||'Sin asignar'}">${initials}</div>
      <div class="relative overflow-visible">
        <select class="inline-select opacity-70 hover:opacity-100" style="width:100px" onchange="app.inlineUpdate('${tid}','responsible',this.value)">
          <option value="">— Asignar —</option>${this.auditors.map(a => `<option ${current===a.name?'selected':''}>${a.name}</option>`).join('')}</select>
      </div>
    </div>`;
  },
  dateInput(current, tid, field, isActualOverdue = false) {
    const cls = field === 'due_date' && isActualOverdue ? 'text-error font-bold' : '';
    const displayDate = current ? this.fmtDate(current) : '<span class="text-on-surface-variant/40 material-symbols-outlined text-[16px] relative top-[2px]">calendar_add_on</span>';
    return `<div class="relative flex items-center justify-center min-w-[60px] h-8 hover:bg-surface-variant/50 rounded cursor-pointer transition-colors" title="Fijar fecha">
      <span class="${cls} text-[11px] font-bold">${displayDate}</span>
      <input type="date" class="absolute inset-0 w-full h-full opacity-0 cursor-pointer" value="${current||''}" onclick="try{this.showPicker()}catch(e){}" onchange="app.inlineUpdate('${tid}','${field}',this.value)">
    </div>`;
  },

  async inlineUpdate(tid, field, value) {
    await this.patch(`/api/tasks/${tid}/field`, { field, value });
    if (field === 'name') return;
    
    if (this.currentView === 'audits' && this.currentAuditId) this.openAuditDetail(this.currentAuditId);
    else if (this.currentView === 'tasks') this.loadTasksView();
    else if (this.currentView === 'daily') this.loadDailyView();
  },

  // ── Drag & Drop Reordering ──
  dragStart(e, tid) {
    e.dataTransfer.setData('text/plain', tid);
    e.dataTransfer.effectAllowed = 'move';
    e.target.style.opacity = '0.5';
  },
  dragEnd(e) {
    e.target.style.opacity = '1';
  },
  dragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const tr = e.target.closest('tr');
    if (tr && tr.dataset.taskId) tr.style.borderTop = '2px solid var(--primary)';
  },
  dragLeave(e) {
    const tr = e.target.closest('tr');
    if (tr && tr.dataset.taskId) tr.style.borderTop = '';
  },
  async dropTask(e, targetTid, auditId, targetOrder) {
    e.preventDefault();
    const sourceTid = e.dataTransfer.getData('text/plain');
    const tr = e.target.closest('tr');
    if (tr) tr.style.borderTop = '';
    if (!sourceTid || sourceTid === targetTid) return;
    
    await this.patch(`/api/tasks/${sourceTid}/move`, { order_num: targetOrder });
    if (auditId) this.openAuditDetail(auditId);
    else if (this.loadTasksView) this.loadTasksView();
  },

  // ── Inline Task Row (Ethereal style) ──
  renderTaskRow(t, isReadonly, auditId, stages) {
    const isComplete = t.status === 'Completada';
    const overdue = !isComplete && this.isOverdue(t.due_date);
    const rowCls = isComplete ? 'bg-surface-variant/40' : overdue ? 'bg-error-container/5' : '';
    const audit = this.audits.find(a => a.id === auditId) || null;
    
    if (isReadonly) {
      return `<tr data-task-id="${t.id}" class="transition-all hover:bg-surface-container-low/30 group cursor-default ${rowCls}">
        <td class="pl-4 py-2 w-10"><div class="w-5 h-5 rounded-full border border-primary/20 flex items-center justify-center text-[8px] ${isComplete?'bg-primary text-white border-primary':''}"><span>${isComplete?'✓':''}</span></div></td>
        <td class="py-2">
          <div class="task-cell-name flex items-center gap-1.5 whitespace-normal">
            <span class="line-clamp-2 ${isComplete ? 'line-through opacity-70 text-on-surface-variant' : ''}">${t.name}</span>
            ${t.weight > 0 ? `<span class="text-[9px] bg-primary/10 text-primary px-1.5 py-0.5 rounded-full font-bold whitespace-nowrap">${t.weight}%</span>` : ''}
          </div>
        </td>
        <td class="py-2 w-48">${this.responsibleSelect(t.responsible, t.id, audit)}</td>
        <td class="py-2 w-32 font-bold text-[11px] ${overdue?'text-error':'text-on-surface-variant/70'}">${this.fmtDate(t.due_date)}</td>
        <td class="py-2 w-32">${this.statusBadge(t.status)}</td>
        <td class="py-2 w-28">${this.severityBadge(t.priority||'Media')}</td>
      </tr>`;
    }

    return `<tr data-task-id="${t.id}" class="group cursor-grab ${rowCls}" draggable="true" ondragstart="app.dragStart(event, '${t.id}')" ondragend="app.dragEnd(event)" ondragover="app.dragOver(event)" ondragleave="app.dragLeave(event)" ondrop="app.dropTask(event, '${t.id}', '${auditId||''}', ${t.order_num||0})">
      <td class="pl-4 py-1 w-14">
        <div class="flex items-center gap-2">
          <span class="material-symbols-outlined text-[16px] text-on-surface-variant/30 cursor-grab hover:text-primary transition-colors" title="Arrastrar para mover">drag_indicator</span>
          <label class="cursor-pointer">
            <input type="checkbox" class="hidden" ${isComplete?'checked':''} onchange="app.toggleComplete('${t.id}',this.checked,'${auditId||''}')">
            <div class="w-4 h-4 rounded-full border border-primary/30 flex items-center justify-center text-[7px] transition-all ${isComplete?'bg-primary text-white border-primary shadow-sm':'hover:border-primary opacity-60 hover:opacity-100'}">
              <span>${isComplete?'✓':''}</span>
            </div>
          </label>
        </div>
      </td>
      <td class="py-1">
        <div class="flex items-center gap-2">
          <span class="task-cell-name focus:outline-none focus:text-primary block whitespace-normal cursor-text flex-1 ${isComplete ? 'line-through opacity-70 text-on-surface-variant' : ''}" contenteditable="true" onblur="app.inlineUpdate('${t.id}','name',this.textContent.trim())">${t.name}</span>
          ${t.weight > 0 ? `<span class="text-[9px] bg-primary/10 text-primary px-1.5 py-0.5 rounded-full font-bold whitespace-nowrap mr-2">${t.weight}%</span>` : ''}
        </div>
      </td>
      <td class="py-1 w-44">${this.responsibleSelect(t.responsible, t.id, audit)}</td>
      <td class="py-1 w-28 text-center">${this.dateInput(t.due_date, t.id, 'due_date', overdue)}</td>
      <td class="py-1 w-32">${this.statusSelect(t.status, t.id)}</td>
      <td class="py-1 w-28">${this.prioritySelect(t.priority||'Media', t.id)}</td>
      <td class="pr-4 py-1 w-24">
        <div class="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button class="w-5 h-5 rounded hover:bg-surface-variant transition-colors flex items-center justify-center text-on-surface-variant/60 hover:text-primary" title="Subir" onclick="app.moveTask('${t.id}', -1, '${auditId}')"><span class="material-symbols-outlined text-[13px]">arrow_upward</span></button>
          <button class="w-5 h-5 rounded hover:bg-surface-variant transition-colors flex items-center justify-center text-on-surface-variant/60 hover:text-primary" title="Bajar" onclick="app.moveTask('${t.id}', 1, '${auditId}')"><span class="material-symbols-outlined text-[13px]">arrow_downward</span></button>
          <button class="w-5 h-5 rounded hover:bg-error-container/20 hover:text-error transition-colors flex items-center justify-center" title="Eliminar" onclick="app.deleteTask('${t.id}','${auditId}')"><span class="material-symbols-outlined text-[13px]">delete</span></button>
        </div>
      </td>
    </tr>`;
  },

  renderInsertBtn(auditId, order) {
    return `<tr class="insert-row"><td colspan="8"><button class="insert-task-btn" onclick="app.insertTaskAt('${auditId}',${order})">+ Agregar tarea aquí</button></td></tr>`;
  },

  async toggleComplete(tid, checked, auditId) {
    await this.patch(`/api/tasks/${tid}/field`, { field: 'status', value: checked ? 'Completada' : 'Pendiente' });
    if (auditId) this.openAuditDetail(auditId);
    else if (this.currentView === 'tasks') this.loadTasksView();
    else if (this.currentView === 'daily') this.loadDailyView();
    else if (this.currentView === 'audits' && this.currentAuditId) this.openAuditDetail(this.currentAuditId);
  },

  async moveTask(tid, direction, auditId) {
    const task = await this.get(`/api/tasks/${tid}`);
    if (!task) return;
    const newOrder = Math.max(0, (task.order_num || 0) + direction);
    await this.patch(`/api/tasks/${tid}/move`, { order_num: newOrder });
    if (auditId) this.openAuditDetail(auditId); else this.loadTasksView();
  },

  async insertTaskAt(auditId, order) {
    const name = prompt('Nombre de la nueva tarea:');
    if (!name) return;
    await this.post('/api/tasks', { audit_id: auditId || null, name, order_num: order });
    this.toast('Tarea creada');
    if (auditId) this.openAuditDetail(auditId);
    else this.loadTasksView();
  },

  async restoreTemplateTasks(aid) {
    if (!confirm('¿Deseas restaurar las tareas de la plantilla que falten o hayan sido borradas de esta auditoría?')) return;
    try {
      const res = await this.post(`/api/audits/${aid}/restore-template`, {});
      if (res && res.status === 'success') {
        if (res.restored > 0) {
          this.toast(`Se restauraron ${res.restored} tareas desde la plantilla`);
        } else {
          this.toast('No hay tareas faltantes para restaurar', 'info');
        }
        this.openAuditDetail(aid);
      } else {
        this.toast('Error al restaurar tareas', 'error');
      }
    } catch (e) {
      this.toast('Error al restaurar tareas', 'error');
    }
  },

  async deleteTask(tid, auditId) {
    if (!confirm('¿Eliminar esta tarea?')) return;
    await this.del(`/api/tasks/${tid}`);
    this.toast('Tarea eliminada');
    if (auditId) this.openAuditDetail(auditId);
    else this.navigate(this.currentView);
  },

  // ── Data Loaders ──
  async loadAudits() { this.audits = await this.get('/api/audits?status=active') || []; },
  async loadAllAudits() { this.audits = await this.get('/api/audits') || []; },
  async loadAuditors() { this.auditors = await this.get('/api/auditors') || []; },
  async loadPlans() { this.plans = await this.get('/api/plans') || []; },
  async loadAreas() { this.areas = await this.get('/api/areas') || []; },
  async loadTemplates() { this.templates = await this.get('/api/templates') || []; },

  // ── Dashboard ──
  async renderDashboard() {
    await this.loadAuditors();
    const body = document.getElementById('pageBody');
    body.innerHTML = `
      <div class="flex items-center gap-4 mb-8 bg-surface-container-low p-4 rounded-2xl w-fit">
        <label class="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant/60 ml-1">Filtro por Auditor</label>
        <select id="dashFilter" class="bg-surface-container-lowest border-none rounded-xl py-2 px-4 text-sm font-semibold shadow-sm focus:ring-2 focus:ring-primary" onchange="app.loadDashboard()">
          <option value="">Todos los auditores</option>
          ${this.auditors.map(a => `<option value="${a.name}">${a.name}</option>`).join('')}
        </select>
      </div>
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-6 mb-10" id="kpiGrid"></div>
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8" id="chartsGrid"></div>
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-8" id="chartsGrid2"></div>`;
    this.loadDashboard();
  },

  async loadDashboard() {
    const f = document.getElementById('dashFilter')?.value || '';
    const q = f ? `?responsible=${encodeURIComponent(f)}` : '';
    const [summary, byResp, byCategory, overdueDev, byStatus] = await Promise.all([
      this.get(`/api/dashboard/summary${q}`), this.get(`/api/dashboard/by-responsible${q}`),
      this.get(`/api/dashboard/by-category${q}`), this.get(`/api/dashboard/overdue-deviation${q}`),
      this.get(`/api/dashboard/by-status${q}`)
    ]);
    if (!summary) return;

    // Clickable KPIs
    document.getElementById('kpiGrid').innerHTML = `
      <div class="bg-surface-container-lowest p-6 rounded-[2rem] shadow-ambient flex flex-col gap-2 cursor-pointer transition-transform hover:scale-[1.02]" onclick="app.navigate('tasks')">
        <span class="material-symbols-outlined text-primary text-3xl">assignment</span>
        <div class="text-[10px] font-bold uppercase tracking-widest text-primary-navy/40">Total Tareas</div>
        <div class="text-3xl font-headline font-extrabold text-primary-navy">${summary.total}</div>
      </div>
      <div class="bg-surface-container-lowest p-6 rounded-[2rem] shadow-ambient flex flex-col gap-2 cursor-pointer transition-transform hover:scale-[1.02]" onclick="app.navigate('tasks',{status:'En Progreso'})">
        <span class="material-symbols-outlined text-primary-navy text-3xl">sync</span>
        <div class="text-[10px] font-bold uppercase tracking-widest text-primary-navy/40">En Progreso</div>
        <div class="text-3xl font-headline font-extrabold text-primary-navy">${summary.in_progress}</div>
      </div>
      <div class="bg-surface-container-lowest p-6 rounded-[2rem] shadow-ambient flex flex-col gap-2 cursor-pointer transition-transform hover:scale-[1.02]" onclick="app.navigate('tasks',{status:'Pendiente'})">
        <span class="material-symbols-outlined text-primary text-3xl opacity-60">timer</span>
        <div class="text-[10px] font-bold uppercase tracking-widest text-primary-navy/40">Pendientes</div>
        <div class="text-3xl font-headline font-extrabold text-primary-navy">${summary.pending}</div>
      </div>
      <div class="bg-surface-container-lowest p-6 rounded-[2rem] shadow-ambient flex flex-col gap-2 cursor-pointer transition-transform hover:scale-[1.02]" onclick="app.navigate('tasks',{overdue:'1'})">
        <span class="material-symbols-outlined text-error text-3xl">notification_important</span>
        <div class="text-[10px] font-bold uppercase tracking-widest text-primary-navy/40">Atrasadas</div>
        <div class="text-3xl font-headline font-extrabold text-error">${summary.overdue}</div>
      </div>
      <div class="bg-surface-container-lowest p-6 rounded-[2rem] shadow-ambient flex flex-col gap-2 cursor-pointer transition-transform hover:scale-[1.02]" onclick="app.navigate('tasks',{status:'Completada'})">
        <span class="material-symbols-outlined text-primary text-3xl font-bold">verified</span>
        <div class="text-[10px] font-bold uppercase tracking-widest text-primary-navy/40">Cumplimiento</div>
        <div class="text-3xl font-headline font-extrabold text-primary">${summary.compliance}%</div>
      </div>
      <div class="bg-surface-container-lowest p-6 rounded-[2rem] shadow-ambient flex flex-col gap-2 cursor-pointer transition-transform hover:scale-[1.02]" onclick="app.navigate('deviations')">
        <span class="material-symbols-outlined text-primary-navy text-3xl">warning</span>
        <div class="text-[10px] font-bold uppercase tracking-widest text-primary-navy/40">Desviaciones</div>
        <div class="text-3xl font-headline font-extrabold text-primary-navy">${summary.dev_open} <span class="text-xs font-semibold text-primary-navy/40">/ ${summary.dev_total}</span></div>
      </div>`;

    // Charts
    Object.values(this.charts).forEach(c => c.destroy()); this.charts = {};
    document.getElementById('chartsGrid').innerHTML = `
      <div class="bg-surface-container-lowest p-8 rounded-[2.5rem] shadow-ambient">
        <h3 class="text-sm font-headline font-extrabold mb-6 flex items-center gap-2 uppercase tracking-widest text-on-surface-variant/40">
          <span class="material-symbols-outlined text-[18px]">bar_chart</span> Avance por Responsable
        </h3>
        <div class="h-[300px] relative"><canvas id="chartResp"></canvas></div>
      </div>
      <div class="bg-surface-container-lowest p-8 rounded-[2.5rem] shadow-ambient">
        <h3 class="text-sm font-headline font-extrabold mb-6 flex items-center gap-2 uppercase tracking-widest text-on-surface-variant/40">
          <span class="material-symbols-outlined text-[18px]">donut_large</span> Estado de Tareas
        </h3>
        <div class="h-[300px] relative"><canvas id="chartStatus"></canvas></div>
      </div>`;
    document.getElementById('chartsGrid2').innerHTML = `
      <div class="bg-surface-container-lowest p-8 rounded-[2.5rem] shadow-ambient">
        <h3 class="text-sm font-headline font-extrabold mb-6 flex items-center gap-2 uppercase tracking-widest text-on-surface-variant/40">
          <span class="material-symbols-outlined text-[18px]">category</span> Tareas por Categoría o Auditoría
        </h3>
        <div class="h-[300px] relative"><canvas id="chartCategory"></canvas></div>
      </div>
      <div class="bg-surface-container-lowest p-8 rounded-[2.5rem] shadow-ambient">
        <h3 class="text-sm font-headline font-extrabold mb-6 flex items-center gap-2 uppercase tracking-widest text-on-surface-variant/40">
          <span class="material-symbols-outlined text-[18px]">timer</span> Desviación de Tareas Atrasadas
        </h3>
        <div class="h-[300px] relative"><canvas id="chartOverdue"></canvas></div>
      </div>`;

    if (byResp?.length > 0) {
      this.charts.resp = new Chart(document.getElementById('chartResp'), {
        type:'bar', data:{labels:byResp.map(r=>r.responsible), datasets:[
          {label:'Completadas',data:byResp.map(r=>r.completed),backgroundColor:'#F15A24'},
          {label:'En Progreso',data:byResp.map(r=>r.in_progress),backgroundColor:'#002D72'},
          {label:'Pendientes',data:byResp.map(r=>r.pending),backgroundColor:'#E3E7ED'},
          {label:'Atrasadas',data:byResp.map(r=>r.overdue),backgroundColor:'#ffdad6'}]},
        options:{responsive:true,maintainAspectRatio:false,
          onClick: (e, els) => { if(els.length>0) app.navigate('tasks', { responsible: byResp[els[0].index].responsible }); },
          plugins:{legend:{position:'bottom',labels:{color:'#002D72',font:{family:'Inter',weight:'700',size:11}}},datalabels:{display:false}},scales:{x:{stacked:true,ticks:{color:'#002D72'},grid:{display:false}},y:{stacked:true,beginAtZero:true,ticks:{stepSize:1,color:'#002D72'},grid:{color:'rgba(0,45,114,0.03)'}}}}
      });
    }
    if (byStatus?.length > 0) {
      this.charts.status = new Chart(document.getElementById('chartStatus'), {
        type:'doughnut', data:{labels:['Pendientes','En Progreso','Completadas','Bloqueadas'],
          datasets:[{data:[byStatus.find(s=>s.status==='Pendiente')?.count||0, byStatus.find(s=>s.status==='En Progreso')?.count||0, byStatus.find(s=>s.status==='Completada')?.count||0, byStatus.find(s=>s.status==='Bloqueada')?.count||0],
          backgroundColor:['#E3E7ED','#002D72','#F15A24','#ffdad6'], borderOffset: 10}]},
        options:{responsive:true,maintainAspectRatio:false, cutout:'75%',
          onClick: (e, els) => { if(els.length>0) app.navigate('tasks', { status: ['Pendiente','En Progreso','Completada','Bloqueada'][els[0].index] }); },
          plugins:{legend:{position:'bottom',labels:{color:'#002D72',font:{family:'Inter',weight:'700',size:11}}},datalabels:{color:'#002D72',font:{weight:'bold',size:13},formatter:v=>v>0?v:''}}}
      });
    }
    if (byCategory?.length > 0) {
      this.charts.category = new Chart(document.getElementById('chartCategory'), {
        type:'bar', data:{labels:byCategory.map(s=>s.category || 'Sin Categoría'), datasets:[
          {label:'En Progreso',data:byCategory.map(s=>s.in_progress),backgroundColor:'#002D72'},
          {label:'Pendientes',data:byCategory.map(s=>s.pending),backgroundColor:'#e1e2e1'},
          {label:'Atrasadas',data:byCategory.map(s=>s.overdue),backgroundColor:'#ba1a1a'}]},
        options:{responsive:true,maintainAspectRatio:false,indexAxis:'y',
          onClick: (e, els) => { if(els.length>0) app.navigate('tasks', { category: byCategory[els[0].index].category || '__empty__' }); },
          plugins:{legend:{position:'bottom',labels:{color:'#404752',font:{size:11}}},datalabels:{display:false}},scales:{x:{stacked:true,beginAtZero:true,ticks:{color:'#717783'},grid:{color:'#efeeed'}},y:{stacked:true,ticks:{color:'#717783'},grid:{color:'#efeeed'}}}}
      });
    }
    if (overdueDev?.length > 0) {
      this.charts.overdue = new Chart(document.getElementById('chartOverdue'), {
        type:'bar', data:{labels:overdueDev.map(s=>s.category), datasets:[
          {label:'Tareas Atrasadas',data:overdueDev.map(s=>s.count),backgroundColor:'#ba1a1a',borderRadius:4}
        ]},
        options:{responsive:true,maintainAspectRatio:false,
          onClick: (e, els) => { if(els.length>0) app.navigate('tasks', { overdue: '1' }); },
          plugins:{legend:{display:false},datalabels:{display:false}},scales:{x:{beginAtZero:true,ticks:{color:'#717783'},grid:{display:false}},y:{beginAtZero:true,ticks:{stepSize:1,color:'#717783'},grid:{color:'#efeeed'}}}}
      });
    }
  },

  // ── Audits List ──
  async renderAudits() {
    await this.loadAllAudits();
    const isReadonly = this.user?.role === 'observador';
    if (!isReadonly) document.getElementById('headerActions').innerHTML = `<button class="btn btn-primary" onclick="app.showAuditModal()">+ Nueva Auditoría</button>`;
    const body = document.getElementById('pageBody');
    const active = this.audits.filter(a => a.status !== 'Cerrada');
    const closed = this.audits.filter(a => a.status === 'Cerrada');
    if (this.audits.length === 0) {
      body.innerHTML = `<div class="empty-state"><div class="empty-icon">📋</div><h3>Sin auditorías</h3></div>`; return;
    }
    let html = this.renderAuditCards(active, 'Activas');
    if (closed.length > 0) html += `<details class="archive-section"><summary>📦 Archivo (${closed.length} cerradas)</summary>${this.renderAuditCards(closed, '')}</details>`;
    body.innerHTML = html;
  },

  renderAuditCards(list, title) {
    if (list.length === 0) return '';
    let html = title ? `<h3 class="text-xs font-headline font-bold uppercase tracking-widest text-on-surface-variant/40 mb-6 mt-10">${title}</h3>` : '';
    html += `<div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">${list.map(a => {
      const pct = a.progress_pct !== undefined ? Math.round(a.progress_pct) : (a.task_total > 0 ? Math.round(a.task_done / a.task_total * 100) : 0);
      const areaBadge = a.responsible_area ? `<span class="text-[9px] uppercase font-bold tracking-widest text-primary-container bg-primary-container/10 px-2.5 py-1 rounded-lg">${a.responsible_area}</span>` : '';
      const typeBadge = a.audit_type ? `<span class="text-[9px] uppercase font-bold tracking-widest text-primary bg-primary/10 px-2.5 py-1 rounded-lg">${a.audit_type}</span>` : '';
      const auditorsList = a.auditors || [];
      const avatarsHTML = auditorsList.map(auditor => {
        const initials = auditor ? auditor.split(' ').map(n=>n[0]).join('').substring(0,2).toUpperCase() : '?';
        return `<div class="w-6 h-6 rounded-full bg-primary-container border border-white flex items-center justify-center text-[9px] font-extrabold text-white -ml-2 first:ml-0 shadow-sm" title="${auditor}">${initials}</div>`;
      }).join('');

      return `<div class="bg-surface-container-lowest p-6 rounded-[2rem] shadow-ambient cursor-pointer transition-all hover:scale-[1.01] flex flex-col gap-4 group" onclick="app.openAuditDetail('${a.id}')">
        <div class="flex justify-between items-start">
          <div class="w-12 h-12 rounded-2xl bg-surface-container-low flex items-center justify-center text-primary group-hover:bg-primary group-hover:text-white transition-colors">
            <span class="material-symbols-outlined">assignment</span>
          </div>
          ${this.statusBadge(a.status)}
        </div>
        <div>
          <h4 class="text-lg font-headline font-extrabold text-on-surface leading-tight mb-1">${a.name}</h4>
          <div class="flex gap-2 mb-2 flex-wrap">${areaBadge}${typeBadge}</div>
          <p class="text-sm font-medium text-on-surface-variant/60 line-clamp-2">${a.description || 'Sin descripción'}</p>
        </div>
        <div class="mt-2 space-y-3">
          <div class="flex justify-between text-[11px] font-bold uppercase tracking-widest text-on-surface-variant/40">
            <span>Progreso</span>
            <span>${pct}%</span>
          </div>
          <div class="h-1.5 w-full bg-surface-container-low rounded-full overflow-hidden">
            <div class="h-full bg-primary transition-all duration-500" style="width:${pct}%"></div>
          </div>
          <div class="flex justify-between items-end pt-2">
            <div class="flex gap-4">
              <div class="flex flex-col">
                <span class="text-xl font-headline font-extrabold text-on-surface">${a.task_done}</span>
                <span class="text-[9px] font-bold uppercase tracking-widest text-on-surface-variant/40">Completadas</span>
              </div>
              <div class="flex flex-col">
                <span class="text-xl font-headline font-extrabold ${a.task_overdue > 0 ? 'text-error' : 'text-on-surface'}">${a.task_overdue}</span>
                <span class="text-[9px] font-bold uppercase tracking-widest text-on-surface-variant/40">Atrasadas</span>
              </div>
            </div>
            <div class="flex items-center ml-2 border-l border-outline-variant/40 pl-3">
              <div class="flex -space-x-1.5 overflow-hidden mr-2">
                ${avatarsHTML}
              </div>
              <span class="text-[9px] font-bold text-primary-navy/60 truncate max-w-[80px]" title="${auditorsList.join(', ')}">${auditorsList.join(', ') || 'Sin asignar'}</span>
            </div>
          </div>
        </div>
      </div>`;
    }).join('')}</div>`;
    return html;
  },

  async showAuditModal(audit = null) {
    await Promise.all([this.loadAuditors(), this.loadPlans(), this.loadAreas(), this.loadTemplates()]);
    const isEdit = !!audit;
    this.currentAuditStatus = audit?.status || 'Planificación';
    this.openModal(isEdit ? 'Editar Auditoría' : 'Nueva Auditoría', `
      <div class="space-y-6">
        <div class="space-y-2">
          <label class="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant/60 ml-1">Nombre de la Auditoría *</label>
          <input class="w-full bg-surface-variant border-none rounded-2xl p-4 text-sm font-medium focus:ring-2 focus:ring-primary transition-all text-on-surface" id="aName" placeholder="Ej: Auditoría Financiera 2026" value="${audit?.name||''}">
        </div>
        <div class="space-y-2">
          <label class="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant/60 ml-1">Descripción General</label>
          <textarea class="w-full bg-surface-variant border-none rounded-2xl p-4 text-sm font-medium focus:ring-2 focus:ring-primary transition-all min-h-[100px] text-on-surface" id="aDesc" placeholder="Objetivos y alcance...">${audit?.description||''}</textarea>
        </div>
        <div class="grid grid-cols-1 gap-6">
          <div class="space-y-2">
            <label class="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant/60 ml-1">Fecha de Inicio</label>
            <input type="date" class="w-full bg-surface-variant border-none rounded-2xl p-4 text-sm font-bold focus:ring-2 focus:ring-primary text-on-surface" id="aStart" value="${audit?.start_date||''}">
          </div>
        </div>
        
        <div class="space-y-2">
          <label class="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant/60 ml-1">Auditores Asignados</label>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-surface-variant p-4 rounded-2xl max-h-40 overflow-y-auto kanban-scrollbar">
            ${this.auditors.map(a => {
              const isChecked = audit?.auditors?.includes(a.name) || false;
              return `
                <label class="flex items-center gap-2.5 p-2 rounded-xl hover:bg-surface-container-highest/20 cursor-pointer transition-colors">
                  <input type="checkbox" name="auditAuditors" value="${a.name}" ${isChecked ? 'checked' : ''} class="rounded text-primary focus:ring-primary border border-on-surface-variant/30 bg-white w-4 h-4">
                  <span class="text-xs font-semibold text-on-surface">${a.name}</span>
                </label>
              `;
            }).join('')}
          </div>
        </div>

        <div class="grid grid-cols-2 gap-6">
          <div class="space-y-2">
            <label class="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant/60 ml-1">Área Responsable</label>
            <div class="grid grid-cols-1 gap-3 bg-surface-variant p-4 rounded-2xl max-h-40 overflow-y-auto kanban-scrollbar">
              ${this.areas.map(area => {
                const isSelected = audit && audit.responsible_area ? (Array.isArray(audit.responsible_area) ? audit.responsible_area.includes(area.name) : (audit.responsible_area.includes(area.name))) : false;
                return `
                  <label class="flex items-center gap-2.5 p-2 rounded-xl hover:bg-surface-container-highest/20 cursor-pointer transition-colors">
                    <input type="checkbox" name="aAreas" value="${area.name}" ${isSelected ? 'checked' : ''} class="rounded text-primary focus:ring-primary border border-on-surface-variant/30 bg-white w-4 h-4">
                    <span class="text-xs font-semibold text-on-surface">${area.name}</span>
                  </label>
                `;
              }).join('')}
            </div>
          </div>
          <div class="space-y-2">
            <label class="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant/60 ml-1">Tipo de Participación</label>
            <select class="w-full bg-surface-variant border-none rounded-2xl p-4 text-sm font-bold focus:ring-2 focus:ring-primary appearance-none cursor-pointer text-on-surface" id="aType">
              <option value="">— Seleccionar —</option>
              ${['Integral', 'Particular'].map(type => `<option ${audit?.audit_type===type?'selected':''}>${type}</option>`).join('')}
            </select>
          </div>
        </div>

        <div class="${!isEdit ? 'grid grid-cols-1 sm:grid-cols-2 gap-6' : ''}">
          <div class="space-y-2">
            <label class="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant/60 ml-1">Plan de Trabajo</label>
            <select class="w-full bg-surface-variant border-none rounded-2xl p-4 text-sm font-bold focus:ring-2 focus:ring-primary appearance-none cursor-pointer text-on-surface" id="aPlan">
              <option value="">— Sin plan asociado —</option>
              ${this.plans.map(p=>`<option value="${p.id}" ${audit?.plan_id===p.id?'selected':''}>${p.name} (${p.year})</option>`).join('')}
            </select>
          </div>
          ${!isEdit ? `
          <div class="space-y-2">
            <label class="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant/60 ml-1">Plantilla de Seguimiento</label>
            <select class="w-full bg-surface-variant border-none rounded-2xl p-4 text-sm font-bold focus:ring-2 focus:ring-primary appearance-none cursor-pointer text-on-surface" id="aTemplate">
              <option value="">— Sin plantilla (Vacía) —</option>
              ${this.templates.map(t => `<option value="${t.id}">${t.name}</option>`).join('')}
            </select>
          </div>
          ` : ''}
        </div>
      </div>`,
      `<button class="bg-surface-container-highest/20 text-on-surface-variant font-bold px-6 py-3 rounded-2xl text-sm transition-all hover:bg-surface-container-highest/40" onclick="app.closeModal()">Cerrar</button>
       <button class="bg-primary text-white font-bold px-10 py-3 rounded-2xl text-sm shadow-ambient transition-all hover:opacity-90 active:scale-95" onclick="app.saveAudit('${audit?.id||''}')">${isEdit?'Sincronizar Datos':'Crear Auditoría'}</button>`);
  },

  async saveAudit(id) {
    const checkedAuditors = Array.from(document.querySelectorAll('input[name="auditAuditors"]:checked')).map(el => el.value);
    const selectedAreas = Array.from(document.querySelectorAll('input[name="aAreas"]:checked')).map(el => el.value);
    const d = { 
      name: document.getElementById('aName').value.trim(), 
      description: document.getElementById('aDesc').value,
      start_date: document.getElementById('aStart').value, 
      end_date: document.getElementById('aEnd')?.value || '',
      responsible: checkedAuditors.length > 0 ? checkedAuditors[0] : '',
      status: id ? this.currentAuditStatus : 'Planificación',
      plan_id: document.getElementById('aPlan').value || null,
      auditors: checkedAuditors,
      responsible_area: selectedAreas,
      audit_type: document.getElementById('aType').value
    };
    if (!d.name) return this.toast('Nombre requerido', 'error');
    const templateId = !id ? document.getElementById('aTemplate')?.value : null;
    const r = id ? await this.put(`/api/audits/${id}`, d) : await this.post('/api/audits', d);
    if (r?.status === 'success' || r?.id) {
      if (!id && templateId) {
        const auditId = r.id;
        await this.post(`/api/audits/${auditId}/apply-template/${templateId}`);
      }
      this.toast(id?'Actualizada':'Creada');
      this.closeModal();
      this.renderAudits();
    }
    else this.toast('Error', 'error');
  },

  async closeAudit(aid) {
    if (!confirm('¿Estás seguro de que deseas cerrar esta auditoría? Se archivará en la sección correspondiente.')) return;
    const audit = await this.get(`/api/audits/${aid}`);
    if (!audit || audit.error) return this.toast('Error al obtener datos', 'error');
    
    const d = {
      name: audit.name,
      description: audit.description,
      start_date: audit.start_date,
      end_date: audit.end_date,
      responsible: audit.responsible,
      plan_id: audit.plan_id,
      auditors: audit.auditors,
      responsible_area: audit.responsible_area,
      audit_type: audit.audit_type,
      status: 'Cerrada'
    };
    const r = await this.put(`/api/audits/${aid}`, d);
    if (r?.status === 'success') {
      this.toast('Auditoría cerrada y archivada');
      this.openAuditDetail(aid);
    } else {
      this.toast('Error', 'error');
    }
  },

  async reopenAudit(aid) {
    if (!confirm('¿Deseas reabrir esta auditoría? El estado volverá a calcularse dinámicamente según sus tareas.')) return;
    const audit = await this.get(`/api/audits/${aid}`);
    if (!audit || audit.error) return this.toast('Error al obtener datos', 'error');
    
    const d = {
      name: audit.name,
      description: audit.description,
      start_date: audit.start_date,
      end_date: audit.end_date,
      responsible: audit.responsible,
      plan_id: audit.plan_id,
      auditors: audit.auditors,
      responsible_area: audit.responsible_area,
      audit_type: audit.audit_type,
      status: 'Planificación'
    };
    const r = await this.put(`/api/audits/${aid}`, d);
    if (r?.status === 'success') {
      this.toast('Auditoría reabierta con éxito');
      this.openAuditDetail(aid);
    } else {
      this.toast('Error', 'error');
    }
  },

  // ── Audit Detail (Fluent Design with Sidebar & Attachments) ──
  async openAuditDetail(id) {
    this.currentAuditId = id;
    const a = await this.get(`/api/audits/${id}`);
    if (!a || a.error) return this.toast('Error', 'error');
    await this.loadAuditors();
    const isReadonly = this.user?.role === 'observador';
    const body = document.getElementById('pageBody');
    document.getElementById('pageTitle').textContent = a.name;
    document.getElementById('pageSubtitle').textContent = `Estado: ${a.status} | Avance Real: ${a.progress_pct || 0}%`;
    const allStages = a.stages || [];

    const closeBtn = a.status === 'Cerrada'
      ? `<button class="btn bg-green-700 text-white hover:bg-green-800 btn-sm flex items-center gap-1" onclick="app.reopenAudit('${a.id}')"><span class="material-symbols-outlined text-[16px]">lock_open</span> Reabrir</button>`
      : `<button class="btn bg-amber-600 text-white hover:bg-amber-700 btn-sm flex items-center gap-1" onclick="app.closeAudit('${a.id}')"><span class="material-symbols-outlined text-[16px]">lock</span> Cerrar</button>`;

    const acts = isReadonly ? '' : `<div class="flex items-center gap-2">
      <button class="btn btn-secondary btn-sm" onclick="app.showAuditModal(${JSON.stringify(a).replace(/"/g,'&quot;')})">✏️ Editar</button>
      <button class="btn btn-primary btn-sm" onclick="app.showTaskModal('${a.id}')">+ Tarea</button>
      ${closeBtn}
      <button class="btn btn-danger btn-sm" onclick="app.confirmDeleteAudit('${a.id}')">🗑️</button></div>`;
    document.getElementById('headerActions').innerHTML = acts;

    const colHeaders = `<thead><tr><th style="width:40px">☑</th><th>Tarea</th><th>Responsable</th><th style="width:110px">Vencimiento</th><th style="width:140px">Estado</th><th style="width:130px">Prioridad</th>${isReadonly?'':'<th style="width:100px">Acciones</th>'}</tr></thead>`;

    const allTasks = a.tasks || [];
    const done = allTasks.filter(t => t.status === 'Completada').length;
    const totalWeight = allTasks.reduce((sum, t) => sum + (t.weight || 0), 0);
    const doneWeight = allTasks.filter(t => t.status === 'Completada').reduce((sum, t) => sum + (t.weight || 0), 0);
    
    let pct = 0;
    if (allTasks.length > 0) {
      if (totalWeight > 0.1) {
        pct = totalWeight > 0 ? Math.round((doneWeight / totalWeight) * 100) : 0;
      } else {
        pct = Math.round((done / allTasks.length) * 100);
      }
    }

    let tasksHtml = `<div class="mb-8 bg-surface-container-lowest p-6 rounded-2xl border border-outline-variant/60">
      <div class="flex flex-col gap-2 mb-4">
        <div class="flex justify-between items-center">
          <div class="flex items-center gap-3">
            <h4 class="font-headline font-extrabold text-on-surface text-sm flex items-center gap-2">📂 Tareas de la Auditoría</h4>
            ${!isReadonly && a.template_id ? `<button onclick="app.restoreTemplateTasks('${a.id}')" class="px-2 py-0.5 rounded-lg bg-surface-container-high border border-outline-variant text-[10px] font-bold text-on-surface hover:bg-primary/10 hover:text-primary transition-colors flex items-center gap-1 shadow-sm" title="Si faltan tareas de la plantilla, esta opción las volverá a agregar recuperando su avance y porcentaje"><span class="material-symbols-outlined text-[13px]">settings_backup_restore</span> Restaurar tareas</button>` : ''}
          </div>
          <div class="flex items-center gap-3">
            <span class="text-[10px] font-bold uppercase tracking-widest text-primary">${pct}% Completado</span>
            <span class="bg-surface-container-low px-2 py-0.5 rounded-full text-[9px] font-bold text-white/80">${done}/${allTasks.length} tareas</span>
          </div>
        </div>
        <div class="h-1.5 w-full bg-surface-variant rounded-full overflow-hidden">
          <div class="h-full bg-primary transition-all duration-500" style="width:${pct}%"></div>
        </div>
      </div>
      <div class="table-wrapper"><table class="task-table resizable-table">${colHeaders}<tbody>`;
      
    if (allTasks.length === 0) tasksHtml += `<tr><td colspan="8" style="text-align:center;padding:16px;color:var(--text-muted)">Sin tareas</td></tr>`;
    allTasks.forEach((t, i) => { if (!isReadonly) tasksHtml += this.renderInsertBtn(a.id, '', i); tasksHtml += this.renderTaskRow(t, isReadonly, a.id, []); });
    if (!isReadonly) tasksHtml += this.renderInsertBtn(a.id, '', allTasks.length);
    tasksHtml += `</tbody></table></div></div>`;

    if ((a.deviations||[]).length > 0) {
      tasksHtml += `<h3 class="font-semibold text-on-surface mb-3 mt-6 text-sm">⚠️ Desviaciones</h3><div class="deviation-list">`;
      a.deviations.forEach(d => {
        tasksHtml += `<div class="deviation-item flex flex-col gap-1" onclick="app.showDeviationModal(${JSON.stringify(d).replace(/"/g,'&quot;')},'${a.id}')">
          <div class="flex-between"><strong class="text-sm">${d.title}</strong>${this.severityBadge(d.severity)}</div>
          <div class="text-[13px] text-on-surface-variant truncate">${d.description||'Sin descripción'}</div></div>`;
      });
      tasksHtml += `</div>`;
    }

    body.innerHTML = `
      <div class="flex flex-col lg:flex-row gap-6 h-full items-start">
        <div class="flex-1 min-w-0 w-full flex flex-col gap-6">
          <div class="bg-surface-container-lowest p-5 rounded-2xl border border-surface-container shadow-sm">
            <h3 class="font-semibold text-on-surface mb-2 text-sm">Descripción</h3>
            <p class="text-on-surface-variant text-[13px] whitespace-pre-wrap leading-relaxed">${a.description || 'Sin descripción detallada. Haz clic en Editar para agregar una.'}</p>
          </div>
          <div class="bg-surface-container-lowest p-1 md:p-5 rounded-2xl border border-transparent md:border-surface-container shadow-none md:shadow-sm overflow-x-auto w-full">
            <div class="mb-6 px-2 md:px-0">
              <div class="flex justify-between items-end mb-2">
                <h3 class="font-semibold text-on-surface text-sm">Checklist de Tareas</h3>
                <div class="flex flex-col items-end gap-1">
                  <span class="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant/60">Avance Real</span>
                  <span class="text-sm font-bold text-primary">${a.progress_pct || 0}%</span>
                </div>
              </div>
              <div class="h-2 w-full bg-surface-container-high rounded-full overflow-hidden">
                <div class="h-full bg-primary transition-all duration-500 shadow-ambient" style="width:${a.progress_pct || 0}%"></div>
              </div>
            </div>
            ${tasksHtml}
          </div>
        </div>
        
        <aside class="w-full lg:w-80 shrink-0 flex flex-col gap-6">
          <div class="bg-surface-container-lowest p-5 rounded-2xl border border-surface-container shadow-sm flex flex-col gap-4">
            <div><label class="block text-[10px] font-bold text-on-surface-variant uppercase tracking-wider mb-1.5">Estado</label>${this.statusBadge(a.status)}</div>
            <div>
              <div class="flex justify-between text-[10px] font-bold uppercase tracking-widest text-on-surface-variant/60 mb-1.5">
                <span>Avance Real</span>
                <span>${a.progress_pct || 0}%</span>
              </div>
              <div class="h-1.5 w-full bg-surface-container-low rounded-full overflow-hidden">
                <div class="h-full bg-primary transition-all duration-500" style="width:${a.progress_pct || 0}%"></div>
              </div>
            </div>
            <div class="grid grid-cols-2 gap-4 py-3 border-t border-b border-surface-container/60 my-1">
               <div><label class="block text-[10px] font-bold text-on-surface-variant uppercase tracking-wider mb-1">Área Resp.</label><span class="text-xs font-bold text-primary-container bg-primary-container/10 px-2 py-0.5 rounded-lg inline-block">${a.responsible_area || '—'}</span></div>
               <div><label class="block text-[10px] font-bold text-on-surface-variant uppercase tracking-wider mb-1">Tipo Part.</label><span class="text-xs font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-lg inline-block">${a.audit_type || '—'}</span></div>
            </div>
            <div>
              <label class="block text-[10px] font-bold text-on-surface-variant uppercase tracking-wider mb-2">Equipo / Auditores</label>
              <div class="flex flex-col gap-2 max-h-40 overflow-y-auto kanban-scrollbar">
                ${(a.auditors || []).map(auditor => {
                  const initials = auditor ? auditor.split(' ').map(n=>n[0]).join('').substring(0,2).toUpperCase() : '?';
                  return `
                    <div class="flex items-center gap-2 bg-surface-container-low p-2 rounded-xl border border-outline-variant/10 shadow-sm">
                      <div class="w-7 h-7 rounded-full bg-primary/20 text-primary flex items-center justify-center text-[10px] font-bold">${initials}</div>
                      <span class="text-xs font-semibold text-white/90">${auditor}</span>
                    </div>
                  `;
                }).join('') || '<span class="text-xs font-medium text-on-surface-variant/60">— Sin asignar —</span>'}
              </div>
            </div>
            <div class="grid grid-cols-2 gap-4 pt-4 border-t border-surface-container">
               <div><label class="block text-[10px] font-bold text-on-surface-variant uppercase tracking-wider mb-1">Inicio</label><span class="text-[13px] font-medium text-on-surface">${this.fmtDate(a.start_date)}</span></div>
               <div><label class="block text-[10px] font-bold text-on-surface-variant uppercase tracking-wider mb-1">Vencimiento</label><span class="text-[13px] font-medium ${this.isOverdue(a.end_date)?'text-error':'text-on-surface'}">${this.fmtDate(a.end_date)}</span></div>
            </div>
          </div>
          
          <div class="bg-surface-container-lowest p-5 rounded-2xl border border-surface-container shadow-sm">
            <div class="flex items-center justify-between mb-4">
              <h3 class="font-semibold text-on-surface text-sm flex items-center gap-2"><span class="material-symbols-outlined text-[18px]">attach_file</span> Adjuntos</h3>
              <button class="btn-icon" onclick="app.toast('Sube un archivo','info')" title="Subir nuevo"><span class="material-symbols-outlined text-[18px]">upload</span></button>
            </div>
            <div class="flex flex-col gap-2">
              <div class="flex items-center gap-3 p-2 rounded-lg hover:bg-surface-container-low transition-colors cursor-pointer border border-transparent hover:border-surface-container group">
                <div class="w-8 h-8 rounded bg-red-100 text-red-600 flex items-center justify-center shrink-0"><span class="material-symbols-outlined text-[16px]">picture_as_pdf</span></div>
                <div class="min-w-0 flex-1"><p class="text-[13px] font-medium text-on-surface truncate group-hover:text-primary transition-colors">Informe_Preliminar.pdf</p><p class="text-[11px] text-on-surface-variant">Hace 2 horas</p></div>
              </div>
              <div class="flex items-center gap-3 p-2 rounded-lg hover:bg-surface-container-low transition-colors cursor-pointer border border-transparent hover:border-surface-container group">
                <div class="w-8 h-8 rounded bg-green-100 text-green-700 flex items-center justify-center shrink-0"><span class="material-symbols-outlined text-[16px]">table_chart</span></div>
                <div class="min-w-0 flex-1"><p class="text-[13px] font-medium text-on-surface truncate group-hover:text-primary transition-colors">Matriz_Riesgos_2026.xlsx</p><p class="text-[11px] text-on-surface-variant">Ayer · 850 KB</p></div>
              </div>
              <button class="w-full mt-2 py-2.5 border-2 border-dashed border-outline-variant/60 rounded-xl text-xs font-semibold text-on-surface-variant hover:border-primary hover:text-primary hover:bg-primary/5 transition-all flex items-center justify-center gap-2" onclick="app.toast('Subida simulada')">
                <span class="material-symbols-outlined text-[16px]">add</span> Añadir archivo
              </button>
            </div>
          </div>
        </aside>
      </div>`;
    this.initResizableColumns();
  },

  async deleteStage(sid, aid) {
    if (!confirm('¿Eliminar esta etapa?')) return;
    await this.del(`/api/stages/${sid}`); this.toast('Etapa eliminada'); this.openAuditDetail(aid);
  },
  async confirmDeleteAudit(id) {
    if (!confirm('¿Eliminar esta auditoría?')) return;
    await this.del(`/api/audits/${id}`); this.toast('Eliminada'); this.navigate('audits');
  },
  showAddStageModal(aid) {
    this.openModal('Nueva Etapa', `<div class="form-group"><label class="form-label">Nombre</label><input class="form-input" id="stageName"></div>`,
      `<button class="btn btn-secondary" onclick="app.closeModal()">Cancelar</button>
       <button class="btn btn-primary" onclick="app.saveStage('${aid}')">Crear</button>`);
  },
  async saveStage(aid) {
    const name = document.getElementById('stageName').value.trim();
    if (!name) return this.toast('Requerido', 'error');
    await this.post(`/api/audits/${aid}/stages`, { name }); this.toast('Etapa creada'); this.closeModal(); this.openAuditDetail(aid);
  },

  // ── Resizable Columns ──
  initResizableColumns() {
    document.querySelectorAll('.resizable-table th').forEach(th => {
      const handle = document.createElement('div');
      handle.className = 'col-resize-handle';
      th.style.position = 'relative';
      th.appendChild(handle);
      let startX, startW;
      handle.addEventListener('mousedown', e => {
        startX = e.pageX; startW = th.offsetWidth;
        const move = ev => { th.style.width = Math.max(40, startW + ev.pageX - startX) + 'px'; };
        const up = () => { document.removeEventListener('mousemove', move); document.removeEventListener('mouseup', up); };
        document.addEventListener('mousemove', move);
        document.addEventListener('mouseup', up);
        e.preventDefault();
      });
    });
  },

  // Init
  async init() {
    const saved = localStorage.getItem('wdt_user');
    if (saved) {
        // Try to validate session
        const r = await this.get('/api/me');
        if (r && r.username) {
            this.user = r;
            localStorage.setItem('wdt_user', JSON.stringify(r));
            this.showApp();
        } else {
            this.logout();
        }
    }
  }
};

document.addEventListener('DOMContentLoaded', () => app.init());
