import { icon } from '../icons.js';
import { stats } from '../stats.js';
import { fmtBytes, fmtTime } from '../util.js';
import { haptic } from '../haptics.js';

function ring(pct, color = '#fff') {
  const r = 34, c = 2 * Math.PI * r, p = Math.max(0, Math.min(1, pct));
  return `<svg class="wr" viewBox="0 0 84 84"><circle cx="42" cy="42" r="${r}" fill="none" stroke="rgba(255,255,255,.2)" stroke-width="8"/>
    <circle cx="42" cy="42" r="${r}" fill="none" stroke="${color}" stroke-width="8" stroke-linecap="round" stroke-dasharray="${(c * p).toFixed(1)} ${c.toFixed(1)}" transform="rotate(-90 42 42)"/></svg>`;
}

export function mount(el, app) {
  const { library } = app;
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
    const today = stats.todaySec();
    const week = stats.last7();
    const mx = Math.max(60, ...week.map((d) => d.sec));
    const conn = navigator.connection;
    el.innerHTML = `<div class="an-scroll"><div class="wgrid">
      <div class="wt m-listen"><div class="wt-h">Listening<span>Today</span></div>
        <div class="w-ring">${ring(today / 3600, '#fff')}<b>${Math.floor(today / 60)}<small>min</small></b></div><div class="w-sub">goal 60 min</div></div>
      <div class="wt m-batt"><div class="wt-h">Battery<span>${m.charging ? 'Charging' : 'Device'}</span></div>
        ${m.battery == null ? '<div class="w-big"><b>—</b></div>' : `<div class="w-ring">${ring(m.battery, '#d7ff2f')}<b>${Math.round(m.battery * 100)}<small>%</small></b></div>`}</div>
      <div class="wt m-lib"><div class="wt-h">Library<span>Songs</span></div>
        <div class="w-big">${icon('note', 22)}<b>${library.songs.length}</b></div><div class="w-sub">${fmtTime(library.totalDuration)} total</div></div>
      <div class="wt m-store"><div class="wt-h">Storage<span>Cosmic X</span></div>
        <div class="w-big"><b>${fmtBytes(library.totalSize)}</b></div>
        <div class="w-bar"><i style="width:${m.quota ? Math.max(3, (m.usage / m.quota) * 100) : 3}%"></i></div></div>
      <div class="wt m-week"><div class="wt-h">Last 7 days<span>listening</span></div>
        <div class="bars">${week.map((d, i) => `<div class="bar ${i === 6 ? 'today' : ''}"><i style="height:${Math.max(4, (d.sec / mx) * 100)}%"></i><span>${d.label}</span></div>`).join('')}</div></div>
    </div>
    <p class="w-note">${navigator.onLine ? 'Online' : 'Offline'}${conn?.effectiveType ? ' · ' + conn.effectiveType.toUpperCase() : ''}</p></div>`;
  }

  render();
  const t = setInterval(render, 15000);
  app.setEdit('Refresh', () => { haptic.press(); render(); });
  return { destroy: () => { alive = false; clearInterval(t); } };
}
