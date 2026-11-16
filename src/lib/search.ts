import type { Collection, Item, Scope } from './types';
import { dayLabel } from './format';

export interface Seg {
  t: string;
  hit: boolean;
}

export function segs(text: string, q: string): Seg[] {
  if (!q) return [{ t: text, hit: false }];
  const out: Seg[] = [];
  const lt = text.toLowerCase();
  let i = 0;
  for (;;) {
    const j = lt.indexOf(q, i);
    if (j < 0) {
      out.push({ t: text.slice(i), hit: false });
      break;
    }
    if (j > i) out.push({ t: text.slice(i, j), hit: false });
    out.push({ t: text.slice(j, j + q.length), hit: true });
    i = j + q.length;
  }
  return out.filter((s) => s.t);
}

export type Field = 'seed' | 'mode' | 'model' | 'note' | 'prompt' | 'kind' | 'ratio';

export interface ParsedQuery {
  q: string;
  field: Field | null;
  scope: Scope;
}

export function parseQuery(raw: string, scope: Scope): ParsedQuery {
  let q = raw.trim().toLowerCase();
  let field: Field | null = null;
  const m = q.match(/^(seed|mode|model|note|notes|prompt|kind|ratio|aspect):\s*(.*)$/);
  if (m) {
    field = (m[1] === 'notes' ? 'note' : m[1] === 'aspect' ? 'ratio' : m[1]) as Field;
    q = m[2].trim();
  }
  const fieldScope: Record<Field, Scope> = { seed: 'meta', mode: 'meta', model: 'meta', kind: 'meta', ratio: 'meta', note: 'notes', prompt: 'prompt' };
  return { q, field, scope: field ? fieldScope[field] : scope };
}

export interface Result {
  item: Item;
  segs: Seg[];
  noteSegs: Seg[] | null;
  metaSegs: Seg[];
}

export function metaLine(i: Item): string {
  return [i.kind, dayLabel(i.createdAt), i.mode, i.seed != null ? `seed ${i.seed}` : null, `${i.w}:${i.h}`]
    .filter(Boolean)
    .join(' · ');
}

export function search(items: Item[], colls: Collection[], groupNames: Map<string, string>, pq: ParsedQuery): Result[] {
  const { q, field, scope } = pq;
  if (!q) return [];
  const out: Result[] = [];
  for (const i of items) {
    const meta = metaLine(i);
    const inPrompt = (scope === 'all' || scope === 'prompt') && i.prompt.toLowerCase().includes(q);
    const inNote = (scope === 'all' || scope === 'notes') && i.notes.toLowerCase().includes(q);
    const hay =
      field === 'seed' ? String(i.seed ?? '')
      : field === 'mode' ? (i.mode ?? '')
      : field === 'kind' ? i.kind
      : field === 'model' ? i.model
      : field === 'ratio' ? `${i.w}:${i.h}`
      : `${meta} ${i.model}`;
    const inMeta = (scope === 'all' || scope === 'meta') && hay.toLowerCase().includes(q);
    const other = colls.filter((c) => i.colls.includes(c.id)).map((c) => c.name).join(' ') + ' ' + (groupNames.get(i.id) ?? '');
    const inOther = scope === 'all' && other.toLowerCase().includes(q);
    if (!(inPrompt || inNote || inMeta || inOther)) continue;
    out.push({
      item: i,
      segs: segs(i.prompt || '(no prompt)', inPrompt ? q : ''),
      noteSegs: inNote ? segs(i.notes, q) : null,
      metaSegs: segs(meta, inMeta ? q : '')
    });
  }
  return out;
}
