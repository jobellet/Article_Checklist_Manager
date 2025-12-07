import { deriveScheduledDate, getTomorrowWindow, mapTimeToRatio } from './src/utils/family-view-utils.js';
import { TaskStore } from './src/utils/task-store.js';

const STORAGE_KEY = 'acm-family-preferences';
const defaultWindow = { startHour: 6, startMinute: 0, endHour: 10, endMinute: 0 };
let bridge = null;
let preferences = { userPrefs: {}, taskImages: {} };
let taskStore = null;

const els = {
  navLinks: () => document.querySelectorAll('[data-tool]'),
  home: () => document.getElementById('home'),
  familyMain: () => document.getElementById('family-tool'),
  familySection: () => document.querySelector('#family-tool > #family'),
  windowStart: () => document.getElementById('family-window-start'),
  windowEnd: () => document.getElementById('family-window-end'),
  refresh: () => document.getElementById('family-refresh'),
  displayToggle: () => document.getElementById('family-display-mode-toggle'),
  userPrefs: () => document.getElementById('family-user-prefs'),
  taskNameInput: () => document.getElementById('family-task-name-input'),
  taskNameList: () => document.getElementById('family-task-name-list'),
  taskImageInput: () => document.getElementById('family-task-image-input'),
  saveMapping: () => document.getElementById('family-save-image-mapping'),
  mappingList: () => document.getElementById('family-image-mapping-list'),
  viewContainer: () => document.getElementById('family-view-container'),
};

function getStorage() {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch (err) {
    return null;
  }
}

function loadPreferences() {
  const storage = getStorage();
  if (!storage) return;
  const raw = storage.getItem(STORAGE_KEY);
  if (!raw) return;
  try {
    preferences = { ...preferences, ...JSON.parse(raw) };
  } catch (err) {
    preferences = { userPrefs: {}, taskImages: {} };
  }
}

function persistPreferences() {
  const storage = getStorage();
  if (!storage) return;
  storage.setItem(STORAGE_KEY, JSON.stringify(preferences));
}

function getBridge() {
  if (bridge) return bridge;
  if (window.acmFamilyBridge) {
    bridge = window.acmFamilyBridge;
    taskStore = bridge.taskStore;
  }
  return bridge;
}

function ensureTaskStore() {
  if (taskStore) return taskStore;
  const store = new TaskStore();
  const storage = getStorage();
  if (storage) store.loadFromStorage(storage, store.storageKey);
  taskStore = store;
  return store;
}

function getUsers() {
  const b = getBridge();
  if (b?.getKnownUsers) return b.getKnownUsers();
  const store = ensureTaskStore();
  const users = new Set();
  store.tasks.forEach((task) => users.add(task.user));
  return Array.from(users.values());
}

function getUserProfile(user) {
  const b = getBridge();
  if (b?.getUserProfile) return b.getUserProfile(user);
  return { canRead: preferences.userPrefs?.[user]?.canRead !== false };
}

function updateUserProfile(user, updates) {
  const b = getBridge();
  if (b?.updateUserProfile) {
    b.updateUserProfile(user, updates);
  }
  preferences.userPrefs[user] = { ...preferences.userPrefs[user], ...updates };
  persistPreferences();
}

function getTaskImagesMap() {
  const b = getBridge();
  if (b?.taskImageMap) return b.taskImageMap;
  const fallback = new Map(Object.entries(preferences.taskImages || {}));
  return fallback;
}

function persistTaskImages(map) {
  const b = getBridge();
  if (b?.persistTaskImages) return b.persistTaskImages();
  preferences.taskImages = Object.fromEntries(map.entries());
  persistPreferences();
}

function formatInputValue(hour, minute) {
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

function applyWindowDefaults() {
  const b = getBridge();
  const config = b?.familyWindowConfig || defaultWindow;
  const start = els.windowStart();
  const end = els.windowEnd();
  if (start && !start.value) start.value = formatInputValue(config.startHour, config.startMinute);
  if (end && !end.value) end.value = formatInputValue(config.endHour, config.endMinute);
}

function parseWindowInputs() {
  const startVal = els.windowStart()?.value || formatInputValue(defaultWindow.startHour, defaultWindow.startMinute);
  const endVal = els.windowEnd()?.value || formatInputValue(defaultWindow.endHour, defaultWindow.endMinute);
  const [startHour, startMinute] = startVal.split(':').map(Number);
  const [endHour, endMinute] = endVal.split(':').map(Number);
  const config = {
    startHour: Number.isFinite(startHour) ? startHour : defaultWindow.startHour,
    startMinute: Number.isFinite(startMinute) ? startMinute : defaultWindow.startMinute,
    endHour: Number.isFinite(endHour) ? endHour : defaultWindow.endHour,
    endMinute: Number.isFinite(endMinute) ? endMinute : defaultWindow.endMinute,
  };
  const b = getBridge();
  if (b?.setFamilyWindowConfig) b.setFamilyWindowConfig(config);
  return config;
}

function buildWindowRange() {
  const config = parseWindowInputs();
  return getTomorrowWindow(config);
}

function toggleDisplayMode(active) {
  document.body.classList.toggle('family-display-mode-active', active);
}

function renderUserPrefs() {
  const container = els.userPrefs();
  if (!container) return;
  const users = getUsers();
  container.innerHTML = '';
  if (!users.length) {
    container.innerHTML = '<p class="muted">No users yet.</p>';
    return;
  }
  users.forEach((user) => {
    const label = document.createElement('label');
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = getUserProfile(user).canRead !== false;
    checkbox.dataset.user = user;
    checkbox.className = 'family-can-read-toggle';
    checkbox.addEventListener('change', () => {
      updateUserProfile(user, { canRead: checkbox.checked });
      renderFamilyView();
    });
    label.appendChild(checkbox);
    label.appendChild(document.createTextNode(` Can read? (${user})`));
    container.appendChild(label);
  });
}

function populateTaskNameList() {
  const datalist = els.taskNameList();
  if (!datalist) return;
  datalist.innerHTML = '';
  const names = new Set();
  ensureTaskStore().tasks.forEach((task) => names.add(task.name));
  Array.from(names).sort().forEach((name) => {
    const option = document.createElement('option');
    option.value = name;
    datalist.appendChild(option);
  });
}

function renderImageMappings() {
  const container = els.mappingList();
  if (!container) return;
  const map = getTaskImagesMap();
  container.innerHTML = '';
  if (!map.size) {
    container.innerHTML = '<p class="muted">No task images mapped yet.</p>';
    return;
  }
  map.forEach((src, name) => {
    const row = document.createElement('div');
    const img = document.createElement('img');
    img.src = src;
    img.alt = `${name} image`;
    img.className = 'family-task-image';
    const label = document.createElement('span');
    label.textContent = name;
    const remove = document.createElement('button');
    remove.textContent = 'Remove';
    remove.addEventListener('click', () => {
      map.delete(name);
      persistTaskImages(map);
      renderImageMappings();
      renderFamilyView();
    });
    row.appendChild(img);
    row.appendChild(label);
    row.appendChild(remove);
    container.appendChild(row);
  });
}

function handleSaveMapping() {
  const nameInput = els.taskNameInput();
  if (!nameInput) return;
  const name = nameInput.value.trim();
  if (!name) return;
  const fileInput = els.taskImageInput();
  const map = getTaskImagesMap();
  const save = (src) => {
    map.set(name, src);
    persistTaskImages(map);
    renderImageMappings();
    renderFamilyView();
  };
  const file = fileInput?.files?.[0];
  if (file) {
    const reader = new FileReader();
    reader.onload = () => save(reader.result);
    reader.readAsDataURL(file);
  }
  nameInput.value = '';
  if (fileInput) fileInput.value = '';
}

function showTool(tool) {
  const home = els.home();
  const family = els.familyMain();
  if (home) home.style.display = tool === 'home' ? '' : 'none';
  if (family) {
    family.style.display = tool === 'family' ? '' : 'none';
    const section = els.familySection();
    if (section) section.style.display = tool === 'family' ? '' : 'none';
  }
  els.navLinks().forEach((link) => {
    link.classList.toggle('active', link.dataset.tool === tool);
  });
  if (tool === 'family') {
    renderUserPrefs();
    populateTaskNameList();
    renderImageMappings();
    renderFamilyView();
  }
}

function renderFamilyView() {
  const container = els.viewContainer();
  if (!container) return;
  const map = getTaskImagesMap();
  const users = getUsers();
  container.innerHTML = '';
  if (!users.length) {
    container.innerHTML = '<p class="muted">No users in this window.</p>';
    return;
  }
  const { start, end } = buildWindowRange();
  const tasks = Array.from(ensureTaskStore().tasks.values());
  const scheduled = [];
  tasks.forEach((task, idx) => {
    const scheduledDate = deriveScheduledDate(task, start, end, idx * 10);
    if (!scheduledDate || scheduledDate < start || scheduledDate > end) return;
    const dependency = task.dependency ? ensureTaskStore().tasks.get(task.dependency) : null;
    const blocked = dependency ? !dependency.completed : false;
    scheduled.push({ ...task, scheduled: scheduledDate, blocked });
  });
  if (!scheduled.length) {
    container.innerHTML = '<p class="muted">No tasks in this window.</p>';
    return;
  }
  scheduled.sort((a, b) => a.scheduled - b.scheduled);
  const times = scheduled.map((t) => t.scheduled.getTime());
  const minTime = new Date(Math.min(...times, start.getTime()));
  const maxTime = new Date(Math.max(...times, end.getTime()));
  const byUser = new Map();
  scheduled.forEach((task) => {
    if (!byUser.has(task.user)) byUser.set(task.user, []);
    byUser.get(task.user).push(task);
  });

  users.forEach((user) => {
    const column = document.createElement('div');
    column.className = 'family-column';
    const header = document.createElement('div');
    header.className = 'family-column-header';
    header.textContent = user;
    column.appendChild(header);

    const timeline = document.createElement('div');
    timeline.className = 'family-timeline';
    const tasksForUser = byUser.get(user) || [];
    if (!tasksForUser.length) {
      const empty = document.createElement('p');
      empty.className = 'muted';
      empty.textContent = 'No tasks in this window';
      timeline.appendChild(empty);
    } else {
      const height = timeline.clientHeight || 320;
      tasksForUser.forEach((task) => {
        const ratio = mapTimeToRatio(task.scheduled, minTime, maxTime);
        const topPx = ratio * height;
        const card = document.createElement('div');
        card.className = 'family-task';
        card.classList.add(task.fixFlex === 'FIX' ? 'family-task-fix' : 'family-task-flex');
        if (task.blocked) card.classList.add('family-task-blocked');
        card.style.top = `${topPx}px`;

        const imgSrc = map.get(task.name);
        const canRead = getUserProfile(user).canRead !== false;
        if (imgSrc) {
          const img = document.createElement('img');
          img.src = imgSrc;
          img.alt = task.name;
          img.className = 'family-task-image';
          card.appendChild(img);
        }

        if (getUserProfile(user).canRead !== false || !imgSrc) {
          const label = document.createElement('div');
          label.className = 'family-task-label';
          label.textContent = task.name;
          card.appendChild(label);
        }

        const time = document.createElement('div');
        time.className = 'family-task-time';
        time.textContent = task.scheduled.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
        card.appendChild(time);

        timeline.appendChild(card);
      });
    }
    column.appendChild(timeline);
    container.appendChild(column);
  });
}

function initFamilyView() {
  applyWindowDefaults();
  renderUserPrefs();
  populateTaskNameList();
  renderImageMappings();
  renderFamilyView();

  els.navLinks().forEach((link) => {
    link.addEventListener('click', (event) => {
      event.preventDefault();
      showTool(link.dataset.tool);
    });
  });

  const refresh = els.refresh();
  if (refresh) refresh.addEventListener('click', renderFamilyView);

  const start = els.windowStart();
  const end = els.windowEnd();
  if (start) start.addEventListener('change', () => renderFamilyView());
  if (end) end.addEventListener('change', () => renderFamilyView());

  const display = els.displayToggle();
  if (display) {
    display.addEventListener('change', () => toggleDisplayMode(display.checked));
  }

  const save = els.saveMapping();
  if (save) save.addEventListener('click', handleSaveMapping);

  showTool('home');
}

function waitForBridge() {
  if (getBridge()) {
    initFamilyView();
    return;
  }
  document.addEventListener('acm-family-bridge-ready', () => {
    bridge = window.acmFamilyBridge;
    taskStore = bridge.taskStore;
    initFamilyView();
  });
}

loadPreferences();
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', waitForBridge);
} else {
  waitForBridge();
}

export { initFamilyView };
