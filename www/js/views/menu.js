import { icon } from '../icons.js';
import { listen, esc } from '../util.js';

const R = 37; // orbit radius, % of the cluster box

const ORBS = [
  { id: 'library',  label: 'Library',   icon: 'grid',    c: ['#7d7d85', '#f2f2f7'], a: 0 },
  { id: 'albums',   label: 'Albums',    icon: 'disc',    c: ['#08873a', '#a8ff74'], a: 45 },
  { id: 'favorites',label: 'Favorites', icon: 'heart',   c: ['#b86a00', '#ffe08a'], a: 90 },
  { id: 'shuffle',  label: 'Shuffle',   icon: 'shuffle', c: ['#9c1020', '#ff6a5a'], a: 135 },
  { id: 'import',   label: 'Import',    icon: 'upload',  c: ['#3b1d9c', '#c4a6ff'], a: 180 },
  { id: 'queue',    label: 'Queue',     icon: 'list',    c: ['#0b0b10', '#50505e'], a: 225 },
  { id: 'search',   label: 'Search',    icon: 'search',  c: ['#0a3fc0', '#74b4ff'], a: 270 },
  { id: 'settings', label: 'Settings',  icon: 'sliders', c: ['#26344c', '#b2c1de'], a: 315 },
];

const pt = (a, r = R) => [50 + r * Math.sin((a * Math.PI) / 180), 50 - r * Math.cos((a * Math.PI) / 180)];

export function mount(el, app) {
  const { library, player, go } = app;
  const offs = [];

  const lines = ORBS.map((o) => { const [x, y] = pt(o.a); return `<line x1="50" y1="50" x2="${x.toFixed(2)}" y2="${y.toFixed(2)}"/>`; }).join('');
  const orbs = ORBS.map((o, i) => {
    const [x, y] = pt(o.a);
    const badge = o.id === 'library' ? '<span class="badge" data-badge hidden></span>' : o.id === 'favorites' ? '<span class="badge" data-fbadge hidden></span>' : '';
    return `<button class="orb" data-id="${o.id}" style="left:${x}%;top:${y}%;--c1:${o.c[0]};--c2:${o.c[1]};--d:${0.06 + i * 0.05}s" aria-label="${o.label}">
      <span class="orb-body">${icon(o.icon, 24)}</span>${badge}<em class="orb-label">${o.label}</em></button>`;
  }).join('');

  el.innerHTML = `<div class="menu">
    <div class="orbs">
      <svg class="orb-lines" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
        <circle cx="50" cy="50" r="${R}" /><circle cx="50" cy="50" r="${R * 0.55}" />${lines}
      </svg>
      ${orbs}
      <button class="orb center" data-id="player" style="left:50%;top:50%;--c1:#ff8a4a;--c2:#ffe3c8" aria-label="Now Playing">
        <span class="orb-body" data-center>${icon('play', 34)}</span>
      </button>
    </div>
    <p class="menu-hint" data-hint></p>
  </div>`;

  const $c = (s) => el.querySelector(s);

  function refresh() {
    const n = library.songs.length;
    const favs = library.songs.filter((s) => s.fav).length;
    const b = $c('[data-badge]');
    b.hidden = !n; b.textContent = n > 99 ? '99+' : n;
    const fb = $c('[data-fbadge]');
    fb.hidden = !favs; fb.textContent = favs;
    const cur = player.current;
    const center = $c('[data-center]');
    const url = library.coverURL(cur);
    center.style.backgroundImage = url ? `url("${url}")` : '';
    center.classList.toggle('has-art', !!url);
    center.innerHTML = url ? '' : icon(player.playing ? 'pause' : 'play', 34);
    $c('[data-hint]').innerHTML = n
      ? cur ? `<b>${esc(cur.title)}</b> · ${esc(cur.artist)}` : 'Your library is ready'
      : 'Tap <b>Import</b> to add songs from your phone';
    $c('.menu').classList.toggle('empty', !n);
  }

  offs.push(listen(library, 'change', refresh), listen(library, 'fav', refresh), listen(player, 'track', refresh), listen(player, 'state', refresh));
  refresh();

  el.addEventListener('click', (e) => {
    const b = e.target.closest('.orb');
    if (!b) return;
    switch (b.dataset.id) {
      case 'player': return go('player');
      case 'library': return go('library', { mode: 'songs' });
      case 'albums': return go('library', { mode: 'albums' });
      case 'favorites': return go('library', { mode: 'favorites' });
      case 'queue': return go('queue');
      case 'search': return go('search');
      case 'settings': return go('settings');
      case 'import': return app.pickFiles();
      case 'shuffle': {
        if (!library.songs.length) return app.toast('Import some songs first');
        player.setShuffle(true);
        const s = library.songs[Math.floor(Math.random() * library.songs.length)];
        player.playList(library.songs, s.id);
        return go('player');
      }
    }
  });

  app.setEdit('Settings', () => go('settings'));
  return { destroy: () => offs.forEach((f) => f()) };
}
