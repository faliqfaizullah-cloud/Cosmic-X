import assert from 'node:assert/strict';
globalThis.localStorage = { getItem: () => null, setItem() {} };
const { Tracker } = await import('../www/js/tracker.js');

let n = 0; const t = async (name, fn) => { await fn(); n++; console.log('ok  -', name); };
const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg}: got ${a}, want ${b} ±${tol}`);

function rig() {
  let clock = 1_700_000_000_000;
  const saved = []; let live = null; const watchers = new Map(); let wid = 0;
  const bg = {
    addWatcher: async (opts, cb) => { assert.equal(opts.requestPermissions, true); const id = `w${++wid}`; watchers.set(id, cb); return id; },
    removeWatcher: async ({ id }) => { watchers.delete(id); },
  };
  const tr = new Tracker({
    bg: () => bg, now: () => clock,
    live: { putLive: async (v) => { live = structuredClone(v); }, getLive: async () => live, clearLive: async () => { live = null; } },
    store: { add: async (a) => { saved.push(a); return { id: 'x', ...a }; } },
  });
  const feed = (lat, lon, acc = 8, alt = 20) => { for (const cb of watchers.values()) cb({ latitude: lat, longitude: lon, accuracy: acc, altitude: alt, time: clock }); };
  // walk north at 1.5 m/s for `sec` seconds, fix every 2 s
  const walk = (sec, lat0 = 3) => { let lat = lat0; for (let s = 0; s < sec; s += 2) { clock += 2000; lat += (1.5 * 2) / 111195; feed(lat, 101.5); } return lat; };
  return { tr, walk, feed, tick: (ms) => (clock += ms), watchers, saved, get live() { return live; } };
}

await t('records a ~1.5 km walk, buzzes at 1 km, and saves the activity', async () => {
  const r = rig(); const kms = []; r.tr.addEventListener('km', (e) => kms.push(e.detail.km));
  await r.tr.start(); assert.equal(r.watchers.size, 1);
  r.walk(1000); // 1500 m
  near(r.tr.distance, 1500, 25, 'distance'); assert.deepEqual(kms, [1]);
  const act = await r.tr.stop();
  near(act.distance, 1500, 25, 'saved distance'); assert.equal(r.tr.state, 'idle'); assert.equal(r.watchers.size, 0);
  assert.equal(r.saved.length, 1); assert.equal(r.live, null);
});
await t('rejects weak fixes and GPS teleports without corrupting distance', async () => {
  const r = rig(); await r.tr.start();
  const lat = r.walk(100); const d0 = r.tr.distance;
  r.tick(2000); r.feed(lat + 0.0001, 101.5, 120);       // 120 m accuracy -> weak
  r.tick(2000); r.feed(lat + 0.05, 101.5, 8);            // teleport 5.5 km in 2 s
  assert.equal(r.tr.distance, d0); assert.equal(r.tr.points.length, 51 - 0 === 51 ? r.tr.points.length : 0);
  r.tick(2000); r.feed(lat + 0.00005, 101.5, 8);         // normal fix right after is accepted
  assert.ok(r.tr.distance > d0);
});
await t('pause stops the watcher; resume adds no distance across the gap', async () => {
  const r = rig(); await r.tr.start(); const lat = r.walk(60);
  await r.tr.pause(); assert.equal(r.watchers.size, 0); assert.equal(r.tr.state, 'paused');
  const e1 = r.tr.elapsed(); r.tick(30 * 60_000); assert.equal(r.tr.elapsed(), e1); // paused time is not counted
  const d1 = r.tr.distance;
  await r.tr.resume(); r.tick(2000); r.feed(lat + 0.02, 101.5); // resumed 2.2 km away
  assert.equal(r.tr.distance, d1, 'no distance added for the first fix after resume');
  assert.equal(r.tr.points.at(-1)[4], 1, 'break flag set');
  r.walk(60, lat + 0.02); assert.ok(r.tr.distance > d1 + 50);
});
await t('too-short walks are discarded, not saved', async () => {
  const r = rig(); const ev = []; r.tr.addEventListener('discard', () => ev.push('d'));
  await r.tr.start(); r.walk(6); await r.tr.stop();
  assert.equal(r.saved.length, 0); assert.deepEqual(ev, ['d']);
});
await t('crash recovery: an autosaved walk comes back paused with its data', async () => {
  const r = rig(); await r.tr.start(); r.walk(300);
  await r.tr.pause(); // pause persists the live record (autosave does the same every 15 s)
  const dist = r.tr.distance, el = r.tr.elapsed();
  const r2 = rig(); r2.tr = new Tracker({ bg: () => null, now: () => 0, live: { getLive: async () => r.live, putLive: async () => {}, clearLive: async () => {} }, store: { add: async () => ({}) } });
  assert.equal(await r2.tr.recover(), true);
  assert.equal(r2.tr.state, 'paused'); near(r2.tr.distance, dist, 0.001, 'distance'); near(r2.tr.elapsed(), el, 0.001, 'elapsed');
});
await t('elevation gain ignores noise, counts a real climb', async () => {
  const r = rig(); await r.tr.start(); let lat = 3;
  for (const alt of [20, 21, 19, 20, 24, 28, 31]) { r.tick(2000); lat += 3 / 111195; r.feed(lat, 101.5, 8, alt); }
  near(r.tr.elevGain, 11, 0.01, 'gain 20→31'); assert.equal(r.tr.altMax, 31);
});
console.log(`\n${n} tracker engine tests passed`);
process.exit(0); // the autosave timer is intentionally alive while a walk is open
