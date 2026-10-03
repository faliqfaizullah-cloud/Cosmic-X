// IndexedDB storage: song metadata ("songs") and the audio blobs ("files") live in separate stores
// so listing the library never has to touch the big audio data.
const DB = 'cosmicx';
let dbp;

function open() {
  return (dbp ??= new Promise((resolve, reject) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => {
      const db = r.result;
      if (!db.objectStoreNames.contains('songs')) {
        const s = db.createObjectStore('songs', { keyPath: 'id' });
        s.createIndex('key', 'key', { unique: false });
      }
      if (!db.objectStoreNames.contains('files')) db.createObjectStore('files');
    };
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  }));
}

const req = (r) =>
  new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });

function tx(stores, mode, fn) {
  return open().then(
    (db) =>
      new Promise((resolve, reject) => {
        const t = db.transaction(stores, mode);
        t.oncomplete = () => resolve();
        t.onerror = () => reject(t.error);
        t.onabort = () => reject(t.error);
        fn(t);
      })
  );
}

export const getAllSongs = () => open().then((db) => req(db.transaction('songs').objectStore('songs').getAll()));
export const getFile = (id) => open().then((db) => req(db.transaction('files').objectStore('files').get(id)));
export const putSong = (song, blob) =>
  tx(['songs', 'files'], 'readwrite', (t) => {
    t.objectStore('songs').put(song);
    if (blob) t.objectStore('files').put(blob, song.id);
  });
export const updateSong = (song) => tx(['songs'], 'readwrite', (t) => t.objectStore('songs').put(song));
export const deleteSong = (id) =>
  tx(['songs', 'files'], 'readwrite', (t) => {
    t.objectStore('songs').delete(id);
    t.objectStore('files').delete(id);
  });
export const clearAll = () =>
  tx(['songs', 'files'], 'readwrite', (t) => {
    t.objectStore('songs').clear();
    t.objectStore('files').clear();
  });
export const hasKey = (key) =>
  open().then((db) => req(db.transaction('songs').objectStore('songs').index('key').count(IDBKeyRange.only(key))).then((n) => n > 0));
