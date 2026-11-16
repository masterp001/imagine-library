import { thumbHashToDataURL } from 'thumbhash';

const cache = new Map<string, string | null>();

/** Decode a base64 thumbhash into a PNG data URL (cached). */
export function thumbUrl(hash: string | null): string | null {
  if (!hash) return null;
  if (cache.has(hash)) return cache.get(hash)!;
  let out: string | null = null;
  try {
    const bin = atob(hash.replace(/-/g, '+').replace(/_/g, '/'));
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    out = thumbHashToDataURL(bytes);
  } catch {
    out = null;
  }
  cache.set(hash, out);
  return out;
}
