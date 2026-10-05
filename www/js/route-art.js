import { simplify, normalizeRoute, fmtKm } from './track-math.js';
import { hash } from './util.js';

// Backdrops lifted from the design: cool grey-blue fading into warm salmon
const PAL = [['#aab1c0', '#e89279'], ['#9fb4c7', '#e7a38a'], ['#b3a9c6', '#e58f86'], ['#a9bfb7', '#e8b085']];
// a friendly demo outline for empty states (0..1 coordinates)
export const DEMO_ROUTE = [[0.1, 0.66], [0.16, 0.5], [0.28, 0.36], [0.4, 0.3], [0.48, 0.38], [0.58, 0.2], [0.8, 0.3], [0.72, 0.52], [0.58, 0.58], [0.44, 0.7], [0.26, 0.74], [0.12, 0.68]];

const cache = new Map();

function squircle(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

/**
 * Renders a frosted-glass "Yeasy Run" style card to a data URL.
 * act = { id, name, distance, points } or null for the empty-state demo card.
 */
export function routeCard(act, { size = 360, seed = 0 } = {}) {
  const key = `${act?.id ?? 'demo' + seed}@${size}@${act?.name ?? ''}@${act?.distance ?? 0}`;
  if (cache.has(key)) return cache.get(key);
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const [top, bot] = PAL[hash(String(act?.id ?? seed)) % PAL.length];

  // backdrop (blurred), with a dark silhouette-like blob like the reference photo
  g.save();
  g.filter = `blur(${size * 0.045}px)`;
  const bg = g.createLinearGradient(0, 0, 0, size);
  bg.addColorStop(0, top); bg.addColorStop(1, bot);
  g.fillStyle = bg; g.fillRect(-size * 0.1, -size * 0.1, size * 1.2, size * 1.2);
  g.fillStyle = '#161c28';
  squircle(g, size * 0.38, 0, size * 0.22, size * 0.5, size * 0.08);
  g.fill();
  g.beginPath(); g.ellipse(size * 0.5, size * 0.92, size * 0.36, size * 0.36, 0, 0, 7); g.fill();
  g.restore();

  // frosted glass pane
  const m = size * 0.07, r = size * 0.2;
  squircle(g, m, m, size - 2 * m, size - 2 * m, r);
  g.fillStyle = 'rgba(255,255,255,0.22)'; g.fill();
  g.lineWidth = Math.max(1, size * 0.004); g.strokeStyle = 'rgba(255,255,255,0.6)'; g.stroke();
  const sheen = g.createLinearGradient(0, m, size * 0.7, size * 0.7);
  sheen.addColorStop(0, 'rgba(255,255,255,0.35)'); sheen.addColorStop(0.5, 'rgba(255,255,255,0)');
  squircle(g, m, m, size - 2 * m, size - 2 * m, r); g.fillStyle = sheen; g.fill();

  // route
  const bw = size * 0.64, bh = size * 0.34, bx = size * 0.18, by = size * 0.14;
  let pts;
  if (act?.points?.length > 1) pts = normalizeRoute(simplify(act.points, 4), bw, bh, 8);
  else pts = DEMO_ROUTE.map(([x, y]) => [x * bw, y * bh]);
  g.save(); g.translate(bx, by);
  g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
  g.lineJoin = g.lineCap = 'round'; g.lineWidth = Math.max(1.5, size * 0.006); g.strokeStyle = 'rgba(255,255,255,0.92)'; g.stroke();
  const [ex, ey] = pts[pts.length - 1];
  g.beginPath(); g.arc(ex, ey, size * 0.035, 0, 7); g.strokeStyle = 'rgba(255,225,120,0.9)'; g.lineWidth = size * 0.007; g.stroke();
  g.beginPath(); g.arc(ex, ey, size * 0.014, 0, 7); g.fillStyle = '#ffe36b'; g.shadowColor = '#ffe36b'; g.shadowBlur = size * 0.03; g.fill();
  g.restore();

  // text
  g.fillStyle = 'rgba(255,255,255,0.92)';
  g.font = `italic 700 ${size * 0.042}px system-ui, sans-serif`;
  g.fillText(act?.name ?? 'Your first walk', size * 0.13, size * 0.66);
  g.save(); g.shadowColor = 'rgba(255,255,255,0.55)'; g.shadowBlur = size * 0.03; g.shadowOffsetY = size * 0.012;
  g.font = `italic 700 ${size * 0.17}px system-ui, sans-serif`;
  const d = act ? fmtKm(act.distance) : '0.00';
  g.fillText(d, size * 0.12, size * 0.81);
  const dw = g.measureText(d).width;
  g.restore();
  g.fillStyle = 'rgba(255,255,255,0.7)';
  g.font = `italic 700 ${size * 0.036}px system-ui, sans-serif`;
  g.fillText('KM', size * 0.12 + dw + size * 0.02, size * 0.81);

  const url = c.toDataURL('image/jpeg', 0.9);
  cache.set(key, url);
  return url;
}
