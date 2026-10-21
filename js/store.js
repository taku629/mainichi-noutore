import { todayKey, daysBetween } from './util.js';

/* ================= 状態保存 ================= */
export const STORE_KEY = 'noutore-v2';
export function sanitizeState(s) {
  if (!s || typeof s !== 'object' || Array.isArray(s)) s = {};
  if (typeof s.muted !== 'boolean') s.muted = false;
  ['checks', 'bench', 'challenges', 'levels'].forEach(k => { if (!s[k] || typeof s[k] !== 'object' || Array.isArray(s[k])) s[k] = {}; });
  if (typeof s.bigText !== 'boolean') s.bigText = false;
  if (typeof s.dark !== 'boolean') s.dark = !!(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
  if (typeof s.tab !== 'string') s.tab = 'home';
  if (typeof s.seenIntro !== 'boolean') s.seenIntro = false;
  if (!s.family || typeof s.family !== 'object' || typeof s.family.code !== 'string' || typeof s.family.name !== 'string') s.family = null; // {code, name}
  if (typeof s.lastPost !== 'string') s.lastPost = '';    // 今日投稿済みか
  Object.keys(s.bench).forEach(k => {
    const e = s.bench[k];
    if (!e || typeof e !== 'object' || typeof e.score !== 'number' || !isFinite(e.score)) { delete s.bench[k]; return; }
    if (!e.metrics || typeof e.metrics !== 'object' || Array.isArray(e.metrics)) e.metrics = {};
    if (!e.scores || typeof e.scores !== 'object' || Array.isArray(e.scores)) e.scores = {};
  });
  Object.keys(s.checks).forEach(k => { if (!s.checks[k] || typeof s.checks[k] !== 'object' || Array.isArray(s.checks[k])) delete s.checks[k]; });
  Object.keys(s.challenges).forEach(k => {
    const e = s.challenges[k];
    if (!e || typeof e !== 'object' || typeof e.idx !== 'number' || typeof e.status !== 'string') delete s.challenges[k];
  });
  Object.keys(s.levels).forEach(k => { if (typeof s.levels[k] !== 'number' || !isFinite(s.levels[k])) delete s.levels[k]; });
  return s;
}
export let state;
try {
  const raw = localStorage.getItem(STORE_KEY);
  const parsed = JSON.parse(raw);
  state = sanitizeState(parsed);
  if (raw !== null && (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))) localStorage.removeItem(STORE_KEY);
} catch (e) { state = sanitizeState(null); }

export let coachBusy = false;
export const KV = 'https://keyvalue.immanuel.co/api/KeyVal';
export const b64u = s => btoa(unescape(encodeURIComponent(s))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
export const b64uDec = s => { s = s.replace(/-/g, '+').replace(/_/g, '/'); return decodeURIComponent(escape(atob(s + '='.repeat((4 - s.length % 4) % 4)))); };
export const kvSet = (ak, k, v) => fetch(`${KV}/UpdateValue/${ak}/${encodeURIComponent(k)}/${b64u(JSON.stringify(v))}`, { method: 'POST' }).then(r => r.ok ? r.json() : Promise.reject());
export const kvGet = async (ak, k) => {
  const r = await fetch(`${KV}/GetValue/${ak}/${encodeURIComponent(k)}`);
  const s = await r.json();
  try { return s ? JSON.parse(b64uDec(s)) : null; } catch (e) { return null; }
};
export const famAk = code => 'noutore' + code;
export const hexEnc = s => Array.from(new TextEncoder().encode(s)).map(b => b.toString(16).padStart(2, '0')).join('');
export const famMk = name => 'm' + hexEnc(name);

export function save() { try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (e) {} }

export function isActiveDay(k) {
  const c = state.checks[k];
  return (c && Object.values(c).some(Boolean)) || !!state.bench[k] ||
    (state.challenges[k] && state.challenges[k].status === 'done');
}

export function activeDates() {
  const set = new Set();
  [...Object.keys(state.checks), ...Object.keys(state.bench), ...Object.keys(state.challenges)]
    .forEach(k => { if (isActiveDay(k)) set.add(k); });
  return [...set];
}

export function currentStreak() {
  const set = new Set(activeDates());
  let n = 0;
  const d = new Date();
  if (!set.has(todayKey(d))) d.setDate(d.getDate() - 1);
  while (set.has(todayKey(d))) { n++; d.setDate(d.getDate() - 1); }
  return n;
}

export function lastBench(beforeDate) {
  const keys = Object.keys(state.bench).filter(k => (!beforeDate || k < beforeDate) && state.bench[k] && typeof state.bench[k] === 'object' && typeof state.bench[k].score === 'number').sort();
  const k = keys[keys.length - 1];
  return k ? { date: k, ...state.bench[k] } : null;
}

export function maxStreak() {
  let best = 0, cur = 0, prev = null;
  activeDates().sort().forEach(k => {
    cur = prev && daysBetween(prev, k) === 1 ? cur + 1 : 1;
    if (cur > best) best = cur;
    prev = k;
  });
  return best;
}

export function setState(next) { state = next; }
export function setCoachBusy(v) { coachBusy = v; }
