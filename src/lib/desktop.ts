/** Typed access to the Electron preload bridge (undefined in the browser / Android app). */
export type DesktopDownload = { ok: true; bytes: number } | { ok: false; status?: number; error?: string };

export interface DesktopApi {
  info(): Promise<{ dir: string; signedIn: boolean; platform: string }>;
  download(url: string, rel: string): Promise<DesktopDownload>;
  write(rel: string, data: ArrayBuffer): Promise<void>;
  rename(from: string, to: string): Promise<void>;
  remove(rels: string[]): Promise<void>;
  clear(): Promise<void>;
  openFolder(): Promise<void>;
  chooseFolder(): Promise<{ dir: string; moved: boolean } | null>;
  exportFiles(files: { rel: string; name: string }[], folder: string): Promise<{ count: number; dest: string } | null>;
  grokStatus(): Promise<boolean>;
  grokApi(path: string, body: string, reload?: boolean, method?: 'GET' | 'POST'): Promise<{ status: number; text: string }>;
  grokLogin(): Promise<boolean>;
  grokLogout(): Promise<boolean>;
  onProgress(cb: (p: { url: string; got: number; total: number }) => void): () => void;
  onGrokStatus(cb: (signedIn: boolean) => void): () => void;
}

export const desk: DesktopApi | undefined = (globalThis as unknown as { imagineDesktop?: DesktopApi }).imagineDesktop;
