import { smartGroups } from './cluster';
import * as db from './db';
import { DEMO_COLLS, demoItems } from './demo';
import { mergeIntoLibrary, parseText } from './importer';
import type { Collection, Filter, ImportRecord, Item, Persisted, Scope, Screen, Settings, SmartGroup } from './types';

interface Frame {
  screen: Screen;
  cur: string;
  coll: string;
}

const DEFAULT_SETTINGS: Settings = { layout: 'masonry', showSmartStrip: true, hideRRated: false, loadMedia: true };

class App {
  // ---- persisted ----
  items = $state<Item[]>([]);
  colls = $state<Collection[]>([]);
  settings = $state<Settings>({ ...DEFAULT_SETTINGS });
  history = $state<ImportRecord[]>([]);
  recents = $state<string[]>([]);
  lastImport = $state<number | null>(null);
  demo = $state(false);
  ready = $state(false);

  // ---- ui ----
  screen = $state<Screen>('library');
  stack = $state<Frame[]>([]);
  cur = $state('');
  coll = $state('');
  filter = $state<Filter>('all');
  selecting = $state(false);
  selected = $state<string[]>([]);
  sheet = $state(false);
  pasteOpen = $state(false);
  q = $state('');
  scope = $state<Scope>('all');
  toast = $state<string | null>(null);
  importing = $state(false);
  importPct = $state(0);
  importLine = $state('');

  // ---- derived ----
  visible = $derived(this.settings.hideRRated ? this.items.filter((i) => !i.rRated) : this.items);
  byId = $derived(new Map(this.items.map((i) => [i.id, i])));
  parents = $derived(new Set(this.items.map((i) => i.parent).filter((p): p is string => !!p)));
  groups = $derived<SmartGroup[]>(smartGroups(this.visible));
  groupOf = $derived(new Map(this.groups.flatMap((g) => g.ids.map((id) => [id, g.name] as const))));

  #toastTimer: ReturnType<typeof setTimeout> | undefined;
  #saveTimer: ReturnType<typeof setTimeout> | undefined;
  #histDepth = 0;
  #ignorePops = 0;

  // ================= lifecycle =================
  async init() {
    const saved = await db.load();
    if (saved) {
      this.items = saved.items;
      this.colls = saved.colls;
      this.settings = { ...DEFAULT_SETTINGS, ...saved.settings };
      this.history = saved.history ?? [];
      this.recents = saved.recents ?? [];
      this.lastImport = saved.lastImport ?? null;
      this.demo = !!saved.demo;
    } else {
      this.loadDemo(false);
    }
    this.ready = true;
    window.addEventListener('popstate', this.#onPop);
  }

  snapshot(): Persisted {
    return $state.snapshot({
      version: 1 as const,
      items: this.items,
      colls: this.colls,
      settings: this.settings,
      history: this.history,
      recents: this.recents,
      lastImport: this.lastImport,
      demo: this.demo
    }) as Persisted;
  }

  scheduleSave() {
    if (!this.ready) return;
    const data = this.snapshot();
    clearTimeout(this.#saveTimer);
    this.#saveTimer = setTimeout(() => db.save(data), 350);
  }

  loadDemo(announce = true) {
    this.items = demoItems();
    this.colls = DEMO_COLLS.map((c) => ({ ...c }));
    this.demo = true;
    this.lastImport = Date.now() - 4 * 60_000;
    this.history = [];
    this.recents = ['jellyfish', 'seed:4417092', 'mode:fun', 'album cover'];
    if (announce) this.say('Demo library loaded');
  }

  async clearLibrary() {
    this.items = [];
    this.colls = [];
    this.history = [];
    this.recents = [];
    this.lastImport = null;
    this.demo = false;
    this.selected = [];
    this.selecting = false;
    await db.clear();
    this.say('Library cleared');
  }

  // ================= feedback =================
  say(msg: string) {
    clearTimeout(this.#toastTimer);
    this.toast = msg;
    this.#toastTimer = setTimeout(() => (this.toast = null), 2600);
  }

  async copy(text: string, msg: string) {
    let ok = false;
    try {
      await navigator.clipboard.writeText(text);
      ok = true;
    } catch {
      try {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        ok = document.execCommand('copy');
        ta.remove();
      } catch { /* ignore */ }
    }
    this.say(ok ? msg : 'Copy not allowed here');
  }

  async share(url: string) {
    if (navigator.share) {
      try {
        await navigator.share({ url, title: 'Grok Imagine' });
        return;
      } catch (e) {
        if ((e as Error)?.name === 'AbortError') return;
      }
    }
    await this.copy(url, 'Grok link copied');
  }

  // ================= navigation =================
  #push() {
    try {
      history.pushState({ il: true }, '');
      this.#histDepth++;
    } catch { /* sandboxed */ }
  }

  #onPop = () => {
    if (this.#ignorePops > 0) {
      this.#ignorePops--;
      return;
    }
    if (this.#histDepth > 0) this.#histDepth--;
    this.#handleBack();
  };

  /** Back from UI buttons: routes through browser history so Android's back gesture stays in sync. */
  back() {
    if (this.#histDepth > 0) history.back();
    else this.#handleBack();
  }

  #handleBack() {
    if (this.pasteOpen) return void (this.pasteOpen = false);
    if (this.sheet) return void (this.sheet = false);
    if (this.selecting) {
      this.selecting = false;
      this.selected = [];
      return;
    }
    const f = this.stack.at(-1);
    if (f) {
      this.stack = this.stack.slice(0, -1);
      this.screen = f.screen;
      this.cur = f.cur;
      this.coll = f.coll;
      return;
    }
    if (this.screen !== 'library') this.screen = 'library';
  }

  nav(screen: Screen, extra: Partial<Frame> = {}) {
    this.stack = [...this.stack, { screen: this.screen, cur: this.cur, coll: this.coll }];
    this.screen = screen;
    if (extra.cur !== undefined) this.cur = extra.cur;
    if (extra.coll !== undefined) this.coll = extra.coll;
    this.#push();
  }

  tab(screen: Screen) {
    this.stack = [];
    this.screen = screen;
    this.selecting = false;
    this.selected = [];
    this.sheet = false;
    this.pasteOpen = false;
    if (this.#histDepth > 0) {
      this.#ignorePops++;
      const n = this.#histDepth;
      this.#histDepth = 0;
      try { history.go(-n); } catch { this.#ignorePops = 0; }
    }
  }

  openSheet(ids?: string[]) {
    if (ids) this.selected = ids;
    this.sheet = true;
    this.#push();
  }

  openPaste() {
    this.pasteOpen = true;
    this.#push();
  }

  // ================= selection =================
  startSelect(withId?: string) {
    if (!this.selecting) {
      this.selecting = true;
      this.#push();
    }
    if (withId && !this.selected.includes(withId)) this.selected = [...this.selected, withId];
  }

  toggleSel(id: string) {
    this.selected = this.selected.includes(id) ? this.selected.filter((x) => x !== id) : [...this.selected, id];
  }

  // ================= mutations =================
  patch(ids: string[], fn: (i: Item) => Partial<Item>) {
    const set = new Set(ids);
    for (const it of this.items) if (set.has(it.id)) Object.assign(it, fn(it));
  }

  collItems(id: string): Item[] {
    return this.visible.filter((i) => i.colls.includes(id));
  }

  newCollection(name: string, ids: string[] = []): string {
    const id = 'c' + Date.now().toString(36);
    this.colls = [...this.colls, { id, name }];
    if (ids.length) this.patch(ids, (i) => ({ colls: [...new Set([...i.colls, id])] }));
    return id;
  }

  renameCollection(id: string, name: string) {
    const c = this.colls.find((x) => x.id === id);
    if (c && name.trim()) c.name = name.trim();
  }

  deleteCollection(id: string) {
    this.colls = this.colls.filter((c) => c.id !== id);
    for (const it of this.items) if (it.colls.includes(id)) it.colls = it.colls.filter((c) => c !== id);
  }

  addRecent(q: string) {
    const v = q.trim();
    if (!v) return;
    this.recents = [v, ...this.recents.filter((r) => r !== v)].slice(0, 8);
  }

  // ================= import =================
  async importText(text: string, source: string) {
    if (this.importing) return;
    this.importing = true;
    this.importPct = 5;
    this.importLine = 'Reading export…';
    try {
      await tick();
      this.importPct = 30;
      this.importLine = 'Parsing assets…';
      await tick();
      const parsed = parseText(text);
      if (!parsed.length) throw new Error('No Grok assets found in this file');
      this.importPct = 70;
      this.importLine = `Merging ${parsed.length.toLocaleString('en-US')} assets…`;
      await tick();
      const base = this.demo ? [] : $state.snapshot(this.items) as Item[];
      if (this.demo) {
        this.colls = [];
        this.demo = false;
      }
      const { items, added, updated } = mergeIntoLibrary(base, parsed);
      this.items = items;
      this.importPct = 95;
      this.importLine = 'Regrouping by prompt similarity…';
      await tick();
      this.lastImport = Date.now();
      this.history = [{ at: this.lastImport, added, updated, source }, ...this.history].slice(0, 20);
      this.importPct = 100;
      this.say(`Imported · ${added} new, ${updated} updated`);
    } catch (e) {
      this.say((e as Error).message || 'Import failed');
    } finally {
      setTimeout(() => (this.importing = false), 400);
    }
  }
}

const tick = () => new Promise((r) => setTimeout(r, 30));

export const app = new App();
