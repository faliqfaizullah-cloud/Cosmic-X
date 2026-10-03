# Cosmic X

A glassy music player for Android, based on the Cosmic X concept UI: dotted-grid black canvas, radial glass-orb menu, big gradient cards, 3D stacked cards, and a blurred-gradient prompt screen.

- **Import your own songs** from phone storage (mp3, m4a/aac, flac, ogg/opus, wav). Title, artist, album and cover art are read from the file tags.
- **Portrait** — the Cosmic X UI: Menu (orbs) · Now Playing · Library · Queue (stacked cards) · Search · Settings.
- **Landscape** — rotate the phone for an **iOS 4 style Cover Flow** with glossy reflections and colourful **sprinkles** drifting behind it (they speed up while music plays).

## Get the APK on GitHub

1. Create a new GitHub repo and push this folder to it.
2. Release it:
   ```bash
   git tag v1.0.0
   git push --tags
   ```
3. GitHub Actions (`.github/workflows/build-apk.yml`) builds the app and attaches **CosmicX-1.0.0-debug.apk** to a new Release. You can also run it by hand from the **Actions** tab (the APK is attached as a build artifact).

The debug-signed APK installs fine on any phone (allow "install unknown apps"). For a properly signed release APK, add these **repository secrets** and the workflow signs automatically:

| Secret | Value |
|---|---|
| `ANDROID_KEYSTORE_BASE64` | `base64 -w0 my-release.jks` |
| `ANDROID_KEYSTORE_PASSWORD` | keystore password |
| `ANDROID_KEY_ALIAS` | key alias |
| `ANDROID_KEY_PASSWORD` | key password (optional if same as keystore) |

Create a keystore once with `keytool -genkeypair -v -keystore my-release.jks -alias cosmicx -keyalg RSA -keysize 2048 -validity 10000`, and **keep it safe** — updates must be signed with the same key.

## Build locally

Needs Node 20+, JDK 21 and the Android SDK (or Android Studio).

```bash
npm install
npx cap add android
npm run android:assets     # icons, colours, black launch screen
npx cap sync android
npm run apk:debug          # -> android/app/build/outputs/apk/debug/app-debug.apk
```
To tweak the web UI, edit files in `www/` and run `npx cap sync android` again. Change the package id (`com.cosmicx.player`) in `capacitor.config.json` before publishing.

## Project layout

```
www/                  the whole app (plain HTML/CSS/ES modules, no bundler)
  js/main.js          shell, router, orientation switch (portrait <-> Cover Flow)
  js/coverflow.js     iOS 4 Cover Flow (CSS 3D + box-reflect, spring physics)
  js/sprinkles.js     canvas sprinkles + sparkles
  js/player.js        audio engine: queue, shuffle, repeat, Media Session
  js/library.js, db.js, tags.js   import pipeline, IndexedDB, ID3/MP4/FLAC/Ogg tag reader
  js/views/           menu · player · library · queue · search · settings
resources/android/    launcher icons + colours applied by scripts/apply-android-assets.mjs
test/                 `npm test` — tag parser + scroller physics
```

## Notes

- Imported songs are **copied into the app's own storage** (IndexedDB), so they keep working if the original file moves. Use Settings → Clear library to free the space.
- Android can pause a WebView's audio shortly after the screen locks on some phones. A native foreground-service plugin would make background playback bulletproof.
- *Beat-reactive sprinkles* (Settings, beta) route audio through Web Audio; it's off by default because it can interfere with background playback.
- The Cosmic X concept video is a design reference. This project recreates the look from scratch and uses none of its assets.
