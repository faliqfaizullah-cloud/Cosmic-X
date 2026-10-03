import * as db from './db.js';
import { readTags, guessFromFilename } from './tags.js';
import { uid, paletteFor, clamp } from './util.js';
import { settings } from './settings.js';

const UNKNOWN_ARTIST = 'Unknown Artist';
const UNKNOWN_ALBUM = 'Unknown Album';

function probeDuration(blob) {
  return new Promise((resolve) => {
    const a = new Audio();
    const url = URL.createObjectURL(blob);
    let settled = false;
    const done = (d) => {
      if (settled) return;
      settled = true;
      URL.revokeObjectURL(url);
      a.removeAttribute('src');
      a.load();
      resolve(d);
    };
    a.preload = 'metadata';
    a.onloadedmetadata = () => done(isFinite(a.duration) ? a.duration : 0);
    a.onerror = () => done(-1); // the WebView can't decode this file
    setTimeout(() => done(0), 8000);
    a.src = url;
  });
}

async function shrinkCover(blob, max = 512) {
  try {
    const bmp = await createImageBitmap(blob);
    const side = Math.min(bmp.width, bmp.height);
    const out = Math.min(max, side);
    const c = document.createElement('canvas');
    c.width = c.height = out;
    c.getContext('2d').drawImage(bmp, (bmp.width - side) / 2, (bmp.height - side) / 2, side, side, 0, 0, out, out);
    bmp.close?.();
    return await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.86));
  } catch {
    return null;
  }
}

async function dominantColors(blob) {
  const bmp = await createImageBitmap(blob);
  const c = document.createElement('canvas');
  c.width = c.height = 24;
  const x = c.getContext('2d', { willReadFrequently: true });
  x.drawImage(bmp, 0, 0, 24, 24);
  bmp.close?.();
  const d = x.getImageData(0, 0, 24, 24).data;
  let r = 0, g = 0, b = 0, w = 0;
  for (let i = 0; i < d.length; i += 4) {
    const R = d[i], G = d[i + 1], B = d[i + 2];
    const mx = Math.max(R, G, B), mn = Math.min(R, G, B);
    const sat = (mx - mn) / (mx || 1);
    const lum = (R + G + B) / 765;
    const wt = 0.12 + sat * sat * 2.2 + (lum > 0.15 && lum < 0.9 ? 0.3 : 0);
    r += R * wt; g += G * wt; b += B * wt; w += wt;
  }
  r /= w; g /= w; b /= w;
  const m = Math.max(r, g, b, 1);
  if (m < 150) { const k = 150 / m; r *= k; g *= k; b *= k; }
  const f = (v) => clamp(Math.round(v), 0, 255);
  return [`rgb(${f(r)},${f(g)},${f(b)})`, `rgb(${f(r * 0.32)},${f(g * 0.28)},${f(b * 0.3)})`];
}

class Library extends EventTarget {
  songs = [];
  byId = new Map();
  #urls = new Map();
  #colors = new Map();

  emit(name, detail) { this.dispatchEvent(new CustomEvent(name, { detail })); }

  async load() {
    this.songs = await db.getAllSongs();
    this.resort();
    this.emit('change');
  }

  resort() {
    const mode = settings.get('sort');
    const ul = (a, b) => a.localeCompare(b, undefined, { sensitivity: 'base', numeric: true });
    const unk = (s) => (s === UNKNOWN_ARTIST ? 1 : 0);
    const cmp =
      mode === 'title' ? (a, b) => ul(a.title, b.title)
      : mode === 'recent' ? (a, b) => b.addedAt - a.addedAt
      : (a, b) => unk(a.artist) - unk(b.artist) || ul(a.artist, b.artist) || ul(a.album, b.album) || (a.track || 999) - (b.track || 999) || ul(a.title, b.title);
    this.songs.sort(cmp);
    this.byId = new Map(this.songs.map((s) => [s.id, s]));
  }

  async importFiles(files, onProgress) {
    const list = [...files];
    const res = { added: 0, skipped: 0, failed: 0 };
    for (let i = 0; i < list.length; i++) {
      onProgress?.(i + 1, list.length, list[i].name);
      try {
        const r = await this.#importOne(list[i]);
        if (r === 'dup') res.skipped++;
        else if (r === 'bad') res.failed++;
        else res.added++;
      } catch (e) {
        console.error('[import]', e);
        res.failed++;
      }
    }
    this.resort();
    this.emit('change');
    return res;
  }

  async #importOne(f) {
    const key = `${f.name}|${f.size}|${f.lastModified}`;
    if (await db.hasKey(key)) return 'dup';
    const dur = await probeDuration(f);
    if (dur < 0) return 'bad';
    const tags = await readTags(f);
    let cover = null;
    if (tags.picture) cover = await shrinkCover(new Blob([tags.picture.data], { type: tags.picture.mime || 'image/jpeg' }));
    const base = f.name.replace(/\.[^.]+$/, '');
    const g = guessFromFilename(base);
    const song = {
      id: uid(),
      key,
      title: tags.title || g.title || base,
      artist: tags.artist || tags.albumArtist || g.artist || UNKNOWN_ARTIST,
      album: tags.album || UNKNOWN_ALBUM,
      year: tags.year || '',
      track: tags.track || 0,
      duration: dur,
      size: f.size,
      ext: (f.name.split('.').pop() || '').toLowerCase(),
      cover,
      addedAt: Date.now(),
      fav: false,
    };
    await db.putSong(song, f);
    this.songs.push(song);
    return 'ok';
  }

  async remove(id) {
    await db.deleteSong(id);
    const u = this.#urls.get(id);
    if (u) URL.revokeObjectURL(u);
    this.#urls.delete(id);
    this.#colors.delete(id);
    this.songs = this.songs.filter((s) => s.id !== id);
    this.byId.delete(id);
    this.emit('change', { removed: id });
  }

  async clear() {
    await db.clearAll();
    this.#urls.forEach((u) => URL.revokeObjectURL(u));
    this.#urls.clear();
    this.#colors.clear();
    this.songs = [];
    this.byId.clear();
    this.emit('change', { cleared: true });
  }

  async toggleFav(id) {
    const s = this.byId.get(id);
    if (!s) return;
    s.fav = !s.fav;
    await db.updateSong(s);
    this.emit('fav', { id });
  }

  get totalSize() { return this.songs.reduce((n, s) => n + (s.size || 0), 0); }
  get totalDuration() { return this.songs.reduce((n, s) => n + (s.duration || 0), 0); }

  albums() {
    const map = new Map();
    for (const s of this.songs) {
      const k = `${s.album}|${s.artist}`;
      if (!map.has(k)) map.set(k, { key: k, name: s.album, artist: s.artist, songs: [] });
      map.get(k).songs.push(s);
    }
    return [...map.values()].map((a) => ({ ...a, art: a.songs.find((s) => s.cover) || a.songs[0] }));
  }

  search(q) {
    const tokens = q.toLowerCase().split(/\s+/).filter(Boolean);
    if (!tokens.length) return [];
    return this.songs.filter((s) => {
      const hay = `${s.title} ${s.artist} ${s.album}`.toLowerCase();
      return tokens.every((t) => hay.includes(t));
    });
  }

  coverURL(s) {
    if (!s?.cover) return null;
    let u = this.#urls.get(s.id);
    if (!u) {
      u = URL.createObjectURL(s.cover);
      this.#urls.set(s.id, u);
    }
    return u;
  }

  // CSS `background` value for a song: real artwork, or a generated cosmic gradient
  artBg(s) {
    const u = this.coverURL(s);
    if (u) return `background-image:url("${u}")`;
    const [a, b] = paletteFor(s?.title || s?.id || 'x');
    return `background-image:linear-gradient(155deg, ${a}, ${b})`;
  }

  async colors(s) {
    if (!s) return ['#ff9a5a', '#5a1a14'];
    if (this.#colors.has(s.id)) return this.#colors.get(s.id);
    let c;
    try { c = s.cover ? await dominantColors(s.cover) : paletteFor(s.title); } catch { c = paletteFor(s.title); }
    this.#colors.set(s.id, c);
    return c;
  }
}

export const library = new Library();
