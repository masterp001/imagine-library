import type { Item, SmartGroup } from './types';

const STOP = new Set(
  ('a an and the of in on at to with from by for into onto over under through as is are be it its this that ' +
    'very slow slowly soft high low style shot photo image video picture render rendering realistic photorealistic ' +
    'detailed ultra 4k 8k hd quality cinematic lighting light background scene view loop seamless ' +
    'eine ein der die das und mit im auf von zu den dem des').split(' ')
);

export function tokens(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
    .split(/\s+/)
    .map((t) => t.replace(/^-+|-+$/g, ''))
    .filter((t) => t.length > 2 && !STOP.has(t) && !/^\d+$/.test(t))
    .map((t) => (t.length > 4 && t.endsWith('s') && !t.endsWith('ss') ? t.slice(0, -1) : t));
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * Groups items by prompt similarity: greedily picks the most discriminative
 * shared keyword, gathers items whose prompts share it (plus its strongest
 * co-occurring words), and names the group after those keywords.
 */
export function smartGroups(items: Item[], max = 10): SmartGroup[] {
  if (items.length < 2) return [];
  const docs = items.map((i) => new Set(tokens(i.prompt)));
  const df = new Map<string, number>();
  for (const d of docs) for (const t of d) df.set(t, (df.get(t) ?? 0) + 1);

  const n = items.length;
  const ceiling = Math.max(3, Math.floor(n * 0.35));
  const assigned = new Set<number>();
  const groups: SmartGroup[] = [];

  const candidates = [...df.entries()]
    .filter(([, c]) => c >= 2 && c <= ceiling)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));

  for (const [term] of candidates) {
    if (groups.length >= max) break;
    const members = docs.map((d, i) => (d.has(term) && !assigned.has(i) ? i : -1)).filter((i) => i >= 0);
    if (members.length < 2) continue;

    // Co-occurring keywords that describe the group.
    const co = new Map<string, number>();
    for (const i of members) for (const t of docs[i]) if (t !== term) co.set(t, (co.get(t) ?? 0) + 1);
    const kw = [term, ...[...co.entries()]
      .filter(([, c]) => c >= Math.max(2, Math.ceil(members.length * 0.4)))
      .sort((a, b) => b[1] - a[1] || (df.get(a[0]) ?? 0) - (df.get(b[0]) ?? 0))
      .slice(0, 2)
      .map(([t]) => t)];

    for (const i of members) assigned.add(i);
    groups.push({
      id: 's:' + term,
      name: kw.length > 1 ? `${cap(kw[0])} & ${kw[1]}` : cap(kw[0]),
      kw,
      ids: members.map((i) => items[i].id)
    });
  }
  return groups.sort((a, b) => b.ids.length - a.ids.length);
}
