'use strict';

/* ============================================================
   Carnet de Tricot — PWA pour iPad
   Suivi du temps de tricot et de la laine utilisée par projet
   ============================================================ */

// ---------- Références DOM ----------
const $ = (id) => document.getElementById(id);

const views = {
  dashboard: $('view-dashboard'),
  projects: $('view-projects'),
  project: $('view-project'),
  projectForm: $('view-project-form'),
};

const projectList = $('project-list');
const projectsEmpty = $('projects-empty');
const searchInput = $('search-input');
const dashboardEmpty = $('dashboard-empty');
const projectRanking = $('project-ranking');
const recentSessions = $('recent-sessions');

const projectTitle = $('project-title');
const projectBadge = $('project-status-badge');
const projectMeta = $('project-meta');
const sessionList = $('session-list');
const sessionsTotal = $('sessions-total');
const yarnList = $('yarn-list');
const yarnTotal = $('yarn-total');

const timerDisplay = $('timer-display');
const btnTimerPrimary = $('btn-timer-primary');
const btnTimerStop = $('btn-timer-stop');
const timerHint = $('timer-hint');
const timerBox = $('timer-box');

const stitchDisplay = $('stitch-display');
const stitchInput = $('stitch-input');
const stitchHint = $('stitch-hint');

const formTitle = $('form-title');
const projectName = $('project-name');
const projectPattern = $('project-pattern');
const projectStatus = $('project-status');
const projectDate = $('project-date');
const projectNotes = $('project-notes');
const formMessage = $('project-form-message');

// Templates
const projectTpl = $('project-item-template');
const sessionTpl = $('session-item-template');
const yarnTpl = $('yarn-item-template');

// ---------- État ----------
let allProjects = [];
let allSessions = [];
let allYarns = [];
let currentProjectId = null;
let editingProjectId = null;

// ---------- IndexedDB ----------
const DB_NAME = 'carnet-tricot';
const DB_VERSION = 1;
const STORES = { projets: 'projets', sessions: 'sessions', laines: 'laines' };
let db = null;

function openDB() {
  return new Promise((resolve, reject) => {
    if (db) return resolve(db);
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const d = e.target.result;
      if (!d.objectStoreNames.contains(STORES.projets)) {
        d.createObjectStore(STORES.projets, { keyPath: 'id' });
      }
      if (!d.objectStoreNames.contains(STORES.sessions)) {
        d.createObjectStore(STORES.sessions, { keyPath: 'id' });
      }
      if (!d.objectStoreNames.contains(STORES.laines)) {
        d.createObjectStore(STORES.laines, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => { db = req.result; resolve(db); };
    req.onerror = () => reject(req.error);
  });
}

function txStore(name, mode) {
  return db.transaction(name, mode).objectStore(name);
}

function getAll(name) {
  return new Promise((resolve, reject) => {
    const r = txStore(name, 'readonly').getAll();
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

function putItem(name, item) {
  return new Promise((resolve, reject) => {
    const r = txStore(name, 'readwrite').put(item);
    r.onsuccess = () => resolve(item);
    r.onerror = () => reject(r.error);
  });
}

function delItem(name, id) {
  return new Promise((resolve, reject) => {
    const r = txStore(name, 'readwrite').delete(id);
    r.onsuccess = () => resolve();
    r.onerror = () => reject(r.error);
  });
}

// ---------- Utilitaires ----------
function uid() {
  return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
}

function pad(n) {
  return String(n).padStart(2, '0');
}

function todayInput() {
  const d = new Date();
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
}

function formatDateStr(yyyymmdd) {
  if (!yyyymmdd) return '';
  const parts = yyyymmdd.split('-');
  if (parts.length !== 3) return yyyymmdd;
  return parts[2] + '/' + parts[1] + '/' + parts[0];
}

function formatDur(min) {
  if (!min || min <= 0) return '0 min';
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  if (h === 0) return m + ' min';
  if (m === 0) return h + ' h';
  return h + ' h ' + m + ' min';
}

function formatHMS(ms) {
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return pad(h) + ':' + pad(m) + ':' + pad(s);
}

function formatGrams(g) {
  return (Math.round(g || 0) + ' g');
}

function formatCount(n) {
  return String(Math.round(n || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

function formatYarn(g, m) {
  if (g && m) return Math.round(g) + ' g · ' + Math.round(m) + ' m';
  if (g) return Math.round(g) + ' g';
  if (m) return Math.round(m) + ' m';
  return '—';
}

function parseDuration(str) {
  const s = (str || '').trim().toLowerCase();
  if (!s) return null;
  const hm = s.match(/^(\d{1,3})\s*[:h]\s*(\d{1,2})$/);
  if (hm) return parseInt(hm[1], 10) * 60 + parseInt(hm[2], 10);
  const hOnly = s.match(/^(\d{1,3})\s*h$/);
  if (hOnly) return parseInt(hOnly[1], 10) * 60;
  const num = parseFloat(s.replace(',', '.'));
  if (isFinite(num) && num > 0) return Math.round(num);
  return null;
}

const STATUS_LABELS = {
  en_cours: 'En cours',
  en_attente: 'En attente',
  termine: 'Terminé',
};

// ---------- Navigation ----------
function showView(name) {
  Object.keys(views).forEach((k) => views[k].classList.remove('active'));
  views[name].classList.add('active');
  window.scrollTo(0, 0);
  if (name === 'dashboard') renderDashboard();
  if (name === 'projects') renderProjects();
  if (name === 'project') renderProjectDetail();
}

function showMessage(msg, type) {
  formMessage.textContent = msg;
  formMessage.className = 'message ' + (type || 'ok');
  clearTimeout(showMessage._t);
  showMessage._t = setTimeout(() => {
    formMessage.textContent = '';
    formMessage.className = 'message';
  }, 4000);
}

// ---------- Données dérivées ----------
function sessionsOf(projetId) {
  return allSessions.filter((s) => s.projetId === projetId);
}

function yarnsOf(projetId) {
  return allYarns.filter((y) => y.projetId === projetId);
}

function timeOf(projetId) {
  return sessionsOf(projetId).reduce((sum, s) => sum + (s.dureeMin || 0), 0);
}

function stitchesOf(projetId) {
  return sessionsOf(projetId).reduce((sum, s) => sum + (s.mailles || 0), 0);
}

function yarnTotalsOf(projetId) {
  return yarnsOf(projetId).reduce(
    (acc, y) => ({ g: acc.g + (y.grammes || 0), m: acc.m + (y.metres || 0) }),
    { g: 0, m: 0 }
  );
}

function projectOf(id) {
  return allProjects.find((p) => p.id === id);
}

// ---------- Rendu : Tableau de bord ----------
function renderDashboard() {
  const totalMin = allSessions.reduce((sum, s) => sum + (s.dureeMin || 0), 0);
  const totalStitches = allSessions.reduce((sum, s) => sum + (s.mailles || 0), 0);
  const runningCount = allProjects.filter((p) => p.status === 'en_cours').length;
  const { g, m } = allYarns.reduce(
    (acc, y) => ({ g: acc.g + (y.grammes || 0), m: acc.m + (y.metres || 0) }),
    { g: 0, m: 0 }
  );

  $('stat-time').textContent = formatDur(totalMin);
  $('stat-projects').textContent = runningCount;
  $('stat-yarn').textContent = formatYarn(g, m);
  $('stat-stitches').textContent = formatCount(totalStitches);

  // Classement par projet
  const ranked = allProjects
    .map((p) => ({ p, time: timeOf(p.id), yarn: yarnTotalsOf(p.id), stitches: stitchesOf(p.id) }))
    .sort((a, b) => b.time - a.time);
  const maxTime = ranked.length ? Math.max(...ranked.map((r) => r.time)) : 0;

  projectRanking.innerHTML = '';
  dashboardEmpty.classList.toggle('hidden', allProjects.length > 0);

  ranked.forEach(({ p, time, yarn, stitches }) => {
    const li = document.createElement('li');
    li.className = 'doc-item';
    li.addEventListener('click', () => openProject(p.id));
    li.innerHTML =
      '<div class="doc-meta">' +
        '<span class="doc-name"></span>' +
        '<span class="rank-bar"><span class="rank-fill"></span></span>' +
      '</div>' +
      '<div class="doc-stats">' +
        '<span class="mini-stat"><span class="mini-lbl">Temps</span><span class="mini-val">' +
          escapeHtml(formatDur(time)) + '</span></span>' +
        '<span class="mini-stat"><span class="mini-lbl">Mailles</span><span class="mini-val">' +
          escapeHtml(formatCount(stitches)) + '</span></span>' +
        '<span class="mini-stat"><span class="mini-lbl">Laine</span><span class="mini-val">' +
          escapeHtml(formatYarn(yarn.g, yarn.m)) + '</span></span>' +
      '</div>';
    li.querySelector('.doc-name').textContent = p.nom;
    const fill = li.querySelector('.rank-fill');
    fill.style.width = (maxTime ? (time / maxTime) * 100 : 0) + '%';
    projectRanking.appendChild(li);
  });

  // Dernières sessions
  recentSessions.innerHTML = '';
  const recent = allSessions.slice().sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)).slice(0, 5);
  recent.forEach((s) => {
    const p = projectOf(s.projetId);
    const li = document.createElement('li');
    li.className = 'doc-item no-click';
    const d = document.createElement('div');
    d.className = 'session-date';
    d.textContent = formatDateStr(s.date);
    const meta = document.createElement('div');
    meta.className = 'doc-meta';
    meta.innerHTML = '<span class="session-duration"></span><span class="doc-detail"></span>';
    meta.querySelector('.session-duration').textContent = formatDur(s.dureeMin);
    meta.querySelector('.doc-detail').textContent =
      (p ? p.nom : 'Projet supprimé') + (s.note ? ' — ' + s.note : '');
    li.appendChild(d);
    li.appendChild(meta);
    recentSessions.appendChild(li);
  });
}

// ---------- Rendu : Liste des projets ----------
function renderProjects() {
  const q = (searchInput.value || '').trim().toLowerCase();
  const filtered = allProjects.filter(
    (p) => !q || p.nom.toLowerCase().includes(q) || (p.patron || '').toLowerCase().includes(q)
  );

  projectList.innerHTML = '';
  projectsEmpty.classList.toggle('hidden', filtered.length > 0);

  const sorted = filtered.slice().sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  sorted.forEach((p) => {
    const node = projectTpl.content.cloneNode(true);
    const li = node.querySelector('.doc-item');
    node.querySelector('.doc-name').textContent = p.nom;
    node.querySelector('.doc-detail').textContent = p.patron
      ? p.patron
      : 'Projet créé le ' + formatDateStr(p.dateDebut || '');
    node.querySelector('.status-pill').textContent = STATUS_LABELS[p.status] || p.status;
    node.querySelector('.status-pill').classList.add(p.status || 'en_cours');
    node.querySelector('.time').textContent = formatDur(timeOf(p.id));
    node.querySelector('.yarn').textContent = (() => {
      const t = yarnTotalsOf(p.id);
      return formatYarn(t.g, t.m);
    })();
    li.addEventListener('click', () => openProject(p.id));
    projectList.appendChild(node);
  });
}

// ---------- Minuteur ----------
const TIMER_KEY = 'carnet-tricot:minuteur';
let timerState = null;

function loadTimerDB() {
  try {
    const raw = localStorage.getItem(TIMER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

function saveTimerDB() {
  try {
    localStorage.setItem(TIMER_KEY, JSON.stringify(timerState));
  } catch (e) {
    // stockage indisponible : on continue sans persistance
  }
}

function timerElapsed() {
  if (!timerState) return 0;
  if (timerState.running) {
    return timerState.accumulatedMs + (Date.now() - timerState.lastStartAt);
  }
  return timerState.accumulatedMs;
}

function clearTimerState() {
  timerState = null;
  saveTimerDB();
}

function startTimer() {
  timerState = { projetId: currentProjectId, accumulatedMs: 0, running: true, lastStartAt: Date.now() };
  saveTimerDB();
}

function pauseTimer() {
  if (!timerState) return;
  timerState.accumulatedMs = timerElapsed();
  timerState.running = false;
  saveTimerDB();
}

function resumeTimer() {
  if (!timerState) return;
  timerState.lastStartAt = Date.now();
  timerState.running = true;
  saveTimerDB();
}

function renderTimerUI() {
  const p = currentProjectId ? projectOf(currentProjectId) : null;
  if (!p) return;

  const isThis = timerState && timerState.projetId === currentProjectId;
  const hasTimer = timerState && (timerState.running || timerState.accumulatedMs > 0);

  timerBox.classList.toggle('running', !!(isThis && timerState && timerState.running));

  if (isThis && timerState.running) {
    btnTimerPrimary.textContent = 'Pause';
    btnTimerStop.disabled = !(timerState.accumulatedMs >= 60000 || Date.now() - timerState.lastStartAt >= 60000);
    timerHint.textContent = 'Minuteur en cours… mettez en pause si vous lâchez vos aiguilles.';
  } else if (isThis && timerState && !timerState.running) {
    btnTimerPrimary.textContent = 'Reprendre';
    btnTimerStop.disabled = timerState.accumulatedMs <= 0;
    timerHint.textContent = 'En pause. Reprenez quand vous voulez.';
  } else if (hasTimer && timerState.projetId !== currentProjectId) {
    const other = projectOf(timerState.projetId);
    btnTimerPrimary.textContent = 'Démarrer';
    btnTimerStop.disabled = true;
    timerHint.textContent = 'Un minuteur est déjà ouvert pour « ' +
      (other ? other.nom : 'un autre projet') + ' ».';
  } else {
    btnTimerPrimary.textContent = 'Démarrer';
    btnTimerStop.disabled = true;
    timerHint.textContent = 'Appuyez sur Démarrer pour chronométrer votre séance.';
  }

  timerDisplay.textContent = formatHMS(isThis ? timerElapsed() : 0);
}

function syncTimerTick() {
  if (!currentProjectId) return;
  const isThis = timerState && timerState.projetId === currentProjectId;
  if (isThis && timerState.running) {
    timerDisplay.textContent = formatHMS(timerElapsed());
    btnTimerStop.disabled = !(timerState.accumulatedMs >= 60000 || Date.now() - timerState.lastStartAt >= 60000);
  }
}

// ---------- Compteur de mailles ----------
const STITCH_KEY = 'carnet-tricot:mailles';
let stitchCounts = {};

function loadStitchCounts() {
  try {
    const raw = localStorage.getItem(STITCH_KEY);
    const obj = raw ? JSON.parse(raw) : null;
    return obj && typeof obj === 'object' ? obj : {};
  } catch (e) {
    return {};
  }
}

function saveStitchCounts() {
  try {
    localStorage.setItem(STITCH_KEY, JSON.stringify(stitchCounts));
  } catch (e) {
    // stockage indisponible : le compteur reste en mémoire
  }
}

function stitchCountOf(projetId) {
  return Math.max(0, Math.round(stitchCounts[projetId] || 0));
}

function setStitchCount(projetId, value) {
  const n = Math.max(0, Math.round(value || 0));
  if (n > 0) {
    stitchCounts[projetId] = n;
  } else {
    delete stitchCounts[projetId];
  }
  saveStitchCounts();
}

function renderStitchUI() {
  const p = currentProjectId ? projectOf(currentProjectId) : null;
  if (!p) return;
  const count = stitchCountOf(p.id);
  const total = stitchesOf(p.id);
  stitchDisplay.textContent = formatCount(count);
  stitchInput.value = count > 0 ? String(count) : '';
  $('btn-stitch-minus').disabled = count <= 0;
  stitchHint.textContent = count > 0
    ? 'Séance en cours : ' + formatCount(count) + ' maille' + (count > 1 ? 's' : '') +
      ' · total du projet : ' + formatCount(total) + ' mailles'
    : 'Total du projet : ' + formatCount(total) + ' maille' + (total > 1 ? 's' : '') +
      '. Appuyez sur « + 1 maille » à chaque maille.';
}

function bumpStitch(delta) {
  const p = projectOf(currentProjectId);
  if (!p) return;
  setStitchCount(p.id, stitchCountOf(p.id) + delta);
  renderStitchUI();
}

function applyStitchInput() {
  const p = projectOf(currentProjectId);
  if (!p) return;
  setStitchCount(p.id, parseInt(stitchInput.value, 10) || 0);
  renderStitchUI();
}

// ---------- Rendu : Détail projet ----------
function renderProjectDetail() {
  const p = projectOf(currentProjectId);
  if (!p) {
    showView('projects');
    return;
  }

  projectTitle.textContent = p.nom;
  projectBadge.textContent = STATUS_LABELS[p.status] || p.status;
  projectBadge.className = 'badge ' + (p.status || 'en_cours');

  const bits = [];
  if (p.patron) bits.push('<strong>Patron :</strong> ' + escapeHtml(p.patron));
  if (p.dateDebut) bits.push('<strong>Début :</strong> ' + formatDateStr(p.dateDebut));
  if (p.notes) bits.push('<strong>Notes :</strong> ' + escapeHtml(p.notes));
  projectMeta.innerHTML = bits.length ? bits.join('<br>') : 'Aucun détail renseigné.';

  renderSessions();
  renderYarns();
  renderTimerUI();
  renderStitchUI();
}

function renderSessions() {
  const p = currentProjectId ? projectOf(currentProjectId) : null;
  if (!p) return;
  const sessions = sessionsOf(p.id).slice().sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  const total = sessions.reduce((sum, s) => sum + (s.dureeMin || 0), 0);
  const totalStitches = sessions.reduce((sum, s) => sum + (s.mailles || 0), 0);

  sessionList.innerHTML = '';
  $('sessions-empty').classList.toggle('hidden', sessions.length > 0);
  sessionsTotal.textContent = sessions.length
    ? sessions.length + ' session' + (sessions.length > 1 ? 's' : '') + ' · total ' + formatDur(total) +
      (totalStitches > 0 ? ' · ' + formatCount(totalStitches) + ' mailles' : '')
    : '';

  sessions.forEach((s) => {
    const node = sessionTpl.content.cloneNode(true);
    const li = node.querySelector('.doc-item');
    li.classList.add('no-click');
    node.querySelector('.session-date').textContent = formatDateStr(s.date);
    node.querySelector('.session-duration').textContent = formatDur(s.dureeMin);
    node.querySelector('.session-note').textContent = s.note || '';
    const pill = node.querySelector('.session-stitches');
    const st = Math.round(s.mailles || 0);
    pill.textContent = formatCount(st) + ' M';
    pill.title = st + (st > 1 ? ' mailles' : ' maille');
    pill.classList.toggle('hidden', st <= 0);
    node.querySelector('.btn-delete-mini').addEventListener('click', async (e) => {
      e.stopPropagation();
      if (confirm('Supprimer cette session ?')) {
        await delItem(STORES.sessions, s.id);
        allSessions = allSessions.filter((x) => x.id !== s.id);
        renderSessions();
        renderProjects();
        renderDashboard();
      }
    });
    sessionList.appendChild(node);
  });
}

function renderYarns() {
  const p = currentProjectId ? projectOf(currentProjectId) : null;
  if (!p) return;
  const yarns = yarnsOf(p.id).slice().sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  const total = yarnTotalsOf(p.id);

  yarnList.innerHTML = '';
  $('yarn-empty').classList.toggle('hidden', yarns.length > 0);
  yarnTotal.textContent = yarns.length
    ? yarns.length + ' référence' + (yarns.length > 1 ? 's' : '') + ' · total ' + formatYarn(total.g, total.m)
    : '';

  yarns.forEach((y) => {
    const node = yarnTpl.content.cloneNode(true);
    const li = node.querySelector('.doc-item');
    li.classList.add('no-click');
    node.querySelector('.yarn-name').textContent = y.nom || 'Laine';
    node.querySelector('.yarn-note').textContent = y.note || '';
    const vals = node.querySelectorAll('.mini-val');
    vals[0].textContent = Math.round(y.grammes || 0) + ' g';
    vals[1].textContent = Math.round(y.metres || 0) + ' m';
    node.querySelector('.btn-delete-mini').addEventListener('click', async (e) => {
      e.stopPropagation();
      if (confirm('Supprimer cette référence de laine ?')) {
        await delItem(STORES.laines, y.id);
        allYarns = allYarns.filter((x) => x.id !== y.id);
        renderYarns();
        renderProjects();
        renderDashboard();
      }
    });
    yarnList.appendChild(node);
  });
}

function openProject(id) {
  currentProjectId = id;
  $('manual-session-details').removeAttribute('open');
  $('yarn-form-details').removeAttribute('open');
  $('session-date').value = todayInput();
  $('session-duration').value = '';
  $('session-stitches').value = '';
  $('session-note').value = '';
  $('yarn-name').value = '';
  $('yarn-grams').value = '';
  $('yarn-metres').value = '';
  $('yarn-note').value = '';
  showView('project');
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str == null ? '' : String(str);
  return div.innerHTML;
}

// ---------- Formulaire projet ----------
function openForm(projectId) {
  editingProjectId = projectId || null;
  const p = projectId ? projectOf(projectId) : null;
  formTitle.textContent = p ? 'Modifier le projet' : 'Nouveau projet';
  projectName.value = p ? p.nom : '';
  projectPattern.value = p ? (p.patron || '') : '';
  projectStatus.value = p ? (p.status || 'en_cours') : 'en_cours';
  projectDate.value = p ? (p.dateDebut || todayInput()) : todayInput();
  projectNotes.value = p ? (p.notes || '') : '';
  formMessage.textContent = '';
  formMessage.className = 'message';
  showView('projectForm');
}

async function saveProject() {
  const nom = projectName.value.trim();
  if (!nom) {
    showMessage('Le nom du projet est requis.', 'err');
    return;
  }
  const existing = allProjects.find(
    (x) => x.id !== editingProjectId && x.nom.toLowerCase() === nom.toLowerCase()
  );
  if (existing) {
    showMessage('Un projet porte déjà ce nom.', 'err');
    return;
  }

  const project = editingProjectId
    ? Object.assign({}, projectOf(editingProjectId))
    : { id: uid(), createdAt: Date.now() };
  project.nom = nom;
  project.patron = projectPattern.value.trim();
  project.status = projectStatus.value;
  project.dateDebut = projectDate.value || todayInput();
  project.notes = projectNotes.value.trim();

  await putItem(STORES.projets, project);
  allProjects = allProjects.filter((x) => x.id !== project.id);
  allProjects.push(project);
  currentProjectId = project.id;
  renderProjects();
  renderDashboard();
  showView('project');
}

// ---------- Événements : navigation ----------
$('btn-new-project').addEventListener('click', () => openForm());
$('btn-new-project-2').addEventListener('click', () => openForm());
$('btn-cancel-project').addEventListener('click', () => {
  if (editingProjectId) {
    showView('project');
  } else {
    showView(projectsEmpty.classList.contains('hidden') && allProjects.length ? 'projects' : 'dashboard');
  }
});
$('btn-save-project').addEventListener('click', saveProject);
$('btn-projects-back').addEventListener('click', () => showView('projects'));
searchInput.addEventListener('input', renderProjects);

$('btn-edit-project').addEventListener('click', () => {
  if (currentProjectId) openForm(currentProjectId);
});

$('btn-delete-project').addEventListener('click', async () => {
  const p = projectOf(currentProjectId);
  if (!p) return;
  if (!confirm('Supprimer définitivement « ' + p.nom + ' » et toutes ses sessions et laines ?')) return;

  for (const s of sessionsOf(p.id)) await delItem(STORES.sessions, s.id);
  for (const y of yarnsOf(p.id)) await delItem(STORES.laines, y.id);
  await delItem(STORES.projets, p.id);

  if (timerState && timerState.projetId === p.id) clearTimerState();
  setStitchCount(p.id, 0);
  allProjects = allProjects.filter((x) => x.id !== p.id);
  allSessions = allSessions.filter((x) => x.projetId !== p.id);
  allYarns = allYarns.filter((x) => x.projetId !== p.id);
  currentProjectId = null;
  renderProjects();
  renderDashboard();
  renderTimerUI();
  showView('projects');
});

// ---------- Événements : compteur de mailles ----------
$('btn-stitch-plus').addEventListener('click', () => bumpStitch(1));
$('btn-stitch-minus').addEventListener('click', () => bumpStitch(-1));
$('btn-stitch-apply').addEventListener('click', applyStitchInput);
stitchInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    applyStitchInput();
  }
});

// ---------- Événements : sessions manuelles ----------
$('btn-add-session').addEventListener('click', async () => {
  const p = projectOf(currentProjectId);
  if (!p) return;
  const minutes = parseDuration($('session-duration').value);
  if (!minutes) {
    $('manual-session-details').setAttribute('open', '');
    $('session-duration').focus();
    return;
  }
  const session = {
    id: uid(),
    projetId: p.id,
    date: $('session-date').value || todayInput(),
    dureeMin: minutes,
    mailles: Math.max(0, Math.round(parseInt($('session-stitches').value, 10) || 0)),
    note: $('session-note').value.trim() || '',
    createdAt: Date.now(),
  };
  await putItem(STORES.sessions, session);
  allSessions.push(session);
  $('session-date').value = todayInput();
  $('session-duration').value = '';
  $('session-stitches').value = '';
  $('session-note').value = '';
  renderSessions();
  renderProjects();
  renderDashboard();
});

// ---------- Événements : laine ----------
$('btn-add-yarn').addEventListener('click', async () => {
  const p = projectOf(currentProjectId);
  if (!p) return;
  const nom = $('yarn-name').value.trim();
  const grammes = parseFloat($('yarn-grams').value) || 0;
  const metres = parseFloat($('yarn-metres').value) || 0;
  if (!nom && grammes <= 0 && metres <= 0) {
    $('yarn-form-details').setAttribute('open', '');
    $('yarn-name').focus();
    return;
  }
  const yarn = {
    id: uid(),
    projetId: p.id,
    nom: nom || 'Laine',
    grammes: Math.max(0, grammes),
    metres: Math.max(0, metres),
    note: $('yarn-note').value.trim() || '',
    createdAt: Date.now(),
  };
  await putItem(STORES.laines, yarn);
  allYarns.push(yarn);
  $('yarn-name').value = '';
  $('yarn-grams').value = '';
  $('yarn-metres').value = '';
  $('yarn-note').value = '';
  renderYarns();
  renderProjects();
  renderDashboard();
});

// ---------- Événements : minuteur ----------
btnTimerPrimary.addEventListener('click', () => {
  const p = projectOf(currentProjectId);
  if (!p) return;

  if (timerState && timerState.projetId !== currentProjectId &&
      (timerState.running || timerState.accumulatedMs > 0)) {
    const other = projectOf(timerState.projetId);
    if (!confirm('Un minuteur est déjà ouvert pour « ' +
        (other ? other.nom : 'un autre projet') + ' ». Le remplacer ?')) {
      return;
    }
    clearTimerState();
  }

  if (!timerState || timerState.projetId !== currentProjectId) {
    startTimer();
  } else if (timerState.running) {
    pauseTimer();
  } else {
    resumeTimer();
  }
  renderTimerUI();
});

btnTimerStop.addEventListener('click', async () => {
  const p = projectOf(currentProjectId);
  if (!p || !timerState || timerState.projetId !== p.id) return;

  const ms = timerElapsed();
  const minutes = Math.max(1, Math.round(ms / 60000));
  const stitches = stitchCountOf(p.id);
  clearTimerState();
  setStitchCount(p.id, 0);

  const session = {
    id: uid(),
    projetId: p.id,
    date: todayInput(),
    dureeMin: minutes,
    mailles: stitches,
    note: '',
    createdAt: Date.now(),
  };
  await putItem(STORES.sessions, session);
  allSessions.push(session);
  renderSessions();
  renderProjects();
  renderDashboard();
  renderTimerUI();
  renderStitchUI();
  timerHint.textContent = 'Session de ' + formatDur(minutes) + ' enregistrée' +
    (stitches > 0 ? ' · ' + formatCount(stitches) + ' mailles' : '') + '.';
});

// Mise à jour de l'affichage chaque seconde
setInterval(syncTimerTick, 1000);

// Pause automatique si l'application passe en arrière-plan
document.addEventListener('visibilitychange', () => {
  if (document.hidden && timerState && timerState.running) {
    pauseTimer();
    renderTimerUI();
  }
});

// ---------- PWA / Service Worker ----------
if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch((err) => console.warn('SW:', err));
  });
}

// ---------- Démarrage ----------
(async function init() {
  await openDB();
  allProjects = await getAll(STORES.projets);
  allSessions = await getAll(STORES.sessions);
  allYarns = await getAll(STORES.laines);
  timerState = loadTimerDB();
  stitchCounts = loadStitchCounts();
  renderDashboard();
})();