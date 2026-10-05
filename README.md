# Cosmic X  (v1.2)

A frosted-glass **walking tracker** for Android (similar to Strava), plus the original Cosmic X screens.

## Walk tracker
- **Walk** — the hero widget: a frosted-glass tile with your live route outline, distance, time, calories and pace, plus two small widgets (speed with a glowing-dot arc, elevation gain with a marker arc).
- **Background tracking** — keeps recording with the screen off via a native foreground service (a "walk in progress" notification shows while it runs). Autosaves every 15 s, so a crash never loses your route; unfinished walks are offered for resume.
- **Map** — live OpenStreetMap tiles (drawn dark) with your route; drag, pinch, double-tap to zoom, follow-me, fit-route.
- **History** — every walk with a route card, per-km **splits**, climb, calories, and **Copy GPX** to move a walk to Strava/Komoot.
- **Smart GPS filtering** — drops weak fixes and GPS jumps, ignores standing-still jitter, excludes pauses from time and distance.
- **Haptics** — a buzz at every kilometre, plus taps and detents throughout (Settings → Haptics).
- **Landscape** — rotate for an **iOS 4 Cover Flow of your walks** (frosted route cards, reflections, sprinkles) with Start / Pause / Finish controls.

## Original Cosmic X screens
Moon (real phase, distance, altitude, time-travel dial) · Analytics (weather widgets) · Alarm · Metrics · Data (stacked cards) · Ask (type "start a walk", "set an alarm at 6:30 am", "show me the weather analytics today"…) · orb Menu.

## Get the APK on GitHub
```bash
git add -A && git commit -m "Cosmic X 1.2" && git push
git tag v1.2.0 && git push origin v1.2.0
```
GitHub Actions builds the app and attaches `CosmicX-1.2.0-debug.apk` to a Release (see `.github/workflows/build-apk.yml`; add the keystore secrets there for a signed release APK).

## First run on the phone
1. Open **Walk**, tap ▶. Allow **location** (choose *Allow all the time* for reliable background tracking) and **notifications**.
2. If tracking stops after a while, set Cosmic X to **Battery → Unrestricted** in Android settings.

## Tests
`npm test` runs ~63 checks: tracker maths and a simulated-GPS walk (pauses, glitches, crash recovery), moon astronomy, alarms, prompt intents, the scroll physics, and a smoke test that mounts every screen.

## Notes
- Map tiles come from the public OpenStreetMap server (fine for personal use). For heavy use, switch `TILE_URL` in `www/js/views/map.js` to a tile provider.
- Heart rate, contact time and vertical oscillation in the reference design come from wearables, so the small widgets show GPS-derived speed and elevation instead; calories and steps are estimates.
- Weather needs internet. Distances/speeds come from GPS only; accuracy depends on the sky view.
