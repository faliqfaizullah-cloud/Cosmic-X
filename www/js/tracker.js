import { native } from './native.js';
import { judge, paceOf, calories } from './track-math.js';
import * as db from './db.js';
import { activities } from './activities.js';
import { haptic } from './haptics.js';
import { settings } from './settings.js';

const NOTE = { backgroundTitle: 'Cosmic X · Walk in progress', backgroundMessage: 'Recording your route in the background' };

/**
 * Records a walk. Uses the native background-geolocation service on Android (keeps running with the
 * screen off, via a foreground-service notification) and falls back to the browser's geolocation.
 * Dependencies are injectable so the whole thing can be unit-tested with a simulated GPS.
 */
export class Tracker extends EventTarget {
  state = 'idle'; // idle | recording | paused
  points = [];
  distance = 0;
  moving = 0;
  elevGain = 0;
  alt = null; altMin = null; altMax = null;
  speed = 0; // smoothed, m/s
  weak = false;
  last = null; // last raw fix, even if rejected (so the map can follow you)
  startedAt = 0;

  #acc = 0; // ms recorded before the current segment
  #segStart = 0;
  #altRef = null;
  #lastKm = 0;
  #breakNext = false;
  #watchId = null;
  #browserId = null;
  #saveTimer = 0;
  #deps;

  constructor(deps = {}) {
    super();
    this.#deps = {
      bg: () => native('BackgroundGeolocation'),
      live: db,
      store: activities,
      now: () => Date.now(),
      ...deps,
    };
  }

  emit(n, d) { this.dispatchEvent(new CustomEvent(n, { detail: d })); }

  elapsed() {
    return (this.#acc + (this.state === 'recording' ? this.#deps.now() - this.#segStart : 0)) / 1000;
  }

  get snap() {
    const el = this.elapsed();
    const t = this.moving || el;
    return {
      state: this.state,
      distance: this.distance,
      elapsed: el,
      moving: this.moving,
      speedKmh: this.speed * 3.6,
      avgPace: paceOf(this.distance, t),
      elevGain: this.elevGain,
      alt: this.alt, altMin: this.altMin, altMax: this.altMax,
      kcal: calories(this.distance, t, settings.get('weight')),
      steps: Math.round(this.distance / 0.75), // rough estimate from a typical walking stride
      points: this.points,
      last: this.last,
      weak: this.weak,
    };
  }

  #reset() {
    this.points = []; this.distance = 0; this.moving = 0; this.elevGain = 0;
    this.alt = this.altMin = this.altMax = null; this.speed = 0; this.weak = false;
    this.#acc = 0; this.#altRef = null; this.#lastKm = 0; this.#breakNext = false;
  }

  async start() {
    if (this.state !== 'idle') return;
    this.#reset();
    this.startedAt = this.#deps.now();
    this.#segStart = this.startedAt;
    this.state = 'recording';
    this.#autosave(true);
    this.emit('state');
    await this.#watch();
  }

  async pause() {
    if (this.state !== 'recording') return;
    this.#acc += this.#deps.now() - this.#segStart;
    this.state = 'paused';
    this.speed = 0;
    await this.#unwatch();
    await this.#save();
    this.emit('state');
  }

  async resume() {
    if (this.state !== 'paused') return;
    this.#segStart = this.#deps.now();
    this.#breakNext = true; // first fix after a pause starts a new segment: no distance across the gap
    this.state = 'recording';
    this.emit('state');
    await this.#watch();
  }

  /** Finish: saves the activity (or discards it if it is too short). Returns the activity or null. */
  async stop() {
    if (this.state === 'idle') return null;
    const elapsed = this.elapsed();
    await this.#unwatch();
    this.#autosave(false);
    const ok = this.points.length > 1 && this.distance >= 20;
    let act = null;
    if (ok) {
      act = await this.#deps.store.add({
        points: this.points, elapsed, moving: this.moving, distance: this.distance, elevGain: this.elevGain,
        start: this.startedAt, end: this.#deps.now(),
      });
    }
    try { await this.#deps.live.clearLive(); } catch { /* nothing saved */ }
    this.#reset();
    this.state = 'idle';
    this.emit('state');
    this.emit(ok ? 'finish' : 'discard', { act });
    return act;
  }

  /** Called at app start: restores a walk that was recording when the app was killed. */
  async recover() {
    if (this.state !== 'idle') return false;
    let s = null;
    try { s = await this.#deps.live.getLive(); } catch { return false; }
    if (!s?.points?.length) return false;
    Object.assign(this, {
      points: s.points, distance: s.distance, moving: s.moving, elevGain: s.elevGain,
      alt: s.alt ?? null, altMin: s.altMin ?? null, altMax: s.altMax ?? null, startedAt: s.startedAt,
    });
    this.#acc = s.acc; this.#lastKm = Math.floor(s.distance / 1000); this.#altRef = s.altRef ?? null;
    this.state = 'paused';
    this.emit('state');
    this.emit('recovered');
    return true;
  }

  // ---------------------------------------------------------------- GPS source
  async #watch() {
    const bg = this.#deps.bg();
    if (bg) {
      try {
        this.#watchId = await bg.addWatcher(
          { ...NOTE, requestPermissions: true, stale: false, distanceFilter: 2 },
          (loc, err) => {
            if (err) return this.emit('error', { code: err.code || 'ERROR', message: err.message });
            if (loc) this.onFix(loc);
          }
        );
      } catch (e) { this.emit('error', { code: 'ERROR', message: String(e?.message || e) }); }
    } else if (globalThis.navigator?.geolocation) {
      this.#browserId = navigator.geolocation.watchPosition(
        (p) => this.onFix({ latitude: p.coords.latitude, longitude: p.coords.longitude, accuracy: p.coords.accuracy, altitude: p.coords.altitude, time: p.timestamp }),
        (e) => this.emit('error', { code: e.code === 1 ? 'NOT_AUTHORIZED' : 'ERROR', message: e.message }),
        { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 }
      );
    }
  }

  async #unwatch() {
    const bg = this.#deps.bg();
    try {
      if (bg && this.#watchId != null) await bg.removeWatcher({ id: this.#watchId });
      if (this.#browserId != null) navigator.geolocation.clearWatch(this.#browserId);
    } catch { /* already gone */ }
    this.#watchId = this.#browserId = null;
  }

  openSettings() { try { this.#deps.bg()?.openSettings?.(); } catch { /* not available */ } }

  // ---------------------------------------------------------------- the fix pipeline
  onFix(loc) {
    if (this.state !== 'recording') return;
    const lat = loc.latitude, lon = loc.longitude;
    const t = loc.time || this.#deps.now();
    this.last = { lat, lon, t, acc: loc.accuracy };

    const prev = this.points.length && !this.#breakNext ? this.points[this.points.length - 1] : null;
    const j = judge(prev, lat, lon, t, loc.accuracy);
    this.weak = j.reason === 'weak';
    if (!j.ok) {
      if (j.reason === 'still') this.speed *= 0.6;
      this.emit('fix');
      return;
    }

    const alt = loc.altitude != null && isFinite(loc.altitude) ? loc.altitude : null;
    const p = [lat, lon, t, alt];
    if (this.#breakNext) { p.push(1); this.#breakNext = false; }
    this.points.push(p);

    if (prev) {
      this.distance += j.d;
      if (j.v >= 0.4 && j.dt <= 30) this.moving += j.dt;
      this.speed = this.speed * 0.6 + j.v * 0.4;
    }
    if (alt != null) {
      this.alt = alt;
      this.altMin = this.altMin == null ? alt : Math.min(this.altMin, alt);
      this.altMax = this.altMax == null ? alt : Math.max(this.altMax, alt);
      if (this.#altRef == null) this.#altRef = alt;
      else if (alt - this.#altRef >= 3) { this.elevGain += alt - this.#altRef; this.#altRef = alt; }
      else if (this.#altRef - alt >= 3) this.#altRef = alt;
    }

    const km = Math.floor(this.distance / 1000);
    if (km > this.#lastKm) {
      this.#lastKm = km;
      haptic.notify('success'); // buzzes in your pocket every kilometre, even with the screen off
      this.emit('km', { km, pace: this.snap.avgPace });
    }
    this.emit('fix');
  }

  // ---------------------------------------------------------------- crash-safe autosave
  #autosave(on) {
    clearInterval(this.#saveTimer);
    this.#saveTimer = on ? setInterval(() => this.state === 'recording' && this.#save(), 15000) : 0;
  }
  async #save() {
    try {
      await this.#deps.live.putLive({
        points: this.points, distance: this.distance, moving: this.moving, elevGain: this.elevGain,
        alt: this.alt, altMin: this.altMin, altMax: this.altMax, altRef: this.#altRef,
        startedAt: this.startedAt, acc: this.#acc + (this.state === 'recording' ? this.#deps.now() - this.#segStart : 0),
      });
    } catch { /* storage full: keep recording in memory */ }
  }
}

export const tracker = new Tracker();
