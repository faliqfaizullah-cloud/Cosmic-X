// Pure maths for the walking tracker + map. No DOM, fully unit-tested.
// A track point is an array: [lat, lon, timeMs, altitudeM|null]

const R = 6371008.8;
const rad = (d) => (d * Math.PI) / 180;

export function haversine(lat1, lon1, lat2, lon2) {
  const dLat = rad(lat2 - lat1), dLon = rad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

export const fmtKm = (m) => (m / 1000).toFixed(2);
export function fmtDur(sec) {
  sec = Math.max(0, Math.round(sec || 0));
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`; // minutes can exceed 99, like "167:41"
}
export function fmtPace(secPerKm) {
  if (!isFinite(secPerKm) || secPerKm <= 0 || secPerKm > 5999) return '--:--';
  return fmtDur(secPerKm);
}
export const paceOf = (meters, seconds) => (meters > 20 && seconds > 0 ? seconds / (meters / 1000) : NaN);

/** MET-based calorie estimate for walking/jogging. */
export function calories(meters, seconds, kg = 70) {
  if (seconds <= 0 || meters <= 0) return 0;
  const kmh = (meters / 1000) / (seconds / 3600);
  const met = kmh < 3.2 ? 2.5 : kmh < 4.8 ? 3.3 : kmh < 5.6 ? 3.8 : kmh < 6.4 ? 5.0 : kmh < 8 ? 7.0 : 9.0;
  return Math.round(met * kg * (seconds / 3600));
}

/**
 * Decide whether to keep a new GPS fix.
 * prev = last accepted point or null. Returns { ok, d, v, dt, reason }.
 */
export function judge(prev, lat, lon, t, accuracy, opts = {}) {
  const { maxAccuracy = 40, minMove = 3, maxSpeed = 15 } = opts;
  if (accuracy != null && accuracy > maxAccuracy) return { ok: false, reason: 'weak' };
  if (!prev) return { ok: true, d: 0, v: 0, dt: 0 };
  const dt = (t - prev[2]) / 1000;
  if (dt <= 0) return { ok: false, reason: 'old' };
  const d = haversine(prev[0], prev[1], lat, lon);
  const v = d / dt;
  if (v > maxSpeed) return { ok: false, reason: 'jump' };
  if (d < Math.max(minMove, (accuracy || 0) * 0.35)) return { ok: false, reason: 'still', d, dt };
  return { ok: true, d, v, dt };
}

/** Elevation gain with a hysteresis threshold so GPS altitude noise isn't counted. */
export function elevationGain(alts, threshold = 3) {
  let gain = 0, ref = null;
  for (const a of alts) {
    if (a == null || !isFinite(a)) continue;
    if (ref == null) { ref = a; continue; }
    if (a - ref >= threshold) { gain += a - ref; ref = a; }
    else if (ref - a >= threshold) ref = a;
  }
  return gain;
}

/**
 * Full recompute from points: used for per-km splits and to verify the live counters.
 * A point with a 5th element (=1) starts a new segment after a pause: no distance is counted across
 * the gap and the paused time is removed from elapsed time and split times.
 */
export function summarize(points) {
  let distance = 0, moving = 0, paused = 0, pausedSinceSplit = 0;
  const splits = [];
  let nextKm = 1000, lastSplitT = points[0]?.[2] ?? 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i];
    if (b[4] === 1) { const gap = b[2] - a[2]; paused += gap; pausedSinceSplit += gap; continue; }
    const d = haversine(a[0], a[1], b[0], b[1]);
    const dt = (b[2] - a[2]) / 1000;
    if (dt > 0 && dt <= 30 && d / dt >= 0.4) moving += dt;
    const before = distance;
    distance += d;
    while (distance >= nextKm) {
      const t = a[2] + (b[2] - a[2]) * ((nextKm - before) / d);
      splits.push({ km: splits.length + 1, sec: (t - lastSplitT - pausedSinceSplit) / 1000 });
      lastSplitT = t;
      pausedSinceSplit = 0;
      nextKm += 1000;
    }
  }
  const elapsed = points.length > 1 ? (points[points.length - 1][2] - points[0][2] - paused) / 1000 : 0;
  return { distance, moving, elapsed, splits, elevGain: elevationGain(points.map((p) => p[3])) };
}

/** Ramer–Douglas–Peucker simplification (tolerance in metres) for thumbnails / widgets. */
export function simplify(points, tol = 4) {
  if (points.length < 3) return points.slice();
  const lat0 = points[0][0];
  const kx = Math.cos(rad(lat0)) * 111320, ky = 110540;
  const xy = points.map((p) => [p[1] * kx, p[0] * ky]);
  const keep = new Uint8Array(points.length);
  keep[0] = keep[points.length - 1] = 1;
  const stack = [[0, points.length - 1]];
  while (stack.length) {
    const [s, e] = stack.pop();
    let maxD = 0, idx = -1;
    const [x1, y1] = xy[s], [x2, y2] = xy[e];
    const dx = x2 - x1, dy = y2 - y1, len2 = dx * dx + dy * dy;
    for (let i = s + 1; i < e; i++) {
      let t = len2 ? ((xy[i][0] - x1) * dx + (xy[i][1] - y1) * dy) / len2 : 0;
      t = Math.max(0, Math.min(1, t));
      const d = Math.hypot(xy[i][0] - (x1 + t * dx), xy[i][1] - (y1 + t * dy));
      if (d > maxD) { maxD = d; idx = i; }
    }
    if (maxD > tol && idx > 0) { keep[idx] = 1; stack.push([s, idx], [idx, e]); }
  }
  return points.filter((_, i) => keep[i]);
}

export function bounds(points) {
  let minLat = 90, maxLat = -90, minLon = 180, maxLon = -180;
  for (const p of points) {
    if (p[0] < minLat) minLat = p[0]; if (p[0] > maxLat) maxLat = p[0];
    if (p[1] < minLon) minLon = p[1]; if (p[1] > maxLon) maxLon = p[1];
  }
  return { minLat, maxLat, minLon, maxLon };
}

/** Fit the route into a w×h box (equirectangular, aspect-correct). Returns [[x,y],...] */
export function normalizeRoute(points, w, h, pad = 12) {
  if (!points.length) return [];
  const b = bounds(points);
  const k = Math.cos(rad((b.minLat + b.maxLat) / 2));
  const spanX = Math.max(1e-9, (b.maxLon - b.minLon) * k), spanY = Math.max(1e-9, b.maxLat - b.minLat);
  const s = Math.min((w - 2 * pad) / spanX, (h - 2 * pad) / spanY);
  const ox = (w - spanX * s) / 2, oy = (h - spanY * s) / 2;
  return points.map((p) => [ox + (p[1] - b.minLon) * k * s, oy + (b.maxLat - p[0]) * s]);
}

// ---- Web-Mercator tile maths (OpenStreetMap "slippy map") ----
export const TILE = 256;
export function lonLatToWorld(lon, lat, z) {
  const n = TILE * 2 ** z;
  const x = ((lon + 180) / 360) * n;
  const s = Math.sin(rad(Math.max(-85.0511, Math.min(85.0511, lat))));
  const y = (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * n;
  return [x, y];
}
export function worldToLonLat(x, y, z) {
  const n = TILE * 2 ** z;
  const lon = (x / n) * 360 - 180;
  const lat = (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / n))) * 180) / Math.PI;
  return [lon, lat];
}
/** Largest integer zoom at which the bounds fit inside w×h (with padding). */
export function fitZoom(b, w, h, pad = 40, maxZ = 18) {
  for (let z = maxZ; z >= 2; z--) {
    const [x1, y1] = lonLatToWorld(b.minLon, b.maxLat, z);
    const [x2, y2] = lonLatToWorld(b.maxLon, b.minLat, z);
    if (x2 - x1 <= w - 2 * pad && y2 - y1 <= h - 2 * pad) return z;
  }
  return 2;
}

export function toGPX(act) {
  const esc = (s) => String(s).replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));
  const pts = act.points.map((p) => `      <trkpt lat="${p[0].toFixed(6)}" lon="${p[1].toFixed(6)}">${p[3] != null ? `<ele>${p[3].toFixed(1)}</ele>` : ''}<time>${new Date(p[2]).toISOString()}</time></trkpt>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="Cosmic X" xmlns="http://www.topografix.com/GPX/1/1">\n  <trk><name>${esc(act.name)}</name><type>walking</type>\n    <trkseg>\n${pts}\n    </trkseg>\n  </trk>\n</gpx>\n`;
}

export function defaultName(ts = Date.now()) {
  const h = new Date(ts).getHours();
  return `${h < 5 ? 'Night' : h < 12 ? 'Morning' : h < 17 ? 'Afternoon' : h < 21 ? 'Evening' : 'Night'} Walk`;
}
