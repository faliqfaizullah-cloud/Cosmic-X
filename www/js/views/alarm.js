import { icon } from '../icons.js';
import { alarms, describeDays, fmtIn, pad } from '../alarms.js';
import { haptic } from '../haptics.js';
import { esc, listen, confirmSheet } from '../util.js';

const D = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

export function mount(el, app, params = {}) {
  const offs = [];

  function render() {
    const nx = alarms.next();
    const big = nx ? nx.alarm.time : '--:--';
    const sub = nx ? `${nx.alarm.label ? esc(nx.alarm.label) + ' · ' : ''}in ${fmtIn(nx.at - Date.now())}` : 'No alarm is on';
    el.innerHTML = `<div class="al">
      <div class="al-card">
        <div class="al-head"><div class="np-h1" style="color:#04210f">Alarm</div><div class="al-sub">${sub}</div></div>
        <div class="al-big">${big}</div>
        <div class="al-ticks"></div>
      </div>
      <div class="al-list">${
        alarms.list.length
          ? alarms.list.map((a) => `<div class="al-row ${a.enabled ? '' : 'off'}" data-id="${a.id}" role="button" tabindex="0">
              <div class="al-time">${a.time}</div>
              <div class="al-meta"><b>${esc(a.label || 'Alarm')}</b><span>${describeDays(a.days)}</span></div>
              <button class="sw ${a.enabled ? 'on' : ''}" data-sw="${a.id}" role="switch" aria-checked="${a.enabled}" aria-label="Enable alarm"><i></i></button>
            </div>`).join('')
          : `<div class="empty small"><div class="empty-ic">${icon('bell', 30)}</div><h2>No alarms yet</h2><p>Tap + to create your first alarm.</p></div>`
      }</div></div>`;
  }

  async function openEditor(alarm, presetTime) {
    const days = new Set(alarm ? alarm.days : []);
    const root = document.createElement('div');
    root.className = 'sheet-wrap';
    root.innerHTML = `<div class="sheet ed">
      <h3>${alarm ? 'Edit alarm' : 'New alarm'}</h3>
      <input class="ed-time" type="time" value="${alarm ? alarm.time : presetTime || '07:00'}">
      <input class="ed-label" type="text" maxlength="40" placeholder="Label (optional)" value="${esc(alarm?.label || '')}">
      <div class="ed-days">${D.map((d, i) => `<button class="${days.has(i) ? 'on' : ''}" data-d="${i}">${d}</button>`).join('')}</div>
      <p class="ed-hint" data-hint></p>
      <div class="sheet-row">
        ${alarm ? '<button class="sheet-btn danger" data-act="del">Delete</button>' : '<button class="sheet-btn" data-act="cancel">Cancel</button>'}
        <button class="sheet-btn primary" data-act="save">Save</button>
      </div></div>`;
    const hint = root.querySelector('[data-hint]');
    const paint = () => (hint.textContent = describeDays([...days]));
    paint();
    root.addEventListener('click', async (e) => {
      const day = e.target.closest('[data-d]');
      if (day) {
        const i = +day.dataset.d;
        days.has(i) ? days.delete(i) : days.add(i);
        day.classList.toggle('on');
        haptic.tick(); paint(); return;
      }
      const act = e.target.closest('[data-act]')?.dataset.act;
      if (e.target === root || act === 'cancel') return root.remove();
      if (act === 'save') {
        const time = root.querySelector('.ed-time').value || '07:00';
        const label = root.querySelector('.ed-label').value.trim();
        if (!(await alarms.requestPermission())) app.toast('Notifications are off, so this alarm only rings while Cosmic X is open');
        if (alarm) alarms.update(alarm.id, { time, label, days: [...days] });
        else alarms.add({ time, label, days: [...days] });
        haptic.notify('success');
        root.remove();
      }
      if (act === 'del') {
        root.remove();
        if (await confirmSheet({ title: 'Delete alarm?', message: `${alarm.time} ${alarm.label || ''}`.trim(), confirm: 'Delete' })) {
          alarms.remove(alarm.id);
          haptic.notify('warning');
        }
      }
    });
    document.body.append(root);
  }

  el.addEventListener('click', (e) => {
    const sw = e.target.closest('[data-sw]');
    if (sw) { e.stopPropagation(); alarms.toggle(sw.dataset.sw); haptic.press(); return; }
    const row = e.target.closest('.al-row');
    if (row) openEditor(alarms.list.find((a) => a.id === row.dataset.id));
  });

  offs.push(listen(alarms, 'change', render));
  const clock = setInterval(render, 30000);
  render();

  // coming from the Ask prompt: "set an alarm at 6:30" / "create a new alarm"
  const c = params._create;
  if (c) {
    if (c.time) {
      alarms.requestPermission().then(() => {
        alarms.add({ time: c.time });
        haptic.notify('success');
        app.toast(`Alarm set for ${c.time}`);
      });
    } else setTimeout(() => openEditor(null), 350);
  }

  app.setEdit('Test', () => { haptic.press(); alarms.test(); });
  app.setAdd(() => { haptic.press(); openEditor(null); }, 'plus');
  return { destroy: () => { clearInterval(clock); offs.forEach((f) => f()); } };
}
