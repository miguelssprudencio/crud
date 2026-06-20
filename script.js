'use strict';

const Store = (() => {
  const KEY_TASKS = 'focus_tasks_v1';
  const KEY_THEME = 'focus_theme_v1';
  const KEY_ORDER = 'focus_order_v1';

  let tasks = [];
 
  function load() {
    try {
      const raw = localStorage.getItem(KEY_TASKS);
      tasks = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(tasks)) tasks = [];
    } catch {
      tasks = [];
    }
    
    tasks = tasks.map(t => ({
      id:        t.id        || uid(),
      title:     t.title     || '',
      done:      !!t.done,
      category:  t.category  || 'other',
      priority:  t.priority  || 'medium',
      createdAt: t.createdAt || Date.now(),
      dueDate:   t.dueDate   || null,
      sortOrder: t.sortOrder != null ? t.sortOrder : Date.now(),
    }));
  }

  function save() {
    try {
      localStorage.setItem(KEY_TASKS, JSON.stringify(tasks));
    } catch {  }
  }

  function getTheme() {
    return localStorage.getItem(KEY_THEME) || 'light';
  }
  function setTheme(val) {
    localStorage.setItem(KEY_THEME, val);
  }


  function getAll() { return tasks; }

  function add({ title, category, priority, dueDate }) {
    const t = {
      id:        uid(),
      title:     title.trim(),
      done:      false,
      category,
      priority,
      createdAt: Date.now(),
      dueDate:   dueDate || null,
      sortOrder: Date.now(),
    };
    tasks.unshift(t);
    save();
    return t;
  }

  function update(id, patch) {
    tasks = tasks.map(t => t.id === id ? { ...t, ...patch } : t);
    save();
  }

  function remove(id) {
    tasks = tasks.filter(t => t.id !== id);
    save();
  }

  function reorder(draggedId, targetId) {
    if (draggedId === targetId) return;
    const dragIdx  = tasks.findIndex(t => t.id === draggedId);
    const targetIdx = tasks.findIndex(t => t.id === targetId);
    if (dragIdx === -1 || targetIdx === -1) return;
    const [dragged] = tasks.splice(dragIdx, 1);
    tasks.splice(targetIdx, 0, dragged);
    
    tasks.forEach((t, i) => { t.sortOrder = tasks.length - i; });
    save();
  }

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  return { load, getAll, add, update, remove, reorder, getTheme, setTheme };
})();

const Filter = (() => {
  let state = {
    status:   'all', 
    cat:      'all',
    priority: 'all',
    sort:     'newest',
    query:    '',
  };

  function get()               { return { ...state }; }
  function set(patch)          { Object.assign(state, patch); }


  function apply(tasks) {
    const { status, cat, priority, sort, query } = state;
    const q = query.toLowerCase().trim();

    let list = tasks.filter(t => {
      if (status === 'pending' && t.done)  return false;
      if (status === 'done'    && !t.done) return false;
      if (cat !== 'all'      && t.category !== cat)     return false;
      if (priority !== 'all' && t.priority !== priority) return false;
      if (q && !t.title.toLowerCase().includes(q))       return false;
      return true;
    });

    const priorityWeight = { high: 3, medium: 2, low: 1 };

    list.sort((a, b) => {
      switch (sort) {
        case 'oldest':   return a.createdAt - b.createdAt;
        case 'priority': return (priorityWeight[b.priority] || 0) - (priorityWeight[a.priority] || 0);
        case 'alpha':    return a.title.localeCompare(b.title, 'pt-BR');
        default:         return b.sortOrder - a.sortOrder; // newest / drag order
      }
    });

    return list;
  }

  return { get, set, apply };
})();



const Toast = (() => {
  const container = document.getElementById('toastContainer');

  const icons = {
    success: `<svg class="toast-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>`,
    error:   `<svg class="toast-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`,
    info:    `<svg class="toast-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`,
  };

  function show(message, type = 'info', duration = 3400) {
    const el = document.createElement('div');
    el.className = `toast toast--${type}`;
    el.setAttribute('role', 'alert');
    el.innerHTML = `${icons[type] || icons.info}<span>${message}</span>`;
    container.appendChild(el);

    const remove = () => {
      if (!el.parentNode) return;
      el.classList.add('is-hiding');
      el.addEventListener('animationend', () => el.remove(), { once: true });
    };

    const timer = setTimeout(remove, duration);
    el.addEventListener('click', () => { clearTimeout(timer); remove(); });
  }

  return { show };
})();



const Modal = (() => {
  const backdrop    = document.getElementById('deleteModal');
  const cancelBtn   = document.getElementById('cancelDelete');
  const confirmBtn  = document.getElementById('confirmDelete');
  let pendingId = null;
  let onConfirmCb = null;

  function open(id, callback) {
    pendingId   = id;
    onConfirmCb = callback;
    backdrop.hidden = false;
    confirmBtn.focus();
  }

  function close() {
    backdrop.hidden = true;
    pendingId = null;
  }

  cancelBtn.addEventListener('click', close);
  confirmBtn.addEventListener('click', () => {
    if (onConfirmCb && pendingId) onConfirmCb(pendingId);
    close();
  });
  backdrop.addEventListener('click', e => { if (e.target === backdrop) close(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });

  return { open };
})();



const Render = (() => {

  const taskList  = document.getElementById('taskList');
  const emptyState = document.getElementById('emptyState');
  const emptyTitle = document.getElementById('emptyTitle');
  const emptySub   = document.getElementById('emptySub');
  const resultInfo = document.getElementById('resultInfo');

  const catLabels = {
    work: 'Trabalho', study: 'Estudos',
    personal: 'Pessoal', health: 'Saúde', other: 'Outros',
  };
  const prioLabels = { high: 'Alta', medium: 'Média', low: 'Baixa' };

  function formatDate(iso) {
    if (!iso) return null;
    const [y, m, d] = iso.split('-').map(Number);
    const date = new Date(y, m - 1, d);
    return date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
  }

  function isOverdue(iso) {
    if (!iso) return false;
    const [y, m, d] = iso.split('-').map(Number);
    const today = new Date(); today.setHours(0,0,0,0);
    return new Date(y, m - 1, d) < today;
  }


  function createTaskEl(task) {
    const li = document.createElement('div');
    li.className = `task-card${task.done ? ' is-done' : ''}`;
    li.setAttribute('role', 'listitem');
    li.setAttribute('data-id', task.id);
    li.setAttribute('data-priority', task.priority);
    li.setAttribute('draggable', 'true');

    const dueFmt     = task.dueDate ? formatDate(task.dueDate) : null;
    const overdue    = isOverdue(task.dueDate);
    const dateClass  = overdue ? 'task-date is-overdue' : 'task-date';

    li.innerHTML = `
      <!-- Checkbox -->
      <div class="task-checkbox-wrap">
        <input
          type="checkbox"
          class="task-checkbox"
          id="chk-${task.id}"
          aria-label="Marcar tarefa como ${task.done ? 'pendente' : 'concluída'}"
          ${task.done ? 'checked' : ''}
        />
      </div>

      <!-- Corpo -->
      <div class="task-body">
        <div class="task-title-wrap">
          <label class="task-title" for="chk-${task.id}" id="title-${task.id}">${escHtml(task.title)}</label>
        </div>
        <div class="task-meta-row">
          <span class="task-badge task-badge--cat" data-cat="${task.category}">${catLabels[task.category] || task.category}</span>
          <span class="task-badge task-badge--prio" data-prio="${task.priority}">${prioLabels[task.priority] || task.priority}</span>
          ${dueFmt ? `
            <span class="${dateClass}">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
                <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/>
                <line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
              </svg>
              ${dueFmt}${overdue ? ' · Atrasada' : ''}
            </span>` : ''}
        </div>
      </div>

      <!-- Ações -->
      <div class="task-actions">
        <button
          class="task-action-btn task-action-btn--edit"
          type="button"
          aria-label="Editar tarefa"
          data-action="edit"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
          </svg>
        </button>
        <button
          class="task-action-btn task-action-btn--delete"
          type="button"
          aria-label="Excluir tarefa"
          data-action="delete"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
            <polyline points="3 6 5 6 21 6"/>
            <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
            <path d="M10 11v6"/><path d="M14 11v6"/>
          </svg>
        </button>
      </div>
    `;

    return li;
  }

  function renderList(filtered, totalAll) {
   
    const existingIds = new Set(filtered.map(t => t.id));
    [...taskList.children].forEach(el => {
      if (!existingIds.has(el.dataset.id)) el.remove();
    });

    filtered.forEach((task, index) => {
      const existing = taskList.querySelector(`[data-id="${task.id}"]`);
      if (existing) {
    
        const chk = existing.querySelector('.task-checkbox');
        const titleEl = existing.querySelector('.task-title');
        if (chk) chk.checked = task.done;
        existing.classList.toggle('is-done', task.done);
        existing.setAttribute('data-priority', task.priority);
        if (titleEl && !titleEl.isContentEditable) titleEl.textContent = task.title;
      } else {
        const el = createTaskEl(task);
        el.style.animationDelay = `${Math.min(index * 40, 280)}ms`;
        taskList.appendChild(el);
      }
    });

    const isEmpty = filtered.length === 0;
    emptyState.hidden = !isEmpty;
    if (isEmpty) {
      const f = Filter.get();
      const isSearching = f.query.trim() !== '';
      const isFiltering = f.status !== 'all' || f.cat !== 'all' || f.priority !== 'all';
      if (isSearching || isFiltering) {
        emptyTitle.textContent = 'Nenhuma tarefa encontrada.';
        emptySub.textContent   = 'Tente ajustar os filtros ou a pesquisa.';
      } else {
        emptyTitle.textContent = 'Tudo limpo por aqui.';
        emptySub.textContent   = 'Adicione sua primeira tarefa acima para começar.';
      }
    }

    if (filtered.length !== totalAll) {
      resultInfo.textContent = `Exibindo ${filtered.length} de ${totalAll} tarefa${totalAll !== 1 ? 's' : ''}`;
    } else {
      resultInfo.textContent = totalAll > 0 ? `${totalAll} tarefa${totalAll !== 1 ? 's' : ''}` : '';
    }
  }

  function escHtml(str) {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  return { renderList };
})();

const Stats = (() => {
  const elTotal   = document.getElementById('statTotal');
  const elDone    = document.getElementById('statDone');
  const elPending = document.getElementById('statPending');
  const elTopCat  = document.getElementById('statTopCat');
  const elPct     = document.getElementById('progressPct');
  const elFill    = document.getElementById('progressFill');
  const elBar     = document.querySelector('.progress-bar');

  const catLabels = {
    work: 'Trabalho', study: 'Estudos',
    personal: 'Pessoal', health: 'Saúde', other: 'Outros',
  };

  function update(tasks) {
    const total   = tasks.length;
    const done    = tasks.filter(t => t.done).length;
    const pending = total - done;
    const pct     = total > 0 ? Math.round((done / total) * 100) : 0;

    elTotal.textContent   = total;
    elDone.textContent    = done;
    elPending.textContent = pending;
    elPct.textContent     = `${pct}%`;
    elFill.style.width    = `${pct}%`;
    if (elBar) {
      elBar.setAttribute('aria-valuenow', pct);
    }

    const counts = {};
    tasks.forEach(t => { counts[t.category] = (counts[t.category] || 0) + 1; });
    const topCat = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
    elTopCat.textContent = topCat ? (catLabels[topCat[0]] || topCat[0]) : '—';
  }

  return { update };
})();

const Theme = (() => {
  const html      = document.documentElement;
  const toggle    = document.getElementById('themeToggle');

  function apply(theme) {
    html.setAttribute('data-theme', theme);
    toggle.setAttribute('aria-label', theme === 'dark' ? 'Mudar para modo claro' : 'Mudar para modo escuro');
  }

  function init() {
    apply(Store.getTheme());
    toggle.addEventListener('click', () => {
      const next = html.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
      apply(next);
      Store.setTheme(next);
    });
  }

  return { init };
})();


const DragDrop = (() => {
  const list = document.getElementById('taskList');
  let dragId = null;

  function init() {
    list.addEventListener('dragstart', onDragStart);
    list.addEventListener('dragend',   onDragEnd);
    list.addEventListener('dragover',  onDragOver);
    list.addEventListener('drop',      onDrop);
    list.addEventListener('dragleave', onDragLeave);
  }

  function onDragStart(e) {
    const card = e.target.closest('.task-card');
    if (!card) return;
    dragId = card.dataset.id;
    card.classList.add('is-dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', dragId);
  }

  function onDragEnd(e) {
    document.querySelectorAll('.task-card').forEach(c => {
      c.classList.remove('is-dragging', 'drag-over');
    });
    dragId = null;
  }

  function onDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const card = e.target.closest('.task-card');
    if (!card || card.dataset.id === dragId) return;
    document.querySelectorAll('.task-card').forEach(c => c.classList.remove('drag-over'));
    card.classList.add('drag-over');
  }

  function onDragLeave(e) {
    const card = e.target.closest('.task-card');
    if (card) card.classList.remove('drag-over');
  }

  function onDrop(e) {
    e.preventDefault();
    const targetCard = e.target.closest('.task-card');
    if (!targetCard || !dragId || targetCard.dataset.id === dragId) return;
    Store.reorder(dragId, targetCard.dataset.id);
    App.refresh();
  }

  return { init };
})();


const SidebarMobile = (() => {
  const toggleBtn = document.getElementById('sidebarToggle');
  const sidebar   = document.getElementById('sidebar');
  const overlay   = document.getElementById('sidebarOverlay');

  function open() {
    sidebar.classList.add('is-open');
    overlay.classList.add('is-visible');
    toggleBtn.setAttribute('aria-expanded', 'true');
    document.body.style.overflow = 'hidden';
  }

  function close() {
    sidebar.classList.remove('is-open');
    overlay.classList.remove('is-visible');
    toggleBtn.setAttribute('aria-expanded', 'false');
    document.body.style.overflow = '';
  }

  function init() {
    toggleBtn.addEventListener('click', () => {
      sidebar.classList.contains('is-open') ? close() : open();
    });
    overlay.addEventListener('click', close);
    document.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });
  }

  return { init, close };
})();

const App = (() => {

  const taskInput     = document.getElementById('taskInput');
  const catSelect     = document.getElementById('taskCategory');
  const prioSelect    = document.getElementById('taskPriority');
  const dueInput      = document.getElementById('taskDue');
  const addBtn        = document.getElementById('addTaskBtn');
  const searchInput   = document.getElementById('searchInput');
  const searchClear   = document.getElementById('searchClear');
  const sortSelect    = document.getElementById('sortSelect');
  const taskList      = document.getElementById('taskList');
  const filterBtns    = document.querySelectorAll('[data-filter]');
  const catBtns       = document.querySelectorAll('[data-cat]');
  const priorityBtns  = document.querySelectorAll('[data-priority]');

  function refresh() {
    const all      = Store.getAll();
    const filtered = Filter.apply(all);
    Render.renderList(filtered, all.length);
    Stats.update(all);
  }

  function addTask() {
    const title = taskInput.value.trim();
    if (!title) {
      taskInput.focus();
      taskInput.classList.add('shake');
      taskInput.addEventListener('animationend', () => taskInput.classList.remove('shake'), { once: true });
      return;
    }
    Store.add({
      title,
      category: catSelect.value,
      priority: prioSelect.value,
      dueDate:  dueInput.value || null,
    });
    taskInput.value = '';
    dueInput.value  = '';
    taskInput.focus();
    refresh();
    Toast.show('Tarefa criada com sucesso.', 'success');
    ripple(addBtn, null);
  }

  function handleListEvents(e) {
    const card = e.target.closest('.task-card');
    if (!card) return;
    const id = card.dataset.id;

    if (e.target.classList.contains('task-checkbox')) {
      const done = e.target.checked;
      Store.update(id, { done });
      card.classList.toggle('is-done', done);
      Toast.show(done ? 'Tarefa concluída!' : 'Tarefa reativada.', done ? 'success' : 'info');
      refresh();
      return;
    }

    const action = e.target.closest('[data-action]')?.dataset.action;

    if (action === 'edit') {
      const titleEl = card.querySelector('.task-title');
      if (!titleEl || titleEl.tagName === 'INPUT') return;

      const currentText = titleEl.textContent;
      const input = document.createElement('input');
      input.type      = 'text';
      input.value     = currentText;
      input.className = 'task-edit-input';
      input.maxLength = 200;
      titleEl.replaceWith(input);
      input.focus();
      input.select();

      const save = () => {
        const newTitle = input.value.trim() || currentText;
        Store.update(id, { title: newTitle });
        refresh();
        if (newTitle !== currentText) Toast.show('Tarefa atualizada.', 'info');
      };

      input.addEventListener('blur',    save, { once: true });
      input.addEventListener('keydown', e => {
        if (e.key === 'Enter') { e.preventDefault(); input.blur(); }
        if (e.key === 'Escape') { input.value = currentText; input.blur(); }
      });
      return;
    }

    if (action === 'delete') {
      Modal.open(id, (confirmedId) => {
        card.classList.add('is-removing');
        card.addEventListener('transitionend', () => {
          Store.remove(confirmedId);
          refresh();
          Toast.show('Tarefa removida.', 'error');
        }, { once: true });
      });
    }
  }

  function initFilterBtns() {
    filterBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        filterBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        Filter.set({ status: btn.dataset.filter });
        refresh();
      });
    });

    catBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        catBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        Filter.set({ cat: btn.dataset.cat });
        refresh();
        SidebarMobile.close();
      });
    });

    priorityBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        priorityBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        Filter.set({ priority: btn.dataset.priority });
        refresh();
        SidebarMobile.close();
      });
    });
  }

  function initSearch() {
    let debounceTimer;
    searchInput.addEventListener('input', () => {
      clearTimeout(debounceTimer);
      const q = searchInput.value;
      searchClear.hidden = q === '';
      debounceTimer = setTimeout(() => {
        Filter.set({ query: q });
        refresh();
      }, 180);
    });
    searchClear.addEventListener('click', () => {
      searchInput.value = '';
      searchClear.hidden = true;
      Filter.set({ query: '' });
      refresh();
      searchInput.focus();
    });
  }

  function initSort() {
    sortSelect.addEventListener('change', () => {
      Filter.set({ sort: sortSelect.value });
      refresh();
    });
  }

  function ripple(btn, e) {
    if (!e) {
      const span = document.createElement('span');
      span.className = 'ripple';
      const diameter = Math.max(btn.clientWidth, btn.clientHeight);
      span.style.cssText = `width:${diameter}px;height:${diameter}px;left:0;top:0;margin:-${diameter/2}px 0 0 -${diameter/2}px`;
      btn.appendChild(span);
      span.addEventListener('animationend', () => span.remove(), { once: true });
      return;
    }
    const rect     = btn.getBoundingClientRect();
    const diameter = Math.max(btn.clientWidth, btn.clientHeight);
    const span     = document.createElement('span');
    span.className = 'ripple';
    span.style.cssText = `
      width:${diameter}px;height:${diameter}px;
      left:${e.clientX - rect.left - diameter / 2}px;
      top:${e.clientY - rect.top - diameter / 2}px;
    `;
    btn.appendChild(span);
    span.addEventListener('animationend', () => span.remove(), { once: true });
  }

  function init() {
    Store.load();
    Theme.init();
    SidebarMobile.init();
    DragDrop.init();

    addBtn.addEventListener('click', e => { ripple(addBtn, e); addTask(); });
    taskInput.addEventListener('keydown', e => { if (e.key === 'Enter') addTask(); });

    taskList.addEventListener('click', handleListEvents);

    initFilterBtns();
    initSearch();
    initSort();

    refresh();
  }

  return { init, refresh };
})();

document.addEventListener('DOMContentLoaded', () => App.init());