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
    <button class="btn btn-primary" onclick="app.showTemplateModal()">
      <span class="material-symbols-outlined text-lg">add</span> Nueva Plantilla
    </button>`;
  const body = document.getElementById('pageBody');
  if (this.templates.length === 0) { 
    body.innerHTML = `<div class="p-20 text-center bg-surface-container-low rounded-[3rem]"><div class="text-4xl mb-4">📝</div><h3 class="text-xl font-headline font-extrabold text-white">Sin plantillas</h3></div>`; return; 
  }
  body.innerHTML = `<div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">${this.templates.map(t => {
    const tc = (t.stages || []).reduce((s,st) => s + (st.tasks?.length||0), 0);
    return `<div class="bg-surface-container-lowest p-8 rounded-[2.5rem] shadow-ambient transition-all hover:scale-[1.01] cursor-pointer group flex flex-col gap-6" onclick="app.showTemplateDetail('${t.id}')">
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

app.showTemplateModal = function(tmpl = null) {
  const isEdit = !!tmpl;
  let stagesHTML = '';
  (tmpl?.stages || [{ name: '', tasks: [{ name: '' }] }]).forEach((s, si) => {
    let tasks = (s.tasks || []).map((t) => `<div class="form-group tmpl-task-row" style="padding-left:24px;display:flex;gap:8px;align-items:center">
      <input class="form-input tmpl-task" placeholder="Tarea" value="${t.name||''}">
      <input type="number" class="form-input tmpl-task-weight" style="width:80px" placeholder="%" value="${t.weight||0}" min="0" max="100" step="0.5" onchange="app.updateTemplateWeightSum()">
      <div class="flex items-center bg-surface-variant/20 rounded border border-outline-variant/30">
        <button class="px-2 py-1 text-on-surface-variant/60 hover:text-primary hover:bg-surface-variant/50 transition-colors rounded-l" title="Subir" onclick="app.moveTaskUp(this)"><span class="material-symbols-outlined text-[14px]">arrow_upward</span></button>
        <button class="px-2 py-1 text-on-surface-variant/60 hover:text-primary hover:bg-surface-variant/50 transition-colors border-l border-r border-outline-variant/30" title="Bajar" onclick="app.moveTaskDown(this)"><span class="material-symbols-outlined text-[14px]">arrow_downward</span></button>
        <button class="px-2 py-1 text-error/70 hover:text-error hover:bg-error-container/50 transition-colors rounded-r" title="Eliminar" onclick="this.closest('.tmpl-task-row').remove();app.updateTemplateWeightSum()"><span class="material-symbols-outlined text-[14px]">close</span></button>
      </div>
    </div>`).join('');
    stagesHTML += `<div class="stage-block" style="border:1px solid var(--border-color);border-radius:12px;padding:16px;margin-bottom:12px">
      <div style="display:flex;gap:8px;align-items:center;margin-bottom:8px"><input class="form-input tmpl-stage" placeholder="Etapa" value="${s.name||''}"><button class="btn btn-xs btn-danger" onclick="this.closest('.stage-block').remove();app.updateTemplateWeightSum()">✕</button></div>
      <div class="tasks-container">${tasks}</div>
      <button class="btn btn-xs btn-secondary" onclick="app.addTemplateTask(this,${si})">+ Tarea</button></div>`;
  });
  
  this.openModal(isEdit?'Editar Plantilla':'Nueva Plantilla', `
    <div class="form-group"><label class="form-label">Nombre *</label><input class="form-input" id="tmplName" value="${tmpl?.name||''}"></div>
    <div class="form-group"><label class="form-label">Descripción</label><textarea class="form-textarea" id="tmplDesc">${tmpl?.description||''}</textarea></div>
    <label class="form-label">Etapas y Tareas</label><div id="stagesContainer">${stagesHTML}</div>
    <div class="flex justify-between items-center mt-md">
      <button class="btn btn-sm btn-secondary" onclick="app.addTemplateStage()">+ Etapa</button>
      <div class="text-sm font-semibold">Suma Total: <span id="tmplWeightSum" class="text-red-600 font-bold">0%</span></div>
    </div>`,
    `<button class="btn btn-secondary" onclick="app.closeModal()">Cancelar</button>
     <button class="btn btn-primary" onclick="app.saveTemplate('${tmpl?.id||''}')">${isEdit?'Guardar':'Crear'}</button>`);
  app.updateTemplateWeightSum();
};

app.updateTemplateWeightSum = function() {
  let sum = 0;
  document.querySelectorAll('.tmpl-task-weight').forEach(input => {
    sum += parseFloat(input.value) || 0;
  });
  const sumEl = document.getElementById('tmplWeightSum');
  if (sumEl) {
    sumEl.textContent = sum.toFixed(1) + '%';
    sumEl.className = Math.abs(sum - 100) < 0.05 ? 'text-green-600 font-bold' : 'text-red-600 font-bold';
  }
};

app.addTemplateStage = function() {
  const div = document.createElement('div');
  div.className = 'stage-block';
  div.style.cssText = 'border:1px solid var(--border-color);border-radius:12px;padding:16px;margin-bottom:12px';
  div.innerHTML = `<div style="display:flex;gap:8px;align-items:center;margin-bottom:8px"><input class="form-input tmpl-stage" placeholder="Etapa"><button class="btn btn-xs btn-danger" onclick="this.closest('.stage-block').remove();app.updateTemplateWeightSum()">✕</button></div>
    <div class="tasks-container">
      <div class="form-group tmpl-task-row" style="padding-left:24px;display:flex;gap:8px;align-items:center">
        <input class="form-input tmpl-task" placeholder="Tarea">
        <input type="number" class="form-input tmpl-task-weight" style="width:80px" placeholder="%" value="0" min="0" max="100" step="0.5" onchange="app.updateTemplateWeightSum()">
        <div class="flex items-center bg-surface-variant/20 rounded border border-outline-variant/30">
          <button class="px-2 py-1 text-on-surface-variant/60 hover:text-primary hover:bg-surface-variant/50 transition-colors rounded-l" title="Subir" onclick="app.moveTaskUp(this)"><span class="material-symbols-outlined text-[14px]">arrow_upward</span></button>
          <button class="px-2 py-1 text-on-surface-variant/60 hover:text-primary hover:bg-surface-variant/50 transition-colors border-l border-r border-outline-variant/30" title="Bajar" onclick="app.moveTaskDown(this)"><span class="material-symbols-outlined text-[14px]">arrow_downward</span></button>
          <button class="px-2 py-1 text-error/70 hover:text-error hover:bg-error-container/50 transition-colors rounded-r" title="Eliminar" onclick="this.closest('.tmpl-task-row').remove();app.updateTemplateWeightSum()"><span class="material-symbols-outlined text-[14px]">close</span></button>
        </div>
      </div>
    </div>
    <button class="btn btn-xs btn-secondary" onclick="app.addTemplateTask(this)">+ Tarea</button>`;
  document.getElementById('stagesContainer').appendChild(div);
};

app.addTemplateTask = function(btn) {
  const container = btn.previousElementSibling;
  const div = document.createElement('div');
  div.className = 'form-group tmpl-task-row';
  div.style.cssText = 'padding-left:24px;display:flex;gap:8px;align-items:center';
  div.innerHTML = `
    <input class="form-input tmpl-task" placeholder="Tarea">
    <input type="number" class="form-input tmpl-task-weight" style="width:80px" placeholder="%" value="0" min="0" max="100" step="0.5" onchange="app.updateTemplateWeightSum()">
    <div class="flex items-center bg-surface-variant/20 rounded border border-outline-variant/30">
      <button class="px-2 py-1 text-on-surface-variant/60 hover:text-primary hover:bg-surface-variant/50 transition-colors rounded-l" title="Subir" onclick="app.moveTaskUp(this)"><span class="material-symbols-outlined text-[14px]">arrow_upward</span></button>
      <button class="px-2 py-1 text-on-surface-variant/60 hover:text-primary hover:bg-surface-variant/50 transition-colors border-l border-r border-outline-variant/30" title="Bajar" onclick="app.moveTaskDown(this)"><span class="material-symbols-outlined text-[14px]">arrow_downward</span></button>
      <button class="px-2 py-1 text-error/70 hover:text-error hover:bg-error-container/50 transition-colors rounded-r" title="Eliminar" onclick="this.closest('.tmpl-task-row').remove();app.updateTemplateWeightSum()"><span class="material-symbols-outlined text-[14px]">close</span></button>
    </div>
  `;
  container.appendChild(div);
};

app.moveTaskUp = function(btn) {
  const row = btn.closest('.tmpl-task-row');
  if(row.previousElementSibling) row.parentNode.insertBefore(row, row.previousElementSibling);
};

app.moveTaskDown = function(btn) {
  const row = btn.closest('.tmpl-task-row');
  if(row.nextElementSibling) row.parentNode.insertBefore(row.nextElementSibling, row);
};

app.saveTemplate = async function(id) {
  const n = document.getElementById('tmplName').value.trim();
  if(!n) return this.toast('El nombre es obligatorio','error');
  let stages = [];
  document.querySelectorAll('.stage-block').forEach(sb => {
    let sname = sb.querySelector('.tmpl-stage').value.trim();
    let tasks = [];
    sb.querySelectorAll('.tmpl-task-row').forEach(tr => {
      let tname = tr.querySelector('.tmpl-task').value.trim();
      let w = parseFloat(tr.querySelector('.tmpl-task-weight').value) || 0;
      if(tname) tasks.push({ name: tname, weight: w });
    });
    if(sname || tasks.length > 0) stages.push({ name: sname, tasks });
  });
  const total = stages.reduce((ts, s) => ts + s.tasks.reduce((tt, t) => tt + t.weight, 0), 0);
  if(stages.some(s => s.tasks.length > 0) && Math.abs(total - 100) > 0.05) {
    return this.toast('La suma total de pesos de las tareas debe ser exactamente 100%','error');
  }
  const d = { name: n, description: document.getElementById('tmplDesc').value.trim(), stages };
  const res = id ? await this.put(`/api/templates/${id}`, d) : await this.post('/api/templates', d);
  if(res?.status==='success') { this.toast('Plantilla guardada'); this.closeModal(); this.renderTemplates(); }
  else this.toast(res?.error || 'Error al guardar', 'error');
};

app.showTemplateDetail = async function(tid) { const t = await this.get(`/api/templates/${tid}`); if (t && !t.error) this.showTemplateModal(t); };
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
