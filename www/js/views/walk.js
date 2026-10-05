import { icon } from '../icons.js';
import { tracker } from '../tracker.js';
import { listen } from '../util.js';
import { toggleWalk, finishWalk } from '../walk-actions.js';
import { simplify, normalizeRoute, fmtKm, fmtDur, fmtPace, defaultName } from '../track-math.js';
import { DEMO_ROUTE } from '../route-art.js';

const RW = 200, RH = 130;

function routeSVG(points) {
  let pts, ghost = false;
  if (points.length > 1) pts = normalizeRoute(simplify(points, 3), RW, RH, 18);
  else { pts = DEMO_ROUTE.map(([x, y]) => [x * RW, y * RH]); ghost = true; }
  const [ex, ey] = pts[pts.length - 1];
  return `<svg viewBox="0 0 ${RW} ${RH}" class="g-route ${ghost ? 'ghost' : ''}" preserveAspectRatio="xMidYMid meet">
    <polyline points="${pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ')}" fill="none" stroke="#fff" stroke-width="1.1" stroke-linejoin="round" stroke-linecap="round"/>
    ${ghost ? '' : `<circle cx="${ex.toFixed(1)}" cy="${ey.toFixed(1)}" r="9" fill="none" stroke="rgba(255,225,120,.85)" stroke-width="1.6"/>
    <circle cx="${ex.toFixed(1)}" cy="${ey.toFixed(1)}" r="3.6" fill="#ffe36b" class="g-dotglow"/>`}
    ${ghost ? `<circle cx="${ex.toFixed(1)}" cy="${ey.toFixed(1)}" r="9" fill="none" stroke="rgba(255,225,120,.6)" stroke-width="1.6"/><circle cx="${ex.toFixed(1)}" cy="${ey.toFixed(1)}" r="3.6" fill="#ffe36b"/>` : ''}
  </svg>`;
}

// 7 glowing dots on an arc; `lit` of them are bright (the circle widget)
function dotsArc(lit) {
  const cx = 60, cy = 74, r = 54;
  return `<svg viewBox="0 0 120 52" class="g-dots">${Array.from({ length: 7 }, (_, i) => {
    const a = ((-152 + i * 20.7) * Math.PI) / 180;
    const x = cx + r * Math.cos(a), y = cy + r * Math.sin(a), on = i < lit;
    return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${on ? 2.7 : 2}" fill="${on ? '#fff' : 'rgba(255,255,255,.4)'}" ${on ? 'class="dg"' : ''}/>`;
  }).join('')}</svg>`;
}

// faint arc with a yellow marker + dotted drop line (the rounded-square widget)
function markerArc(t) {
  const P0 = [14, 62], P1 = [60, 4], P2 = [106, 62];
  const u = Math.max(0.04, Math.min(0.96, t));
  const x = (1 - u) ** 2 * P0[0] + 2 * (1 - u) * u * P1[0] + u * u * P2[0];
  const y = (1 - u) ** 2 * P0[1] + 2 * (1 - u) * u * P1[1] + u * u * P2[1];
  return `<svg viewBox="0 0 120 70" class="g-arc"><path d="M${P0} Q${P1} ${P2}" fill="none" stroke="rgba(255,255,255,.55)" stroke-width="1.2"/>
    <line x1="${x.toFixed(1)}" y1="${(y + 6).toFixed(1)}" x2="${x.toFixed(1)}" y2="68" stroke="rgba(255,255,255,.6)" stroke-width="1" stroke-dasharray="1 3"/>
    <path d="M${(x - 4.5).toFixed(1)} ${(y - 5).toFixed(1)} L${(x + 4.5).toFixed(1)} ${(y - 5).toFixed(1)} L${x.toFixed(1)} ${(y + 3).toFixed(1)} Z" fill="#ffe36b" stroke="#ffe36b" stroke-linejoin="round" stroke-width="1.5"/></svg>`;
}

export function mount(el, app, params = {}) {
  const offs = [];
  el.innerHTML = `<div class="walk" data-walk>
    <div class="walk-block" data-block>
      <div class="sil" aria-hidden="true"><i class="sil-h"></i><i class="sil-b"></i></div>
      <div class="walk-grid">
        <section class="glass g-main">
          <div class="g-state" data-k="state"></div>
          <div class="g-routebox" data-k="route"></div>
          <div class="g-name" data-k="name"></div>
          <div class="g-dist"><b data-k="dist">0.00</b><small>KM</small></div>
          <div class="g-side"><span data-k="time">0:00</span><span><em data-k="kcal">0</em> <i>kcal</i></span><span><em data-k="pace">--:--</em> <i>/ Km</i></span></div>
        </section>
        <section class="glass g-circle">
          <div class="g-label">Speed</div>
          <div class="g-val"><b data-k="speed">0.0</b><small>KM/H</small></div>
          <div data-k="dots"></div>
        </section>
        <section class="glass g-sq">
          <div class="g-label">Elevation gain</div>
          <div data-k="arc"></div>
          <div class="g-val low"><b data-k="elev">0.0</b><small>M</small></div>
        </section>
      </div>
    </div>
    <div class="walk-ctl">
      <button class="wc" data-act="map" aria-label="Map">${icon('pin', 22)}</button>
      <button class="wc main" data-act="main" aria-label="Start"></button>
      <button class="wc" data-act="finish" aria-label="Finish">${icon('stop', 20)}</button>
    </div>
  </div>`;

  const $k = (k) => el.querySelector(`[data-k="${k}"]`);
  const block = el.querySelector('[data-block]');
  const ctl = el.querySelector('.walk-ctl');
  const host = el.querySelector('[data-walk]');
  let lastRouteN = -1, lastDots = -1, lastArc = -1;

  function fitBlock() {
    const availH = host.clientHeight - ctl.offsetHeight - 22;
    const w = Math.max(220, Math.min(host.clientWidth - 36, availH / 1.52));
    host.style.setProperty('--w', `${Math.floor(w)}px`);
  }

  function render() {
    const s = tracker.snap;
    const idle = s.state === 'idle';
    $k('state').textContent = idle ? 'Ready' : s.state === 'paused' ? 'Paused' : s.weak ? 'Searching GPS…' : 'Recording';
    $k('state').className = `g-state ${idle ? '' : s.state}`;
    $k('name').textContent = idle ? defaultName() : defaultName(tracker.startedAt);
    $k('dist').textContent = fmtKm(s.distance);
    $k('time').textContent = fmtDur(s.elapsed);
    $k('kcal').textContent = s.kcal;
    $k('pace').textContent = fmtPace(s.avgPace);
    $k('speed').textContent = s.speedKmh.toFixed(1);
    $k('elev').textContent = s.elevGain.toFixed(1);

    if (s.points.length !== lastRouteN) { lastRouteN = s.points.length; $k('route').innerHTML = routeSVG(s.points); }
    const lit = Math.min(7, Math.round((s.speedKmh / 7) * 7));
    if (lit !== lastDots) { lastDots = lit; $k('dots').innerHTML = dotsArc(lit); }
    const t = s.altMax != null && s.altMax > s.altMin ? (s.alt - s.altMin) / (s.altMax - s.altMin) : 0.5;
    const tq = Math.round(t * 20);
    if (tq !== lastArc) { lastArc = tq; $k('arc').innerHTML = markerArc(t); }

    const main = el.querySelector('[data-act="main"]');
    main.innerHTML = icon(s.state === 'recording' ? 'pause' : 'play', 30);
    main.setAttribute('aria-label', idle ? 'Start' : s.state === 'recording' ? 'Pause' : 'Resume');
    main.classList.toggle('rec', s.state === 'recording');
    el.querySelector('[data-act="finish"]').classList.toggle('hide', idle);
    app.setAdd(toggle, s.state === 'recording' ? 'pause' : 'play');
  }

  const toggle = () => toggleWalk();
  const finish = () => finishWalk(app);

  el.addEventListener('click', (e) => {
    const a = e.target.closest('[data-act]')?.dataset.act;
    if (a === 'main') toggle();
    else if (a === 'finish') finish();
    else if (a === 'map') app.go('map');
  });

  offs.push(listen(tracker, 'fix', render), listen(tracker, 'state', render));
  const clock = setInterval(render, 1000);
  const ro = new ResizeObserver(fitBlock);
  ro.observe(host);
  fitBlock();
  render();

  app.setEdit('History', () => app.go('activities'));
  if (params._start && tracker.state === 'idle') toggle();
  return { destroy: () => { clearInterval(clock); ro.disconnect(); offs.forEach((f) => f()); } };
}
