import { icon } from '../icons.js';
import { esc, fmtTime, listen, confirmSheet } from '../util.js';

export function mount(el, app, params = {}) {
  const { library, player, go } = app;
  const offs = [];
  let mode = params.mode || 'songs'; // songs | albums | favorites
  let album = null; // when drilling into an album
  let editing = false;

  function visibleSongs() {
    if (album) return album.songs;
    if (mode === 'favorites') return library.songs.filter((s) => s.fav);
    return library.songs;
  }

  function titleFor() {
    if (album) return album.name;
    return mode === 'albums' ? 'Albums' : mode === 'favorites' ? 'Favorites' : 'Library';
  }

  function tileSong(s) {
    const playing = player.current?.id === s.id;
    return `<div class="tile ${playing ? 'playing' : ''}" data-id="${s.id}" role="button" tabindex="0">
      <div class="tile-art" style="${library.artBg(s)}">${s.cover ? '' : icon('note', 30)}</div>
      <div class="tile-meta"><b>${esc(s.title)}</b><span>${esc(s.artist)}</span></div>
      <div class="tile-foot"><i>${fmtTime(s.duration)}</i>
        <span class="eq" aria-hidden="true"><u></u><u></u><u></u></span></div>
      <button class="tile-fav ${s.fav ? 'on' : ''}" data-fav="${s.id}" aria-label="Favorite">${icon(s.fav ? 'heartfill' : 'heart', 16)}</button>
      <button class="tile-del" data-del="${s.id}" aria-label="Delete">${icon('close', 14)}</button>
    </div>`;
  }

  function tileAlbum(a) {
    return `<div class="tile album" data-album="${esc(a.key)}" role="button" tabindex="0">
      <div class="tile-art" style="${library.artBg(a.art)}">${a.art.cover ? '' : icon('disc', 34)}</div>
      <div class="tile-meta"><b>${esc(a.name)}</b><span>${esc(a.artist)}</span></div>
      <div class="tile-foot"><i>${a.songs.length} ${a.songs.length === 1 ? 'song' : 'songs'}</i></div>
    </div>`;
  }

  function render() {
    app.setTitle(titleFor());
    const songs = visibleSongs();
    let body;
    if (!library.songs.length) {
      body = `<div class="empty"><div class="empty-ic">${icon('note', 40)}</div><h2>No songs yet</h2>
        <p>Import music from your phone's storage.</p><button class="cta" data-import>Import songs</button></div>`;
    } else if (mode === 'albums' && !album) {
      body = `<div class="grid">${library.albums().map(tileAlbum).join('')}</div>`;
    } else if (!songs.length) {
      body = `<div class="empty"><div class="empty-ic">${icon('heart', 36)}</div><h2>Nothing here</h2><p>Tap the heart on a song to add it to Favorites.</p></div>`;
    } else {
      body = `<div class="grid ${editing ? 'editing' : ''}">${songs.map(tileSong).join('')}</div>`;
    }
    el.innerHTML = `<div class="lib">
      <div class="seg" role="tablist">
        ${album ? `<button class="seg-back" data-back>${icon('back', 16)} Albums</button>` : ['songs', 'albums', 'favorites'].map((m) => `<button class="${mode === m ? 'on' : ''}" data-mode="${m}">${m[0].toUpperCase() + m.slice(1)}</button>`).join('')}
      </div>
      <div class="lib-scroll">${body}</div></div>`;
    app.setEdit(editing ? 'Done' : 'Edit', toggleEdit, !library.songs.length || (mode === 'albums' && !album));
  }

  function toggleEdit() { editing = !editing; render(); }

  el.addEventListener('click', async (e) => {
    if (e.target.closest('[data-import]')) return app.pickFiles();
    if (e.target.closest('[data-back]')) { album = null; render(); return; }
    const m = e.target.closest('[data-mode]');
    if (m) { mode = m.dataset.mode; album = null; editing = false; render(); return; }

    const fav = e.target.closest('[data-fav]');
    if (fav) { e.stopPropagation(); library.toggleFav(fav.dataset.fav); return; }

    const del = e.target.closest('[data-del]');
    if (del) {
      const s = library.byId.get(del.dataset.del);
      if (s && (await confirmSheet({ title: 'Delete song?', message: `“${s.title}” will be removed from Cosmic X. Your original file is not touched.` }))) {
        await library.remove(s.id);
      }
      return;
    }
    const al = e.target.closest('[data-album]');
    if (al) { album = library.albums().find((a) => a.key === al.dataset.album) || null; render(); return; }

    const tile = e.target.closest('.tile[data-id]');
    if (tile && !editing) {
      player.playList(visibleSongs(), tile.dataset.id);
      go('player');
    }
  });

  offs.push(
    listen(library, 'change', () => {
      if (album && !library.albums().some((a) => a.key === album.key)) album = null;
      else if (album) album = library.albums().find((a) => a.key === album.key);
      render();
    }),
    listen(library, 'fav', (e) => {
      const id = e.detail.id;
      const t = el.querySelector(`[data-fav="${id}"]`);
      if (!t) return;
      if (mode === 'favorites') return render();
      const s = library.byId.get(id);
      t.classList.toggle('on', !!s.fav);
      t.innerHTML = icon(s.fav ? 'heartfill' : 'heart', 16);
    }),
    listen(player, 'track', () => {
      el.querySelectorAll('.tile.playing').forEach((t) => t.classList.remove('playing'));
      const id = player.current?.id;
      if (id) el.querySelector(`.tile[data-id="${id}"]`)?.classList.add('playing');
    }),
    listen(player, 'state', () => el.classList.toggle('is-playing', player.playing))
  );

  el.classList.toggle('is-playing', player.playing);
  render();
  return { destroy: () => offs.forEach((f) => f()) };
}
