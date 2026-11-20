import { dayKey, dayLabel } from './format';
import type { Item } from './types';

/**
 * The four library views. Everything here uses only data from Grok — no
 * guessing: dates, sessions (gaps in your activity), sourceConversationId,
 * and inputAssets / rootAssetId chains.
 */

export type View = 'date' | 'session' | 'conversation' | 'chain';

export const VIEWS: [View, string][] = [
  ['date', 'Date'],
  ['session', 'Sessions'],
  ['conversation', 'Conversations'],
  ['chain', 'Chains']
];

/** A new session starts after this much inactivity. */
export const SESSION_GAP = 30 * 60_000;

export interface Group {
  key: string;
  title: string;
  sub: string;
  items: Item[];
}

// ---------------- per-item facts ----------------
export const sourceOf = (i: Item): 'generated' | 'upload' => i.source ?? 'generated';

const EXT_MIME: Record<string, string> = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif', mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime' };

export function mimeOf(i: Item): string {
  if (i.mime) return i.mime;
  const ext = i.mediaUrl?.match(/\.([a-z0-9]{3,4})(?:[?#]|$)/i)?.[1]?.toLowerCase();
  return (ext && EXT_MIME[ext]) || (i.kind === 'video' ? 'video/mp4' : 'image/jpeg');
}

/** Short label for a MIME type: image/jpeg → JPEG. */
export const mimeLabel = (m: string) => (m.split('/')[1] ?? m).replace(/^x-/, '').replace('quicktime', 'MOV').toUpperCase();

/** Ids this item was generated from (inputAssets, plus parent links from live sync / edits). */
export function inputsOf(i: Item): string[] {
  const out = [...(i.inputs ?? [])];
  if (i.parent && !out.includes(i.parent)) out.push(i.parent);
  return out;
}

const GEN_LABEL: Record<string, string> = {
  textToImage: 'Text → image',
  imageToImage: 'Image → image',
  textToVideo: 'Text → video',
  imageToVideo: 'Image → video',
  template: 'Template'
};

/** mediaGenInput key → readable label (camelCase fallback: fooBarBaz → Foo bar baz). */
export function genLabel(g: string | null | undefined): string | null {
  if (!g) return null;
  return GEN_LABEL[g] ?? g.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, (c) => c.toUpperCase()).replace(/ To /g, ' → ').toLowerCase().replace(/^./, (c) => c.toUpperCase());
}

// ---------------- helpers ----------------
const time = (ms: number) => new Date(ms).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
const span = (a: number, b: number) => {
  const m = Math.round((b - a) / 60_000);
  return m < 1 ? 'under a minute' : m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60 ? (m % 60) + ' min' : ''}`.trim();
};
const n = (x: number) => x.toLocaleString('en-US');
const by = (newest: boolean) => (a: Item, b: Item) => (newest ? b.createdAt - a.createdAt : a.createdAt - b.createdAt);
const countLine = (items: Item[]) => {
  const v = items.filter((i) => i.kind === 'video').length, up = items.filter((i) => sourceOf(i) === 'upload').length;
  const parts = [`${n(items.length)} item${items.length === 1 ? '' : 's'}`];
  if (v && v !== items.length) parts.push(`${n(v)} video${v === 1 ? '' : 's'}`);
  if (up) parts.push(`${n(up)} upload${up === 1 ? '' : 's'}`);
  return parts.join(' · ');
};

// ---------------- views ----------------
function byDate(items: Item[], newest: boolean): Group[] {
  const out: Group[] = [];
  for (const it of [...items].sort(by(newest))) {
    const k = 'd:' + dayKey(it.createdAt);
    let g = out.at(-1);
    if (!g || g.key !== k) {
      g = { key: k, title: dayLabel(it.createdAt), sub: '', items: [] };
      out.push(g);
    }
    g.items.push(it);
  }
  for (const g of out) g.sub = countLine(g.items);
  return out;
}

/** Sessions: runs of activity separated by ≥ SESSION_GAP. Key = start time. */
export function sessions(items: Item[]): Item[][] {
  const asc = [...items].sort(by(false));
  const out: Item[][] = [];
  for (const it of asc) {
    const cur = out.at(-1);
    if (cur && it.createdAt - cur[cur.length - 1].createdAt < SESSION_GAP) cur.push(it);
    else out.push([it]);
  }
  return out;
}

function bySession(items: Item[], newest: boolean): Group[] {
  const groups = sessions(items).map((s) => {
    const a = s[0].createdAt, b = s[s.length - 1].createdAt;
    return {
      key: 's:' + a,
      title: `${dayLabel(a)} · ${time(a)}${b - a >= 60_000 ? '–' + time(b) : ''}`,
      sub: `${countLine(s)} · ${span(a, b)}`,
      items: newest ? s.reverse() : s
    };
  });
  return newest ? groups.reverse() : groups;
}

function byConversation(items: Item[], newest: boolean): Group[] {
  const map = new Map<string, Item[]>();
  const none: Item[] = [];
  for (const it of items) {
    if (!it.conv) none.push(it);
    else (map.get(it.conv) ?? map.set(it.conv, []).get(it.conv)!).push(it);
  }
  const groups: (Group & { at: number })[] = [...map].map(([id, list]) => {
    list.sort(by(newest));
    const ts = list.map((i) => i.createdAt);
    const a = Math.min(...ts), b = Math.max(...ts);
    const title = list.find((i) => i.convTitle)?.convTitle ?? `Conversation ${id.slice(0, 8)}`;
    return { key: 'c:' + id, title, sub: `${countLine(list)} · ${dayLabel(a)}${dayKey(a) !== dayKey(b) ? ' – ' + dayLabel(b) : ''}`, items: list, at: newest ? b : a };
  });
  groups.sort((x, y) => (newest ? y.at - x.at : x.at - y.at));
  if (none.length) groups.push({ key: 'c:none', title: 'Without conversation id', sub: `${countLine(none)} · not in Grok's asset data`, items: none.sort(by(newest)), at: 0 });
  return groups;
}

/**
 * Chains: connected components over inputAssets / parent / rootAssetId.
 * Referenced assets that aren't in the library still connect their children
 * (e.g. two edits of the same uploaded photo). Items in a chain are listed in
 * generation order; single items without links are left out.
 */
export function chains(items: Item[]): { items: Item[]; missing: number }[] {
  const par = new Map<string, string>();
  const find = (x: string): string => {
    let r = x;
    while (par.has(r) && par.get(r) !== r) r = par.get(r)!;
    let c = x;
    while (par.has(c) && par.get(c) !== r) {
      const nx = par.get(c)!;
      par.set(c, r);
      c = nx;
    }
    return r;
  };
  const join = (a: string, b: string) => {
    if (!par.has(a)) par.set(a, a);
    if (!par.has(b)) par.set(b, b);
    const ra = find(a), rb = find(b);
    if (ra !== rb) par.set(ra, rb);
  };
  const present = new Set(items.map((i) => i.id));
  for (const it of items) {
    for (const src of inputsOf(it)) join(it.id, src);
    if (it.root && it.root !== it.id) join(it.id, it.root);
  }
  const comps = new Map<string, { items: Item[]; refs: Set<string> }>();
  for (const id of par.keys()) {
    const r = find(id);
    const c = comps.get(r) ?? comps.set(r, { items: [], refs: new Set() }).get(r)!;
    if (!present.has(id)) c.refs.add(id);
  }
  for (const it of items) if (par.has(it.id)) comps.get(find(it.id))!.items.push(it);
  return [...comps.values()]
    .filter((c) => c.items.length >= 2 || (c.items.length === 1 && c.refs.size > 0 && inputsOf(c.items[0]).length > 0))
    .map((c) => ({ items: c.items.sort(by(false)), missing: c.refs.size }));
}

/**
 * Chains are built from `context` (the whole library) and kept when they
 * contain a filtered item, so a filter picks chains without cutting them apart.
 */
function byChain(items: Item[], newest: boolean, context: Item[]): Group[] {
  const want = new Set(items.map((i) => i.id));
  const list = chains(context).filter((c) => c.items.some((i) => want.has(i.id))).map((c) => {
    const first = c.items[0], last = c.items[c.items.length - 1];
    const startsUpload = sourceOf(first) === 'upload';
    const sub = [`${c.items.length} step${c.items.length === 1 ? '' : 's'}`];
    if (startsUpload) sub.push('starts from an upload');
    if (c.missing) sub.push(`${c.missing} input${c.missing === 1 ? '' : 's'} not in library`);
    sub.push(dayLabel(first.createdAt));
    const titleItem = c.items.find((i) => i.prompt.trim()) ?? first;
    return {
      key: 'ch:' + first.id,
      title: titleItem.prompt.trim() ? titleItem.prompt.trim().slice(0, 80) : 'Untitled chain',
      sub: sub.join(' · '),
      items: c.items,
      at: last.createdAt
    };
  });
  list.sort((a, b) => (newest ? b.at - a.at : a.at - b.at));
  return list;
}

export function buildGroups(items: Item[], view: View, newest: boolean, context: Item[] = items): Group[] {
  if (view === 'session') return bySession(items, newest);
  if (view === 'conversation') return byConversation(items, newest);
  if (view === 'chain') return byChain(items, newest, context);
  return byDate(items, newest);
}

/** Group of a given key, for opening it on its own screen from the detail view. */
export function findGroup(items: Item[], key: string): Group | undefined {
  const view: View = key.startsWith('s:') ? 'session' : key.startsWith('c:') ? 'conversation' : key.startsWith('ch:') ? 'chain' : 'date';
  return buildGroups(items, view, false).find((g) => g.key === key);
}
