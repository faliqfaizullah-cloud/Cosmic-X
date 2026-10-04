import { icon } from '../icons.js';
import { fetchWeather, cachedWeather, getCoords, locate, sunProgress, uvLabel } from '../weather.js';
import { haptic } from '../haptics.js';
import { esc } from '../util.js';

const hhmm = (iso) => (iso || '').slice(11, 16);

function ring(pct, color) {
  const r = 34, c = 2 * Math.PI * r, p = Math.max(0, Math.min(1, pct));
  return `<svg class="wr" viewBox="0 0 84 84"><circle cx="42" cy="42" r="${r}" fill="none" stroke="rgba(255,255,255,.2)" stroke-width="8"/>
    <circle cx="42" cy="42" r="${r}" fill="none" stroke="${color}" stroke-width="8" stroke-linecap="round" stroke-dasharray="${(c * p).toFixed(1)} ${c.toFixed(1)}" transform="rotate(-90 42 42)"/></svg>`;
}

function sunArc(p) {
  // half-circle track with the sun dot positioned along it
  const a = Math.PI * (1 - p), x = 50 + 40 * Math.cos(a), y = 50 - 40 * Math.sin(a);
  return `<svg class="warc" viewBox="0 0 100 56"><path d="M10 50 A40 40 0 0 1 90 50" fill="none" stroke="rgba(255,255,255,.28)" stroke-width="2" stroke-dasharray="2 4" stroke-linecap="round"/>
    <circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="5.5" fill="#fff"/><circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="11" fill="rgba(255,255,255,.25)"/></svg>`;
}

function spark(vals, nowIdx) {
  const v = vals.slice(0, 24);
  const mn = Math.min(...v), mx = Math.max(...v), span = mx - mn || 1;
  const pts = v.map((t, i) => `${(i / (v.length - 1)) * 200},${50 - ((t - mn) / span) * 40 - 5}`);
  const [nx, ny] = pts[Math.min(nowIdx, pts.length - 1)].split(',');
  return `<svg class="wsp" viewBox="0 0 200 56" preserveAspectRatio="none"><polyline points="${pts.join(' ')}" fill="none" stroke="#fff" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"/></svg>
    <i class="wdot" style="left:${(nx / 200) * 100}%;top:${(ny / 56) * 100}%"></i>`;
}

export function mount(el, app) {
  let alive = true;
  let busy = false;

  function tiles(w, note) {
    const sun = sunProgress(w.sunrise, w.sunset, w.time);
    const nowIdx = +(w.time || '').slice(11, 13) || 0;
    return `<div class="wgrid">
      <div class="wt w-weather"><div class="wt-h">Weather<span>Today</span></div>
        <div class="w-temp">${Math.round(w.temp)}°</div><div class="w-cond">${esc(w.condition)} · feels ${Math.round(w.feels)}°</div>
        ${sunArc(sun)}<div class="w-sun"><span>${hhmm(w.sunrise)}</span><span>${hhmm(w.sunset)}</span></div></div>
      <div class="wt w-uv"><div class="wt-h">Light Sensitivity<span>UV index</span></div>
        <div class="w-ring">${ring(w.uv / 11, '#fff')}<b>${w.uv.toFixed(1)}</b></div><div class="w-sub">${uvLabel(w.uv)} · peak ${(w.uvMax ?? 0).toFixed(0)}</div></div>
      <div class="wt w-hum"><div class="wt-h">Humidity<span>Natural</span></div>
        <div class="w-ring">${ring(w.humidity / 100, '#d7ff2f')}<b>${Math.round(w.humidity)}<small>%</small></b></div></div>
      <div class="wt w-wind"><div class="wt-h">Wind<span>km/h</span></div>
        <div class="w-big">${icon('wind', 22)}<b>${Math.round(w.wind)}</b></div>
        <div class="w-bar"><i style="width:${Math.min(100, (w.wind / 60) * 100)}%"></i></div></div>
      <div class="wt w-press"><div class="wt-h">Pressure<span>hPa</span></div>
        <div class="w-big"><b>${Math.round(w.pressure)}</b></div>
        <div class="w-bar"><i style="width:${Math.max(4, Math.min(100, ((w.pressure - 980) / 60) * 100))}%"></i></div></div>
      <div class="wt w-cloud"><div class="wt-h">Luminosity<span>Cloud cover</span></div>
        <div class="w-ring">${ring(1 - w.cloud / 100, '#fff')}<b>${Math.round(100 - w.cloud)}<small>%</small></b></div><div class="w-sub">clear sky</div></div>
      <div class="wt w-hourly"><div class="wt-h">Today<span>${Math.round(w.lo)}° – ${Math.round(w.hi)}°</span></div>
        <div class="w-spark">${spark(w.hourlyTemp, nowIdx)}</div>
        <div class="w-axis"><span>00</span><span>06</span><span>12</span><span>18</span><span>24</span></div></div>
    </div>${note ? `<p class="w-note">${note}</p>` : ''}`;
  }

  async function load() {
    if (busy) return;
    busy = true;
    el.querySelector('.an-scroll')?.classList.add('loading');
    const coords = getCoords();
    let html;
    try {
      const { data } = await fetchWeather(coords);
      html = tiles(data, `${icon('pin', 12)} ${esc(data.place)} · updated ${new Date().toTimeString().slice(0, 5)}`);
      haptic.notify('success');
    } catch {
      const c = cachedWeather();
      if (c) { html = tiles(c.data, `Offline · showing saved data from ${new Date(c.at).toTimeString().slice(0, 5)}`); haptic.notify('warning'); }
      else {
        html = `<div class="empty"><div class="empty-ic">${icon('sun', 38)}</div><h2>No connection</h2><p>Weather analytics need internet the first time. Try again when you're online.</p></div>`;
        haptic.notify('error');
      }
    }
    busy = false;
    if (!alive) return;
    el.innerHTML = `<div class="an-scroll">${html}</div>`;
  }

  el.innerHTML = `<div class="an-scroll loading"><div class="wgrid skel">${'<div class="wt"></div>'.repeat(6)}</div></div>`;
  load();
  app.setEdit('Locate', async () => {
    haptic.press();
    app.toast('Finding your location…');
    await locate({ timeout: 8000 });
    load();
  });
  app.setAdd(() => { haptic.press(); load(); }, 'refresh');
  return { destroy: () => { alive = false; } };
}
