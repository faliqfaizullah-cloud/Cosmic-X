import { icon } from '../icons.js';
import { esc, fmtTime, listen } from '../util.js';

const FILLER = new Set(['play', 'show', 'me', 'find', 'search', 'songs', 'song', 'music', 'by', 'from', 'some', 'something', 'put', 'on', 'hear', 'i', 'want', 'to']);

export function mount(el, app) {
  const { library, player, go } = app;
  const offs = [];
  let results = [];

  el.innerHTML = `<div class="srch">
    <div class="srch-bg" aria-hidden="true"><i class="b1"></i><i class="b2"></i><i class="b3"></i><i class="b4"></i></div>
    <textarea data-q rows="3" placeholder="What do you want to hear?" spellcheck="false"
      autocomplete="off" autocapitalize="none" enterkeyhint="search"></textarea>
    <div class="srch-results" data-res></div>
    <button class="srch-play" data-play hidden>${icon('play', 16)} <span>Play results</span></button>
  </div>`;

  const q = el.querySelector('[data-q]');
  const res = el.querySelector('[data-res]');
  const playBtn = el.querySelector('[data-play]');

  const clean = (s) => s.toLowerCase().split(/\s+/).filter((w) => w && !FILLER.has(w)).join(' ');

  function run() {
    const raw = q.value.trim();
    // if stripping the filler words leaves nothing (e.g. "play"), fall back to the raw text
    results = raw ? library.search(clean(raw) || raw) : [];
    if (!raw) {
      res.innerHTML = '';
    } else if (!results.length) {
      res.innerHTML = `<div class="srch-none">No matches in your library</div>`;
    } else {
      res.innerHTML = results.slice(0, 40).map((s) => `<button class="srow" data-id="${s.id}">
        <span class="srow-art" style="${library.artBg(s)}"></span>
        <span class="srow-meta"><b>${esc(s.title)}</b><i>${esc(s.artist)}</i></span>
        <span class="srow-t">${fmtTime(s.duration)}</span></button>`).join('');
    }
    playBtn.hidden = !results.length;
    playBtn.querySelector('span').textContent = results.length > 1 ? `Play ${results.length} results` : 'Play';
  }

  const playAll = () => {
    if (!results.length) return;
    player.playList(results, results[0].id);
    go('player');
  };

  q.addEventListener('input', run);
  q.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); q.blur(); } });
  playBtn.addEventListener('click', playAll);
  res.addEventListener('click', (e) => {
    const r = e.target.closest('.srow');
    if (!r) return;
    player.playList(results, r.dataset.id);
    go('player');
  });
  el.querySelector('.srch').addEventListener('pointerdown', (e) => {
    if (!e.target.closest('button, .srch-results')) setTimeout(() => q.focus(), 0);
  });

  offs.push(listen(library, 'change', run));
  const t = setTimeout(() => q.focus(), 480);

  app.setEdit('Clear', () => { q.value = ''; run(); q.focus(); });
  return { destroy: () => { clearTimeout(t); offs.forEach((f) => f()); } };
}
