/**
 * Imagine Library – desktop shell (Electron).
 *
 * - Serves the Vite build from app://imagine/ (a real, persistent origin so
 *   IndexedDB keeps the library between runs).
 * - app://imagine/library/<rel> serves the download folder (same origin, so
 *   the renderer can draw thumbnails from it; supports Range for video seeking).
 * - Downloads run in the main process through the "persist:grok" session,
 *   which carries the cookies of the built-in Grok sign-in window.
 */
import { app, BrowserWindow, dialog, ipcMain, protocol, session, shell, type IpcMainInvokeEvent } from 'electron';
import { createReadStream, createWriteStream, promises as fs } from 'node:fs';
import { once } from 'node:events';
import path from 'node:path';
import { Readable } from 'node:stream';

const ORIGIN = 'app://imagine';
const DIST = path.join(__dirname, '..', '..', 'dist');
const GROK = 'https://grok.com/';

protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, corsEnabled: true } }
]);

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mov': 'video/quicktime',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff'
};

// ---------------- config ----------------
interface Config {
  dir?: string;
  exportDir?: string;
  bounds?: { width: number; height: number; x?: number; y?: number; max?: boolean };
}
const cfgFile = () => path.join(app.getPath('userData'), 'desktop.json');
let cfg: Config = {};
async function loadCfg() {
  try {
    cfg = JSON.parse(await fs.readFile(cfgFile(), 'utf8'));
  } catch {
    cfg = {};
  }
}
async function saveCfg() {
  await fs.mkdir(path.dirname(cfgFile()), { recursive: true });
  await fs.writeFile(cfgFile(), JSON.stringify(cfg, null, 2));
}
const libDir = () => cfg.dir ?? path.join(app.getPath('pictures'), 'Imagine Library');

/** Resolve `rel` inside `base`, refusing anything that escapes it. */
function inside(base: string, rel: string): string {
  const root = path.resolve(base);
  const p = path.resolve(root, rel);
  if (p !== root && !p.startsWith(root + path.sep)) throw new Error('Path outside library');
  return p;
}

// ---------------- protocol ----------------
async function serveFile(file: string, req: Request, cache: string): Promise<Response> {
  let size: number;
  try {
    const st = await fs.stat(file);
    if (!st.isFile()) throw new Error();
    size = st.size;
  } catch {
    return new Response('Not found', { status: 404 });
  }
  const type = MIME[path.extname(file).toLowerCase()] ?? 'application/octet-stream';
  const range = /bytes=(\d*)-(\d*)/.exec(req.headers.get('range') ?? '');
  if (range && size > 0) {
    let start = range[1] ? Number(range[1]) : NaN;
    let end = range[2] ? Number(range[2]) : size - 1;
    if (isNaN(start)) {
      start = Math.max(0, size - end);
      end = size - 1;
    }
    end = Math.min(end, size - 1);
    if (start > end) return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } });
    const body = Readable.toWeb(createReadStream(file, { start, end })) as ReadableStream;
    return new Response(body, {
      status: 206,
      headers: { 'Content-Type': type, 'Content-Range': `bytes ${start}-${end}/${size}`, 'Content-Length': String(end - start + 1), 'Accept-Ranges': 'bytes', 'Cache-Control': cache }
    });
  }
  const body = Readable.toWeb(createReadStream(file)) as ReadableStream;
  return new Response(body, { headers: { 'Content-Type': type, 'Content-Length': String(size), 'Accept-Ranges': 'bytes', 'Cache-Control': cache } });
}

function registerProtocol() {
  protocol.handle('app', async (req) => {
    const u = new URL(req.url);
    let p = decodeURIComponent(u.pathname);
    try {
      if (p.startsWith('/library/')) return await serveFile(inside(libDir(), p.slice('/library/'.length)), req, 'no-cache');
      if (p === '/' || p === '') p = '/index.html';
      return await serveFile(inside(DIST, p.slice(1)), req, 'no-cache');
    } catch {
      return new Response('Bad request', { status: 400 });
    }
  });
}

// ---------------- grok session ----------------
const grok = () => session.fromPartition('persist:grok');
/** Plain Chrome user agent (without "Electron/…"), so sign-in pages treat it as Chrome. */
const chromeUA = () => app.userAgentFallback.replace(/\s(?:Electron|imagine-library)\/\S+/gi, '');

async function grokSignedIn(): Promise<boolean> {
  const cookies = await grok().cookies.get({ url: GROK });
  return cookies.some((c) => /^sso(-rw)?$/.test(c.name) && !!c.value);
}

let loginWin: BrowserWindow | null = null;
function openLogin(parent: BrowserWindow): Promise<boolean> {
  if (loginWin) {
    loginWin.focus();
    return new Promise((r) => loginWin!.once('closed', () => grokSignedIn().then(r)));
  }
  loginWin = new BrowserWindow({
    parent,
    width: 1100,
    height: 820,
    title: 'Sign in to Grok – close this window when you are signed in',
    autoHideMenuBar: true,
    backgroundColor: '#000000',
    webPreferences: { partition: 'persist:grok', contextIsolation: true, sandbox: true }
  });
  loginWin.webContents.setWindowOpenHandler(({ url }) => {
    // OAuth pop-ups (Google / X / Apple) must stay inside the Grok session.
    if (/^https:\/\//.test(url)) return { action: 'allow', overrideBrowserWindowOptions: { autoHideMenuBar: true, webPreferences: { partition: 'persist:grok' } } };
    return { action: 'deny' };
  });
  loginWin.loadURL(GROK, { userAgent: chromeUA() });
  return new Promise((resolve) => {
    loginWin!.once('closed', () => {
      loginWin = null;
      grokSignedIn().then(resolve);
    });
  });
}

// ---------------- main window ----------------
let win: BrowserWindow | null = null;

function createWindow() {
  const b = cfg.bounds;
  win = new BrowserWindow({
    width: b?.width ?? 1440,
    height: b?.height ?? 920,
    x: b?.x,
    y: b?.y,
    minWidth: 400,
    minHeight: 560,
    title: 'Imagine Library',
    backgroundColor: '#141218',
    autoHideMenuBar: true,
    icon: path.join(DIST, 'icon-512.png'),
    show: false,
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, sandbox: true, spellcheck: false }
  });
  if (b?.max) win.maximize();
  win.once('ready-to-show', () => win?.show());

  // Links to grok.com etc. open in the normal browser.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith(ORIGIN)) {
      e.preventDefault();
      if (/^https?:\/\//.test(url)) shell.openExternal(url);
    }
  });

  const remember = () => {
    if (!win) return;
    const max = win.isMaximized();
    const r = win.getNormalBounds();
    cfg.bounds = { width: r.width, height: r.height, x: r.x, y: r.y, max };
  };
  win.on('resize', remember);
  win.on('move', remember);
  win.on('close', () => {
    remember();
    void saveCfg();
  });
  win.on('closed', () => (win = null));

  win.loadURL(`${ORIGIN}/index.html`);
}

// ---------------- IPC ----------------
type Dl = { ok: true; bytes: number } | { ok: false; status?: number; error?: string };

function handle<A extends unknown[], R>(ch: string, fn: (e: IpcMainInvokeEvent, ...a: A) => Promise<R> | R) {
  ipcMain.handle(ch, (e, ...a) => fn(e, ...(a as A)));
}

function registerIpc() {
  handle('lib:info', async () => ({ dir: libDir(), signedIn: await grokSignedIn(), platform: process.platform }));

  handle('lib:download', async (e, url: string, rel: string): Promise<Dl> => {
    if (!/^(https:\/\/|http:\/\/(localhost|127\.0\.0\.1)[:/])/.test(url)) return { ok: false, error: 'Only https downloads are allowed' };
    const file = inside(libDir(), rel);
    await fs.mkdir(path.dirname(file), { recursive: true });
    let res: Response;
    try {
      res = await grok().fetch(url, { headers: { Accept: 'image/*,video/*,*/*;q=0.8' }, referrer: GROK, cache: 'no-store' });
    } catch (err) {
      return { ok: false, error: `Network error: ${(err as Error).message}` };
    }
    if (!res.ok) return { ok: false, status: res.status };
    if ((res.headers.get('content-type') ?? '').includes('text/html')) {
      await res.body?.cancel();
      return { ok: false, error: 'Got a web page instead of media (sign in to Grok?)' };
    }
    const total = Number(res.headers.get('content-length')) || 0;
    const out = createWriteStream(file);
    let got = 0, last = 0;
    try {
      const reader = res.body!.getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        got += value.byteLength;
        if (!out.write(value)) await once(out, 'drain');
        const now = Date.now();
        if (now - last > 150) {
          last = now;
          if (!e.sender.isDestroyed()) e.sender.send('lib:progress', { url, got, total });
        }
      }
      await new Promise<void>((resolve, reject) => out.end((err?: Error | null) => (err ? reject(err) : resolve())));
    } catch (err) {
      out.destroy();
      await fs.rm(file, { force: true });
      return { ok: false, error: (err as Error).message };
    }
    return { ok: true, bytes: got };
  });

  handle('lib:write', async (_e, rel: string, data: Uint8Array) => {
    const file = inside(libDir(), rel);
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, data);
  });

  handle('lib:rename', async (_e, from: string, to: string) => {
    const a = inside(libDir(), from), b = inside(libDir(), to);
    await fs.rm(b, { force: true });
    await fs.rename(a, b);
  });

  handle('lib:delete', async (_e, rels: string[]) => {
    for (const r of rels) await fs.rm(inside(libDir(), r), { force: true });
  });

  handle('lib:clear', async () => {
    for (const d of ['media', 'thumbs']) await fs.rm(inside(libDir(), d), { recursive: true, force: true });
  });

  handle('lib:open', async () => {
    await fs.mkdir(libDir(), { recursive: true });
    await shell.openPath(libDir());
  });

  handle('lib:choose', async () => {
    const r = await dialog.showOpenDialog(win!, { title: 'Download folder', defaultPath: libDir(), properties: ['openDirectory', 'createDirectory'] });
    if (r.canceled || !r.filePaths[0]) return null;
    const to = r.filePaths[0];
    const from = libDir();
    if (path.resolve(to) === path.resolve(from)) return { dir: from, moved: false };
    let moved = false;
    for (const d of ['media', 'thumbs']) {
      const src = path.join(from, d), dst = path.join(to, d);
      try {
        await fs.access(src);
      } catch {
        continue;
      }
      try {
        await fs.access(dst);
        await fs.cp(src, dst, { recursive: true, force: false, errorOnExist: false });
        await fs.rm(src, { recursive: true, force: true });
      } catch {
        try {
          await fs.rename(src, dst);
        } catch {
          // Different drive: copy, then remove the old copy.
          await fs.cp(src, dst, { recursive: true });
          await fs.rm(src, { recursive: true, force: true });
        }
      }
      moved = true;
    }
    cfg.dir = to;
    await saveCfg();
    return { dir: to, moved };
  });

  handle('lib:export', async (_e, files: { rel: string; name: string }[], folder: string) => {
    const r = await dialog.showOpenDialog(win!, {
      title: `Save “${folder}” to…`,
      defaultPath: cfg.exportDir ?? app.getPath('pictures'),
      properties: ['openDirectory', 'createDirectory']
    });
    if (r.canceled || !r.filePaths[0]) return null;
    cfg.exportDir = r.filePaths[0];
    await saveCfg();
    const dest = path.join(r.filePaths[0], folder.replace(/[\\/:*?"<>|\u0000-\u001f]/g, ' ').trim() || 'Imagine');
    await fs.mkdir(dest, { recursive: true });
    let count = 0;
    for (const f of files) {
      try {
        await fs.copyFile(inside(libDir(), f.rel), path.join(dest, path.basename(f.name)));
        count++;
      } catch {
        /* skip missing */
      }
    }
    if (count) shell.openPath(dest);
    return { count, dest };
  });

  handle('grok:status', () => grokSignedIn());
  handle('grok:login', () => openLogin(win!));
  handle('grok:logout', async () => {
    await grok().clearStorageData();
    return false;
  });
}

// ---------------- lifecycle ----------------
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });
  app.setAppUserModelId('com.masterp001.imaginelibrary');
  app.whenReady().then(async () => {
    await loadCfg();
    grok().setUserAgent(chromeUA());
    grok().cookies.on('changed', () => {
      grokSignedIn().then((s) => win?.webContents.send('grok:status', s));
    });
    registerProtocol();
    registerIpc();
    createWindow();
    app.on('activate', () => BrowserWindow.getAllWindows().length === 0 && createWindow());
  });
  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}
