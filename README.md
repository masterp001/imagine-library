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

- Media comes from `https://assets.grok.com/<key>` and is downloaded onto the phone
  (see **Offline** below). Items not downloaded yet are streamed, or fall back to the
  thumbhash preview.
- Videos in the same conversation as an image become an **image → video chain**; several
  images in one conversation become **Variations**.
- Everything is stored locally (IndexedDB). Nothing is uploaded.

### Updating the Android app
Every CI build gets a higher version (`1.<run number>`, shown at the bottom of the
Import screen) and is signed with the same key (`android/app/imagine-debug.keystore`),
so a new APK installs over the old one and keeps your library and downloads.
Builds made before this change were signed with random keys: uninstall that old app
once, then install the new APK.

## Desktop app (Windows)
Same app in an Electron window, with a desktop layout: navigation rail, up to 9 grid
columns, detail view with media left and info right, arrow keys / Esc.
- **Get it:** GitHub → Actions → *Desktop (Windows)* → latest run → *Artifacts* →
  `imagine-library-windows` (setup `.exe` and a portable `.exe`, unsigned: on the
  SmartScreen prompt choose *More info → Run anyway*).
- **Grok sign-in:** Offline → *Sign in* opens grok.com in its own window. Downloads then
  use that session's cookies (stored only in the app, `persist:grok` partition).
- **Download folder:** default `Pictures\Imagine Library` (`media\`, `thumbs\`), changeable
  in Offline (existing files are moved). *Save to folder* copies a collection/selection
  to `<folder you pick>\<collection>\` with readable file names.
- Run from source: `npm install && npm run desktop`. Build: `npm run desktop:win`
  (Windows) or `npm run desktop:dist` (current OS).
- Code: `electron/main.ts` (window, `app://` protocol with Range support, downloads,
  dialogs), `electron/preload.ts` (bridge), `src/lib/desktop.ts` (types).

## Views and filters
Library → four views (`src/lib/views.ts`), each sorted newest or oldest first (⇅):
- **Date** – grouped by day.
- **Sessions** – runs of activity; a new session starts after 30 min without a new item.
- **Conversations** – grouped by `sourceConversationId` (title if the data has one).
- **Chains** – connected by `inputAssets` / `rootAssetId` (plus parent links from live
  sync), shown left to right in generation order, uploads marked. Filters pick chains
  without cutting them apart.

Filters: **Generated / Uploads** (`isModelGenerated`, `fileSource`) and **MIME type**
(`mimeType`: JPEG, PNG, MP4 …), plus favorites only (♥). The detail view shows source,
MIME type and generation type (`mediaGenInput`: text → image, image → image,
image → video …), links to the item's session / conversation / chain, and *Made from*,
*Used in* and *Same request* (`responseId`).

Everything comes from Grok's data, no guessing. The official data export has no
conversation ids, inputs or upload flags; those come from **live sync**, which reads
`GET /rest/assets?includeImagineFiles=true&source=SOURCE_ANY&pageSize=100&pageToken=…`
(the list behind grok.com/files) before the Imagine post list. Both passes run
independently; incremental runs stop after two pages that bring nothing new.

Performance: saving no longer snapshots the whole library on every change (tracking
reads fields only; the copy + IndexedDB write runs debounced on idle and on
pagehide/hidden). Favoriting in a 14k library: ~900 ms → ~40 ms.

## Live sync (Android + desktop)
Import tab → **Live sync with Grok**. After signing in (Offline tab or the button on the
card) the app reads your asset list (see *Views*) and the same list grok.com/imagine loads — `POST /rest/media/post/list`
`{ limit, filter: { source }, cursor }` → `{ posts[…childPosts], nextCursor }` — from a
hidden grok.com page, so requests carry your session like the website's own.
- **Sync now** is incremental: newest first, stops after two pages with nothing new.
  **Full sync** walks everything and refreshes sizes, models and image→video links.
- Which `source` covers the whole library is undocumented; the app probes a few values
  and keeps the one returning the newest posts (re-checked weekly). *Liked* limits it to
  liked/saved posts.
- Optional quiet sync on app start (at most every 30 min). New items are downloaded
  automatically if *Download automatically* is on.
- Unofficial endpoint: it can change without notice. The data export import stays as a
  fallback. Re-importing an export never overwrites better data (size, length, model,
  links) the library already has.

## Official xAI export
The account export from grok.com (Settings → Data → *Download your data*, file
`prod-grok-backend.json`) is imported directly: every entry of `media_posts`
becomes an item. The post id is the asset id, so files are fetched from
`assets.grok.com/users/<user_id>/generated/<id>/image.jpg` and
`…/generated_video_hd.mp4` (falls back to `generated_video.mp4`, `original_image.jpg`).
That export has no aspect ratio, so tiles start square and get their real size
once the file is downloaded.

## Offline & downloads
**Offline** tab → *Download all*. Every image and video is copied onto the device; the app
then works with no connection at all.
- **Android app:** native downloads (no CORS limits) into the app's private storage
  (`files/media/<id>.<ext>`) plus a 384 px JPEG thumbnail per item (`files/thumbs/`) so the
  grid stays fast with thousands of items. Real pixel size and video length are read from
  the file. Optional **grok.com cookie** (Offline → cookie) if Grok answers 401/403.
- **Browser/PWA:** stored in Cache Storage and served by the service worker from
  `./offline/…` — only works if assets.grok.com allows CORS.
- Videos: HD / SD / off (off keeps them online-only to save space).
- Automatic after each import and on app start (toggle), Wi-Fi-only mode, 1–6 parallel
  downloads, pause / resume / stop, retry failed, per-file progress.
- **Per collection:** download for offline, or **Save to phone** → copies the files to
  `Documents/Imagine Library/<collection>/` (Files app; browser: normal downloads).
  Also from the detail page and the multi-select bar (*Save*).
- Downloads pause while Android puts the app in the background; keep it open for big runs.

## Features
- Library: masonry ⇄ grid, day sections, filters (Images / Videos / Favorites / Chains),
  progressive rendering for large libraries
- Long-press a tile → multi-select → Add to collection / Group / Favorite / Copy links
- Detail: real image/video, favorite, 5-star rating, notes (searchable), chain, variations,
  collections, metadata with copy, Open/Remix in Grok (Remix copies the prompt first)
- Search with highlights, scopes (All / Prompt / Notes / Metadata) and field filters:
  `seed:` `mode:` `model:` `kind:` `ratio:` `note:` `prompt:`
- Collections: create, rename (tap title), delete, save a session / conversation / chain as a collection
- Android back gesture/button navigates inside the app

## Project layout
```
src/App.svelte                 shell: nav bar, bulk bar, sheets, toast
src/lib/app.svelte.ts          app state (runes), navigation + history, import, persistence
src/lib/importer.ts            tolerant Grok export parser + merge
src/lib/offline.svelte.ts      download queue, on-device storage, thumbnails, export
src/lib/views.ts               date / session / conversation / chain views, filters
src/lib/search.ts              query parsing, matching, highlight segments
src/lib/screens/*.svelte       Library, Detail, Search, Collections, CollectionView, Offline, Sync (Import)
src/lib/components/*.svelte    Tile, Media, Chip, Toggle, Sheet, Icon…
scripts/subset-icons.py        rebuilds the 42 KB Material Symbols subset from scripts/icons.txt
android/                       Capacitor Android project
```
New icon? Add its name to `scripts/icons.txt`, then
`pip install fonttools brotli && python3 scripts/subset-icons.py`.
