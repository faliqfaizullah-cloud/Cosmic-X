import { native } from './native.js';
import { simplify, normalizeRoute, fmtKm, fmtDur, fmtPace, paceOf, defaultName } from './track-math.js';
import { listen } from './util.js';
import { settings } from './settings.js';

// Route box used by the native widget (WalkWidgetProvider.drawRoute fits a 2.4:1 box)
const RW = 480, RH = 200;

/** Flat [x0,y0,x1,y1,...] in 0..1, at most `max` points, for the home-screen widget. */
export function routeFlat(points, max = 80) {
  if (!points || points.length < 2) return [];
  let tol = 6, pts = simplify(points, tol);
  while (pts.length > max && tol < 400) { tol *= 1.6; pts = simplify(points, tol); }
  const out = [];
  for (const [x, y] of normalizeRoute(pts, RW, RH, 14)) out.push(+(x / RW).toFixed(3), +(y / RH).toFixed(3));
  return out;
}

/** The snapshot of state the native widget draws: live walk if one is active, otherwise the latest walk. */
export function buildWidgetState(tracker, lastAct) {
  const s = tracker.snap;
  if (s.state !== 'idle') {
    return { state: s.state, name: defaultName(tracker.startedAt), distance: fmtKm(s.distance), time: fmtDur(s.elapsed), pace: fmtPace(s.avgPace), route: routeFlat(s.points) };
  }
  if (lastAct) {
    return {
      state: 'idle', name: lastAct.name, distance: fmtKm(lastAct.distance), time: fmtDur(lastAct.elapsed),
      pace: fmtPace(paceOf(lastAct.distance, lastAct.moving || lastAct.elapsed)), route: routeFlat(lastAct.points),
    };
  }
  return { state: 'idle', name: 'Cosmic X', distance: '0.00', time: '0:00', pace: '--:--', route: [] };
}

/**
 * Keeps the home-screen widget in sync. Pushes on every state change / saved walk, and every few
 * seconds while recording (time keeps moving between GPS fixes). Skips identical payloads.
 */
export function startWidgetSync(tracker, activities, { plugin = () => native('CosmicWidget') } = {}) {
  let lastJson = '';
  const push = () => {
    const p = plugin();
    if (!p?.update) return null;
    const state = { ...buildWidgetState(tracker, activities.list[0]), theme: settings.get('widgetTheme') };
    const json = JSON.stringify(state);
    if (json === lastJson) return state;
    lastJson = json;
    Promise.resolve(p.update(state)).catch(() => { lastJson = ''; });
    return state;
  };
  listen(tracker, 'state', push);
  listen(activities, 'change', push);
  settings.on((k) => k === 'widgetTheme' && push());
  const timer = setInterval(() => tracker.state === 'recording' && push(), 5000);
  push();
  return { push, stop: () => clearInterval(timer) };
}
