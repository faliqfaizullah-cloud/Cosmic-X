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
