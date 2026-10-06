import assert from 'node:assert/strict';
const m = await import('../www/js/ui-motion.js');
let n = 0; const t = async (name, fn) => { await fn(); n++; console.log('ok  -', name); };

await t('direction: opening from the menu is forward, returning is back, unknown ids default forward', () => {
  assert.equal(m.direction('menu', 'walk'), 1); assert.equal(m.direction('walk', 'menu'), -1);
  assert.equal(m.direction('moon', 'settings'), 1); assert.equal(m.direction('settings', 'moon'), -1);
  assert.equal(m.direction(null, 'walk'), 1); assert.equal(m.direction('walk', 'walk'), 1); assert.equal(m.direction('x', 'y'), 1);
});
await t('every screen has a three-colour aura of valid hex colours', () => {
  for (const id of m.ORDER) { const a = m.AURA[id]; assert.ok(a && a.length === 3 && a.every((c) => /^#[0-9a-f]{6}$/i.test(c)), id); }
});
await t('applyAura sets --a1..--a3 and falls back to the menu palette', () => {
  const set = {}; const el = { style: { setProperty: (k, v) => (set[k] = v) } };
  m.applyAura(el, 'alarm'); assert.deepEqual([set['--a1'], set['--a2'], set['--a3']], m.AURA.alarm);
  m.applyAura(el, 'nope'); assert.equal(set['--a1'], m.AURA.menu[0]);
});
await t('blurFor: none when slow, grows with speed, capped, symmetric', () => {
  assert.equal(m.blurFor(0), 0); assert.equal(m.blurFor(0.005), 0);
  const a = m.blurFor(0.2), b = m.blurFor(0.5);
  assert.ok(a > 0 && b > a && b <= 7); assert.equal(m.blurFor(10), 7); assert.equal(m.blurFor(-0.5), b);
});
await t('motionBlur applies the filter while moving and clears it when still (and tolerates a missing filter)', () => {
  const attrs = {}; const node = { setAttribute: (k, v) => (attrs[k] = v) };
  globalThis.document = { getElementById: (id) => ({ querySelector: () => node, id }) };
  const target = { style: { filter: '' } };
  const mb = m.motionBlur(target, 'x'); mb(0.5);
  assert.equal(target.style.filter, 'url(#mbx)'); assert.match(attrs.stdDeviation, /^\d+(\.\d)? 0$/);
  mb(0); assert.equal(target.style.filter, '');
  const mby = m.motionBlur(target, 'y'); mby(0.5); assert.match(attrs.stdDeviation, /^0 \d/); assert.equal(target.style.filter, 'url(#mby)');
  globalThis.document = { getElementById: () => null };
  const none = m.motionBlur(target, 'x'); none(1);   // no throw
});
await t('motion blur can be switched off in Settings', async () => {
  const { settings } = await import('../www/js/settings.js');
  const attrs = {}; const node = { setAttribute: (k, v) => (attrs[k] = v) };
  globalThis.document = { getElementById: () => ({ querySelector: () => node }) };
  const target = { style: { filter: '' } }; const mb = m.motionBlur(target, 'x');
  settings.set('motionBlur', false); mb(0.8); assert.equal(target.style.filter, '', 'no blur when disabled');
  settings.set('motionBlur', true); mb(0.8); assert.equal(target.style.filter, 'url(#mbx)');
});
console.log(`\n${n} motion tests passed`);
