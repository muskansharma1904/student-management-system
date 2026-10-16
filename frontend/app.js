(() => {
  'use strict';
  const API = (window.API_BASE_URL || '').replace(/\/$/, '');
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const state = { all: [] };

  // ---------- helpers ----------
  async function api(path, options = {}) {
    let res;
    try {
      res = await fetch(`${API}${path}`, { ...options, headers: { 'Content-Type': 'application/json', ...(options.headers || {}) } });
    } catch (e) {
      throw new Error('Cannot reach the server. If it was idle, wait a moment and try again.');
    }
    let body = null;
    try { body = await res.json(); } catch (_) { /* non-JSON */ }
    if (!res.ok) {
      const detail = body && body.errors ? `: ${body.errors.join(', ')}` : '';
      throw new Error(((body && body.message) || `Request failed (${res.status})`) + detail);
    }
    return body;
  }

  let toastTimer;
  function toast(msg, type = 'success') {
    const t = $('#toast');
    t.textContent = (type === 'success' ? '✓ ' : '⚠ ') + msg;
    t.className = `toast ${type}`;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.add('hidden'), 4000);
  }

  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };
  const COLORS = ['#6366f1', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#06b6d4', '#3b82f6', '#ef4444'];
  function avatar(name) {
    const parts = String(name).trim().split(/\s+/);
    const a = el('div', 'avatar', ((parts[0] || '?')[0] + (parts[1] ? parts[1][0] : '')).toUpperCase());
    let h = 0; for (const c of String(name)) h = (h * 31 + c.charCodeAt(0)) >>> 0;
    a.style.background = COLORS[h % COLORS.length];
    return a;
  }
  const svgIcon = (paths) => {
    const ns = 'http://www.w3.org/2000/svg';
    const s = document.createElementNS(ns, 'svg'); s.setAttribute('viewBox', '0 0 24 24');
    paths.forEach((d) => { const p = document.createElementNS(ns, 'path'); p.setAttribute('d', d); s.appendChild(p); });
    return s;
  };
  function iconBtn(label, paths, cls, onClick) {
    const b = el('button', `icon-btn ${cls || ''}`); b.type = 'button';
    b.title = label; b.setAttribute('aria-label', label);
    b.appendChild(svgIcon(paths)); b.addEventListener('click', onClick);
    return b;
  }
  const EDIT = ['M12 20h9', 'M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z'];
  const TRASH = ['M3 6h18', 'M8 6V4h8v2', 'M19 6l-1 14H6L5 6', 'M10 11v6M14 11v6'];

  function showSkeleton(container, n = 5) {
    container.replaceChildren(...Array.from({ length: n }, () => el('div', 'skeleton')));
  }

  function renderTable(container, students, emptyMsg) {
    container.replaceChildren();
    if (!students.length) { container.appendChild(el('div', 'empty', emptyMsg)); return; }
    const wrap = el('div', 'table-wrap');
    const table = el('table');
    const hr = table.createTHead().insertRow();
    ['Student', 'ID', 'Department', 'Semester', 'Contact', ''].forEach((h) => hr.appendChild(el('th', '', h)));
    const tbody = table.createTBody();
    students.forEach((s) => {
      const tr = tbody.insertRow();
      const c1 = tr.insertCell(); c1.className = 'who-cell';
      const who = el('div', 'who'); const info = el('div');
      info.append(el('b', '', s.name), el('small', '', s.email));
      who.append(avatar(s.name), info); c1.appendChild(who);
      const cell = (label, node) => { const td = tr.insertCell(); td.dataset.label = label; td.appendChild(node); };
      cell('ID', el('span', 'chip id', s.studentId));
      cell('Department', el('span', 'chip', s.department));
      cell('Semester', el('span', 'chip sem', `Sem ${s.semester}`));
      cell('Contact', document.createTextNode(s.contact || '—'));
      const act = tr.insertCell(); act.className = 'row-actions';
      act.append(iconBtn('Edit', EDIT, '', () => openEdit(s)), iconBtn('Delete', TRASH, 'del', () => openDelete(s)));
    });
    wrap.appendChild(table); container.appendChild(wrap);
  }

  function clientValidate(form) {
    let ok = true;
    $$('input', form).forEach((i) => i.classList.remove('invalid'));
    const bad = (n) => { form.elements[n].classList.add('invalid'); ok = false; };
    $$('input[required]', form).forEach((i) => { if (!i.disabled && !i.value.trim()) bad(i.name); });
    const email = form.elements.email.value;
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) bad('email');
    const sem = Number(form.elements.semester.value);
    if (!Number.isInteger(sem) || sem < 1 || sem > 12) bad('semester');
    const contact = form.elements.contact.value.trim();
    if (contact && !/^[0-9+\-\s]{7,15}$/.test(contact)) bad('contact');
    const idf = form.elements.studentId;
    if (!idf.disabled && idf.value && !/^[A-Za-z0-9-]{1,20}$/.test(idf.value.trim())) bad('studentId');
    if (!ok) toast('Please correct the highlighted fields', 'error');
    return ok;
  }
  const formData = (form) => {
    const d = {};
    ['studentId', 'name', 'email', 'department', 'semester', 'contact'].forEach((k) => {
      const e = form.elements[k];
      if (e && !e.disabled) d[k] = k === 'semester' ? Number(e.value) : e.value.trim();
    });
    return d;
  };
  $$('input').forEach((i) => i.addEventListener('input', () => i.classList.remove('invalid')));

  // ---------- data ----------
  async function fetchAll() {
    const r = await api('/api/students');
    state.all = r.data || [];
    const nb = $('#nav-count'); nb.textContent = state.all.length; nb.classList.remove('hidden');
    const depts = [...new Set(state.all.map((s) => s.department))].sort();
    $('#dept-list').replaceChildren(...depts.map((d) => { const o = el('option'); o.value = d; return o; }));
    const sel = $('#dept-filter'); const cur = sel.value;
    sel.replaceChildren(Object.assign(el('option', '', 'All departments'), { value: '' }),
      ...depts.map((d) => Object.assign(el('option', '', d), { value: d })));
    sel.value = depts.includes(cur) ? cur : '';
    return state.all;
  }

  // ---------- navigation ----------
  function showPage(name) {
    $$('.page').forEach((p) => p.classList.add('hidden'));
    $(`#page-${name}`).classList.remove('hidden');
    $$('#nav button').forEach((b) => b.classList.toggle('active', b.dataset.page === name));
    window.scrollTo({ top: 0 });
    if (name === 'list') loadList();
    if (name === 'home') loadHome();
    if (name === 'add') setTimeout(() => $('#add-form').elements.studentId.focus(), 50);
    if (name === 'search') $('#search-input').focus();
  }
  $('#nav').addEventListener('click', (e) => { const b = e.target.closest('button[data-page]'); if (b) showPage(b.dataset.page); });
  document.addEventListener('click', (e) => { const g = e.target.closest('[data-go]'); if (g) showPage(g.dataset.go); });

  // ---------- theme ----------
  $('#theme-btn').addEventListener('click', () => {
    const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem('theme', next); } catch (_) {}
  });

  // ---------- dashboard ----------
  function setStatus(kind, text) { $('#api-dot').className = `dot ${kind}`; $('#api-status').textContent = text; }
  function countUp(node, to) {
    const start = performance.now();
    const step = (t) => { const p = Math.min((t - start) / 600, 1); node.textContent = Math.round(to * p); if (p < 1) requestAnimationFrame(step); };
    requestAnimationFrame(step);
  }
  async function loadHome() {
    setStatus('wait wait', 'Connecting…');
    const wake = setTimeout(() => { $('#wake-note').classList.remove('hidden'); setStatus('wait wait', 'Waking up server…'); }, 3500);
    showSkeleton($('#recent'), 3);
    try {
      const h = await api('/health');
      clearTimeout(wake); $('#wake-note').classList.add('hidden');
      setStatus('ok', 'API online');
      $('#stat-db').textContent = h.database === 'connected' ? 'Connected' : h.database;
      const all = await fetchAll();
      countUp($('#stat-total'), all.length);
      const depts = {}; all.forEach((s) => { depts[s.department] = (depts[s.department] || 0) + 1; });
      $('#stat-dept').textContent = Object.keys(depts).length;
      $('#stat-sem').textContent = all.length ? (all.reduce((a, s) => a + s.semester, 0) / all.length).toFixed(1) : '–';

      const recent = [...all].sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0)).slice(0, 5);
      const rc = $('#recent'); rc.replaceChildren();
      if (!recent.length) rc.appendChild(el('div', 'empty', 'No students yet. Add your first one!'));
      recent.forEach((s) => {
        const p = el('div', 'person'); const m = el('div', 'meta');
        m.append(el('b', '', s.name), el('small', '', `${s.studentId} · ${s.email}`));
        p.append(avatar(s.name), m, el('span', 'chip', s.department)); rc.appendChild(p);
      });
      const dc = $('#dept-chart'); dc.replaceChildren();
      const entries = Object.entries(depts).sort((a, b) => b[1] - a[1]).slice(0, 6);
      if (!entries.length) dc.appendChild(el('div', 'empty', 'No data yet.'));
      const max = Math.max(...entries.map((e) => e[1]), 1);
      entries.forEach(([d, n]) => {
        const row = el('div', 'bar-row'); const lbl = el('div', 'lbl');
        lbl.append(el('span', '', d), el('b', '', String(n)));
        const bar = el('div', 'bar'); const fill = el('i'); fill.style.width = '0%'; bar.appendChild(fill);
        row.append(lbl, bar); dc.appendChild(row);
        requestAnimationFrame(() => requestAnimationFrame(() => { fill.style.width = `${(n / max) * 100}%`; }));
      });
    } catch (e) {
      clearTimeout(wake); $('#wake-note').classList.add('hidden');
      setStatus('err', 'API unreachable');
      $('#stat-db').textContent = 'Offline';
      ['#stat-total', '#stat-dept', '#stat-sem'].forEach((s) => { $(s).textContent = '–'; });
      $('#recent').replaceChildren(el('div', 'empty', e.message));
      $('#dept-chart').replaceChildren();
    }
  }

  // ---------- create ----------
  $('#add-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.target;
    if (!clientValidate(form)) return;
    const btn = $('button[type=submit]', form); btn.disabled = true; btn.textContent = 'Saving…';
    try {
      const r = await api('/api/students', { method: 'POST', body: JSON.stringify(formData(form)) });
      toast(r.message || 'Student added successfully');
      form.reset(); form.elements.studentId.focus();
    } catch (err) { toast(err.message, 'error'); }
    finally { btn.disabled = false; btn.textContent = 'Add student'; }
  });

  // ---------- list ----------
  function applyList() {
    const q = $('#filter-input').value.trim().toLowerCase();
    const dept = $('#dept-filter').value; const sort = $('#sort-select').value;
    let rows = state.all.filter((s) => (!dept || s.department === dept) &&
      (!q || [s.name, s.studentId, s.email, s.department].some((v) => String(v).toLowerCase().includes(q))));
    const cmp = {
      name: (a, b) => a.name.localeCompare(b.name), studentId: (a, b) => a.studentId.localeCompare(b.studentId, undefined, { numeric: true }),
      semester: (a, b) => a.semester - b.semester, recent: (a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0)
    }[sort];
    rows = rows.sort(cmp);
    $('#list-sub').textContent = `${rows.length} of ${state.all.length} students`;
    renderTable($('#list-table'), rows, state.all.length ? 'No students match your filters.' : 'No students found. Add one from the "Add Student" page.');
  }
  async function loadList() {
    showSkeleton($('#list-table'));
    try { await fetchAll(); applyList(); }
    catch (err) { $('#list-table').replaceChildren(el('div', 'empty', err.message)); toast(err.message, 'error'); }
  }
  $('#refresh-btn').addEventListener('click', loadList);
  ['input', 'change'].forEach((ev) => { $('#filter-input').addEventListener(ev, applyList); $('#dept-filter').addEventListener(ev, applyList); $('#sort-select').addEventListener(ev, applyList); });

  // ---------- search ----------
  async function runSearch(q) {
    const c = $('#search-table'); showSkeleton(c, 3);
    try {
      const r = await api(`/api/students?search=${encodeURIComponent(q)}`);
      renderTable(c, r.data, 'No matching students found.');
    } catch (err) { c.replaceChildren(el('div', 'empty', err.message)); toast(err.message, 'error'); }
  }
  let searchTimer;
  $('#search-input').addEventListener('input', (e) => {
    clearTimeout(searchTimer);
    const q = e.target.value.trim();
    if (!q) { $('#search-table').replaceChildren(el('div', 'empty', 'Type something to find students.')); return; }
    searchTimer = setTimeout(() => runSearch(q), 400);
  });
  $('#search-form').addEventListener('submit', (e) => {
    e.preventDefault(); clearTimeout(searchTimer);
    const q = $('#search-input').value.trim();
    if (!q) return toast('Enter a search term', 'error');
    runSearch(q);
  });

  const refreshVisible = () => {
    if (!$('#page-list').classList.contains('hidden')) loadList();
    else if (!$('#page-search').classList.contains('hidden') && $('#search-input').value.trim()) runSearch($('#search-input').value.trim());
  };

  // ---------- update ----------
  let editing = null;
  function openEdit(s) {
    editing = s;
    const f = $('#edit-form');
    f.studentId.value = s.studentId; f.name.value = s.name; f.email.value = s.email;
    f.department.value = s.department; f.semester.value = s.semester; f.contact.value = s.contact || '';
    $$('input', f).forEach((i) => i.classList.remove('invalid'));
    $('#edit-modal').classList.remove('hidden'); f.name.focus();
  }
  const closeEdit = () => { $('#edit-modal').classList.add('hidden'); editing = null; };
  $('#edit-cancel').addEventListener('click', closeEdit);
  $('#edit-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.target;
    if (!editing || !clientValidate(form)) return;
    const btn = $('button[type=submit]', form); btn.disabled = true;
    try {
      const r = await api(`/api/students/${encodeURIComponent(editing.studentId)}`, { method: 'PUT', body: JSON.stringify(formData(form)) });
      toast(r.message || 'Student updated successfully');
      closeEdit(); refreshVisible();
    } catch (err) { toast(err.message, 'error'); }
    finally { btn.disabled = false; }
  });

  // ---------- delete ----------
  let deleting = null;
  function openDelete(s) {
    deleting = s;
    $('#delete-text').textContent = `${s.name} (${s.studentId}) will be permanently removed. This cannot be undone.`;
    $('#delete-modal').classList.remove('hidden');
  }
  const closeDelete = () => { $('#delete-modal').classList.add('hidden'); deleting = null; };
  $('#delete-cancel').addEventListener('click', closeDelete);
  $('#delete-confirm').addEventListener('click', async () => {
    if (!deleting) return;
    const btn = $('#delete-confirm'); btn.disabled = true;
    try {
      const r = await api(`/api/students/${encodeURIComponent(deleting.studentId)}`, { method: 'DELETE' });
      toast(r.message || 'Student deleted successfully');
      closeDelete(); refreshVisible();
    } catch (err) { toast(err.message, 'error'); }
    finally { btn.disabled = false; }
  });

  // close modals on Esc / backdrop click
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { closeEdit(); closeDelete(); } });
  $$('.modal').forEach((m) => m.addEventListener('mousedown', (e) => { if (e.target === m) { closeEdit(); closeDelete(); } }));

  loadHome();
})();
