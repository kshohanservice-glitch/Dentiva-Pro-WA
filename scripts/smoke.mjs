#!/usr/bin/env node
/**
 * Post-build smoke test for the Windows artifacts in dist/.
 * Verifies, without launching the GUI (CI has no interactive session):
 *   - Setup + Portable EXEs exist, are big enough, and are valid PE images
 *   - the app.asar is structurally valid (parsable header)
 *   - every file the main process resolves at startup is inside the asar
 *     (entrypoint, schema.sql, renderer bundle, embedded OFL fonts)
 *   - the asar's package.json version matches the repo version
 * Writes dist/SHA256SUMS.txt for distribution integrity.
 * Exits non-zero on any failure so the release is blocked.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');

let failures = 0;
const fail = (m) => {
  failures++;
  console.error(`  ✗ ${m}`);
};
const pass = (m) => console.log(`  ✓ ${m}`);

console.log('┌─ Smoke test: packaged Windows artifacts ───────────────');

const version = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version;
const list = (re) => (fs.existsSync(dist) ? fs.readdirSync(dist).filter((n) => re.test(n)) : []);

const setupNames = list(/^DentivaPro-Setup-.*\.exe$/);
const portableNames = list(/^DentivaPro-Portable-.*\.exe$/);
const setupExe = setupNames.map((n) => path.join(dist, n));
const portableExe = portableNames.map((n) => path.join(dist, n));

if (setupExe.length === 1) pass(`Setup installer found: ${setupNames[0]}`);
else fail(`expected exactly one DentivaPro-Setup-*.exe in dist/ (found ${setupExe.length})`);
if (portableExe.length === 1) pass(`Portable EXE found: ${portableNames[0]}`);
else fail(`expected exactly one DentivaPro-Portable-*.exe in dist/ (found ${portableExe.length})`);

const peOk = (p) => {
  const buf = fs.readFileSync(p);
  return buf.length > 1024 && buf[0] === 0x4d && buf[1] === 0x5a; // "MZ"
};
for (const exe of [...setupExe, ...portableExe]) {
  const sizeMb = fs.statSync(exe).size / 1024 / 1024;
  if (sizeMb < 20) fail(`${path.basename(exe)} is only ${sizeMb.toFixed(1)} MB — suspiciously small`);
  if (!peOk(exe)) fail(`${path.basename(exe)} is not a valid PE executable`);
  else pass(`${path.basename(exe)} — valid PE, ${sizeMb.toFixed(1)} MB`);
}

// ------------------------------------------------------- asar inspection
const asarPath = path.join(dist, 'win-unpacked', 'resources', 'app.asar');
let asarBuf = null;
let header = null;
if (!fs.existsSync(asarPath)) {
  fail(`app.asar not found at ${path.relative(root, asarPath)}`);
} else {
  asarBuf = fs.readFileSync(asarPath);
  // asar header layout: [4:4][4:outer-pickle-size][4:string-pickle-size][4:json-length][json + pad][data…]
  try {
    const jsonLen = asarBuf.readUInt32LE(12);
    header = JSON.parse(asarBuf.toString('utf8', 16, 16 + jsonLen));
    pass('app.asar header parses');
  } catch (e) {
    fail(`app.asar header unreadable: ${e.message}`);
  }
}

const dataOffset = () => 8 + asarBuf.readUInt32LE(4);

const findEntry = (name) => {
  if (!header) return null;
  let node = header;
  for (const part of name.split('/')) {
    if (!node || !node.files || !node.files[part]) return null;
    node = node.files[part];
  }
  return node;
};

const asarFile = (name) => {
  const entry = findEntry(name);
  if (!entry) return null;
  const d = entry.data ?? entry; // newer @electron/asar writes offset/size directly
  if (d.offset == null || d.size == null) return null;
  return asarBuf.subarray(dataOffset() + Number(d.offset), dataOffset() + Number(d.offset) + Number(d.size));
};

const REQUIRED = [
  'package.json',
  'dist-electron/electron/main.js',
  'dist-electron/electron/db/schema.sql',
  'dist/index.html',
  'resources/fonts/Inter-400.woff2',
  'resources/fonts/Inter-600.woff2',
  'resources/fonts/NotoSansBengali-400.woff2',
  'resources/fonts/NotoSansBengali-600.woff2',
  'node_modules/better-sqlite3/package.json',
  'node_modules/adm-zip/package.json',
];
for (const rel of REQUIRED) {
  if (findEntry(rel)) pass(`asar contains ${rel}`);
  else fail(`asar is missing ${rel}`);
}
if (asarBuf) {
  const pkgBuf = asarFile('package.json');
  if (pkgBuf) {
    const asarPkg = JSON.parse(pkgBuf.toString('utf8'));
    if (asarPkg.version !== version) fail(`asar package.json version ${asarPkg.version} ≠ repo version ${version}`);
    else pass(`asar package.json version = ${version}`);
  } else fail('could not read package.json data from asar');
}

// ------------------------------------------------------- SHA256 manifest
const artifacts = [...setupExe, ...portableExe].filter((p) => peOk(p));
const lines = artifacts.map((p) => {
  const h = crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
  return `${h}  ${path.basename(p)}`;
});
if (lines.length) {
  fs.writeFileSync(path.join(dist, 'SHA256SUMS.txt'), lines.join('\n') + '\n', 'utf8');
  pass(`wrote SHA256SUMS.txt (${lines.length} artifacts)`);
}

console.log('└───────────────────────────────────────────────────────────');
if (failures) {
  console.error(`\nSmoke test FAILED with ${failures} failure(s).`);
  process.exit(1);
}
console.log('\nSmoke test passed.');
