import { settings } from '../settings.js';
import { fmtKm } from '../track-math.js';
import { listen, confirmSheet } from '../util.js';
import { haptic } from '../haptics.js';
import { locate, getCoords } from '../weather.js';

export function mount(el, app) {
  const { activities, tracker } = app;
  const offs = [];

  const toggle = (key, label, sub) => `<div class="row"><div><b>${label}</b><span>${sub}</span></div>
    <button class="sw ${settings.get(key) ? 'on' : ''}" data-sw="${key}" role="switch" aria-checked="${!!settings.get(key)}"><i></i></button></div>`;
  const seg = (key, label, opts) => `<div class="row col"><div><b>${label}</b></div>
    <div class="seg small">${opts.map(([v, t]) => `<button class="${settings.get(key) === v ? 'on' : ''}" data-seg="${key}" data-v="${v}">${t}</button>`).join('')}</div></div>`;

  function render() {
    const n = activities.list.length;
    el.innerHTML = `<div class="set-scroll"><div class="set">
      <div class="set-card">
        <div class="set-h">Walk tracker</div>
        <div class="row"><div><b>Body weight</b><span>Used for calorie estimates</span></div>
          <div class="step"><button data-w="-1" aria-label="Less">−</button><b>${settings.get('weight')} kg</b><button data-w="1" aria-label="More">+</button></div></div>
        <div class="row"><div><b>Background tracking</b><span>Your walk keeps recording with the screen off. Android shows a “walk in progress” notification while it runs. If tracking stops, set Cosmic X to <b style="display:inline">Battery → Unrestricted</b> in system settings.</span></div></div>
        <div class="row"><div><b>Location permission</b><span>Choose “Allow all the time” for the most reliable tracking</span></div>
          <button class="chip" data-osettings>Open</button></div>
      </div>
      <div class="set-card">
        <div class="set-h">Home-screen widget</div>
        ${seg('widgetTheme', 'Widget style', [['auto', 'Auto'], ['dark', 'Dark'], ['light', 'White']])}
        <div class="row"><div><span>Solid dark or solid white. “Auto” follows your phone’s light/dark theme. Long-press the home screen → Widgets → Cosmic X.</span></div></div>
      </div>
      <div class="set-card">
        <div class="set-h">Glass &amp; motion</div>
        ${seg('glass', 'Glass effects', [['full', 'Full'], ['lite', 'Lite']])}
        ${toggle('aura', 'Ambient glow', 'Soft colour behind the frosted glass, changes per screen')}
        ${toggle('motionBlur', 'Motion blur', 'Directional blur while flicking Cover Flow and the Data cards')}
        <div class="row"><div><span>Choose “Lite” if scrolling feels slow: it turns off the live background blur but keeps the frosted look.</span></div></div>
      </div>
      <div class="set-card">
        <div class="set-h">Haptics</div>
        ${toggle('haptics', 'Haptic feedback', 'Taps, detents in Cover Flow and dials, a buzz every kilometre, alarm pulses')}
        ${seg('hapticStrength', 'Strength', [['soft', 'Soft'], ['normal', 'Normal'], ['strong', 'Strong']])}
      </div>
      <div class="set-card">
        <div class="set-h">Location</div>
        <div class="row"><div><b>${getCoords().place}</b><span>Used for the Moon altitude and weather</span></div>
          <button class="chip" data-locate>Use mine</button></div>
      </div>
      <div class="set-card">
        <div class="set-h">Landscape · Cover Flow</div>
        ${toggle('sprinkles', 'Sprinkles', 'Falling sprinkles behind the covers')}
        ${seg('density', 'Sprinkle density', [['low', 'Low'], ['med', 'Medium'], ['high', 'High']])}
        ${toggle('reflection', 'Reflections', 'Glossy floor reflections under each cover')}
      </div>
      <div class="set-card">
        <div class="set-h">History</div>
        <div class="row"><div><b>${n} ${n === 1 ? 'walk' : 'walks'} saved</b><span>${fmtKm(activities.totalDistance)} km in total</span></div>
          <button class="chip danger" data-clear ${n ? '' : 'disabled'}>Clear</button></div>
      </div>
      <p class="set-foot">Cosmic X 1.2 · Rotate your phone to landscape for Cover Flow</p>
    </div></div>`;
  }

  el.addEventListener('click', async (e) => {
    const sw = e.target.closest('[data-sw]');
    if (sw) { settings.set(sw.dataset.sw, !settings.get(sw.dataset.sw)); haptic.press(); render(); return; }
    const sg = e.target.closest('[data-seg]');
    if (sg) { settings.set(sg.dataset.seg, sg.dataset.v); haptic.press(); render(); return; }
    const w = e.target.closest('[data-w]');
    if (w) { settings.set('weight', Math.max(30, Math.min(200, settings.get('weight') + +w.dataset.w))); haptic.tick(); render(); return; }
    if (e.target.closest('[data-osettings]')) return tracker.openSettings();
    if (e.target.closest('[data-locate]')) { app.toast('Finding your location…'); await locate({ timeout: 8000 }); haptic.notify('success'); render(); return; }
    if (e.target.closest('[data-clear]')) {
      if (await confirmSheet({ title: 'Clear all walks?', message: 'Every saved walk and route will be deleted. This cannot be undone.', confirm: 'Clear' })) {
        await activities.clear();
        haptic.notify('warning');
        app.toast('History cleared');
      }
    }
  });

  offs.push(listen(activities, 'change', render));
  render();
  app.setEdit(null);
  return { destroy: () => offs.forEach((f) => f()) };
}
