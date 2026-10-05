import { icon } from '../icons.js';
import { listen } from '../util.js';
import { alarms } from '../alarms.js';
import { haptic } from '../haptics.js';
import { fmtKm, fmtDur } from '../track-math.js';

const R = 37; // orbit radius, % of the cluster box

const ORBS = [
  { id: 'moon',       label: 'Moon',      icon: 'moon',    c: ['#7d7d85', '#f2f2f7'], a: 0 },
  { id: 'analytics',  label: 'Analytics', icon: 'sun',     c: ['#9c1020', '#ff6a5a'], a: 45 },
  { id: 'alarm',      label: 'Alarm',     icon: 'bell',    c: ['#a8ff74', '#d7ff2f'], a: 90, dark: true },
  { id: 'activities', label: 'History',   icon: 'route',   c: ['#3b1d9c', '#c4a6ff'], a: 135 },
  { id: 'data',       label: 'Data',      icon: 'layers',  c: ['#b86a00', '#ffe08a'], a: 180 },
  { id: 'metrics',    label: 'Metrics',   icon: 'gauge',   c: ['#0a3fc0', '#74b4ff'], a: 225 },
  { id: 'search',     label: 'Ask',       icon: 'wand',    c: ['#0b0b10', '#50505e'], a: 270 },
  { id: 'settings',   label: 'Settings',  icon: 'sliders', c: ['#26344c', '#b2c1de'], a: 315 },
];

const pt = (a, r = R) => [50 + r * Math.sin((a * Math.PI) / 180), 50 - r * Math.cos((a * Math.PI) / 180)];

export function mount(el, app) {
  const { activities, tracker, go } = app;
  const offs = [];

  const lines = ORBS.map((o) => { const [x, y] = pt(o.a); return `<line x1="50" y1="50" x2="${x.toFixed(2)}" y2="${y.toFixed(2)}"/>`; }).join('');
  const orbs = ORBS.map((o, i) => {
    const [x, y] = pt(o.a);
    const badge = o.id === 'activities' ? '<span class="badge" data-badge hidden></span>' : o.id === 'alarm' ? '<span class="badge" data-abadge hidden></span>' : '';
    return `<button class="orb ${o.dark ? 'dark-ic' : ''}" data-id="${o.id}" style="left:${x}%;top:${y}%;--c1:${o.c[0]};--c2:${o.c[1]};--d:${0.06 + i * 0.05}s" aria-label="${o.label}">
      <span class="orb-body">${icon(o.icon, 24)}</span>${badge}<em class="orb-label">${o.label}</em></button>`;
  }).join('');

  el.innerHTML = `<div class="menu">
    <div class="orbs">
      <svg class="orb-lines" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
        <circle cx="50" cy="50" r="${R}" /><circle cx="50" cy="50" r="${R * 0.55}" />${lines}
      </svg>
      ${orbs}
      <button class="orb center" data-id="walk" style="left:50%;top:50%;--c1:#ff8a4a;--c2:#ffe3c8" aria-label="Walk">
        <span class="orb-body" data-center>${icon('activity', 34)}</span>
      </button>
    </div>
    <p class="menu-hint" data-hint></p>
  </div>`;

  const $c = (s) => el.querySelector(s);

  function refresh() {
    const n = activities.list.length;
    const b = $c('[data-badge]');
    b.hidden = !n; b.textContent = n > 99 ? '99+' : n;
    const active = alarms.list.filter((a) => a.enabled).length;
    const ab = $c('[data-abadge]');
    ab.hidden = !active; ab.textContent = active;
    const s = tracker.snap;
    const idle = s.state === 'idle';
    $c('[data-center]').innerHTML = idle ? icon('activity', 34) : `<span class="orb-km">${fmtKm(s.distance)}<small>km</small></span>`;
    $c('[data-hint]').innerHTML = idle
      ? 'Tap the centre to open your walk tracker'
      : `<b>${s.state === 'paused' ? 'Paused' : 'Recording'}</b> · ${fmtKm(s.distance)} km · ${fmtDur(s.elapsed)}`;
  }

  offs.push(listen(activities, 'change', refresh), listen(tracker, 'fix', refresh), listen(tracker, 'state', refresh), listen(alarms, 'change', refresh));
  const t = setInterval(refresh, 1000);
  refresh();

  el.addEventListener('click', (e) => {
    const b = e.target.closest('.orb');
    if (!b) return;
    haptic.thud();
    go(b.dataset.id);
  });

  app.setEdit('Settings', () => go('settings'));
  return { destroy: () => { clearInterval(t); offs.forEach((f) => f()); } };
}
