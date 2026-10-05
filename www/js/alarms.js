import { uid } from './util.js';
import { haptic } from './haptics.js';
import { native } from './native.js';

const KEY = 'cx.alarms.v1';
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const notifs = () => native('LocalNotifications');

// ---------- pure helpers (unit-tested) ----------
export const pad = (n) => String(n).padStart(2, '0');

/** Next time this alarm will fire after `now` (days = [] means "once", i.e. the next occurrence of that time). */
export function nextOccurrence(alarm, now = new Date()) {
  const [h, m] = alarm.time.split(':').map(Number);
  for (let d = 0; d < 8; d++) {
    const t = new Date(now);
    t.setDate(now.getDate() + d);
    t.setHours(h, m, 0, 0);
    if (t > now && (!alarm.days.length || alarm.days.includes(t.getDay()))) return t;
  }
  return null;
}

export function describeDays(days) {
  if (!days.length) return 'Once';
  if (days.length === 7) return 'Every day';
  const wk = [1, 2, 3, 4, 5], we = [0, 6];
  if (days.length === 5 && wk.every((d) => days.includes(d))) return 'Weekdays';
  if (days.length === 2 && we.every((d) => days.includes(d))) return 'Weekends';
  return [...days].sort().map((d) => DAYS[d]).join(' ');
}

export function fmtIn(ms) {
  const mins = Math.max(1, Math.round(ms / 60000));
  const d = Math.floor(mins / 1440), h = Math.floor((mins % 1440) / 60), m = mins % 60;
  return d ? `${d}d ${h}h` : h ? `${h}h ${m}m` : `${m}m`;
}

// ---------- engine ----------
class Alarms extends EventTarget {
  list = [];
  ringing = null;
  #counter = 1;
  #fired = new Set();
  #snoozeUntil = 0;
  #snoozed = null;
  #tick = 0;
  #pulse = 0;
  #beep = 0;
  #ctx = null;
  #autoStop = 0;

  constructor() {
    super();
    try {
      const s = JSON.parse(localStorage.getItem(KEY) || '{}');
      this.list = s.list || [];
      this.#counter = s.counter || 1;
    } catch { /* fresh start */ }
  }

  emit(n, d) { this.dispatchEvent(new CustomEvent(n, { detail: d })); }
  #save() {
    try { localStorage.setItem(KEY, JSON.stringify({ list: this.list, counter: this.#counter })); } catch { /* full */ }
    this.emit('change');
    this.schedule();
  }

  add({ time = '07:00', label = '', days = [], enabled = true } = {}) {
    const a = { id: uid(), n: this.#counter++, time, label, days, enabled };
    this.list.push(a);
    this.list.sort((x, y) => x.time.localeCompare(y.time));
    this.#save();
    return a;
  }
  update(id, patch) {
    const a = this.list.find((x) => x.id === id);
    if (!a) return;
    Object.assign(a, patch);
    this.list.sort((x, y) => x.time.localeCompare(y.time));
    this.#save();
  }
  remove(id) {
    const a = this.list.find((x) => x.id === id);
    if (a) this.#cancelIds(a);
    this.list = this.list.filter((x) => x.id !== id);
    this.#save();
  }
  toggle(id) { const a = this.list.find((x) => x.id === id); if (a) this.update(id, { enabled: !a.enabled }); }

  /** The soonest enabled alarm, with its Date. */
  next(now = new Date()) {
    let best = null;
    for (const a of this.list) {
      if (!a.enabled) continue;
      const t = nextOccurrence(a, now);
      if (t && (!best || t < best.at)) best = { alarm: a, at: t };
    }
    return best;
  }

  // ---- native notifications (so alarms fire with the app closed) ----
  #idsFor(a) { return [0, 1, 2, 3, 4, 5, 6, 7].map((i) => ({ id: a.n * 10 + i })); }
  async #cancelIds(a) { try { await notifs()?.cancel({ notifications: this.#idsFor(a) }); } catch { /* plugin missing */ } }

  async requestPermission() {
    try {
      const p = notifs();
      if (!p) return true;
      const cur = await p.checkPermissions();
      if (cur.display === 'granted') return true;
      return (await p.requestPermissions()).display === 'granted';
    } catch { return false; }
  }

  async schedule() {
    const p = notifs();
    if (!p) return;
    try {
      for (const a of this.list) await this.#cancelIds(a);
      const out = [];
      for (const a of this.list.filter((x) => x.enabled)) {
        const [hour, minute] = a.time.split(':').map(Number);
        const base = { title: a.label || 'Alarm', body: `It's ${a.time}`, allowWhileIdle: true };
        if (!a.days.length) {
          const at = nextOccurrence(a);
          if (at) out.push({ ...base, id: a.n * 10, schedule: { at, allowWhileIdle: true } });
        } else {
          for (const d of a.days) out.push({ ...base, id: a.n * 10 + d + 1, schedule: { on: { weekday: d + 1, hour, minute }, allowWhileIdle: true } });
        }
      }
      if (out.length) await p.schedule({ notifications: out });
    } catch (e) { console.warn('[alarms] scheduling failed', e); }
  }

  // ---- in-app clock: rings while the app is open ----
  start() {
    if (this.#tick) return;
    this.#tick = setInterval(() => this.#check(), 1000);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) this.#check(90); });
    this.schedule();
  }

  #check(graceSec = 3) {
    if (this.ringing) return;
    const now = new Date();
    if (this.#snoozeUntil && now.getTime() >= this.#snoozeUntil) {
      const a = this.#snoozed; this.#snoozeUntil = 0; this.#snoozed = null;
      return this.#ring(a);
    }
    for (const a of this.list) {
      if (!a.enabled) continue;
      const [h, m] = a.time.split(':').map(Number);
      const due = new Date(now); due.setHours(h, m, 0, 0);
      const late = (now - due) / 1000;
      if (late < 0 || late > graceSec) continue;
      if (a.days.length && !a.days.includes(now.getDay())) continue;
      const key = `${a.id}@${due.toDateString()} ${a.time}`;
      if (this.#fired.has(key)) continue;
      this.#fired.add(key);
      return this.#ring(a);
    }
  }

  #ring(a) {
    this.ringing = a;
    this.emit('ring', a);
    haptic.notify('warning');
    this.#startTone();
    this.#pulse = setInterval(() => haptic.alarmPulse(), 1100);
    haptic.alarmPulse();
    this.#autoStop = setTimeout(() => this.stop(), 90000);
  }

  #startTone() {
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      this.#ctx ||= new AC();
      this.#ctx.resume?.();
      const beepBurst = () => {
        const c = this.#ctx, t0 = c.currentTime;
        for (let i = 0; i < 3; i++) {
          const o = c.createOscillator(), g = c.createGain();
          o.type = 'sine'; o.frequency.value = i === 2 ? 1175 : 880;
          g.gain.setValueAtTime(0.0001, t0 + i * 0.22);
          g.gain.exponentialRampToValueAtTime(0.35, t0 + i * 0.22 + 0.02);
          g.gain.exponentialRampToValueAtTime(0.0001, t0 + i * 0.22 + 0.17);
          o.connect(g).connect(c.destination);
          o.start(t0 + i * 0.22); o.stop(t0 + i * 0.22 + 0.2);
        }
      };
      beepBurst();
      this.#beep = setInterval(beepBurst, 1100);
    } catch { /* audio blocked: haptics still ring */ }
  }

  #silence() {
    clearInterval(this.#pulse); clearInterval(this.#beep); clearTimeout(this.#autoStop);
    this.#pulse = this.#beep = this.#autoStop = 0;
  }

  stop() {
    const a = this.ringing;
    if (!a) return;
    this.#silence();
    this.ringing = null;
    if (!a.days.length) { a.enabled = false; this.#save(); } // one-shot alarms switch themselves off
    this.emit('stop');
  }

  /** Preview the ringing screen, tone and haptics without touching any saved alarm. */
  test() {
    if (this.ringing) return;
    const d = new Date();
    this.#ring({ id: 'test', n: 0, time: `${pad(d.getHours())}:${pad(d.getMinutes())}`, label: 'Test alarm', days: [0, 1, 2, 3, 4, 5, 6], enabled: true });
  }

  snooze(minutes = 9) {
    const a = this.ringing;
    if (!a) return;
    this.#silence();
    this.ringing = null;
    this.#snoozed = a;
    this.#snoozeUntil = Date.now() + minutes * 60000;
    try { notifs()?.schedule({ notifications: [{ id: 99999, title: a.label || 'Alarm', body: 'Snoozed alarm', schedule: { at: new Date(this.#snoozeUntil), allowWhileIdle: true } }] }); } catch { /* ignore */ }
    this.emit('stop');
  }
}

export const alarms = new Alarms();
