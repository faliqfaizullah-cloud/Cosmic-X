import { icon } from './icons.js';
import { clamp, listen } from './util.js';
import { Scroller, bindDrag } from './scroller.js';
import { haptic } from './haptics.js';
import { motionBlur } from './ui-motion.js';
import { routeCard } from './route-art.js';
import { fmtKm, fmtDur, fmtPace, paceOf } from './track-math.js';
import { openActivitySheet } from './activity-sheet.js';
import { toggleWalk, finishWalk } from './walk-actions.js';

// Cover Flow geometry (relative to cover size)
const ANGLE = 62; // degrees side covers are turned
const GAP = 0.64; // distance from centre cover to its first neighbour
const SPACING = 0.2; // distance between the stacked side covers

const PLACEHOLDERS = Array.from({ length: 9 }, (_, i) => ({ id: `ph${i}`, ph: true, seed: i, name: i === 4 ? 'Your first walk' : '' }));
const when = (ms) => new Date(ms).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });

/** iOS 4 style Cover Flow of your walks (landscape). Each cover is a frosted-glass route card. */
export class CoverFlow {
  constructor(root, app) {
    this.root = root;
    this.app = app;
    this.items = [];
    this.nodes = new Map();
    this.size = 200;
    this.focus = -1;
    this.active = false;

    root.innerHTML = `
      <div class="cf-top">
        <div class="cf-brand">${icon('spark', 14)} Cosmic X</div>
        <div class="cf-live" data-cf="live" hidden></div>
      </div>
      <div class="cf-stage" data-cf="stage"><div class="cf-world" data-cf="world"></div></div>
      <div class="cf-info">
        <div class="cf-title" data-cf="title"></div>
        <div class="cf-artist" data-cf="sub"></div>
      </div>
      <div class="cf-bar">
        <button class="cf-ctl big" data-cf="toggle" aria-label="Start or pause"></button>
        <button class="cf-ctl" data-cf="finish" aria-label="Finish">${icon('stop', 18)}</button>
        <div class="cf-stats" data-cf="stats"></div>
        <button class="cf-ctl small" data-cf="details" aria-label="Details">${icon('list', 18)}</button>
      </div>`;

    this.$ = (k) => root.querySelector(`[data-cf="${k}"]`);
    this.stage = this.$('stage');
    this.world = this.$('world');
    const blur = motionBlur(this.world, 'x', 60);
    let lastPos = 0;
    this.sc = new Scroller({
      min: 0, max: 0,
      onUpdate: (p) => {
        this.render(p);
        blur(Math.max(Math.abs(this.sc.vel), Math.abs(p - lastPos))); // flicks smear horizontally, still frames are sharp
        lastPos = p;
      },
    });
    bindDrag(this.stage, this.sc, { axis: 'x', pxPerUnit: 60, onTap: (e) => this.#tap(e) });

    root.addEventListener('click', (e) => {
      const b = e.target.closest('[data-cf]');
      if (!b) return;
      switch (b.dataset.cf) {
        case 'toggle': toggleWalk(); break;
        case 'finish': finishWalk(this.app, { sheetMap: false }); break;
        case 'details': this.#openCenter(); break;
      }
    });

    const { tracker, activities } = this.app;
    listen(tracker, 'state', () => this.#renderLive());
    listen(tracker, 'fix', () => this.#renderLive());
    listen(activities, 'change', () => this.refresh());
    setInterval(() => this.active && tracker.state === 'recording' && this.#renderLive(), 1000);
    addEventListener('resize', () => this.active && this.layout());
  }

  show() {
    this.active = true;
    this.refresh();
    requestAnimationFrame(() => this.layout());
  }
  hide() { this.active = false; this.sc.stop(); }

  refresh() {
    const list = this.app.activities.list;
    this.items = list.length ? list : PLACEHOLDERS;
    this.nodes.forEach((n) => n.remove());
    this.nodes.clear();
    this.focus = -1;
    this.sc.setRange(0, this.items.length - 1);
    this.sc.jump(list.length ? 0 : Math.floor(this.items.length / 2));
    this.#renderInfo();
    this.#renderLive();
  }

  layout() {
    const r = this.stage.getBoundingClientRect();
    if (!r.width || !r.height) return;
    this.W = r.width; this.H = r.height;
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

  #makeNode(i) {
    const it = this.items[i];
    const n = document.createElement('div');
    n.className = 'cf-item';
    n.dataset.i = i;
    n.style.setProperty('--glow', ['#e89279', '#7fb0e8', '#b9a0e8', '#7fe0c0'][i % 4]);
    const src = routeCard(it.ph ? null : it, { size: 420, seed: it.seed ?? 0 });
    n.innerHTML = `<div class="cf-face" style="background-image:url('${src}')"></div>`;
    return n;
  }

  render(pos) {
    if (!this.active || !this.W) return;
    const n = this.items.length, size = this.size;
    const gap = size * GAP, sp = size * SPACING;
    const range = Math.min(26, Math.ceil(this.W / 2 / sp) + 2);
    const lo = Math.max(0, Math.floor(pos) - range), hi = Math.min(n - 1, Math.ceil(pos) + range);
    for (const [i, node] of this.nodes) if (i < lo || i > hi) { node.remove(); this.nodes.delete(i); }
    for (let i = lo; i <= hi; i++) {
      let node = this.nodes.get(i);
      if (!node) { node = this.#makeNode(i); this.nodes.set(i, node); this.world.append(node); }
      const d = i - pos, ad = Math.abs(d), a = clamp(d, -1, 1);
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
    const it = this.items[clamp(this.focus, 0, this.items.length - 1)];
    if (!it) return;
    if (it.ph) { this.$('title').textContent = it.name || '\u00a0'; this.$('sub').textContent = it.name ? 'Press ▶ to start recording' : '\u00a0'; return; }
    this.$('title').textContent = it.name;
    this.$('sub').textContent = `${when(it.start)} · ${fmtKm(it.distance)} km · ${fmtDur(it.elapsed)} · ${fmtPace(paceOf(it.distance, it.moving || it.elapsed))}/km`;
  }

  #renderLive() {
    const s = this.app.tracker.snap;
    const idle = s.state === 'idle';
    this.$('toggle').innerHTML = icon(s.state === 'recording' ? 'pause' : 'play', 24);
    this.$('finish').style.visibility = idle ? 'hidden' : 'visible';
    this.$('stats').innerHTML = idle
      ? '<span class="dim">Ready to walk</span>'
      : `<b>${fmtKm(s.distance)}</b><i>km</i><b>${fmtDur(s.elapsed)}</b><i>time</i><b>${fmtPace(s.avgPace)}</b><i>/km</i>`;
    const live = this.$('live');
    live.hidden = idle;
    live.textContent = s.state === 'paused' ? 'Paused' : s.weak ? 'Searching GPS…' : 'Recording';
    live.classList.toggle('paused', s.state === 'paused');
    this.root.classList.toggle('is-active', !idle);
  }

  #openCenter() {
    const it = this.items[clamp(Math.round(this.sc.pos), 0, this.items.length - 1)];
    if (!it || it.ph) return;
    openActivitySheet(this.app, it, { onMap: false });
  }

  #tap(e) {
    const node = e.target.closest('.cf-item');
    if (!node) return;
    const i = +node.dataset.i;
    if (i !== Math.round(this.sc.pos)) { this.sc.to(i); return; }
    haptic.press();
    this.#openCenter();
  }
}
