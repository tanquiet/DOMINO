// This device's preferences and help desk questions. Everything still works if storage is blocked.
const KEY = 'domino-settings', QUERIES = 'domino-help-queries';
const DEFAULTS = { theme: 'dark', area: null, radiusKm: 5, notify: false, welcomed: false, confirmed: [] };
let memory = null, memoryQueries = [];

function read(key, fallback) {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch { return fallback; }
}
function write(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch { return false; }
}

export function loadSettings() { return { ...DEFAULTS, ...(memory || read(KEY, {})) }; }
export function saveSettings(patch) {
  const next = { ...loadSettings(), ...patch };
  memory = next;
  write(KEY, next);
  return next;
}

export function loadHelpQueries() { return memoryQueries.length ? memoryQueries : read(QUERIES, []); }
export function addHelpQuery({ topic, message }, now = Date.now()) {
  const id = `HD-${Math.floor(now / 1000).toString(36).toUpperCase().slice(-6)}`;
  const next = [{ id, topic, message, createdAt: now }, ...loadHelpQueries()];
  memoryQueries = next;
  write(QUERIES, next);
  return next;
}
export function removeHelpQuery(id) {
  const next = loadHelpQueries().filter((q) => q.id !== id);
  memoryQueries = next;
  write(QUERIES, next);
  return next;
}
