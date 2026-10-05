import { tracker } from './tracker.js';
import { alarms } from './alarms.js';
import { haptic } from './haptics.js';
import { confirmSheet } from './util.js';
import { fmtKm, fmtDur } from './track-math.js';
import { openActivitySheet } from './activity-sheet.js';

/** Start / pause / resume: shared by the Walk screen and the landscape controls. */
export async function toggleWalk() {
  if (tracker.state === 'idle') {
    haptic.thud();
    await alarms.requestPermission(); // Android 13+: lets the "walk in progress" notification show
    await tracker.start();
  } else if (tracker.state === 'recording') { haptic.press(); await tracker.pause(); }
  else { haptic.press(); await tracker.resume(); }
}

export async function finishWalk(app, { sheetMap = true } = {}) {
  if (tracker.state === 'idle') return;
  const ok = await confirmSheet({ title: 'Finish this walk?', message: `${fmtKm(tracker.distance)} km · ${fmtDur(tracker.elapsed())}`, confirm: 'Finish', danger: false });
  if (!ok) return;
  const act = await tracker.stop();
  if (act) openActivitySheet(app, act, { onMap: sheetMap });
  else app.toast('Walk was too short to save');
}
