// Motion + ambient-colour helpers for the glass UI. The pure functions are unit-tested.
import { settings } from './settings.js';

/** Screen order: opening a screen from the menu slides forward, going back slides the other way. */
export const ORDER = ['menu', 'walk', 'map', 'activities', 'moon', 'analytics', 'alarm', 'metrics', 'data', 'search', 'settings'];
export function direction(from, to) {
  const a = ORDER.indexOf(from), b = ORDER.indexOf(to);
  if (a < 0 || b < 0 || a === b) return 1;
  return b > a ? 1 : -1;
}

/** Ambient "aura" colours behind the frosted glass, one trio per screen. */
export const AURA = {
  menu: ['#7c4dff', '#ff8a4a', '#2de2e6'],
  walk: ['#ff9a6b', '#7f8cff', '#ff5d8f'],
  map: ['#38bdf8', '#2547c9', '#0f766e'],
  activities: ['#a78bfa', '#38bdf8', '#ff7a45'],
  moon: ['#ff8a4a', '#6b4cff', '#c2410c'],
  analytics: ['#ff4d6d', '#ffb43a', '#4c6bff'],
  alarm: ['#d7ff2f', '#19c8a8', '#2a5bff'],
  metrics: ['#5b8cff', '#4ade80', '#a78bfa'],
  data: ['#ffb43a', '#b36bff', '#ff5d8f'],
  search: ['#ffb43a', '#7c4dff', '#ff5d8f'],
  settings: ['#38bdf8', '#7c4dff', '#4b5d85'],
};

export function applyAura(el, viewId) {
  const [a, b, c] = AURA[viewId] || AURA.menu;
  el.style.setProperty('--a1', a);
  el.style.setProperty('--a2', b);
  el.style.setProperty('--a3', c);
}

/** Directional blur strength (SVG stdDeviation, px) for a scroller moving at `vel` items/frame. */
export function blurFor(vel, pxPerItem = 60, k = 0.2, max = 7) {
  const sd = Math.abs(vel) * pxPerItem * k;
  return sd < 0.5 ? 0 : Math.round(Math.min(max, sd) * 10) / 10;
}

/**
 * Returns update(vel) that applies a horizontal ('x') or vertical ('y') motion blur to `target`
 * through the shared SVG filters in index.html, and removes the filter again once motion stops.
 */
export function motionBlur(target, axis = 'x', pxPerItem = 60) {
  const id = axis === 'x' ? 'mbx' : 'mby';
  const node = document.getElementById(id)?.querySelector('feGaussianBlur');
  let on = false;
  return (vel) => {
    if (!node) return;
    const sd = settings.get('motionBlur') ? blurFor(vel, pxPerItem) : 0;
    if (!sd) { if (on) { target.style.filter = ''; on = false; } return; }
    node.setAttribute('stdDeviation', axis === 'x' ? `${sd} 0` : `0 ${sd}`);
    if (!on) { target.style.filter = `url(#${id})`; on = true; }
  };
}

/** Restart a one-shot CSS animation class (used for the title swap). */
export function replay(el, cls) {
  el.classList.remove(cls);
  void el.offsetWidth;
  el.classList.add(cls);
}
