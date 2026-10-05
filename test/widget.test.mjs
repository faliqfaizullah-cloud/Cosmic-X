import assert from 'node:assert/strict';
globalThis.localStorage = { getItem: () => null, setItem() {} };
const { routeFlat, buildWidgetState, startWidgetSync } = await import('../www/js/widget.js');
let n = 0; const t = (name, fn) => { fn(); n++; console.log('ok  -', name); };

const pts = Array.from({ length: 2000 }, (_, i) => [3.139 + i * 0.00002, 101.687 + Math.sin(i / 90) * 0.002, 1.7e12 + i * 2000, 20]);
const fakeTracker = (state, extra = {}) => ({ state, startedAt: new Date(2026, 9, 5, 7).getTime(), snap: { state, distance: 3420, elapsed: 2470, avgPace: 722, points: pts, ...extra } });
const last = { name: 'Evening Walk', distance: 6400, elapsed: 5000, moving: 4800, points: pts };

t('routeFlat: ≤ 80 points, interleaved x/y, all within 0..1', () => {
  const r = routeFlat(pts); assert.ok(r.length >= 4 && r.length <= 160 && r.length % 2 === 0, `len ${r.length}`);
  assert.ok(r.every((v) => v >= 0 && v <= 1)); assert.deepEqual(routeFlat([]), []); assert.deepEqual(routeFlat([[1, 1, 1, 1]]), []);
});
t('live walk state is formatted like the in-app widget', () => {
  const s = buildWidgetState(fakeTracker('recording'), last);
  assert.equal(s.state, 'recording'); assert.equal(s.name, 'Morning Walk'); assert.equal(s.distance, '3.42');
  assert.equal(s.time, '41:10'); assert.equal(s.pace, '12:02'); assert.ok(s.route.length > 4);
});
t('idle shows the latest saved walk; empty install shows a neutral card', () => {
  const s = buildWidgetState(fakeTracker('idle'), last);
  assert.equal(s.state, 'idle'); assert.equal(s.name, 'Evening Walk'); assert.equal(s.distance, '6.40'); assert.equal(s.time, '83:20');
  assert.deepEqual(buildWidgetState(fakeTracker('idle', { points: [] }), null), { state: 'idle', name: 'Cosmic X', distance: '0.00', time: '0:00', pace: '--:--', route: [] });
});
t('sync pushes to the native plugin, skips identical payloads, and no-ops without the plugin', async () => {
  const calls = []; const ev = new EventTarget(); const acts = Object.assign(new EventTarget(), { list: [last] });
  const tr = Object.assign(ev, { state: 'idle', startedAt: 0, snap: { state: 'idle', points: [] } });
  const h = startWidgetSync(tr, acts, { plugin: () => ({ update: (s) => { calls.push(s); return Promise.resolve(); } }) });
  assert.equal(calls.length, 1); h.push(); assert.equal(calls.length, 1, 'identical payload skipped');
  acts.list = [{ ...last, distance: 7000 }]; h.push(); assert.equal(calls.length, 2);
  h.stop();
  const none = startWidgetSync(tr, acts, { plugin: () => null }); assert.equal(none.push(), null); none.stop();
});
console.log(`\n${n} widget tests passed`); process.exit(0);
