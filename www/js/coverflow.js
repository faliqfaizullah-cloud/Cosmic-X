import { icon } from './icons.js';
import { esc, fmtTime, clamp, paletteFor, listen } from './util.js';
import { Scroller, bindDrag } from './scroller.js';
import { haptic } from './haptics.js';

// Cover Flow geometry (relative to cover size)
const ANGLE = 62; // degrees side covers are turned
const GAP = 0.64; // distance from centre cover to its first neighbour
const SPACING = 0.2; // distance between the stacked side covers

/** Placeholder items shown while the library is empty so the effect is always visible. */
const PLACEHOLDERS = Array.from({ length: 9 }, (_, i) => ({
  id: `ph${i}`,
  ph: true,
  title: i === 4 ? 'Your music here' : '',
  artist: i === 4 ? 'Tap + to import songs' : '',
  album: '',
  duration: 0,
}));

export class CoverFlow {
  constructor(root, app) {
    this.root = root;
    this.app = app;
    this.songs = [];
    this.nodes = new Map();
    this.size = 200;
    this.focus = -1;
    this.scrubbing = false;
    this.active = false;

    root.innerHTML = `
      <div class="cf-top">
        <div class="cf-brand">${icon('spark', 14)} Cosmic X</div>
        <button class="cf-ibtn" data-cf="add" aria-label="Import songs">${icon('plus', 20)}</button>
      </div>
      <div class="cf-stage" data-cf="stage"><div class="cf-world" data-cf="world"></div></div>
      <div class="cf-info">
        <div class="cf-title" data-cf="title"></div>
        <div class="cf-artist" data-cf="artist"></div>
      </div>
      <div class="cf-bar">
        <button class="cf-ctl" data-cf="prev" aria-label="Previous">${icon('prev', 22)}</button>
        <button class="cf-ctl big" data-cf="toggle" aria-label="Play or pause"></button>
        <button class="cf-ctl" data-cf="next" aria-label="Next">${icon('next', 22)}</button>
        <span class="cf-time" data-cf="elapsed">0:00</span>
        <input class="cf-range" data-cf="range" type="range" min="0" max="1000" value="0" aria-label="Seek">
        <span class="cf-time r" data-cf="remain">-0:00</span>
        <button class="cf-ctl small" data-cf="fav" aria-label="Favorite"></button>
      </div>`;

    this.$ = (k) => root.querySelector(`[data-cf="${k}"]`);
    this.stage = this.$('stage');
    this.world = this.$('world');
    this.range = this.$('range');

    this.sc = new Scroller({ min: 0, max: 0, onUpdate: (p) => this.render(p) });
    bindDrag(this.stage, this.sc, {
      axis: 'x',
      pxPerUnit: 60,
      onTap: (e) => this.#tap(e),
    });

    root.addEventListener('click', (e) => {
      const b = e.target.closest('[data-cf]');
      if (!b) return;
      const { library, player } = this.app;
      switch (b.dataset.cf) {
        case 'add': this.app.pickFiles(); break;
        case 'prev': player.prev(); break;
        case 'next': player.next(); break;
        case 'toggle':
          if (!player.current && library.songs.length) this.#playIndex(Math.round(this.sc.pos));
          else player.toggle();
          break;
        case 'fav': if (player.current) library.toggleFav(player.current.id); break;
      }
    });

    // seek bar
    this.range.addEventListener('input', () => {
      this.scrubbing = true;
      const dur = this.app.player.duration;
      this.$('elapsed').textContent = fmtTime((this.range.value / 1000) * dur);
      this.#paintRange();
    });
    this.range.addEventListener('change', () => {
      this.app.player.seek((this.range.value / 1000) * this.app.player.duration);
      this.scrubbing = false;
    });

    const { player, library } = this.app;
    listen(player, 'track', () => { this.#followPlayer(); this.#renderInfo(); this.#renderState(); });
    listen(player, 'state', () => this.#renderState());
    listen(player, 'time', () => this.#renderTime());
    listen(library, 'change', () => this.refresh());
    listen(library, 'fav', () => this.#renderState());
    addEventListener('resize', () => this.active && this.layout());
  }

  // ---- lifecycle ----
  show() {
    this.active = true;
    this.refresh();
    requestAnimationFrame(() => { this.layout(); this.#followPlayer(true); });
  }

  hide() {
    this.active = false;
    this.sc.stop();
  }

  refresh() {
    const lib = this.app.library.songs;
    this.songs = lib.length ? lib : PLACEHOLDERS;
    this.world.classList.toggle('placeholder', !lib.length);
    this.nodes.forEach((n) => n.remove());
    this.nodes.clear();
    this.focus = -1;
    this.sc.setRange(0, this.songs.length - 1);
    const cur = this.app.player.current;
    const idx = cur ? this.songs.findIndex((s) => s.id === cur.id) : Math.floor(this.songs.length / 2);
    this.sc.jump(idx >= 0 ? idx : 0);
    this.#renderInfo();
    this.#renderState();
    this.#renderTime();
  }

  layout() {
    const r = this.stage.getBoundingClientRect();
    if (!r.width || !r.height) return;
    this.W = r.width;
    this.H = r.height;
    this.size = Math.round(Math.min(this.H * 0.6, this.W * 0.3));
    this.top = Math.max(4, Math.round((this.H - this.size * 1.5) / 2));
    const w = this.world.style;
    w.setProperty('--size', `${this.size}px`);
    w.setProperty('--top', `${this.top}px`);
    w.perspective = `${Math.round(this.size * 3.4)}px`;
    this.nodes.forEach((n) => n.remove());
    this.nodes.clear();
    this.focus = -1;
    this.render(this.sc.pos);
  }

  // ---- rendering ----
  #makeNode(i) {
    const s = this.songs[i];
    const n = document.createElement('div');
    n.className = 'cf-item';
    n.dataset.i = i;
    const noArt = s.ph || !s.cover;
    const [c1] = paletteFor(s.title || s.id);
    n.style.setProperty('--glow', c1);
    if (s.ph) {
      const [a, b] = paletteFor('ph' + i);
      n.innerHTML = `<div class="cf-face noart" style="background-image:linear-gradient(155deg,${a},${b})">${icon('note', Math.round(this.size * 0.3))}</div>`;
    } else {
      n.innerHTML = `<div class="cf-face ${noArt ? 'noart' : ''}" style="${this.app.library.artBg(s)}">${noArt ? icon('note', Math.round(this.size * 0.3)) + `<span class="cf-cap">${esc(s.title)}</span>` : ''}</div>`;
    }
    return n;
  }

  render(pos) {
    if (!this.active || !this.W) return;
    const n = this.songs.length;
    const size = this.size;
    const gap = size * GAP;
    const sp = size * SPACING;
    const range = Math.min(26, Math.ceil(this.W / 2 / sp) + 2);
    const lo = Math.max(0, Math.floor(pos) - range);
    const hi = Math.min(n - 1, Math.ceil(pos) + range);

    for (const [i, node] of this.nodes) {
      if (i < lo || i > hi) { node.remove(); this.nodes.delete(i); }
    }
    for (let i = lo; i <= hi; i++) {
      let node = this.nodes.get(i);
      if (!node) { node = this.#makeNode(i); this.nodes.set(i, node); this.world.append(node); }
      const d = i - pos;
      const ad = Math.abs(d);
      const a = clamp(d, -1, 1);
      const x = Math.sign(d) * (gap * Math.min(ad, 1) + sp * Math.max(ad - 1, 0));
      const z = (1 - Math.abs(a)) * size * 0.2 - Math.abs(a) * size * 0.22 - ad * 1.5;
      node.style.transform = `translate3d(${x.toFixed(1)}px,0,${z.toFixed(1)}px) rotateY(${(-a * ANGLE).toFixed(2)}deg)`;
      node.style.zIndex = String(1000 - Math.round(ad * 10));
    }

    const f = clamp(Math.round(pos), 0, n - 1);
    if (f !== this.focus) {
      if (this.focus >= 0 && (this.sc.dragging || Math.abs(this.sc.vel) > 0.002)) haptic.tick();
      this.nodes.get(this.focus)?.classList.remove('on');
      this.focus = f;
      this.#renderInfo();
    }
    this.nodes.get(f)?.classList.add('on');
  }

  #renderInfo() {
    const s = this.songs[clamp(this.focus, 0, this.songs.length - 1)];
    if (!s) return;
    this.$('title').textContent = s.title || '\u00a0';
    this.$('artist').textContent = s.ph ? s.artist || '\u00a0' : [s.artist, s.album && !s.album.startsWith('Unknown') ? s.album : ''].filter(Boolean).join(' — ');
  }

  #renderState() {
    const { player } = this.app;
    this.$('toggle').innerHTML = icon(player.playing ? 'pause' : 'play', 26);
    const fav = this.$('fav');
    fav.innerHTML = icon(player.current?.fav ? 'heartfill' : 'heart', 18);
    fav.classList.toggle('on', !!player.current?.fav);
    this.root.classList.toggle('is-playing', player.playing);
    const curId = player.current?.id;
    this.nodes.forEach((n, i) => n.classList.toggle('now', this.songs[i]?.id === curId));
  }

  #paintRange() {
    this.range.style.setProperty('--p', `${this.range.value / 10}%`);
  }

  #renderTime() {
    const { player } = this.app;
    if (this.scrubbing) return;
    const dur = player.duration;
    const t = player.time;
    this.$('elapsed').textContent = fmtTime(t);
    this.$('remain').textContent = '-' + fmtTime(Math.max(0, dur - t));
    this.range.value = dur ? Math.round((t / dur) * 1000) : 0;
    this.#paintRange();
  }

  #followPlayer(instant = false) {
    const cur = this.app.player.current;
    if (!cur || this.sc.dragging) return;
    const i = this.songs.findIndex((s) => s.id === cur.id);
    if (i < 0) return;
    if (instant) this.sc.jump(i);
    else this.sc.to(i);
  }

  // ---- interaction ----
  #playIndex(i) {
    const s = this.songs[i];
    if (!s || s.ph) return this.app.pickFiles();
    this.app.player.playList(this.app.library.songs, s.id);
  }

  #tap(e) {
    const node = e.target.closest('.cf-item');
    if (!node) return;
    const i = +node.dataset.i;
    if (i !== Math.round(this.sc.pos)) { this.sc.to(i); return; }
    const s = this.songs[i];
    if (s.ph) return this.app.pickFiles();
    if (this.app.player.current?.id === s.id) this.app.player.toggle();
    else this.#playIndex(i);
  }
}
