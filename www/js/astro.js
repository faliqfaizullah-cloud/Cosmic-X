// Low-precision moon/sun maths (Astronomical Almanac / Meeus style). Good to ~0.3 degrees,
// plenty for a phase dial. Pure functions, no DOM.
const RAD = Math.PI / 180;
const SYNODIC = 29.530588853;
const norm = (d) => ((d % 360) + 360) % 360;
const sin = (d) => Math.sin(d * RAD);
const cos = (d) => Math.cos(d * RAD);

export const julian = (date) => date.getTime() / 86400000 + 2440587.5;

function sunLongitude(T) {
  const M = 357.529 + 35999.05 * T;
  return norm(280.46 + 36000.771 * T + 1.915 * sin(M) + 0.02 * sin(2 * M));
}

function moonEcliptic(T) {
  const lambda = norm(
    218.32 + 481267.881 * T + 6.29 * sin(135.0 + 477198.87 * T) - 1.27 * sin(259.3 - 413335.36 * T) +
      0.66 * sin(235.7 + 890534.22 * T) + 0.21 * sin(269.9 + 954397.74 * T) - 0.19 * sin(357.5 + 35999.05 * T) -
      0.11 * sin(186.5 + 966404.03 * T)
  );
  const beta =
    5.13 * sin(93.3 + 483202.02 * T) + 0.28 * sin(228.2 + 960400.89 * T) - 0.28 * sin(318.3 + 6003.15 * T) -
    0.17 * sin(217.6 - 407332.21 * T);
  const parallax =
    0.9508 + 0.0518 * cos(135.0 + 477198.87 * T) + 0.0095 * cos(259.3 - 413335.36 * T) +
    0.0078 * cos(235.7 + 890534.22 * T) + 0.0028 * cos(269.9 + 954397.74 * T);
  return { lambda, beta, distance: 6378.14 / sin(parallax) };
}

export const PHASES = [
  'New Moon', 'Waxing Crescent', 'First Quarter', 'Waxing Gibbous',
  'Full Moon', 'Waning Gibbous', 'Last Quarter', 'Waning Crescent',
];

/** Everything the Moon screen needs for a given instant and observer. */
export function moonInfo(date, lat = 3.139, lon = 101.687) {
  const jd = julian(date);
  const d = jd - 2451545;
  const T = d / 36525;
  const m = moonEcliptic(T);
  const elong = norm(m.lambda - sunLongitude(T)); // 0 new .. 180 full .. 360
  const age = (elong / 360) * SYNODIC;
  const illumination = (1 - cos(elong)) / 2;
  const phaseIndex = Math.floor(((elong + 22.5) % 360) / 45);

  // ecliptic -> equatorial
  const eps = 23.4393 - 3.563e-7 * d;
  const ra = norm(Math.atan2(sin(m.lambda) * cos(eps) - Math.tan(m.beta * RAD) * sin(eps), cos(m.lambda)) / RAD);
  const dec = Math.asin(sin(m.beta) * cos(eps) + cos(m.beta) * sin(eps) * sin(m.lambda)) / RAD;

  // equatorial -> horizontal for the observer
  const gmst = norm(280.46061837 + 360.98564736629 * d);
  const ha = norm(gmst + lon - ra);
  const altitude = Math.asin(sin(lat) * sin(dec) + cos(lat) * cos(dec) * cos(ha)) / RAD;

  return {
    elongation: elong,
    age,
    illumination,
    waxing: elong < 180,
    phase: PHASES[phaseIndex],
    distanceKm: m.distance,
    altitude,
    ra,
    dec,
  };
}

/** Next date (after `from`) the moon reaches the given elongation (0 = new, 180 = full). Scans hourly then refines. */
export function nextPhase(from, target) {
  const f = (t) => norm(moonInfo(new Date(t)).elongation - target + 180) - 180; // 0 at target, increasing
  let t = from.getTime();
  let prev = f(t);
  for (let i = 0; i < 24 * 31; i++) {
    t += 3600000;
    const cur = f(t);
    if (prev < 0 && cur >= 0) {
      let lo = t - 3600000, hi = t;
      for (let k = 0; k < 20; k++) {
        const mid = (lo + hi) / 2;
        if (f(mid) < 0) lo = mid; else hi = mid;
      }
      return new Date(hi);
    }
    prev = cur;
  }
  return null;
}
