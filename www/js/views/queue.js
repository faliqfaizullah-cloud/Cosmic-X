import { icon } from '../icons.js';
import { esc, fmtTime, listen, clamp, paletteFor } from '../util.js';
import { Scroller, bindDrag } from '../scroller.js';

const STEP = 66; // px between stacked cards

export function mount(el, app) {
  const { library, player } = app;
  const offs = [];
  let items = [];
  let nodes = [];

  el.innerHTML = `<div class="deck-wrap">
    <div class="deck" data-deck></div>
    <p class="deck-hint" data-hint></p></div>`;
  const deck = el.querySelector('[data-deck]');
  const hint = el.querySelector('[data-hint]');

  const sc = new Scroller({ min: 0, max: 0, onUpdate: layout });

  function cardHTML(it, i) {
    const s = it.song;
    const [a, b] = paletteFor(s.title);
    return `<div class="qcard" data-i="${i}" style="--g1:${a};--g2:${b}">
      <div class="qcard-top">
        <div class="qcard-art" style="${library.artBg(s)}">${s.cover ? '' : icon('note', 20)}</div>
        <div class="qcard-meta"><b>${esc(s.title)}</b><span>${esc(s.artist)}</span></div>
        <i>${fmtTime(s.duration)}</i>
      </div>
      <div class="qcard-body">
        <div class="qcard-big" style="${library.artBg(s)}"></div>
        <div class="qcard-tag">${i === 0 ? 'NOW PLAYING' : `UP NEXT · ${i}`}</div>
        <div class="qcard-play">${icon('play', 22)}</div>
      </div>
    </div>`;
  }

  function build() {
    items = player.upcoming(40);
    nodes = [];
    if (!items.length) {
      deck.innerHTML = `<div class="empty"><div class="empty-ic">${icon('list', 38)}</div><h2>Queue is empty</h2><p>Play a song from your Library to fill it.</p></div>`;
      hint.textContent = '';
      sc.setRange(0, 0);
      return;
    }
    deck.innerHTML = items.map(cardHTML).join('');
    nodes = [...deck.children];
    sc.setRange(0, items.length - 1);
    sc.jump(0);
    hint.textContent = 'Drag to browse · tap the front card to play';
  }

  function layout(f) {
    for (let i = 0; i < nodes.length; i++) {
      const d = i - f;
      const ad = Math.abs(d);
      const n = nodes[i];
      if (ad > 5.2) { n.style.visibility = 'hidden'; continue; }
      n.style.visibility = '';
      const y = d * STEP;
      const z = -ad * 46;
      const rx = clamp(d, -3, 3) * -9;
      const sc_ = 1 - Math.min(ad, 5) * 0.045;
      n.style.transform = `translate3d(0, ${y}px, ${z}px) rotateX(${rx}deg) scale(${sc_})`;
      n.style.opacity = String(clamp(1 - Math.max(0, ad - 0.4) * 0.19, 0, 1));
      n.style.zIndex = String(200 - Math.round(ad * 10));
      n.classList.toggle('front', ad < 0.5);
    }
  }

  const unbind = bindDrag(deck, sc, {
    axis: 'y',
    pxPerUnit: STEP,
    onTap: (e) => {
      const n = e.target.closest('.qcard');
      if (!n) return;
      const i = +n.dataset.i;
      if (i !== Math.round(sc.pos)) return sc.to(i);
      const it = items[i];
      if (i === 0) player.toggle();
      else player.jumpTo(it.orderPos);
    },
  });

  offs.push(
    unbind,
    () => sc.stop(),
    listen(player, 'queue', build),
    listen(player, 'track', build),
    listen(library, 'fav', () => {})
  );

  build();
  app.setEdit('Shuffle', () => { player.setShuffle(!player.shuffle); app.toast(player.shuffle ? 'Shuffle on' : 'Shuffle off'); });
  return { destroy: () => offs.forEach((f) => f()) };
}
