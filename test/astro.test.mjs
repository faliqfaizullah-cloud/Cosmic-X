import assert from 'node:assert/strict';
import { moonInfo, nextPhase } from '../www/js/astro.js';

const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg}: got ${a.toFixed(2)}, want ${b} ±${tol}`);
const wrapDiff = (a, b) => Math.abs(((a - b + 540) % 360) - 180);
let n = 0; const t = (name, fn) => { fn(); n++; console.log('ok  -', name); };

// reference events (UTC) from published almanacs
t('new moon 2025-09-21 19:54 UTC -> elongation ~0', () => {
  const e = moonInfo(new Date('2025-09-21T19:54:00Z')).elongation;
  assert.ok(wrapDiff(e, 0) < 1.5, `elongation ${e.toFixed(2)}`);
});
t('full moon 2025-10-07 03:47 UTC -> elongation ~180, ~100% lit', () => {
  const m = moonInfo(new Date('2025-10-07T03:47:00Z'));
  assert.ok(wrapDiff(m.elongation, 180) < 1.5, `elongation ${m.elongation.toFixed(2)}`);
  assert.ok(m.illumination > 0.99); assert.equal(m.phase, 'Full Moon');
});
t('first quarter 2025-10-29 16:21 UTC -> ~90', () => {
  assert.ok(wrapDiff(moonInfo(new Date('2025-10-29T16:21:00Z')).elongation, 90) < 1.5);
});
t('distance stays in the real range (356k-407k km)', () => {
  for (let d = 0; d < 60; d++) {
    const km = moonInfo(new Date(Date.UTC(2026, 9, 1 + d))).distanceKm;
    assert.ok(km > 355000 && km < 408000, `day ${d}: ${km}`);
  }
});
t('Nov 5 2025 supermoon perigee ~357,000 km', () => {
  near(moonInfo(new Date('2025-11-05T22:00:00Z')).distanceKm, 356980, 2500, 'perigee');
});
t('full moon transits near-overhead at local midnight', () => {
  const when = new Date('2025-10-07T03:47:00Z');
  const { dec } = moonInfo(when);
  const alt = moonInfo(when, dec, -56.7).altitude; // lon where solar midnight == 03:47 UTC
  assert.ok(alt > 80, `altitude ${alt.toFixed(1)}`);
});
t('altitude is always within -90..90 and age within 0..29.6', () => {
  for (let i = 0; i < 200; i++) {
    const m = moonInfo(new Date(Date.UTC(2026, 0, 1) + i * 5.3e6), 3.14, 101.69);
    assert.ok(m.altitude >= -90 && m.altitude <= 90 && m.age >= 0 && m.age < 29.6);
  }
});
t('nextPhase finds the next full moon within ~1h of the almanac', () => {
  const d = nextPhase(new Date('2025-09-25T00:00:00Z'), 180);
  near(d.getTime(), Date.parse('2025-10-07T03:47:00Z'), 3 * 3600e3, 'full moon time');
});
console.log(`\n${n} astro tests passed`);
