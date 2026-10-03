import { $, $$, toast, listen } from './util.js';
import { icon } from './icons.js';
import { settings } from './settings.js';
import { library } from './library.js';
import { player } from './player.js';
import { Sprinkles } from './sprinkles.js';
import { CoverFlow } from './coverflow.js';
import * as menuView from './views/menu.js';
import * as playerView from './views/player.js';
import * as libraryView from './views/library.js';
import * as queueView from './views/queue.js';
import * as searchView from './views/search.js';
import * as settingsView from './views/settings.js';

const VIEWS = {
  menu: { title: 'Menu', icon: 'grid', mod: menuView },
  player: { title: 'Now Playing', icon: 'play', mod: playerView },
  library: { title: 'Library', icon: 'note', mod: libraryView },
  queue: { title: 'Queue', icon: 'list', mod: queueView },
  search: { title: 'Search', icon: 'search', mod: searchView },
  settings: { title: 'Settings', icon: 'sliders', mod: settingsView },
};

const stage = $('#stage');
const titleEl = $('#title');
const btnEdit = $('#btnEdit');
const btnAdd = $('#btnAdd');
const switcher = $('#switcher');
const picker = $('#filePicker');

let current = null;
let currentId = null;
let editFn = null;
let importing = false;

// ---------------------------------------------------------------- app facade passed to views
const app = {
  library,
  player,
  settings,
  toast,
  go,
  pickFiles: () => picker.click(),
  setTitle: (t) => { titleEl.textContent = t; },
  setEdit(label, fn, hidden = false) {
    editFn = fn || null;
    btnEdit.style.visibility = !label || hidden ? 'hidden' : 'visible';
    if (label) btnEdit.textContent = label;
  },
};

// ---------------------------------------------------------------- router
function go(id, params = {}, { push = true } = {}) {
  if (!VIEWS[id]) id = 'menu';
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
  current = VIEWS[id].mod.mount(el, app, params) || {};
  $$('#switcher button').forEach((b) => b.classList.toggle('on', b.dataset.v === id));
  if (push) history.pushState({ v: id, p: params }, '');
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

  $('#titleBtn').addEventListener('click', (e) => { e.stopPropagation(); switcher.hidden = !switcher.hidden; });
  $('#title').addEventListener('click', (e) => { e.stopPropagation(); switcher.hidden = !switcher.hidden; });
  switcher.addEventListener('click', (e) => {
    const b = e.target.closest('[data-v]');
    if (b) go(b.dataset.v);
  });
  document.addEventListener('click', (e) => { if (!switcher.hidden && !e.target.closest('#switcher')) closeSwitcher(); });

  $('#btnClose').addEventListener('click', () => {
    if (currentId === 'menu') go(library.songs.length ? 'player' : 'menu');
    else go('menu');
  });
  btnEdit.addEventListener('click', () => editFn?.());
  btnAdd.addEventListener('click', () => picker.click());
}
const closeSwitcher = () => { switcher.hidden = true; };

// ---------------------------------------------------------------- importing songs
picker.addEventListener('change', async () => {
  const files = [...picker.files];
  picker.value = '';
  if (files.length) await importFiles(files);
});

async function importFiles(files) {
  if (importing) return toast('An import is already running');
  importing = true;
  try {
    const r = await library.importFiles(files, (i, n, name) => toast(`Importing ${i}/${n} · ${name}`, 60000));
    const parts = [];
    if (r.added) parts.push(`Added ${r.added} ${r.added === 1 ? 'song' : 'songs'}`);
    if (r.skipped) parts.push(`${r.skipped} already in library`);
    if (r.failed) parts.push(`${r.failed} unsupported`);
    toast(parts.join(' · ') || 'Nothing imported', 3800);
  } catch (e) {
    console.error(e);
    toast('Import failed');
  } finally {
    importing = false;
  }
}

// ---------------------------------------------------------------- orientation: portrait UI <-> landscape Cover Flow
const sprinkles = new Sprinkles($('#sprinkles'), {
  getLevel: () => (settings.get('reactive') ? player.level() : 0),
  isPlaying: () => player.playing,
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

// ---------------------------------------------------------------- boot
async function boot() {
  try { await navigator.storage?.persist?.(); } catch { /* not supported */ }
  document.documentElement.classList.toggle('no-reflect', !settings.get('reflection'));
  buildChrome();

  try {
    await library.load();
  } catch (e) {
    console.error('[boot] library failed to load', e);
    toast('Could not open your library storage');
  }
  if (library.songs.length) {
    const last = library.byId.get(localStorage.getItem('cx.last')) || library.songs[0];
    await player.playList(library.songs, last.id, { play: false });
  }

  // keep player + chrome in sync with library changes
  listen(library, 'change', (e) => {
    const d = e.detail || {};
    if (d.removed) player.handleRemoved([d.removed]);
    if (d.cleared) player.handleRemoved(player.list.map((s) => s.id));
    if (!player.current && library.songs.length) {
      const s = library.byId.get(localStorage.getItem('cx.last')) || library.songs[0];
      player.playList(library.songs, s.id, { play: false });
    }
    btnAdd.classList.toggle('lime', !library.songs.length);
  });
  btnAdd.classList.toggle('lime', !library.songs.length);

  listen(player, 'error', (e) => toast(`Can't play “${e.detail.song.title}”`));

  applyMode();
  const start = library.songs.length ? 'player' : 'menu';
  history.replaceState({ v: start, p: {} }, '');
  go(start, {}, { push: false });
}

boot();
