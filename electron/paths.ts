import os from 'node:os';
import path from 'node:path';

/**
 * Data directory resolution.
 * Production (Windows): %APPDATA%\Dentiva Pro
 * Tests: DENTIVA_DATA_DIR override (kept fully isolated).
 */
export interface DataPaths {
  root: string;
  data: string;
  attachments: string;
  logs: string;
  config: string;
  dbFile: string;
}

export function resolveDataPaths(userDataDir?: string): DataPaths {
  const root =
    process.env.DENTIVA_DATA_DIR ||
    userDataDir ||
    path.join(os.homedir(), 'AppData', 'Roaming', 'Dentiva Pro');
  const data = path.join(root, 'data');
  return {
    root,
    data,
    attachments: path.join(root, 'attachments'),
    logs: path.join(root, 'logs'),
    config: path.join(root, 'config'),
    dbFile: path.join(data, 'dentiva.db'),
  };
}

/** Default backup destination: <dataRoot>/backups */
export function defaultBackupDir(dataRoot: string): string {
  return path.join(dataRoot, 'backups');
}
