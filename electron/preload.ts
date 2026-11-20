import { contextBridge, ipcRenderer } from 'electron';

/** Bridge for the desktop build; the renderer sees it as `window.imagineDesktop`. */
contextBridge.exposeInMainWorld('imagineDesktop', {
  info: () => ipcRenderer.invoke('lib:info'),
  download: (url: string, rel: string) => ipcRenderer.invoke('lib:download', url, rel),
  write: (rel: string, data: ArrayBuffer) => ipcRenderer.invoke('lib:write', rel, new Uint8Array(data)),
  rename: (from: string, to: string) => ipcRenderer.invoke('lib:rename', from, to),
  remove: (rels: string[]) => ipcRenderer.invoke('lib:delete', rels),
  clear: () => ipcRenderer.invoke('lib:clear'),
  openFolder: () => ipcRenderer.invoke('lib:open'),
  chooseFolder: () => ipcRenderer.invoke('lib:choose'),
  exportFiles: (files: { rel: string; name: string }[], folder: string) => ipcRenderer.invoke('lib:export', files, folder),
  grokStatus: () => ipcRenderer.invoke('grok:status'),
  grokApi: (path: string, body: string, reload?: boolean) => ipcRenderer.invoke('grok:api', path, body, reload),
  grokLogin: () => ipcRenderer.invoke('grok:login'),
  grokLogout: () => ipcRenderer.invoke('grok:logout'),
  onProgress: (cb: (p: { url: string; got: number; total: number }) => void) => {
    const h = (_e: unknown, p: { url: string; got: number; total: number }) => cb(p);
    ipcRenderer.on('lib:progress', h);
    return () => ipcRenderer.off('lib:progress', h);
  },
  onGrokStatus: (cb: (signedIn: boolean) => void) => {
    const h = (_e: unknown, s: boolean) => cb(s);
    ipcRenderer.on('grok:status', h);
    return () => ipcRenderer.off('grok:status', h);
  }
});
