import { icon } from '../icons.js';
import { esc } from '../util.js';
import { parseIntent } from '../intents.js';
import { haptic } from '../haptics.js';

const EXAMPLES = ['Show me the weather analytics today', 'Create a new application of the alarm clock', 'Start a walk', 'Set an alarm at 6:30 am', 'Show my past walks', 'When is the next full moon'];

export function mount(el, app) {
  const { go } = app;
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

  function run() {
    const raw = q.value.trim();
    intent = parseIntent(raw);
    let html = '';
    if (intent) {
      html = `<button class="srow act" data-intent><span class="srow-art ic">${icon('wand', 20)}</span><span class="srow-meta"><b>${esc(intent.label)}</b><i>Tap or press Go</i></span></button>`;
    } else if (raw) {
      html = `<div class="srch-none">I don't know that one yet. Try:</div>` +
        EXAMPLES.slice(0, 4).map((x) => `<button class="srow" data-fill="${esc(x)}"><span class="srow-art ic">${icon('wand', 18)}</span><span class="srow-meta"><b>${esc(x)}</b></span></button>`).join('');
    }
    res.innerHTML = html;
    goBtn.hidden = !intent;
  }

  function execute() {
    if (!intent) return;
    haptic.thud();
    const c = intent.create;
    go(intent.view, { _create: c, _start: !!c?.start });
  }

  q.addEventListener('input', run);
  q.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); intent ? execute() : q.blur(); } });
  goBtn.addEventListener('click', execute);
  res.addEventListener('click', (e) => {
    if (e.target.closest('[data-intent]')) return execute();
    const f = e.target.closest('[data-fill]');
    if (f) { q.value = f.dataset.fill; run(); }
  });
  el.querySelector('.srch').addEventListener('pointerdown', (e) => {
    if (!e.target.closest('button, .srch-results')) setTimeout(() => q.focus(), 0);
  });

  const t = setTimeout(() => q.focus(), 480);
  app.setEdit('Clear', () => { q.value = ''; run(); q.focus(); });
  return { destroy: () => { clearTimeout(t); clearTimeout(typer); } };
}
