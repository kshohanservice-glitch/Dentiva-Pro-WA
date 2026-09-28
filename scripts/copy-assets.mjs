#!/usr/bin/env node
/**
 * Post-compile step: tsc only emits .js. Non-code assets that main-process
 * code resolves relative to __dirname must be copied alongside it.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const pairs = [
  ['electron/db', 'dist-electron/electron/db'], // schema.sql (migrations run from __dirname/db)
];
for (const [from, to] of pairs) {
  const f = path.join(root, from);
  const t = path.join(root, to);
  if (!fs.existsSync(f)) {
    console.error(`copy-assets: missing source ${from}`);
    process.exit(1);
  }
  fs.cpSync(f, t, { recursive: true });
  console.log(`copied ${from} → ${to}`);
}
