import { getFile } from './db.js';
import { settings } from './settings.js';
import { library } from './library.js';

const shuffled = (n, first) => {
  const a = Array.from({ length: n }, (_, i) => i).filter((i) => i !== first);
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return first >= 0 ? [first, ...a] : a;
};

class Player extends EventTarget {
  audio = new Audio();
  list = []; // songs the queue was built from
  order = []; // indices into list (identity, or shuffled)
  pos = -1; // position inside `order`
  current = null;
  shuffle = settings.get('shuffle');
  repeat = settings.get('repeat');
  #url = null;
  #token = 0;
  #ctx = null;
  #analyser = null;
  #freq = null;

  constructor() {
    super();
    const a = this.audio;
    a.preload = 'auto';
    a.addEventListener('timeupdate', () => this.emit('time'));
    a.addEventListener('durationchange', () => this.emit('time'));
    a.addEventListener('play', () => this.emit('state'));
    a.addEventListener('pause', () => this.emit('state'));
    a.addEventListener('ended', () => this.next(true));
    a.addEventListener('error', () => {
      if (this.current) this.emit('error', { song: this.current });
    });
    this.#bindMediaSession();
  }

  emit(name, detail) { this.dispatchEvent(new CustomEvent(name, { detail })); }

  get playing() { return !this.audio.paused; }
  get time() { return this.audio.currentTime || 0; }
  get duration() { return isFinite(this.audio.duration) && this.audio.duration > 0 ? this.audio.duration : this.current?.duration || 0; }

  /** Replace the queue with `songs` and start at `startId`. */
  async playList(songs, startId, { play = true } = {}) {
    this.list = songs.slice();
    const idx = Math.max(0, this.list.findIndex((s) => s.id === startId));
    this.order = this.shuffle ? shuffled(this.list.length, idx) : this.list.map((_, i) => i);
    this.pos = this.shuffle ? 0 : idx;
    this.emit('queue');
    await this.#load(this.list[this.order[this.pos]], play);
  }

  async jumpTo(orderPos) {
    if (orderPos < 0 || orderPos >= this.order.length) return;
    this.pos = orderPos;
    this.emit('queue');
    await this.#load(this.list[this.order[this.pos]], true);
  }

  /** Songs from the current one onward, with their positions in `order`. */
  upcoming(limit = 40) {
    const out = [];
    for (let p = Math.max(0, this.pos); p < this.order.length && out.length < limit; p++) {
      out.push({ song: this.list[this.order[p]], orderPos: p });
    }
    return out;
  }

  async #load(song, play) {
    if (!song) return;
    const token = ++this.#token;
    const blob = await getFile(song.id);
    if (token !== this.#token) return; // a newer request superseded this one
    if (!blob) { this.emit('error', { song }); return; }
    if (this.#url) URL.revokeObjectURL(this.#url);
    this.#url = URL.createObjectURL(blob);
    this.audio.src = this.#url;
    this.current = song;
    try { localStorage.setItem('cx.last', song.id); } catch { /* ignore */ }
    this.#updateSession(song);
    this.emit('track', { song });
    this.emit('time');
    if (play) await this.play();
  }

  async #ensureCtx() {
    if (!settings.get('reactive')) return;
    try {
      if (!this.#ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        this.#ctx = new AC();
        const src = this.#ctx.createMediaElementSource(this.audio);
        this.#analyser = this.#ctx.createAnalyser();
        this.#analyser.fftSize = 256;
        this.#analyser.smoothingTimeConstant = 0.8;
        src.connect(this.#analyser);
        this.#analyser.connect(this.#ctx.destination);
        this.#freq = new Uint8Array(this.#analyser.frequencyBinCount);
      }
      if (this.#ctx.state === 'suspended') await this.#ctx.resume();
    } catch (e) {
      console.warn('[player] analyser unavailable', e);
    }
  }

  /** 0..1 bass-weighted loudness; 0 when the analyser isn't active. */
  level() {
    if (!this.#analyser || this.audio.paused) return 0;
    this.#analyser.getByteFrequencyData(this.#freq);
    let s = 0;
    const n = 10;
    for (let i = 0; i < n; i++) s += this.#freq[i];
    return s / (n * 255);
  }

  async play() {
    if (!this.current) return;
    await this.#ensureCtx();
    try { await this.audio.play(); } catch (e) { console.warn('[player] play() rejected', e); }
  }
  pause() { this.audio.pause(); }
  toggle() { return this.playing ? this.pause() : this.play(); }

  seek(t) {
    if (!isFinite(t)) return;
    this.audio.currentTime = Math.max(0, Math.min(t, this.duration || t));
    this.emit('time');
  }

  async next(auto = false) {
    if (!this.order.length) return;
    if (auto && this.repeat === 'one') { this.seek(0); return this.play(); }
    let p = this.pos + 1;
    if (p >= this.order.length) {
      if (this.repeat === 'all' || !auto) {
        if (this.shuffle) this.order = shuffled(this.list.length, -1);
        p = 0;
      } else {
        this.pause();
        this.seek(0);
        return;
      }
    }
    return this.jumpTo(p);
  }

  async prev() {
    if (!this.order.length) return;
    if (this.time > 3) { this.seek(0); return; }
    let p = this.pos - 1;
    if (p < 0) p = this.repeat === 'all' ? this.order.length - 1 : 0;
    return this.jumpTo(p);
  }

  setShuffle(on) {
    this.shuffle = on;
    settings.set('shuffle', on);
    if (this.list.length) {
      const curIdx = this.order[this.pos] ?? 0;
      this.order = on ? shuffled(this.list.length, curIdx) : this.list.map((_, i) => i);
      this.pos = on ? 0 : curIdx;
    }
    this.emit('queue');
    this.emit('state');
  }

  cycleRepeat() {
    this.repeat = this.repeat === 'off' ? 'all' : this.repeat === 'all' ? 'one' : 'off';
    settings.set('repeat', this.repeat);
    this.emit('state');
  }

  /** Keep the queue consistent when songs are deleted from the library. */
  handleRemoved(ids) {
    const gone = new Set(ids);
    if (!this.list.length) return;
    const curId = this.current?.id;
    const wasCurrent = curId && gone.has(curId);
    const keepIds = this.order.map((i) => this.list[i]).filter((s) => !gone.has(s.id));
    const curPos = keepIds.findIndex((s) => s.id === curId);
    this.list = keepIds;
    this.order = keepIds.map((_, i) => i);
    this.pos = curPos;
    if (wasCurrent) {
      this.pause();
      this.audio.removeAttribute('src');
      this.audio.load();
      this.current = null;
      this.pos = -1;
      this.emit('track', { song: null });
    }
    this.emit('queue');
  }

  // ---- Media Session (lock-screen / notification controls where supported) ----
  #bindMediaSession() {
    if (!('mediaSession' in navigator)) return;
    const set = (a, fn) => { try { navigator.mediaSession.setActionHandler(a, fn); } catch { /* unsupported */ } };
    set('play', () => this.play());
    set('pause', () => this.pause());
    set('previoustrack', () => this.prev());
    set('nexttrack', () => this.next());
    set('seekto', (d) => d.seekTime != null && this.seek(d.seekTime));
  }

  #updateSession(song) {
    if (!('mediaSession' in navigator) || typeof MediaMetadata === 'undefined') return;
    try {
      const url = library.coverURL(song);
      navigator.mediaSession.metadata = new MediaMetadata({
        title: song.title,
        artist: song.artist,
        album: song.album,
        artwork: url ? [{ src: url, sizes: '512x512', type: 'image/jpeg' }] : [],
      });
    } catch { /* ignore */ }
  }
}

export const player = new Player();
