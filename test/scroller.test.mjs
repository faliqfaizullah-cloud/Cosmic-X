import assert from 'node:assert/strict';
let t = 0, q = [];
globalThis.performance = { now: () => t };
globalThis.requestAnimationFrame = (f) => (q.push(f), q.length);
globalThis.cancelAnimationFrame = () => { q = []; };
const { Scroller } = await import('../www/js/scroller.js');
const frames = (n) => { for (let i = 0; i < n && q.length; i++) { t += 16.667; const f = q.shift(); f(t); } return n; };

const seen = [];
const sc = new Scroller({ min: 0, max: 20, onUpdate: (p) => seen.push(p) });
sc.to(7);
let n = 0; while (q.length && n < 600) { frames(1); n++; }
assert.equal(sc.pos, 7, 'settles exactly on target');
assert.ok(n < 120, `settles in ${n} frames (<2s)`);
assert.ok(Math.max(...seen) < 7.05, 'overshoot is small: ' + Math.max(...seen).toFixed(2));

// fling right with velocity, lands on a valid integer inside range
sc.dragging = true; sc.dragTo(7); sc.release(0.02);
n = 0; while (q.length && n < 600) { frames(1); n++; }
assert.ok(Number.isInteger(sc.pos) && sc.pos >= 0 && sc.pos <= 20, 'fling lands on an item: ' + sc.pos);

// clamps at the ends
sc.to(999); while (q.length) frames(1); assert.equal(sc.pos, 20);
sc.to(-5); while (q.length) frames(1); assert.equal(sc.pos, 0);
console.log('scroller: all checks passed');
