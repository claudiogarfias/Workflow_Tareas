// ═══════════════════════════════════════════════════════════════
// WORKFLOW DE TAREAS v2 — Views Module
// ═══════════════════════════════════════════════════════════════

// ── Task Modal (for full create/edit) ──
app.showTaskModal = function(auditId, task = null) {
  const isEdit = !!task;
  Promise.all([this.loadAuditors(), this.get('/api/categories')]).then(([_, categories]) => {
    const cats = categories || [];
    this.openModal(isEdit ? 'Editar Tarea' : 'Nueva Tarea', `
      <div class="space-y-6">
        <div class="space-y-2">
          <label class="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant/60 ml-1">Identificación</label>
          <input class="w-full bg-surface-container-low border-none rounded-2xl p-4 text-sm font-medium focus:ring-2 focus:ring-primary transition-all" id="tName" placeholder="Nombre de la tarea" value="${task?.name||''}">
        </div>
        <div class="space-y-2">
          <label class="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant/60 ml-1">Contexto / Instrucciones</label>
          <textarea class="w-full bg-surface-container-low border-none rounded-2xl p-4 text-sm font-medium focus:ring-2 focus:ring-primary transition-all min-h-[100px]" id="tDesc" placeholder="Detalles adicionales...">${task?.description||''}</textarea>
        </div>
        <div class="grid grid-cols-1 gap-6">
          <div class="space-y-2">
            <label class="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant/60 ml-1">Responsable</label>
            <select class="w-full bg-surface-container-low border-none rounded-2xl p-4 text-sm font-bold focus:ring-2 focus:ring-primary appearance-none cursor-pointer" id="tResp">
              <option value="">— Seleccionar —</option>
              ${this.auditors.map(a=>`<option ${task?.responsible===a.name?'selected':''}>${a.name}</option>`).join('')}
            </select>
          </div>
        </div>
        <div class="grid grid-cols-1 gap-6">
          <div class="space-y-2">
            <label class="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant/60 ml-1">Vencimiento</label>
            <input type="date" class="w-full bg-surface-container-low border-none rounded-2xl p-4 text-sm font-bold focus:ring-2 focus:ring-primary" id="tDue" value="${task?.due_date||''}">
          </div>
        </div>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div class="space-y-2">
            <label class="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant/40 ml-1">Nivel de Riesgo</label>
            <select class="w-full bg-surface-container-low border-none rounded-2xl p-4 text-sm font-bold focus:ring-2 focus:ring-primary appearance-none cursor-pointer" id="tPri">
              ${['Alta','Media','Baja'].map(p=>`<option ${(task?.priority||'Media')===p?'selected':''}>${p}</option>`).join('')}
            </select>
          </div>
          <div class="space-y-2">
            <label class="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant/40 ml-1">Etapa Actual</label>
            <select class="w-full bg-surface-container-low border-none rounded-2xl p-4 text-sm font-bold focus:ring-2 focus:ring-primary appearance-none cursor-pointer" id="tStatus">
              ${['Pendiente','En Progreso','Completada','Bloqueada'].map(s=>`<option ${(task?.status||'Pendiente')===s?'selected':''}>${s}</option>`).join('')}
            </select>
          </div>
        </div>
        ${!auditId ? `
        <div class="space-y-2">
          <label class="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant/40 ml-1">Categoría</label>
          <select class="w-full bg-surface-container-low border-none rounded-2xl p-4 text-sm font-bold focus:ring-2 focus:ring-primary appearance-none cursor-pointer" id="tCat">
            <option value="">— Sin categoría —</option>
            ${cats.map(c=>`<option ${task?.category===c.name?'selected':''}>${c.name}</option>`).join('')}
          </select>
        </div>` : ''}
      </div>`,
      `<button class="bg-surface-container-highest/20 text-on-surface-variant font-bold px-6 py-3 rounded-2xl text-sm transition-all hover:bg-surface-container-highest/40" onclick="app.closeModal()">Descartar</button>
       <button class="bg-primary text-white font-bold px-10 py-3 rounded-2xl text-sm shadow-ambient transition-all hover:opacity-90 active:scale-95" onclick="app.saveTask('${task?.id||''}','${auditId||task?.audit_id||''}')">${isEdit?'Sincronizar Cambios':'Propagar Tarea'}</button>`);
  });
};

app.showEditTaskModal = async function(tid) {
  const task = await this.get(`/api/tasks/${tid}`);
  if (task && !task.error) this.showTaskModal(task.audit_id, task);
};

app.saveTask = async function(tid, auditId) {
  const d = {
    audit_id: auditId || null, name: document.getElementById('tName').value.trim(),
    description: document.getElementById('tDesc').value, responsible: document.getElementById('tResp').value,
    start_date: '', due_date: document.getElementById('tDue').value,
    priority: document.getElementById('tPri').value, status: document.getElementById('tStatus').value,
    category: document.getElementById('tCat')?.value || ''
  };
  if (!d.name) return this.toast('Nombre requerido', 'error');
  const r = tid ? await this.put(`/api/tasks/${tid}`, d) : await this.post('/api/tasks', d);
  if (r?.status === 'success') { this.toast(tid?'Actualizada':'Creada'); this.closeModal();
    if (auditId) this.openAuditDetail(auditId); else this.loadTasksView(); }
  else this.toast('Error', 'error');
};

// ── Tasks View ──
app.taskViewMode = 'kanban';

app.renderTasks = async function() {
  await Promise.all([this.loadAudits(), this.loadAuditors()]);
  const body = document.getElementById('pageBody');
  const params = this.navParams || {};
  
  document.getElementById('headerActions').innerHTML = `
    <div class="hidden md:flex items-center bg-surface-container-low rounded-lg p-1 mr-4">
      <button onclick="app.taskViewMode='kanban';app.renderTasks()" class="px-3 py-1.5 rounded-md text-sm font-medium ${app.taskViewMode==='kanban'?'bg-white text-primary shadow-sm':'text-on-surface-variant hover:text-primary'} flex items-center gap-1.5 transition-all"><span class="material-symbols-outlined text-sm">grid_view</span> Kanban</button>
      <button onclick="app.taskViewMode='list';app.renderTasks()" class="px-3 py-1.5 rounded-md text-sm font-medium ${app.taskViewMode==='list'?'bg-white text-primary shadow-sm':'text-on-surface-variant hover:text-primary'} flex items-center gap-1.5 transition-all"><span class="material-symbols-outlined text-sm">list</span> Lista</button>
    </div>
    <button class="btn btn-primary" onclick="app.showStandaloneTaskModal()">
      <span class="material-symbols-outlined text-lg">add</span> Tarea
    </button>`;

  body.innerHTML = `
    <div class="flex items-center gap-6 mb-10 bg-surface-container-low p-5 rounded-[2rem] w-fit">
      <div class="flex flex-col gap-1.5">
        <label class="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant/40 ml-1">Auditoría</label>
        <select id="fAudit" class="bg-surface-container-lowest border-none rounded-xl py-2 px-4 text-sm font-semibold shadow-sm focus:ring-2 focus:ring-primary w-48" onchange="app.loadTasksView()">
          <option value="">Todas</option>
          <option value="standalone">🆓 Solo libres</option>
          ${this.audits.map(a=>`<option value="${a.id}">${a.name}</option>`).join('')}
        </select>
      </div>
      <div class="flex flex-col gap-1.5">
        <label class="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant/40 ml-1">Responsable</label>
        <select id="fResp" class="bg-surface-container-lowest border-none rounded-xl py-2 px-4 text-sm font-semibold shadow-sm focus:ring-2 focus:ring-primary w-48" onchange="app.loadTasksView()">
          <option value="">Todos</option>
          ${this.auditors.map(a=>`<option>${a.name}</option>`).join('')}
        </select>
      </div>
      <div class="flex flex-col gap-1.5 relative" id="statusFilterWrapper">
        <label class="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant/40 ml-1">Estado</label>
        <button type="button" class="bg-surface-container-lowest border-none rounded-xl py-2 px-4 text-sm font-semibold shadow-sm focus:ring-2 focus:ring-primary w-40 text-left flex justify-between items-center" style="color: #002D72 !important;" onclick="document.getElementById('statusDropdown').classList.toggle('hidden'); event.stopPropagation();">
          <span id="fStatusLabel" class="truncate pointer-events-none">Todos</span>
          <span class="text-[10px] pointer-events-none">▼</span>
        </button>
        <div id="statusDropdown" class="hidden absolute top-full left-0 mt-1 w-48 bg-white rounded-xl shadow-lg z-50 p-2 flex flex-col gap-1 border border-gray-200" onclick="event.stopPropagation()">
          ${['Pendiente', 'En Progreso', 'Completada', 'Bloqueada'].map(s => `
            <label class="flex items-center gap-2 p-1.5 hover:bg-gray-100 rounded-lg cursor-pointer transition-colors m-0 text-sm font-semibold">
              <input type="checkbox" class="status-cb w-4 h-4 rounded border-gray-300 focus:ring-[#F15A24] text-[#F15A24]" value="${s}" onchange="app.updateStatusFilter()">
              <span class="select-none" style="color: #002D72 !important;">${s}</span>
            </label>
          `).join('')}
        </div>
      </div>
    </div>
    <div id="tasksList" class="flex-1 w-full relative h-full"></div>`;

  if (!app._statusFilterInit) {
    app._statusFilterInit = true;
    document.addEventListener('click', () => {
      const dd = document.getElementById('statusDropdown');
      if (dd && !dd.classList.contains('hidden')) dd.classList.add('hidden');
    });
    app.updateStatusFilter = function(skipLoad = false) {
      const checked = Array.from(document.querySelectorAll('.status-cb:checked')).map(cb => cb.value);
      
      document.querySelectorAll('.status-cb').forEach(cb => {
         const label = cb.closest('label');
         const span = label.querySelector('span');
         if (cb.checked) {
             label.style.backgroundColor = 'rgba(241, 90, 36, 0.1)';
             span.style.fontWeight = '800';
         } else {
             label.style.backgroundColor = '';
             span.style.fontWeight = '600';
         }
      });

      const label = document.getElementById('fStatusLabel');
      if (checked.length === 0) {
        label.textContent = 'Todos';
        app._statusFilterValues = '';
      } else if (checked.length === 1) {
        label.textContent = checked[0];
        app._statusFilterValues = checked[0];
      } else {
        label.textContent = checked.length + ' seleccionados';
        app._statusFilterValues = checked.join(',');
      }
      if (!skipLoad) app.loadTasksView();
    };
  }

  if (params.status) {
    const statuses = params.status.split(',');
    document.querySelectorAll('.status-cb').forEach(cb => {
      cb.checked = statuses.includes(cb.value);
    });
    app.updateStatusFilter(true);
  } else {
    document.querySelectorAll('.status-cb').forEach(cb => {
      cb.checked = ['Pendiente', 'En Progreso'].includes(cb.value);
    });
    app.updateStatusFilter(true);
  }
  
  if (params.responsible) document.getElementById('fResp').value = params.responsible;
  if (params.audit_id) document.getElementById('fAudit').value = params.audit_id;
  if (params.overdue) {
    document.querySelectorAll('.status-cb').forEach(cb => cb.checked = false);
    app.updateStatusFilter(true);
  }
  this.loadTasksView(params.overdue === '1');
};

app.loadTasksView = async function(overdueOnly = false) {
  let q = '/api/tasks?';
  const a = document.getElementById('fAudit')?.value;
  const r = document.getElementById('fResp')?.value;
  const s = app._statusFilterValues || '';
  const c = this.navParams?.category;
  if (a === 'standalone') q += 'standalone=1&'; else if (a) q += `audit_id=${a}&`;
  if (r) q += `responsible=${encodeURIComponent(r)}&`;
  if (s) q += `status=${encodeURIComponent(s)}&`;
  if (c) q += `category=${encodeURIComponent(c)}&`;
  if (overdueOnly) q += 'overdue=1&';
  
  const tasks = await this.get(q) || [];
  const container = document.getElementById('tasksList');
  if (tasks.length === 0) { container.innerHTML = `<div class="empty-state"><div class="empty-icon">✅</div><h3>Sin tareas</h3></div>`; return; }
  
  if (!this.toggleListGroup) {
    this.toggleListGroup = function(type, id, el, parentId = null) {
      const b = el.nextElementSibling;
      const isHidden = b.classList.toggle('hidden');
      const i = el.querySelector(type === 'user' ? '.expand-icon' : '.expand-icon-sub');
      if (i) i.textContent = isHidden ? 'expand_more' : 'expand_less';
      
      const key = type === 'audit' ? `${parentId}|${id}` : id;
      const set = type === 'user' ? this.openTaskGroups.users : this.openTaskGroups.audits;
      
      if (isHidden) set.delete(key);
      else set.add(key);
    };
  }
  
  const isReadonly = this.user?.role === 'observador';

  this.openTaskGroups = this.openTaskGroups || { users: new Set(), audits: new Set(), initialized: false };

  if (this.taskViewMode === 'list') {
    const colHeaders = `<thead><tr><th style="width:60px" class="pl-4">☑</th><th>Tarea</th><th style="width:130px">Vencimiento</th><th style="width:140px">Estado</th><th style="width:130px">Prioridad</th>${isReadonly?'':'<th style="width:100px">Acciones</th>'}</tr></thead>`;
    
    const grouped = {};
    tasks.forEach(t => {
      const resp = t.responsible || 'Sin Asignar';
      let audit = 'Libre (General)';
      if (t.audit_name) audit = t.audit_name;
      else if (t.category) audit = `[Categoría] ${t.category}`;
      
      if (!grouped[resp]) grouped[resp] = {};
      if (!grouped[resp][audit]) grouped[resp][audit] = [];
      grouped[resp][audit].push(t);
    });

    const sortTasks = (a, b) => {
      if (!a.due_date && !b.due_date) return 0;
      if (!a.due_date) return 1;
      if (!b.due_date) return -1;
      return a.due_date.localeCompare(b.due_date);
    };
    let listHtml = '<div class="flex flex-col gap-8">';
    
    Object.keys(grouped).sort().forEach((resp, idx) => {
      let taskCount = 0;
      Object.keys(grouped[resp]).forEach(a => taskCount += grouped[resp][a].length);
      
      const safeResp = resp.replace(/'/g, "\\'");
      let isOpenUser = this.openTaskGroups.initialized ? this.openTaskGroups.users.has(resp) : (idx === 0);
      if (!this.openTaskGroups.initialized && idx === 0) this.openTaskGroups.users.add(resp);

      listHtml += `<div class="bg-surface-container-lowest border border-outline-variant rounded-[2.5rem] overflow-hidden shadow-sm">
        <div class="bg-surface-container-low px-8 py-5 flex items-center justify-between cursor-pointer hover:bg-surface-container-low/80 transition-colors" onclick="app.toggleListGroup('user', '${safeResp}', this)">
           <div class="flex items-center gap-4">
             <div class="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center font-bold text-primary text-lg">${resp === 'Sin Asignar' ? '?' : resp.split(' ').map(n=>n[0]).join('').substring(0,2).toUpperCase()}</div>
             <h3 class="font-headline font-extrabold text-white text-xl">${resp}</h3>
             <span class="bg-surface-container-highest/50 px-3 py-1 rounded-full text-[10px] font-bold text-white/80 ml-2 uppercase tracking-widest">${taskCount} tareas</span>
           </div>
           <span class="material-symbols-outlined text-white/50 expand-icon text-3xl">${isOpenUser?'expand_less':'expand_more'}</span>
        </div>
        <div class="p-8 flex flex-col gap-6 ${isOpenUser?'':'hidden'}">`;
      Object.keys(grouped[resp]).sort().forEach((audit, aIdx) => {
        const auditTasks = grouped[resp][audit].sort(sortTasks);
        const safeAudit = audit.replace(/'/g, "\\'");
        const auditKey = `${resp}|${audit}`;
        let isOpenAudit = this.openTaskGroups.initialized ? this.openTaskGroups.audits.has(auditKey) : true;
        if (!this.openTaskGroups.initialized) this.openTaskGroups.audits.add(auditKey);

        listHtml += `<div class="bg-surface-variant/20 rounded-2xl border border-outline-variant/50 overflow-hidden mb-4">
          <div class="px-5 py-3 flex items-center justify-between cursor-pointer hover:bg-surface-variant/40 transition-colors" onclick="app.toggleListGroup('audit', '${safeAudit}', this, '${safeResp}')">
            <h4 class="font-bold text-sm text-on-surface flex items-center gap-2">
              <span class="material-symbols-outlined text-primary text-[18px]">folder</span> ${audit} 
              <span class="bg-surface-container-high px-2 py-0.5 rounded-full text-[9px] font-bold text-on-surface-variant ml-2">${auditTasks.length} tareas</span>
            </h4>
            <span class="material-symbols-outlined text-on-surface-variant/50 expand-icon-sub">${isOpenAudit?'expand_less':'expand_more'}</span>
          </div>
          <div class="table-wrapper ${isOpenAudit?'':'hidden'}"><table class="task-table resizable-table w-full border-t border-outline-variant/30">${colHeaders}<tbody>`;
        auditTasks.forEach(t => {
          const isC = t.status === 'Completada', ov = !isC && this.isOverdue(t.due_date);
          listHtml += `<tr data-task-id="${t.id}" class="group cursor-grab ${isC?'bg-surface-variant/40 text-on-surface-variant/80':''} ${ov?'bg-error-container/5':''}" draggable="true" ondragstart="app.dragStart(event, '${t.id}')" ondragend="app.dragEnd(event)" ondragover="app.dragOver(event)" ondragleave="app.dragLeave(event)" ondrop="app.dropTask(event, '${t.id}', '', ${t.order_num||0})">
            <td class="pl-4 py-1 w-14">
              <div class="flex items-center gap-2">
                <span class="material-symbols-outlined text-[16px] text-on-surface-variant/30 cursor-grab hover:text-primary transition-colors" title="Arrastrar para mover">drag_indicator</span>
                <label class="cursor-pointer">
                  <input type="checkbox" class="hidden" ${isC?'checked':''} onchange="app.toggleComplete('${t.id}',this.checked,'')">
                  <div class="w-4 h-4 rounded-full border border-primary/30 flex items-center justify-center text-[7px] transition-all ${isC?'bg-primary text-white border-primary shadow-sm':'hover:border-primary opacity-60 hover:opacity-100'}"><span>${isC?'✓':''}</span></div>
                </label>
              </div>
            </td>
            <td class="py-1">
              <div class="flex items-center gap-2">
                <span class="task-cell-name focus:outline-none focus:text-primary block whitespace-normal cursor-text flex-1 ${isC?'line-through opacity-70':''}" contenteditable="${!isReadonly}" onblur="app.inlineUpdate('${t.id}','name',this.textContent.trim())">${t.name}</span>
                ${t.category ? `<span class="bg-surface-variant/40 text-on-surface-variant text-[9px] px-2 py-0.5 rounded-md font-bold uppercase tracking-widest whitespace-nowrap">${t.category}</span>` : ''}
              </div>
            </td>
            <td class="py-1 w-28 text-center">${isReadonly ? `<span class="${ov?'text-error font-bold':''}">${this.fmtDate(t.due_date)}</span>` : this.dateInput(t.due_date, t.id, 'due_date', ov)}</td>
            <td class="py-1 w-32">${isReadonly ? this.statusBadge(t.status) : this.statusSelect(t.status, t.id)}</td>
            <td class="py-1 w-28">${isReadonly ? (t.priority||'Media') : this.prioritySelect(t.priority||'Media', t.id)}</td>
            ${isReadonly?'':`<td class="pr-4 py-1 w-20"><div class="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity"><button class="w-5 h-5 rounded hover:bg-surface-variant transition-colors flex items-center justify-center" title="Editar" onclick="app.showEditTaskModal('${t.id}')"><span class="material-symbols-outlined text-[13px]">edit</span></button><button class="w-5 h-5 rounded hover:bg-error-container/20 hover:text-error transition-colors flex items-center justify-center" title="Eliminar" onclick="app.deleteTask('${t.id}','')"><span class="material-symbols-outlined text-[13px]">delete</span></button></div></td>`}
          </tr>`;
        });
        listHtml += `</tbody></table></div></div>`;
      });
      listHtml += `</div></div>`;
    });
    
    listHtml += '</div>';
    container.innerHTML = listHtml;
    this.openTaskGroups.initialized = true;
    return;
  }

  /* KANBAN VIEW (Ethereal Style) */
  const groups = {};
  
  tasks.forEach(t => {
    let gName = 'General';
    let gType = 'category';
    
    if (t.audit_id) {
      gName = t.audit_name || 'Auditoría sin nombre';
      gType = 'audit';
    } else if (t.category) {
      gName = t.category;
      gType = 'category';
    }
    
    if (!groups[gName]) groups[gName] = { tasks: [], type: gType };
    groups[gName].tasks.push(t);
  });

  let html = `<div class="flex flex-col gap-6 w-full pb-10 pr-2 overflow-y-auto kanban-scrollbar">`;
  
  Object.keys(groups).sort().forEach((k, idx) => {
    const group = groups[k];
    const isAudit = group.type === 'audit';
    const icon = isAudit ? 'folder' : 'category';
    
    const cols = {
      'Pendiente': { title: 'Pendientes', color: 'bg-surface-container-low', text: 'text-on-surface-variant/70', items: [] },
      'En Progreso': { title: 'En Curso', color: 'bg-surface-container-low', text: 'text-primary', items: [] },
      'Bloqueada': { title: 'Atrasadas', color: 'bg-error-container/20', text: 'text-error', items: [] },
      'Completada': { title: 'Finalizadas', color: 'bg-surface-container-low', text: 'text-on-surface-variant/50', items: [] }
    };
    
    group.tasks.forEach(t => { if(cols[t.status]) cols[t.status].items.push(t); else cols['Pendiente'].items.push(t); });
    
    html += `
    <div class="bg-surface-container-lowest border border-outline-variant rounded-[2.5rem] overflow-hidden shadow-sm">
      <div class="bg-surface-container-low px-8 py-5 flex items-center justify-between cursor-pointer hover:bg-surface-container-low/80 transition-colors" onclick="const b = this.nextElementSibling; b.classList.toggle('hidden'); const i = this.querySelector('.expand-icon'); i.textContent = b.classList.contains('hidden') ? 'expand_more' : 'expand_less';">
        <div class="flex items-center gap-4">
           <div class="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center text-primary"><span class="material-symbols-outlined">${icon}</span></div>
           <h3 class="font-headline font-extrabold text-white text-xl">${k}</h3>
           <span class="bg-surface-container-highest/50 px-3 py-1 rounded-full text-[10px] font-bold text-white/80 ml-2 uppercase tracking-widest">${group.tasks.length} tareas</span>
        </div>
        <span class="material-symbols-outlined text-white/50 expand-icon text-3xl">${idx===0?'expand_less':'expand_more'}</span>
      </div>
      <div class="p-8 overflow-x-auto kanban-scrollbar ${idx===0?'':'hidden'}">
        <div class="flex gap-8 min-w-max items-start">`;
    
    Object.keys(cols).forEach(ck => {
      const col = cols[ck];
      if (ck === 'Bloqueada' && col.items.length === 0) return;
      html += `<div class="w-[340px] shrink-0 flex flex-col gap-6">
        <div class="flex items-center justify-between px-2">
          <div class="flex items-center gap-3">
            <h4 class="text-sm font-headline font-extrabold uppercase tracking-widest ${col.text}">${col.title}</h4>
            <span class="bg-surface-container-low px-3 py-1 rounded-full text-[10px] font-bold text-on-surface-variant/40">${col.items.length}</span>
          </div>
        </div>
        <div class="flex flex-col gap-4">`;
        
      col.items.forEach(t => {
         const initals = t.responsible ? t.responsible.split(' ').map(n=>n[0]).join('').substring(0,2).toUpperCase() : '?';
         const isC = t.status === 'Completada', ov = !isC && this.isOverdue(t.due_date);
         const prioBadge = this.severityBadge(t.priority||'Media');
         
         html += `<div class="bg-surface-container-lowest p-6 rounded-[1.5rem] shadow-ambient transition-all hover:scale-[1.02] cursor-pointer group flex flex-col gap-4 border border-outline-variant" onclick="if(!${isReadonly}) app.showEditTaskModal('${t.id}')">
          <h4 class="text-base font-headline font-extrabold text-primary-navy leading-snug group-hover:text-primary transition-colors ${isC?'line-through opacity-70 text-on-surface-variant':''}">${t.name}</h4>
          <div class="flex items-center gap-2">
             ${prioBadge}
             ${t.category ? `<span class="bg-primary-navy/5 text-primary-navy/60 text-[10px] px-3 py-1 rounded-full font-bold uppercase tracking-wider">${t.category}</span>` : ''}
          </div>
          <div class="flex items-center justify-between mt-2 pt-4 border-t border-outline-variant">
            <div class="flex items-center gap-2">
              <div class="w-8 h-8 rounded-full bg-primary-container flex items-center justify-center text-[11px] font-extrabold text-white shadow-sm" title="${t.responsible||'Sin asignar'}">${initals}</div>
              <span class="text-[11px] font-bold text-primary-navy/60 truncate max-w-[120px]">${t.responsible||'Sin asignar'}</span>
            </div>
            <div class="flex items-center gap-1.5 ${ov?'text-error':'text-primary-navy/40'}">
              <span class="material-symbols-outlined text-[16px]">calendar_today</span>
              <span class="text-[11px] font-extrabold uppercase tracking-tighter">${this.fmtDate(t.due_date)||'Sin fecha'}</span>
            </div>
          </div>
         </div>`;
      });
      html += `</div></div>`;
    });
    
    html += `</div></div></div>`;
  });
  
  html += `</div>`;
  container.innerHTML = html;
};

app.showStandaloneTaskModal = function() {
  this.showTaskModal(null, '', null);
};

// ── Daily View ──
app.renderDaily = async function() {
  await this.loadAuditors();
  document.getElementById('headerActions').innerHTML = '';
  const body = document.getElementById('pageBody');
  body.innerHTML = `
    <div class="flex items-center gap-6 mb-10 bg-surface-container-low p-5 rounded-[2rem] w-fit">
      <div class="flex flex-col gap-1.5">
        <label class="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant/40 ml-1">Periodo</label>
        <select id="dailyDays" class="bg-surface-container-lowest border-none rounded-xl py-2 px-4 text-sm font-semibold shadow-sm focus:ring-2 focus:ring-primary w-40" onchange="app.loadDailyView()">
          <option value="1">1 día</option><option value="3">3 días</option><option value="7" selected>7 días</option><option value="14">14 días</option><option value="30">30 días</option>
        </select>
      </div>
      <div class="flex flex-col gap-1.5">
        <label class="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant/40 ml-1">Auditoría</label>
        <select id="dailyAudit" class="bg-surface-container-lowest border-none rounded-xl py-2 px-4 text-sm font-semibold shadow-sm focus:ring-2 focus:ring-primary w-48" onchange="app.loadDailyView()">
          <option value="">Todas</option>
          <option value="standalone">🆓 Solo libres</option>
          ${this.audits.map(a=>`<option value="${a.id}">${a.name}</option>`).join('')}
        </select>
      </div>
      <div class="flex flex-col gap-1.5">
        <label class="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant/40 ml-1">Responsable</label>
        <select id="dailyResp" class="bg-surface-container-lowest border-none rounded-xl py-2 px-4 text-sm font-semibold shadow-sm focus:ring-2 focus:ring-primary w-48" onchange="app.loadDailyView()">
          <option value="">Todos</option>${this.auditors.map(a=>`<option>${a.name}</option>`).join('')}
        </select>
      </div>
    </div>
    <div id="dailyContent" class="space-y-6"></div>`;
  this.loadDailyView();
};

app.loadDailyView = async function() {
  const days = document.getElementById('dailyDays')?.value || 7;
  const resp = document.getElementById('dailyResp')?.value || '';
  const audit = document.getElementById('dailyAudit')?.value || '';
  let q = `/api/tasks/daily?days=${days}`;
  if (resp) q += `&responsible=${encodeURIComponent(resp)}`;
  if (audit) q += `&audit_id=${encodeURIComponent(audit)}`;
  const tasks = await this.get(q) || [];
  const container = document.getElementById('dailyContent');
  if (tasks.length === 0) { container.innerHTML = `<div class="p-20 text-center bg-surface-container-low rounded-[3rem]"><div class="text-4xl mb-4">🎉</div><h3 class="text-xl font-headline font-extrabold text-white">Sin tareas pendientes</h3><p class="text-white/80">Todo está al día para este período.</p></div>`; return; }
  
  container.innerHTML = `<div class="bg-surface-container-lowest border border-outline-variant rounded-3xl overflow-hidden shadow-sm">
    <div class="table-wrapper">
      <table class="task-table resizable-table w-full">
        <thead>
          <tr>
            <th style="width:40px" class="pl-4">☑</th>
            <th class="text-left font-bold uppercase tracking-widest text-on-surface-variant/40 py-3 text-[10px]">Nombre de tarea</th>
            <th class="text-left font-bold uppercase tracking-widest text-on-surface-variant/40 py-3 text-[10px]">Auditoría</th>
            <th class="text-center font-bold uppercase tracking-widest text-on-surface-variant/40 py-3 text-[10px] w-32">Pendiente</th>
            <th class="text-left font-bold uppercase tracking-widest text-on-surface-variant/40 py-3 text-[10px] w-48">Responsable</th>
            <th class="text-left font-bold uppercase tracking-widest text-on-surface-variant/40 py-3 text-[10px] w-32">Estado</th>
          </tr>
        </thead>
        <tbody>
          ${tasks.map(t => {
            const isC = t.status === 'Completada', ov = !isC && this.isOverdue(t.due_date);
            return `<tr data-task-id="${t.id}" class="group cursor-pointer ${isC?'bg-surface-variant/40 text-on-surface-variant/80':''} ${ov?'bg-error-container/5':''}">
              <td class="pl-4 py-1 w-10">
                <label class="cursor-pointer">
                  <input type="checkbox" class="hidden" ${isC?'checked':''} onchange="app.toggleComplete('${t.id}',this.checked,'')">
                  <div class="w-4 h-4 rounded-full border border-primary/30 flex items-center justify-center text-[7px] transition-all ${isC?'bg-primary text-white border-primary shadow-sm':'hover:border-primary opacity-60 hover:opacity-100'}"><span>${isC?'✓':''}</span></div>
                </label>
              </td>
              <td class="py-1">
                <span class="task-cell-name focus:outline-none focus:text-primary block whitespace-normal flex-1 font-semibold text-[12px] ${isC?'line-through opacity-70':''}" contenteditable="true" onblur="app.inlineUpdate('${t.id}','name',this.textContent.trim())">${t.name}</span>
              </td>
              <td class="py-1 text-[11px] font-bold text-primary/70 uppercase tracking-widest">${t.audit_name||'Libre'}</td>
              <td class="py-1 w-32 text-center text-[11px]">
                ${this.dateInput(t.due_date, t.id, 'due_date', ov)}
              </td>
              <td class="py-1 w-48 text-[11px]">${this.responsibleSelect(t.responsible, t.id, app.audits.find(a => a.id === t.audit_id))}</td>
              <td class="py-1 w-32 text-[11px]">${this.statusSelect(t.status, t.id)}</td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>
  </div>`;
};

app.renderDailyTask = function(t) {
  const isComplete = t.status === 'Completada';
  return `<div class="daily-task ${isComplete?'daily-done':''}">
    <label class="planner-check ${isComplete?'checked':''}">
      <input type="checkbox" ${isComplete?'checked':''} onchange="app.toggleComplete('${t.id}',this.checked,'')">
      <span>${isComplete?'✓':''}</span></label>
    <div class="daily-task-info">
      <div class="daily-task-name">${t.name}</div>
      <div class="daily-task-meta">${t.audit_name ? `📋 ${t.audit_name}` : '<em>Libre</em>'} · 👤 ${t.responsible||'Sin asignar'} · ${t.stage_name ? `📂 ${t.stage_name}` : ''}</div>
    </div>
    <div class="daily-task-badges">${this.statusBadge(t.status)}</div>
  </div>`;
};

// ── Deviations View ──
app.renderDeviations = async function() {
  await this.loadAudits();
  const isReadonly = this.user?.role === 'observador';
  if (!isReadonly) document.getElementById('headerActions').innerHTML = `<button class="btn btn-primary" onclick="app.showDeviationModal()">+ Nueva Desviación</button>`;
  const body = document.getElementById('pageBody');
  body.innerHTML = `<div class="filters-bar"><label>Auditoría:</label><select id="dFilter" onchange="app.loadDeviationsView()"><option value="">Todas</option>${this.audits.map(a=>`<option value="${a.id}">${a.name}</option>`).join('')}</select></div><div id="devList"></div>`;
  this.loadDeviationsView();
};

app.loadDeviationsView = async function() {
  const f = document.getElementById('dFilter')?.value || '';
  const devs = await this.get(`/api/deviations${f?'?audit_id='+f:''}`) || [];
  const container = document.getElementById('devList');
  if (devs.length === 0) { container.innerHTML = `<div class="empty-state"><div class="empty-icon">⚠️</div><h3>Sin desviaciones</h3></div>`; return; }
  container.innerHTML = `<div class="deviation-list">${devs.map(d => `
    <div class="deviation-item" onclick="app.showDeviationModal(${JSON.stringify(d).replace(/"/g,'&quot;')})">
      <div class="flex-between"><strong>${d.title}</strong><div>${this.severityBadge(d.severity)} ${this.statusBadge(d.status)}</div></div>
      <div style="font-size:0.8rem;color:var(--text-muted);margin:4px 0">${d.description||''}</div>
      <div style="display:flex;gap:16px;font-size:0.75rem"><span>📋 ${d.audit_name||'—'}</span><span>👤 ${d.responsible||'—'}</span><span>📅 ${this.fmtDate(d.detected_date)}</span></div>
    </div>`).join('')}</div>`;
};

app.showDeviationModal = function(dev = null, auditId = '') {
  const isEdit = !!dev;
  this.openModal(isEdit ? 'Editar Desviación' : 'Nueva Desviación', `
    <div class="form-group"><label class="form-label">Auditoría *</label><select class="form-select" id="dvAudit">${this.audits.map(a=>`<option value="${a.id}" ${(dev?.audit_id||auditId)===a.id?'selected':''}>${a.name}</option>`).join('')}</select></div>
    <div class="form-group"><label class="form-label">Título *</label><input class="form-input" id="dvTitle" value="${dev?.title||''}"></div>
    <div class="form-group"><label class="form-label">Descripción</label><textarea class="form-textarea" id="dvDesc">${dev?.description||''}</textarea></div>
    <div class="form-row">
      <div class="form-group"><label class="form-label">Severidad</label><select class="form-select" id="dvSev">${['Alta','Media','Baja'].map(s=>`<option ${(dev?.severity||'Media')===s?'selected':''}>${s}</option>`).join('')}</select></div>
      <div class="form-group"><label class="form-label">Estado</label><select class="form-select" id="dvStatus">${['Abierta','Mitigada','Cerrada'].map(s=>`<option ${(dev?.status||'Abierta')===s?'selected':''}>${s}</option>`).join('')}</select></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label class="form-label">Responsable</label><input class="form-input" id="dvResp" value="${dev?.responsible||''}"></div>
      <div class="form-group"><label class="form-label">Fecha Detección</label><input type="date" class="form-input" id="dvDate" value="${dev?.detected_date||new Date().toISOString().slice(0,10)}"></div>
    </div>
    <div class="form-group"><label class="form-label">Plan de Acción</label><textarea class="form-textarea" id="dvPlan">${dev?.action_plan||''}</textarea></div>
    <div class="form-group"><label class="form-label">Comentarios</label><textarea class="form-textarea" id="dvComm">${dev?.comments||''}</textarea></div>`,
    `${isEdit?`<button class="btn btn-danger" onclick="app.deleteDeviation('${dev.id}')">Eliminar</button>`:''}
     <button class="btn btn-secondary" onclick="app.closeModal()">Cancelar</button>
     <button class="btn btn-primary" onclick="app.saveDeviation('${dev?.id||''}')">${isEdit?'Guardar':'Crear'}</button>`);
};

app.saveDeviation = async function(id) {
  const d = { audit_id: document.getElementById('dvAudit').value, title: document.getElementById('dvTitle').value.trim(),
    description: document.getElementById('dvDesc').value, severity: document.getElementById('dvSev').value,
    status: document.getElementById('dvStatus').value, responsible: document.getElementById('dvResp').value,
    detected_date: document.getElementById('dvDate').value, action_plan: document.getElementById('dvPlan').value, comments: document.getElementById('dvComm').value };
  if (!d.title) return this.toast('Título requerido', 'error');
  const r = id ? await this.put(`/api/deviations/${id}`, d) : await this.post('/api/deviations', d);
  if (r?.status === 'success') { this.toast(id?'Actualizada':'Registrada'); this.closeModal(); this.loadDeviationsView?.(); }
  else this.toast('Error', 'error');
};

app.deleteDeviation = async function(id) {
  if (!confirm('¿Eliminar?')) return;
  await this.del(`/api/deviations/${id}`); this.toast('Eliminada'); this.closeModal(); this.navigate('deviations');
};

// ── Templates (Ethereal Style) ──
app.renderTemplates = async function() {
  this.templates = await this.get('/api/templates') || [];
  const isR = this.user?.role === 'observador';
  if (!isR) document.getElementById('headerActions').innerHTML = `
    <button class="bg-primary text-white font-bold px-6 py-2 rounded-xl text-sm hover:opacity-90 transition-all shadow-sm flex items-center gap-2" onclick="app.renderAuditTemplateBuilder()">
      <span class="material-symbols-outlined text-[18px]">add</span> Nueva Plantilla
    </button>`;
  const body = document.getElementById('pageBody');
  if (this.templates.length === 0) { 
    body.innerHTML = `<div class="p-20 text-center bg-surface-container-low rounded-[3rem]"><div class="text-4xl mb-4">📝</div><h3 class="text-xl font-headline font-extrabold text-white">Sin plantillas</h3></div>`; return; 
  }
  body.innerHTML = `<div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">${this.templates.map(t => {
    const tc = (t.stages || []).reduce((s,st) => s + (st.tasks?.length||0), 0);
    return `<div class="bg-surface-container-lowest p-8 rounded-[2.5rem] shadow-ambient transition-all hover:scale-[1.01] cursor-pointer group flex flex-col gap-6" onclick="app.renderAuditTemplateBuilder('${t.id}')">
      <div class="flex justify-between items-start">
        <div class="w-14 h-14 rounded-3xl bg-surface-container-low flex items-center justify-center text-primary group-hover:bg-primary group-hover:text-white transition-all">
          <span class="material-symbols-outlined text-2xl">description</span>
        </div>
        <div class="flex flex-col items-end">
          <span class="text-xl font-headline font-extrabold text-on-surface">${(t.stages || []).length}</span>
          <span class="text-[9px] font-bold uppercase tracking-widest text-on-surface-variant/40">Etapas</span>
        </div>
      </div>
      <div>
        <h3 class="text-xl font-headline font-extrabold text-on-surface leading-tight mb-2 group-hover:text-primary transition-colors">${t.name}</h3>
        <p class="text-sm font-medium text-on-surface-variant/60 line-clamp-2">${t.description||'Sin descripción'}</p>
      </div>
      <div class="flex items-center gap-4 pt-4 border-t border-outline-variant">
         <div class="flex flex-col">
          <span class="text-lg font-headline font-extrabold text-on-surface">${tc}</span>
          <span class="text-[9px] font-bold uppercase tracking-widest text-on-surface-variant/40">Tareas Totales</span>
        </div>
      </div>
      ${isR?'':`<div class="flex items-center gap-2 mt-auto">
        <button class="flex-1 bg-surface-container-low text-white font-bold py-3 rounded-2xl text-xs hover:bg-surface-container-high transition-colors" onclick="event.stopPropagation();app.duplicateTemplate('${t.id}')">Duplicar</button>
        <button class="flex-1 bg-primary text-white font-bold py-3 rounded-2xl text-xs hover:opacity-90 transition-all" onclick="event.stopPropagation();app.applyTemplate('${t.id}')">Crear Auditoría</button>
        <button class="w-12 h-12 rounded-2xl bg-error-container/20 text-error flex items-center justify-center hover:bg-error-container/40 transition-colors" onclick="event.stopPropagation();app.deleteTemplate('${t.id}')"><span class="material-symbols-outlined text-[20px]">delete</span></button>
      </div>`}
    </div>`;
  }).join('')}</div>`;
};

app.renderAuditTemplateBuilder = async function(id = null) {
  let tmpl = { name: '', description: '', stages: [{ name: '', tasks: [{ name: '', weight: 0 }] }] };
  if (id) {
    tmpl = await this.get(`/api/templates/${id}`);
    if (!tmpl) return;
  }
  
  this.currentAuditTemplateId = id;
  this.currentAuditTemplateName = tmpl.name || '';
  this.currentAuditTemplateDesc = tmpl.description || '';
  this.currentAuditTemplateStages = tmpl.stages?.length ? tmpl.stages : [{ name: '', tasks: [{ name: '', weight: 0 }] }];
  
  const body = document.getElementById('pageBody');
  body.innerHTML = `
    <div class="max-w-5xl mx-auto pb-20">
      <div class="flex flex-col md:flex-row items-start md:items-center justify-between mb-8 gap-4">
        <button class="bg-surface-container hover:bg-surface-container-high px-5 py-2.5 rounded-full text-sm font-bold text-on-surface-variant flex items-center gap-2 transition-all shadow-sm" onclick="app.navigate('templates')">
          <span class="material-symbols-outlined text-[18px]">arrow_back</span> Volver a Plantillas
        </button>
        <div class="flex items-center gap-4 w-full md:w-auto justify-between md:justify-end">
          <div class="bg-white px-4 py-2.5 rounded-full shadow-sm border border-slate-200 text-sm font-semibold flex items-center gap-2">
            Suma de Pesos: <span id="auditBuilderSum" class="font-bold text-slate-400">0%</span>
          </div>
          <button class="bg-primary hover:opacity-90 text-white px-8 py-2.5 rounded-full text-sm font-bold shadow-ambient transition-all active:scale-95 flex items-center gap-2" onclick="app.saveAuditTemplateBuilder()">
            <span class="material-symbols-outlined text-[18px]">save</span> Guardar
          </button>
        </div>
      </div>

      <div class="bg-white rounded-2xl shadow-ambient overflow-hidden border border-outline-variant/20 mb-8">
        <div class="bg-gradient-to-br from-slate-800 to-slate-900 p-8 text-white">
          <h2 class="text-2xl font-headline font-extrabold mb-2 flex items-center gap-3">
            <span class="material-symbols-outlined text-3xl opacity-80">account_tree</span>
            Constructor de Plantilla de Auditoría
          </h2>
          <p class="text-white/80 text-sm font-medium">Define las etapas y tareas estándar. La suma de los pesos de las tareas debe ser exactamente 100%.</p>
        </div>
        
        <div class="bg-slate-50 p-6 md:p-8 border-b border-outline-variant/30 space-y-5">
          <div class="space-y-2">
            <label class="text-[10px] font-bold uppercase tracking-widest text-slate-500 ml-1">Nombre de la Plantilla *</label>
            <input type="text" id="atbName" class="w-full bg-white border border-slate-200 focus:border-primary focus:ring-1 focus:ring-primary rounded-xl px-4 py-3 text-base font-bold text-slate-800 placeholder:text-slate-400 shadow-sm" value="${this.currentAuditTemplateName}" placeholder="Ej: Auditoría TI Anual..." onchange="app.currentAuditTemplateName = this.value">
          </div>
          <div class="space-y-2">
            <label class="text-[10px] font-bold uppercase tracking-widest text-slate-500 ml-1">Descripción</label>
            <textarea id="atbDesc" class="w-full bg-white border border-slate-200 focus:border-primary focus:ring-1 focus:ring-primary rounded-xl px-4 py-3 text-sm font-medium text-slate-700 placeholder:text-slate-400 min-h-[80px] shadow-sm" placeholder="Breve descripción del objetivo de esta plantilla..." onchange="app.currentAuditTemplateDesc = this.value">${this.currentAuditTemplateDesc}</textarea>
          </div>
        </div>
      </div>

      <div id="auditBuilderStagesList" class="space-y-6">
        <!-- Stages rendered here -->
      </div>
      
      <div class="mt-8 text-center pt-8 border-t border-outline-variant/30">
        <button class="bg-white border-2 border-dashed border-slate-300 hover:border-slate-400 hover:bg-slate-50 text-slate-600 font-bold px-8 py-4 rounded-xl text-sm flex items-center justify-center gap-2 transition-all shadow-sm mx-auto" onclick="app.addAuditTemplateStage()">
          <span class="material-symbols-outlined text-[20px]">add_box</span> Añadir Nueva Etapa
        </button>
      </div>
    </div>
  `;
  
  this.renderAuditTemplateBuilderStages();
};

app.syncAuditTemplateBuilderState = function() {
  const container = document.getElementById('auditBuilderStagesList');
  if (!container) return;
  const stageNodes = container.querySelectorAll('.atb-stage-card');
  const newStages = [];
  
  stageNodes.forEach((sNode) => {
    const sName = sNode.querySelector('.atb-stage-name').value.trim();
    const tasks = [];
    sNode.querySelectorAll('.atb-task-row').forEach((tNode) => {
      const tName = tNode.querySelector('.atb-task-name').value.trim();
      const tWeight = parseFloat(tNode.querySelector('.atb-task-weight').value) || 0;
      tasks.push({ name: tName, weight: tWeight });
    });
    newStages.push({ name: sName, tasks });
  });
  
  this.currentAuditTemplateName = document.getElementById('atbName').value.trim();
  this.currentAuditTemplateDesc = document.getElementById('atbDesc').value.trim();
  this.currentAuditTemplateStages = newStages;
};

app.renderAuditTemplateBuilderStages = function() {
  const container = document.getElementById('auditBuilderStagesList');
  if (!container) return;
  
  let totalWeight = 0;
  
  container.innerHTML = this.currentAuditTemplateStages.map((s, sIdx) => {
    const tasksHTML = (s.tasks || []).map((t, tIdx) => {
      totalWeight += (t.weight || 0);
      const isFirst = tIdx === 0;
      const isLast = tIdx === s.tasks.length - 1;
      
      return `
        <div class="atb-task-row flex items-center gap-3 p-3 bg-slate-50 rounded-lg border border-slate-100 group/task hover:border-slate-300 transition-colors">
          <div class="flex flex-col items-center justify-center gap-1 w-6 flex-shrink-0">
            <button class="w-6 h-6 rounded hover:bg-slate-200 flex items-center justify-center text-slate-400 hover:text-slate-700 transition-colors ${isFirst ? 'invisible' : ''}" onclick="app.moveAuditTemplateTaskUp(${sIdx}, ${tIdx})" title="Subir Tarea">
              <span class="material-symbols-outlined text-[16px]">keyboard_arrow_up</span>
            </button>
            <button class="w-6 h-6 rounded hover:bg-slate-200 flex items-center justify-center text-slate-400 hover:text-slate-700 transition-colors ${isLast ? 'invisible' : ''}" onclick="app.moveAuditTemplateTaskDown(${sIdx}, ${tIdx})" title="Bajar Tarea">
              <span class="material-symbols-outlined text-[16px]">keyboard_arrow_down</span>
            </button>
          </div>
          
          <input type="text" class="atb-task-name flex-grow bg-white border border-slate-200 focus:border-primary focus:ring-1 focus:ring-primary rounded-md px-3 py-2 text-sm font-semibold text-slate-700 placeholder:text-slate-400 shadow-sm" value="${t.name}" placeholder="Nombre de la tarea...">
          
          <div class="flex items-center gap-2 bg-white border border-slate-200 rounded-md px-2 py-1 shadow-sm focus-within:border-primary focus-within:ring-1 focus-within:ring-primary flex-shrink-0">
            <input type="number" step="0.1" class="atb-task-weight bg-transparent border-none p-1 w-14 text-sm font-bold text-center text-slate-700 focus:ring-0" value="${t.weight}" min="0" max="100" onkeyup="app.updateAuditTemplateSumFast()">
            <span class="text-xs font-bold text-slate-400">%</span>
          </div>
          
          <button class="w-8 h-8 rounded-md hover:bg-red-50 flex items-center justify-center text-slate-400 hover:text-red-500 transition-colors flex-shrink-0" onclick="app.removeAuditTemplateTask(${sIdx}, ${tIdx})" title="Eliminar Tarea">
            <span class="material-symbols-outlined text-[18px]">close</span>
          </button>
        </div>
      `;
    }).join('');
    
    return `
      <div class="atb-stage-card bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <div class="bg-slate-100 p-4 border-b border-slate-200 flex gap-4 items-center">
          <div class="w-8 h-8 rounded-full bg-slate-300 text-slate-600 flex items-center justify-center font-bold text-sm flex-shrink-0">${sIdx + 1}</div>
          <input type="text" class="atb-stage-name flex-grow bg-white border border-slate-200 focus:border-primary focus:ring-1 focus:ring-primary rounded-lg px-4 py-2 text-base font-bold text-slate-800 placeholder:text-slate-400 shadow-sm" value="${s.name}" placeholder="Nombre de la etapa (Ej: Planificación)">
          <button class="w-9 h-9 rounded-lg hover:bg-red-100 flex items-center justify-center text-red-400 hover:text-red-600 transition-colors flex-shrink-0 bg-white border border-slate-200 shadow-sm" onclick="app.removeAuditTemplateStage(${sIdx})" title="Eliminar Etapa Completa">
            <span class="material-symbols-outlined text-[20px]">delete</span>
          </button>
        </div>
        
        <div class="p-4 pl-6 space-y-3">
          ${tasksHTML}
          <div class="pt-2 pl-9">
             <button class="bg-blue-50 text-primary font-bold px-4 py-2 rounded-lg text-xs flex items-center gap-2 hover:bg-blue-100 transition-colors" onclick="app.addAuditTemplateTask(${sIdx})">
               <span class="material-symbols-outlined text-[16px]">add</span> Añadir Tarea
             </button>
          </div>
        </div>
      </div>
    `;
  }).join('');
  
  if (this.currentAuditTemplateStages.length === 0) {
    container.innerHTML = `<div class="text-center py-10 text-slate-400 font-medium">No hay etapas definidas. Haz clic en "Añadir Nueva Etapa".</div>`;
  }
  
  this.updateAuditTemplateSumUI(totalWeight);
};

app.updateAuditTemplateSumFast = function() {
  const container = document.getElementById('auditBuilderStagesList');
  if (!container) return;
  let sum = 0;
  container.querySelectorAll('.atb-task-weight').forEach(input => {
    sum += parseFloat(input.value) || 0;
  });
  this.updateAuditTemplateSumUI(sum);
};

app.updateAuditTemplateSumUI = function(totalWeight) {
  const sumEl = document.getElementById('auditBuilderSum');
  if (sumEl) {
    sumEl.textContent = totalWeight.toFixed(1) + '%';
    if (Math.abs(totalWeight - 100) < 0.05) {
      sumEl.className = 'font-extrabold text-green-600 bg-green-50 px-2 py-0.5 rounded';
    } else {
      sumEl.className = 'font-bold text-red-500 bg-red-50 px-2 py-0.5 rounded';
    }
  }
};

app.addAuditTemplateStage = function() {
  this.syncAuditTemplateBuilderState();
  this.currentAuditTemplateStages.push({ name: '', tasks: [{ name: '', weight: 0 }] });
  this.renderAuditTemplateBuilderStages();
  setTimeout(() => { window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' }); }, 50);
};

app.removeAuditTemplateStage = function(sIdx) {
  if (!confirm('¿Eliminar esta etapa y todas sus tareas?')) return;
  this.syncAuditTemplateBuilderState();
  this.currentAuditTemplateStages.splice(sIdx, 1);
  this.renderAuditTemplateBuilderStages();
};

app.addAuditTemplateTask = function(sIdx) {
  this.syncAuditTemplateBuilderState();
  this.currentAuditTemplateStages[sIdx].tasks.push({ name: '', weight: 0 });
  this.renderAuditTemplateBuilderStages();
};

app.removeAuditTemplateTask = function(sIdx, tIdx) {
  this.syncAuditTemplateBuilderState();
  this.currentAuditTemplateStages[sIdx].tasks.splice(tIdx, 1);
  this.renderAuditTemplateBuilderStages();
};

app.moveAuditTemplateTaskUp = function(sIdx, tIdx) {
  if (tIdx === 0) return;
  this.syncAuditTemplateBuilderState();
  const tasks = this.currentAuditTemplateStages[sIdx].tasks;
  const temp = tasks[tIdx - 1];
  tasks[tIdx - 1] = tasks[tIdx];
  tasks[tIdx] = temp;
  this.renderAuditTemplateBuilderStages();
};

app.moveAuditTemplateTaskDown = function(sIdx, tIdx) {
  this.syncAuditTemplateBuilderState();
  const tasks = this.currentAuditTemplateStages[sIdx].tasks;
  if (tIdx === tasks.length - 1) return;
  const temp = tasks[tIdx + 1];
  tasks[tIdx + 1] = tasks[tIdx];
  tasks[tIdx] = temp;
  this.renderAuditTemplateBuilderStages();
};

app.saveAuditTemplateBuilder = async function() {
  this.syncAuditTemplateBuilderState();
  
  const n = this.currentAuditTemplateName;
  if (!n) return this.toast('El nombre de la plantilla es obligatorio', 'error');
  
  // Clean up empty tasks/stages
  const stages = [];
  this.currentAuditTemplateStages.forEach(s => {
    const sname = s.name.trim();
    const tasks = s.tasks.filter(t => t.name.trim() !== '');
    if (sname !== '' || tasks.length > 0) {
      stages.push({ name: sname, tasks });
    }
  });
  
  const total = stages.reduce((ts, s) => ts + s.tasks.reduce((tt, t) => tt + t.weight, 0), 0);
  if (stages.some(s => s.tasks.length > 0) && Math.abs(total - 100) > 0.05) {
    return this.toast('La suma total de pesos de las tareas debe ser exactamente 100%', 'error');
  }
  
  const payload = { name: n, description: this.currentAuditTemplateDesc, stages };
  try {
    const res = this.currentAuditTemplateId 
      ? await this.put(`/api/templates/${this.currentAuditTemplateId}`, payload)
      : await this.post('/api/templates', payload);
      
    if (res?.status === 'success') {
      this.toast('Plantilla guardada exitosamente');
      this.navigate('templates');
    } else {
      this.toast(res?.error || 'Error al guardar la plantilla', 'error');
    }
  } catch (err) {
    this.toast('Ocurrió un error inesperado al guardar', 'error');
  }
};
app.duplicateTemplate = async function(tid) { const r = await this.post(`/api/templates/${tid}/duplicate`); if (r?.status === 'success') { this.toast('Duplicada'); this.renderTemplates(); } };
app.deleteTemplate = async function(tid) { if (!confirm('¿Eliminar?')) return; await this.del(`/api/templates/${tid}`); this.toast('Eliminada'); this.renderTemplates(); };

app.applyTemplate = async function(tid) {
  await Promise.all([this.loadPlans(), this.loadAuditors(), this.loadAreas()]);
  this.openModal('Personalizar Auditoría', `
    <div class="space-y-6">
      <div class="space-y-2">
        <label class="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant/60 ml-1">Denominación *</label>
        <input class="w-full bg-surface-variant border-none rounded-2xl p-4 text-sm font-medium focus:ring-2 focus:ring-primary transition-all text-on-surface" id="atName" placeholder="Ej: Auditoría de Procesos Q2">
      </div>
      <div class="space-y-2">
        <label class="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant/60 ml-1">Observaciones</label>
        <textarea class="w-full bg-surface-variant border-none rounded-2xl p-4 text-sm font-medium focus:ring-2 focus:ring-primary transition-all min-h-[80px] text-on-surface" id="atDesc" placeholder="Detalles adicionales..."></textarea>
      </div>
      <div class="space-y-2">
        <label class="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant/60 ml-1">Fecha de Inicio</label>
        <input type="date" class="w-full bg-surface-variant border-none rounded-2xl p-4 text-sm font-bold focus:ring-2 focus:ring-primary text-on-surface" id="atStart" value="${new Date().toISOString().slice(0,10)}">
      </div>

      <div class="space-y-2">
        <label class="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant/60 ml-1">Auditores Asignados</label>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-surface-variant p-4 rounded-2xl max-h-40 overflow-y-auto kanban-scrollbar">
          ${this.auditors.map(a => `
            <label class="flex items-center gap-2.5 p-2 rounded-xl hover:bg-surface-container-highest/20 cursor-pointer transition-colors">
              <input type="checkbox" name="atAuditAuditors" value="${a.name}" class="rounded text-primary focus:ring-primary border border-on-surface-variant/30 bg-white w-4 h-4">
              <span class="text-xs font-semibold text-on-surface">${a.name}</span>
            </label>
          `).join('')}
        </div>
      </div>

      <div class="grid grid-cols-2 gap-6">
        <div class="space-y-2">
          <label class="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant/60 ml-1">Área Responsable</label>
          <div class="grid grid-cols-1 gap-3 bg-surface-variant p-4 rounded-2xl max-h-40 overflow-y-auto kanban-scrollbar">
            ${this.areas.map(area => `
              <label class="flex items-center gap-2.5 p-2 rounded-xl hover:bg-surface-container-highest/20 cursor-pointer transition-colors">
                <input type="checkbox" name="atAreas" value="${area.name}" class="rounded text-primary focus:ring-primary border border-on-surface-variant/30 bg-white w-4 h-4">
                <span class="text-xs font-semibold text-on-surface">${area.name}</span>
              </label>
            `).join('')}
          </div>
        </div>
        <div class="space-y-2">
          <label class="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant/60 ml-1">Tipo de Participación</label>
          <select class="w-full bg-surface-variant border-none rounded-2xl p-4 text-sm font-bold focus:ring-2 focus:ring-primary appearance-none cursor-pointer text-on-surface" id="atType">
            <option value="">— Seleccionar —</option>
            ${['Integral', 'Particular'].map(type => `<option>${type}</option>`).join('')}
          </select>
        </div>
      </div>

      <div class="space-y-2">
        <label class="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant/60 ml-1">Plan Relacionado</label>
        <select class="w-full bg-surface-variant border-none rounded-2xl p-4 text-sm font-bold focus:ring-2 focus:ring-primary appearance-none cursor-pointer text-on-surface" id="atPlan">
          <option value="">— Sin plan asociado —</option>
          ${this.plans.map(p=>`<option value="${p.id}">${p.name} (${p.year})</option>`).join('')}
        </select>
      </div>
    </div>`,
    `<button class="bg-surface-container-highest/20 text-on-surface-variant font-bold px-6 py-3 rounded-2xl text-sm transition-all hover:bg-surface-container-highest/40" onclick="app.closeModal()">Cerrar</button>
     <button class="bg-primary text-white font-bold px-10 py-3 rounded-2xl text-sm shadow-ambient transition-all hover:opacity-90 active:scale-95" onclick="app.doApplyTemplate('${tid}')">Crear Auditoría</button>`);
};

app.doApplyTemplate = async function(tid) {
  const name = document.getElementById('atName').value.trim();
  if (!name) return this.toast('Nombre requerido', 'error');
  const checkedAuditors = Array.from(document.querySelectorAll('input[name="atAuditAuditors"]:checked')).map(el => el.value);
  const selectedAreas = Array.from(document.querySelectorAll('input[name="atAreas"]:checked')).map(el => el.value);
  const d = { 
    name, 
    description: document.getElementById('atDesc').value, 
    start_date: document.getElementById('atStart').value, 
    responsible: checkedAuditors.length > 0 ? checkedAuditors[0] : '',
    plan_id: document.getElementById('atPlan').value || null,
    auditors: checkedAuditors,
    responsible_area: selectedAreas,
    audit_type: document.getElementById('atType').value
  };
  const audit = await this.post('/api/audits', d);
  if (audit?.id) { 
    const res = await this.post(`/api/audits/${audit.id}/apply-template/${tid}`); 
    if (res && res.error) {
      this.toast('Error al aplicar plantilla: ' + res.error, 'error');
    } else {
      this.toast(`Auditoría generada con éxito (${res?.tasks_applied || 0} tareas)`); 
    }
    this.closeModal(); 
    this.navigate('audits'); 
  } else this.toast('Error al crear auditoría', 'error');
};

// ── Plans (Ethereal Style) ──
app.renderPlans = async function() {
  await this.loadPlans();
  const isR = this.user?.role === 'observador';
  if (!isR) document.getElementById('headerActions').innerHTML = `
    <button class="btn btn-primary" onclick="app.showPlanModal()">
      <span class="material-symbols-outlined text-lg">add</span> Nuevo Plan
    </button>`;
  const body = document.getElementById('pageBody');
  if (this.plans.length === 0) { 
    body.innerHTML = `<div class="p-20 text-center bg-surface-container-low rounded-[3rem]"><div class="text-4xl mb-4">📁</div><h3 class="text-xl font-headline font-extrabold text-white">Sin planes</h3><p class="text-white/80">Crea un plan para agrupar tus auditorías.</p></div>`; return; 
  }
  body.innerHTML = `<div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">${this.plans.map(p => `
    <div class="bg-surface-container-lowest p-8 rounded-[2.5rem] shadow-ambient transition-all hover:scale-[1.01] cursor-pointer group flex flex-col gap-6" onclick="app.showEditPlanModal('${p.id}')">
      <div class="flex justify-between items-start">
        <div class="w-14 h-14 rounded-3xl bg-surface-container-low flex items-center justify-center text-primary group-hover:bg-primary group-hover:text-white transition-all">
          <span class="material-symbols-outlined text-2xl">folder_managed</span>
        </div>
        <div class="flex flex-col items-end">
          ${this.statusBadge(p.status)}
        </div>
      </div>
      <div>
        <h3 class="text-xl font-headline font-extrabold text-on-surface leading-tight mb-2 group-hover:text-primary transition-colors">${p.name}</h3>
        <p class="text-sm font-bold uppercase tracking-widest text-on-surface-variant/40 mb-2">Año ${p.year||'—'}</p>
        <p class="text-sm font-medium text-on-surface-variant/60 line-clamp-2">${p.description||'Sin descripción'}</p>
      </div>
      ${isR?'':`<div class="flex items-center gap-2 mt-auto pt-4 border-t border-outline-variant">
        <button class="flex-1 bg-surface-container-low text-white font-bold py-3 rounded-2xl text-xs hover:bg-surface-container-high transition-colors" onclick="event.stopPropagation();app.showEditPlanModal('${p.id}')">Editar Plan</button>
        <button class="w-12 h-12 rounded-2xl bg-error-container/20 text-error flex items-center justify-center hover:bg-error-container/40 transition-colors" onclick="event.stopPropagation();app.deletePlan('${p.id}')"><span class="material-symbols-outlined text-[20px]">delete</span></button>
      </div>`}
    </div>`).join('')}</div>`;
};

app.showEditPlanModal = async function(id) {
  const plan = await this.get(`/api/plans/${id}`);
  if (plan && !plan.error) this.showPlanModal(plan);
};

app.showPlanModal = function(plan = null) {
  const isEdit = !!plan;
  this.openModal(isEdit?'Editar Plan':'Nuevo Plan', `
    <div class="space-y-6">
      <div class="space-y-2">
        <label class="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant/60 ml-1">Denominación</label>
        <input class="w-full bg-surface-container-low border-none rounded-2xl p-4 text-sm font-medium focus:ring-2 focus:ring-primary transition-all" id="plName" placeholder="Ej: Plan Anual de Auditoría 2026" value="${plan?.name||''}">
      </div>
      <div class="grid grid-cols-2 gap-6">
        <div class="space-y-2">
          <label class="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant/60 ml-1">Periodo Fiscal</label>
          <input type="number" class="w-full bg-surface-container-low border-none rounded-2xl p-4 text-sm font-bold focus:ring-2 focus:ring-primary" id="plYear" value="${plan?.year||new Date().getFullYear()}">
        </div>
        <div class="space-y-2">
          <label class="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant/60 ml-1">Estado</label>
          <select class="w-full bg-surface-container-low border-none rounded-2xl p-4 text-sm font-bold focus:ring-2 focus:ring-primary appearance-none cursor-pointer" id="plStatus">
            ${['Activo','Cerrado'].map(s=>`<option ${plan?.status===s?'selected':''}>${s}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="space-y-2">
        <label class="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant/60 ml-1">Alcance y Objetivos</label>
        <textarea class="w-full bg-surface-container-low border-none rounded-2xl p-4 text-sm font-medium focus:ring-2 focus:ring-primary transition-all min-h-[120px]" id="plDesc" placeholder="Describe los objetivos estratégicos del plan...">${plan?.description||''}</textarea>
      </div>
    </div>`,
    `<button class="bg-surface-container-highest/20 text-on-surface-variant font-bold px-6 py-3 rounded-2xl text-sm transition-all hover:bg-surface-container-highest/40" onclick="app.closeModal()">Cerrar</button>
     <button class="bg-primary text-white font-bold px-10 py-3 rounded-2xl text-sm shadow-ambient transition-all hover:opacity-90 active:scale-95" onclick="app.savePlan('${plan?.id||''}')">${isEdit?'Sincronizar Plan':'Publicar Plan'}</button>`);
};

app.savePlan = async function(id) {
  const d = { name: document.getElementById('plName').value.trim(), year: parseInt(document.getElementById('plYear').value),
    description: document.getElementById('plDesc').value, status: document.getElementById('plStatus').value };
  if (!d.name) return this.toast('Nombre requerido', 'error');
  const r = id ? await this.put(`/api/plans/${id}`, d) : await this.post('/api/plans', d);
  if (r?.status === 'success') { this.toast(id?'Actualizado':'Creado'); this.closeModal(); this.renderPlans(); }
  else this.toast('Error', 'error');
};

app.deletePlan = async function(id) {
  if (!confirm('¿Eliminar este plan?')) return;
  await this.del(`/api/plans/${id}`); this.toast('Eliminado'); this.renderPlans();
};

// ── Master Data (Ethereal Style) ──
app.masterDataTab = 'auditors';

app.renderMasterData = async function() {
  await Promise.all([this.loadAuditors(), this.loadAreas()]);
  const isR = this.user?.role === 'observador';
  const body = document.getElementById('pageBody');
  const tab = app.masterDataTab || 'auditors';
  
  let tabsHTML = `
    <div class="flex items-center gap-4 border-b border-outline-variant/60 pb-4 mb-8">
      <button onclick="app.masterDataTab='auditors';app.renderMasterData()" class="px-5 py-2.5 rounded-xl text-sm font-bold transition-all ${tab==='auditors'?'bg-primary text-white shadow-ambient':'text-on-surface-variant hover:bg-surface-container-low hover:text-on-surface'}">👤 Auditores</button>
      <button onclick="app.masterDataTab='areas';app.renderMasterData()" class="px-5 py-2.5 rounded-xl text-sm font-bold transition-all ${tab==='areas'?'bg-primary text-white shadow-ambient':'text-on-surface-variant hover:bg-surface-container-low hover:text-on-surface'}">🏢 Áreas Responsables</button>
      <button onclick="app.masterDataTab='categories';app.renderMasterData()" class="px-5 py-2.5 rounded-xl text-sm font-bold transition-all ${tab==='categories'?'bg-primary text-white shadow-ambient':'text-on-surface-variant hover:bg-surface-container-low hover:text-on-surface'}">🏷️ Categorías</button>
      <button onclick="app.masterDataTab='stakeholders';app.renderMasterData()" class="px-5 py-2.5 rounded-xl text-sm font-bold transition-all ${tab==='stakeholders'?'bg-primary text-white shadow-ambient':'text-on-surface-variant hover:bg-surface-container-low hover:text-on-surface'}">🤝 Partes Interesadas</button>
    </div>
  `;
  
  if (tab === 'auditors') {
    body.innerHTML = tabsHTML + `
      <div class="bg-surface-container-low p-8 rounded-[3rem] shadow-ambient">
        <div class="flex items-center justify-between mb-8">
          <div>
            <h3 class="text-xl font-headline font-extrabold text-white">Catálogo de Auditores</h3>
            <p class="text-sm text-white/80 font-medium">Gestiona el equipo de auditoría interna</p>
          </div>
          ${isR ? '' : `
          <div class="flex items-center gap-4 bg-surface-container-lowest p-2 rounded-2xl shadow-sm border border-outline-variant">
            <input class="bg-transparent border-none px-4 py-2 text-sm font-semibold focus:ring-0 w-64 text-on-surface" id="newAuditor" placeholder="Nombre completo...">
            <button class="bg-primary text-white font-bold px-6 py-2 rounded-xl text-sm hover:opacity-90 transition-all" onclick="app.addAuditor()">Registrar</button>
          </div>`}
        </div>
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6" id="auditorList">
          ${this.auditors.length === 0 ? '<div class="col-span-full py-20 text-center text-white/60"><span class="material-symbols-outlined text-4xl mb-4">person_off</span><p>No hay auditores registrados</p></div>' :
          this.auditors.map(a => `
            <div class="bg-surface-container-lowest p-6 rounded-[2rem] shadow-sm border border-outline-variant flex flex-col items-center gap-4 group hover:shadow-ambient transition-all cursor-pointer" onclick="if(!${isR}) app.showEditAuditorModal('${a.id}','${a.name}')">
              <div class="w-16 h-16 rounded-3xl bg-surface-container-low flex items-center justify-center text-xl font-headline font-extrabold text-primary group-hover:bg-primary group-hover:text-white transition-all shadow-sm">
                ${a.name.charAt(0).toUpperCase()}
              </div>
              <div class="text-center">
                <div class="text-base font-headline font-extrabold text-on-surface">${a.name}</div>
                <div class="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant/40 mt-1">Auditor Interno</div>
              </div>
              ${isR ? '' : `
              <div class="flex items-center gap-2 mt-2 pt-4 border-t border-outline-variant w-full justify-center">
                <button class="w-10 h-10 rounded-xl hover:bg-surface-container-low transition-colors text-on-surface-variant flex items-center justify-center" onclick="event.stopPropagation();app.showEditAuditorModal('${a.id}','${a.name}')"><span class="material-symbols-outlined text-[18px]">edit</span></button>
                <button class="w-10 h-10 rounded-xl hover:bg-error-container/20 text-error transition-colors flex items-center justify-center" onclick="event.stopPropagation();app.removeAuditor('${a.id}')"><span class="material-symbols-outlined text-[18px]">delete</span></button>
              </div>`}
            </div>`).join('')}
        </div>
      </div>`;
  } else if (tab === 'areas') {
    body.innerHTML = tabsHTML + `
      <div class="bg-surface-container-low p-8 rounded-[3rem] shadow-ambient">
        <div class="flex items-center justify-between mb-8">
          <div>
            <h3 class="text-xl font-headline font-extrabold text-white">Catálogo de Áreas Responsables</h3>
            <p class="text-sm text-white/80 font-medium">Gestiona las áreas organizacionales involucradas</p>
          </div>
          ${isR ? '' : `
          <div class="flex items-center gap-4 bg-surface-container-lowest p-2 rounded-2xl shadow-sm border border-outline-variant">
            <input class="bg-transparent border-none px-4 py-2 text-sm font-semibold focus:ring-0 w-64 text-on-surface" id="newArea" placeholder="Nombre del área...">
            <button class="bg-primary text-white font-bold px-6 py-2 rounded-xl text-sm hover:opacity-90 transition-all" onclick="app.addArea()">Registrar</button>
          </div>`}
        </div>
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6" id="areaList">
          ${this.areas.length === 0 ? '<div class="col-span-full py-20 text-center text-white/60"><span class="material-symbols-outlined text-4xl mb-4">corporate_fare</span><p>No hay áreas registradas</p></div>' :
          this.areas.map(a => `
            <div class="bg-surface-container-lowest p-6 rounded-[2rem] shadow-sm border border-outline-variant flex flex-col items-center gap-4 group hover:shadow-ambient transition-all cursor-pointer" onclick="if(!${isR}) app.showEditAreaModal('${a.id}','${a.name}')">
              <div class="w-16 h-16 rounded-3xl bg-surface-container-low flex items-center justify-center text-xl font-headline font-extrabold text-primary group-hover:bg-primary group-hover:text-white transition-all shadow-sm">
                ${a.name.charAt(0).toUpperCase()}
              </div>
              <div class="text-center">
                <div class="text-base font-headline font-extrabold text-on-surface">${a.name}</div>
                <div class="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant/40 mt-1">Área Corporativa</div>
              </div>
              ${isR ? '' : `
              <div class="flex items-center gap-2 mt-2 pt-4 border-t border-outline-variant w-full justify-center">
                <button class="w-10 h-10 rounded-xl hover:bg-surface-container-low transition-colors text-on-surface-variant flex items-center justify-center" onclick="event.stopPropagation();app.showEditAreaModal('${a.id}','${a.name}')"><span class="material-symbols-outlined text-[18px]">edit</span></button>
                <button class="w-10 h-10 rounded-xl hover:bg-error-container/20 text-error transition-colors flex items-center justify-center" onclick="event.stopPropagation();app.removeArea('${a.id}')"><span class="material-symbols-outlined text-[18px]">delete</span></button>
              </div>`}
            </div>`).join('')}
        </div>
      </div>`;
  } else if (tab === 'categories') {
    const cats = await this.get('/api/categories') || [];
    body.innerHTML = tabsHTML + `
      <div class="bg-surface-container-low p-8 rounded-[3rem] shadow-ambient">
        <div class="flex items-center justify-between mb-8">
          <div>
            <h3 class="text-xl font-headline font-extrabold text-white">Catálogo de Categorías</h3>
            <p class="text-sm text-white/80 font-medium">Gestiona las categorías para las tareas independientes</p>
          </div>
          ${isR ? '' : `
          <div class="flex items-center gap-4 bg-surface-container-lowest p-2 rounded-2xl shadow-sm border border-outline-variant">
            <input class="bg-transparent border-none px-4 py-2 text-sm font-semibold focus:ring-0 w-64 text-on-surface" id="newCategory" placeholder="Nombre de categoría...">
            <button class="bg-primary text-white font-bold px-6 py-2 rounded-xl text-sm hover:opacity-90 transition-all" onclick="app.addCategory()">Registrar</button>
          </div>`}
        </div>
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6" id="categoryList">
          ${cats.length === 0 ? '<div class="col-span-full py-20 text-center text-white/60"><span class="material-symbols-outlined text-4xl mb-4">category</span><p>No hay categorías registradas</p></div>' :
          cats.map(c => `
            <div class="bg-surface-container-lowest p-6 rounded-[2rem] shadow-sm border border-outline-variant flex flex-col items-center gap-4 group hover:shadow-ambient transition-all cursor-pointer" onclick="if(!${isR}) app.showEditCategoryModal('${c.id}','${c.name}')">
              <div class="w-16 h-16 rounded-3xl bg-surface-container-low flex items-center justify-center text-xl font-headline font-extrabold text-primary group-hover:bg-primary group-hover:text-white transition-all shadow-sm">
                ${c.name.charAt(0).toUpperCase()}
              </div>
              <div class="text-center">
                <div class="text-base font-headline font-extrabold text-on-surface">${c.name}</div>
                <div class="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant/40 mt-1">Categoría de Tarea</div>
              </div>
              ${isR ? '' : `
              <div class="flex items-center gap-2 mt-2 pt-4 border-t border-outline-variant w-full justify-center">
                <button class="w-10 h-10 rounded-xl hover:bg-surface-container-low transition-colors text-on-surface-variant flex items-center justify-center" onclick="event.stopPropagation();app.showEditCategoryModal('${c.id}','${c.name}')"><span class="material-symbols-outlined text-[18px]">edit</span></button>
                <button class="w-10 h-10 rounded-xl hover:bg-error-container/20 text-error transition-colors flex items-center justify-center" onclick="event.stopPropagation();app.removeCategory('${c.id}')"><span class="material-symbols-outlined text-[18px]">delete</span></button>
              </div>`}
            </div>`).join('')}
    </div>
      </div>`;
  } else if (tab === 'stakeholders') {
    const stks = await this.get('/api/master/stakeholders') || [];
    app.currentMasterStakeholders = stks;
    body.innerHTML = tabsHTML + `
      <div class="bg-surface-container-low p-8 rounded-[3rem] shadow-ambient">
        <div class="flex items-center justify-between mb-8">
          <div>
            <h3 class="text-xl font-headline font-extrabold text-white">Catálogo de Partes Interesadas</h3>
            <p class="text-sm text-white/80 font-medium">Gestiona las partes interesadas globales para las auditorías</p>
          </div>
          ${isR ? '' : `
          <button class="bg-primary text-white font-bold px-6 py-2 rounded-xl text-sm hover:opacity-90 transition-all flex items-center gap-2" onclick="app.showEditMasterStakeholderModal()">
            <span class="material-symbols-outlined text-[18px]">person_add</span> Registrar
          </button>`}
        </div>
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6" id="stakeholderList">
          ${stks.length === 0 ? '<div class="col-span-full py-20 text-center text-white/60"><span class="material-symbols-outlined text-4xl mb-4">group_off</span><p>No hay partes interesadas registradas</p></div>' :
          stks.map(s => `
            <div class="bg-surface-container-lowest p-6 rounded-[2rem] shadow-sm border border-outline-variant flex flex-col items-center gap-4 group hover:shadow-ambient transition-all cursor-pointer" onclick="if(!${isR}) app.showEditMasterStakeholderModal('${s.id}')">
              <div class="w-16 h-16 rounded-3xl bg-surface-container-low flex items-center justify-center text-xl font-headline font-extrabold text-primary group-hover:bg-primary group-hover:text-white transition-all shadow-sm">
                ${s.name.charAt(0).toUpperCase()}
              </div>
              <div class="text-center w-full">
                <div class="text-base font-headline font-extrabold text-on-surface truncate px-2" title="${s.name}">${s.name}</div>
                <div class="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant/40 mt-1 truncate px-2" title="${s.role_title}">${s.role_title}</div>
                <div class="text-xs text-on-surface-variant/60 mt-1 truncate px-2" title="${s.email}">${s.email}</div>
              </div>
              ${isR ? '' : `
              <div class="flex items-center gap-2 mt-2 pt-4 border-t border-outline-variant w-full justify-center">
                <button class="w-10 h-10 rounded-xl hover:bg-surface-container-low transition-colors text-on-surface-variant flex items-center justify-center" onclick="event.stopPropagation();app.showEditMasterStakeholderModal('${s.id}')"><span class="material-symbols-outlined text-[18px]">edit</span></button>
                <button class="w-10 h-10 rounded-xl hover:bg-error-container/20 text-error transition-colors flex items-center justify-center" onclick="event.stopPropagation();app.removeMasterStakeholder('${s.id}')"><span class="material-symbols-outlined text-[18px]">delete</span></button>
              </div>`}
            </div>`).join('')}
        </div>
      </div>`;
  }
};

app.showEditMasterStakeholderModal = function(id = null) {
  let s = { name: '', email: '', role_title: 'Auditado' };
  if (id) {
    const list = app.currentMasterStakeholders || [];
    const found = list.find(x => x.id === id);
    if (found) s = found;
  }
  
  this.openModal(id ? 'Editar Parte Interesada' : 'Nueva Parte Interesada', `
    <div class="space-y-4">
      <div class="form-group"><label class="form-label text-xs">Nombre Completo</label><input class="form-input bg-surface-container-low" id="msName" value="${s.name}"></div>
      <div class="form-group"><label class="form-label text-xs">Correo Electrónico</label><input class="form-input bg-surface-container-low" id="msEmail" type="email" value="${s.email}"></div>
      <div class="form-group"><label class="form-label text-xs">Cargo / Rol</label><input class="form-input bg-surface-container-low" id="msRole" value="${s.role_title}"></div>
    </div>
  `, `<button class="btn btn-secondary font-bold" onclick="app.closeModal()">Cancelar</button>
      <button class="btn btn-primary font-bold shadow-ambient" onclick="app.saveMasterStakeholder('${id || ''}')">Guardar</button>`);
};

app.saveMasterStakeholder = async function(id) {
  const name = document.getElementById('msName').value.trim();
  const email = document.getElementById('msEmail').value.trim();
  const role_title = document.getElementById('msRole').value.trim();
  if (!name || !email) return this.toast('Nombre y Correo requeridos', 'error');
  
  let res;
  if (id) {
    res = await this.put(`/api/master/stakeholders/${id}`, { name, email, role_title });
  } else {
    res = await this.post('/api/master/stakeholders', { name, email, role_title });
  }
  
  if (res && res.status === 'success') {
    this.toast('Guardado exitosamente');
    this.closeModal();
    this.renderMasterData();
  } else {
    this.toast(res?.error || 'Error al guardar', 'error');
  }
};

app.removeMasterStakeholder = async function(id) {
  if (!confirm('¿Eliminar esta parte interesada?')) return;
  const res = await this.del(`/api/master/stakeholders/${id}`);
  if (res && res.status === 'success') {
    this.toast('Eliminado exitosamente');
    this.renderMasterData();
  }
};

app.showEditSurveyTemplateModal = async function(id = null) {
  let tmpl = { name: '', description: '' };
  if (id) {
    const res = await this.get(`/api/survey-templates/${id}`);
    if (res) tmpl = res;
  }
  
  this.openModal(id ? 'Editar Plantilla' : 'Nueva Plantilla', `
    <div class="space-y-4">
      <div class="form-group">
        <label class="form-label text-xs">Nombre de la Plantilla</label>
        <input class="form-input bg-surface-container-low" id="stName" value="${tmpl.name}" placeholder="Ej. Encuesta de Cierre 2026">
      </div>
      <div class="form-group">
        <label class="form-label text-xs">Descripción</label>
        <textarea class="form-input bg-surface-container-low" id="stDesc" rows="3" placeholder="Descripción de esta plantilla">${tmpl.description}</textarea>
      </div>
    </div>
  `, `
    <button class="btn btn-secondary font-bold" onclick="app.closeModal()">Cancelar</button>
    <button class="btn btn-primary font-bold shadow-ambient" onclick="app.saveSurveyTemplate('${id || ''}')">Guardar</button>
  `);
};

app.saveSurveyTemplate = async function(id) {
  const name = document.getElementById('stName').value.trim();
  const description = document.getElementById('stDesc').value.trim();
  if (!name) return this.toast('El nombre es requerido', 'error');
  
  const payload = { name, description };
  let res;
  if (id) res = await this.put(`/api/survey-templates/${id}`, payload);
  else res = await this.post(`/api/survey-templates`, payload);
  
  if (res && res.status === 'success') {
    this.toast('Plantilla guardada exitosamente');
    this.closeModal();
    this.renderMasterData();
  }
};

app.deleteSurveyTemplate = async function(id) {
  if (!confirm('¿Estás seguro de eliminar esta plantilla? También se eliminarán sus preguntas.')) return;
  const res = await this.del(`/api/survey-templates/${id}`);
  if (res && res.status === 'success') {
    this.toast('Plantilla eliminada');
    this.renderMasterData();
  }
};

app.renderSurveyBuilder = async function(id) {
  const tmpl = await this.get(`/api/survey-templates/${id}`);
  if (!tmpl) return;
  
  this.currentSurveyTemplateId = id;
  this.currentSurveyQuestions = tmpl.questions || [];
  
  const body = document.getElementById('pageBody');
  body.innerHTML = `
    <div class="max-w-4xl mx-auto pb-20">
      <div class="flex items-center justify-between mb-8">
        <button class="bg-surface-container hover:bg-surface-container-high px-5 py-2.5 rounded-full text-sm font-bold text-on-surface-variant flex items-center gap-2 transition-all shadow-sm" onclick="app.masterDataTab='survey_templates'; app.renderMasterData()">
          <span class="material-symbols-outlined text-[18px]">arrow_back</span> Volver a Plantillas
        </button>
        <button class="bg-primary hover:opacity-90 text-white px-8 py-2.5 rounded-full text-sm font-bold shadow-ambient transition-all active:scale-95 flex items-center gap-2" onclick="app.saveSurveyBuilder()">
          <span class="material-symbols-outlined text-[18px]">save</span> Guardar Cambios
        </button>
      </div>

      <div class="bg-white rounded-2xl shadow-ambient overflow-hidden border border-outline-variant/20">
        <div class="bg-gradient-to-br from-blue-900 to-slate-900 p-8 text-white">
          <h2 class="text-2xl font-headline font-extrabold mb-2 flex items-center gap-3">
            <span class="material-symbols-outlined text-3xl opacity-80">design_services</span>
            Constructor de Encuesta
          </h2>
          <p class="text-white/80 text-sm font-medium">Plantilla: <span class="font-bold text-white">${tmpl.name}</span></p>
        </div>
        
        <div class="bg-slate-50 p-6 md:p-10 border-b border-outline-variant/30">
          <div class="bg-blue-50 border-l-4 border-blue-500 p-4 rounded-r-lg mb-8 text-blue-900 text-sm font-medium shadow-sm">
            💡 <strong>Instrucciones:</strong> Define las preguntas de la encuesta. Usa los botones laterales para reordenarlas. Los usuarios verán un diseño similar a este al responder.
          </div>
          
          <div id="surveyBuilderQuestionsList" class="space-y-5">
            <!-- Questions rendered here -->
          </div>
          
          <div class="mt-8 text-center pt-8 border-t border-outline-variant/30">
            <button class="bg-white border-2 border-dashed border-primary/40 hover:border-primary hover:bg-blue-50 text-primary font-bold px-8 py-4 rounded-xl text-sm flex items-center justify-center gap-2 transition-all shadow-sm w-full md:w-auto md:inline-flex mx-auto" onclick="app.addSurveyBuilderQuestion()">
              <span class="material-symbols-outlined text-[20px]">add_circle</span> Añadir Nueva Pregunta
            </button>
          </div>
        </div>
      </div>
    </div>
  `;
  
  this.renderSurveyBuilderQuestions();
};

app.syncSurveyBuilderState = function() {
  const container = document.getElementById('surveyBuilderQuestionsList');
  if (!container) return;
  const rows = container.querySelectorAll('.sq-card');
  const newQuestions = [];
  rows.forEach((row, idx) => {
    const text = row.querySelector('.sq-text').value.trim();
    const type = row.querySelector('.sq-type').value;
    const req = row.querySelector('.sq-req').checked;
    const weight = parseFloat(row.querySelector('.sq-weight').value) || 1.0;
    const just = parseInt(row.querySelector('.sq-just').value);
    
    newQuestions.push({
      question_text: text,
      question_type: type,
      is_required: req,
      weight: weight,
      requires_justification_below: isNaN(just) ? null : just,
      id: this.currentSurveyQuestions[idx]?.id // preserve ID if exists
    });
  });
  this.currentSurveyQuestions = newQuestions;
};

app.renderSurveyBuilderQuestions = function() {
  const container = document.getElementById('surveyBuilderQuestionsList');
  if (!container) return;
  
  container.innerHTML = this.currentSurveyQuestions.map((q, idx) => {
    const isScale = (q.question_type === 'escala' || q.question_type === 'scale');
    const isFirst = idx === 0;
    const isLast = idx === this.currentSurveyQuestions.length - 1;
    
    return `
      <div class="sq-card bg-white border border-slate-200 rounded-xl p-5 shadow-sm hover:border-slate-300 transition-colors flex gap-4 group">
        
        <!-- Reorder Controls -->
        <div class="flex flex-col items-center justify-center gap-1 w-8 flex-shrink-0">
          <button class="w-8 h-8 rounded hover:bg-slate-100 flex items-center justify-center text-slate-400 hover:text-slate-700 transition-colors ${isFirst ? 'invisible' : ''}" onclick="app.moveSurveyQuestionUp(${idx})" title="Subir">
            <span class="material-symbols-outlined text-[20px]">keyboard_arrow_up</span>
          </button>
          <div class="w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center text-xs font-bold text-slate-500">${idx + 1}</div>
          <button class="w-8 h-8 rounded hover:bg-slate-100 flex items-center justify-center text-slate-400 hover:text-slate-700 transition-colors ${isLast ? 'invisible' : ''}" onclick="app.moveSurveyQuestionDown(${idx})" title="Bajar">
            <span class="material-symbols-outlined text-[20px]">keyboard_arrow_down</span>
          </button>
        </div>
        
        <!-- Question Content -->
        <div class="flex-grow flex flex-col gap-4">
          <div class="flex gap-3 items-start">
            <input type="text" class="sq-text flex-grow bg-slate-50 border border-slate-200 focus:border-primary focus:ring-1 focus:ring-primary rounded-lg px-4 py-2 text-sm font-semibold text-slate-800 placeholder:text-slate-400" value="${q.question_text}" placeholder="Escriba la pregunta aquí...">
            <button class="w-9 h-9 rounded-lg hover:bg-red-50 flex items-center justify-center text-slate-400 hover:text-red-500 transition-colors flex-shrink-0" onclick="app.removeSurveyBuilderQuestion(${idx})" title="Eliminar">
              <span class="material-symbols-outlined text-[18px]">delete</span>
            </button>
          </div>
          
          <div class="flex flex-wrap items-center gap-4 bg-slate-50 border border-slate-100 rounded-lg p-3">
            <div class="flex items-center gap-2">
              <label class="text-[10px] font-bold uppercase tracking-widest text-slate-500">Formato:</label>
              <select class="sq-type bg-white border border-slate-200 rounded text-xs font-semibold px-2 py-1 focus:ring-primary focus:border-primary cursor-pointer text-slate-700" onchange="const row = this.closest('.sq-card'); row.querySelector('.sq-scale-opts').style.display = (this.value === 'escala' || this.value === 'scale') ? 'flex' : 'none';">
                <option value="escala" ${isScale ? 'selected' : ''}>Escala (1-5)</option>
                <option value="texto" ${!isScale ? 'selected' : ''}>Texto Abierto</option>
              </select>
            </div>
            
            <div class="w-[1px] h-5 bg-slate-300"></div>
            
            <label class="flex items-center gap-2 cursor-pointer group/req">
              <input type="checkbox" class="sq-req rounded text-primary focus:ring-0 w-4 h-4 border-slate-300" ${q.is_required ? 'checked' : ''}>
              <span class="text-[10px] font-bold uppercase tracking-widest text-slate-500 group-hover/req:text-primary transition-colors">Respuesta Obligatoria</span>
            </label>
            
            <div class="sq-scale-opts flex flex-wrap gap-4 items-center pl-4 border-l border-slate-300" style="display: ${isScale ? 'flex' : 'none'}">
               <div class="flex items-center gap-2">
                 <label class="text-[10px] font-bold uppercase tracking-widest text-slate-500" title="Peso de la pregunta en la nota final">Ponderación:</label>
                 <input type="number" step="0.1" class="sq-weight bg-white border border-slate-200 focus:border-primary focus:ring-1 focus:ring-primary rounded px-2 py-1 text-xs w-16 text-center font-semibold text-slate-700" value="${q.weight || 1.0}">
               </div>
               <div class="flex items-center gap-2">
                 <label class="text-[10px] font-bold uppercase tracking-widest text-slate-500" title="Exigir justificación si la nota es menor o igual a">Justificar si <= a:</label>
                 <input type="number" min="0" max="4" class="sq-just bg-white border border-slate-200 focus:border-primary focus:ring-1 focus:ring-primary rounded px-2 py-1 text-xs w-14 text-center font-semibold text-slate-700" value="${q.requires_justification_below !== null ? q.requires_justification_below : 2}">
               </div>
            </div>
          </div>
        </div>
      </div>
    `;
  }).join('');
  
  if (this.currentSurveyQuestions.length === 0) {
    container.innerHTML = `<div class="text-center py-10 text-slate-400 font-medium">No hay preguntas definidas. Haz clic en "Añadir Nueva Pregunta" para comenzar.</div>`;
  }
};

app.addSurveyBuilderQuestion = function() {
  this.syncSurveyBuilderState();
  this.currentSurveyQuestions.push({ question_text: '', question_type: 'escala', is_required: 1, requires_justification_below: 2, weight: 1.0 });
  this.renderSurveyBuilderQuestions();
  
  // scroll to bottom
  setTimeout(() => {
    window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
  }, 50);
};

app.removeSurveyBuilderQuestion = function(idx) {
  this.syncSurveyBuilderState();
  this.currentSurveyQuestions.splice(idx, 1);
  this.renderSurveyBuilderQuestions();
};

app.moveSurveyQuestionUp = function(idx) {
  if (idx === 0) return;
  this.syncSurveyBuilderState();
  const temp = this.currentSurveyQuestions[idx - 1];
  this.currentSurveyQuestions[idx - 1] = this.currentSurveyQuestions[idx];
  this.currentSurveyQuestions[idx] = temp;
  this.renderSurveyBuilderQuestions();
};

app.moveSurveyQuestionDown = function(idx) {
  if (idx === this.currentSurveyQuestions.length - 1) return;
  this.syncSurveyBuilderState();
  const temp = this.currentSurveyQuestions[idx + 1];
  this.currentSurveyQuestions[idx + 1] = this.currentSurveyQuestions[idx];
  this.currentSurveyQuestions[idx] = temp;
  this.renderSurveyBuilderQuestions();
};

app.saveSurveyBuilder = async function() {
  this.syncSurveyBuilderState();
  
  // Filter out completely empty questions
  const validQuestions = this.currentSurveyQuestions.filter(q => q.question_text.trim() !== '');
  
  try {
    const res = await this.put(`/api/survey-templates/${this.currentSurveyTemplateId}/questions`, { questions: validQuestions });
    if (res && res.status === 'success') {
      this.toast('Preguntas actualizadas exitosamente');
      this.masterDataTab = 'survey_templates';
      this.renderMasterData();
    } else {
      this.toast(res?.error || 'Error al guardar en el servidor', 'error');
    }
  } catch (err) {
    this.toast('Ocurrió un error inesperado al guardar', 'error');
  }
};

app.showEditAuditorModal = function(id, name) {
  this.showAuditorModal({ id, name });
};

app.showAuditorModal = function(a) {
  this.openModal('Editar Auditor', `
    <div class="form-group"><label class="form-label">Nombre *</label><input class="form-input" id="editAuditorName" value="${a.name}"></div>`,
    `<button class="btn btn-secondary" onclick="app.closeModal()">Cancelar</button>
     <button class="btn btn-primary" onclick="app.saveAuditor('${a.id}')">Guardar</button>`);
};

app.saveAuditor = async function(id) {
  const name = document.getElementById('editAuditorName').value.trim();
  if (!name) return this.toast('Nombre requerido', 'error');
  const r = await this.put(`/api/auditors/${id}`, { name });
  if (r?.status === 'success') { this.toast('Actualizado'); this.closeModal(); this.renderMasterData(); }
  else this.toast(r?.error || 'Error', 'error');
};

app.addAuditor = async function() {
  const name = document.getElementById('newAuditor').value.trim();
  if (!name) return this.toast('Requerido', 'error');
  const r = await this.post('/api/auditors', { name });
  if (r?.status === 'success') { this.toast('Agregado'); this.renderMasterData(); } else this.toast(r?.error||'Error', 'error');
};

app.removeAuditor = async function(id) {
  if (!confirm('¿Eliminar?')) return;
  const r = await this.del(`/api/auditors/${id}`);
  if (r?.status === 'success') { this.toast('Eliminado'); this.renderMasterData(); }
  else this.toast(r?.error || 'Error al eliminar', 'error');
};

app.showEditAreaModal = function(id, name) {
  this.showAreaModal({ id, name });
};

app.showAreaModal = function(a) {
  this.openModal('Editar Área Responsable', `
    <div class="form-group"><label class="form-label">Nombre del Área *</label><input class="form-input" id="editAreaName" value="${a.name}"></div>`,
    `<button class="btn btn-secondary" onclick="app.closeModal()">Cancelar</button>
     <button class="btn btn-primary" onclick="app.saveArea('${a.id}')">Guardar</button>`);
};

app.saveArea = async function(id) {
  const name = document.getElementById('editAreaName').value.trim();
  if (!name) return this.toast('Nombre requerido', 'error');
  const r = await this.put(`/api/areas/${id}`, { name });
  if (r?.status === 'success') { this.toast('Actualizado'); this.closeModal(); this.renderMasterData(); }
  else this.toast(r?.error || 'Error', 'error');
};

app.addArea = async function() {
  const name = document.getElementById('newArea').value.trim();
  if (!name) return this.toast('Requerido', 'error');
  const r = await this.post('/api/areas', { name });
  if (r?.status === 'success') { this.toast('Agregada'); this.renderMasterData(); } else this.toast(r?.error||'Error', 'error');
};

app.removeArea = async function(id) {
  if (!confirm('¿Eliminar esta área? Todas las auditorías asociadas perderán esta clasificación.')) return;
  const r = await this.del(`/api/areas/${id}`);
  if (r?.status === 'success') { this.toast('Eliminado'); this.renderMasterData(); }
  else this.toast(r?.error || 'Error al eliminar', 'error');
};

app.showEditCategoryModal = function(id, name) {
  this.openModal('Editar Categoría', `
    <div class="form-group"><label class="form-label">Nombre *</label><input class="form-input" id="editCatName" value="${name}"></div>`,
    `<button class="btn btn-secondary" onclick="app.closeModal()">Cancelar</button>
     <button class="btn btn-primary" onclick="app.saveCategory('${id}')">Guardar</button>`);
};

app.saveCategory = async function(id) {
  const name = document.getElementById('editCatName').value.trim();
  if (!name) return this.toast('Nombre requerido', 'error');
  const r = await this.put(`/api/categories/${id}`, { name });
  if (r?.status === 'success') { this.toast('Actualizado'); this.closeModal(); this.renderMasterData(); }
  else this.toast(r?.error || 'Error', 'error');
};

app.addCategory = async function() {
  const name = document.getElementById('newCategory').value.trim();
  if (!name) return this.toast('Requerido', 'error');
  const r = await this.post('/api/categories', { name });
  if (r?.status === 'success') { this.toast('Agregada'); this.renderMasterData(); } else this.toast(r?.error||'Error', 'error');
};

app.removeCategory = async function(id) {
  if (!confirm('¿Eliminar esta categoría? Las tareas asociadas perderán esta clasificación.')) return;
  const r = await this.del(`/api/categories/${id}`);
  if (r?.status === 'success') { this.toast('Eliminada'); this.renderMasterData(); }
  else this.toast(r?.error || 'Error al eliminar', 'error');
};

// ── User Management (Ethereal Style) ──
app.renderUsers = async function() {
  if (this.user?.role !== 'admin') return this.navigate('dashboard');
  this.users = await this.get('/api/users') || [];
  const users = this.users;
  document.getElementById('headerActions').innerHTML = `
    <button class="btn btn-primary" onclick="app.showUserModal()">
      <span class="material-symbols-outlined text-lg">person_add</span> Nuevo Usuario
    </button>`;
  
  document.getElementById('pageBody').innerHTML = `
    <div class="bg-surface-container-low p-8 rounded-[3rem] shadow-ambient">
      <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-8">
        ${users.map(u => {
          const initials = u.username.charAt(0).toUpperCase();
          const isLocked = u.status === 'locked';
          return `
          <div class="bg-surface-container-lowest p-8 rounded-[2.5rem] shadow-sm border border-outline-variant flex flex-col gap-6 group hover:shadow-ambient transition-all">
            <div class="flex items-center justify-between">
              <div class="w-16 h-16 rounded-3xl bg-surface-container-low flex items-center justify-center text-xl font-headline font-extrabold text-primary group-hover:bg-primary group-hover:text-white transition-all shadow-sm">
                ${initials}
              </div>
              <div class="flex flex-col items-end">
                <span class="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant/40 mb-1">${u.role}</span>
                ${isLocked ? '<span class="status-badge badge-overdue">Bloqueado</span>' : '<span class="status-badge badge-active">Activo</span>'}
              </div>
            </div>
            <div>
              <h3 class="text-xl font-headline font-extrabold text-on-surface truncate leading-tight">${u.username}</h3>
              <p class="text-sm font-medium text-on-surface-variant/60 mt-1">${u.full_name || 'Sin nombre completo'}</p>
            </div>
            <div class="flex items-center gap-2 mt-auto pt-4 border-t border-outline-variant">
              ${isLocked ? `<button class="w-12 h-12 rounded-2xl bg-primary text-white flex items-center justify-center shadow-sm hover:opacity-90 transition-all" onclick="app.unlockUser('${u.username}')"><span class="material-symbols-outlined text-[20px]">lock_open</span></button>` : ''}
              <button class="flex-1 bg-surface-container-low text-white font-bold py-3 rounded-2xl text-xs hover:bg-surface-container-high transition-colors" onclick="app.showEditUserModal('${u.username}')">Editar Perfil</button>
              ${u.username !== 'admin' ? `<button class="w-12 h-12 rounded-2xl bg-error-container/20 text-error flex items-center justify-center hover:bg-error-container/40 transition-colors" onclick="app.deleteUser('${u.username}')"><span class="material-symbols-outlined text-[20px]">delete</span></button>` : ''}
            </div>
          </div>`;
        }).join('')}
      </div>
    </div>`;
};

app.showUserModal = async function(u = null) {
  const isEdit = !!u;
  if (!this.areas || this.areas.length === 0) await this.loadAreas();
  if (!this.auditors || this.auditors.length === 0) await this.loadMasterData();
  const linkedAuditors = u?.linked_auditors || [];
  this.openModal(isEdit?'Editar Perfil':'Nuevo Usuario', `
    <div class="space-y-6">
      <div class="space-y-2">
        <label class="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant/60 ml-1">Credencial de Acceso</label>
        <input class="w-full bg-surface-container-low border-none rounded-2xl p-4 text-sm font-medium focus:ring-2 focus:ring-primary transition-all" id="uName" placeholder="Nombre de usuario" value="${u?.username||''}" ${isEdit?'readonly':''}>
      </div>
      <div class="space-y-2">
        <label class="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant/60 ml-1">Nombre Completo</label>
        <input class="w-full bg-surface-container-low border-none rounded-2xl p-4 text-sm font-medium focus:ring-2 focus:ring-primary transition-all" id="uFull" placeholder="Ej: Juan Pérez" value="${u?.full_name||''}">
      </div>
      <div class="grid grid-cols-2 gap-6">
        <div class="space-y-2">
          <label class="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant/60 ml-1">${isEdit?'Nueva Clave':'Contraseña *'}</label>
          <input type="password" class="w-full bg-surface-container-low border-none rounded-2xl p-4 text-sm font-bold focus:ring-2 focus:ring-primary" id="uPass" placeholder="••••••••">
        </div>
        <div class="space-y-2">
          <label class="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant/60 ml-1">Nivel de Acceso</label>
          <select class="w-full bg-surface-container-low border-none rounded-2xl p-4 text-sm font-bold focus:ring-2 focus:ring-primary appearance-none cursor-pointer" id="uRole">
            ${['admin','gerente','jefe','auditor'].map(r=>`<option value="${r}" ${(u?.role||'auditor')===r?'selected':''}>${r.charAt(0).toUpperCase() + r.slice(1)}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="space-y-2">
        <label class="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant/60 ml-1">Área Asignada</label>
        <select class="w-full bg-surface-container-low border-none rounded-2xl p-4 text-sm font-bold focus:ring-2 focus:ring-primary appearance-none cursor-pointer" id="uArea">
          <option value="">— Ninguna —</option>
          ${(this.areas||[]).map(a=>`<option value="${a.id}" ${u?.area_id===a.id?'selected':''}>${a.name}</option>`).join('')}
        </select>
      </div>
      <div class="space-y-2">
        <label class="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant/60 ml-1">Auditores Vinculados (Datos Maestros)</label>
        <div class="w-full bg-white border border-gray-200 rounded-2xl p-4 max-h-40 overflow-y-auto custom-scrollbar flex flex-col gap-2">
          ${(this.auditors||[]).map(a => {
            const isChecked = linkedAuditors.includes(a.name);
            return `
            <label class="flex items-center gap-2 cursor-pointer p-2 rounded-lg transition-colors" style="${isChecked ? 'background-color: rgba(241, 90, 36, 0.1);' : ''}">
              <input type="checkbox" class="user-auditor-cb w-4 h-4 rounded-sm border-gray-300 text-[#F15A24] focus:ring-[#F15A24]" value="${a.name}" ${isChecked ? 'checked' : ''} onchange="
                const lbl = this.closest('label');
                const spn = lbl.querySelector('span');
                if(this.checked) {
                  lbl.style.backgroundColor = 'rgba(241, 90, 36, 0.1)';
                  spn.style.fontWeight = '800';
                } else {
                  lbl.style.backgroundColor = 'transparent';
                  spn.style.fontWeight = '600';
                }
              ">
              <span class="text-sm select-none" style="color: #002D72 !important; font-weight: ${isChecked ? '800' : '600'};">${a.name}</span>
            </label>
          `}).join('')}
        </div>
      </div>
    </div>`,
    `<button class="bg-surface-container-highest/20 text-on-surface-variant font-bold px-6 py-3 rounded-2xl text-sm transition-all hover:bg-surface-container-highest/40" onclick="app.closeModal()">Cerrar</button>
     <button class="bg-primary text-white font-bold px-10 py-3 rounded-2xl text-sm shadow-ambient transition-all hover:opacity-90 active:scale-95" onclick="app.saveUser(${isEdit})">${isEdit?'Actualizar Usuario':'Habilitar Acceso'}</button>`);
};
app.showEditUserModal = function(username) { const u = this.users.find(x => x.username === username); this.showUserModal(u); };
app.saveUser = async function(isEdit) {
  const username = document.getElementById('uName').value.trim(), password = document.getElementById('uPass').value;
  if (!username) return this.toast('Requerido', 'error');
  if (!isEdit && !password) return this.toast('Contraseña requerida', 'error');
  
  const linked_auditors = Array.from(document.querySelectorAll('.user-auditor-cb:checked')).map(cb => cb.value);
  const d = { username, full_name: document.getElementById('uFull').value, role: document.getElementById('uRole').value, area_id: document.getElementById('uArea').value, linked_auditors };
  if (password) d.password = password;
  const r = isEdit ? await this.put(`/api/users/${username}`, d) : await this.post('/api/users', d);
  if (r?.status === 'success') { this.toast(isEdit?'Actualizado':'Creado'); this.closeModal(); this.renderUsers(); } else this.toast(r?.error||'Error', 'error');
};
app.unlockUser = async function(username) { await this.put(`/api/users/${username}`, { status: 'active' }); this.toast('Desbloqueado'); this.renderUsers(); };
app.deleteUser = async function(username) { if (!confirm(`¿Eliminar ${username}?`)) return; await this.del(`/api/users/${username}`); this.toast('Eliminado'); this.renderUsers(); };

// ── Planner Module ──
app.renderPlanner = async function() {
  document.getElementById('headerActions').innerHTML = '';
  
  // Load templates for the dropdown
  const templates = await this.get('/api/templates') || [];
  const options = templates.map(t => `<option value="${t.id}">${t.name}</option>`).join('');
  
  const html = `
    <div class="max-w-5xl mx-auto space-y-6">
      <div class="bg-surface-container-lowest p-6 rounded-[2rem] shadow-ambient">
        <div class="flex items-center gap-4 mb-6">
          <div class="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center text-primary">
            <span class="material-symbols-outlined text-2xl">calendar_month</span>
          </div>
          <div>
            <h3 class="text-xl font-bold text-on-surface">Parámetros de Planificación</h3>
            <p class="text-sm text-on-surface-variant">Estima las fechas de las etapas según el esfuerzo y capacidad del equipo.</p>
          </div>
        </div>
        
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <div class="form-group col-span-1 md:col-span-2">
            <label>Plantilla Base (Define etapas y pesos)</label>
            <select id="planTemplate" class="form-select">${options}</select>
          </div>
          <div class="form-group">
            <label>Fecha de Inicio Estimada</label>
            <input type="date" id="planStartDate" class="form-input" value="${new Date().toISOString().split('T')[0]}">
          </div>
          <div class="form-group">
            <label>Días Totales Auditores</label>
            <input type="number" id="planDays" class="form-input" value="21" min="1">
          </div>
          <div class="form-group">
            <label>Cantidad de Auditores</label>
            <input type="number" id="planAuditorsCount" class="form-input" value="1" min="1" step="1">
          </div>
          <div class="form-group">
            <label>% Eficiencia Horas</label>
            <input type="number" id="planEfficiency" class="form-input" value="75" min="10" max="100">
          </div>
          <div class="form-group">
            <label>Auditorías en Paralelo</label>
            <input type="number" id="planParallel" class="form-input" value="1" min="1" step="1">
          </div>
          <div class="form-group">
            <label>Días Jefatura (Info)</label>
            <input type="number" id="planBossDays" class="form-input" value="3" min="0">
          </div>
        </div>
        
        <div class="mt-8 flex justify-end">
          <button class="btn btn-primary" onclick="app.calculatePlanner()">
            <span class="material-symbols-outlined">analytics</span> Generar Carta Gantt
          </button>
        </div>
      </div>
      
      <div id="plannerResults" class="hidden"></div>
    </div>
  `;
  document.getElementById('pageBody').innerHTML = html;
};

app.addCalendarDays = function(startDate, daysToAdd) {
  let date = new Date(startDate);
  date.setDate(date.getDate() + daysToAdd);
  return date;
};

app.calculatePlanner = async function() {
  const tplId = document.getElementById('planTemplate').value;
  const startDateStr = document.getElementById('planStartDate').value;
  if(!tplId || !startDateStr) return this.toast('Plantilla y Fecha requerida', 'error');
  
  const auditorDays = parseInt(document.getElementById('planDays').value) || 21;
  const auditorsCount = parseInt(document.getElementById('planAuditorsCount').value) || 1;
  const efficiency = parseInt(document.getElementById('planEfficiency').value) || 75;
  const parallel = parseInt(document.getElementById('planParallel').value) || 1;
  
  const baseDays = auditorDays / auditorsCount;
  const totalCalendarDays = (baseDays / (efficiency / 100)) * parallel;
  
  const tpl = await this.get(`/api/templates/${tplId}`);
  if(!tpl) return this.toast('Error cargando plantilla', 'error');
  
  const stages = tpl.stages || [];
  if(stages.length === 0) return this.toast('La plantilla no tiene etapas', 'warning');
  
  const [y, m, d] = startDateStr.split('-');
  let currentDate = new Date(y, m - 1, d);
  
  let html = `
    <div class="bg-surface-container-lowest p-6 rounded-[2rem] shadow-ambient">
      <h3 class="text-lg font-bold text-on-surface mb-2">Cronograma Estimado</h3>
      <p class="text-sm text-on-surface-variant mb-6">Basado en un esfuerzo total calendario de aproximadamente <strong>${Math.ceil(totalCalendarDays)} días corridos</strong>.</p>
      <div class="planner-gantt-container">
  `;
  
  let ganttRows = '';
  const totalProjectDays = Math.max(Math.ceil(totalCalendarDays), 1);
  let currentAccumulatedDays = 0;
  
  for (let s of stages) {
    const stageWeight = s.tasks.reduce((sum, t) => sum + (t.weight || 0), 0);
    const stageDaysRaw = (stageWeight / 100) * totalCalendarDays;
    let stageDays = Math.round(stageDaysRaw);
    if (stageDays === 0 && stageWeight > 0) stageDays = 1; // At least 1 day if weight > 0
    
    const stageStart = new Date(currentDate);
    const stageEnd = this.addCalendarDays(stageStart, stageDays > 0 ? stageDays - 1 : 0);
    
    const leftPct = Math.min((currentAccumulatedDays / totalProjectDays) * 100, 100);
    const widthPct = Math.min(Math.max((stageDays / totalProjectDays) * 100, 1), 100 - leftPct);
    
    const startStr = stageStart.toLocaleDateString('es-CL');
    const endStr = stageEnd.toLocaleDateString('es-CL');
    
    ganttRows += `
      <div class="gantt-row">
        <div class="gantt-label" title="${s.name}">
          ${s.name}
          <div class="text-[10px] text-on-surface-variant font-normal mt-1">${startStr} - ${endStr} (${stageDays} días)</div>
        </div>
        <div class="gantt-track">
          <div class="gantt-bar" style="left: ${leftPct}%; width: ${widthPct}%;">
            <span class="gantt-bar-text">${stageWeight}%</span>
          </div>
        </div>
      </div>
    `;
    
    currentDate = this.addCalendarDays(stageEnd, 1);
    currentAccumulatedDays += stageDays;
  }
  
  html += ganttRows + `</div></div>`;
  
  const resDiv = document.getElementById('plannerResults');
  resDiv.innerHTML = html;
  resDiv.classList.remove('hidden');
};
// ── Logs View ──
app.loadLogsView = async function() {
  this.currentView = 'logs';
  const container = document.getElementById('pageBody');
  container.innerHTML = `<div class="flex items-center justify-center h-full"><div class="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div></div>`;
  const logs = await this.get('/api/logs');
  if (!logs) { container.innerHTML = `<div class="text-error font-bold p-8 text-center bg-error-container/20 rounded-2xl">Error de conexión con Central Core.</div>`; return; }
  
  let html = `
    <div class="flex flex-col h-full bg-surface-container-lowest rounded-[2.5rem] shadow-ambient overflow-hidden">
      <div class="bg-surface-container-low px-8 py-6 flex flex-wrap items-center justify-between border-b border-outline-variant/30 shrink-0 gap-4">
        <h2 class="font-headline text-2xl font-extrabold text-white flex items-center gap-3">
          <span class="material-symbols-outlined text-primary text-[28px]">history</span> Registro de Actividades
        </h2>
        <div class="flex items-center gap-4">
          <span class="text-xs uppercase font-bold text-white/80 tracking-widest bg-surface-variant/20 px-4 py-1.5 rounded-full">Últimos 500 eventos</span>
        </div>
      </div>
      <div class="flex-1 overflow-y-auto p-4 custom-scrollbar">
        <table class="w-full text-left border-collapse text-sm text-on-surface-variant font-medium min-w-[800px]">
          <thead>
            <tr class="text-[10px] uppercase font-bold text-on-surface-variant/50 tracking-widest border-b border-outline-variant/50">
              <th class="py-3 px-4 flex items-center gap-2">
                Fecha
                <div class="relative flex items-center">
                  <input type="date" class="bg-transparent text-on-surface-variant/70 border-none outline-none ring-0 appearance-none focus:text-primary transition-colors text-[10px] cursor-pointer" title="Filtrar por fecha" style="color-scheme: light;" onclick="try{this.showPicker()}catch(e){}" onchange="
                    const v = this.value ? app.fmtDate(this.value) : '';
                    document.querySelectorAll('.log-row').forEach(tr => {
                      tr.style.display = (!v || tr.dataset.date === v) ? '' : 'none';
                    });
                  ">
                </div>
              </th>
              <th class="py-3 px-4">Hora</th>
              <th class="py-3 px-4">Usuario</th>
              <th class="py-3 px-4">Acción</th>
              <th class="py-3 px-4">Entidad</th>
              <th class="py-3 px-4">Detalles</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-outline-variant/30">
            ${logs.map(l => {
              const dt = this.fmtDate(l.timestamp);
              const tm = new Date(l.timestamp).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});
              return `
              <tr class="log-row hover:bg-surface-variant/10 transition-colors" data-date="${dt}">
                <td class="py-3 px-4 whitespace-nowrap text-xs font-bold">${dt}</td>
                <td class="py-3 px-4 whitespace-nowrap text-xs text-on-surface-variant/70">${tm}</td>
                <td class="py-3 px-4 font-bold text-primary">${l.user}</td>
                <td class="py-3 px-4"><span class="bg-secondary-container/10 text-secondary-container text-[10px] px-2 py-0.5 rounded font-bold uppercase tracking-widest">${l.action}</span></td>
                <td class="py-3 px-4">${l.entity_type} <span class="text-[9px] text-on-surface-variant/50 ml-1">(${l.entity_id})</span></td>
                <td class="py-3 px-4 text-xs">${l.details || ''}</td>
              </tr>
              `
            }).join('')}
            ${logs.length===0 ? '<tr><td colspan="6" class="py-12 text-center text-on-surface-variant/50 font-medium">No hay registros de actividad.</td></tr>' : ''}
          </tbody>
        </table>
      </div>
    </div>
  `;
  container.innerHTML = html;
};

// ── Recycle Bin View ──
app.loadRecycleView = async function() {
  this.currentView = 'recycle';
  const container = document.getElementById('pageBody');
  container.innerHTML = `<div class="flex items-center justify-center h-full"><div class="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div></div>`;
  const data = await this.get('/api/recycle-bin');
  if (!data) { container.innerHTML = `<div class="text-error font-bold p-8 text-center bg-error-container/20 rounded-2xl">Error al cargar papelera.</div>`; return; }
  
  const allItems = [...data.audits, ...data.tasks].sort((a,b) => new Date(b.deleted_at) - new Date(a.deleted_at));
  
  let html = `
    <div class="flex flex-col h-full bg-surface-container-lowest rounded-[2.5rem] shadow-ambient overflow-hidden">
      <div class="bg-surface-container-low px-8 py-6 flex items-center justify-between border-b border-outline-variant/30 shrink-0">
        <h2 class="font-headline text-2xl font-extrabold text-white flex items-center gap-3">
          <span class="material-symbols-outlined text-primary text-[28px]">delete</span> Papelera de Reciclaje
        </h2>
        <span class="text-xs text-white/50 font-medium flex items-center gap-1"><span class="material-symbols-outlined text-[14px]">info</span> Retención de 30 días</span>
      </div>
      <div class="flex-1 overflow-y-auto p-4 custom-scrollbar">
        <table class="w-full text-left border-collapse text-sm text-on-surface-variant font-medium min-w-[800px]">
          <thead>
            <tr class="text-[10px] uppercase font-bold text-on-surface-variant/50 tracking-widest border-b border-outline-variant/50">
              <th class="py-3 px-4">Entidad</th>
              <th class="py-3 px-4">Nombre</th>
              <th class="py-3 px-4">Fecha Eliminación</th>
              <th class="py-3 px-4 text-right">Acciones</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-outline-variant/30">
            ${allItems.map(i => {
              const dt = new Date(i.deleted_at);
              const expDt = new Date(dt); expDt.setDate(expDt.getDate() + 30);
              const daysLeft = Math.ceil((expDt - new Date()) / (1000*60*60*24));
              return `
              <tr class="hover:bg-surface-variant/10 transition-colors group">
                <td class="py-3 px-4"><span class="bg-primary/10 text-primary text-[10px] px-2 py-0.5 rounded font-bold uppercase tracking-widest">${i.type}</span></td>
                <td class="py-3 px-4">
                  <div class="font-bold">${i.name}</div>
                  ${i.parent_name ? `<div class="text-[10px] text-on-surface-variant/60 font-bold uppercase tracking-widest mt-0.5">De Auditoría: ${i.parent_name}</div>` : ''}
                </td>
                <td class="py-3 px-4">
                  <div class="flex flex-col">
                    <span>${this.fmtDate(i.deleted_at)}</span>
                    <span class="text-[10px] text-error">Expira en ${daysLeft} días</span>
                  </div>
                </td>
                <td class="py-3 px-4 text-right">
                  <div class="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button class="bg-secondary-container text-white px-3 py-1 rounded text-xs font-bold hover:opacity-90" onclick="app.restoreRecycledItem('${i.type}','${i.id}')">Restaurar</button>
                    <button class="bg-error-container text-error px-3 py-1 rounded text-xs font-bold hover:opacity-90" onclick="app.permanentDeleteRecycledItem('${i.type}','${i.id}')">Borrar</button>
                  </div>
                </td>
              </tr>
            `}).join('')}
            ${allItems.length===0 ? '<tr><td colspan="4" class="py-12 text-center text-on-surface-variant/50 font-medium">La papelera está vacía.</td></tr>' : ''}
          </tbody>
        </table>
      </div>
    </div>
  `;
  container.innerHTML = html;
};

app.restoreRecycledItem = async function(type, id) {
  if(!confirm(`¿Restaurar este registro (${type})?`)) return;
  const res = await this.post('/api/recycle-bin/restore', { type, id });
  if(res && res.status==='success') { this.toast('Restaurado correctamente'); this.loadRecycleView(); }
};

app.permanentDeleteRecycledItem = async function(type, id) {
  if(!confirm(`⚠️ ADVERTENCIA: Esta acción es irreversible.\n\n¿Estás seguro de eliminar permanentemente este registro (${type})?`)) return;
  const res = await this.del(`/api/recycle-bin/permanent`, { body: { type, id } });
  if(res && res.status==='success') { this.toast('Eliminado de forma definitiva'); this.loadRecycleView(); }
};

// ─── SATISFACTION SURVEYS UI ───────────────────────────────────────────────

app.loadAuditSurveySection = async function(aid, isReadonly) {
  const container = document.getElementById('auditSurveyContainer');
  if (!container) return;
  
  if (!['admin', 'gerente', 'jefe'].includes(this.user?.role)) {
    container.style.display = 'none';
    return;
  }
  container.style.display = 'block';
  
  const stakeholders = await this.get(`/api/audits/${aid}/stakeholders`) || [];
  const results = await this.get(`/api/audits/${aid}/survey-results`);
  
  let dashboardHtml = '';
  if (results && results.stats.total_sent > 0) {
    const s = results.stats;
    const rate = Math.round((s.total_responded / s.total_sent) * 100) || 0;
    
    let pendingAlert = '';
    const maxPending = results.pending_details.reduce((max, p) => p.days_pending > max ? p.days_pending : max, 0);
    if (maxPending >= 3) {
      pendingAlert = `<div class="bg-amber-100 text-amber-800 text-xs px-3 py-1.5 rounded-lg font-bold flex items-center gap-1 mt-2 w-full"><span class="material-symbols-outlined text-[14px]">warning</span> Hay encuestas sin responder hace ${maxPending} días</div>`;
    }
    
    dashboardHtml = `
      <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div class="bg-blue-50 p-4 rounded-xl border border-blue-100 flex flex-col justify-center">
          <div class="text-[10px] font-bold text-blue-600 uppercase tracking-wider mb-1">Enviadas</div>
          <div class="text-2xl font-headline font-extrabold text-blue-900">${s.total_sent}</div>
        </div>
        <div class="bg-green-50 p-4 rounded-xl border border-green-100 flex flex-col justify-center">
          <div class="text-[10px] font-bold text-green-600 uppercase tracking-wider mb-1">Respondidas</div>
          <div class="flex items-end gap-2">
            <div class="text-2xl font-headline font-extrabold text-green-900">${s.total_responded}</div>
            <div class="text-xs font-bold text-green-700 mb-1">(${rate}%)</div>
          </div>
        </div>
        <div class="bg-amber-50 p-4 rounded-xl border border-amber-100 flex flex-col justify-center">
          <div class="text-[10px] font-bold text-amber-600 uppercase tracking-wider mb-1">Pendientes</div>
          <div class="text-2xl font-headline font-extrabold text-amber-900">${s.total_pending}</div>
        </div>
        ${pendingAlert ? `<div class="col-span-full">${pendingAlert}</div>` : ''}
      </div>
      ${s.total_responded > 0 ? `
        <div class="mb-6 flex justify-end">
          <button class="btn bg-surface-container-high text-primary hover:bg-primary hover:text-white btn-sm font-bold shadow-sm flex items-center gap-2 transition-all" onclick="app.showSurveyResultsModal('${aid}')"><span class="material-symbols-outlined text-[16px]">bar_chart</span> Ver Respuestas Detalladas</button>
        </div>
      ` : ''}
    `;
  }
  
  let html = `
    <div class="bg-surface-container-lowest p-6 rounded-2xl border border-outline-variant/60 shadow-sm mt-6">
      <div class="flex justify-between items-center mb-6">
        <h4 class="font-headline font-extrabold text-on-surface text-sm flex items-center gap-2"><span class="material-symbols-outlined text-[18px]">thumbs_up_down</span> Encuestas de Satisfacción</h4>
        ${!isReadonly ? `
          <div class="flex gap-2">
            <button class="btn bg-surface-container-high text-on-surface hover:text-primary btn-sm flex items-center gap-1 font-semibold" onclick="app.showAddStakeholderModal('${aid}')"><span class="material-symbols-outlined text-[16px]">person_add</span> Interesado</button>
            <button class="btn bg-primary text-white hover:opacity-90 shadow-ambient btn-sm flex items-center gap-1 font-bold" onclick="app.showDistributeSurveyModal('${aid}')"><span class="material-symbols-outlined text-[16px]">send</span> Distribuir</button>
          </div>
        ` : ''}
      </div>
      ${dashboardHtml}
      <div class="table-wrapper">
        <table class="task-table resizable-table w-full">
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Email</th>
              <th>Rol / Cargo</th>
              <th>Estado / Nota</th>
              ${!isReadonly ? '<th style="width:100px">Acciones</th>' : ''}
            </tr>
          </thead>
          <tbody>
            ${stakeholders.length === 0 ? '<tr><td colspan="5" class="py-6 text-center text-on-surface-variant/50 text-[13px] italic">Sin partes interesadas registradas. Agregue auditados para enviarles encuestas.</td></tr>' : ''}
            ${stakeholders.map(s => `
              <tr class="hover:bg-surface-variant/10 transition-colors group">
                <td class="font-bold text-[13px] py-3 text-on-surface">${s.name}</td>
                <td class="text-[13px] py-3 text-on-surface-variant">${s.email}</td>
                <td class="text-[13px] py-3 text-on-surface-variant">${s.role_title}</td>
                <td class="py-3 text-[13px] font-semibold">
                  <span class="px-2 py-1 rounded-md bg-opacity-10 ${s.survey_status==='Respondida'?'text-green-600 bg-green-500':(s.survey_status==='Enviada'?'text-amber-600 bg-amber-500':'text-on-surface-variant bg-surface-variant')}">
                    ${s.survey_status === 'Respondida' && s.avg_score !== null ? `<span class="font-bold text-primary">${((s.avg_score / 4) * 100).toFixed(1)}%</span> Satisfacción` : (s.survey_status || 'Sin Enviar')}
                  </span>
                </td>
                ${!isReadonly ? `
                <td class="py-3">
                  <div class="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    ${s.survey_status === 'Enviada' && s.survey_token ? `
                      <button class="bg-primary/10 text-primary p-1.5 rounded-lg hover:bg-primary hover:text-white transition-all shadow-sm" onclick="app.copySurveyLink('${s.survey_token}')" title="Copiar Enlace Seguro"><span class="material-symbols-outlined text-[14px]">link</span></button>
                      <button class="bg-amber-500/10 text-amber-600 p-1.5 rounded-lg hover:bg-amber-500 hover:text-white transition-all shadow-sm" onclick="app.resendSurvey('${aid}', '${s.id}')" title="Reenviar Correo"><span class="material-symbols-outlined text-[14px]">forward_to_inbox</span></button>
                    ` : ''}
                    <button class="bg-error-container/30 text-error p-1.5 rounded-lg hover:bg-error hover:text-white transition-all shadow-sm" onclick="app.deleteStakeholder('${aid}', '${s.id}')" title="Eliminar"><span class="material-symbols-outlined text-[14px]">delete</span></button>
                  </div>
                </td>` : ''}
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;
  container.innerHTML = html;
};

app.showSurveyResultsModal = async function(aid) {
  const results = await this.get(`/api/audits/${aid}/survey-results`);
  if (!results || results.responses.length === 0) return this.toast('No hay respuestas aún', 'info');
  
  let html = `<div class="space-y-6 overflow-y-auto p-1 custom-scrollbar">`;
  
  results.responses.forEach(r => {
    let totalScore = 0, count = 0;
    r.data.forEach(v => {
      if ((v.type === 'escala' || v.type === 'scale') && v.value) {
        totalScore += parseFloat(v.value);
        count++;
      }
    });
    let avgGradeHtml = '';
    if (count > 0) {
      const avgGrade = ((totalScore / count) / 4 * 100).toFixed(1);
      avgGradeHtml = `<span class="ml-4 px-2 py-1 rounded-lg ${avgGrade < 50.0 ? 'bg-error-container text-error' : 'bg-green-100 text-green-700'} font-bold text-xs uppercase tracking-wider shadow-sm">${avgGrade}% Satisfacción</span>`;
    }

    html += `
      <div class="bg-surface-container-lowest p-5 rounded-2xl border border-outline-variant shadow-sm">
        <div class="flex items-start justify-between pb-3 border-b border-outline-variant/50 mb-4">
          <h5 class="font-bold text-sm text-on-surface flex items-center gap-2">
            <span class="material-symbols-outlined text-primary text-[18px] bg-primary/10 p-1.5 rounded-lg">person</span> 
            <div class="flex flex-col">
              <div class="flex items-center">
                <span>${r.stakeholder}</span>
                ${avgGradeHtml}
              </div>
              <span class="text-[10px] text-on-surface-variant uppercase tracking-widest font-normal mt-0.5">${r.created_at ? 'Respondido el ' + this.fmtDate(r.created_at) + ' a las ' + new Date(r.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : 'Sin fecha'}</span>
            </div>
          </h5>
          <span class="text-[10px] text-on-surface-variant uppercase tracking-widest bg-surface-container-high px-2 py-1 rounded font-bold">${r.role}</span>
        </div>
        <div class="space-y-4">
    `;
    
    r.data.forEach(ans => {
      let ansHtml = '';
      if (ans.type === 'escala' || ans.type === 'scale') {
        const grade = ((ans.value / 4) * 100).toFixed(1);
        ansHtml = `<div class="flex items-center gap-2 mt-1.5">
          <span class="font-bold text-sm px-2 py-0.5 rounded ${grade < 50.0 ? 'bg-error-container text-error' : 'bg-green-100 text-green-700'}">${grade}%</span>
          ${ans.justification ? `<div class="text-xs text-on-surface-variant bg-surface-container-low p-2 rounded-lg w-full border-l-2 border-error italic">Justificación: "${ans.justification}"</div>` : ''}
        </div>`;
      } else {
        ansHtml = `<div class="text-xs text-on-surface-variant bg-surface-container-low p-3 rounded-xl mt-1.5 border border-outline-variant/50 italic">"${ans.value || 'Sin respuesta'}"</div>`;
      }
      
      html += `
        <div>
          <div class="text-[11px] font-bold text-on-surface/80 uppercase tracking-wide">${ans.question}</div>
          ${ansHtml}
        </div>
      `;
    });
    
    html += `</div></div>`;
  });
  
  html += `</div>`;
  
  this.openModal('Respuestas Detalladas', html, `<button class="bg-surface-container-highest/20 text-on-surface-variant font-bold px-6 py-3 rounded-2xl text-sm transition-all hover:bg-surface-container-highest/40" onclick="app.closeModal()">Cerrar</button>`, true);
};

app.showAddStakeholderModal = async function(aid) {
  const masterStks = await this.get('/api/master/stakeholders') || [];
  app.tempMasterStakeholders = masterStks; // store for onchange
  
  let masterOptions = '<option value="">(Ingresar manualmente)</option>';
  masterStks.forEach(s => {
    masterOptions += `<option value="${s.id}">${s.name} - ${s.role_title}</option>`;
  });

  this.openModal('Registrar Parte Interesada', `
    <div class="space-y-4">
      <div class="form-group mb-6">
        <label class="form-label text-xs text-primary font-bold">Seleccionar desde Datos Maestros (Opcional)</label>
        <select class="form-input bg-surface-container-low" onchange="app.autofillStakeholder(this.value)">
          ${masterOptions}
        </select>
        <p class="text-[10px] text-white/50 mt-1">Si seleccionas uno, los campos de abajo se autocompletarán.</p>
      </div>
      <div class="h-px bg-outline-variant/30 w-full mb-4"></div>
      <div class="form-group"><label class="form-label text-xs">Nombre Completo</label><input class="form-input bg-surface-container-low" id="stkName" placeholder="Ej. Juan Pérez"></div>
      <div class="form-group"><label class="form-label text-xs">Correo Electrónico</label><input class="form-input bg-surface-container-low" id="stkEmail" type="email" placeholder="jperez@empresa.com"></div>
      <div class="form-group"><label class="form-label text-xs">Rol / Cargo</label><input class="form-input bg-surface-container-low" id="stkRole" value="Auditado"></div>
    </div>
  `, `<button class="btn btn-secondary font-bold" onclick="app.closeModal()">Cancelar</button>
      <button class="btn btn-primary font-bold shadow-ambient" onclick="app.saveStakeholder('${aid}')">Guardar</button>`);
};

app.autofillStakeholder = function(masterId) {
  if (!masterId) {
    document.getElementById('stkName').value = '';
    document.getElementById('stkEmail').value = '';
    document.getElementById('stkRole').value = 'Auditado';
    return;
  }
  const s = app.tempMasterStakeholders.find(x => x.id === masterId);
  if (s) {
    document.getElementById('stkName').value = s.name;
    document.getElementById('stkEmail').value = s.email;
    document.getElementById('stkRole').value = s.role_title;
  }
};

app.saveStakeholder = async function(aid) {
  const name = document.getElementById('stkName').value.trim();
  const email = document.getElementById('stkEmail').value.trim();
  const role = document.getElementById('stkRole').value.trim();
  if (!name || !email) return this.toast('Nombre y Email requeridos', 'error');
  
  const res = await this.post(`/api/audits/${aid}/stakeholders`, { name, email, role_title: role });
  if (res && res.status === 'success') {
    this.toast('Parte interesada registrada');
    this.closeModal();
    this.loadAuditSurveySection(aid, false);
  }
};

app.deleteStakeholder = async function(aid, sid) {
  if (!confirm('¿Eliminar esta parte interesada?')) return;
  const res = await this.del(`/api/audits/${aid}/stakeholders/${sid}`);
  if (res && res.status === 'success') {
    this.toast('Eliminada');
    this.loadAuditSurveySection(aid, false);
  }
};

app.showDistributeSurveyModal = async function(aid) {
  const stakeholders = await this.get(`/api/audits/${aid}/stakeholders`) || [];
  const templates = await this.get('/api/survey-templates') || [];
  
  if (stakeholders.length === 0) return this.toast('Agregue primero al menos un auditado o parte interesada.', 'error');
  if (templates.length === 0) return this.toast('No hay plantillas de encuesta disponibles.', 'error');
  
  let html = `
    <div class="space-y-6">
      <div class="bg-primary/10 border-l-4 border-primary p-3 rounded-r-lg text-xs text-primary font-medium">
        Se enviará un correo electrónico corporativo con un enlace único y seguro para cada destinatario seleccionado.
      </div>
      <div class="form-group">
        <label class="form-label text-xs font-bold uppercase tracking-wider text-on-surface-variant/80">Plantilla de Encuesta</label>
        <select class="form-input bg-surface-container-low cursor-pointer font-semibold" id="distTemplateId">
          ${templates.map(t => `<option value="${t.id}">${t.name}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label class="form-label text-xs font-bold uppercase tracking-wider text-on-surface-variant/80 mb-2 block">Destinatarios</label>
        <div class="max-h-56 overflow-y-auto bg-surface-container-lowest rounded-2xl border border-outline-variant p-2 flex flex-col gap-1 shadow-sm custom-scrollbar">
          ${stakeholders.map(s => `
            <label class="flex items-center gap-3 p-3 hover:bg-surface-container-low cursor-pointer rounded-xl transition-colors border border-transparent hover:border-outline-variant/30 group">
              <input type="checkbox" class="w-4 h-4 text-primary bg-surface border-outline-variant rounded focus:ring-primary cursor-pointer" value="${s.id}" checked>
              <div class="flex flex-col flex-1">
                <span class="text-sm font-bold text-on-surface group-hover:text-primary transition-colors">${s.name} <span class="text-[10px] text-on-surface-variant uppercase ml-1">${s.role_title}</span></span>
                <span class="text-[11px] text-on-surface-variant font-medium">${s.email}</span>
              </div>
              ${s.survey_status === 'Enviada' ? '<span class="text-[10px] font-bold bg-amber-100 text-amber-700 px-2 py-0.5 rounded uppercase tracking-widest">Ya enviada</span>' : ''}
              ${s.survey_status === 'Respondida' ? '<span class="text-[10px] font-bold bg-green-100 text-green-700 px-2 py-0.5 rounded uppercase tracking-widest">Ya respondida</span>' : ''}
            </label>
          `).join('')}
        </div>
      </div>
    </div>
  `;
  
  this.openModal('Distribuir Encuestas', html, `
    <button class="btn btn-secondary font-bold" onclick="app.closeModal()">Cancelar</button>
    <button class="btn btn-primary font-bold shadow-ambient flex items-center gap-2" onclick="app.distributeSurvey('${aid}')"><span class="material-symbols-outlined text-[18px]">send</span> Confirmar Envío</button>
  `);
};

app.distributeSurvey = async function(aid) {
  const template_id = document.getElementById('distTemplateId').value;
  const checkboxes = document.querySelectorAll('input[type="checkbox"]:checked');
  const stakeholders = Array.from(checkboxes).map(cb => cb.value);
  
  if (stakeholders.length === 0) return this.toast('Debe seleccionar al menos un destinatario.', 'error');
  
  const btn = document.querySelector('#modalFooter .btn-primary');
  if(btn) {
    btn.disabled = true;
    btn.innerHTML = '<span class="material-symbols-outlined text-[18px] animate-spin">refresh</span> Enviando...';
  }
  
  const res = await this.post(`/api/audits/${aid}/distribute-survey`, { template_id, stakeholders });
  if (res && res.status === 'success') {
    this.toast('Encuestas enviadas exitosamente (Correos Simulados)');
    this.closeModal();
    this.loadAuditSurveySection(aid, false);
  } else {
    this.toast('Error al enviar encuestas', 'error');
    if(btn) {
      btn.disabled = false;
      btn.innerHTML = '<span class="material-symbols-outlined text-[18px]">send</span> Confirmar Envío';
    }
  }
};

app.copySurveyLink = function(token) {
  const url = window.location.origin + '/survey_fill.html?token=' + token;
  navigator.clipboard.writeText(url).then(() => {
    this.toast('Enlace copiado al portapapeles');
  }).catch(err => {
    this.toast('Error al copiar el enlace', 'error');
  });
};

app.resendSurvey = async function(aid, sid) {
  if (!confirm('¿Reenviar la encuesta a esta parte interesada?')) return;
  const res = await this.post(`/api/audits/${aid}/stakeholders/${sid}/resend`, {});
  if (res && res.status === 'success') {
    this.toast('Encuesta reenviada exitosamente (Correo Simulado)');
    this.loadAuditSurveySection(aid, false);
  } else {
    this.toast('Error al reenviar encuesta', 'error');
  }
};

// ── Surveys Module (Standalone) ──
app.surveysTab = 'dashboard';

app.renderSurveysModule = async function(updateKey = null, updateVal = null) {
  if (updateKey !== null) {
    if (!this.surveysFilters) this.surveysFilters = { area: '', year: '', status: '', search: '' };
    this.surveysFilters[updateKey] = updateVal;
  }
  if (!this.surveysFilters) this.surveysFilters = { area: '', year: '', status: '', search: '' };
  const sf = this.surveysFilters;
  
  const isR = this.user?.role === 'observador';
  const body = document.getElementById('pageBody');
  const tab = app.surveysTab || 'dashboard';
  
  document.getElementById('pageTitle').textContent = 'Encuestas de Satisfacción';
  document.getElementById('pageSubtitle').textContent = 'Módulo Global';
  document.getElementById('headerActions').innerHTML = '';

  let tabsHTML = `
    <div class="flex items-center gap-4 border-b border-outline-variant/60 pb-4 mb-8">
      <button onclick="app.surveysTab='dashboard';app.renderSurveysModule()" class="px-5 py-2.5 rounded-xl text-sm font-bold transition-all ${tab==='dashboard'?'bg-primary text-white shadow-ambient':'text-on-surface-variant hover:bg-surface-container-low hover:text-on-surface'}">📊 Dashboard</button>
      <button onclick="app.surveysTab='history';app.renderSurveysModule()" class="px-5 py-2.5 rounded-xl text-sm font-bold transition-all ${tab==='history'?'bg-primary text-white shadow-ambient':'text-on-surface-variant hover:bg-surface-container-low hover:text-on-surface'}">✉️ Historial de Envíos</button>
      <button onclick="app.surveysTab='templates';app.renderSurveysModule()" class="px-5 py-2.5 rounded-xl text-sm font-bold transition-all ${tab==='templates'?'bg-primary text-white shadow-ambient':'text-on-surface-variant hover:bg-surface-container-low hover:text-on-surface'}">📝 Plantillas</button>
      ${this.user?.role === 'admin' ? `<button onclick="app.surveysTab='config';app.renderSurveysModule()" class="px-5 py-2.5 rounded-xl text-sm font-bold transition-all ${tab==='config'?'bg-primary text-white shadow-ambient':'text-on-surface-variant hover:bg-surface-container-low hover:text-on-surface'}">⚙️ Configuración</button>` : ''}
    </div>
  `;
  
  let areas = [];
  let areaFilterHTML = '';
  if (['admin', 'gerente'].includes(this.user?.role) && (tab === 'dashboard' || tab === 'history')) {
    areas = await this.get('/api/areas') || [];
    areaFilterHTML = `
      <div class="mb-6 flex justify-end">
        <select class="form-input w-full md:w-64 !bg-surface-container-lowest border border-outline-variant/60 shadow-sm font-semibold text-sm" onchange="app.renderSurveysModule('area', this.value)">
          <option value="">Todas las Áreas</option>
          ${areas.map(a => `<option value="${a.id}" ${sf.area === a.id ? 'selected' : ''}>${a.name}</option>`).join('')}
        </select>
      </div>
    `;
  }
  
  if (tab === 'dashboard') {
    const data = await this.get('/api/surveys/dashboard' + (sf.area ? '?area_id=' + sf.area : ''));
    const topQuestion = data?.question_ranking && data.question_ranking.length > 0 ? data.question_ranking[0] : null;
    const bottomQuestion = data?.question_ranking && data.question_ranking.length > 0 ? data.question_ranking[data.question_ranking.length - 1] : null;
    
    const topGrade = topQuestion ? ((topQuestion.avg_score / 4) * 100).toFixed(1) + '%' : '-';
    const bottomGrade = bottomQuestion ? ((bottomQuestion.avg_score / 4) * 100).toFixed(1) + '%' : '-';

    const insightsHtml = data?.question_ranking && data.question_ranking.length > 0 ? `
      <div class="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
        <div class="bg-surface-container-low p-8 rounded-[2rem] shadow-ambient border border-white/5">
          <div class="flex items-center gap-3 mb-4 text-green-400">
            <span class="material-symbols-outlined text-2xl bg-green-400/10 p-2 rounded-xl">thumb_up</span>
            <h3 class="font-bold text-sm uppercase tracking-widest text-white/80">Aspecto Destacado</h3>
          </div>
          <div class="text-white font-bold text-lg leading-tight mb-6">"${topQuestion.question_text}"</div>
          <div class="inline-flex items-center gap-2 bg-green-500/20 text-green-300 px-3 py-1.5 rounded-lg font-bold text-sm border border-green-500/20">% Satisfacción: ${topGrade}</div>
        </div>
        <div class="bg-surface-container-low p-8 rounded-[2rem] shadow-ambient border border-white/5">
          <div class="flex items-center gap-3 mb-4 text-red-400">
            <span class="material-symbols-outlined text-2xl bg-red-400/10 p-2 rounded-xl">trending_down</span>
            <h3 class="font-bold text-sm uppercase tracking-widest text-white/80">Oportunidad de Mejora</h3>
          </div>
          <div class="text-white font-bold text-lg leading-tight mb-6">"${bottomQuestion.question_text}"</div>
          <div class="inline-flex items-center gap-2 bg-red-500/20 text-red-300 px-3 py-1.5 rounded-lg font-bold text-sm border border-red-500/20">% Satisfacción: ${bottomGrade}</div>
        </div>
      </div>
    ` : `
      <div class="bg-surface-container-low p-8 rounded-[3rem] shadow-ambient text-center text-white/60 mt-6 border border-white/5">
        <span class="material-symbols-outlined text-4xl mb-3">analytics</span>
        <p class="text-sm">Aún no hay suficientes datos para generar indicadores de preguntas.</p>
      </div>
    `;

    body.innerHTML = tabsHTML + areaFilterHTML + `
      <div class="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
        <div class="bg-surface-container-lowest p-8 rounded-[2rem] shadow-ambient flex flex-col justify-center items-center text-center">
          <div class="w-14 h-14 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center mb-4"><span class="material-symbols-outlined text-3xl">send</span></div>
          <div class="text-4xl font-headline font-extrabold text-on-surface">${data?.total_sent || 0}</div>
          <div class="text-xs font-bold uppercase tracking-widest text-on-surface-variant/60 mt-2">Enviadas</div>
        </div>
        <div class="bg-surface-container-lowest p-8 rounded-[2rem] shadow-ambient flex flex-col justify-center items-center text-center">
          <div class="w-14 h-14 rounded-full bg-green-100 text-green-600 flex items-center justify-center mb-4"><span class="material-symbols-outlined text-3xl">task_alt</span></div>
          <div class="text-4xl font-headline font-extrabold text-on-surface">${data?.total_completed || 0}</div>
          <div class="text-xs font-bold uppercase tracking-widest text-on-surface-variant/60 mt-2">Respondidas (${data?.response_rate || 0}%)</div>
        </div>
        <div class="bg-surface-container-lowest p-8 rounded-[2rem] shadow-ambient flex flex-col justify-center items-center text-center">
          <div class="w-14 h-14 rounded-full bg-yellow-100 text-yellow-600 flex items-center justify-center mb-4"><span class="material-symbols-outlined text-3xl">star</span></div>
          <div class="text-4xl font-headline font-extrabold text-on-surface">${data?.avg_score !== null ? ((data.avg_score / 4) * 100).toFixed(1) + '%' : '0%'}</div>
          <div class="text-xs font-bold uppercase tracking-widest text-on-surface-variant/60 mt-2">Promedio General Satisfacción</div>
        </div>
      </div>
      ${insightsHtml}
    `;
  } else if (tab === 'history') {
    let yearOpts = '';
    const currentYear = new Date().getFullYear();
    for (let y = currentYear; y >= currentYear - 5; y--) {
      yearOpts += `<option value="${y}" ${sf.year === y.toString() ? 'selected' : ''}>${y}</option>`;
    }

    const historyFilterHTML = `
      <div class="mb-6 flex flex-wrap items-center gap-4 bg-surface-container-lowest p-4 rounded-2xl shadow-sm border border-outline-variant/30">
        <div class="flex-1 min-w-[200px]">
          <label class="block text-[11px] font-bold text-on-surface-variant uppercase tracking-wider mb-1">Buscar</label>
          <input type="text" class="form-input w-full text-sm font-medium" placeholder="Auditoría o destinatario..." value="${sf.search || ''}" onchange="app.renderSurveysModule('search', this.value)">
        </div>
        ${['admin', 'gerente'].includes(this.user?.role) ? `
        <div class="w-full md:w-48">
          <label class="block text-[11px] font-bold text-on-surface-variant uppercase tracking-wider mb-1">Área</label>
          <select class="form-input w-full text-sm font-medium" onchange="app.renderSurveysModule('area', this.value)">
            <option value="">Todas</option>
            ${areas.map(a => `<option value="${a.id}" ${sf.area === a.id ? 'selected' : ''}>${a.name}</option>`).join('')}
          </select>
        </div>` : ''}
        <div class="w-full md:w-32">
          <label class="block text-[11px] font-bold text-on-surface-variant uppercase tracking-wider mb-1">Año</label>
          <select class="form-input w-full text-sm font-medium" onchange="app.renderSurveysModule('year', this.value)">
            <option value="">Todos</option>
            ${yearOpts}
          </select>
        </div>
        <div class="w-full md:w-40">
          <label class="block text-[11px] font-bold text-on-surface-variant uppercase tracking-wider mb-1">Estado</label>
          <select class="form-input w-full text-sm font-medium" onchange="app.renderSurveysModule('status', this.value)">
            <option value="">Todos</option>
            <option value="Pendiente" ${sf.status === 'Pendiente' ? 'selected' : ''}>Pendiente</option>
            <option value="Respondida" ${sf.status === 'Respondida' ? 'selected' : ''}>Respondida</option>
          </select>
        </div>
      </div>
    `;

    const qs = new URLSearchParams();
    if(sf.area) qs.append('area_id', sf.area);
    if(sf.year) qs.append('year', sf.year);
    if(sf.status) qs.append('status', sf.status);
    if(sf.search) qs.append('search', sf.search);

    const history = await this.get('/api/surveys/history?' + qs.toString()) || [];
    body.innerHTML = tabsHTML + historyFilterHTML + `
      <div class="bg-surface-container-low p-8 rounded-[3rem] shadow-ambient">
        <div class="flex items-center justify-between mb-8">
          <div>
            <h3 class="text-xl font-headline font-extrabold text-white">Historial de Envíos</h3>
            <p class="text-sm text-white/80 font-medium">Registro de todas las encuestas enviadas a auditados</p>
          </div>
        </div>
        <div class="overflow-x-auto rounded-2xl border border-outline-variant/30 bg-surface-container-lowest shadow-sm">
          <table class="w-full text-left border-collapse">
            <thead>
              <tr class="bg-surface-variant text-on-surface-variant text-xs uppercase tracking-widest font-bold">
                <th class="p-4 rounded-tl-2xl">Fecha Envío</th>
                <th class="p-4">Auditoría / Área</th>
                <th class="p-4">Destinatario</th>
                <th class="p-4">Estado</th>
                <th class="p-4">Nota</th>
                <th class="p-4 rounded-tr-2xl text-center">Acción</th>
              </tr>
            </thead>
            <tbody class="text-sm font-medium text-on-surface divide-y divide-outline-variant/30">
              ${history.length === 0 ? '<tr><td colspan="6" class="p-8 text-center text-on-surface-variant/60">No hay encuestas enviadas.</td></tr>' :
                history.map(h => {
                  const isPending = h.status.toUpperCase() === 'PENDIENTE' || h.status.toUpperCase() === 'ENVIADA';
                  const statusColor = isPending ? 'text-yellow-600 bg-yellow-100' : 'text-green-600 bg-green-100';
                  
                  const dDate = h.sent_at ? new Date(h.sent_at) : null;
                  const dateStr = dDate ? this.fmtDate(h.sent_at) + " " + dDate.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : '—';
                  
                  return `
                  <tr class="hover:bg-surface-variant/20 transition-colors">
                    <td class="p-4">${dateStr}</td>
                    <td class="p-4">
                      <div class="font-bold">${h.audit_name}</div>
                      <div class="text-xs text-on-surface-variant/60">${h.responsible_area || 'Sin área'}</div>
                    </td>
                    <td class="p-4">
                      <div class="font-bold">${h.stakeholder_name}</div>
                      <div class="text-xs text-on-surface-variant/60">${h.stakeholder_email}</div>
                    </td>
                    <td class="p-4">
                      <span class="px-2 py-1 rounded-lg text-xs font-bold ${statusColor}">${h.status}</span>
                    </td>
                    <td class="p-4 font-bold text-sm">
                      ${h.status.toUpperCase() === 'RESPONDIDA' && h.avg_score !== null ? `<span class="text-green-700 bg-green-100 px-2 py-1 rounded">${((h.avg_score / 4) * 100).toFixed(1)}% Satisfacción</span>` : '<span class="text-on-surface-variant/40">—</span>'}
                    </td>
                    <td class="p-4 text-center">
                      ${isPending ? `<button class="text-primary hover:text-primary-container bg-primary/10 hover:bg-primary/20 p-2 rounded-xl transition-colors" onclick="app.resendGlobalSurvey('${h.id}')" title="Reenviar Correo"><span class="material-symbols-outlined text-[18px]">forward_to_inbox</span></button>` : `<div class="flex flex-col items-center gap-1"><span class="text-on-surface-variant/40 text-[10px] uppercase font-bold tracking-widest">Respondida<br>${this.fmtDate(h.responded_at)} ${new Date(h.responded_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span><button class="text-primary text-[10px] uppercase font-bold hover:underline" onclick="app.showSurveyResultsModal('${h.audit_id}')">Ver Detalle</button></div>`}
                    </td>
                  </tr>`;
                }).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  } else if (tab === 'templates') {
    const sTemplates = await this.get('/api/survey-templates') || [];
    document.getElementById('headerActions').innerHTML = `
      <button class="bg-primary text-white font-bold px-6 py-2 rounded-xl text-sm hover:opacity-90 transition-all shadow-sm flex items-center gap-2" onclick="app.showEditSurveyTemplateModal()">
        <span class="material-symbols-outlined text-[18px]">add</span> Nueva Plantilla
      </button>
    `;
    body.innerHTML = tabsHTML + `
      <div class="bg-surface-container-low p-8 rounded-[3rem] shadow-ambient">
        <div class="flex items-center justify-between mb-8">
          <div>
            <h3 class="text-xl font-headline font-extrabold text-white">Plantillas de Encuestas</h3>
            <p class="text-sm text-white/80 font-medium">Configura las plantillas institucionales para encuestas de satisfacción</p>
          </div>
        </div>
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          ${sTemplates.length === 0 ? '<div class="col-span-full py-10 text-center text-white/60">No hay plantillas de encuestas registradas</div>' :
          sTemplates.map(st => `
            <div class="bg-surface-container-lowest p-8 rounded-[2.5rem] shadow-ambient border border-transparent flex flex-col gap-6 group hover:scale-[1.01] transition-all relative">
              <div class="absolute top-6 right-6 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                 <button class="w-10 h-10 rounded-full bg-surface-container-low hover:bg-primary hover:text-white flex items-center justify-center text-on-surface transition-all shadow-sm" onclick="app.showEditSurveyTemplateModal('${st.id}')" title="Editar"><span class="material-symbols-outlined text-[18px]">edit</span></button>
                 <button class="w-10 h-10 rounded-full bg-error-container/30 hover:bg-error hover:text-white flex items-center justify-center text-error transition-all shadow-sm" onclick="app.deleteSurveyTemplate('${st.id}')" title="Eliminar"><span class="material-symbols-outlined text-[18px]">delete</span></button>
              </div>
              <div class="flex items-center gap-4 pr-24">
                <div class="w-14 h-14 rounded-[1.5rem] bg-surface-container-low text-primary flex items-center justify-center group-hover:bg-primary group-hover:text-white transition-all shadow-sm flex-shrink-0">
                  <span class="material-symbols-outlined text-[24px]">assignment</span>
                </div>
                <div>
                  <div class="text-xl font-headline font-extrabold text-on-surface leading-tight group-hover:text-primary transition-colors">${st.name}</div>
                  <div class="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant/40 mt-1">${this.fmtDate(st.created_at)}</div>
                </div>
              </div>
              <div class="text-sm font-medium text-on-surface-variant/60 leading-relaxed line-clamp-2">${st.description || 'Sin descripción'}</div>
              <div class="mt-auto pt-6 border-t border-outline-variant/30 flex justify-end">
                <button class="bg-surface-container-low hover:bg-primary hover:text-white text-primary px-6 py-3 rounded-full text-xs font-bold transition-all shadow-sm flex items-center gap-2" onclick="app.renderSurveyBuilder('${st.id}')">
                   <span class="material-symbols-outlined text-[18px]">tune</span> Configurar Preguntas
                </button>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  } else if (tab === 'config' && this.user?.role === 'admin') {
    const s = await this.get('/api/settings/survey') || {};
    body.innerHTML = tabsHTML + `
      <div class="bg-surface-container-low p-8 rounded-[3rem] shadow-ambient max-w-4xl mx-auto">
        <div class="mb-8 border-b border-outline-variant/30 pb-6">
          <h3 class="text-2xl font-headline font-extrabold text-white">Configuración de Envío de Correos</h3>
          <p class="text-sm text-white/70 mt-2">Configura el servidor SMTP y la plantilla del correo que le llegará al auditado.</p>
        </div>
        
        <div class="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
          <div class="space-y-4">
            <h4 class="text-lg font-bold text-primary flex items-center gap-2"><span class="material-symbols-outlined">dns</span> Servidor SMTP</h4>
            <div class="form-group">
              <label class="form-label text-white/80">Host SMTP</label>
              <input type="text" id="smtpHost" class="form-input bg-surface-container-lowest" value="${s.smtp_host || ''}" placeholder="ej. smtp.office365.com">
            </div>
            <div class="form-group">
              <label class="form-label text-white/80">Puerto SMTP</label>
              <input type="number" id="smtpPort" class="form-input bg-surface-container-lowest" value="${s.smtp_port || '587'}">
            </div>
          </div>
          <div class="space-y-4">
            <h4 class="text-lg font-bold text-primary flex items-center gap-2"><span class="material-symbols-outlined">lock</span> Credenciales</h4>
            <div class="form-group">
              <label class="form-label text-white/80">Usuario / Correo Emisor</label>
              <input type="text" id="smtpUser" class="form-input bg-surface-container-lowest" value="${s.smtp_user || ''}">
            </div>
            <div class="form-group">
              <label class="form-label text-white/80">Contraseña</label>
              <input type="password" id="smtpPass" class="form-input bg-surface-container-lowest" value="${s.smtp_pass || ''}" placeholder="Dejar en blanco para no cambiar">
            </div>
          </div>
        </div>
        
        <div class="space-y-4 mb-8">
          <h4 class="text-lg font-bold text-primary flex items-center gap-2"><span class="material-symbols-outlined">mark_email_unread</span> Plantilla de Correo de Envío</h4>
          <div class="bg-surface-variant/30 p-4 rounded-xl text-xs text-white/70 mb-4 border border-outline-variant/30">
            <strong>Variables dinámicas permitidas:</strong><br>
            <code class="text-primary bg-primary/10 px-1 rounded">{{audit_name}}</code> : Nombre de la Auditoría<br>
            <code class="text-primary bg-primary/10 px-1 rounded">{{evaluator_name}}</code> : Nombre del Destinatario<br>
            <code class="text-primary bg-primary/10 px-1 rounded">{{link}}</code> : URL segura para responder la encuesta
          </div>
          <div class="form-group">
            <label class="form-label text-white/80">Asunto del Correo</label>
            <input type="text" id="emailSubject" class="form-input bg-surface-container-lowest" value="${s.survey_email_subject || ''}">
          </div>
          <div class="form-group">
            <label class="form-label text-white/80">Cuerpo del Correo</label>
            <textarea id="emailBody" class="form-input bg-surface-container-lowest min-h-[150px] font-mono text-sm">${s.survey_email_body || ''}</textarea>
          </div>
        </div>

        <div class="space-y-4 mb-8 border-t border-outline-variant/30 pt-6">
          <h4 class="text-lg font-bold text-primary flex items-center gap-2"><span class="material-symbols-outlined">notifications_active</span> Notificación de Encuestas Respondidas</h4>
          <div class="bg-surface-variant/30 p-4 rounded-xl text-xs text-white/70 mb-4 border border-outline-variant/30">
            Configura los correos que recibirán automáticamente una notificación con el <strong>% de satisfacción</strong> y el <strong>informe PDF adjunto</strong> en cuanto un auditado responda una encuesta.
          </div>
          <div class="flex items-center gap-3 mb-4">
            <input type="checkbox" id="notifyEnabled" class="w-5 h-5 accent-primary rounded cursor-pointer" ${s.survey_notify_enabled === 'true' || s.survey_notify_enabled === '1' || s.survey_notify_enabled === true ? 'checked' : ''}>
            <label for="notifyEnabled" class="text-sm font-bold text-white cursor-pointer">Activar envío automático de notificaciones al responder encuestas</label>
          </div>
          <div class="form-group">
            <label class="form-label text-white/80">Correos Notificados (separados por coma)</label>
            <input type="text" id="notifyEmails" class="form-input bg-surface-container-lowest" value="${s.survey_notify_emails || ''}" placeholder="ej: controlgestion@empresa.cl, jefatura@empresa.cl">
          </div>

          <div class="space-y-4 mt-6">
            <h5 class="text-sm font-bold text-primary flex items-center gap-2"><span class="material-symbols-outlined text-[18px]">badge</span> Plantilla del Correo de Notificación</h5>
            <div class="bg-surface-variant/30 p-4 rounded-xl text-xs text-white/70 mb-4 border border-outline-variant/30">
              <strong>Variables dinámicas permitidas:</strong><br>
              <code class="text-primary bg-primary/10 px-1 rounded">{{audit_name}}</code> : Nombre de la Auditoría<br>
              <code class="text-primary bg-primary/10 px-1 rounded">{{evaluator_name}}</code> : Nombre del Evaluador<br>
              <code class="text-primary bg-primary/10 px-1 rounded">{{score_pct}}</code> : % de Satisfacción Obtenido
            </div>
            <div class="form-group">
              <label class="form-label text-white/80">Asunto del Correo de Notificación</label>
              <input type="text" id="notifySubject" class="form-input bg-surface-container-lowest" value="${s.survey_notify_subject || '[Notificación] Encuesta Respondida: {{audit_name}} - {{score_pct}}% Satisfacción'}">
            </div>
            <div class="form-group">
              <label class="form-label text-white/80">Cuerpo del Correo de Notificación</label>
              <textarea id="notifyBody" class="form-input bg-surface-container-lowest min-h-[120px] font-mono text-sm">${s.survey_notify_body || 'Estimados,\n\nSe ha recibido la respuesta a la Encuesta de Satisfacción para la auditoría \'{{audit_name}}\'.\n\nEvaluador: {{evaluator_name}}\n% de Satisfacción Alcanzado: {{score_pct}}%\n\nSe adjunta el reporte detallado en formato PDF.\n\nSaludos,\nSistema de Auditoría Interna'}</textarea>
            </div>
          </div>
        </div>
        
        <div class="flex justify-end pt-6 border-t border-outline-variant/30">
          <button class="bg-primary hover:bg-primary-container hover:text-on-primary-container text-white px-8 py-3 rounded-xl font-bold shadow-ambient transition-all flex items-center gap-2" onclick="app.saveSurveyConfig()">
            <span class="material-symbols-outlined text-[20px]">save</span> Guardar Configuración
          </button>
        </div>
      </div>
    `;
  }
};

app.saveSurveyConfig = async function() {
  const payload = {
    smtp_host: document.getElementById('smtpHost').value.trim(),
    smtp_port: document.getElementById('smtpPort').value.trim(),
    smtp_user: document.getElementById('smtpUser').value.trim(),
    smtp_pass: document.getElementById('smtpPass').value.trim(),
    survey_email_subject: document.getElementById('emailSubject').value.trim(),
    survey_email_body: document.getElementById('emailBody').value.trim(),
    survey_notify_enabled: document.getElementById('notifyEnabled').checked ? 'true' : 'false',
    survey_notify_emails: document.getElementById('notifyEmails').value.trim(),
    survey_notify_subject: document.getElementById('notifySubject').value.trim(),
    survey_notify_body: document.getElementById('notifyBody').value.trim()
  };
  const res = await this.post('/api/settings/survey', payload);
  if (res && res.status === 'success') {
    this.toast("Configuración guardada exitosamente");
    this.renderSurveysModule();
  } else {
    this.toast(res?.error || "Error al guardar configuración", "error");
  }
};

app.resendGlobalSurvey = async function(did) {
  if (!confirm("¿Reenviar el correo de esta encuesta?")) return;
  const res = await this.post(`/api/surveys/${did}/resend`);
  if (res && res.status === 'success') {
    this.toast("Encuesta reenviada exitosamente");
    this.renderSurveysModule();
  } else {
    this.toast(res?.message || "Error al reenviar la encuesta", "error");
  }
};
