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
  laine: $('view-laine'),
  yarn: $('view-yarn'),
  instructions: $('view-instructions'),
};

const projectList = $('project-list');
const projectsEmpty = $('projects-empty');
const searchInput = $('search-input');
const dashboardEmpty = $('dashboard-empty');
const projectRanking = $('project-ranking');
const recentSessions = $('recent-sessions');

const stockList = $('stock-list');
const stockTpl = $('stock-item-template');
const purchaseList = $('purchase-list');
const purchaseTpl = $('purchase-item-template');

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
let allStock = [];
let allAchats = [];
let currentProjectId = null;
let currentStockId = null;
let editingProjectId = null;
let editingStockId = null;
let editingPurchaseId = null;

// ---------- IndexedDB ----------
const DB_NAME = 'carnet-tricot';
const DB_VERSION = 2;
const STORES = {
  projets: 'projets',
  sessions: 'sessions',
  laines: 'laines',
  lainesStock: 'lainesStock',
  achats: 'achats',
};
let db = null;

function openDB() {
  return new Promise((resolve, reject) => {
    if (db) return resolve(db);
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const d = e.target.result;
      const tx = e.target.transaction;
      if (!d.objectStoreNames.contains(STORES.projets)) {
        d.createObjectStore(STORES.projets, { keyPath: 'id' });
      }
      if (!d.objectStoreNames.contains(STORES.sessions)) {
        d.createObjectStore(STORES.sessions, { keyPath: 'id' });
      }
      if (!d.objectStoreNames.contains(STORES.laines)) {
        d.createObjectStore(STORES.laines, { keyPath: 'id' });
      }
      if (!d.objectStoreNames.contains(STORES.lainesStock)) {
        d.createObjectStore(STORES.lainesStock, { keyPath: 'id' });
      }
      if (!d.objectStoreNames.contains(STORES.achats)) {
        d.createObjectStore(STORES.achats, { keyPath: 'id' });
      }
      // v1 -> v2 : champs par défaut, sans toucher aux enregistrements existants
      if (e.oldVersion < 2) {
        backfill(tx, STORES.laines, (rec, mark) => {
          if (rec.laineId === undefined) { rec.laineId = null; mark(); }
          if (rec.valide === undefined) { rec.valide = true; mark(); }
        });
        backfill(tx, STORES.projets, (rec, mark) => {
          if (rec.autresFrais === undefined) { rec.autresFrais = 0; mark(); }
        });
      }
    };
    req.onsuccess = () => { db = req.result; resolve(db); };
    req.onerror = () => reject(req.error);
  });
}

function backfill(tx, storeName, mutate) {
  if (!tx) return;
  const store = tx.objectStore(storeName);
  store.openCursor().onsuccess = (ev) => {
    const cur = ev.target.result;
    if (!cur) return;
    const rec = cur.value;
    let changed = false;
    mutate(rec, () => { changed = true; });
    if (changed) cur.update(rec);
    cur.continue();
  };
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
  return String(Math.round(n || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

function formatPrice(n) {
  const v = Number(n || 0);
  return '$' + v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatPrice100(parGramme) {
  return formatPrice((Number(parGramme) || 0) * 100) + ' / 100 g';
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
  if (name === 'laine') renderStock();
  if (name === 'yarn') renderYarnDetail();
  if (name === 'instructions') renderInstructions();
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
  renderStockBox();

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
        '<span class="mini-stat"><span class="mini-lbl">Rangs</span><span class="mini-val">' +
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

// ---------- Compteur de rangs ----------
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
    ? 'Séance en cours : ' + formatCount(count) + ' rang' + (count > 1 ? 's' : '') +
      ' · total du projet : ' + formatCount(total) + ' rangs'
    : 'Total du projet : ' + formatCount(total) + ' rang' + (total > 1 ? 's' : '') +
      '. Appuyez sur « + 1 rang » à chaque rang.';
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

// ---------- Inventaire & coûts ----------
function stockOf(id) {
  return allStock.find((s) => s.id === id) || null;
}

// Petit défilement doux (absent de jsdom, d'où la garde)
function scrollToEl(el) {
  if (el && typeof el.scrollIntoView === 'function') el.scrollIntoView({ block: 'nearest' });
}

function achatsOf(laineId) {
  return allAchats.filter((a) => a.laineId === laineId);
}

function usagesOf(laineId) {
  return allYarns.filter((y) => y.laineId === laineId);
}

function purchasedGrams(laineId) {
  return achatsOf(laineId).reduce((s, a) => s + (a.grammes || 0), 0);
}

function spentTotal(laineId) {
  return achatsOf(laineId).reduce((s, a) => s + (a.prixTotal || 0), 0);
}

// Ajustement manuel de la quantité disponible (pertes, dons, restes…)
function adjustmentOf(laineId) {
  const s = stockOf(laineId);
  return s ? (s.ajustementG || 0) : 0;
}

// Prix de base saisi sur la fiche (pour 100 g) : s'il existe, il est prioritaire
function basePriceOf(laineId) {
  const s = stockOf(laineId);
  return s && s.prixBase > 0 ? s.prixBase : 0;
}

// Prix de revient au gramme : prix de base saisi, sinon total dépensé / total acheté
function unitPriceOf(laineId) {
  const base = basePriceOf(laineId);
  if (base > 0) return base / 100;
  const g = purchasedGrams(laineId);
  if (g <= 0) return 0;
  return spentTotal(laineId) / g;
}

// Prix moyen issu des seuls achats (affiché à titre indicatif)
function averagePriceOf(laineId) {
  const g = purchasedGrams(laineId);
  return g > 0 ? spentTotal(laineId) / g : 0;
}

function gramsUsed(laineId, onlyValidated) {
  return usagesOf(laineId)
    .filter((y) => (onlyValidated ? y.valide : true))
    .reduce((s, y) => s + (y.grammes || 0), 0);
}

// Stock officiel = acheté - validé (les engagements des projets en cours n'ôdent rien)
function stockOfficial(laineId) {
  return purchasedGrams(laineId) + adjustmentOf(laineId) - gramsUsed(laineId, true);
}

function stockEngaged(laineId) {
  return usagesOf(laineId)
    .filter((y) => !y.valide)
    .reduce((s, y) => s + (y.grammes || 0), 0);
}

function stockForecast(laineId) {
  return stockOfficial(laineId) - stockEngaged(laineId);
}

function yarnCostOf(usage) {
  // Un prix saisi dans le projet a priorité ; sinon on applique le prix moyen de la laine
  if (typeof usage.prix === 'number') return usage.prix;
  if (!usage.laineId) return 0;
  return (usage.grammes || 0) * unitPriceOf(usage.laineId);
}

function yarnCostOfProject(projetId) {
  return yarnsOf(projetId).reduce((s, y) => s + yarnCostOf(y), 0);
}

function costOfReturn(projetId) {
  const p = projectOf(projetId);
  return yarnCostOfProject(projetId) + (p ? (p.autresFrais || 0) : 0);
}

function hasProvisional(projetId) {
  return yarnsOf(projetId).some((y) => !y.valide);
}

function totalStockValue() {
  return allStock.reduce((sum, s) => sum + stockForecast(s.id) * unitPriceOf(s.id), 0);
}

function totalSpent() {
  return allAchats.reduce((s, a) => s + (a.prixTotal || 0), 0);
}

async function validateUsages(projetId) {
  const pending = allYarns.filter((y) => y.projetId === projetId && !y.valide);
  for (const y of pending) {
    y.valide = true;
    await putItem(STORES.laines, y);
  }
  return pending.length;
}

function renderCost() {
  const p = currentProjectId ? projectOf(currentProjectId) : null;
  if (!p) return;
  const yarn = yarnCostOfProject(p.id);
  const other = p.autresFrais || 0;
  const total = yarn + other;

  $('cost-yarn').textContent = formatPrice(yarn);
  $('cost-other').textContent = formatPrice(other);
  $('cost-total').textContent = formatPrice(total);
  $('project-other-cost').value = other > 0 ? String(other) : '';
  $('btn-validate-usages').classList.toggle('hidden', !hasProvisional(p.id));
  $('cost-note').textContent = hasProvisional(p.id)
    ? 'Les lignes « Engagée » ne sont pas encore déduites du stock : elles le seront ' +
      'à la fin du projet (statut Terminé).'
    : 'Toutes les lignes sont validées : le stock est à jour.';
}

// ---------- Rendu : Boîte inventaire (accueil) ----------
function renderStockBox() {
  const list = $('dash-stock-list');
  const refs = allStock
    .filter((s) => s.actif !== false && stockForecast(s.id) !== 0)
    .slice()
    .sort((a, b) => (a.nom || '').localeCompare(b.nom || ''));

  $('dash-stock-empty').classList.toggle('hidden', refs.length > 0);
  list.innerHTML = '';

  refs.forEach((s) => {
    const prevu = Math.max(0, stockForecast(s.id));
    const engage = Math.max(0, stockEngaged(s.id));
    const li = document.createElement('li');
    li.className = 'doc-item stock-row';

    const dot = document.createElement('span');
    dot.className = 'color-dot';
    dot.style.background = s.couleur || '#c81e1e';

    const meta = document.createElement('div');
    meta.className = 'doc-meta';
    meta.innerHTML = '<span class="doc-name"></span><span class="doc-detail"></span>';
    meta.querySelector('.doc-name').textContent = s.nom || 'Laine';
    meta.querySelector('.doc-detail').textContent =
      formatCount(prevu) + ' g' + (s.nomCouleur ? ' · ' + s.nomCouleur : '');

    li.appendChild(dot);
    li.appendChild(meta);

    // Indicateur : part de la quantité engagée dans un projet en cours
    if (engage > 0) {
      const flag = document.createElement('span');
      flag.className = 'engaged-flag';
      flag.textContent = formatCount(engage) + ' g engagés';
      const bar = document.createElement('span');
      bar.className = 'engaged-bar';
      const fill = document.createElement('span');
      fill.className = 'engaged-fill';
      fill.style.width = Math.min(100, prevu > 0 ? (engage / (prevu + engage)) * 100 : 100) + '%';
      bar.appendChild(fill);
      const wrap = document.createElement('span');
      wrap.className = 'engaged-wrap';
      wrap.appendChild(bar);
      wrap.appendChild(flag);
      li.appendChild(wrap);
      li.classList.add('has-engaged');
    }

    li.addEventListener('click', () => openStock(s.id));
    list.appendChild(li);
  });
}

// ---------- Rendu : Inventaire ----------
function renderStock() {
  const sorted = allStock.slice().sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));

  $('stock-value').textContent = formatPrice(totalStockValue());
  $('stock-spent').textContent = formatPrice(totalSpent());
  $('stock-mass').textContent = allStock.length
    ? formatCount(allStock.reduce((sum, s) => sum + Math.max(0, stockForecast(s.id)), 0)) + ' g'
    : '—';

  stockList.innerHTML = '';
  $('stock-empty').classList.toggle('hidden', sorted.length > 0);

  sorted.forEach((s) => {
    const node = stockTpl.content.cloneNode(true);
    const li = node.querySelector('.doc-item');
    const inactif = s.actif === false;
    if (inactif) li.classList.add('inactive');
    node.querySelector('.color-dot').style.background = s.couleur || '#c81e1e';
    node.querySelector('.stock-name').textContent = s.nom || 'Laine';
    node.querySelector('.stock-color-name').textContent =
      [s.nomCouleur, s.notes].filter(Boolean).join(' — ');
    node.querySelector('.stock-official').textContent = formatCount(stockOfficial(s.id)) + ' g';
    node.querySelector('.stock-engaged').textContent = stockEngaged(s.id) > 0 ? formatCount(stockEngaged(s.id)) + ' g' : '—';
    node.querySelector('.stock-forecast').textContent = formatCount(stockForecast(s.id)) + ' g';
    node.querySelector('.stock-price').textContent =
      basePriceOf(s.id) > 0 || purchasedGrams(s.id) > 0 ? formatPrice100(unitPriceOf(s.id)) : '—';
    node.querySelector('.stock-price').title = basePriceOf(s.id) > 0
      ? 'Prix saisi sur la fiche (modifiable avec ✎)'
      : 'Prix moyen de vos achats (modifiable avec ✎)';
    node.querySelector('.inactive-pill').classList.toggle('hidden', !inactif);
    node.querySelector('.btn-edit-mini').addEventListener('click', (e) => {
      e.stopPropagation();
      startStockEdit(s.id);
      scrollToEl($('stock-form-details'));
    });
    li.addEventListener('click', () => openStock(s.id));
    stockList.appendChild(node);
  });
}

function openStock(id) {
  currentStockId = id;
  resetPurchaseForm();
  $('pur-date').value = todayInput();
  $('adjust-form-details').removeAttribute('open');
  const s = stockOf(id);
  $('adj-grammes').value = s ? String(Math.max(0, Math.round(stockOfficial(id)))) : '';
  $('adj-note').value = '';
  showView('yarn');
}

function resetPurchaseForm() {
  editingPurchaseId = null;
  $('purchase-form-details').removeAttribute('open');
  $('pur-grammes').value = '';
  $('pur-prix').value = '';
  $('pur-metres').value = '';
  $('pur-note').value = '';
  $('btn-add-purchase').textContent = 'Ajouter cet achat';
  $('btn-cancel-purchase').classList.add('hidden');
}

function startPurchaseEdit(achat) {
  editingPurchaseId = achat.id;
  $('purchase-form-details').setAttribute('open', '');
  $('pur-date').value = achat.date || todayInput();
  $('pur-grammes').value = achat.grammes ? String(achat.grammes) : '';
  $('pur-prix').value = achat.prixTotal ? String(achat.prixTotal) : '';
  $('pur-metres').value = achat.metres ? String(achat.metres) : '';
  $('pur-note').value = achat.note || '';
  $('btn-add-purchase').textContent = 'Enregistrer les modifications';
  $('btn-cancel-purchase').classList.remove('hidden');
  $('pur-prix').focus();
  $('pur-prix').select();
  scrollToEl($('purchase-form-details'));
}

function renderYarnDetail() {
  const s = stockOf(currentStockId);
  if (!s) {
    showView('laine');
    return;
  }
  const inactif = s.actif === false;

  $('yarn-detail-title').textContent = s.nom || 'Laine';
  $('yarn-detail-badge').textContent = inactif ? 'Inactive' : 'Active';
  $('yarn-detail-badge').className = 'badge' + (inactif ? ' en_attente' : ' termine');
  $('btn-toggle-yarn').textContent = inactif ? 'Réactiver' : 'Désactiver';

  const bits = [];
  if (s.nomCouleur) bits.push('<strong>Couleur :</strong> ' + escapeHtml(s.nomCouleur));
  bits.push('<strong>Stock officiel :</strong> ' + formatCount(stockOfficial(s.id)) + ' g');
  bits.push('<strong>Engagé (projets en cours) :</strong> ' + formatCount(stockEngaged(s.id)) + ' g');
  bits.push('<strong>Prévisionnel :</strong> ' + formatCount(stockForecast(s.id)) + ' g');
  const base = basePriceOf(s.id);
  const moy = averagePriceOf(s.id);
  // base est déjà un prix pour 100 g, unitPriceOf est un prix au gramme
  bits.push('<strong>' + (base > 0 ? 'Prix utilisé :' : 'Prix moyen :') + '</strong> ' +
    (base > 0 ? formatPrice100(base / 100) : moy > 0 ? formatPrice100(moy) : 'non renseigné'));
  if (base > 0 && moy > 0) {
    bits.push('<strong>Moyen des achats :</strong> ' + formatPrice100(moy) +
      ' — ignoré, un prix est saisi sur la fiche.');
  }
  if (base > 0 && stockOfficial(s.id) > 0) {
    // Équivalent du prix saisi, exprimé sur le stock actuel
    bits.push('<strong>Prix saisi :</strong> ' + formatPrice((base / 100) * stockOfficial(s.id)) +
      ' pour ' + formatCount(stockOfficial(s.id)) + ' g (' + formatPrice100(base / 100) + ')');
  }
  if (s.ajustementG) {
    const adj = s.ajustementG;
    bits.push('<strong>Ajustement manuel :</strong> ' + (adj >= 0 ? '+' : '') + formatCount(adj) + ' g' +
      (s.ajustementNote ? ' (' + escapeHtml(s.ajustementNote) + ')' : ''));
  }
  if (s.notes) bits.push('<strong>Notes :</strong> ' + escapeHtml(s.notes));
  $('yarn-detail-meta').innerHTML = bits.join('<br>');
  $('adj-grammes').value = String(Math.max(0, Math.round(stockOfficial(s.id))));

  // Achats
  const buys = achatsOf(s.id).slice().sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  purchaseList.innerHTML = '';
  $('purchases-empty').classList.toggle('hidden', buys.length > 0);
  $('purchases-total').textContent = buys.length
    ? buys.length + ' achat' + (buys.length > 1 ? 's' : '') + ' · ' + formatCount(purchasedGrams(s.id)) +
      ' g · ' + formatPrice(spentTotal(s.id))
    : '';

  buys.forEach((a) => {
    const node = purchaseTpl.content.cloneNode(true);
    node.querySelector('.session-date').textContent = formatDateStr(a.date);
    node.querySelector('.purchase-qty').textContent = formatCount(a.grammes || 0) + ' g' +
      (a.metres ? ' · ' + formatCount(a.metres) + ' m' : '');
    node.querySelector('.purchase-note').textContent = a.note || '';
    node.querySelector('.purchase-price').textContent = formatPrice(a.prixTotal);
    node.querySelector('.purchase-unit').textContent = a.grammes
      ? formatPrice100((a.prixTotal || 0) / a.grammes)
      : '—';
    node.querySelector('.btn-edit-mini').addEventListener('click', (e) => {
      e.stopPropagation();
      startPurchaseEdit(a);
    });
    node.querySelector('.btn-delete-mini').addEventListener('click', async (e) => {
      e.stopPropagation();
      if (!confirm('Supprimer cet achat ?')) return;
      await delItem(STORES.achats, a.id);
      allAchats = allAchats.filter((x) => x.id !== a.id);
      if (editingPurchaseId === a.id) resetPurchaseForm();
      renderYarnDetail();
      renderStock();
      renderDashboard();
    });
    purchaseList.appendChild(node);
  });

  // Consommations
  const used = usagesOf(s.id)
    .slice()
    .sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  $('yarn-usage-list').innerHTML = '';
  $('yarn-usage-empty').classList.toggle('hidden', used.length > 0);
  $('yarn-usage-total').textContent = used.length
    ? formatCount(gramsUsed(s.id, true)) + ' g validés · ' + formatCount(stockEngaged(s.id)) +
      ' g engagés · ' + formatPrice(used.reduce((sum, u) => sum + yarnCostOf(u), 0))
    : '';

  used.forEach((u) => {
    const p = projectOf(u.projetId);
    const li = document.createElement('li');
    li.className = 'doc-item no-click';
    const dot = document.createElement('span');
    dot.className = 'color-dot';
    dot.style.background = '#7c3aed';
    const meta = document.createElement('div');
    meta.className = 'doc-meta';
    meta.innerHTML = '<span class="doc-name"></span><span class="doc-detail"></span>';
    meta.querySelector('.doc-name').textContent = (p ? p.nom : 'Projet supprimé') +
      (u.valide ? '' : ' (en cours)');
    meta.querySelector('.doc-detail').textContent = formatDateStr(u.date) + ' · ' +
      formatCount(u.grammes || 0) + ' g' + (u.metres ? ' · ' + formatCount(u.metres) + ' m' : '') +
      ' · ' + formatPrice(yarnCostOf(u));
    const pill = document.createElement('span');
    pill.className = 'valid-pill ' + (u.valide ? 'valide' : 'provisoire');
    pill.textContent = u.valide ? 'Validée' : 'Engagée';
    li.appendChild(dot);
    li.appendChild(meta);
    li.appendChild(pill);
    $('yarn-usage-list').appendChild(li);
  });
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
  renderCost();
  renderProjectClosing();
  updateYarnFormHint();
}

// ---------- Clôture du projet : photo, statut, instructions ----------
function renderProjectClosing() {
  const p = currentProjectId ? projectOf(currentProjectId) : null;
  if (!p) return;
  const termine = p.status === 'termine';

  $('btn-project-finish').classList.toggle('hidden', termine);
  $('btn-project-reopen').classList.toggle('hidden', !termine);
  const engage = hasProvisional(p.id);
  $('close-hint').textContent = termine
    ? 'Projet terminé : les quantités de laine sont déduites du stock. Vous pouvez rouvrir le projet si besoin.'
    : engage
      ? 'En marquant le projet comme terminé, les ' + 'lignes « Engagée » seront validées et déduites du stock.'
      : 'Marquez ce projet comme terminé quand il est réalisé.';

  // Photo
  const img = $('project-photo');
  if (p.photo) {
    img.src = p.photo;
    img.classList.remove('hidden');
  } else {
    img.removeAttribute('src');
    img.classList.add('hidden');
  }
  $('btn-delete-photo').classList.toggle('hidden', !p.photo);

  // Instructions
  $('btn-project-instructions').textContent =
    (p.instructions || '').trim() ? 'Modifier les instructions' : 'Instructions';
}

// Réduit l'image avant stockage (l'iPad fournit de très gros fichiers)
function shrinkImage(file, maxSize, quality) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onerror = () => reject(new Error('lecture impossible'));
    fr.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('image illisible'));
      img.onload = () => {
        const w0 = img.naturalWidth || img.width;
        const h0 = img.naturalHeight || img.height;
        const ratio = Math.min(1, (maxSize || 1400) / Math.max(w0, h0));
        const w = Math.max(1, Math.round(w0 * ratio));
        const h = Math.max(1, Math.round(h0 * ratio));
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', quality || 0.82));
      };
      img.src = fr.result;
    };
    fr.readAsDataURL(file);
  });
}

function renderInstructions() {
  const p = currentProjectId ? projectOf(currentProjectId) : null;
  if (!p) {
    showView('projects');
    return;
  }
  $('instructions-title').textContent = 'Instructions — ' + p.nom;
  $('instructions-text').value = p.instructions || '';
  $('instructions-hint').textContent = p.instructions
    ? 'Enregistré le ' + formatDateStr(p.instructionsDate || p.dateDebut || '') + '.'
    : 'Rien d\'écrit pour le moment.';
}

// Passe le projet en « Terminé » : les engagements sont validés, le stock mis à jour
$('btn-project-finish').addEventListener('click', async () => {
  const p = currentProjectId ? projectOf(currentProjectId) : null;
  if (!p) return;
  const engage = hasProvisional(p.id);
  if (engage && !confirm(
    'Marquer ce projet comme terminé ?\n\n' +
    'Les quantités de laine encore « Engagées » seront validées et déduites du stock.'
  )) return;

  p.status = 'termine';
  p.dateFin = todayInput();
  await putItem(STORES.projets, p);
  await validateUsages(p.id);
  renderProjects();
  renderDashboard();
  renderYarnReferenceSelect();
  showView('project');
  renderStock();
});

$('btn-project-reopen').addEventListener('click', async () => {
  const p = currentProjectId ? projectOf(currentProjectId) : null;
  if (!p) return;
  p.status = 'en_cours';
  p.dateFin = '';
  await putItem(STORES.projets, p);
  renderProjects();
  renderDashboard();
  renderProjectDetail();
});

$('btn-project-instructions').addEventListener('click', () => showView('instructions'));

$('btn-instructions-back').addEventListener('click', () => showView('project'));

$('btn-instructions-save').addEventListener('click', async () => {
  const p = currentProjectId ? projectOf(currentProjectId) : null;
  if (!p) return;
  p.instructions = $('instructions-text').value;
  p.instructionsDate = todayInput();
  await putItem(STORES.projets, p);
  renderProjects();
  showView('project');
});

// ---------- Photo du projet ----------
$('project-photo-input').addEventListener('change', async (e) => {
  const file = e.target.files && e.target.files[0];
  if (!file) return;
  const p = currentProjectId ? projectOf(currentProjectId) : null;
  if (!p) return;
  if (!/^image\//.test(file.type || '')) {
    $('photo-hint').textContent = 'Ce fichier n\'est pas une image.';
    e.target.value = '';
    return;
  }
  $('photo-hint').textContent = 'Traitement de l\'image…';
  try {
    p.photo = await shrinkImage(file, 1400, 0.82);
    p.photoDate = todayInput();
    await putItem(STORES.projets, p);
    $('photo-hint').textContent =
      'Photo enregistrée (' + Math.round(p.photo.length / 1400) + ' Ko environ).';
    renderProjectClosing();
  } catch (err) {
    $('photo-hint').textContent = 'Impossible de lire cette image. Réessayez avec une autre photo.';
  }
  e.target.value = '';
});

$('btn-delete-photo').addEventListener('click', async () => {
  const p = currentProjectId ? projectOf(currentProjectId) : null;
  if (!p || !p.photo) return;
  if (!confirm('Retirer la photo de ce projet ?')) return;
  p.photo = '';
  p.photoDate = '';
  await putItem(STORES.projets, p);
  $('photo-hint').textContent = 'Photo retirée.';
  renderProjectClosing();
});

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
      (totalStitches > 0 ? ' · ' + formatCount(totalStitches) + ' rangs' : '')
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
    pill.textContent = formatCount(st) + ' R';
    pill.title = st + (st > 1 ? ' rangs' : ' rang');
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
  const engage = yarns.filter((y) => !y.valide);
  yarnTotal.textContent = yarns.length
    ? yarns.length + ' référence' + (yarns.length > 1 ? 's' : '') + ' · total ' + formatYarn(total.g, total.m) +
      (engage.length ? ' · ' + formatCount(engage.reduce((s, y) => s + (y.grammes || 0), 0)) + ' g engagés' : '') +
      (yarnCostOfProject(p.id) > 0 ? ' · ' + formatPrice(yarnCostOfProject(p.id)) : '')
    : '';

  yarns.forEach((y) => {
    const node = yarnTpl.content.cloneNode(true);
    const li = node.querySelector('.doc-item');
    li.classList.add('no-click');
    const ref = y.laineId ? stockOf(y.laineId) : null;
    node.querySelector('.yarn-name').textContent = ref ? ref.nom : (y.nom || 'Laine');
    node.querySelector('.yarn-note').textContent = ref
      ? (ref.nomCouleur || ref.nom) + (y.note ? ' — ' + y.note : '')
      : (y.note || 'Hors inventaire');
    node.querySelector('.yarn-grams').textContent = formatCount(y.grammes || 0) + ' g';
    node.querySelector('.yarn-cost').textContent = formatPrice(yarnCostOf(y));
    const pill = node.querySelector('.valid-pill');
    pill.textContent = y.valide ? 'Validée' : 'Engagée';
    pill.classList.add(y.valide ? 'valide' : 'provisoire');
    node.querySelector('.btn-delete-mini').addEventListener('click', async (e) => {
      e.stopPropagation();
      if (confirm('Supprimer cette référence de laine ?')) {
        await delItem(STORES.laines, y.id);
        allYarns = allYarns.filter((x) => x.id !== y.id);
        renderYarns();
        renderCost();
        renderProjects();
        renderDashboard();
        renderStock();
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
  $('yarn-prix').value = '';
  $('yarn-note').value = '';
  $('yarn-ref').value = '';
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
  if (project.autresFrais === undefined) project.autresFrais = 0;

  await putItem(STORES.projets, project);

  // Un projet terminé : ses consommations deviennent définitives, le stock est mis à jour
  if (project.status === 'termine') {
    await validateUsages(project.id);
    renderStock();
  }

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
  renderStock();
  renderTimerUI();
  showView('projects');
});

// ---------- Événements : compteur de rangs ----------
$('btn-stitch-plus').addEventListener('click', () => bumpStitch(1));
$('btn-stitch-minus').addEventListener('click', () => bumpStitch(-1));
$('btn-stitch-apply').addEventListener('click', applyStitchInput);
stitchInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    applyStitchInput();
  }
});

// ---------- Événements : inventaire de laine ----------
function resetStockForm() {
  editingStockId = null;
  $('stock-form-details').removeAttribute('open');
  $('stf-nom').value = '';
  $('stf-nom-couleur').value = '';
  $('stf-notes').value = '';
  $('stf-couleur').value = '#c81e1e';
  $('stf-poids').value = '';
  $('stf-prix').value = '';
  $('btn-add-stock').textContent = 'Ajouter la laine';
  $('btn-cancel-stock').classList.add('hidden');
  $('stf-prix-hint').textContent =
    'Laissez le prix vide pour utiliser le prix moyen calculé à partir de vos achats.';
  $('stock-form-details').querySelector('summary').textContent = 'Nouvelle référence de laine';
}

// Aide sous le formulaire : translation en direct du couple poids / prix payé
function stockFormHint() {
  const poidsBrut = $('stf-poids').value.trim();
  const prixBrut = $('stf-prix').value.trim();
  const poids = parseFloat(poidsBrut) || 0;
  const prix = parseFloat(prixBrut) || 0;
  if (poids > 0 && prix > 0) {
    return poidsBrut + ' g pour ' + formatPrice(prix) + ' → ' +
      formatPrice100(((prix / poids) * 100) / 100) +
      ' — ce prix sera utilisé dans tous les calculs.';
  }
  if (poids > 0 && prixBrut === '') {
    const moy = averagePriceOf(editingStockId);
    return poidsBrut + ' g · sans prix saisi, le prix moyen de vos achats (' +
      (moy > 0 ? formatPrice100(moy) : 'non renseigné') + ') sera utilisé.';
  }
  if (prixBrut !== '') {
    return 'Indiquez le poids (g) pour que le prix pour 100 g soit calculé.';
  }
  return 'Laissez le prix vide pour utiliser le prix moyen calculé à partir de vos achats.';
}

function refreshStockFormHint() {
  $('stf-prix-hint').textContent = stockFormHint();
}

['stf-poids', 'stf-prix'].forEach((id) => {
  $(id).addEventListener('input', refreshStockFormHint);
});

// Remplit le formulaire de référence pour modification (utilisé depuis l'inventaire et le détail)
function startStockEdit(id) {
  const s = stockOf(id);
  if (!s) return;
  editingStockId = id;
  $('stf-nom').value = s.nom || '';
  $('stf-couleur').value = s.couleur || '#c81e1e';
  $('stf-nom-couleur').value = s.nomCouleur || '';
  $('stf-notes').value = s.notes || '';
  // Poids total réellement disponible (achats - validés + ajustement)
  const poids = stockOfficial(id);
  $('stf-poids').value = poids > 0 ? String(Math.round(poids)) : '';
  // Prix payé pour ce poids = prix par 100 g x poids, déduit du prix de base existant
  const base = basePriceOf(id);
  const prix = base > 0 && poids > 0 ? (base / 100) * poids : 0;
  $('stf-prix').value = prix > 0 ? String(Math.round(prix * 100) / 100) : '';
  $('btn-add-stock').textContent = 'Enregistrer les modifications';
  $('btn-cancel-stock').classList.remove('hidden');
  $('stock-form-details').querySelector('summary').textContent = 'Modifier la référence';
  refreshStockFormHint();
  $('stock-form-details').setAttribute('open', '');
  $('stf-poids').focus();
}

$('btn-cancel-stock').addEventListener('click', () => resetStockForm());

$('btn-open-stock').addEventListener('click', () => {
  resetStockForm();
  showView('laine');
});
$('btn-stock-back').addEventListener('click', () => showView('dashboard'));
$('btn-new-stock').addEventListener('click', () => {
  resetStockForm();
  $('stock-form-details').setAttribute('open', '');
  $('stf-nom').focus();
});

$('btn-add-stock').addEventListener('click', async () => {
  const nom = $('stf-nom').value.trim();
  if (!nom) {
    $('stock-form-details').setAttribute('open', '');
    $('stf-nom').focus();
    return;
  }
  const ref = editingStockId
    ? Object.assign({}, stockOf(editingStockId))
    : { id: uid(), createdAt: Date.now(), actif: true };
  ref.nom = nom;
  ref.couleur = $('stf-couleur').value || '#c81e1e';
  ref.nomCouleur = $('stf-nom-couleur').value.trim();
  ref.notes = $('stf-notes').value.trim();

  const poidsBrut = $('stf-poids').value.trim();
  const poids = poidsBrut === '' ? null : Math.max(0, parseFloat(poidsBrut) || 0);
  const prixBrut = $('stf-prix').value.trim();
  const prix = prixBrut === '' ? 0 : Math.max(0, parseFloat(prixBrut) || 0);

  if (prix > 0 && !(poids > 0)) {
    alert('Indiquez le poids en stock (g) pour que le prix pour 100 g soit calculé.');
    $('stf-poids').focus();
    return;
  }
  // Le poids saisi devient le stock officiel : on passe par l'ajustement pour
  // conserver l'historique des achats et ne jamais casser les validations de projets.
  if (poids !== null) {
    const engage = stockEngaged(ref.id);
    if (poids < engage) {
      alert('Impossible : ' + Math.round(engage) + ' g de cette laine sont engagés dans un projet en cours.\n' +
        'Libérez d\'abord ces quantités, ou indiquez un poids supérieur ou égal à ' +
        Math.round(engage) + ' g.');
      $('stf-poids').focus();
      return;
    }
    ref.ajustementG = poids - purchasedGrams(ref.id) + gramsUsed(ref.id, true);
    ref.ajustementNote = ref.ajustementG === 0 ? '' : 'Poids saisi sur la fiche';
  }
  // Prix payé -> prix de base pour 100 g
  ref.prixBase = prix > 0 && poids > 0 ? (prix / poids) * 100 : 0;

  await putItem(STORES.lainesStock, ref);
  allStock = allStock.filter((x) => x.id !== ref.id);
  allStock.push(ref);
  currentStockId = ref.id;
  const enEdition = !!editingStockId;
  resetStockForm();
  renderStock();
  renderYarnReferenceSelect();
  renderDashboard();
  if (enEdition && currentStockId) {
    renderYarnDetail();
    renderCost();
  }
});

$('btn-yarn-back').addEventListener('click', () => showView('laine'));

$('btn-edit-yarn').addEventListener('click', () => {
  if (!stockOf(currentStockId)) return;
  showView('laine');
  startStockEdit(currentStockId);
});

$('btn-toggle-yarn').addEventListener('click', async () => {
  const s = stockOf(currentStockId);
  if (!s) return;
  s.actif = s.actif === false;
  await putItem(STORES.lainesStock, s);
  renderYarnDetail();
  renderStock();
  renderYarnReferenceSelect();
  renderDashboard();
});

$('btn-delete-yarn').addEventListener('click', async () => {
  const s = stockOf(currentStockId);
  if (!s) return;
  const used = usagesOf(s.id);
  if (used.length > 0) {
    const projets = new Set(used.map((u) => u.projetId)).size;
    alert('Cette laine est engagée dans ' + projets + ' projet' + (projets > 1 ? 's' : '') +
      '. Désactivez-la plutôt que de la supprimer, pour conserver votre historique et vos coûts.');
    return;
  }
  if (!confirm('Supprimer définitivement « ' + s.nom +' » et ses achats ?')) return;
  for (const a of achatsOf(s.id)) await delItem(STORES.achats, a.id);
  await delItem(STORES.lainesStock, s.id);
  allAchats = allAchats.filter((x) => x.laineId !== s.id);
  allStock = allStock.filter((x) => x.id !== s.id);
  currentStockId = null;
  renderStock();
  renderYarnReferenceSelect();
  renderDashboard();
});

$('btn-add-purchase').addEventListener('click', async () => {
  const s = stockOf(currentStockId);
  if (!s) return;
  const grammes = Math.max(0, parseFloat($('pur-grammes').value) || 0);
  const prix = Math.max(0, parseFloat($('pur-prix').value) || 0);
  if (grammes <= 0 && prix <= 0) {
    $('purchase-form-details').setAttribute('open', '');
    $('pur-grammes').focus();
    return;
  }

  const enEdition = !!editingPurchaseId;
  let achat = enEdition ? achatsOf(s.id).find((a) => a.id === editingPurchaseId) : null;

  if (enEdition && !achat) {
    // la ligne a été supprimée entre-temps
    resetPurchaseForm();
  } else if (achat) {
    achat.date = $('pur-date').value || todayInput();
    achat.grammes = grammes;
    achat.metres = Math.max(0, parseFloat($('pur-metres').value) || 0);
    achat.prixTotal = prix;
    achat.note = $('pur-note').value.trim() || '';
    await putItem(STORES.achats, achat);
  } else {
    achat = {
      id: uid(),
      laineId: s.id,
      date: $('pur-date').value || todayInput(),
      grammes: grammes,
      metres: Math.max(0, parseFloat($('pur-metres').value) || 0),
      prixTotal: prix,
      note: $('pur-note').value.trim() || '',
      createdAt: Date.now(),
    };
    await putItem(STORES.achats, achat);
    allAchats.push(achat);
  }

  resetPurchaseForm();
  $('pur-date').value = todayInput();
  renderYarnDetail();
  renderStock();
  renderYarns();
  renderCost();
  renderDashboard();
});

$('btn-cancel-purchase').addEventListener('click', () => {
  resetPurchaseForm();
  $('pur-date').value = todayInput();
});

$('btn-apply-adjust').addEventListener('click', async () => {
  const s = stockOf(currentStockId);
  if (!s) return;
  const raw = $('adj-grammes').value.trim();
  if (raw === '') {
    s.ajustementG = 0;
    s.ajustementNote = '';
  } else {
    const target = Math.max(0, parseFloat(raw) || 0);
    s.ajustementG = target - purchasedGrams(s.id) + gramsUsed(s.id, true);
    s.ajustementNote = s.ajustementG === 0 ? '' : $('adj-note').value.trim();
  }
  await putItem(STORES.lainesStock, s);
  renderYarnDetail();
  renderStock();
  renderCost();
  renderDashboard();
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

function renderYarnReferenceSelect() {
  const sel = $('yarn-ref');
  const keep = sel.value;
  sel.innerHTML = '';
  const opt = document.createElement('option');
  opt.value = '';
  opt.textContent = 'Hors inventaire (non suivie)';
  sel.appendChild(opt);
  allStock
    .filter((s) => s.actif !== false)
    .slice()
    .sort((a, b) => a.nom.localeCompare(b.nom))
    .forEach((s) => {
      const o = document.createElement('option');
      o.value = s.id;
      o.textContent = s.nom + (s.nomCouleur ? ' — ' + s.nomCouleur : '');
      sel.appendChild(o);
    });
  sel.value = keep;
}

$('yarn-ref').addEventListener('change', () => {
  const s = stockOf($('yarn-ref').value);
  if (s) $('yarn-name').value = s.nom + (s.nomCouleur ? ', ' + s.nomCouleur : '');
  updateYarnFormHint();
});
$('yarn-grams').addEventListener('input', updateYarnFormHint);

function updateYarnFormHint() {
  const s = stockOf($('yarn-ref').value);
  const grammes = Math.max(0, parseFloat($('yarn-grams').value) || 0);
  if (!s) {
    $('yarn-form-hint').textContent = $('yarn-ref').value
      ? ''
      : 'Hors inventaire : cette laine ne sera pas déduite du stock.';
    return;
  }
  const prevu = stockForecast(s.id);
  const engage = stockEngaged(s.id);
  let txt = 'Disponible : ' + formatCount(prevu) + ' g';
  if (engage > 0) txt += ' (dont ' + formatCount(engage) + ' g déjà engagées)';
  if (purchasedGrams(s.id) > 0) txt += ' · prix moyen ' + formatPrice100(unitPriceOf(s.id));
  if (grammes > prevu) txt += ' ⚠ Engagement supérieur au disponible.';
  $('yarn-form-hint').textContent = txt;
}

// ---------- Modale : achat de laine ----------
const NEW_REF = '__new__';

function openPurchaseModal() {
  const sel = $('pm-ref');
  sel.innerHTML = '';
  const choose = document.createElement('option');
  choose.value = '';
  choose.textContent = '— Choisir une laine —';
  sel.appendChild(choose);
  allStock
    .filter((s) => s.actif !== false)
    .slice()
    .sort((a, b) => (a.nom || '').localeCompare(b.nom || ''))
    .forEach((s) => {
      const o = document.createElement('option');
      o.value = s.id;
      o.textContent = s.nom + (s.nomCouleur ? ' — ' + s.nomCouleur : '');
      sel.appendChild(o);
    });
  const neu = document.createElement('option');
  neu.value = NEW_REF;
  neu.textContent = '+ Nouvelle laine…';
  sel.appendChild(neu);
  sel.value = '';
  $('pm-name').value = '';
  $('pm-desc').value = '';
  $('pm-grams').value = '';
  $('pm-prix').value = '';
  $('pm-note').value = '';
  $('pm-name-field').classList.add('hidden');
  $('pm-info').textContent = '';
  $('purchase-modal').classList.remove('hidden');
}

function closePurchaseModal() {
  $('purchase-modal').classList.add('hidden');
}

$('btn-stock-purchase').addEventListener('click', openPurchaseModal);
$('pm-cancel').addEventListener('click', closePurchaseModal);
$('purchase-modal').addEventListener('click', (e) => {
  if (e.target === $('purchase-modal')) closePurchaseModal();
});

$('pm-ref').addEventListener('change', () => {
  const isNew = $('pm-ref').value === NEW_REF;
  $('pm-name-field').classList.toggle('hidden', !isNew);
  const s = stockOf($('pm-ref').value);
  if (s) {
    $('pm-desc').value = s.nom + (s.nomCouleur ? ', ' + s.nomCouleur : '');
    $('pm-info').textContent = 'Disponible : ' + formatCount(stockForecast(s.id)) + ' g' +
      (purchasedGrams(s.id) > 0 ? ' · prix moyen ' + formatPrice100(unitPriceOf(s.id)) : '');
  } else {
    $('pm-desc').value = '';
    $('pm-info').textContent = isNew
      ? 'Nouvelle référence : elle rejoindra l\'inventaire avec ce premier achat.'
      : '';
  }
});

$('pm-submit').addEventListener('click', async () => {
  const grammes = Math.max(0, parseFloat($('pm-grams').value) || 0);
  const prix = Math.max(0, parseFloat($('pm-prix').value) || 0);
  if (grammes <= 0 && prix <= 0) {
    $('pm-grams').focus();
    return;
  }
  let laineId = $('pm-ref').value;
  if (laineId === NEW_REF) {
    const nom = $('pm-name').value.trim();
    if (!nom) {
      $('pm-name').focus();
      return;
    }
    const ref = {
      id: uid(),
      nom,
      couleur: '#c81e1e',
      nomCouleur: $('pm-desc').value.trim() || '',
      notes: '',
      actif: true,
      createdAt: Date.now(),
    };
    await putItem(STORES.lainesStock, ref);
    allStock.push(ref);
    laineId = ref.id;
  }
  if (!laineId) {
    alert('Choisissez une laine de l\'inventaire, ou créez-en une nouvelle.');
    return;
  }
  const achat = {
    id: uid(),
    laineId,
    date: todayInput(),
    grammes: grammes,
    metres: 0,
    prixTotal: prix,
    note: $('pm-note').value.trim() || '',
    createdAt: Date.now(),
  };
  await putItem(STORES.achats, achat);
  allAchats.push(achat);
  closePurchaseModal();
  renderYarnReferenceSelect();
  renderStock();
  renderDashboard();
});

// ---------- Événements : laine ----------
$('btn-add-yarn').addEventListener('click', async () => {
  const p = projectOf(currentProjectId);
  if (!p) return;
  const ref = stockOf($('yarn-ref').value);
  const nom = $('yarn-name').value.trim();
  const grammes = Math.max(0, parseFloat($('yarn-grams').value) || 0);
  const prixBrut = $('yarn-prix').value.trim();
  if (!nom && grammes <= 0) {
    $('yarn-form-details').setAttribute('open', '');
    $('yarn-name').focus();
    return;
  }
  const yarn = {
    id: uid(),
    projetId: p.id,
    laineId: $('yarn-ref').value || null,
    nom: nom || (ref ? ref.nom : 'Laine'),
    grammes: grammes,
    metres: 0,
    prix: prixBrut === '' ? undefined : Math.max(0, parseFloat(prixBrut) || 0),
    note: $('yarn-note').value.trim() || '',
    valide: p.status === 'termine',
    createdAt: Date.now(),
  };
  await putItem(STORES.laines, yarn);
  allYarns.push(yarn);
  $('yarn-name').value = '';
  $('yarn-grams').value = '';
  $('yarn-prix').value = '';
  $('yarn-note').value = '';
  $('yarn-ref').value = '';
  updateYarnFormHint();
  renderYarns();
  renderCost();
  renderStock();
  renderProjects();
  renderDashboard();
});

$('project-other-cost').addEventListener('change', async () => {
  const p = projectOf(currentProjectId);
  if (!p) return;
  p.autresFrais = Math.max(0, parseFloat($('project-other-cost').value) || 0);
  await putItem(STORES.projets, p);
  renderCost();
  renderDashboard();
});

$('btn-validate-usages').addEventListener('click', async () => {
  const p = projectOf(currentProjectId);
  if (!p) return;
  const n = await validateUsages(p.id);
  renderYarns();
  renderCost();
  renderStock();
  renderDashboard();
  $('cost-note').textContent = n > 0
    ? n + ' engagement' + (n > 1 ? 's' : '') + ' validé' + (n > 1 ? 's' : '') + ' : le stock est à jour.'
    : 'Toutes les lignes sont déjà validées.';
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
    (stitches > 0 ? ' · ' + formatCount(stitches) + ' rangs' : '') + '.';
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
  allStock = await getAll(STORES.lainesStock);
  allAchats = await getAll(STORES.achats);
  timerState = loadTimerDB();
  stitchCounts = loadStitchCounts();
  renderYarnReferenceSelect();
  renderDashboard();
})();