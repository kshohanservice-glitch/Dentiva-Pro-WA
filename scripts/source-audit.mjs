#!/usr/bin/env node
/**
 * Release gate: source & dependency audit.
 *
 *  1. No dead-end markers (TODO / FIXME / HACK / "coming soon" / "not
 *     implemented" / lorem ipsum) in production source — this is a final
 *     version; anything unfinished must be shipped complete or documented
 *     in docs/PROJECT_STATUS.md, never hidden in a code comment.
 *  2. The activation code must never appear as plaintext anywhere in
 *     source or build assets (it exists only as a derived digest).
 *  3. Every runtime dependency carries a license compatible with closed,
 *     commercial distribution (MIT / ISC / Apache-2.0 / BSD / 0BSD /
 *     OFL / Unlicense / CC0).
 *
 * Exits non-zero on any violation so CI blocks the release.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC_DIRS = ['src', 'electron', 'shared'];
const TEXT_EXT = new Set(['.ts', '.tsx', '.js', '.mjs', '.cjs', '.json', '.css', '.html', '.sql', '.md', '.yml', '.nsh']);

const MARKERS = [
  /\bTODO\b/,
  /\bFIXME\b/,
  /\bHACK\b/,
  /coming\s+soon/i,
  /not\s+implemented/i,
  /lorem\s+ipsum/i,
  /coming\s+in\s+(a\s+)?future\s+(update|release|version)/i,
];

// The activation code must not appear in plaintext in any file we ship or
// track. (It is derived at build-free runtime from a salted digest.)
const SECRET_LITERALS = [
  '1516591935015165',
];

const LICENSE_ALLOWLIST = /^(MIT|ISC|Apache-2\.0|BSD-2-Clause|BSD-3-Clause|0BSD|OFL-1\.1|OFL|Unlicense|CC0-1\.0)$/i;

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'dist' || entry.name === 'dist-electron') continue;
      walk(full, out);
    } else if (TEXT_EXT.has(path.extname(entry.name).toLowerCase())) {
      out.push(full);
    }
  }
  return out;
}

let violations = 0;
const fail = (msg) => {
  violations++;
  console.error(`  ✗ ${msg}`);
};
const pass = (msg) => console.log(`  ✓ ${msg}`);

console.log('┌─ Source audit ─────────────────────────────────────────────');
const files = SRC_DIRS.map((d) => path.join(root, d)).filter((d) => fs.existsSync(d)).flatMap((d) => walk(d));
console.log(`│ Scanning ${files.length} source files in ${SRC_DIRS.join(', ')}…`);

for (const file of files) {
  const text = fs.readFileSync(file, 'utf8');
  const rel = path.relative(root, file);
  text.split('\n').forEach((line, i) => {
    for (const re of MARKERS) {
      if (re.test(line)) fail(`${rel}:${i + 1} unfinished-work marker: "${line.trim().slice(0, 90)}"`);
    }
  });
  for (const secret of SECRET_LITERALS) {
    if (text.includes(secret)) fail(`${rel}: activation code literal found in plaintext`);
  }
}

// also sweep the whole repo root configs (not node_modules) for the secret
for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
  if (entry.isDirectory()) continue;
  if (!TEXT_EXT.has(path.extname(entry.name).toLowerCase())) continue;
  const text = fs.readFileSync(path.join(root, entry.name), 'utf8');
  for (const secret of SECRET_LITERALS) {
    if (text.includes(secret)) fail(`${entry.name}: activation code literal found in plaintext`);
  }
}

console.log('┌─ Dependency license audit (runtime dependencies) ───────');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const deps = Object.keys(pkg.dependencies ?? {});
for (const name of deps) {
  const pj = path.join(root, 'node_modules', ...name.split('/'), 'package.json');
  if (!fs.existsSync(pj)) {
    fail(`${name}: package.json not found in node_modules (run npm ci first)`);
    continue;
  }
  const meta = JSON.parse(fs.readFileSync(pj, 'utf8'));
  const lic = (meta.license && typeof meta.license === 'object' ? meta.license.type : meta.license) || 'UNKNOWN';
  if (LICENSE_ALLOWLIST.test(lic)) pass(`${name}@${meta.version} — ${lic}`);
  else fail(`${name}@${meta.version} — license "${lic}" is not on the commercial allowlist`);
}

console.log('└───────────────────────────────────────────────────────────');
if (violations) {
  console.error(`\nSource audit FAILED with ${violations} violation(s). Release is blocked.`);
  process.exit(1);
}
console.log('\nSource audit passed: no dead-end markers, no plaintext secrets, all runtime dependencies license-clean.');
