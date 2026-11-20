import type { Item } from './types';

/**
 * Derived structure on top of the flat library.
 *
 * Exact data always wins: `item.parent` (live sync childPosts, edits) and
 * `item.variant` (conversation / response ids). Where it's missing — e.g. the
 * official data export, which only has id, prompt, type and time — two
 * heuristics fill in, measured on a real 14k-item library:
 *
 * - Batch: same prompt + same type, created ≤ BATCH_GAP apart (chained).
 *   Stands in for Grok's responseId (one request → n images).
 * - Image → video: a video without a known source belongs to the newest image
 *   created ≤ VIDEO_WINDOW before it (81 % of videos have one; median 72 s).
 *   Prompts don't help here: video prompts are motion prompts, often empty.
 *   Exception: "Extend this video" continues the newest earlier video.
 */

export const BATCH_GAP = 60_000;
export const VIDEO_WINDOW = 10 * 60_000;

/** How an item was made, as far as we can tell. */
export type Origin = 'text-image' | 'edit' | 'image-video' | 'text-video' | 'extend';

export const ORIGIN_LABEL: Record<Origin, string> = {
  'text-image': 'Text → image',
  edit: 'Edit (image → image)',
  'image-video': 'Image → video',
  'text-video': 'Text → video',
  extend: 'Video extension'
};

/** "Extend this video" etc.: continues the previous video, not an image. */
const isExtend = (i: Item) => i.kind === 'video' && /\bextend(ed|ing)?\b|\bverlänger/i.test(i.prompt);

export interface Grouping {
  /** id → batch key (only for batches with ≥ 2 members). */
  batchOf: Map<string, string>;
  /** batch key → members, newest first. */
  batches: Map<string, Item[]>;
  /** video id → likely source image id (only where `parent` is unknown). */
  inferred: Map<string, string>;
  /** parent id → children (exact and inferred), oldest first. */
  children: Map<string, Item[]>;
  origin: Map<string, Origin>;
}

export const normPrompt = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const isEdit = (i: Item) => /edit/i.test(i.model) || /edit/i.test(i.mode ?? '') || (i.kind === 'image' && !!i.parent);

export function computeGrouping(items: Item[]): Grouping {
  const asc = [...items].sort((a, b) => a.createdAt - b.createdAt);
  const batchOf = new Map<string, string>();
  const batches = new Map<string, Item[]>();
  const inferred = new Map<string, string>();
  const children = new Map<string, Item[]>();
  const origin = new Map<string, Origin>();

  // ---- batches ----
  const add = (key: string, it: Item) => {
    batchOf.set(it.id, key);
    (batches.get(key) ?? batches.set(key, []).get(key)!).push(it);
  };
  // Explicit variant groups first (same conversation / request), but only items
  // that also share prompt and type: a whole session isn't one batch.
  const byVariant = new Map<string, Item[]>();
  for (const it of asc) {
    if (!it.variant) continue;
    const k = it.variant + '|' + it.kind + '|' + normPrompt(it.prompt);
    (byVariant.get(k) ?? byVariant.set(k, []).get(k)!).push(it);
  }
  for (const [k, g] of byVariant) if (g.length > 1) for (const it of g) add('v:' + k, it);
  // Then time + prompt bursts for the rest.
  const open = new Map<string, { key: string; last: number; first: Item; n: number }>();
  for (const it of asc) {
    if (batchOf.has(it.id)) continue;
    const p = normPrompt(it.prompt);
    if (!p) continue;
    const sig = it.kind + '|' + p;
    const run = open.get(sig);
    if (run && it.createdAt - run.last <= BATCH_GAP) {
      if (run.n === 1) add(run.key, run.first);
      add(run.key, it);
      run.last = it.createdAt;
      run.n++;
    } else {
      open.set(sig, { key: 'b:' + it.id, last: it.createdAt, first: it, n: 1 });
    }
  }
  for (const g of batches.values()) g.sort((a, b) => b.createdAt - a.createdAt);

  // ---- image → video ----
  let lastImage: Item | null = null, lastVideo: Item | null = null;
  for (const it of asc) {
    if (it.kind === 'image') {
      lastImage = it;
      continue;
    }
    const src = isExtend(it) ? lastVideo : lastImage;
    if (!it.parent && src && it.createdAt - src.createdAt <= VIDEO_WINDOW) inferred.set(it.id, src.id);
    lastVideo = it;
  }

  // ---- children + origin ----
  const byId = new Map(asc.map((i) => [i.id, i]));
  for (const it of asc) {
    const p = it.parent ?? inferred.get(it.id);
    if (p) (children.get(p) ?? children.set(p, []).get(p)!).push(it);
    const src = p ? byId.get(p) : undefined;
    origin.set(
      it.id,
      it.kind === 'video' ? (src?.kind === 'video' || (!src && isExtend(it)) ? 'extend' : p ? 'image-video' : 'text-video') : isEdit(it) ? 'edit' : 'text-image'
    );
  }

  return { batchOf, batches, inferred, children, origin };
}

/**
 * Collapse batches for the grid: one cover (newest member present in `list`)
 * per batch, with the number of members in `list`.
 */
export function stack(list: Item[], g: Grouping): { cover: Item; count: number; members: Item[] }[] {
  const out: { cover: Item; count: number; members: Item[] }[] = [];
  const at = new Map<string, number>();
  for (const it of list) {
    const key = g.batchOf.get(it.id);
    if (!key) {
      out.push({ cover: it, count: 1, members: [it] });
      continue;
    }
    const idx = at.get(key);
    if (idx === undefined) {
      at.set(key, out.length);
      out.push({ cover: it, count: 1, members: [it] });
    } else {
      out[idx].count++;
      out[idx].members.push(it);
    }
  }
  return out;
}
