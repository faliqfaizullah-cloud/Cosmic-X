import * as db from './db.js';
import { summarize, calories, defaultName, toGPX } from './track-math.js';
import { settings } from './settings.js';

class Activities extends EventTarget {
  list = []; // newest first
  byId = new Map();

  emit(n, d) { this.dispatchEvent(new CustomEvent(n, { detail: d })); }

  async load() {
    try { this.list = await db.getActivities(); } catch (e) { console.warn('[activities] load failed', e); this.list = []; }
    this.#sort();
    this.emit('change');
  }
  #sort() {
    this.list.sort((a, b) => b.start - a.start);
    this.byId = new Map(this.list.map((a) => [a.id, a]));
  }

  /** Build + persist a finished activity from a recorded session. */
  async add({ points, elapsed, moving, distance, elevGain, start, end }) {
    const act = {
      id: `${start}`,
      name: defaultName(start),
      type: 'Walk',
      start, end, elapsed, moving, distance, elevGain,
      kcal: calories(distance, moving || elapsed, settings.get('weight')),
      splits: summarize(points).splits,
      points,
    };
    await db.putActivity(act);
    this.list.push(act);
    this.#sort();
    this.emit('change');
    return act;
  }

  async rename(id, name) {
    const a = this.byId.get(id);
    if (!a || !name.trim()) return;
    a.name = name.trim();
    await db.putActivity(a);
    this.emit('change');
  }
  async remove(id) {
    await db.deleteActivity(id);
    this.list = this.list.filter((a) => a.id !== id);
    this.#sort();
    this.emit('change');
  }
  async clear() {
    await db.clearActivities();
    this.list = []; this.byId.clear();
    this.emit('change');
  }

  get totalDistance() { return this.list.reduce((n, a) => n + a.distance, 0); }
  /** Distance per day for the last 7 days (metres). */
  last7() {
    const out = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - i);
      const next = d.getTime() + 86400000;
      out.push({
        label: ['S', 'M', 'T', 'W', 'T', 'F', 'S'][d.getDay()],
        m: this.list.filter((a) => a.start >= d.getTime() && a.start < next).reduce((n, a) => n + a.distance, 0),
      });
    }
    return out;
  }
  gpx(id) { const a = this.byId.get(id); return a ? toGPX(a) : ''; }
}

export const activities = new Activities();
