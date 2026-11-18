import { Capacitor } from '@capacitor/core';
import { FileTransfer } from '@capacitor/file-transfer';
import { Directory, Filesystem } from '@capacitor/filesystem';
import { del, get, set } from 'idb-keyval';
import { app } from './app.svelte';
import { desk } from './desktop';
import { reduce } from './importer';
import type { Item } from './types';

/**
 * Offline copies of every Grok asset.
 *
 * Android app (Capacitor): files are streamed to the app's private storage
 * (files/media/<id>.<ext>) with native HTTP, so CORS doesn't apply and an
 * optional grok.com cookie can be sent. A small JPEG thumbnail is rendered
 * for each file (files/thumbs/<id>.jpg) so the grid stays fast.
 *
 * Desktop (Electron): files go into a real folder (default Pictures/Imagine
 * Library), downloaded by the main process with the cookies of the built-in
 * Grok sign-in window, and served back from app://imagine/library/….
 *
 * Web/PWA: files go into Cache Storage and the service worker serves them
 * from ./offline/… — this only works if assets.grok.com allows CORS.
 */

export interface LocalFile {
  ext: string;
  bytes: number;
  thumb: boolean;
  at: number;
}

export interface OfflineSettings {
  /** Download new items automatically after an import / on start. */
  auto: boolean;
  wifiOnly: boolean;
  parallel: number;
  /** Optional Cookie header for assets.grok.com (Android app only). */
  cookie: string;
  /** Video quality to download; 'off' keeps videos online-only. */
  videos: 'hd' | 'sd' | 'off';
}

interface Persisted {
  version: 1;
  files: Record<string, LocalFile>;
  settings: OfflineSettings;
}

const KEY = 'imagine-library:offline:v1';
const CACHE = 'imagine-offline-v1';
const THUMB = 384;
const UA = 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36';
const MIME: Record<string, string> = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif', mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime' };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function extOf(item: Item): string {
  const m = item.mediaUrl?.match(/\.(jpe?g|png|webp|gif|mp4|webm|mov|m4v)(?:[?#]|$)/i);
  if (m) return m[1].toLowerCase().replace('jpeg', 'jpg').replace('m4v', 'mp4');
  return item.kind === 'video' ? 'mp4' : 'jpg';
}

/** Alternative file names Grok uses for the same asset. */
function candidates(url: string, videos: OfflineSettings['videos'] = 'hd'): string[] {
  const out: string[] = [];
  const m = url.match(/^(.*\/)generated_video(_hd)?\.mp4(\?[^#]*)?$/);
  if (m) {
    const hd = m[1] + 'generated_video_hd.mp4', sd = m[1] + 'generated_video.mp4';
    out.push(...(videos === 'sd' ? [sd, hd] : [hd, sd]));
    return out;
  }
  out.push(url);
  if (/\/image\.jpg(\?|$)/.test(url)) out.push(url.replace(/image\.jpg(\?[^#]*)?$/, 'original_image.jpg'));
  return out;
}

const httpStatus = (e: unknown): number | undefined => {
  const o = (e ?? {}) as { httpStatus?: number; data?: { httpStatus?: number } };
  return o.httpStatus ?? o.data?.httpStatus;
};

function slug(s: string, n = 48): string {
  return (
    s
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^\w\s-]/g, ' ')
      .trim()
      .replace(/\s+/g, '-')
      .slice(0, n)
      .replace(/-+$/, '')
      .toLowerCase() || 'untitled'
  );
}

/** Folder-safe name for exports. */
export function safeName(s: string): string {
  return s.replace(/[\\/:*?"<>|\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80) || 'Imagine';
}

export function exportName(item: Item, ext: string): string {
  const d = new Date(item.createdAt);
  const p = (x: number) => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${slug(item.prompt)}_${item.id.slice(0, 8)}.${ext}`;
}

function errText(e: unknown): string {
  const o = (e ?? {}) as { message?: string; code?: string; httpStatus?: number; data?: { httpStatus?: number; message?: string } };
  const status = o.httpStatus ?? o.data?.httpStatus;
  if (status) return status === 401 || status === 403 ? `HTTP ${status} · Grok refused (sign-in needed?)` : `HTTP ${status}`;
  const m = o.message || o.data?.message || String(e);
  if (/failed to fetch|networkerror|load failed/i.test(m)) return 'Blocked by the browser (CORS) or no connection';
  return m.slice(0, 140);
}

function once(el: EventTarget, ok: string, ms: number): Promise<void> {
  return new Promise((res, rej) => {
    const t = setTimeout(() => done(new Error('Timed out reading media')), ms);
    const okH = () => done();
    const errH = () => done(new Error('Not a valid image/video (login page instead?)'));
    function done(err?: Error) {
      clearTimeout(t);
      el.removeEventListener(ok, okH);
      el.removeEventListener('error', errH);
      if (err) rej(err);
      else res();
    }
    el.addEventListener(ok, okH);
    el.addEventListener('error', errH);
  });
}

interface Thumb {
  canvas: HTMLCanvasElement;
  w: number;
  h: number;
  dur: number | null;
}

/** Decodes the downloaded file (validating it) and renders a small JPEG thumbnail. */
async function makeThumb(src: string, kind: Item['kind']): Promise<Thumb> {
  let el: CanvasImageSource, w: number, h: number, dur: number | null = null;
  if (kind === 'video') {
    const v = document.createElement('video');
    v.muted = true;
    v.playsInline = true;
    v.preload = 'auto';
    v.src = src;
    await once(v, 'loadeddata', 30_000);
    dur = isFinite(v.duration) ? v.duration : null;
    const at = Math.min(0.5, (v.duration || 1) / 3);
    if (Math.abs(v.currentTime - at) > 0.05) {
      v.currentTime = at;
      await once(v, 'seeked', 10_000).catch(() => {});
    }
    el = v;
    w = v.videoWidth;
    h = v.videoHeight;
  } else {
    const img = new Image();
    img.decoding = 'async';
    img.src = src;
    try {
      await img.decode();
    } catch {
      throw new Error('Not a valid image (login page instead?)');
    }
    el = img;
    w = img.naturalWidth;
    h = img.naturalHeight;
  }
  if (!w || !h) throw new Error('Empty media file');
  const s = Math.min(1, THUMB / Math.min(w, h));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(w * s));
  canvas.height = Math.max(1, Math.round(h * s));
  canvas.getContext('2d')!.drawImage(el, 0, 0, canvas.width, canvas.height);
  if (el instanceof HTMLVideoElement) el.removeAttribute('src');
  return { canvas, w, h, dur };
}

const fmtDur = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;

class Offline {
  readonly native = Capacitor.isNativePlatform();
  readonly desktop = !!desk;
  /** Desktop only: download folder and Grok sign-in state. */
  dir = $state('');
  grokIn = $state(false);

  // ---- persisted ----
  files = $state<Record<string, LocalFile>>({});
  settings = $state<OfflineSettings>({ auto: true, wifiOnly: false, parallel: 3, cookie: '', videos: 'hd' });
  ready = $state(false);

  // ---- run state ----
  running = $state(false);
  paused = $state(false);
  total = $state(0);
  done = $state(0);
  left = $state(0);
  note = $state('');
  errors = $state<Record<string, string>>({});
  active = $state<Record<string, { got: number; size: number }>>({});
  exporting = $state(false);

  count = $derived(Object.keys(this.files).length);
  bytes = $derived(Object.values(this.files).reduce((s, f) => s + f.bytes, 0));
  failed = $derived(Object.keys(this.errors).length);
  /** Label for the "save a copy" action on this platform. */
  get saveLabel() {
    return this.desktop ? 'Save to folder' : this.native ? 'Save to phone' : 'Save files';
  }

  #queue: string[] = [];
  #base = '';
  #urlToId = new Map<string, string>();
  #saveTimer: ReturnType<typeof setTimeout> | undefined;
  #autoPaused = false;
  #ready: Promise<void> | null = null;

  init(): Promise<void> {
    return (this.#ready ??= this.#init());
  }

  async #init() {
    try {
      const saved = await get<Persisted>(KEY);
      if (saved?.version === 1) {
        this.files = saved.files ?? {};
        this.settings = { ...this.settings, ...saved.settings };
      }
    } catch { /* fresh start */ }
    if (this.native) {
      try {
        for (const d of ['media', 'thumbs']) await Filesystem.mkdir({ path: d, directory: Directory.Data, recursive: true }).catch(() => {});
        this.#base = (await Filesystem.getUri({ path: '', directory: Directory.Data })).uri.replace(/\/?$/, '/');
        await FileTransfer.addListener('progress', (p) => {
          const id = this.#urlToId.get(p.url);
          if (id && this.active[id]) this.active[id] = { got: p.bytes, size: p.lengthComputable ? p.contentLength : 0 };
        });
      } catch (e) {
        this.note = 'Storage unavailable: ' + errText(e);
      }
    }
    if (desk) {
      try {
        const info = await desk.info();
        this.dir = info.dir;
        this.grokIn = info.signedIn;
        desk.onGrokStatus((s) => (this.grokIn = s));
        desk.onProgress((p) => {
          const id = this.#urlToId.get(p.url);
          if (id && this.active[id]) this.active[id] = { got: p.got, size: p.total };
        });
      } catch (e) {
        this.note = 'Storage unavailable: ' + errText(e);
      }
    }
    window.addEventListener('online', () => this.#maybeResume());
    (navigator as unknown as { connection?: EventTarget }).connection?.addEventListener?.('change', () => this.#maybeResume());
    this.ready = true;
  }

  // ================= urls =================
  #url(rel: string): string {
    if (this.desktop) return `${location.origin}/library/${rel}`;
    return this.native ? Capacitor.convertFileSrc(this.#base + rel) : new URL('offline/' + rel, document.baseURI).href;
  }

  /** Local URL for an item, or null when it isn't downloaded. `full` = original file, else thumbnail. */
  src(item: Item, full: boolean): string | null {
    const f = this.files[item.id];
    if (!f || (this.native && !this.#base)) return null;
    if (!full && f.thumb) return this.#url(`thumbs/${item.id}.jpg`);
    return this.#url(`media/${item.id}.${f.ext}`);
  }

  has(id: string): boolean {
    return !!this.files[id];
  }

  /** Items that can be downloaded (have a media URL). */
  eligible(items: Item[] = app.items): Item[] {
    return items.filter((i) => !!i.mediaUrl && (i.kind !== 'video' || this.settings.videos !== 'off'));
  }

  missing(items: Item[] = app.items): Item[] {
    return this.eligible(items).filter((i) => !this.files[i.id]);
  }

  // ================= queue =================
  /** Queue items for download (default: everything not yet offline) and start. */
  async start(ids?: string[]) {
    await this.init();
    const queued = new Set(this.#queue);
    const want = this.eligible(ids ? ids.map((id) => app.byId.get(id)).filter((i): i is Item => !!i) : app.items)
      .filter((i) => !this.files[i.id] && !queued.has(i.id) && !this.active[i.id])
      .map((i) => i.id);
    for (const id of want) delete this.errors[id];
    if (!this.running) {
      this.total = 0;
      this.done = 0;
    }
    this.#queue.push(...want);
    this.total += want.length;
    this.left = this.#queue.length;
    this.paused = false;
    this.#autoPaused = false;
    this.note = '';
    if (!this.running && this.#queue.length) void this.#run();
    return want.length;
  }

  pause() {
    this.paused = true;
    this.#autoPaused = false;
    this.note = 'Paused';
  }

  resume() {
    if (!this.#queue.length) return void this.start();
    this.paused = false;
    this.#autoPaused = false;
    this.note = '';
    if (!this.running) void this.#run();
  }

  cancel() {
    this.#queue = [];
    this.left = 0;
    this.paused = false;
    this.note = '';
  }

  retryFailed() {
    const ids = Object.keys(this.errors);
    this.errors = {};
    return this.start(ids);
  }

  #maybeResume() {
    if (this.#autoPaused && !this.#blocked()) this.resume();
  }

  #blocked(): string | null {
    if (!navigator.onLine) return 'No connection — waiting';
    const type = (navigator as unknown as { connection?: { type?: string } }).connection?.type;
    if (this.settings.wifiOnly && type === 'cellular') return 'Waiting for Wi-Fi (Wi-Fi only is on)';
    return null;
  }

  async #run() {
    this.running = true;
    let okRun = 0, failStreak = 0;
    const worker = async () => {
      while (this.#queue.length && !this.paused) {
        const block = this.#blocked();
        if (block) {
          this.paused = true;
          this.#autoPaused = true;
          this.note = block;
          break;
        }
        const id = this.#queue.shift()!;
        this.left = this.#queue.length;
        const item = app.byId.get(id);
        if (!item?.mediaUrl || this.files[id]) {
          this.total = Math.max(0, this.total - 1);
          continue;
        }
        this.active[id] = { got: 0, size: 0 };
        try {
          await this.#one(item);
          okRun++;
          failStreak = 0;
          this.done++;
        } catch (e) {
          this.errors[id] = errText(e);
          failStreak++;
          if (!okRun && failStreak >= 6 && !this.paused) {
            this.paused = true;
            this.note = `Every download failed so far: ${this.errors[id]}`;
          }
        } finally {
          delete this.active[id];
        }
      }
    };
    const n = Math.min(6, Math.max(1, Math.round(this.settings.parallel) || 3));
    await Promise.all(Array.from({ length: n }, worker));
    this.running = false;
    this.#save();
    if (!this.#queue.length && !this.paused && this.total) {
      app.say(this.failed ? `Offline: ${this.done} saved, ${this.failed} failed` : `All ${this.done} downloads saved offline`);
    }
  }

  async #one(item: Item) {
    const ext = extOf(item);
    const rel = `media/${item.id}.${ext}`;
    const t = this.desktop ? await this.#fetchDesktop(item, rel) : this.native ? await this.#fetchNative(item, rel) : await this.#fetchWeb(item, rel, ext);
    this.files[item.id] = { ext, bytes: t.bytes, thumb: t.thumb, at: Date.now() };
    // Real pixel size and duration from the file itself.
    if (t.w && t.h) {
      const [w, h] = reduce(t.w, t.h);
      const patch: Partial<Item> = {};
      if (w !== item.w || h !== item.h) Object.assign(patch, { w, h });
      if (item.kind === 'video' && !item.dur && t.dur) patch.dur = fmtDur(t.dur);
      if (Object.keys(patch).length) app.patch([item.id], () => patch);
    }
    this.#save();
  }

  #headers(): Record<string, string> {
    const h: Record<string, string> = { 'User-Agent': UA, Referer: 'https://grok.com/', Accept: '*/*' };
    const c = this.settings.cookie.trim().replace(/^cookie:\s*/i, '');
    if (c) h.Cookie = c;
    return h;
  }

  async #fetchNative(item: Item, rel: string) {
    const D = Directory.Data;
    const part = `media/${item.id}.part`;
    const { uri } = await Filesystem.getUri({ path: part, directory: D });
    const urls = candidates(item.mediaUrl!, this.settings.videos);
    for (let i = 0; i < urls.length; i++) {
      this.#urlToId.set(urls[i], item.id);
      try {
        await FileTransfer.downloadFile({ url: urls[i], path: uri, progress: true, headers: this.#headers(), connectTimeout: 20_000, readTimeout: 90_000 });
        break;
      } catch (e) {
        // Only a "not there" answer is worth trying the next file name.
        const st = httpStatus(e);
        if (!st || st < 400 || st >= 500 || st === 401 || i === urls.length - 1) throw e;
      } finally {
        this.#urlToId.delete(urls[i]);
      }
    }
    try {
      const st = await Filesystem.stat({ path: part, directory: D });
      if (st.size < 256) throw new Error('Empty response (login cookie needed?)');
      await Filesystem.deleteFile({ path: rel, directory: D }).catch(() => {});
      await Filesystem.rename({ from: part, to: rel, directory: D, toDirectory: D });
      let thumb = false, w = 0, h = 0, dur: number | null = null;
      try {
        const t = await makeThumb(this.#url(rel), item.kind);
        ({ w, h, dur } = t);
        const b64 = t.canvas.toDataURL('image/jpeg', 0.82).split(',')[1];
        await Filesystem.writeFile({ path: `thumbs/${item.id}.jpg`, data: b64, directory: D });
        thumb = true;
      } catch (e) {
        // A file that won't decode is most likely an HTML error page.
        await Filesystem.deleteFile({ path: rel, directory: D }).catch(() => {});
        throw e;
      }
      return { bytes: st.size, thumb, w, h, dur };
    } catch (e) {
      await Filesystem.deleteFile({ path: part, directory: D }).catch(() => {});
      throw e;
    }
  }

  async #fetchDesktop(item: Item, rel: string) {
    const d = desk!;
    const part = `media/${item.id}.part`;
    const urls = candidates(item.mediaUrl!, this.settings.videos);
    let bytes = 0;
    for (let i = 0; i < urls.length; i++) {
      this.#urlToId.set(urls[i], item.id);
      const res = await d.download(urls[i], part).finally(() => this.#urlToId.delete(urls[i]));
      if (res.ok) {
        bytes = res.bytes;
        break;
      }
      const st = res.status;
      // Only a "not there" answer is worth trying the next file name.
      if (!st || st === 401 || st >= 500 || i === urls.length - 1) throw st ? { httpStatus: st } : new Error(res.error ?? 'Download failed');
    }
    if (bytes < 256) {
      await d.remove([part]);
      throw new Error('Empty response (sign in to Grok?)');
    }
    await d.rename(part, rel);
    try {
      const t = await makeThumb(this.#url(rel), item.kind);
      const jpg = await new Promise<Blob | null>((r) => t.canvas.toBlob(r, 'image/jpeg', 0.82));
      if (jpg) await d.write(`thumbs/${item.id}.jpg`, await jpg.arrayBuffer());
      return { bytes, thumb: !!jpg, w: t.w, h: t.h, dur: t.dur };
    } catch (e) {
      // A file that won't decode is most likely an HTML error page.
      await d.remove([rel]);
      throw e;
    }
  }

  async #fetchWeb(item: Item, rel: string, ext: string) {
    let res!: Response;
    for (const url of candidates(item.mediaUrl!, this.settings.videos)) {
      res = await fetch(url, { mode: 'cors', credentials: 'omit', referrerPolicy: 'no-referrer' });
      if (res.ok || res.status === 401 || res.status >= 500) break;
    }
    if (!res.ok) throw { httpStatus: res.status };
    if ((res.headers.get('content-type') ?? '').includes('text/html')) throw new Error('Got a web page instead of media (login needed?)');
    const raw = await res.blob();
    const blob = raw.type ? raw : new Blob([raw], { type: MIME[ext] ?? 'application/octet-stream' });
    const obj = URL.createObjectURL(blob);
    let t: Thumb;
    try {
      t = await makeThumb(obj, item.kind);
    } finally {
      URL.revokeObjectURL(obj);
    }
    const jpg = await new Promise<Blob | null>((r) => t.canvas.toBlob(r, 'image/jpeg', 0.82));
    const cache = await caches.open(CACHE);
    const hdr = (b: Blob) => ({ headers: { 'Content-Type': b.type, 'Content-Length': String(b.size) } });
    await cache.put(this.#url(rel), new Response(blob, hdr(blob)));
    if (jpg) await cache.put(this.#url(`thumbs/${item.id}.jpg`), new Response(jpg, hdr(jpg)));
    return { bytes: blob.size, thumb: !!jpg, w: t.w, h: t.h, dur: t.dur };
  }

  // ================= removal =================
  async remove(ids: string[]) {
    for (const id of ids) {
      const f = this.files[id];
      if (!f) continue;
      const rels = [`media/${id}.${f.ext}`, `thumbs/${id}.jpg`];
      if (desk) {
        await desk.remove(rels).catch(() => {});
      } else if (this.native) {
        for (const path of rels) await Filesystem.deleteFile({ path, directory: Directory.Data }).catch(() => {});
      } else {
        const cache = await caches.open(CACHE);
        for (const r of rels) await cache.delete(this.#url(r));
      }
      delete this.files[id];
    }
    this.#save();
  }

  async removeAll() {
    this.cancel();
    while (this.running) await sleep(150);
    if (desk) {
      await desk.clear().catch(() => {});
    } else if (this.native) {
      for (const d of ['media', 'thumbs']) {
        await Filesystem.rmdir({ path: d, directory: Directory.Data, recursive: true }).catch(() => {});
        await Filesystem.mkdir({ path: d, directory: Directory.Data, recursive: true }).catch(() => {});
      }
    } else {
      await caches.delete(CACHE).catch(() => {});
    }
    this.files = {};
    this.errors = {};
    this.total = this.done = 0;
    await del(KEY).catch(() => {});
    this.#save();
  }

  // ================= export =================
  /** Wait until the given ids are no longer queued or downloading. */
  async #settle(ids: string[]) {
    const want = new Set(ids);
    while (this.running && !this.paused && (this.#queue.some((id) => want.has(id)) || Object.keys(this.active).some((id) => want.has(id)))) await sleep(400);
  }

  /**
   * Save copies to the phone: Android → Documents/Imagine Library/<folder>/,
   * browser → regular file downloads. Missing files are downloaded first.
   */
  async exportItems(ids: string[], folder: string) {
    if (this.exporting) return;
    this.exporting = true;
    try {
      const missing = ids.filter((id) => !this.files[id]);
      if (missing.length) {
        app.say(`Downloading ${missing.length} first…`);
        await this.start(missing);
        await this.#settle(missing);
      }
      const ready = ids.map((id) => app.byId.get(id)).filter((i): i is Item => !!i && !!this.files[i.id]);
      if (!ready.length) return void app.say('Nothing downloaded yet to save');
      const dir = `Imagine Library/${safeName(folder)}`;
      let n = 0;
      if (desk) {
        const res = await desk.exportFiles(
          ready.map((it) => ({ rel: `media/${it.id}.${this.files[it.id].ext}`, name: exportName(it, this.files[it.id].ext) })),
          safeName(folder)
        );
        if (res) app.say(res.count ? `${res.count} saved to ${res.dest}` : 'Nothing could be saved');
      } else if (this.native) {
        try { await Filesystem.requestPermissions(); } catch { /* not needed on Android 11+ */ }
        await Filesystem.mkdir({ path: dir, directory: Directory.Documents, recursive: true }).catch(() => {});
        for (const it of ready) {
          const f = this.files[it.id];
          const opts = { from: `media/${it.id}.${f.ext}`, directory: Directory.Data, to: `${dir}/${exportName(it, f.ext)}`, toDirectory: Directory.Documents };
          try {
            await Filesystem.copy(opts);
            n++;
          } catch {
            try {
              await Filesystem.deleteFile({ path: opts.to, directory: Directory.Documents });
              await Filesystem.copy(opts);
              n++;
            } catch { /* skip */ }
          }
        }
        app.say(n ? `${n} saved to Documents/${dir}` : 'Could not write to Documents');
      } else {
        const cache = await caches.open(CACHE);
        for (const it of ready) {
          const f = this.files[it.id];
          const res = await cache.match(this.#url(`media/${it.id}.${f.ext}`));
          if (!res) continue;
          const url = URL.createObjectURL(await res.blob());
          const a = document.createElement('a');
          a.href = url;
          a.download = exportName(it, f.ext);
          document.body.appendChild(a);
          a.click();
          a.remove();
          setTimeout(() => URL.revokeObjectURL(url), 5000);
          n++;
          await sleep(350);
        }
        app.say(`${n} files downloaded`);
      }
    } finally {
      this.exporting = false;
    }
  }

  // ================= persistence =================
  #save() {
    clearTimeout(this.#saveTimer);
    this.#saveTimer = setTimeout(() => {
      const data = $state.snapshot({ version: 1 as const, files: this.files, settings: this.settings }) as Persisted;
      set(KEY, data).catch(() => {});
    }, 500);
  }

  async grokLogin() {
    if (!desk) return;
    this.grokIn = await desk.grokLogin();
    app.say(this.grokIn ? 'Signed in to Grok' : 'Not signed in to Grok');
    if (this.grokIn && this.failed) void this.retryFailed();
  }

  async grokLogout() {
    if (!desk) return;
    this.grokIn = await desk.grokLogout();
    app.say('Signed out of Grok');
  }

  async chooseFolder() {
    if (!desk) return;
    if (this.running && !this.paused) return void app.say('Pause downloads before changing the folder');
    const r = await desk.chooseFolder();
    if (!r) return;
    this.dir = r.dir;
    app.say(r.moved ? `Moved downloads to ${r.dir}` : `Download folder: ${r.dir}`);
  }

  saveSettings() {
    this.#save();
  }
}

export const offline = new Offline();

export function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  const u = ['KB', 'MB', 'GB', 'TB'];
  let i = -1;
  do {
    n /= 1024;
    i++;
  } while (n >= 1024 && i < u.length - 1);
  return `${n.toFixed(n < 10 ? 1 : 0)} ${u[i]}`;
}
