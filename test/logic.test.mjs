import assert from 'node:assert/strict';
globalThis.localStorage = { getItem: () => null, setItem() {} };
globalThis.document = { addEventListener() {} };
const { nextOccurrence, describeDays, fmtIn } = await import('../www/js/alarms.js');
const { parseIntent, parseTime } = await import('../www/js/intents.js');
const { sunProgress, normalize } = await import('../www/js/weather.js');
let n = 0; const t = (name, fn) => { fn(); n++; console.log('ok  -', name); };
const at = (s) => new Date(s); // local-time ISO without Z

t('nextOccurrence: later today', () => {
  const d = nextOccurrence({ time: '09:50', days: [] }, at('2026-10-04T08:00:00'));
  assert.equal(d.getDate(), 4); assert.equal(d.getHours(), 9); assert.equal(d.getMinutes(), 50);
});
t('nextOccurrence: already passed -> tomorrow', () => {
  assert.equal(nextOccurrence({ time: '07:00', days: [] }, at('2026-10-04T08:00:00')).getDate(), 5);
});
t('nextOccurrence: weekday filter skips the weekend (2026-10-04 is a Sunday)', () => {
  const d = nextOccurrence({ time: '07:00', days: [1, 2, 3, 4, 5] }, at('2026-10-04T08:00:00'));
  assert.equal(d.getDay(), 1); assert.equal(d.getDate(), 5);
});
t('nextOccurrence: exact current minute counts as passed', () => {
  assert.equal(nextOccurrence({ time: '08:00', days: [] }, at('2026-10-04T08:00:00')).getDate(), 5);
});
t('describeDays / fmtIn', () => {
  assert.equal(describeDays([]), 'Once'); assert.equal(describeDays([0,1,2,3,4,5,6]), 'Every day');
  assert.equal(describeDays([1,2,3,4,5]), 'Weekdays'); assert.equal(describeDays([0,6]), 'Weekends');
  assert.equal(describeDays([1,3]), 'Mon Wed'); assert.equal(fmtIn(125 * 60000), '2h 5m'); assert.equal(fmtIn(30000), '1m');
});
t('parseTime handles 24h, 12h and bare am/pm', () => {
  assert.equal(parseTime('wake me at 6:45'), '06:45'); assert.equal(parseTime('set alarm 7.30 pm'), '19:30');
  assert.equal(parseTime('alarm at 12am'), '00:00'); assert.equal(parseTime('alarm at 12 pm'), '12:00');
  assert.equal(parseTime('alarm at 25:00'), null); assert.equal(parseTime('no time here'), null);
});
t('intents from the original video prompts', () => {
  assert.equal(parseIntent('Show me the weather analytics today').view, 'analytics');
  const c = parseIntent('Create a new application of the alarm clock');
  assert.equal(c.view, 'alarm'); assert.deepEqual(c.create, { time: null });
});
t('intents: create alarm with a time, moon, fallthrough to music search', () => {
  assert.deepEqual(parseIntent('set an alarm at 6:30 am').create, { time: '06:30' });
  assert.equal(parseIntent('when is the next full moon').view, 'moon');
  assert.equal(parseIntent('play daft punk'), null); assert.equal(parseIntent('   '), null);
  assert.equal(parseIntent('open my alarm').create, undefined);
});
t('sunProgress clamps and interpolates', () => {
  const [r, s] = ['2026-10-04T06:00', '2026-10-04T18:00'];
  assert.equal(sunProgress(r, s, '2026-10-04T05:00'), 0); assert.equal(sunProgress(r, s, '2026-10-04T12:00'), 0.5);
  assert.equal(sunProgress(r, s, '2026-10-04T23:00'), 1);
});
t('normalize maps an Open-Meteo payload', () => {
  const j = { current: { temperature_2m: 29.4, apparent_temperature: 33, relative_humidity_2m: 78, cloud_cover: 40, pressure_msl: 1009, wind_speed_10m: 8, uv_index: 7.2, weather_code: 2, is_day: 1, time: '2026-10-04T12:00' },
    daily: { temperature_2m_max: [32], temperature_2m_min: [24], uv_index_max: [10], sunrise: ['2026-10-04T07:10'], sunset: ['2026-10-04T19:10'] },
    hourly: { temperature_2m: [24, 25], uv_index: [0, 1] } };
  const w = normalize(j, 'KL');
  assert.equal(w.temp, 29.4); assert.equal(w.condition, 'Partly cloudy'); assert.equal(w.uvMax, 10); assert.equal(w.place, 'KL');
});
console.log(`\n${n} logic tests passed`);
