import { esc, confirmSheet } from './util.js';
import { activities } from './activities.js';
import { fmtKm, fmtDur, fmtPace, paceOf } from './track-math.js';
import { haptic } from './haptics.js';
import { icon } from './icons.js';

const fmtDate = (ms) => new Date(ms).toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

/** Bottom sheet with an activity's stats + splits. Used by the history list and landscape Cover Flow. */
export function openActivitySheet(app, act, { onMap = true } = {}) {
  const t = act.moving || act.elapsed;
  const best = act.splits?.length ? Math.min(...act.splits.map((s) => s.sec)) : null;
  const root = document.createElement('div');
  root.className = 'sheet-wrap';
  root.innerHTML = `<div class="sheet act-sheet">
    <h3>${esc(act.name)}</h3>
    <p class="act-when">${fmtDate(act.start)}</p>
    <div class="act-grid">
      <div><b>${fmtKm(act.distance)}</b><span>km</span></div>
      <div><b>${fmtDur(act.elapsed)}</b><span>time</span></div>
      <div><b>${fmtPace(paceOf(act.distance, t))}</b><span>pace /km</span></div>
      <div><b>${Math.round(act.elevGain)}</b><span>m climb</span></div>
      <div><b>${act.kcal}</b><span>kcal</span></div>
      <div><b>${Math.round(act.distance / 0.75).toLocaleString('en-US')}</b><span>≈ steps</span></div>
    </div>
    ${act.splits?.length ? `<div class="act-splits"><div class="act-sh">Splits</div>${act.splits.map((s) => `
      <div class="split ${s.sec === best ? 'best' : ''}"><span>${s.km}</span><i><u style="width:${Math.max(12, (best / s.sec) * 100)}%"></u></i><b>${fmtDur(s.sec)}</b></div>`).join('')}</div>` : ''}
    <div class="sheet-row wrap">
      ${onMap ? `<button class="sheet-btn primary" data-a="map">${icon('pin', 16)} Map</button>` : ''}
      <button class="sheet-btn" data-a="gpx">Copy GPX</button>
      <button class="sheet-btn danger" data-a="del">Delete</button>
    </div></div>`;
  root.addEventListener('click', async (e) => {
    const a = e.target.closest('[data-a]')?.dataset.a;
    if (e.target === root) return root.remove();
    if (a === 'map') { root.remove(); app.go('map', { id: act.id }); }
    if (a === 'gpx') {
      try { await navigator.clipboard.writeText(activities.gpx(act.id)); haptic.notify('success'); app.toast('GPX copied · paste it into Strava, Komoot or a file'); }
      catch { app.toast('Could not copy GPX on this device'); }
    }
    if (a === 'del') {
      root.remove();
      if (await confirmSheet({ title: 'Delete this walk?', message: `${act.name} · ${fmtKm(act.distance)} km`, confirm: 'Delete' })) {
        await activities.remove(act.id);
        haptic.notify('warning');
      }
    }
  });
  document.body.append(root);
}
