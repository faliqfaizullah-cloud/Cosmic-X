import { settings } from './settings.js';
import { native } from './native.js';

// Uses the native Capacitor Haptics plugin when present (real Android haptic engine),
// and falls back to navigator.vibrate in a plain browser.
const plugin = () => native('Haptics');
const STYLE = { light: 'LIGHT', medium: 'MEDIUM', heavy: 'HEAVY' };
const FALLBACK_MS = { light: 8, medium: 16, heavy: 30 };
let last = 0;

function scaled(style) {
  const s = settings.get('hapticStrength');
  if (s === 'soft') return style === 'heavy' ? 'medium' : 'light';
  if (s === 'strong') return style === 'light' ? 'medium' : 'heavy';
  return style;
}
const vib = (p) => { try { navigator.vibrate?.(p); } catch { /* unsupported */ } };

function impact(style = 'light') {
  if (!settings.get('haptics')) return;
  const now = performance.now();
  if (now - last < 28) return; // never machine-gun the motor
  last = now;
  const st = scaled(style);
  const p = plugin();
  if (p?.impact) p.impact({ style: STYLE[st] }).catch(() => vib(FALLBACK_MS[st]));
  else vib(FALLBACK_MS[st]);
}

export const haptic = {
  /** light press feedback for buttons, tiles, orbs */
  tap: () => impact('light'),
  /** a detent: moving between items in Cover Flow, decks, dials */
  tick: () => impact('light'),
  /** primary actions: play/pause, add, switch toggles */
  press: () => impact('medium'),
  /** big moments: orb opening a screen, import finished */
  thud: () => impact('heavy'),
  /** success | warning | error */
  notify(type = 'success') {
    if (!settings.get('haptics')) return;
    const p = plugin();
    const map = { success: 'SUCCESS', warning: 'WARNING', error: 'ERROR' };
    if (p?.notification) p.notification({ type: map[type] }).catch(() => {});
    else vib({ success: [12, 40, 24], warning: [30, 50, 30], error: [40, 40, 40, 40, 60] }[type]);
  },
  /** one pulse of the ringing alarm (called every ~1s while ringing; ignores the on/off setting) */
  alarmPulse() {
    const p = plugin();
    if (p?.vibrate) p.vibrate({ duration: 700 }).catch(() => {});
    else vib([500, 200, 500]);
  },
};
