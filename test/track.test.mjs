import assert from 'node:assert/strict';
import * as m from '../www/js/track-math.js';
let n = 0; const t = (name, fn) => { fn(); n++; console.log('ok  -', name); };
const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg}: got ${a}, want ${b} ±${tol}`);

// a straight walk north along a meridian, 1.5 m/s, 1 fix per 2 s (so ~3 m between fixes)
const walk = (km, speed = 1.5, step = 2, alt = (i) => 10) => {
  const pts = []; const mPerDeg = 111195; const total = km * 1000;
  for (let i = 0, d = 0; d <= total; i++, d += speed * step) pts.push([3 + d / mPerDeg, 101.5, 1_700_000_000_000 + i * step * 1000, alt(i)]);
  return pts;
};

t('haversine: 1 degree of latitude ≈ 111.19 km; same point = 0', () => {
  near(m.haversine(0, 0, 1, 0), 111195, 60, 'lat degree'); assert.equal(m.haversine(3, 101, 3, 101), 0);
});
t('summarize: 2.5 km walk', () => {
  const s = m.summarize(walk(2.5));
  near(s.distance, 2500, 8, 'distance'); assert.equal(s.splits.length, 2);
  near(s.splits[0].sec, 1000 / 1.5, 3, 'split 1 time'); near(s.moving, s.elapsed, 2, 'moving ≈ elapsed');
});
t('summarize: a pause is excluded from elapsed time, distance and the split that spans it', () => {
  const a = walk(1.2, 1.5, 2);
  const gap = 40 * 60_000; // 40 minute stop
  const b = walk(1.2, 1.5, 2).map((p, i) => { const q = [p[0] + 0.01, p[1], p[2] + gap, p[3]]; if (i === 0) q.push(1); return q; });
  const s = m.summarize([...a, ...b]);
  near(s.distance, 2400, 20, 'distance (gap not counted)');
  near(s.elapsed, 2 * (1200 / 1.5), 8, 'elapsed without the pause');
  assert.equal(s.splits.length, 2);
  near(s.splits[1].sec, 1000 / 1.5, 6, 'split 2 spans the pause but excludes it');
});
t('judge: weak accuracy, jitter and GPS jumps are rejected; real movement accepted', () => {
  const prev = [3, 101.5, 1000, 0];
  assert.equal(m.judge(prev, 3.00001, 101.5, 3000, 80).reason, 'weak');
  assert.equal(m.judge(prev, 3.000005, 101.5, 3000, 10).reason, 'still'); // 0.5 m
  assert.equal(m.judge(prev, 3.01, 101.5, 3000, 10).reason, 'jump'); // 1.1 km in 2 s
  assert.equal(m.judge(prev, 3.00005, 101.5, 3000, 10).ok, true); // ~5.5 m in 2 s
  assert.equal(m.judge(prev, 3.00005, 101.5, 500, 10).reason, 'old');
  assert.equal(m.judge(null, 3, 101, 0, 20).ok, true);
});
t('judge on a simulated walk keeps ~all points and total distance within 1%', () => {
  const pts = walk(1); let prev = null, dist = 0;
  for (const p of pts) { const j = m.judge(prev, p[0], p[1], p[2], 8); if (j.ok) { dist += j.d; prev = p; } }
  near(dist, 1000, 15, 'filtered distance');
});
t('elevationGain ignores noise under the threshold', () => {
  assert.equal(m.elevationGain([10, 11, 9, 10.5, 10, 11.5]), 0);
  near(m.elevationGain([10, 14, 18, 15, 22]), 15, 0.01, 'real climbs'); // 10→18 = 8, dip to 15 resets the reference, 15→22 = 7
});
t('formatting matches the design (167:41, 6:16)', () => {
  assert.equal(m.fmtDur(167 * 60 + 41), '167:41'); assert.equal(m.fmtPace(376), '6:16');
  assert.equal(m.fmtPace(NaN), '--:--'); assert.equal(m.fmtKm(29600), '29.60'); assert.equal(m.fmtDur(5), '0:05');
  near(m.paceOf(5000, 1800), 360, 0.01, 'pace');
});
t('calories scale with weight and time', () => {
  assert.equal(m.calories(0, 100), 0);
  const a = m.calories(5000, 3600, 70), b = m.calories(5000, 3600, 90);
  assert.ok(a > 200 && a < 400 && b > a, `${a} ${b}`);
});
t('simplify keeps endpoints and drops collinear points', () => {
  const s = m.simplify(walk(1), 3); assert.equal(s.length, 2);
  const bent = [...walk(0.2), ...walk(0.2).map((p, i) => [p[0], 101.5 + (i * 3) / 111320, p[2] + 1e9, 10])];
  assert.ok(m.simplify(bent, 3).length >= 3);
});
t('normalizeRoute fits inside the box', () => {
  const pts = walk(1).map((p, i) => [p[0], p[1] + Math.sin(i / 30) * 0.001, p[2], 0]);
  const r = m.normalizeRoute(pts, 200, 120, 14);
  assert.ok(r.every(([x, y]) => x >= 13.9 && x <= 186.1 && y >= 13.9 && y <= 106.1));
});
t('tile maths round-trips and matches known tiles', () => {
  const [x, y] = m.lonLatToWorld(101.6869, 3.139, 12);
  const [lon, lat] = m.worldToLonLat(x, y, 12);
  near(lon, 101.6869, 1e-6, 'lon'); near(lat, 3.139, 1e-6, 'lat');
  assert.equal(Math.floor(m.lonLatToWorld(0, 0, 1)[0] / 256), 1); // (0,0) is the corner of 4 tiles at z1
  assert.equal(Math.floor(m.lonLatToWorld(-179.9, 84, 3)[0] / 256), 0);
  assert.equal(Math.floor(m.lonLatToWorld(2.2945, 48.8584, 15)[0] / 256), 16592); // Eiffel Tower tile x (checked against the standard OSM formula)
  assert.equal(Math.floor(m.lonLatToWorld(2.2945, 48.8584, 15)[1] / 256), 11272); // tile y
});
t('fitZoom picks a zoom where the route fits', () => {
  const b = m.bounds(walk(2)); const z = m.fitZoom(b, 360, 500);
  const [x1, y1] = m.lonLatToWorld(b.minLon, b.maxLat, z), [x2, y2] = m.lonLatToWorld(b.maxLon, b.minLat, z);
  assert.ok(x2 - x1 <= 360 && y2 - y1 <= 500 && z >= 12 && z <= 18, `z=${z}`);
});
t('GPX is well-formed and escapes names', () => {
  const g = m.toGPX({ name: 'A & B <walk>', points: walk(0.05) });
  assert.ok(g.includes('A &amp; B &lt;walk&gt;') && g.includes('<trkpt lat="3.000000"') && g.trim().endsWith('</gpx>'));
});
t('default names follow the time of day', () => {
  assert.equal(m.defaultName(new Date(2026, 9, 5, 7).getTime()), 'Morning Walk');
  assert.equal(m.defaultName(new Date(2026, 9, 5, 14).getTime()), 'Afternoon Walk');
  assert.equal(m.defaultName(new Date(2026, 9, 5, 19).getTime()), 'Evening Walk');
});
console.log(`\n${n} tracker tests passed`);
