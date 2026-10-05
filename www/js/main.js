import { $, $$, toast, listen, confirmSheet } from './util.js';
import { icon } from './icons.js';
import { settings } from './settings.js';
import { activities } from './activities.js';
import { tracker } from './tracker.js';
import { alarms, pad } from './alarms.js';
import { haptic } from './haptics.js';
import { Sprinkles } from './sprinkles.js';
import { CoverFlow } from './coverflow.js';
import { fmtPace } from './track-math.js';
import * as menuView from './views/menu.js';
import * as walkView from './views/walk.js';
import * as mapView from './views/map.js';
import * as activitiesView from './views/activities.js';
import * as moonView from './views/moon.js';
import * as analyticsView from './views/analytics.js';
import * as alarmView from './views/alarm.js';
import * as metricsView from './views/metrics.js';
import * as dataView from './views/data.js';
import * as searchView from './views/search.js';
import * as settingsView from './views/settings.js';

const VIEWS = {
  walk: { title: 'Walk', icon: 'activity', mod: walkView },
  map: { title: 'Map', icon: 'pin', mod: mapView },
  activities: { title: 'History', icon: 'route', mod: activitiesView },
  menu: { title: 'Menu', icon: 'grid', mod: menuView },
  moon: { title: 'Moon', icon: 'moon', mod: moonView },
  analytics: { title: 'Analytics', icon: 'sun', mod: analyticsView },
  alarm: { title: 'Alarm', icon: 'bell', mod: alarmView },
  metrics: { title: 'Metrics', icon: 'gauge', mod: metricsView },
  data: { title: 'Data', icon: 'layers', mod: dataView },
  search: { title: 'Ask', icon: 'wand', mod: searchView },
  settings: { title: 'Settings', icon: 'sliders', mod: settingsView },
};

const stage = $('#stage');
const titleEl = $('#title');
const btnEdit = $('#btnEdit');
const btnAdd = $('#btnAdd');
const switcher = $('#switcher');

let current = null;
let currentId = null;
let editFn = null;
let addFn = null;

// ---------------------------------------------------------------- app facade passed to views
const app = {
  activities,
  tracker,
  settings,
  toast,
  go,
  setTitle: (t) => { titleEl.textContent = t; },
  /** Re-purpose the round dock button for the current screen (default: jump to the Walk screen). */
  setAdd(fn, iconName = 'plus') {
    addFn = fn || null;
    btnAdd.innerHTML = icon(iconName, 22);
  },
  setEdit(label, fn, hidden = false) {
    editFn = fn || null;
    btnEdit.style.visibility = !label || hidden ? 'hidden' : 'visible';
    if (label) btnEdit.textContent = label;
  },
};

// ---------------------------------------------------------------- router
function go(id, params = {}, { push = true } = {}) {
  if (!VIEWS[id]) id = 'walk';
  closeSwitcher();
  current?.destroy?.();
  stage.innerHTML = '';
  const el = document.createElement('div');
  el.className = 'view';
  el.id = `v-${id}`;
  stage.append(el);
  currentId = id;
  app.setTitle(params.title || VIEWS[id].title);
  app.setEdit(null);
  app.setAdd(null);
  current = VIEWS[id].mod.mount(el, app, params) || {};
  $$('#switcher button').forEach((b) => b.classList.toggle('on', b.dataset.v === id));
  if (push) {
    const keep = Object.fromEntries(Object.entries(params).filter(([k]) => !k.startsWith('_'))); // `_x` params are one-shot
    history.pushState({ v: id, p: keep }, '');
  }
}

addEventListener('popstate', (e) => {
  if (e.state?.v) go(e.state.v, e.state.p || {}, { push: false });
});

// ---------------------------------------------------------------- chrome (header / dock)
function buildChrome() {
  $('#titleBtn').innerHTML = icon('chevron', 20);
  $('#btnClose').innerHTML = icon('close', 20);
  btnAdd.innerHTML = icon('plus', 22);
  switcher.innerHTML = Object.entries(VIEWS)
    .map(([id, v]) => `<button data-v="${id}">${icon(v.icon, 18)}<span>${v.title}</span></button>`)
    .join('');

  const toggleSwitcher = (e) => { e.stopPropagation(); switcher.hidden = !switcher.hidden; };
  $('#titleBtn').addEventListener('click', toggleSwitcher);
  $('#title').addEventListener('click', toggleSwitcher);
  switcher.addEventListener('click', (e) => { const b = e.target.closest('[data-v]'); if (b) go(b.dataset.v); });
  document.addEventListener('click', (e) => { if (!switcher.hidden && !e.target.closest('#switcher')) closeSwitcher(); });

  $('#btnClose').addEventListener('click', () => go(currentId === 'menu' ? 'walk' : 'menu'));
  btnEdit.addEventListener('click', () => editFn?.());
  btnAdd.addEventListener('click', () => (addFn ? addFn() : go('walk')));
}
const closeSwitcher = () => { switcher.hidden = true; };

// ---------------------------------------------------------------- orientation: portrait UI <-> landscape Cover Flow
const sprinkles = new Sprinkles($('#sprinkles'), {
  getLevel: () => 0,
  isPlaying: () => tracker.state === 'recording', // sprinkles speed up while you're out walking
  getDensity: () => settings.get('density'),
  isEnabled: () => settings.get('sprinkles'),
});
const coverflow = new CoverFlow($('#coverflow'), app);
let mode = null;

const isLandscape = () => {
  const t = screen.orientation?.type;
  return t ? t.startsWith('landscape') : innerWidth > innerHeight;
};

function applyMode() {
  const m = isLandscape() ? 'landscape' : 'portrait';
  if (m === mode) return;
  mode = m;
  document.documentElement.dataset.mode = m;
  if (m === 'landscape') {
    closeSwitcher();
    coverflow.show();
    sprinkles.start();
  } else {
    coverflow.hide();
    sprinkles.stop();
  }
}
let rot;
const onRotate = () => { applyMode(); clearTimeout(rot); rot = setTimeout(applyMode, 180); };
addEventListener('resize', onRotate);
screen.orientation?.addEventListener?.('change', onRotate);

settings.on((k) => {
  if (mode === 'landscape' && (k === 'sprinkles' || k === 'density')) sprinkles.refresh();
  if (k === 'reflection') document.documentElement.classList.toggle('no-reflect', !settings.get('reflection'));
});

// ---------------------------------------------------------------- global haptics
function wireGlobalHaptics() {
  const PRIMARY = '.orb.center, .wc.main, .round.light, .cta, .chip, .sheet-btn, .sw, .pill';
  document.addEventListener('pointerdown', (e) => {
    const t = e.target.closest('button, .orb, .qcard, .al-row, .hrow');
    if (!t || t.closest('.cf-stage')) return; // Cover Flow has its own detents
    if (t.matches('.orb:not(.center), .wc.main, .cf-ctl.big')) return; // these buzz on their own action
    t.matches(PRIMARY) ? haptic.press() : haptic.tap();
  }, { passive: true });
}

// ---------------------------------------------------------------- tracker events (work on every screen)
function wireTracker() {
  listen(tracker, 'km', (e) => toast(`${e.detail.km} km · avg ${fmtPace(e.detail.pace)} /km`, 3500));
  listen(tracker, 'recovered', () => toast('Recovered an unfinished walk · open Walk to resume or finish it', 5000));
  listen(tracker, 'finish', () => haptic.notify('success'));
  listen(tracker, 'error', async (e) => {
    if (e.detail.code === 'NOT_AUTHORIZED') {
      haptic.notify('error');
      const open = await confirmSheet({
        title: 'Location is turned off',
        message: 'Allow Cosmic X to use your location. Choose “Allow all the time” (or “While using the app”) so your walk keeps recording with the screen off.',
        confirm: 'Open settings', danger: false,
      });
      if (open) tracker.openSettings();
      if (tracker.state === 'recording') tracker.pause();
    } else toast('GPS problem: ' + (e.detail.message || e.detail.code), 4000);
  });
}

// ---------------------------------------------------------------- alarm ringer overlay
function buildRinger() {
  const root = $('#ring');
  listen(alarms, 'ring', (e) => {
    const a = e.detail;
    root.innerHTML = `<div class="ring-card">
      <div class="ring-pulse">${icon('bell', 40)}</div>
      <div class="ring-time">${a.time || `${pad(new Date().getHours())}:${pad(new Date().getMinutes())}`}</div>
      <div class="ring-label">${(a.label || 'Alarm').replace(/</g, '&lt;')}</div>
      <div class="ring-row"><button class="ring-btn" data-snooze>Snooze 9 min</button><button class="ring-btn stop" data-stop>Stop</button></div></div>`;
    root.hidden = false;
  });
  listen(alarms, 'stop', () => { root.hidden = true; root.innerHTML = ''; });
  root.addEventListener('click', (e) => {
    if (e.target.closest('[data-stop]')) { haptic.press(); alarms.stop(); }
    else if (e.target.closest('[data-snooze]')) { haptic.press(); alarms.snooze(9); }
  });
}

// ---------------------------------------------------------------- boot
async function boot() {
  try { await navigator.storage?.persist?.(); } catch { /* not supported */ }
  document.documentElement.classList.toggle('no-reflect', !settings.get('reflection'));
  buildChrome();
  await activities.load();
  await tracker.recover();
  alarms.start();
  buildRinger();
  wireGlobalHaptics();
  wireTracker();

  applyMode();
  history.replaceState({ v: 'walk', p: {} }, '');
  go('walk', {}, { push: false });
}

boot();
