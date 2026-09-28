import fs from 'node:fs';
import path from 'node:path';

/**
 * Structured JSONL logger with size-based rotation.
 * NEVER logs secrets: a redaction list is applied to every serialized value.
 */

const REDACTED_KEYS = new Set([
  'password',
  'passwordHash',
  'hash',
  'secret',
  'token',
  'activation',
  'activationCode',
  'auth',
]);

const MAX_FILE_BYTES = 5 * 1024 * 1024;
const KEEP_FILES = 14;

function redact(value: unknown, depth = 0): unknown {
  if (depth > 6) return '[deep]';
  if (typeof value === 'string') {
    if (value.length > 2000) return value.slice(0, 2000) + '…(truncated)';
    return value;
  }
  if (Array.isArray(value)) return value.slice(0, 50).map((v) => redact(v, depth + 1));
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = REDACTED_KEYS.has(k.toLowerCase()) ? '[redacted]' : redact(v, depth + 1);
    }
    return out;
  }
  return value;
}

export interface Logger {
  info: (msg: string, ctx?: unknown) => void;
  warn: (msg: string, ctx?: unknown) => void;
  error: (msg: string, ctx?: unknown) => void;
  dir: string;
}

export function createLogger(logsDir: string): Logger {
  fs.mkdirSync(logsDir, { recursive: true });
  const day = () => new Date().toISOString().slice(0, 10).replace(/-/g, '');
  let currentDay = '';
  let currentPath = '';

  const fileFor = (d: string): string => path.join(logsDir, `app-${d}.log`);

  const prune = () => {
    try {
      const files = fs
        .readdirSync(logsDir)
        .filter((f) => /^app-\d{8}\.log$/.test(f))
        .sort()
        .reverse();
      for (const f of files.slice(KEEP_FILES)) fs.rmSync(path.join(logsDir, f), { force: true });
    } catch {
      /* best effort */
    }
  };

  const write = (level: string, msg: string, ctx?: unknown) => {
    try {
      const d = day();
      if (d !== currentDay || fs.existsSync(currentPath) && fs.statSync(currentPath).size >= MAX_FILE_BYTES) {
        currentDay = d;
        currentPath = fileFor(d);
        prune();
      }
      const line = JSON.stringify({
        ts: new Date().toISOString(),
        level,
        msg,
        ...(ctx !== undefined ? { ctx: redact(ctx) } : {}),
      }) + '\n';
      fs.appendFileSync(currentPath, line, 'utf8');
    } catch {
      /* logging must never crash the app */
    }
  };

  return {
    dir: logsDir,
    info: (m, c) => write('info', m, c),
    warn: (m, c) => write('warn', m, c),
    error: (m, c) => write('error', m, c),
  };
}

export type { Logger as AppLogger };
