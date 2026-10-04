import { settings } from './settings.js';

const DEFAULT = { lat: 3.139, lon: 101.687, place: 'Kuala Lumpur' }; // used until the phone shares its location
const CACHE = 'cx.weather.v1';

export function getCoords() {
  const lat = settings.get('lat'), lon = settings.get('lon');
  if (lat != null && lon != null) return { lat, lon, place: settings.get('place') || 'Your location' };
  return DEFAULT;
}

/** Ask the phone for its location once; remembers it. Resolves with coords either way. */
export function locate({ timeout = 6000 } = {}) {
  return new Promise((resolve) => {
    if (!navigator.geolocation) return resolve(getCoords());
    navigator.geolocation.getCurrentPosition(
      (p) => {
        settings.set('lat', +p.coords.latitude.toFixed(3));
        settings.set('lon', +p.coords.longitude.toFixed(3));
        settings.set('place', 'Your location');
        resolve(getCoords());
      },
      () => resolve(getCoords()),
      { timeout, maximumAge: 3600e3, enableHighAccuracy: false }
    );
  });
}

export const WMO = (c) => {
  if (c === 0) return 'Clear';
  if (c <= 2) return 'Partly cloudy';
  if (c === 3) return 'Overcast';
  if (c === 45 || c === 48) return 'Fog';
  if (c >= 51 && c <= 57) return 'Drizzle';
  if (c >= 61 && c <= 67) return 'Rain';
  if (c >= 71 && c <= 77) return 'Snow';
  if (c >= 80 && c <= 82) return 'Showers';
  if (c >= 95) return 'Thunderstorm';
  return 'Cloudy';
};

export const uvLabel = (u) => (u < 3 ? 'Low' : u < 6 ? 'Moderate' : u < 8 ? 'High' : u < 11 ? 'Very high' : 'Extreme');

/** Fetch current conditions + today's hourly curve from Open-Meteo (free, no API key). */
export async function fetchWeather({ lat, lon, place } = getCoords()) {
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
    `&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,cloud_cover,pressure_msl,wind_speed_10m,uv_index,is_day` +
    `&hourly=temperature_2m,uv_index&daily=sunrise,sunset,uv_index_max,temperature_2m_max,temperature_2m_min` +
    `&timezone=auto&forecast_days=1`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`weather ${r.status}`);
  const j = await r.json();
  const data = normalize(j, place);
  try { localStorage.setItem(CACHE, JSON.stringify({ at: Date.now(), data })); } catch { /* full */ }
  return { data, stale: false };
}

export function cachedWeather() {
  try {
    const c = JSON.parse(localStorage.getItem(CACHE) || 'null');
    return c ? { data: c.data, stale: true, at: c.at } : null;
  } catch { return null; }
}

export function normalize(j, place = '') {
  const c = j.current, d = j.daily;
  return {
    place,
    temp: c.temperature_2m,
    feels: c.apparent_temperature,
    humidity: c.relative_humidity_2m,
    cloud: c.cloud_cover,
    pressure: c.pressure_msl,
    wind: c.wind_speed_10m,
    uv: c.uv_index ?? 0,
    code: c.weather_code,
    isDay: !!c.is_day,
    condition: WMO(c.weather_code),
    hi: d.temperature_2m_max[0],
    lo: d.temperature_2m_min[0],
    uvMax: d.uv_index_max[0],
    sunrise: d.sunrise[0],
    sunset: d.sunset[0],
    hourlyTemp: j.hourly.temperature_2m,
    hourlyUv: j.hourly.uv_index,
    time: c.time,
  };
}

/** 0..1 position of the sun between sunrise and sunset (clamped), from ISO local strings. */
export function sunProgress(sunrise, sunset, nowLocalIso) {
  const a = Date.parse(sunrise), b = Date.parse(sunset), n = Date.parse(nowLocalIso);
  if (!isFinite(a) || !isFinite(b) || !isFinite(n)) return 0;
  return Math.min(1, Math.max(0, (n - a) / (b - a)));
}

/** Ask for the phone's location at most once per install (so screens never nag). */
export async function ensureLocation() {
  if (settings.get('lat') != null) return getCoords();
  let asked = false;
  try { asked = localStorage.getItem('cx.askedLoc') === '1'; localStorage.setItem('cx.askedLoc', '1'); } catch { /* ignore */ }
  return asked ? getCoords() : locate();
}
