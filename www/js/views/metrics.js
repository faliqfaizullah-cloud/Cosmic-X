import { icon } from '../icons.js';
import { fmtBytes } from '../util.js';
import { fmtKm, fmtDur } from '../track-math.js';
import { haptic } from '../haptics.js';

function ring(pct, color = '#fff') {
  const r = 34, c = 2 * Math.PI * r, p = Math.max(0, Math.min(1, pct));
  return `<svg class="wr" viewBox="0 0 84 84"><circle cx="42" cy="42" r="${r}" fill="none" stroke="rgba(255,255,255,.2)" stroke-width="8"/>
    <circle cx="42" cy="42" r="${r}" fill="none" stroke="${color}" stroke-width="8" stroke-linecap="round" stroke-dasharray="${(c * p).toFixed(1)} ${c.toFixed(1)}" transform="rotate(-90 42 42)"/></svg>`;
}

export function mount(el, app) {
  const { activities, tracker } = app;
  let alive = true;

  async function collect() {
    const out = { battery: null, charging: false, usage: 0, quota: 0 };
    try { const b = await navigator.getBattery?.(); if (b) { out.battery = b.level; out.charging = b.charging; } } catch { /* unsupported */ }
    try { const e = await navigator.storage?.estimate?.(); if (e) { out.usage = e.usage || 0; out.quota = e.quota || 0; } } catch { /* unsupported */ }
    return out;
  }

  async function render() {
    const m = await collect();
    if (!alive) return;
    const week = activities.last7();
    const live = tracker.state === 'idle' ? 0 : tracker.distance;
    const mx = Math.max(2000, ...week.map((d) => d.m));
    const todayM = week[6].m + live;
    const totalTime = activities.list.reduce((n, a) => n + a.elapsed, 0);
    const conn = navigator.connection;
    el.innerHTML = `<div class="an-scroll"><div class="wgrid">
      <div class="wt m-listen"><div class="wt-h">Walked<span>Today</span></div>
        <div class="w-ring">${ring(todayM / 5000, '#fff')}<b>${(todayM / 1000).toFixed(1)}<small>km</small></b></div><div class="w-sub">goal 5 km</div></div>
      <div class="wt m-batt"><div class="wt-h">Battery<span>${m.charging ? 'Charging' : 'Device'}</span></div>
        ${m.battery == null ? '<div class="w-big"><b>—</b></div>' : `<div class="w-ring">${ring(m.battery, '#d7ff2f')}<b>${Math.round(m.battery * 100)}<small>%</small></b></div>`}</div>
      <div class="wt m-lib"><div class="wt-h">Walks<span>All time</span></div>
        <div class="w-big">${icon('route', 22)}<b>${activities.list.length}</b></div><div class="w-sub">${fmtKm(activities.totalDistance)} km · ${fmtDur(totalTime)}</div></div>
      <div class="wt m-store"><div class="wt-h">Storage<span>Cosmic X</span></div>
        <div class="w-big"><b>${fmtBytes(m.usage)}</b></div>
        <div class="w-bar"><i style="width:${m.quota ? Math.max(3, (m.usage / m.quota) * 100) : 3}%"></i></div></div>
      <div class="wt m-week"><div class="wt-h">Last 7 days<span>distance</span></div>
        <div class="bars">${week.map((d, i) => `<div class="bar ${i === 6 ? 'today' : ''}"><i style="height:${Math.max(4, ((d.m + (i === 6 ? live : 0)) / mx) * 100)}%"></i><span>${d.label}</span></div>`).join('')}</div></div>
    </div>
    <p class="w-note">${navigator.onLine ? 'Online' : 'Offline'}${conn?.effectiveType ? ' · ' + conn.effectiveType.toUpperCase() : ''}</p></div>`;
  }

  render();
  const t = setInterval(render, 15000);
  app.setEdit('Refresh', () => { haptic.press(); render(); });
  return { destroy: () => { alive = false; clearInterval(t); } };
}
