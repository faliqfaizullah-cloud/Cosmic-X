// Run after `npx cap add android`: applies Cosmic X icons/colours, a black launch screen,
// and (optionally) version numbers taken from APP_VERSION / APP_VERSION_CODE env vars.
import { cpSync, existsSync, readFileSync, writeFileSync } from 'node:fs';

const res = 'android/app/src/main/res';
if (!existsSync(res)) {
  console.error('android/ not found. Run `npx cap add android` first.');
  process.exit(1);
}
cpSync('resources/android/res', res, { recursive: true, force: true });
console.log('✓ copied icons + colours');

const styles = `${res}/values/styles.xml`;
if (existsSync(styles)) {
  const s = readFileSync(styles, 'utf8');
  const out = s.replaceAll('@drawable/splash', '@android:color/black');
  if (out !== s) { writeFileSync(styles, out); console.log('✓ black launch screen'); }
}

const gradle = 'android/app/build.gradle';
const { APP_VERSION, APP_VERSION_CODE } = process.env;
if (existsSync(gradle) && (APP_VERSION || APP_VERSION_CODE)) {
  let g = readFileSync(gradle, 'utf8');
  if (APP_VERSION) g = g.replace(/versionName\s+"[^"]*"/, `versionName "${APP_VERSION}"`);
  if (APP_VERSION_CODE) g = g.replace(/versionCode\s+\d+/, `versionCode ${APP_VERSION_CODE}`);
  writeFileSync(gradle, g);
  console.log(`✓ version ${APP_VERSION} (${APP_VERSION_CODE})`);
}

// Permissions: haptics, alarm notifications, internet (weather + map tiles), location, and the foreground
// service that keeps the walk tracker recording with the screen off.
const manifest = 'android/app/src/main/AndroidManifest.xml';
if (existsSync(manifest)) {
  let m = readFileSync(manifest, 'utf8');
  const perms = [
    'android.permission.INTERNET',
    'android.permission.VIBRATE',
    'android.permission.POST_NOTIFICATIONS',
    'android.permission.SCHEDULE_EXACT_ALARM',
    'android.permission.RECEIVE_BOOT_COMPLETED',
    'android.permission.ACCESS_COARSE_LOCATION',
    'android.permission.ACCESS_FINE_LOCATION',
    'android.permission.FOREGROUND_SERVICE',
    'android.permission.FOREGROUND_SERVICE_LOCATION',
    'android.permission.WAKE_LOCK',
  ];
  const add = perms.filter((p) => !m.includes(`"${p}"`)).map((p) => `    <uses-permission android:name="${p}" />`).join('\n');
  if (add) {
    m = m.replace('</manifest>', `${add}\n</manifest>`);
    writeFileSync(manifest, m);
    console.log('✓ manifest permissions');
  }
}
