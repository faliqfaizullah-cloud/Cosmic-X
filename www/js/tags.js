// Lightweight audio metadata reader: ID3v2 (mp3), MP4/M4A, FLAC, Ogg (text tags only).
// Pure JS, only needs Blob.slice().arrayBuffer() + TextDecoder, so it can be unit-tested in Node.

const ascii = (b, p, n) => String.fromCharCode(...b.subarray(p, p + n));
const u32 = (b, p) => ((b[p] << 24) | (b[p + 1] << 16) | (b[p + 2] << 8) | b[p + 3]) >>> 0;
const synchsafe = (b, p) => ((b[p] & 0x7f) << 21) | ((b[p + 1] & 0x7f) << 14) | ((b[p + 2] & 0x7f) << 7) | (b[p + 3] & 0x7f);
const le32 = (b, p) => (b[p] | (b[p + 1] << 8) | (b[p + 2] << 16) | (b[p + 3] << 24)) >>> 0;
const bytes = async (file, start, end) => new Uint8Array(await file.slice(start, end).arrayBuffer());

function deunsync(b) {
  const out = [];
  for (let i = 0; i < b.length; i++) {
    out.push(b[i]);
    if (b[i] === 0xff && b[i + 1] === 0x00) i++;
  }
  return Uint8Array.from(out);
}

function decodeText(b, enc) {
  try {
    if (enc === 1) {
      if (b[0] === 0xff && b[1] === 0xfe) return new TextDecoder('utf-16le').decode(b.subarray(2));
      if (b[0] === 0xfe && b[1] === 0xff) return new TextDecoder('utf-16be').decode(b.subarray(2));
      return new TextDecoder('utf-16le').decode(b);
    }
    if (enc === 2) return new TextDecoder('utf-16be').decode(b);
    if (enc === 3) return new TextDecoder('utf-8').decode(b);
    return new TextDecoder('latin1').decode(b);
  } catch {
    return '';
  }
}

// Reads a null-terminated string. Returns [text, nextPos]
function termString(b, pos, enc) {
  const wide = enc === 1 || enc === 2;
  let end = pos;
  if (wide) while (end + 1 < b.length && !(b[end] === 0 && b[end + 1] === 0)) end += 2;
  else while (end < b.length && b[end] !== 0) end++;
  return [decodeText(b.subarray(pos, end), enc), Math.min(b.length, end + (wide ? 2 : 1))];
}

function textFrame(data) {
  const enc = data[0];
  const vals = [];
  let p = 1;
  while (p < data.length) {
    const [s, np] = termString(data, p, enc);
    if (s.trim()) vals.push(s.trim());
    if (np <= p) break;
    p = np;
  }
  return vals;
}

function pictureFrame(data, v22) {
  const enc = data[0];
  let p = 1;
  let mime;
  if (v22) {
    const fmt = ascii(data, 1, 3).toUpperCase();
    mime = fmt === 'PNG' ? 'image/png' : 'image/jpeg';
    p = 4;
  } else {
    const [m, np] = termString(data, 1, 0);
    mime = m && m.includes('/') ? m : m ? 'image/' + m : 'image/jpeg';
    p = np;
  }
  const type = data[p];
  p += 1;
  const [, np2] = termString(data, p, enc);
  const img = data.subarray(np2);
  if (!img.length) return null;
  return { mime, type, data: img };
}

async function readID3v2(file) {
  const hdr = await bytes(file, 0, 10);
  const ver = hdr[3];
  const flags = hdr[5];
  const size = synchsafe(hdr, 6);
  let buf = await bytes(file, 10, 10 + Math.min(size, 24 * 1024 * 1024));
  if (ver < 4 && flags & 0x80) buf = deunsync(buf);
  let p = 0;
  if (flags & 0x40) p = ver === 3 ? 4 + u32(buf, 0) : synchsafe(buf, 0);

  const idLen = ver === 2 ? 3 : 4;
  const hdrLen = ver === 2 ? 6 : 10;
  const res = {};
  let bestPic = null;

  while (p + hdrLen <= buf.length) {
    if (buf[p] === 0) break; // padding
    const id = ascii(buf, p, idLen);
    let fsize;
    let fflags = 0;
    if (ver === 2) fsize = (buf[p + 3] << 16) | (buf[p + 4] << 8) | buf[p + 5];
    else if (ver === 3) {
      fsize = u32(buf, p + 4);
      fflags = (buf[p + 8] << 8) | buf[p + 9];
    } else {
      fsize = synchsafe(buf, p + 4);
      fflags = (buf[p + 8] << 8) | buf[p + 9];
    }
    const start = p + hdrLen;
    const end = start + fsize;
    if (fsize <= 0 || end > buf.length) break;
    let data = buf.subarray(start, end);
    if (ver === 4) {
      if (fflags & 0x0001) data = data.subarray(4);
      if (fflags & 0x0002 || flags & 0x80) data = deunsync(data);
    }
    p = end;

    switch (id) {
      case 'TIT2': case 'TT2': res.title = textFrame(data)[0]; break;
      case 'TPE1': case 'TP1': res.artist = textFrame(data).join(', '); break;
      case 'TPE2': case 'TP2': res.albumArtist = textFrame(data)[0]; break;
      case 'TALB': case 'TAL': res.album = textFrame(data)[0]; break;
      case 'TRCK': case 'TRK': res.track = parseInt(textFrame(data)[0], 10) || 0; break;
      case 'TYER': case 'TYE': case 'TDRC': res.year = (textFrame(data)[0] || '').slice(0, 4); break;
      case 'APIC': case 'PIC': {
        const pic = pictureFrame(data, id === 'PIC');
        if (pic && (!bestPic || pic.type === 3)) bestPic = pic;
        break;
      }
      default: break;
    }
  }
  if (bestPic) res.picture = { mime: bestPic.mime, data: bestPic.data };
  return res;
}

// ---------- MP4 / M4A ----------
async function boxHeader(file, off) {
  const h = await bytes(file, off, off + 16);
  if (h.length < 8) return null;
  let size = u32(h, 0);
  const type = ascii(h, 4, 4);
  let hdr = 8;
  if (size === 1) {
    size = u32(h, 8) * 4294967296 + u32(h, 12);
    hdr = 16;
  } else if (size === 0) size = file.size - off;
  if (size < hdr) return null;
  return { size, type, hdr, off };
}

async function findChild(file, parent, type, skip = 0) {
  let off = parent.off + parent.hdr + skip;
  const end = parent.off + parent.size;
  while (off + 8 <= end) {
    const b = await boxHeader(file, off);
    if (!b) return null;
    if (b.type === type) return b;
    off += b.size;
  }
  return null;
}

function parseIlst(b) {
  const res = {};
  let p = 0;
  while (p + 8 <= b.length) {
    const size = u32(b, p);
    if (size < 8 || p + size > b.length) break;
    const type = String.fromCharCode(...b.subarray(p + 4, p + 8));
    // find 'data' box inside
    let q = p + 8;
    while (q + 16 <= p + size) {
      const dsize = u32(b, q);
      if (dsize < 16) break;
      if (ascii(b, q + 4, 4) === 'data') {
        const flag = u32(b, q + 8) & 0xffffff;
        const payload = b.subarray(q + 16, q + dsize);
        const t = flag === 1 ? new TextDecoder('utf-8').decode(payload) : '';
        if (type === '\xa9nam') res.title = t;
        else if (type === '\xa9ART') res.artist = t;
        else if (type === 'aART') res.albumArtist = t;
        else if (type === '\xa9alb') res.album = t;
        else if (type === '\xa9day') res.year = t.slice(0, 4);
        else if (type === 'trkn' && payload.length >= 4) res.track = (payload[2] << 8) | payload[3];
        else if (type === 'covr' && payload.length) {
          res.picture = { mime: flag === 14 ? 'image/png' : 'image/jpeg', data: payload };
        }
        break;
      }
      q += dsize;
    }
    p += size;
  }
  return res;
}

async function readMP4(file) {
  let off = 0;
  let moov = null;
  while (off < file.size) {
    const b = await boxHeader(file, off);
    if (!b) break;
    if (b.type === 'moov') { moov = b; break; }
    off += b.size;
  }
  if (!moov) return {};
  const udta = await findChild(file, moov, 'udta');
  if (!udta) return {};
  const meta = await findChild(file, udta, 'meta');
  if (!meta) return {};
  const ilst = await findChild(file, meta, 'ilst', 4); // 'meta' is a full box: skip version/flags
  if (!ilst || ilst.size > 32 * 1024 * 1024) return {};
  const buf = await bytes(file, ilst.off + ilst.hdr, ilst.off + ilst.size);
  return parseIlst(buf);
}

// ---------- Vorbis comments (FLAC + Ogg) ----------
function parseVorbisComment(b, p) {
  const res = {};
  try {
    const vlen = le32(b, p); p += 4 + vlen;
    const count = le32(b, p); p += 4;
    for (let i = 0; i < count && p + 4 <= b.length; i++) {
      const len = le32(b, p); p += 4;
      if (p + len > b.length) break;
      const s = new TextDecoder('utf-8').decode(b.subarray(p, p + len));
      p += len;
      const eq = s.indexOf('=');
      if (eq < 0) continue;
      const k = s.slice(0, eq).toUpperCase();
      const v = s.slice(eq + 1).trim();
      if (!v) continue;
      if (k === 'TITLE') res.title = v;
      else if (k === 'ARTIST') res.artist = res.artist ? res.artist + ', ' + v : v;
      else if (k === 'ALBUMARTIST') res.albumArtist = v;
      else if (k === 'ALBUM') res.album = v;
      else if (k === 'DATE' || k === 'YEAR') res.year = v.slice(0, 4);
      else if (k === 'TRACKNUMBER') res.track = parseInt(v, 10) || 0;
    }
  } catch { /* ignore */ }
  return res;
}

function parseFlacPicture(b) {
  let p = 0;
  const type = u32(b, p); p += 4;
  const ml = u32(b, p); p += 4;
  const mime = ascii(b, p, ml); p += ml;
  const dl = u32(b, p); p += 4 + dl;
  p += 16; // width, height, depth, colors
  const len = u32(b, p); p += 4;
  const data = b.subarray(p, p + len);
  return data.length ? { mime: mime || 'image/jpeg', data, type } : null;
}

async function readFLAC(file) {
  let pos = 4;
  const res = {};
  let bestPic = null;
  for (let guard = 0; guard < 64; guard++) {
    const h = await bytes(file, pos, pos + 4);
    if (h.length < 4) break;
    const last = !!(h[0] & 0x80);
    const type = h[0] & 0x7f;
    const len = (h[1] << 16) | (h[2] << 8) | h[3];
    pos += 4;
    if (type === 4 && len < 4 * 1024 * 1024) {
      Object.assign(res, parseVorbisComment(await bytes(file, pos, pos + len), 0));
    } else if (type === 6 && len < 24 * 1024 * 1024) {
      const pic = parseFlacPicture(await bytes(file, pos, pos + len));
      if (pic && (!bestPic || pic.type === 3)) bestPic = pic;
    }
    pos += len;
    if (last) break;
  }
  if (bestPic) res.picture = { mime: bestPic.mime, data: bestPic.data };
  return res;
}

async function readOgg(file) {
  const b = await bytes(file, 0, 128 * 1024);
  const find = (needle) => {
    outer: for (let i = 0; i < b.length - needle.length; i++) {
      for (let j = 0; j < needle.length; j++) if (b[i + j] !== needle.charCodeAt(j)) continue outer;
      return i;
    }
    return -1;
  };
  let i = find('\x03vorbis');
  if (i >= 0) return parseVorbisComment(b, i + 7);
  i = find('OpusTags');
  if (i >= 0) return parseVorbisComment(b, i + 8);
  return {};
}

// ---------- Public API ----------
export async function readTags(file) {
  let out = {};
  try {
    const head = await bytes(file, 0, 12);
    if (ascii(head, 0, 3) === 'ID3') out = await readID3v2(file);
    else if (ascii(head, 4, 4) === 'ftyp') out = await readMP4(file);
    else if (ascii(head, 0, 4) === 'fLaC') out = await readFLAC(file);
    else if (ascii(head, 0, 4) === 'OggS') out = await readOgg(file);
  } catch (e) {
    console.warn('[tags] parse failed', e);
  }
  for (const k of ['title', 'artist', 'album', 'albumArtist']) {
    if (typeof out[k] === 'string') out[k] = out[k].replace(/\u0000/g, '').trim();
  }
  return out;
}

export function guessFromFilename(base) {
  const clean = base.replace(/_/g, ' ').replace(/^\d{1,3}[\s.\-_)]+/, '').trim();
  const m = clean.split(/\s[-–—]\s/);
  if (m.length >= 2) return { artist: m[0].trim(), title: m.slice(1).join(' - ').trim() };
  return { title: clean };
}
