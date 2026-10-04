import { icon } from '../icons.js';
import { moonInfo, nextPhase } from '../astro.js';
import { getCoords, ensureLocation } from '../weather.js';
import { Scroller, bindDrag } from '../scroller.js';
import { haptic } from '../haptics.js';

const DAY_PX = 14;
const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

let texCache = null;
function rng(seed) { return () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296); }

// A procedurally painted moon surface: soft maria + craters (no image assets needed).
function texture(size) {
  if (texCache?.width === size) return texCache;
  const t = document.createElement('canvas');
  t.width = t.height = size;
  const g = t.getContext('2d');
  const R = size / 2 - 6, c = size / 2;
  const rnd = rng(11);
  g.save();
  g.beginPath(); g.arc(c, c, R, 0, Math.PI * 2); g.clip();
  const base = g.createRadialGradient(size * 0.42, size * 0.36, R * 0.1, c, c, R);
  base.addColorStop(0, '#f1efe9'); base.addColorStop(0.65, '#bdbab3'); base.addColorStop(1, '#85827d');
  g.fillStyle = base; g.fillRect(0, 0, size, size);
  g.filter = `blur(${size * 0.02}px)`;
  for (let i = 0; i < 7; i++) {
    g.fillStyle = `rgba(70,70,78,${0.18 + rnd() * 0.18})`;
    g.beginPath();
    g.ellipse(c + (rnd() - 0.5) * R * 1.1, c + (rnd() - 0.5) * R * 1.1, R * (0.12 + rnd() * 0.2), R * (0.1 + rnd() * 0.17), rnd() * 3, 0, 7);
    g.fill();
  }
  g.filter = 'none';
  for (let i = 0; i < 46; i++) {
    const a = rnd() * 6.28, d = Math.sqrt(rnd()) * R * 0.92, r = R * (0.012 + rnd() * rnd() * 0.07);
    const x = c + Math.cos(a) * d, y = c + Math.sin(a) * d;
    g.fillStyle = 'rgba(60,60,66,.28)'; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
    g.strokeStyle = 'rgba(255,255,255,.35)'; g.lineWidth = Math.max(1, r * 0.2);
    g.beginPath(); g.arc(x - r * 0.12, y - r * 0.12, r, 3.4, 5.4); g.stroke();
  }
  g.restore();
  return (texCache = t);
}

function drawMoon(cv, info) {
  const dpr = Math.min(devicePixelRatio || 1, 2);
  const size = Math.round(cv.clientWidth || 260);
  cv.width = cv.height = Math.round(size * dpr);
  const c = cv.getContext('2d');
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  c.clearRect(0, 0, size, size);
  const tex = texture(size);
  const R = size / 2 - 6, cx = size / 2, cy = size / 2;
  c.save(); c.globalAlpha = 0.13; c.drawImage(tex, 0, 0, size, size); c.restore(); // earthshine
  const k = Math.cos((info.elongation * Math.PI) / 180); // 1 new ... -1 full
  c.save();
  if (!info.waxing) { c.translate(size, 0); c.scale(-1, 1); }
  c.beginPath();
  c.moveTo(cx, cy - R);
  c.arc(cx, cy, R, -Math.PI / 2, Math.PI / 2, false);
  c.ellipse(cx, cy, Math.max(0.001, Math.abs(k) * R), R, 0, Math.PI / 2, -Math.PI / 2, k > 0);
  c.closePath();
  c.clip();
  c.drawImage(tex, 0, 0, size, size);
  c.restore();
}

export function mount(el, app) {
  let coords = getCoords();
  let offset = 0;
  let shown = null;

  el.innerHTML = `<div class="moon-card">
    <div class="moon-head">
      <div><div class="np-h1">Moon</div><div class="np-h2" data-k="date"></div></div>
      <div class="moon-loc" data-k="loc">${icon('pin', 14)}<span></span></div>
    </div>
    <div class="moon-wrap"><canvas data-k="cv"></canvas></div>
    <div class="moon-name" data-k="name"></div>
    <div class="moon-pct" data-k="pct"></div>
    <div class="np-stats">
      <div><span>Distance</span><b data-k="dist"></b></div>
      <div><span>Age</span><b data-k="age"></b></div>
      <div><span>Altitude</span><b data-k="alt"></b></div>
    </div>
    <div class="dial" data-k="dial"><div class="dial-ticks" data-k="ticks"></div><div class="dial-mark"></div></div>
    <div class="moon-next" data-k="next"></div>
  </div>`;

  const $k = (k) => el.querySelector(`[data-k="${k}"]`);
  const cv = $k('cv');

  const dateFor = (off) => new Date(Date.now() + off * 86400000);

  function render() {
    const d = dateFor(offset);
    const m = moonInfo(d, coords.lat, coords.lon);
    $k('date').textContent = offset ? `${d.getDate()} ${MON[d.getMonth()]} ${WD[d.getDay()]} · ${offset > 0 ? '+' : ''}${offset}d` : `${d.getDate()} ${WD[d.getDay()]}`;
    $k('name').textContent = m.phase;
    $k('pct').textContent = `${Math.round(m.illumination * 100)}% illuminated`;
    $k('dist').textContent = `${Math.round(m.distanceKm).toLocaleString('en-US')} km`;
    $k('age').textContent = `${m.age.toFixed(1)} days`;
    $k('alt').textContent = `${m.altitude.toFixed(0)}°`;
    $k('loc').querySelector('span').textContent = coords.place;
    drawMoon(cv, m);
  }

  const sc = new Scroller({
    min: -60, max: 60,
    onUpdate: (p) => {
      const w = $k('dial').clientWidth || 300;
      $k('ticks').style.backgroundPositionX = `${w / 2 - p * DAY_PX}px, ${w / 2 - p * DAY_PX}px`;
      const day = Math.round(p);
      if (day !== offset) {
        offset = day;
        if (sc.dragging || Math.abs(sc.vel) > 0.002) haptic.tick();
        render();
      }
    },
  });
  const unbind = bindDrag($k('dial'), sc, { axis: 'x', pxPerUnit: DAY_PX });
  // let the whole card be dragged too, not just the small dial
  const unbind2 = bindDrag($k('cv').parentElement, sc, { axis: 'x', pxPerUnit: DAY_PX * 1.6 });

  const timer = setInterval(() => offset === 0 && render(), 60000);

  // next full / new moon (computed once; cheap)
  setTimeout(() => {
    const now = new Date();
    const f = nextPhase(now, 180), n = nextPhase(now, 0);
    const fmt = (d) => `${WD[d.getDay()]} ${d.getDate()} ${MON[d.getMonth()]}`;
    if (f && n) $k('next').innerHTML = `<span>${icon('moon', 14)} Full moon <b>${fmt(f)}</b></span><span>New moon <b>${fmt(n)}</b></span>`;
  }, 350);

  ensureLocation().then((c) => { coords = c; render(); });

  app.setEdit('Today', () => { haptic.press(); sc.to(0); });
  render();
  sc.jump(0);
  return { destroy: () => { clearInterval(timer); unbind(); unbind2(); sc.stop(); } };
}
