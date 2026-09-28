/**
 * Channel contract: every IPC channel the renderer invokes must exist in
 * the production router. A typo here would be a silent "Unknown operation"
 * at runtime — TypeScript cannot catch it.
 */
import { describe, it, expect, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

vi.mock('electron', () => ({
  ipcMain: { handle: () => {} },
  BrowserWindow: class {},
  dialog: { showOpenDialog: async () => ({ canceled: true, filePaths: [] }) },
  app: { getPath: () => os.tmpdir() },
  shell: { openPath: async () => '' },
}));

import { buildRouter } from '../electron/ipc';

function collectChannels(dir: string, out = new Set<string>()): Set<string> {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      collectChannels(full, out);
    } else if (/\.(ts|tsx)$/.test(entry.name)) {
      const text = fs.readFileSync(full, 'utf8');
      const re = /(?:api(?:<[^(]*>)?|window\.dentiva\.invoke)\(\s*['"]([a-z][a-zA-Z0-9.]*)['"]/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(text))) out.add(m[1]);
    }
  }
  return out;
}

describe('IPC channel contract', () => {
  it('every renderer-invoked channel exists in the router', () => {
    const router = buildRouter();
    const root = path.join(__dirname, '..');
    const used = collectChannels(path.join(root, 'src'));
    expect(used.size).toBeGreaterThan(30); // sanity: we actually found the calls
    const missing = [...used].filter((c) => !(c in router));
    expect(missing).toEqual([]);
  });

  it('every router channel invoked by the renderer is wired to a handler', () => {
    const router = buildRouter();
    for (const [ch, def] of Object.entries(router)) {
      const handler = typeof def === 'function' ? def : def.run;
      expect(typeof handler, ch).toBe('function');
    }
  });
});
