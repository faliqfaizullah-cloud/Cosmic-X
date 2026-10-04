// Tiny local listening-time tracker for the Metrics screen.
const KEY = 'cx.listen.v1';
const dayKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

function load() { try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { return {}; } }

export const stats = {
  start(player) {
    setInterval(() => {
      if (!player.playing) return;
      const d = load();
      const k = dayKey();
      d[k] = (d[k] || 0) + 2;
      // keep ~5 weeks only
      const keep = Object.keys(d).sort().slice(-35);
      const out = {};
      keep.forEach((x) => (out[x] = d[x]));
      try { localStorage.setItem(KEY, JSON.stringify(out)); } catch { /* full */ }
    }, 2000);
  },
  todaySec: () => load()[dayKey()] || 0,
  last7() {
    const d = load(), out = [];
    for (let i = 6; i >= 0; i--) {
      const t = new Date(); t.setDate(t.getDate() - i);
      out.push({ label: ['S', 'M', 'T', 'W', 'T', 'F', 'S'][t.getDay()], sec: d[dayKey(t)] || 0 });
    }
    return out;
  },
};
