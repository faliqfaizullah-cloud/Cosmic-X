import { icon } from '../icons.js';
import { settings } from '../settings.js';
import { fmtBytes, fmtTime, listen, confirmSheet } from '../util.js';

export function mount(el, app) {
  const { library } = app;
  const offs = [];

  const toggle = (key, label, sub) => `<div class="row"><div><b>${label}</b><span>${sub}</span></div>
    <button class="sw ${settings.get(key) ? 'on' : ''}" data-sw="${key}" role="switch" aria-checked="${!!settings.get(key)}"><i></i></button></div>`;
  const seg = (key, label, opts) => `<div class="row col"><div><b>${label}</b></div>
    <div class="seg small">${opts.map(([v, t]) => `<button class="${settings.get(key) === v ? 'on' : ''}" data-seg="${key}" data-v="${v}">${t}</button>`).join('')}</div></div>`;

  function render() {
    const n = library.songs.length;
    el.innerHTML = `<div class="set-scroll"><div class="set">
      <div class="set-card">
        <div class="set-h">Landscape · Cover Flow</div>
        ${toggle('sprinkles', 'Sprinkles', 'Falling sprinkles behind the covers')}
        ${seg('density', 'Sprinkle density', [['low', 'Low'], ['med', 'Medium'], ['high', 'High']])}
        ${toggle('reflection', 'Reflections', 'Glossy floor reflections under each cover')}
        ${toggle('reactive', 'Beat-reactive sprinkles', 'Beta · uses Web Audio, restart the app after changing')}
      </div>
      <div class="set-card">
        <div class="set-h">Library</div>
        ${seg('sort', 'Sort by', [['artist', 'Artist'], ['title', 'Title'], ['recent', 'Recent']])}
        <div class="row"><div><b>Storage</b><span>${n} ${n === 1 ? 'song' : 'songs'} · ${fmtBytes(library.totalSize)} · ${fmtTime(library.totalDuration)}</span></div></div>
        <div class="row"><div><b>Import songs</b><span>Pick audio files from your phone</span></div>
          <button class="chip" data-import>${icon('plus', 16)} Import</button></div>
        <div class="row"><div><b>Clear library</b><span>Removes Cosmic X's copies of your songs</span></div>
          <button class="chip danger" data-clear ${n ? '' : 'disabled'}>Clear</button></div>
      </div>
      <p class="set-foot">Cosmic X 1.0 · Rotate your phone to landscape for Cover Flow</p>
    </div></div>`;
  }

  el.addEventListener('click', async (e) => {
    const sw = e.target.closest('[data-sw]');
    if (sw) { settings.set(sw.dataset.sw, !settings.get(sw.dataset.sw)); render(); return; }
    const sg = e.target.closest('[data-seg]');
    if (sg) {
      settings.set(sg.dataset.seg, sg.dataset.v);
      if (sg.dataset.seg === 'sort') { library.resort(); library.emit('change'); }
      render();
      return;
    }
    if (e.target.closest('[data-import]')) return app.pickFiles();
    if (e.target.closest('[data-clear]')) {
      if (await confirmSheet({ title: 'Clear library?', message: 'All imported songs will be removed from Cosmic X. Your original files are not touched.', confirm: 'Clear' })) {
        await library.clear();
        app.toast('Library cleared');
      }
    }
  });

  offs.push(listen(library, 'change', render));
  render();
  app.setEdit(null);
  return { destroy: () => offs.forEach((f) => f()) };
}
