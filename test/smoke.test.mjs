// Mounts every screen against a permissive stub DOM, with the real tracker/activities/alarms logic,
// to catch ReferenceErrors / TypeErrors that `node --check` cannot see.
import assert from 'node:assert/strict';

const stub = () => new Proxy(function () {}, {
  get: (t, k) => {
    if (k === Symbol.toPrimitive) return () => '';
    if (k === 'classList') return { toggle() {}, add() {}, remove() {}, contains: () => false };
    if (k === 'style') return new Proxy({}, { get: (_, p) => (p === 'setProperty' || p === 'removeProperty' ? () => {} : ''), set: () => true });
    if (k === 'dataset') return {};
    if (k === 'length') return 0;
    if (k === 'then') return undefined;
    if (['clientWidth', 'clientHeight', 'offsetHeight', 'offsetWidth'].includes(k)) return 360;
    if (k === 'getBoundingClientRect') return () => ({ left: 0, top: 0, width: 360, height: 640 });
    if (k === 'closest' || k === 'matches') return () => null;
    if (k === 'querySelectorAll') return () => [];
    if (k === 'getContext') return () => stub();
    if (k === 'toDataURL') return () => 'data:image/jpeg;base64,AAAA';
    if (k in t) return t[k];
    return stub();
  },
  set: () => true,
  apply: () => stub(),
  has: () => true,
});
const store = new Map();
Object.assign(globalThis, {
  localStorage: { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)) },
  document: Object.assign(stub(), { createElement: () => stub(), addEventListener() {}, hidden: false, body: stub(), documentElement: stub(), querySelector: () => stub() }),
  ResizeObserver: class { observe() {} disconnect() {} },
  matchMedia: () => ({ matches: false }), devicePixelRatio: 2, innerWidth: 360, innerHeight: 740,
  addEventListener() {},
  Image: class { set src(v) {} },
  fetch: async () => { throw new Error('offline'); },
  requestAnimationFrame: () => 0, cancelAnimationFrame() {},
});
Object.defineProperty(globalThis, 'navigator', { value: { geolocation: undefined, storage: {}, onLine: false, clipboard: {} }, configurable: true });

const { tracker } = await import('../www/js/tracker.js');
const { activities } = await import('../www/js/activities.js');
const { alarms } = await import('../www/js/alarms.js');
const { CoverFlow } = await import('../www/js/coverflow.js');

const calls = [];
const app = { activities, tracker, toast: () => {}, go: (...a) => calls.push(a), setTitle() {}, setEdit() {}, setAdd() {}, settings: { get: () => null } };

// give the app some data so list/detail branches render too
const pts = Array.from({ length: 60 }, (_, i) => [3.139 + i * 0.0001, 101.687 + Math.sin(i / 8) * 0.0004, 1.7e12 + i * 2000, 20 + (i % 9)]);
activities.list = [
  { id: '1', name: 'Morning Walk', type: 'Walk', start: 1.7e12, end: 1.7e12 + 120000, elapsed: 120, moving: 110, distance: 1850, elevGain: 12, kcal: 95, splits: [{ km: 1, sec: 600 }], points: pts },
  { id: '2', name: 'Evening Walk', type: 'Walk', start: 1.69e12, end: 1.69e12 + 5000, elapsed: 5000, moving: 4800, distance: 6400, elevGain: 40, kcal: 400, splits: [], points: pts },
];
activities.byId = new Map(activities.list.map((a) => [a.id, a]));
alarms.list = [{ id: 'a', n: 1, time: '07:30', label: 'Wake', days: [1, 2, 3], enabled: true }];

let n = 0;
for (const v of ['walk', 'activities', 'menu', 'metrics', 'data', 'settings', 'search', 'moon', 'analytics', 'alarm', 'map']) {
  const mod = await import(`../www/js/views/${v}.js`);
  const inst = mod.mount(stub(), app, v === 'map' ? { id: '1' } : {});
  await new Promise((r) => setTimeout(r, 30));
  inst?.destroy?.();
  n++; console.log('ok  - mounted', v);
}
// live map + walking states for the walk widget
tracker.state = 'recording'; tracker.points = pts; tracker.distance = 1850; tracker.alt = 25; tracker.altMin = 20; tracker.altMax = 30; tracker.last = { lat: 3.14, lon: 101.69, t: 1, acc: 8 };
for (const v of ['walk', 'menu', 'data', 'metrics']) { const m = await import(`../www/js/views/${v}.js`); m.mount(stub(), app, {})?.destroy?.(); n++; console.log('ok  - mounted', v, '(recording)'); }
(await import('../www/js/views/map.js')).mount(stub(), app, {})?.destroy?.(); n++; console.log('ok  - mounted live map');

const cf = new CoverFlow(stub(), app);
cf.active = true; cf.W = 800; cf.H = 300; cf.size = 180; cf.refresh(); cf.layout(); cf.render(0.4); cf.render(1.7);
n++; console.log('ok  - cover flow renders (activities)');
const { routeCard } = await import('../www/js/route-art.js');
assert.ok(routeCard(activities.list[0]).startsWith('data:')); assert.ok(routeCard(null, { seed: 3 }).startsWith('data:'));
n++; console.log('ok  - route cards render');
console.log(`\n${n} smoke checks passed`);
process.exit(0);
