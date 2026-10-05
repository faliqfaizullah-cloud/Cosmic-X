import { icon } from '../icons.js';
import { activities } from '../activities.js';
import { routeCard } from '../route-art.js';
import { openActivitySheet } from '../activity-sheet.js';
import { fmtKm, fmtDur, fmtPace, paceOf } from '../track-math.js';
import { esc, listen } from '../util.js';

const when = (ms) => new Date(ms).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });

export function mount(el, app) {
  const offs = [];

  function render() {
    const list = activities.list;
    if (!list.length) {
      el.innerHTML = `<div class="empty"><div class="empty-ic">${icon('route', 40)}</div><h2>No walks yet</h2>
        <p>Record your first walk and it will appear here with its route, splits and pace.</p>
        <button class="cta" data-start>Start a walk</button></div>`;
      return;
    }
    const wk = activities.last7().reduce((n, d) => n + d.m, 0);
    el.innerHTML = `<div class="hist">
      <div class="hist-top">
        <div><b>${fmtKm(activities.totalDistance)}</b><span>km total</span></div>
        <div><b>${fmtKm(wk)}</b><span>km this week</span></div>
        <div><b>${list.length}</b><span>${list.length === 1 ? 'walk' : 'walks'}</span></div>
      </div>
      <div class="hist-list">${list.map((a) => `<button class="hrow" data-id="${a.id}">
        <img alt="" src="${routeCard(a, { size: 180 })}">
        <span class="hrow-meta"><b>${esc(a.name)}</b><span>${when(a.start)} · ${fmtDur(a.elapsed)} · ${fmtPace(paceOf(a.distance, a.moving || a.elapsed))}/km</span></span>
        <span class="hrow-km">${fmtKm(a.distance)}<small>km</small></span></button>`).join('')}</div></div>`;
  }

  el.addEventListener('click', (e) => {
    if (e.target.closest('[data-start]')) return app.go('walk', { _start: true });
    const r = e.target.closest('.hrow');
    if (r) openActivitySheet(app, activities.byId.get(r.dataset.id));
  });
  offs.push(listen(activities, 'change', render));
  render();
  app.setEdit('Walk', () => app.go('walk'));
  return { destroy: () => offs.forEach((f) => f()) };
}
