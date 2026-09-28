import { contextBridge, ipcRenderer } from 'electron';

/**
 * The ONLY surface the renderer has. No nodeIntegration, no raw ipc —
 * a typed invoke() that always returns { ok, data | error }.
 */
const api = {
  invoke(channel: string, args?: unknown): Promise<{ ok: boolean; data?: unknown; error?: { code: string; message: string; details?: unknown } }> {
    return ipcRenderer.invoke('dentiva:invoke', channel, args) as Promise<{
      ok: boolean;
      data?: unknown;
      error?: { code: string; message: string; details?: unknown };
    }>;
  },
  on(event: 'session:locked' | 'notification:created', listener: (payload?: unknown) => void): () => void {
    const listenerWrapper = (_e: unknown, payload?: unknown) => listener(payload);
    ipcRenderer.on(event, listenerWrapper);
    return () => {
      ipcRenderer.removeListener(event, listenerWrapper);
    };
  },
  activity(): void {
    ipcRenderer.send('dentiva:activity');
  },
};

contextBridge.exposeInMainWorld('dentiva', api);

export type DentivaApi = typeof api;
