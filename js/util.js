/* ================= ユーティリティ ================= */
export const $ = (sel, root) => (root || document).querySelector(sel);

export function el(html) {
  const d = document.createElement('div');
  d.innerHTML = html.trim();
  return d.firstElementChild;
}

export function randInt(a, b) { return a + Math.floor(Math.random() * (b - a + 1)); }

export function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function sample(arr, n) { return shuffle(arr).slice(0, n); }

export function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

export function pad2(n) { return String(n).padStart(2, '0'); }
export function todayKey(d) {
  d = d || new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}
export function daysBetween(a, b) { // 'YYYY-MM-DD' の差(b - a, 日数)
  return Math.round((new Date(b) - new Date(a)) / 86400000);
}

export const WDAYS = ['日', '月', '火', '水', '木', '金', '土'];

export function normJp(s) { return s.toLowerCase().replace(/[ァ-ヶ]/g, c => String.fromCharCode(c.charCodeAt(0) - 0x60)); }
