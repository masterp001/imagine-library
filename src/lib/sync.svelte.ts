import { get, set } from 'idb-keyval';
import { app } from './app.svelte';
import { desk } from './desktop';
import { GrokSession } from './grokSession';
import { fromPostList, parseExport, type ParsedAsset } from './importer';
import { offline } from './offline.svelte';

/**
 * Live sync with grok.com/imagine (Android + desktop app, needs the in-app sign-in).
 *
 * Uses the list endpoint behind the Imagine page: POST /rest/media/post/list
 * { limit, filter: { source }, cursor } → { posts: [... childPosts], nextCursor }.
 * The endpoint is unofficial. Which `source` covers the whole library (not just
 * likes) is undocumented, so a few candidates are probed and the one returning
 * the newest posts wins (re-checked weekly).
 */

const KEY = 'imagine-library:sync:v1';
const PATH = '/rest/media/post/list';
const PAGE = 40;
const CANDIDATES: (string | null)[] = [
  null,
  'MEDIA_POST_SOURCE_OWNED',
  'MEDIA_POST_SOURCE_USER',
  'MEDIA_POST_SOURCE_GENERATED',
  'MEDIA_POST_SOURCE_HISTORY',
  'MEDIA_POST_SOURCE_ALL',
  'MEDIA_POST_SOURCE_LIKED'
];
const LIKED = 'MEDIA_POST_SOURCE_LIKED';
const WEEK = 7 * 24 * 3600_000;

export interface SyncSettings {
  /** 'auto' = whole library (probed source), 'liked' = only liked/saved. */
  mode: 'auto' | 'liked';
  /** Sync quietly when the app starts (at most every 30 min). */
  onStart: boolean;
  lastSync: number;
  lastAdded: number;
  /** Probed source; undefined = not probed yet, null = no filter. */
  source?: string | null;
  sourceAt?: number;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function request(path: string, body: unknown, reload: boolean, method: 'GET' | 'POST'): Promise<{ status: number; text: string }> {
  const b = body == null ? '' : JSON.stringify(body);
  if (desk) return desk.grokApi(path, b, reload, method);
  if (GrokSession) return GrokSession.api({ path, body: b, reload, method });
  throw new Error('Live sync needs the Android or desktop app');
}

/** Asset list behind grok.com/files: every image/video incl. uploads, with sourceConversationId, inputAssets, … */
const assetsPath = (token: string) =>
  '/rest/assets?' +
  new URLSearchParams({
    pageSize: '100',
    orderBy: 'ORDER_BY_LAST_USE_TIME',
    source: 'SOURCE_ANY',
    includeImagineFiles: 'true',
    ...(token ? { pageToken: token } : {})
  });

const bodyFor = (source: string | null, limit: number, cursor?: string | null) => ({
  limit,
  ...(source ? { filter: { source } } : {}),
  ...(cursor ? { cursor } : {})
});

const sourceName = (s: string | null | undefined) =>
  s === undefined ? 'not checked yet' : s === null ? 'everything (no filter)' : s.replace('MEDIA_POST_SOURCE_', '').toLowerCase();

class LiveSync {
  readonly available = !!desk || !!GrokSession;

  settings = $state<SyncSettings>({
    mode: 'auto',
    onStart: true,
    lastSync: 0,
    lastAdded: 0
  });
  running = $state(false);
  page = $state(0);
  seen = $state(0);
  note = $state('');
  #stop = false;
  #ready: Promise<void> | null = null;

  get sourceLabel() {
    return this.settings.mode === 'liked' ? 'liked only' : sourceName(this.settings.source);
  }

  init() {
    return (this.#ready ??= get<SyncSettings>(KEY)
      .then((s) => {
        if (s) this.settings = { ...this.settings, ...s };
      })
      .catch(() => {}));
  }

  save() {
    set(KEY, $state.snapshot(this.settings)).catch(() => {});
  }

  /** One list request with retry: waits on rate limits, re-warms the page on 401/403 once. */
  #list(body: unknown): Promise<{ posts?: unknown[]; nextCursor?: string }> {
    return this.#call(PATH, body, 'POST') as Promise<{
      posts?: unknown[];
      nextCursor?: string;
    }>;
  }

  /** One request with retry: waits on rate limits, re-warms the page on 401/403 once. */
  async #call(path: string, body: unknown, method: 'GET' | 'POST'): Promise<Record<string, unknown>> {
    let reload = false;
    for (let attempt = 0; attempt < 6; attempt++) {
      if (this.#stop) throw new Error('Stopped');
      const res = await request(path, body, reload, method);
      reload = false;
      if (res.status === 429 || res.status === 503 || res.status === 0) {
        this.note = res.status === 0 ? 'Connection problem, retrying…' : 'Grok asks to slow down, waiting…';
        await sleep(5000 * (attempt + 1));
        continue;
      }
      if (res.status === 401 || res.status === 403) {
        if (attempt === 0) {
          reload = true;
          continue;
        }
        throw new Error(`Grok refused the request (HTTP ${res.status}). Sign in again in the Offline tab.`);
      }
      if (res.status < 200 || res.status >= 300) throw new Error(`grok.com answered HTTP ${res.status}`);
      try {
        return JSON.parse(res.text);
      } catch {
        throw new Error('Unexpected answer from grok.com (not JSON)');
      }
    }
    throw new Error('grok.com kept rate-limiting, try again later');
  }

  async #source(): Promise<string | null> {
    if (this.settings.mode === 'liked') return LIKED;
    if (this.settings.source !== undefined && Date.now() - (this.settings.sourceAt ?? 0) < WEEK) return this.settings.source;
    this.note = 'Finding your library…';
    let best: string | null | undefined,
      bestNewest = -1,
      bestCount = 0,
      anyOk = false;
    for (const c of CANDIDATES) {
      try {
        const data = await this.#list(bodyFor(c, 8));
        anyOk = true;
        const parsed = fromPostList(data.posts);
        if (!parsed.length) continue;
        const newest = Math.max(...parsed.map((p) => p.createdAt ?? 0));
        // Newest content wins; on a tie the earlier (wider) candidate stays.
        if (newest > bestNewest || (newest === bestNewest && parsed.length > bestCount)) {
          best = c;
          bestNewest = newest;
          bestCount = parsed.length;
        }
      } catch (e) {
        if ((e as Error).message.startsWith('Grok refused')) throw e;
      }
    }
    // Grok answers but has no posts anywhere: nothing to sync yet, not an error.
    if (best === undefined && anyOk) best = null;
    if (best === undefined) throw new Error('Could not read your Imagine library. Sign in again in the Offline tab.');
    this.settings.source = best;
    this.settings.sourceAt = Date.now();
    this.save();
    return best;
  }

  /**
   * Fetch new posts. Incremental by default: stops after two pages with
   * nothing new. `full` walks the whole list (also refreshes sizes, models
   * and image→video links of known items).
   */
  async run(full = false, quiet = false) {
    if (this.running || !this.available) return;
    await this.init();
    await offline.init();
    if (!offline.grokIn) {
      if (!quiet) app.say('Sign in to Grok first (Offline tab)');
      return;
    }
    this.running = true;
    this.#stop = false;
    this.page = this.seen = 0;
    this.note = 'Connecting…';
    let added = 0,
      updated = 0;
    let batch: ParsedAsset[] = [];
    const flush = () => {
      if (!batch.length) return;
      const r = app.mergeParsed(batch, full ? 'Live sync (full)' : 'Live sync');
      added += r.added;
      updated += r.updated;
      batch = [];
    };
    let ok = 0,
      problems: string[] = [];
    try {
      // 1) Asset list: adds uploads and the exact fields (conversation, inputs, request, MIME).
      try {
        const r = await this.#assetsPass(full, (list) => {
          batch.push(...list);
          if (batch.length >= 800) flush();
        });
        this.assetsNote = r;
        ok++;
      } catch (e) {
        if ((e as Error).message === 'Stopped') throw e;
        this.assetsNote = `Asset list unavailable: ${(e as Error).message}`;
        problems.push('asset list');
      }
      flush();
      // 2) Imagine post list (newest posts, video links). Independent of step 1.
      this.page = 0;
      try {
        const source = await this.#source();
        let cursor: string | null = null,
          staleStreak = 0;
        do {
          this.page++;
          this.note = `Page ${this.page} · ${this.seen.toLocaleString('en-US')} posts · ${added} new`;
          const data = await this.#list(bodyFor(source, PAGE, cursor));
          const parsed = fromPostList(data.posts);
          const fresh = parsed.filter((p) => !app.byId.has(p.id) && !batch.some((b) => b.id === p.id)).length;
          this.seen += parsed.length;
          batch.push(...parsed);
          if (batch.length >= 800) flush();
          if (!full) {
            staleStreak = parsed.length && !fresh ? staleStreak + 1 : 0;
            if (staleStreak >= 2) break;
          }
          cursor = typeof data.nextCursor === 'string' && data.nextCursor ? data.nextCursor : null;
          // Grok rate-limits roughly every 30 pages; pace a little.
          await sleep(this.page % 30 === 0 ? 5000 : 300);
        } while (cursor && !this.#stop);
        ok++;
      } catch (e) {
        if ((e as Error).message === 'Stopped') throw e;
        problems.push(`post list (${(e as Error).message})`);
      }
      flush();
      if (!ok) throw new Error(`Live sync failed: ${problems.join(', ')}`);
      this.settings.lastSync = Date.now();
      this.settings.lastAdded = added;
      this.save();
      this.note = problems.length ? `Partly synced. Unavailable: ${problems.join(', ')}` : '';
      if (!quiet || added)
        app.say(added ? `Live sync · ${added} new${updated ? `, ${updated} updated` : ''}` : `Live sync · up to date${updated ? ` (${updated} updated)` : ''}`);
      if (added && offline.settings.auto) void offline.start();
    } catch (e) {
      flush();
      const m = (e as Error).message;
      this.note = m === 'Stopped' ? `Stopped · ${added} new` : m;
      if (!quiet && m !== 'Stopped') app.say(m);
    } finally {
      this.running = false;
    }
  }

  /** Result line of the last asset-list pass (shown on the sync card). */
  assetsNote = $state('');

  async #assetsPass(full: boolean, take: (l: ParsedAsset[]) => void): Promise<string> {
    let token = '',
      page = 0,
      seen = 0,
      gained = 0,
      stale = 0;
    do {
      page++;
      this.note = `Asset list · page ${page} · ${seen.toLocaleString('en-US')} assets`;
      const data = await this.#call(assetsPath(token), null, 'GET');
      const assets = Array.isArray(data.assets) ? data.assets : [];
      const parsed = parseExport({ assets });
      seen += assets.length;
      // New, or brings fields the library doesn't have yet.
      const news = parsed.filter((p) => {
        const prev = app.byId.get(p.id);
        return (
          !prev ||
          (!!p.conversation && !prev.conv) ||
          (!!p.inputs?.length && !prev.inputs?.length) ||
          (!!p.mime && !prev.mime) ||
          (p.source === 'upload' && prev.source !== 'upload') ||
          (!!p.gen && !prev.gen) ||
          (!!p.response && !prev.response)
        );
      }).length;
      gained += news;
      take(parsed);
      if (!full) {
        stale = assets.length && !news ? stale + 1 : 0;
        if (stale >= 2) break;
      }
      token = typeof data.nextPageToken === 'string' ? data.nextPageToken : '';
      await sleep(page % 30 === 0 ? 5000 : 300);
    } while (token && !this.#stop);
    return `Asset list: ${seen.toLocaleString('en-US')} checked, ${gained.toLocaleString('en-US')} new or enriched`;
  }

  stop() {
    this.#stop = true;
  }

  /** On app start: quiet incremental sync if signed in and the last one is older than 30 min. */
  async autoStart() {
    if (!this.available) return;
    await this.init();
    if (this.settings.onStart && Date.now() - this.settings.lastSync > 30 * 60_000) void this.run(false, true);
  }

  resetSource() {
    this.settings.source = undefined;
    this.settings.sourceAt = 0;
    this.save();
  }
}

export const sync = new LiveSync();
