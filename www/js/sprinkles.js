import { clamp } from './util.js';

const COLORS = ['#ff5c8a', '#ffd23f', '#3ddc97', '#4cc9f0', '#b388ff', '#ff8a3d', '#f4f4f8'];

/**
 * Falling "sprinkles" (tiny colour capsules) + twinkling sparkles on a canvas.
 * Reacts to the music: optional analyser level, plus a gentle boost while playing.
 */
export class Sprinkles {
  #raf = 0;
  #last = 0;
  #t = 0;
  #lvl = 0;
  #w = 0;
  #h = 0;
  #dpr = 1;
  #p = [];

  constructor(canvas, { getLevel, isPlaying, getDensity, isEnabled }) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.getLevel = getLevel;
    this.isPlaying = isPlaying;
    this.getDensity = getDensity;
    this.isEnabled = isEnabled;
    this.reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    addEventListener('resize', () => this.#raf && this.#resize(true));
  }

  start() {
    if (this.#raf || !this.isEnabled()) return;
    this.#resize(true);
    this.#last = performance.now();
    this.#raf = requestAnimationFrame(this.#tick);
  }

  stop() {
    cancelAnimationFrame(this.#raf);
    this.#raf = 0;
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  /** Re-read settings (enabled / density) while running. */
  refresh() {
    if (!this.isEnabled()) { this.stop(); return; }
    if (!this.#raf) this.start();
    else this.#seed();
  }

  #resize(reseed) {
    this.#dpr = Math.min(devicePixelRatio || 1, 2);
    this.#w = this.canvas.clientWidth || innerWidth;
    this.#h = this.canvas.clientHeight || innerHeight;
    this.canvas.width = Math.round(this.#w * this.#dpr);
    this.canvas.height = Math.round(this.#h * this.#dpr);
    this.ctx.setTransform(this.#dpr, 0, 0, this.#dpr, 0, 0);
    if (reseed || !this.#p.length) this.#seed();
  }

  #seed() {
    const base = { low: 45, med: 90, high: 150 }[this.getDensity()] || 90;
    const area = clamp((this.#w * this.#h) / (800 * 380), 0.6, 2);
    const n = Math.round(base * area * (this.reduced ? 0.4 : 1));
    this.#p = Array.from({ length: n }, () => this.#make(true));
  }

  #make(anywhere) {
    const z = 0.45 + Math.random() * 1.1; // pseudo depth: bigger + faster = closer
    return {
      x: Math.random() * this.#w,
      y: anywhere ? Math.random() * this.#h : -16,
      z,
      vy: (10 + Math.random() * 26) * z,
      sway: 6 + Math.random() * 16,
      ph: Math.random() * 6.28,
      rot: Math.random() * 6.28,
      vr: (Math.random() - 0.5) * 1.6,
      len: (7 + Math.random() * 7) * z,
      wid: (2.4 + Math.random() * 1.6) * z,
      c: COLORS[(Math.random() * COLORS.length) | 0],
      sparkle: Math.random() < 0.18,
      tw: Math.random() * 6.28,
      ts: 1 + Math.random() * 2,
    };
  }

  #capsule(len, wid) {
    const c = this.ctx, r = wid / 2;
    c.beginPath();
    c.moveTo(-len / 2 + r, -r);
    c.lineTo(len / 2 - r, -r);
    c.arc(len / 2 - r, 0, r, -Math.PI / 2, Math.PI / 2);
    c.lineTo(-len / 2 + r, r);
    c.arc(-len / 2 + r, 0, r, Math.PI / 2, Math.PI * 1.5);
    c.closePath();
    c.fill();
  }

  #star(s) {
    const c = this.ctx, k = s * 0.14;
    c.beginPath();
    c.moveTo(0, -s);
    c.quadraticCurveTo(k, -k, s, 0);
    c.quadraticCurveTo(k, k, 0, s);
    c.quadraticCurveTo(-k, k, -s, 0);
    c.quadraticCurveTo(-k, -k, 0, -s);
    c.fill();
  }

  #tick = (now) => {
    const dt = Math.min(0.05, (now - this.#last) / 1000);
    this.#last = now;
    this.#t += dt;
    const target = this.getLevel();
    this.#lvl += (target - this.#lvl) * 0.18;
    const playing = this.isPlaying();
    // without an analyser, fake a soft pulse while music plays so it still feels alive
    const pulse = playing && target === 0 ? 0.5 + 0.5 * Math.sin(this.#t * 2.4) : 0;
    const energy = this.#lvl + pulse * 0.18;
    const boost = (this.reduced ? 0.4 : 1) * (1 + (playing ? 0.45 : 0) + energy * 2.2);

    const { ctx } = this;
    ctx.clearRect(0, 0, this.#w, this.#h);
    for (const p of this.#p) {
      p.y += p.vy * boost * dt;
      p.x += Math.sin(this.#t * 0.7 + p.ph) * p.sway * dt;
      p.rot += p.vr * dt * (1 + energy * 3);
      if (p.y > this.#h + 20) Object.assign(p, this.#make(false));
      if (p.x < -20) p.x = this.#w + 20;
      else if (p.x > this.#w + 20) p.x = -20;

      ctx.globalAlpha = clamp(0.3 + p.z * 0.42 + energy * 0.2, 0, 0.95);
      ctx.fillStyle = p.c;
      ctx.save();
      ctx.translate(p.x, p.y);
      if (p.sparkle) {
        const tw = 0.5 + 0.5 * Math.sin(this.#t * p.ts * 2 + p.tw);
        this.#star((3 + 4.5 * p.z) * (0.55 + tw) * (1 + energy * 0.8));
      } else {
        ctx.rotate(p.rot);
        this.#capsule(p.len * (1 + energy * 0.35), p.wid);
      }
      ctx.restore();
    }
    ctx.globalAlpha = 1;
    this.#raf = requestAnimationFrame(this.#tick);
  };
}
