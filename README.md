# Audiobook Studio (iPhone app, Capacitor)

Home page: **Quick speech** (text → one MP3/M4A/WAV) and **Projects** (chapters → voices → multi-track timeline → M4B/M4A/MP3/WAV).

## Files
- `src/` – source to edit: `app.css`, `mp4.js` (M4A/M4B writer), `audio.js` (storage, mixer, encoders),
  `engine.js` (voice engines), `app.js` (projects, script, voices), `quick.js` (Quick speech), `studio.js` (timeline, export, setup).
- `build.py` – bundles everything into `www/index.html` (the app Capacitor loads). Run it after any change.
- `package.json`, `capacitor.config.json`, `codemagic.yaml` – iOS build via Codemagic (no Mac needed).

## Building for iPhone (TestFlight)
1. Put this folder in a new GitHub repo and connect it to Codemagic.
2. In `codemagic.yaml`, set `YOUR_ASC_KEY_NAME` to your existing App Store Connect integration name.
3. Register the bundle ID `com.stevenwilliams.audiobookstudio` and create the app record in App Store Connect.
4. Start the "iOS TestFlight" workflow. The first build creates the `ios/` project automatically.

## Voice engines
- **web** – kokoro-js inside the app (works now; downloads ~90 MB once; slower).
- **native** – Capacitor plugin `KokoroTTS` (next phase, sherpa-onnx). Used automatically when present.
  Contract: `load() -> {sampleRate, voices}`, `synthesize({text, voice, speed}) -> {sampleRate, pcm16 (base64 Int16 LE mono)}`.
- **mock** – test tones (add `?engine=mock` when opening `www/index.html` in a desktop browser).

## Export notes
- MP3: ID3 tags, cover art and chapter markers.
- M4B/M4A: AAC (needs iOS 26+), chapter track, iTunes tags, cover, audiobook media type.
- Files go to the iOS share sheet (Save to Files, AirDrop, etc.).
