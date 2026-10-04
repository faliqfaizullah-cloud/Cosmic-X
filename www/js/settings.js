const KEY = 'cx.settings.v1';
const defaults = {
  sprinkles: true,
  density: 'med', // low | med | high
  reflection: true,
  reactive: false, // routes audio through Web Audio for beat-reactive sprinkles
  sort: 'artist', // artist | title | recent
  shuffle: false,
  repeat: 'off', // off | all | one
  haptics: true,
  hapticStrength: 'normal', // soft | normal | strong
  lat: null,
  lon: null,
  place: '',
};
const data = { ...defaults };
try {
  Object.assign(data, JSON.parse(localStorage.getItem(KEY) || '{}'));
} catch { /* ignore */ }

const subs = new Set();
export const settings = {
  get: (k) => data[k],
  set(k, v) {
    data[k] = v;
    try { localStorage.setItem(KEY, JSON.stringify(data)); } catch { /* ignore */ }
    subs.forEach((f) => f(k, v));
  },
  on(fn) {
    subs.add(fn);
    return () => subs.delete(fn);
  },
};
