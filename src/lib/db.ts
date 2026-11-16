import { get, set, del } from 'idb-keyval';
import type { Persisted } from './types';

const KEY = 'imagine-library:v1';

/** IndexedDB with a localStorage fallback; never throws. */
export async function load(): Promise<Persisted | null> {
  try {
    const v = await get<Persisted>(KEY);
    if (v && v.version === 1) return v;
  } catch { /* fall through */ }
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw) as Persisted;
  } catch { /* ignore */ }
  return null;
}

export async function save(data: Persisted): Promise<void> {
  try {
    await set(KEY, data);
    return;
  } catch { /* fall through */ }
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch { /* storage unavailable or full */ }
}

export async function clear(): Promise<void> {
  try { await del(KEY); } catch { /* ignore */ }
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
}
