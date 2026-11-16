# Imagine Library

Browse, search and group your Grok Imagine generations — Android, Material 3 dark.
Svelte 5 + TypeScript + Tailwind v4, packaged as a PWA **and** a native Android app (Capacitor 8).

## Run it on your phone

### A) Android APK, no tools on your PC (GitHub Actions)
1. Push this folder to a GitHub repo (`main` branch).
2. Actions → **Android APK** builds `app-debug.apk` automatically (~4 min).
3. Open the run on your phone → *Artifacts* → download, unzip, install
   (allow "Install unknown apps" for your browser once).

### B) Android APK built locally
Requires Android Studio (or the Android SDK + JDK 21).
```bash
npm install
npm run android:apk          # → android/app/build/outputs/apk/debug/app-debug.apk
# or: npm run android:sync && npm run android:open   (then Run ▶ in Android Studio)
```
Install via USB: `adb install android/app/build/outputs/apk/debug/app-debug.apk`

### C) Installable web app (PWA)
- **GitHub Pages:** Settings → Pages → Source: *GitHub Actions*; the **Deploy PWA** workflow
  publishes on every push. Open the URL in Chrome on the phone → ⋮ → *Install app*.
- **Same Wi-Fi, quick test:** `npm run build && npm run preview` → open
  `http://<PC-IP>:4173` on the phone. (Install/offline needs HTTPS, so use Pages for that.)

## Getting your data in
**Import** tab → *Import export file* (or *Paste*). Accepts the Grok/Imagine export JSON
(conversation list with `latestAssetMetadata`: `assetId`, `key`, `prompt`, `modelName`,
`aspectRatio`, `rRated`, `thumbhash`). The importer walks the whole JSON tree, so nesting
differences don't matter; duplicate `assetId`s are merged. Re-importing keeps your
favorites, ratings, notes and collections.

- Media is loaded from `https://assets.grok.com/<key>`. If those URLs need your grok.com
  login, tiles fall back to the thumbhash preview.
- Videos in the same conversation as an image become an **image → video chain**; several
  images in one conversation become **Variations**.
- **Smart groups** are computed on-device from prompt keywords.
- Everything is stored locally (IndexedDB). Nothing is uploaded.

## Features
- Library: masonry ⇄ grid, day sections, filters (Images / Videos / Favorites / Chains),
  smart-group strip, progressive rendering for large libraries
- Long-press a tile → multi-select → Add to collection / Group / Favorite / Copy links
- Detail: real image/video, favorite, 5-star rating, notes (searchable), chain, variations,
  collections, metadata with copy, Open/Remix in Grok (Remix copies the prompt first)
- Search with highlights, scopes (All / Prompt / Notes / Metadata) and field filters:
  `seed:` `mode:` `model:` `kind:` `ratio:` `note:` `prompt:`
- Collections: create, rename (tap title), delete, save a smart group as a collection
- Android back gesture/button navigates inside the app

## Project layout
```
src/App.svelte                 shell: nav bar, bulk bar, sheets, toast
src/lib/app.svelte.ts          app state (runes), navigation + history, import, persistence
src/lib/importer.ts            tolerant Grok export parser + merge
src/lib/cluster.ts             smart groups (prompt similarity)
src/lib/search.ts              query parsing, matching, highlight segments
src/lib/screens/*.svelte       Library, Detail, Search, Collections, CollectionView, Sync (Import)
src/lib/components/*.svelte    Tile, Media, Chip, Toggle, Sheet, Icon…
scripts/subset-icons.py        rebuilds the 42 KB Material Symbols subset from scripts/icons.txt
android/                       Capacitor Android project
```
New icon? Add its name to `scripts/icons.txt`, then
`pip install fonttools brotli && python3 scripts/subset-icons.py`.
