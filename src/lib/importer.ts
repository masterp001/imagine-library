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
  /**
   * Only part of the metadata is known (official data export: no size, length,
   * model or parent). Merging such an asset only fills gaps and never overwrites
   * what the library already knows (e.g. real size read from a downloaded file).
   */
  partial?: boolean;
  /** false: w/h are placeholders, keep the size the library already has. */
  sizeKnown?: boolean;
  source?: 'generated' | 'upload';
  mime?: string | null;
  convTitle?: string | null;
  inputs?: string[];
  root?: string | null;
  response?: string | null;
  gen?: string | null;
}

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

/** Asset id from an id, key or URL (users/<uid>/generated/<assetId>/… → assetId). */
function idFrom(v: unknown): string | null {
  if (isObj(v)) return idFrom(v.assetId ?? v.id ?? v.key ?? v.url);
  const s = str(v);
  if (!s) return null;
  const u = s.match(UUID);
  if (u) return u[u.length - 1].toLowerCase();
  return /[/:]/.test(s) ? null : s;
}

function idsFrom(v: unknown): string[] {
  const list = Array.isArray(v) ? v : v == null ? [] : [v];
  return [...new Set(list.map(idFrom).filter((x): x is string => !!x))];
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
  title: string | null;
  time: number | null;
}

function assetFrom(o: Obj, ctx: Ctx): ParsedAsset | null {
  const id = str(pick(o, ['assetId', 'asset_id', 'mediaId', 'postId']));
  if (!id) return null;
  if (o.isDeleted === true) return null;
  // Grok's asset record: mediaGenInput.{textToImage|imageToImage|…}{prompt, inputAssets, modelName, aspectRatio}
  const mgi = isObj(o.mediaGenInput) ? o.mediaGenInput : null;
  const genKey = mgi ? (Object.keys(mgi).find((k) => isObj(mgi[k])) ?? null) : null;
  const g: Obj = genKey && mgi ? (mgi[genKey] as Obj) : {};
  const key = pick(o, ['key', 'assetKey', 'url', 'mediaUrl', 'imageUrl', 'videoUrl', 'publicUrl']);
  const prompt = str(g.prompt) ?? str(pick(o, ['prompt', 'originalPrompt', 'revisedPrompt', 'text', 'caption'])) ?? '';
  if (!key && !prompt) return null;

  const model = str(g.modelName) ?? str(pick(o, ['modelName', 'model', 'modelId'])) ?? 'grok-imagine';
  const mime = str(pick(o, ['mimeType', 'contentType', 'mediaType', 'type'])) ?? '';
  // Asset lists also hold chat attachments (PDFs etc.): keep images and videos only.
  if (/\//.test(mime) && !/^(image|video)\//i.test(mime)) return null;
  const mediaUrl = toUrl(key);
  const isVideo =
    /video/i.test(model) || mime.toLowerCase().startsWith('video') || /^video$/i.test(mime) || (mediaUrl ? VIDEO_EXT.test(mediaUrl) : false);
  const W = typeof o.width === 'number' ? o.width : 0, H = typeof o.height === 'number' ? o.height : 0;
  const [w, h] = W && H ? reduce(Math.round(W), Math.round(H)) : toRatio(g.aspectRatio ?? pick(o, ['aspectRatio', 'aspect_ratio', 'ratio']), o);
  const aux = isObj(o.auxKeys) ? o.auxKeys : {};
  const inputs = idsFrom(g.inputAssets ?? o.inputAssets).concat(idsFrom(aux.image_reference), idsFrom(aux.image_references)).filter((x) => x !== id);
  const fileSource = String(o.fileSource ?? '');
  // isModelGenerated is authoritative; fileSource (e.g. SELF_UPLOAD_FILE_SOURCE) only when it's missing.
  const upload = o.isModelGenerated === false || (o.isModelGenerated !== true && /upload/i.test(fileSource));
  const rootId = idFrom(o.rootAssetId);
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
    conversation: str(pick(o, ['sourceConversationId', 'conversationId', 'conversation_id'])) ?? ctx.conversation,
    dur: isVideo ? fmtDur(pick(o, ['duration', 'durationSeconds', 'videoDuration', 'durationMs'])) : null,
    mediaUrl,
    thumbUrl: toUrl(pick(o, ['previewImageKey', 'thumbnailKey', 'thumbnailUrl', 'thumbKey', 'previewUrl', 'posterUrl'])),
    thumbhash: str(pick(o, ['thumbhash', 'thumbHash'])),
    rRated: rr === true || rr === 'true' || rr === 1,
    sizeKnown: !!(W && H) || !!(g.aspectRatio ?? pick(o, ['aspectRatio', 'aspect_ratio', 'ratio'])),
    source: upload ? 'upload' : 'generated',
    mime: /\//.test(mime) ? mime.toLowerCase() : null,
    convTitle: ctx.title,
    inputs: [...new Set(inputs)],
    root: rootId && rootId !== id ? rootId : null,
    response: str(o.responseId),
    gen: genKey
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
    else if (k === 'inputs' && Array.isArray(v) && Array.isArray(cur)) out[k] = [...new Set([...(cur as string[]), ...(v as string[])])];
  }
  return out as unknown as ParsedAsset;
}

/**
 * Official xAI account export (grok.com → Settings → Data → Download):
 * `{ conversations, projects, tasks, media_posts }`. Each media post has
 * id, user_id, original_prompt, media_type ('image' | 'video'), create_time
 * and a link to grok.com/imagine/post/<id>. The post id is also the asset id,
 * so the file lives at assets.grok.com/users/<user_id>/generated/<id>/….
 */
function fromMediaPosts(posts: unknown[]): ParsedAsset[] {
  const out: ParsedAsset[] = [];
  for (const m of posts) {
    if (!isObj(m)) continue;
    const id = str(m.id);
    const uid = str(m.user_id) ?? str(m.userId);
    if (!id) continue;
    const video = /video/i.test(String(m.media_type ?? m.mediaType ?? ''));
    const dir = uid ? `${ASSET_HOST}users/${uid}/generated/${id}/` : null;
    out.push({
      id,
      kind: video ? 'video' : 'image',
      prompt: str(m.original_prompt) ?? str(m.prompt) ?? '',
      w: 1,
      h: 1,
      createdAt: toTime(m.create_time ?? m.createTime),
      model: video ? 'imagine-video' : 'imagine-image',
      mode: null,
      seed: null,
      parent: null,
      conversation: null,
      dur: null,
      // HD first; the downloader falls back to generated_video.mp4 / original_image.jpg.
      mediaUrl: dir ? dir + (video ? 'generated_video_hd.mp4' : 'image.jpg') : null,
      thumbUrl: dir && video ? dir + 'preview_image.jpg' : null,
      thumbhash: null,
      rRated: false,
      partial: true,
      source: 'generated',
      mime: video ? 'video/mp4' : 'image/jpeg'
    });
  }
  return out;
}

// ---------------- live sync: grok.com/rest/media/post/list ----------------
const num = (v: unknown): number | null => (typeof v === 'number' && isFinite(v) && v > 0 ? v : typeof v === 'string' && /^\d+(\.\d+)?$/.test(v) ? Number(v) : null);

function sizeOf(p: Obj): [number, number] | null {
  for (const o of [p, p.resolution, p.dimensions, p.size, p.media].filter(isObj) as Obj[]) {
    const w = num(o.width) ?? num(o.w), h = num(o.height) ?? num(o.h);
    if (w && h) return [w, h];
  }
  const ar = str(p.aspectRatio) ?? str(p.aspect_ratio);
  const m = ar?.match(/^(\d+(?:\.\d+)?)\s*[:x/]\s*(\d+(?:\.\d+)?)$/);
  return m ? [Number(m[1]), Number(m[2])] : null;
}

/**
 * Posts from the list endpoint behind grok.com/imagine. Each post may carry
 * `childPosts` (edits, videos made from it), flattened here with `parent` set.
 */
export function fromPostList(posts: unknown, parent: Obj | null = null, out: ParsedAsset[] = []): ParsedAsset[] {
  if (!Array.isArray(posts)) return out;
  for (const p of posts) {
    if (!isObj(p)) continue;
    const id = str(p.id) ?? str(p.postId);
    const type = String(p.mediaType ?? '') + ' ' + String(p.mimeType ?? '');
    const video = /video/i.test(type);
    const media = video ? (str(p.hdMediaUrl) ?? str(p.mediaUrl)) : str(p.mediaUrl);
    if (id && media) {
      const sz = sizeOf(p);
      const [w, h] = sz ? reduce(Math.round(sz[0]), Math.round(sz[1])) : [1, 1];
      const parentId = str(p.parentPostId) ?? str(p.originalPostId) ?? (parent ? str(parent.id) : null);
      const d = num(p.duration) ?? num(p.videoDuration) ?? num(p.durationSeconds);
      out.push({
        id,
        kind: video ? 'video' : 'image',
        prompt: str(p.originalPrompt) ?? str(p.prompt) ?? (parent ? (str(parent.originalPrompt) ?? str(parent.prompt) ?? '') : ''),
        w,
        h,
        createdAt: toTime(p.createTime ?? p.createdAt ?? parent?.createTime),
        model: str(p.modelName) ?? (parent ? str(parent.modelName) : null) ?? (video ? 'imagine-video' : 'imagine-image'),
        mode: str(p.mode) ?? null,
        seed: null,
        parent: parentId && parentId !== id ? parentId : null,
        conversation: null,
        dur: d ? `${Math.floor(d / 60)}:${String(Math.round(d % 60)).padStart(2, '0')}` : null,
        mediaUrl: media.startsWith('http') ? media : ASSET_HOST + media.replace(/^\//, ''),
        thumbUrl: str(p.thumbnailImageUrl) ?? null,
        thumbhash: str(p.thumbhash) ?? null,
        rRated: p.rRated === true || p.isRRated === true,
        sizeKnown: !!sz,
        source: 'generated',
        mime: str(p.mimeType)?.toLowerCase() ?? (video ? 'video/mp4' : 'image/jpeg'),
        inputs: parentId && parentId !== id ? [parentId] : [],
        gen: parent ? (video ? 'imageToVideo' : 'imageToImage') : null
      });
    }
    fromPostList(p.childPosts, p, out);
  }
  return out;
}

export function parseExport(json: unknown): ParsedAsset[] {
  const found = new Map<string, ParsedAsset>();
  if (isObj(json) && Array.isArray(json.media_posts)) {
    for (const a of fromMediaPosts(json.media_posts)) found.set(a.id, a);
    // The chat part of that export has no Imagine metadata worth walking.
    if (found.size) return [...found.values()];
  }
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
      title: (convId ? str(o.title) : null) ?? ctx.title,
      time: toTime(pick(o, ['createTime', 'createdAt', 'created_at', 'modifyTime', 'updateTime'])) ?? ctx.time
    };
    const a = assetFrom(o, next);
    if (a) found.set(a.id, found.has(a.id) ? merge(found.get(a.id)!, a) : a);
    for (const v of Object.values(o)) if (v && typeof v === 'object') walk(v, next, depth + 1);
  };

  walk(json, { conversation: null, title: null, time: null }, 0);
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

  const ids = new Set(parsed.map((p) => p.id).concat(existing.map((e) => e.id)));

  for (const p of parsed) {
    // Only links that come from the data itself; no guessing.
    const parent = p.parent && ids.has(p.parent) && p.parent !== p.id ? p.parent : null;

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
      variant: null,
      dur: p.dur,
      mediaUrl: p.mediaUrl,
      thumbUrl: p.thumbUrl,
      thumbhash: p.thumbhash,
      rRated: p.rRated,
      hue: hueFor(p.id),
      grokUrl: `https://grok.com/imagine/post/${p.id}`,
      source: p.source ?? 'generated',
      mime: p.mime ?? null,
      conv: p.conversation,
      convTitle: p.convTitle ?? null,
      inputs: p.inputs ?? [],
      root: p.root ?? null,
      response: p.response ?? null,
      gen: p.gen ?? null
    };
    const prev = byId.get(p.id);
    if (prev && p.partial) {
      // Weak source: only fill what's missing, keep everything the library knows.
      const next: Item = {
        ...prev,
        prompt: prev.prompt || base.prompt,
        mediaUrl: prev.mediaUrl ?? base.mediaUrl,
        thumbUrl: prev.thumbUrl ?? base.thumbUrl,
        createdAt: prev.createdAt || base.createdAt,
        source: prev.source ?? base.source,
        mime: prev.mime ?? base.mime
      };
      if (JSON.stringify(next) !== JSON.stringify(prev)) updated++;
      byId.set(p.id, next);
    } else if (prev) {
      const next: Item = {
        ...prev, ...base,
        createdAt: p.createdAt ?? prev.createdAt,
        prompt: base.prompt || prev.prompt,
        parent: base.parent ?? prev.parent,
        variant: prev.variant ?? null,
        // Asset-data fields: new values win, missing ones keep what's known.
        source: p.source ?? prev.source ?? 'generated',
        mime: base.mime ?? prev.mime ?? null,
        conv: base.conv ?? prev.conv ?? null,
        convTitle: base.convTitle ?? prev.convTitle ?? null,
        inputs: [...new Set([...(prev.inputs ?? []), ...(base.inputs ?? [])])],
        root: base.root ?? prev.root ?? null,
        response: base.response ?? prev.response ?? null,
        gen: base.gen ?? prev.gen ?? null,
        model: base.model !== 'grok-imagine' && base.model !== 'imagine-image' && base.model !== 'imagine-video' ? base.model : prev.model,
        dur: base.dur ?? prev.dur,
        w: p.sizeKnown === false ? prev.w : base.w,
        h: p.sizeKnown === false ? prev.h : base.h,
        rRated: base.rRated || prev.rRated,
        thumbUrl: base.thumbUrl ?? prev.thumbUrl,
        thumbhash: base.thumbhash ?? prev.thumbhash,
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
