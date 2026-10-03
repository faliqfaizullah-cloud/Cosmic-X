export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];
export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

export const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function fmtTime(s) {
  if (!isFinite(s) || s < 0) s = 0;
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${String(sec).padStart(2, '0')}`;
}

export function fmtBytes(n) {
  if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

export function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
  return h >>> 0;
}

// Cosmic gradient pairs [light, dark] used for tracks without artwork
export const PALETTES = [
  ['#ff9a5a', '#5a1a14'],
  ['#d7ff2f', '#169c8a'],
  ['#5b8cff', '#12d6c0'],
  ['#ff4d6d', '#6d1030'],
  ['#b36bff', '#241a7a'],
  ['#ffd35a', '#ff6a3d'],
  ['#6be4ff', '#2d3bff'],
  ['#9cff6b', '#0f5a4a'],
];
export const paletteFor = (seed) => PALETTES[hash(String(seed)) % PALETTES.length];

export function uid() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

export const debounce = (fn, ms) => {
  let t;
  return (...a) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...a), ms);
  };
};

let toastTimer;
export function toast(msg, ms = 2400) {
  const el = $('#toast');
  if (!el) return;
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), ms);
}

export function confirmSheet({ title, message = '', confirm = 'Delete', danger = true }) {
  return new Promise((resolve) => {
    const root = document.createElement('div');
    root.className = 'sheet-wrap';
    root.innerHTML = `<div class="sheet">
      <h3>${esc(title)}</h3><p>${esc(message)}</p>
      <div class="sheet-row">
        <button class="sheet-btn" data-r="0">Cancel</button>
        <button class="sheet-btn ${danger ? 'danger' : 'primary'}" data-r="1">${esc(confirm)}</button>
      </div></div>`;
    root.addEventListener('click', (e) => {
      const b = e.target.closest('[data-r]');
      if (b || e.target === root) {
        root.remove();
        resolve(b?.dataset.r === '1');
      }
    });
    document.body.append(root);
  });
}

// Subscribe helper that returns an unsubscribe fn
export function listen(target, ev, fn, opts) {
  target.addEventListener(ev, fn, opts);
  return () => target.removeEventListener(ev, fn, opts);
}
