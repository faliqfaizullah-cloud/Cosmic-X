import { icon } from '../icons.js';
import { esc, fmtTime, listen } from '../util.js';
import { parseIntent } from '../intents.js';
import { haptic } from '../haptics.js';

const FILLER = new Set(['play', 'show', 'me', 'find', 'search', 'songs', 'song', 'music', 'by', 'from', 'some', 'something', 'put', 'on', 'hear', 'i', 'want', 'to']);
const EXAMPLES = ['Show me the weather analytics today', 'Create a new application of the alarm clock', 'Set an alarm at 6:30 am', 'When is the next full moon', 'Play something by…'];

export function mount(el, app) {
  const { library, player, go } = app;
  const offs = [];
  let results = [];
  let intent = null;
  let typer = 0;

  el.innerHTML = `<div class="srch">
    <div class="srch-bg" aria-hidden="true"><i class="b1"></i><i class="b2"></i><i class="b3"></i><i class="b4"></i></div>
    <textarea data-q rows="3" placeholder="" spellcheck="false" autocomplete="off" autocapitalize="none" enterkeyhint="go"></textarea>
    <div class="srch-ghost" data-ghost aria-hidden="true"></div>
    <div class="srch-results" data-res></div>
    <button class="srch-play" data-go hidden>${icon('wand', 16)} <span>Go</span></button>
  </div>`;

  const q = el.querySelector('[data-q]');
  const ghost = el.querySelector('[data-ghost]');
  const res = el.querySelector('[data-res]');
  const goBtn = el.querySelector('[data-go]');

  // typewriter placeholder, like the prompt screen in the original design
  function typeLoop(i = 0, n = 0, dir = 1) {
    if (q.value) { ghost.textContent = ''; typer = setTimeout(() => typeLoop(i, 0, 1), 800); return; }
    const full = EXAMPLES[i];
    n += dir;
    ghost.textContent = full.slice(0, n);
    let wait = dir > 0 ? 55 : 22;
    if (n >= full.length && dir > 0) { dir = -1; wait = 1700; }
    else if (n <= 0 && dir < 0) { dir = 1; i = (i + 1) % EXAMPLES.length; wait = 350; }
    typer = setTimeout(() => typeLoop(i, n, dir), wait);
  }
  typeLoop();

  const clean = (s) => s.toLowerCase().split(/\s+/).filter((w) => w && !FILLER.has(w)).join(' ');

  function run() {
    const raw = q.value.trim();
    intent = parseIntent(raw);
    results = !raw || intent ? [] : library.search(clean(raw) || raw);
    let html = '';
    if (intent) html += `<button class="srow act" data-intent><span class="srow-art ic">${icon('wand', 20)}</span><span class="srow-meta"><b>${esc(intent.label)}</b><i>Tap or press Go</i></span></button>`;
    if (raw && !intent) {
      html += results.length
        ? results.slice(0, 40).map((s) => `<button class="srow" data-id="${s.id}"><span class="srow-art" style="${library.artBg(s)}"></span><span class="srow-meta"><b>${esc(s.title)}</b><i>${esc(s.artist)}</i></span><span class="srow-t">${fmtTime(s.duration)}</span></button>`).join('')
        : '<div class="srch-none">No matches in your library</div>';
    }
    res.innerHTML = html;
    goBtn.hidden = !(intent || results.length);
    goBtn.querySelector('span').textContent = intent ? 'Go' : results.length > 1 ? `Play ${results.length} results` : 'Play';
    goBtn.firstElementChild.outerHTML = icon(intent ? 'wand' : 'play', 16);
  }

  function execute() {
    if (intent) {
      haptic.thud();
      go(intent.view, intent.create ? { _create: intent.create } : {});
    } else if (results.length) {
      haptic.thud();
      player.playList(results, results[0].id);
      go('player');
    }
  }

  q.addEventListener('input', run);
  q.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); if (intent || results.length) execute(); else q.blur(); } });
  goBtn.addEventListener('click', execute);
  res.addEventListener('click', (e) => {
    if (e.target.closest('[data-intent]')) return execute();
    const r = e.target.closest('.srow[data-id]');
    if (!r) return;
    haptic.thud();
    player.playList(results, r.dataset.id);
    go('player');
  });
  el.querySelector('.srch').addEventListener('pointerdown', (e) => {
    if (!e.target.closest('button, .srch-results')) setTimeout(() => q.focus(), 0);
  });

  offs.push(listen(library, 'change', run));
  const t = setTimeout(() => q.focus(), 480);

  app.setEdit('Clear', () => { q.value = ''; run(); q.focus(); });
  return { destroy: () => { clearTimeout(t); clearTimeout(typer); offs.forEach((f) => f()); } };
}
