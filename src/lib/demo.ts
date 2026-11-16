import type { Collection, Item } from './types';

// Sample library from the design handoff. Dates are relative to "now" so the
// day grouping (Today / Yesterday / …) looks like the mockup.
type Row = [
  id: string, kind: 'image' | 'video', prompt: string, w: number, h: number,
  daysAgo: number, time: string, hue: number, mode: string, seed: number,
  fav: 0 | 1, rating: number, parent: string | null, variant: string | null,
  colls: string[], notes: string, dur?: string
];

const RAW: Row[] = [
  ['g01', 'image', 'Rain-soaked neon alley at night, cyberpunk, reflections in puddles, 35mm film', 2, 3, 0, '10:42', 330, 'Normal', 4417092, 1, 5, null, 'v1', ['c1', 'c4'], 'Best reflections so far. Try a wider lens next.'],
  ['g02', 'video', 'Rain-soaked neon alley, slow push-in, steam rising from grates', 9, 16, 0, '10:47', 320, 'Normal', 4417092, 1, 4, 'g01', null, ['c3'], '', '0:06'],
  ['g03', 'image', 'Neon alley from overhead, pink signage, wet asphalt', 2, 3, 0, '10:51', 345, 'Fun', 8830215, 0, 3, null, 'v1', [], ''],
  ['g04', 'image', 'Ceramic vase still life, morning window light, linen backdrop', 1, 1, 0, '09:15', 40, 'Normal', 1290334, 1, 4, null, null, ['c2'], 'Kestrel palette reference'],
  ['g05', 'image', 'Stacked glazed teacups, celadon, soft long shadows', 4, 5, 0, '09:20', 150, 'Normal', 1290877, 0, 3, null, null, ['c2'], ''],
  ['g06', 'image', 'Bioluminescent jellyfish macro, black water, drifting particles', 9, 16, 1, '22:03', 220, 'Custom', 5521900, 1, 5, null, null, ['c1'], 'Album cover candidate #2'],
  ['g07', 'video', 'Jellyfish pulsing slowly, bioluminescent trails, seamless loop', 9, 16, 1, '22:10', 205, 'Custom', 5521900, 0, 4, 'g06', null, ['c3'], '', '0:10'],
  ['g08', 'image', 'Tram crossing a bridge at dusk, Lisbon, film grain', 3, 2, 1, '18:30', 60, 'Normal', 7012448, 0, 3, null, null, [], ''],
  ['g09', 'image', 'Portrait of an old fisherman, knit cap, overcast harbor', 4, 5, 1, '14:12', 250, 'Normal', 3340019, 0, 4, null, null, ['c2'], 'Use for the character sheet'],
  ['g10', 'image', 'Paper-cut forest diorama, layered, warm backlight', 1, 1, 4, '16:40', 125, 'Fun', 6603381, 1, 5, null, null, ['c1', 'c4'], ''],
  ['g11', 'video', 'Slow dolly through paper-cut forest, light flickering through layers', 16, 9, 4, '16:48', 110, 'Fun', 6603381, 0, 4, 'g10', null, ['c3'], '', '0:08'],
  ['g12', 'image', 'Brutalist library interior, skylight, dust in the air', 16, 9, 4, '11:05', 270, 'Normal', 9100452, 0, 3, null, null, ['c2'], ''],
  ['g13', 'image', 'Retro sci-fi paperback cover, chrome rocket, orange sky', 2, 3, 4, '10:20', 35, 'Fun', 2208741, 1, 4, null, 'v2', ['c1'], ''],
  ['g14', 'image', 'Retro sci-fi paperback cover, chrome rocket, teal sky', 2, 3, 4, '10:24', 190, 'Fun', 2208742, 0, 3, null, 'v2', [], 'Teal version reads better small'],
  ['g15', 'image', 'Koi pond from above, ripples, flecks of gold leaf', 1, 1, 13, '20:15', 80, 'Normal', 4471205, 0, 4, null, null, ['c4'], ''],
  ['g16', 'video', 'Koi circling in a pond, top-down, gentle ripples, loop', 1, 1, 13, '20:22', 70, 'Normal', 4471205, 1, 5, 'g15', null, ['c3', 'c4'], '', '0:06'],
  ['g17', 'image', 'Hands shaping clay on a wheel, studio light, shallow focus', 3, 4, 13, '13:02', 25, 'Normal', 1290990, 0, 3, null, null, [], ''],
  ['g18', 'image', 'Desert motel sign at night, neon, long exposure, stars', 3, 2, 13, '01:44', 0, 'Normal', 8015562, 0, 4, null, null, ['c1'], '']
];

export const DEMO_COLLS: Collection[] = [
  { id: 'c1', name: 'Album cover ideas' },
  { id: 'c2', name: 'Kestrel moodboard' },
  { id: 'c3', name: 'Loops for reel' },
  { id: 'c4', name: 'Keepers' }
];

const gid = (seed: number, hue: number, id: string) =>
  `${seed.toString(16).padStart(8, '0')}-${(hue * 37 + 4096).toString(16)}-4c1e-9b7a-${id.replace('g', '')}d3e8f1a0`;

export function demoItems(now = new Date()): Item[] {
  return RAW.map((r) => {
    const [id, kind, prompt, w, h, daysAgo, time, hue, mode, seed, fav, rating, parent, variant, colls, notes, dur] = r;
    const [hh, mm] = time.split(':').map(Number);
    const d = new Date(now);
    d.setDate(d.getDate() - daysAgo);
    d.setHours(hh, mm, 0, 0);
    const g = gid(seed, hue, id);
    return {
      id, kind, prompt, w, h, createdAt: d.getTime(), model: 'grok-imagine', mode, seed,
      fav: !!fav, rating, parent, variant, colls: [...colls], notes, dur: dur ?? null,
      mediaUrl: null, thumbUrl: null, thumbhash: null, rRated: false, hue,
      grokUrl: `https://grok.com/imagine/post/${g}`
    };
  });
}
