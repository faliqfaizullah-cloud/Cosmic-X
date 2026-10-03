import { icon } from '../icons.js';
import { esc, fmtTime, listen, clamp } from '../util.js';

export function mount(el, app) {
  const { library, player, go } = app;
  const offs = [];

  el.innerHTML = `<div class="np-card" data-card>
    <div class="np-head">
      <div><div class="np-h1">Now Playing</div><div class="np-h2" data-k="count">&nbsp;</div></div>
      <button class="np-fav" data-act="fav" aria-label="Favorite"></button>
    </div>
    <div class="np-artwrap" data-k="artwrap">
      <div class="np-halo"></div>
      <div class="np-disc" data-k="disc"></div>
    </div>
    <div class="np-name" data-k="title">Nothing playing</div>
    <div class="np-artist" data-k="artist">Import songs to get started</div>
    <div class="np-stats">
      <div><span>Elapsed</span><b data-k="elapsed">0:00</b></div>
      <div><span>Remaining</span><b data-k="remain">0:00</b></div>
      <div><span>Format</span><b data-k="fmt">—</b></div>
    </div>
    <div class="np-scrub" data-k="scrub" role="slider" aria-label="Seek">
      <div class="np-ticks"></div><div class="np-ticks on" data-k="on"></div><div class="np-knob" data-k="knob"></div>
    </div>
    <div class="np-ctl">
      <button data-act="shuffle" aria-label="Shuffle"></button>
      <button data-act="prev" aria-label="Previous"></button>
      <button class="big" data-act="toggle" aria-label="Play or pause"></button>
      <button data-act="next" aria-label="Next"></button>
      <button data-act="repeat" aria-label="Repeat"></button>
    </div>
  </div>`;

  const $k = (k) => el.querySelector(`[data-k="${k}"]`);
  const card = el.querySelector('[data-card]');
  let scrubbing = false;
  let lastId = null;

  async function paintColors(song) {
    const [c1, c2] = await library.colors(song);
    if (player.current?.id === song?.id || !song) {
      card.style.setProperty('--c1', c1);
      card.style.setProperty('--c2', c2);
    }
  }

  function renderTrack() {
    const s = player.current;
    const disc = $k('disc');
    if (!s) {
      disc.style.cssText = '';
      disc.classList.add('noart');
      disc.innerHTML = icon('note', 56);
      $k('title').textContent = 'Nothing playing';
      $k('artist').textContent = library.songs.length ? 'Pick a song from the Library' : 'Import songs to get started';
      $k('count').innerHTML = '&nbsp;';
      $k('fmt').textContent = '—';
      paintColors(null);
    } else {
      disc.classList.remove('noart');
      disc.innerHTML = '';
      disc.style.cssText = library.artBg(s);
      if (!s.cover) disc.innerHTML = icon('note', 56);
      $k('title').textContent = s.title;
      $k('artist').textContent = s.album && !s.album.startsWith('Unknown') ? `${s.artist} — ${s.album}` : s.artist;
      const idx = library.songs.findIndex((x) => x.id === s.id);
      $k('count').textContent = idx >= 0 ? `${idx + 1} of ${library.songs.length}` : '';
      $k('fmt').textContent = (s.ext || '—').toUpperCase();
      paintColors(s);
      if (lastId && lastId !== s.id) {
        card.classList.remove('swap'); void card.offsetWidth; card.classList.add('swap');
      }
      lastId = s.id;
    }
    renderState();
    renderTime();
  }

  function renderState() {
    const s = player.current;
    const c = (a) => el.querySelector(`[data-act="${a}"]`);
    c('toggle').innerHTML = icon(player.playing ? 'pause' : 'play', 30);
    c('prev').innerHTML = icon('prev', 24);
    c('next').innerHTML = icon('next', 24);
    c('shuffle').innerHTML = icon('shuffle', 20);
    c('shuffle').classList.toggle('on', player.shuffle);
    c('repeat').innerHTML = icon(player.repeat === 'one' ? 'repeat1' : 'repeat', 20);
    c('repeat').classList.toggle('on', player.repeat !== 'off');
    c('fav').innerHTML = icon(s?.fav ? 'heartfill' : 'heart', 22);
    c('fav').classList.toggle('on', !!s?.fav);
    el.querySelector('[data-k="disc"]').classList.toggle('spin', player.playing);
  }

  function setScrubUI(p) {
    p = clamp(p, 0, 1);
    $k('on').style.clipPath = `inset(0 ${(1 - p) * 100}% 0 0)`;
    $k('knob').style.left = `${p * 100}%`;
  }

  function renderTime(previewT) {
    const dur = player.duration;
    const t = previewT ?? player.time;
    $k('elapsed').textContent = fmtTime(t);
    $k('remain').textContent = '-' + fmtTime(Math.max(0, dur - t));
    setScrubUI(dur ? t / dur : 0);
  }

  // ---- scrubbing ----
  const scrub = $k('scrub');
  const pctAt = (e) => { const r = scrub.getBoundingClientRect(); return clamp((e.clientX - r.left) / r.width, 0, 1); };
  scrub.addEventListener('pointerdown', (e) => {
    if (!player.current) return;
    scrubbing = true;
    scrub.setPointerCapture(e.pointerId);
    renderTime(pctAt(e) * player.duration);
  });
  scrub.addEventListener('pointermove', (e) => { if (scrubbing) renderTime(pctAt(e) * player.duration); });
  const endScrub = (e) => {
    if (!scrubbing) return;
    scrubbing = false;
    if (e.type === 'pointerup') player.seek(pctAt(e) * player.duration);
    renderTime();
  };
  scrub.addEventListener('pointerup', endScrub);
  scrub.addEventListener('pointercancel', endScrub);

  // ---- swipe artwork left/right to change track ----
  const wrap = $k('artwrap');
  let sx = null, dx = 0;
  wrap.addEventListener('pointerdown', (e) => { sx = e.clientX; dx = 0; wrap.setPointerCapture(e.pointerId); wrap.style.transition = 'none'; });
  wrap.addEventListener('pointermove', (e) => {
    if (sx === null) return;
    dx = e.clientX - sx;
    wrap.style.transform = `translateX(${dx * 0.6}px) rotate(${dx * 0.04}deg)`;
  });
  const endSwipe = () => {
    if (sx === null) return;
    const moved = dx;
    sx = null;
    wrap.style.transition = 'transform .3s cubic-bezier(.2,.8,.2,1)';
    wrap.style.transform = '';
    if (moved < -60) player.next();
    else if (moved > 60) player.prev();
    else if (Math.abs(moved) < 8) player.toggle(); // tap the disc = play/pause
  };
  wrap.addEventListener('pointerup', endSwipe);
  wrap.addEventListener('pointercancel', () => { sx = null; wrap.style.transform = ''; });

  // ---- buttons ----
  el.addEventListener('click', (e) => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    switch (b.dataset.act) {
      case 'toggle':
        if (!player.current && library.songs.length) player.playList(library.songs, library.songs[0].id);
        else player.toggle();
        break;
      case 'next': player.next(); break;
      case 'prev': player.prev(); break;
      case 'shuffle': player.setShuffle(!player.shuffle); break;
      case 'repeat': player.cycleRepeat(); break;
      case 'fav': if (player.current) library.toggleFav(player.current.id); break;
    }
  });

  offs.push(
    listen(player, 'track', renderTrack),
    listen(player, 'state', renderState),
    listen(player, 'time', () => { if (!scrubbing) renderTime(); }),
    listen(library, 'fav', renderState),
    listen(library, 'change', renderTrack)
  );

  renderTrack();
  app.setEdit('Queue', () => go('queue'));
  return { destroy: () => offs.forEach((f) => f()) };
}
