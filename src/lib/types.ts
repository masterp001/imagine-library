export type Kind = 'image' | 'video';

export interface Item {
  /** Grok asset id (or demo id). */
  id: string;
  kind: Kind;
  prompt: string;
  /** Aspect ratio as integers, e.g. 2:3. */
  w: number;
  h: number;
  /** Epoch ms. */
  createdAt: number;
  model: string;
  mode: string | null;
  seed: number | null;
  fav: boolean;
  rating: number;
  /** Id of the source image this item was generated from (image → video chain). */
  parent: string | null;
  /** Variation group key; items sharing it are shown as variations. */
  variant: string | null;
  colls: string[];
  notes: string;
  /** Video duration, formatted m:ss. */
  dur: string | null;
  /** Full-size media URL (assets.grok.com/…), if known. */
  mediaUrl: string | null;
  /** Smaller preview URL, if the export carries one. */
  thumbUrl: string | null;
  /** Base64 thumbhash placeholder. */
  thumbhash: string | null;
  rRated: boolean;
  /** Hue for the striped placeholder (0–360). */
  hue: number;
  /** Link to the post on grok.com. */
  grokUrl: string;
}

export interface Collection {
  id: string;
  name: string;
}

export interface ImportRecord {
  at: number;
  added: number;
  updated: number;
  source: string;
}

export interface Settings {
  layout: 'masonry' | 'grid';
  showSmartStrip: boolean;
  hideRRated: boolean;
  loadMedia: boolean;
}

export interface Persisted {
  version: 1;
  items: Item[];
  colls: Collection[];
  settings: Settings;
  history: ImportRecord[];
  recents: string[];
  lastImport: number | null;
  demo: boolean;
}

export interface SmartGroup {
  id: string;
  name: string;
  kw: string[];
  ids: string[];
}

export type Screen = 'library' | 'detail' | 'search' | 'collections' | 'collection' | 'offline' | 'sync';
export type Filter = 'all' | 'images' | 'videos' | 'favorites' | 'chains';
export type Scope = 'all' | 'prompt' | 'notes' | 'meta';
