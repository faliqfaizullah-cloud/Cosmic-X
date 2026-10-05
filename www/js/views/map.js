import { icon } from '../icons.js';
import { activities } from '../activities.js';
import { tracker } from '../tracker.js';
import { haptic } from '../haptics.js';
import { listen } from '../util.js';
import { TILE, lonLatToWorld, worldToLonLat, bounds, fitZoom, fmtKm, fmtDur, fmtPace, paceOf } from '../track-math.js';
import { getCoords } from '../weather.js';
import { openActivitySheet } from '../activity-sheet.js';

const TILE_URL = (z, x, y) => `https://tile.openstreetmap.org/${z}/${x}/${y}.png`;

/**
 * Slippy map: OpenStreetMap tiles (drawn dark) + your route on a canvas.
 * params.id -> view a saved activity; otherwise the live recording (follows you).
 */
export function mount(el, app, params = {}) {
  const act = params.id ? activities.byId.get(params.id) : null;
  const offs = [];
  let W = 0, H = 0;
  let z = 15, center = { lat: 3.139, lon: 101.687 };
  let follow = !act;
  const tiles = new Map(); // "z/x/y" -> <img>

  el.innerHTML = `<div class="map">
    <div class="map-tiles" data-tiles></div>
    <canvas class="map-route" data-route></canvas>
    <div class="map-attr">© OpenStreetMap contributors</div>
    <div class="map-ctl">
      <button data-z="1" aria-label="Zoom in">${icon('plus', 20)}</button>
      <button data-z="-1" aria-label="Zoom out"><svg class="ic" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="5" y1="12" x2="19" y2="12"/></svg></button>
      <button data-fit aria-label="Fit route">${icon('route', 20)}</button>
      <button data-me class="${follow ? 'on' : ''}" aria-label="Follow me">${icon('pin', 20)}</button>
    </div>
    <div class="map-card glass" data-card></div>
  </div>`;

  const box = el.querySelector('.map');
  const tileLayer = el.querySelector('[data-tiles]');
  const cv = el.querySelector('[data-route]');
  const card = el.querySelector('[data-card]');

  const routePts = () => (act ? act.points : tracker.points);

  // ---------- view maths ----------
  const origin = () => {
    const [cx, cy] = lonLatToWorld(center.lon, center.lat, z);
    return [cx - W / 2, cy - H / 2];
  };
  const toScreen = (lon, lat) => {
    const [ox, oy] = origin();
    const [x, y] = lonLatToWorld(lon, lat, z);
    return [x - ox, y - oy];
  };

  function renderTiles() {
    const [ox, oy] = origin();
    const n = 2 ** z;
    const x0 = Math.floor(ox / TILE), x1 = Math.floor((ox + W) / TILE);
    const y0 = Math.max(0, Math.floor(oy / TILE)), y1 = Math.min(n - 1, Math.floor((oy + H) / TILE));
    const want = new Set();
    for (let ty = y0; ty <= y1; ty++) {
      for (let tx = x0; tx <= x1; tx++) {
        const wx = ((tx % n) + n) % n;
        const key = `${z}/${wx}/${ty}@${tx}`;
        want.add(key);
        let img = tiles.get(key);
        if (!img) {
          img = new Image();
          img.className = 'tile';
          img.decoding = 'async';
          img.draggable = false;
          img.referrerPolicy = 'origin';
          img.onload = () => img.classList.add('in');
          img.onerror = () => img.remove(); // offline: the route still draws over the dark grid
          img.src = TILE_URL(z, wx, ty);
          tileLayer.append(img);
          tiles.set(key, img);
        }
        img.style.transform = `translate(${Math.round(tx * TILE - ox)}px, ${Math.round(ty * TILE - oy)}px)`;
      }
    }
    for (const [k, img] of tiles) if (!want.has(k)) { img.remove(); tiles.delete(k); }
  }

  function renderRoute() {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    if (cv.width !== Math.round(W * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
    const g = cv.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, W, H);
    const pts = routePts();
    if (pts.length > 1) {
      g.lineJoin = g.lineCap = 'round';
      const path = () => { g.beginPath(); pts.forEach((p, i) => { const [x, y] = toScreen(p[1], p[0]); i ? g.lineTo(x, y) : g.moveTo(x, y); }); };
      path(); g.strokeStyle = 'rgba(0,0,0,0.55)'; g.lineWidth = 8; g.stroke();
      path(); g.strokeStyle = '#ffe36b'; g.lineWidth = 4.5; g.stroke();
      path(); g.strokeStyle = '#fff'; g.lineWidth = 1.5; g.stroke();
      const s = toScreen(pts[0][1], pts[0][0]);
      g.beginPath(); g.arc(s[0], s[1], 6, 0, 7); g.fillStyle = '#4ade80'; g.strokeStyle = '#fff'; g.lineWidth = 2; g.fill(); g.stroke();
    }
    const here = act ? (pts.length ? { lat: pts[pts.length - 1][0], lon: pts[pts.length - 1][1] } : null) : tracker.last ? { lat: tracker.last.lat, lon: tracker.last.lon } : null;
    if (here) {
      const [x, y] = toScreen(here.lon, here.lat);
      g.beginPath(); g.arc(x, y, 16, 0, 7); g.fillStyle = 'rgba(255,227,107,0.28)'; g.fill();
      g.beginPath(); g.arc(x, y, 7, 0, 7); g.fillStyle = '#ffe36b'; g.strokeStyle = '#fff'; g.lineWidth = 2.5; g.fill(); g.stroke();
    }
  }

  const redraw = () => { renderTiles(); renderRoute(); };

  function fit() {
    const pts = routePts();
    if (pts.length > 1) {
      const b = bounds(pts);
      z = fitZoom(b, W, H, 70, 17);
      center = { lat: (b.minLat + b.maxLat) / 2, lon: (b.minLon + b.maxLon) / 2 };
    } else if (tracker.last) center = { lat: tracker.last.lat, lon: tracker.last.lon };
    else { const c = getCoords(); center = { lat: c.lat, lon: c.lon }; }
    redraw();
  }

  function setZoom(nz) {
    z = Math.max(3, Math.min(18, nz));
    haptic.tick();
    redraw();
  }

  // ---------- gestures: drag to pan, pinch / double-tap to zoom ----------
  const ptrs = new Map();
  let pinch0 = 0, pinchZ = 0, lastTap = 0;
  box.addEventListener('pointerdown', (e) => {
    if (e.target.closest('.map-ctl, .map-card')) return;
    box.setPointerCapture(e.pointerId);
    ptrs.set(e.pointerId, [e.clientX, e.clientY]);
    if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; pinch0 = Math.hypot(a[0] - b[0], a[1] - b[1]); pinchZ = z; }
    const now = performance.now();
    if (ptrs.size === 1 && now - lastTap < 300) setZoom(z + 1);
    lastTap = now;
  });
  box.addEventListener('pointermove', (e) => {
    const p = ptrs.get(e.pointerId);
    if (!p) return;
    if (ptrs.size === 1) {
      const dx = e.clientX - p[0], dy = e.clientY - p[1];
      p[0] = e.clientX; p[1] = e.clientY;
      if (dx || dy) {
        if (follow) { follow = false; el.querySelector('[data-me]').classList.remove('on'); }
        const [cx, cy] = lonLatToWorld(center.lon, center.lat, z);
        const [lon, lat] = worldToLonLat(cx - dx, cy - dy, z);
        center = { lat, lon };
        redraw();
      }
    } else if (ptrs.size === 2) {
      ptrs.set(e.pointerId, [e.clientX, e.clientY]);
      const [a, b] = [...ptrs.values()];
      const d = Math.hypot(a[0] - b[0], a[1] - b[1]);
      const nz = Math.max(3, Math.min(18, Math.round(pinchZ + Math.log2(d / pinch0))));
      if (nz !== z) setZoom(nz);
    }
  });
  const up = (e) => ptrs.delete(e.pointerId);
  box.addEventListener('pointerup', up);
  box.addEventListener('pointercancel', up);

  el.addEventListener('click', (e) => {
    const zb = e.target.closest('[data-z]');
    if (zb) return setZoom(z + +zb.dataset.z);
    if (e.target.closest('[data-fit]')) { follow = false; el.querySelector('[data-me]').classList.remove('on'); return fit(); }
    if (e.target.closest('[data-me]')) {
      follow = true; el.querySelector('[data-me]').classList.add('on');
      if (tracker.last) { center = { lat: tracker.last.lat, lon: tracker.last.lon }; z = Math.max(z, 16); }
      return redraw();
    }
    if (e.target.closest('[data-details]') && act) openActivitySheet(app, act, { onMap: false });
  });

  // ---------- stats card ----------
  function renderCard() {
    if (act) {
      const t = act.moving || act.elapsed;
      card.innerHTML = `<div class="mc-name">${act.name}</div><div class="mc-row">
        <div><b>${fmtKm(act.distance)}</b><span>km</span></div><div><b>${fmtDur(act.elapsed)}</b><span>time</span></div>
        <div><b>${fmtPace(paceOf(act.distance, t))}</b><span>/km</span></div>
        <button class="chip" data-details>Details</button></div>`;
    } else {
      const s = tracker.snap;
      card.innerHTML = `<div class="mc-name">${s.state === 'idle' ? 'Not recording' : s.state === 'paused' ? 'Paused' : 'Recording'}${s.weak ? ' · weak GPS' : ''}</div><div class="mc-row">
        <div><b>${fmtKm(s.distance)}</b><span>km</span></div><div><b>${fmtDur(s.elapsed)}</b><span>time</span></div>
        <div><b>${fmtPace(s.avgPace)}</b><span>/km</span></div></div>`;
    }
  }

  function onLive() {
    if (follow && tracker.last) center = { lat: tracker.last.lat, lon: tracker.last.lon };
    redraw();
    renderCard();
  }

  if (!act) offs.push(listen(tracker, 'fix', onLive), listen(tracker, 'state', renderCard));
  const clock = !act ? setInterval(renderCard, 1000) : 0;

  const ro = new ResizeObserver(() => {
    W = box.clientWidth; H = box.clientHeight;
    if (!W || !H) return;
    first ? (first = false, fit()) : redraw();
  });
  let first = true;
  ro.observe(box);

  renderCard();
  app.setEdit(act ? 'Details' : 'Walk', act ? () => openActivitySheet(app, act, { onMap: false }) : () => app.go('walk'));
  app.setTitle(act ? act.name : 'Map');
  return { destroy: () => { ro.disconnect(); clearInterval(clock); offs.forEach((f) => f()); } };
}
