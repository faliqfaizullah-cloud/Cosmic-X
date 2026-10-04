// Tiny on-device "prompt" understanding for the Ask screen (no network, no AI service).
// Turns phrases like "show me the weather analytics today" into an app action.

export function parseTime(text) {
  let m = text.match(/\b(\d{1,2})[:.](\d{2})\s*(am|pm)?\b/i);
  let h, mi, ap;
  if (m) { h = +m[1]; mi = +m[2]; ap = m[3]; }
  else {
    m = text.match(/\b(\d{1,2})\s*(am|pm)\b/i);
    if (!m) return null;
    h = +m[1]; mi = 0; ap = m[2];
  }
  ap = ap?.toLowerCase();
  if (ap === 'pm' && h < 12) h += 12;
  if (ap === 'am' && h === 12) h = 0;
  if (h > 23 || mi > 59) return null;
  return `${String(h).padStart(2, '0')}:${String(mi).padStart(2, '0')}`;
}

const RULES = [
  { re: /\b(alarm|alarms|wake me|clock)\b/, view: 'alarm' },
  { re: /\b(moon|lunar|phase|phases)\b/, view: 'moon' },
  { re: /\b(weather|analytic|analytics|temperature|forecast|uv|humidity|rain|sunrise|sunset)\b/, view: 'analytics' },
  { re: /\b(metric|metrics|battery|stats|statistics|listening time)\b/, view: 'metrics' },
  { re: /\b(setting|settings|haptic|haptics|preferences)\b/, view: 'settings' },
  { re: /\b(queue|up next)\b/, view: 'queue' },
  { re: /\b(library|favorites?|albums?|songs)\b/, view: 'library' },
  { re: /\b(data|overview|dashboard)\b/, view: 'data' },
];
const TITLES = { alarm: 'Alarm', moon: 'Moon', analytics: 'Weather Analytics', metrics: 'Metrics', settings: 'Settings', queue: 'Queue', library: 'Library', data: 'Data' };

/** Returns { view, label, create? } or null when the text should just search the music library. */
export function parseIntent(raw) {
  const t = String(raw || '').toLowerCase().trim();
  if (!t) return null;
  const rule = RULES.find((r) => r.re.test(t));
  if (!rule) return null;
  if (rule.view === 'alarm') {
    const time = parseTime(t);
    const wantsNew = /\b(create|new|add|set|wake me|make)\b/.test(t);
    if (wantsNew && time) return { view: 'alarm', label: `Set an alarm for ${time}`, create: { time } };
    if (wantsNew) return { view: 'alarm', label: 'Create a new alarm', create: { time: null } };
  }
  return { view: rule.view, label: `Open ${TITLES[rule.view]}` };
}
