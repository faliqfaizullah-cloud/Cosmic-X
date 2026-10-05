// IndexedDB: finished activities + one "live" record that is autosaved while a walk is being recorded,
// so a crash / app kill never loses the route.
const DB = 'cosmicx-walk';
let dbp;

function open() {
  return (dbp ??= new Promise((resolve, reject) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => {
      const db = r.result;
      if (!db.objectStoreNames.contains('acts')) db.createObjectStore('acts', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('live')) db.createObjectStore('live');
    };
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  }));
}
const req = (r) => new Promise((resolve, reject) => { r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
const store = (name, mode = 'readonly') => open().then((db) => db.transaction(name, mode).objectStore(name));
const done = (r) => req(r).then(() => undefined);

export const getActivities = () => store('acts').then((s) => req(s.getAll()));
export const putActivity = (a) => store('acts', 'readwrite').then((s) => done(s.put(a)));
export const deleteActivity = (id) => store('acts', 'readwrite').then((s) => done(s.delete(id)));
export const clearActivities = () => store('acts', 'readwrite').then((s) => done(s.clear()));
export const getLive = () => store('live').then((s) => req(s.get('current')));
export const putLive = (v) => store('live', 'readwrite').then((s) => done(s.put(v, 'current')));
export const clearLive = () => store('live', 'readwrite').then((s) => done(s.delete('current')));
