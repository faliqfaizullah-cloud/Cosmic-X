import { clamp } from './util.js';

/**
 * 1-D spring scroller used by Cover Flow (horizontal) and the Queue deck (vertical).
 * `pos` is measured in "items": 0 = first item centred, 1 = second item centred, etc.
 */
export class Scroller {
  pos = 0;
  target = 0;
  vel = 0;
  dragging = false;
  #raf = 0;
  #last = 0;

  constructor({ min = 0, max = 0, onUpdate }) {
    this.min = min;
    this.max = max;
    this.onUpdate = onUpdate;
  }

  setRange(min, max) { this.min = min; this.max = Math.max(min, max); }

  jump(p) {
    this.pos = this.target = clamp(p, this.min, this.max);
    this.vel = 0;
    this.onUpdate(this.pos);
  }

  to(t) {
    this.target = clamp(Math.round(t), this.min, this.max);
    this.#kick();
  }

  dragTo(p) {
    this.pos = clamp(p, this.min - 0.35, this.max + 0.35);
    this.onUpdate(this.pos);
  }

  release(velItemsPerMs) {
    this.dragging = false;
    this.target = clamp(Math.round(this.pos + velItemsPerMs * 220), this.min, this.max);
    this.#kick();
  }

  settle() {
    this.dragging = false;
    this.target = clamp(Math.round(this.pos), this.min, this.max);
    this.#kick();
  }

  stop() { cancelAnimationFrame(this.#raf); this.#raf = 0; }

  #kick() {
    if (this.#raf) return;
    this.#last = performance.now();
    this.#raf = requestAnimationFrame(this.#tick);
  }

  #tick = (now) => {
    const dt = clamp((now - this.#last) / 16.667, 0.2, 3);
    this.#last = now;
    const diff = this.target - this.pos;
    this.vel = (this.vel + diff * 0.06 * dt) * Math.pow(0.66, dt);
    this.pos += this.vel * dt;
    if (Math.abs(diff) < 0.0008 && Math.abs(this.vel) < 0.0008) {
      this.pos = this.target;
      this.vel = 0;
      this.#raf = 0;
      this.onUpdate(this.pos);
      return;
    }
    this.onUpdate(this.pos);
    this.#raf = requestAnimationFrame(this.#tick);
  };
}

/** Wires pointer drag + tap handling on `el` to a Scroller. Returns an unbind function. */
export function bindDrag(el, sc, { axis = 'x', pxPerUnit = 60, onTap } = {}) {
  let id = null, s0 = 0, p0 = 0, moved = false, samples = [];
  const coord = (e) => (axis === 'x' ? e.clientX : e.clientY);

  const down = (e) => {
    if (id !== null) return;
    id = e.pointerId;
    s0 = coord(e);
    p0 = sc.pos;
    moved = false;
    samples = [[performance.now(), s0]];
    sc.dragging = true;
    sc.vel = 0;
    sc.stop();
  };
  const move = (e) => {
    if (e.pointerId !== id) return;
    const c = coord(e);
    if (!moved && Math.abs(c - s0) > 7) {
      moved = true;
      try { el.setPointerCapture(id); } catch { /* ignore */ }
    }
    if (!moved) return;
    samples.push([performance.now(), c]);
    if (samples.length > 6) samples.shift();
    sc.dragTo(p0 - (c - s0) / pxPerUnit);
  };
  const up = (e) => {
    if (e.pointerId !== id) return;
    id = null;
    if (moved) {
      const a = samples[0], b = samples[samples.length - 1];
      const dt = Math.max(1, b[0] - a[0]);
      const stale = performance.now() - b[0] > 90; // finger rested before lifting
      sc.release(stale ? 0 : -((b[1] - a[1]) / dt) / pxPerUnit);
    } else {
      sc.settle();
      if (e.type === 'pointerup') onTap?.(e);
    }
  };
  el.addEventListener('pointerdown', down);
  el.addEventListener('pointermove', move);
  el.addEventListener('pointerup', up);
  el.addEventListener('pointercancel', up);
  return () => {
    el.removeEventListener('pointerdown', down);
    el.removeEventListener('pointermove', move);
    el.removeEventListener('pointerup', up);
    el.removeEventListener('pointercancel', up);
  };
}
