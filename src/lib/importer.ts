import type { Item, Kind } from './types';

/**
 * Tolerant importer for Grok / Imagine export JSON.
 *
 * The export is a list of conversations whose entries carry asset metadata
 * (e.g. `latestAssetMetadata`) with fields such as assetId, key (path on
 * assets.grok.com), prompt, modelName, aspectRatio, rRated and thumbhash.
 * The same assetId can appear several times; entries are merged.
 *
 * Instead of hard-coding one schema, the importer walks the whole JSON tree
 * and treats every object that has an asset id as an asset, inheriting
 * conversation id and timestamps from its ancestors.
 */

type Obj = Record<string, unknown>;

export interface ParsedAsset {
  id: string;
  kind: Kind;
  prompt: string;
  w: number;
  h: number;
  createdAt: number | null;
  model: string;
  mode: string | null;
  seed: number | null;
  parent: string | null;
  conversation: string | null;
  dur: string | null;
  mediaUrl: string | null;
  thumbUrl: string | null;
  thumbhash: string | null;
  rRated: boolean;
}

const ASSET_HOST = 'https://assets.grok.com/';
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);

function pick(o: Obj, keys: string[]): unknown {
  for (const k of keys) if (o[k] !== undefined && o[k] !== null && o[k] !== '') return o[k];
  return undefined;
}

function toTime(v: unknown): number | null {
  if (v == null) return null;
  if (typeof v === 'number' && isFinite(v)) return v < 1e12 ? Math.round(v * 1000) : Math.round(v);
  if (typeof v === 'string') {
    if (/^\d+(\.\d+)?$/.test(v)) return toTime(Number(v));
    const t = Date.parse(v);
    return isNaN(t) ? null : t;
  }
  if (isObj(v)) {
    const s = pick(v, ['seconds', '_seconds']);
    if (s != null) return Math.round(Number(s) * 1000);
  }
  return null;
}

function toRatio(v: unknown, o: Obj): [number, number] {
  const wv = Number(pick(o, ['width', 'imageWidth', 'w']));
  const hv = Number(pick(o, ['height', 'imageHeight', 'h']));
  if (wv > 0 && hv > 0) return reduce(wv, hv);
  if (typeof v === 'number' && v > 0) return reduce(Math.round(v * 1000), 1000);
  if (typeof v === 'string') {
    const m = v.match(/(\d+(?:\.\d+)?)\D+(\d+(?:\.\d+)?)/);
    if (m) return reduce(Math.round(Number(m[1]) * 100), Math.round(Number(m[2]) * 100));
    const k = v.toLowerCase();
    if (k.includes('portrait')) return [2, 3];
    if (k.includes('landscape') || k.includes('wide')) return [3, 2];
    if (k.includes('square')) return [1, 1];
  }
  return [1, 1];
}

export function reduce(a: number, b: number): [number, number] {
  const g = (x: number, y: number): number => (y ? g(y, x % y) : x);
  const d = g(a, b) || 1;
  let w = a / d, h = b / d;
  // Keep labels readable for odd pixel sizes (e.g. 1344x768 → 7:4).
  if (w > 64 || h > 64) {
    const r = a / b;
    const common: [number, number][] = [[1, 1], [2, 3], [3, 2], [3, 4], [4, 3], [4, 5], [5, 4], [9, 16], [16, 9], [7, 4], [4, 7], [21, 9], [9, 21]];
    [w, h] = common.reduce((best, c) => (Math.abs(c[0] / c[1] - r) < Math.abs(best[0] / best[1] - r) ? c : best));
  }
  return [w, h];
}

function toUrl(v: unknown): string | null {
  const s = str(v);
  if (!s) return null;
  if (/^https?:\/\//i.test(s)) return s;
  if (s.startsWith('//')) return 'https:' + s;
  return ASSET_HOST + s.replace(/^\/+/, '');
}

function fmtDur(v: unknown): string | null {
  const n = Number(v);
  if (!isFinite(n) || n <= 0) return typeof v === 'string' && /^\d+:\d{2}$/.test(v) ? v : null;
  const s = Math.round(n > 600 ? n / 1000 : n);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

const VIDEO_EXT = /\.(mp4|webm|mov|m4v)(\?|$)/i;

interface Ctx {
  conversation: string | null;
  time: number | null;
}

function assetFrom(o: Obj, ctx: Ctx): ParsedAsset | null {
  const id = str(pick(o, ['assetId', 'asset_id', 'mediaId', 'postId']));
  if (!id) return null;
  const key = pick(o, ['key', 'assetKey', 'url', 'mediaUrl', 'imageUrl', 'videoUrl', 'publicUrl']);
  const prompt = str(pick(o, ['prompt', 'originalPrompt', 'revisedPrompt', 'text', 'caption', 'title'])) ?? '';
  if (!key && !prompt) return null;

  const model = str(pick(o, ['modelName', 'model', 'modelId'])) ?? 'grok-imagine';
  const mime = str(pick(o, ['mimeType', 'contentType', 'mediaType', 'type'])) ?? '';
  const mediaUrl = toUrl(key);
  const isVideo =
    /video/i.test(model) || mime.toLowerCase().startsWith('video') || /^video$/i.test(mime) || (mediaUrl ? VIDEO_EXT.test(mediaUrl) : false);
  const [w, h] = toRatio(pick(o, ['aspectRatio', 'aspect_ratio', 'ratio']), o);
  const seedRaw = pick(o, ['seed']);
  const seed = seedRaw != null && isFinite(Number(seedRaw)) ? Number(seedRaw) : null;
  const rr = pick(o, ['rRated', 'r_rated', 'nsfw', 'isNsfw']);

  return {
    id,
    kind: isVideo ? 'video' : 'image',
    prompt,
    w, h,
    createdAt: toTime(pick(o, ['createTime', 'createdAt', 'created_at', 'createTimestamp', 'timestamp', 'created'])) ?? ctx.time,
    model,
    mode: str(pick(o, ['mode', 'imagineMode', 'style'])),
    seed,
    parent: str(pick(o, ['parentAssetId', 'parentPostId', 'sourceAssetId', 'originalAssetId', 'inputAssetId', 'imageAssetId'])),
    conversation: str(pick(o, ['conversationId', 'conversation_id'])) ?? ctx.conversation,
    dur: isVideo ? fmtDur(pick(o, ['duration', 'durationSeconds', 'videoDuration', 'durationMs'])) : null,
    mediaUrl,
    thumbUrl: toUrl(pick(o, ['thumbnailKey', 'thumbnailUrl', 'thumbKey', 'previewUrl', 'posterUrl'])),
    thumbhash: str(pick(o, ['thumbhash', 'thumbHash'])),
    rRated: rr === true || rr === 'true' || rr === 1
  };
}

function merge(a: ParsedAsset, b: ParsedAsset): ParsedAsset {
  const out = { ...a } as Record<string, unknown>;
  for (const [k, v] of Object.entries(b)) {
    const cur = out[k];
    if (cur == null || cur === '' || (k === 'model' && cur === 'grok-imagine')) out[k] = v;
    else if (k === 'prompt' && typeof v === 'string' && v.length > (cur as string).length) out[k] = v;
    else if (k === 'createdAt' && typeof v === 'number' && typeof cur === 'number') out[k] = Math.min(cur, v);
    else if (k === 'rRated') out[k] = (cur as boolean) || (v as boolean);
  }
  return out as unknown as ParsedAsset;
}

export function parseExport(json: unknown): ParsedAsset[] {
  const found = new Map<string, ParsedAsset>();
  const seen = new WeakSet<object>();

  const walk = (node: unknown, ctx: Ctx, depth: number) => {
    if (depth > 40 || node == null || typeof node !== 'object') return;
    if (seen.has(node)) return;
    seen.add(node);
    if (Array.isArray(node)) {
      for (const n of node) walk(n, ctx, depth + 1);
      return;
    }
    const o = node as Obj;
    // Conversation-like objects pass their id/time down to nested assets.
    const convId = str(pick(o, ['conversationId', 'conversation_id'])) ??
      (('latestAssetMetadata' in o || 'assets' in o || 'responses' in o || 'messages' in o) ? str(o.id) : null);
    const next: Ctx = {
      conversation: convId ?? ctx.conversation,
      time: toTime(pick(o, ['createTime', 'createdAt', 'created_at', 'modifyTime', 'updateTime'])) ?? ctx.time
    };
    const a = assetFrom(o, next);
    if (a) found.set(a.id, found.has(a.id) ? merge(found.get(a.id)!, a) : a);
    for (const v of Object.values(o)) if (v && typeof v === 'object') walk(v, next, depth + 1);
  };

  walk(json, { conversation: null, time: null }, 0);
  return [...found.values()];
}

/** Accepts plain JSON, JSON Lines, or a JSON blob embedded in other text. */
export function parseText(text: string): ParsedAsset[] {
  const t = text.trim().replace(/^﻿/, '');
  try {
    return parseExport(JSON.parse(t));
  } catch {
    const lines = t.split(/\r?\n/).filter((l) => l.trim().startsWith('{'));
    if (lines.length > 1) {
      const objs: unknown[] = [];
      for (const l of lines) {
        try { objs.push(JSON.parse(l)); } catch { /* skip */ }
      }
      if (objs.length) return parseExport(objs);
    }
    const s = t.indexOf('{'), e = t.lastIndexOf('}');
    const sa = t.indexOf('['), ea = t.lastIndexOf(']');
    for (const [a, b] of [[sa, ea], [s, e]]) {
      if (a >= 0 && b > a) {
        try { return parseExport(JSON.parse(t.slice(a, b + 1))); } catch { /* next */ }
      }
    }
    throw new Error('Not valid JSON');
  }
}

function hueFor(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return h % 360;
}

/**
 * Merge parsed assets into the existing library. User data (favorites,
 * ratings, notes, collections) on existing items is kept.
 */
export function mergeIntoLibrary(existing: Item[], parsed: ParsedAsset[]): { items: Item[]; added: number; updated: number } {
  const byId = new Map(existing.map((i) => [i.id, i]));
  let added = 0, updated = 0;
  const now = Date.now();

  // Infer chains: a video in the same conversation as an earlier image.
  const byConv = new Map<string, ParsedAsset[]>();
  for (const p of parsed) if (p.conversation) (byConv.get(p.conversation) ?? byConv.set(p.conversation, []).get(p.conversation)!).push(p);
  const ids = new Set(parsed.map((p) => p.id).concat(existing.map((e) => e.id)));

  for (const p of parsed) {
    let parent = p.parent && ids.has(p.parent) && p.parent !== p.id ? p.parent : null;
    let variant: string | null = null;
    if (p.conversation) {
      const sibs = byConv.get(p.conversation)!;
      const images = sibs.filter((s) => s.kind === 'image');
      if (!parent && p.kind === 'video') {
        const earlier = images
          .filter((s) => (s.createdAt ?? 0) <= (p.createdAt ?? Infinity))
          .sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0))[0] ?? images[0];
        if (earlier) parent = earlier.id;
      }
      if (p.kind === 'image' && images.length > 1) variant = 'conv:' + p.conversation;
    }

    const base: Omit<Item, 'fav' | 'rating' | 'colls' | 'notes'> = {
      id: p.id,
      kind: p.kind,
      prompt: p.prompt,
      w: p.w,
      h: p.h,
      createdAt: p.createdAt ?? now,
      model: p.model,
      mode: p.mode,
      seed: p.seed,
      parent,
      variant,
      dur: p.dur,
      mediaUrl: p.mediaUrl,
      thumbUrl: p.thumbUrl,
      thumbhash: p.thumbhash,
      rRated: p.rRated,
      hue: hueFor(p.id),
      grokUrl: `https://grok.com/imagine/post/${p.id}`
    };
    const prev = byId.get(p.id);
    if (prev) {
      const next: Item = {
        ...prev, ...base,
        createdAt: p.createdAt ?? prev.createdAt,
        prompt: base.prompt || prev.prompt,
        parent: base.parent ?? prev.parent,
        variant: base.variant ?? prev.variant,
        hue: prev.hue,
        grokUrl: prev.grokUrl
      };
      if (JSON.stringify(next) !== JSON.stringify(prev)) updated++;
      byId.set(p.id, next);
    } else {
      added++;
      byId.set(p.id, { ...base, fav: false, rating: 0, colls: [], notes: '' });
    }
  }
  const items = [...byId.values()].sort((a, b) => b.createdAt - a.createdAt);
  return { items, added, updated };
}
