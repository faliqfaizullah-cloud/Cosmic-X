import { icon } from '../icons.js';
import { moonInfo } from '../astro.js';
import { cachedWeather } from '../weather.js';
import { alarms, fmtIn } from '../alarms.js';
import { fmtKm, fmtDur } from '../track-math.js';
import { Scroller, bindDrag } from '../scroller.js';
import { haptic } from '../haptics.js';
import { esc } from '../util.js';

const STEP = 66;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

export function mount(el, app) {
  const { activities, tracker, go } = app;

  const m = moonInfo(new Date());
  const w = cachedWeather()?.data;
  const nx = alarms.next();
  const snap = tracker.snap;
  const last = activities.list[0];
  const walkCard = snap.state !== 'idle'
    ? { view: 'walk', icon: 'activity', title: 'Walk', big: fmtKm(snap.distance), sub: `${snap.state === 'paused' ? 'Paused' : 'Recording'} · ${fmtDur(snap.elapsed)}`, g: ['#ffd0b5', '#d9684a'], dark: true }
    : { view: 'walk', icon: 'activity', title: 'Walk', big: last ? fmtKm(last.distance) : '0.00', sub: last ? `last walk · ${last.name}` : 'Start your first walk', g: ['#ffd0b5', '#d9684a'], dark: true };
  const cards = [
    walkCard,
    { view: 'moon', icon: 'moon', title: 'Moon', big: `${Math.round(m.illumination * 100)}%`, sub: m.phase, g: ['#ff9a5a', '#5a1a14'] },
    { view: 'analytics', icon: 'sun', title: 'Analytics', big: w ? `${Math.round(w.temp)}°` : '—', sub: w ? w.condition : 'Open to load weather', g: ['#ff4d6d', '#6d1030'] },
    { view: 'alarm', icon: 'bell', title: 'Alarm', big: nx ? nx.alarm.time : '--:--', sub: nx ? `in ${fmtIn(nx.at - Date.now())}` : 'No alarm is on', g: ['#d7ff2f', '#169c8a'], dark: true },
    { view: 'activities', icon: 'route', title: 'History', big: String(activities.list.length), sub: `${fmtKm(activities.totalDistance)} km in total`, g: ['#b36bff', '#241a7a'] },
  ];

  el.innerHTML = `<div class="deck-wrap"><div class="deck" data-deck>${cards.map((c, i) => `
    <div class="qcard dcard ${c.dark ? 'dark' : ''}" data-i="${i}" style="--g1:${c.g[0]};--g2:${c.g[1]}">
      <div class="dcard-top">${icon(c.icon, 22)}<b>${c.title}</b></div>
      <div class="dcard-big">${c.big}</div>
      <div class="dcard-sub">${esc(c.sub)}</div>
      <div class="qcard-play">${icon('play', 22)}</div>
    </div>`).join('')}</div><p class="deck-hint">Drag to browse · tap the front card to open</p></div>`;

  const deck = el.querySelector('[data-deck]');
  const nodes = [...deck.children];
  let lastIdx = 0;

  const sc = new Scroller({
    min: 0, max: cards.length - 1,
    onUpdate: (f) => {
      const idx = Math.round(f);
      if (idx !== lastIdx) { lastIdx = idx; if (sc.dragging || Math.abs(sc.vel) > 0.002) haptic.tick(); }
      nodes.forEach((n, i) => {
        const d = i - f, ad = Math.abs(d);
        n.style.transform = `translate3d(0, ${d * STEP}px, ${-ad * 46}px) rotateX(${clamp(d, -3, 3) * -9}deg) scale(${1 - Math.min(ad, 5) * 0.045})`;
        n.style.opacity = String(clamp(1 - Math.max(0, ad - 0.4) * 0.19, 0, 1));
        n.style.zIndex = String(200 - Math.round(ad * 10));
        n.classList.toggle('front', ad < 0.5);
      });
    },
  });
  const unbind = bindDrag(deck, sc, {
    axis: 'y', pxPerUnit: STEP,
    onTap: (e) => {
      const n = e.target.closest('.qcard');
      if (!n) return;
      const i = +n.dataset.i;
      if (i !== Math.round(sc.pos)) return sc.to(i);
      haptic.thud();
      go(cards[i].view);
    },
  });
  sc.jump(0);
  app.setEdit(null);
  return { destroy: () => { unbind(); sc.stop(); } };
}
