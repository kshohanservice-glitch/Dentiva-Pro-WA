import crypto from 'node:crypto';
import fs from 'node:fs';

/**
 * Password storage: scrypt (N=2^17, r=8, p=1) — a strong, modern, built-in KDF.
 * Encoding: scrypt$17:8:1$<saltB64>$<hashB64>  (hash = 64 bytes)
 * Verification is constant-time.
 */

const N = 17; // 2^17
const R = 8;
const P = 1;
const KEYLEN = 64;
const SALTLEN = 32;

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(SALTLEN);
  const hash = crypto.scryptSync(password, salt, KEYLEN, { N: 1 << N, r: R, p: P, maxmem: 64 * (1 << (N + R + 1)) });
  return `scrypt$${N}:${R}:${P}$${salt.toString('base64')}$${hash.toString('base64')}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  try {
    const [algo, params, saltB64, hashB64] = stored.split('$');
    if (algo !== 'scrypt') return false;
    const [nExp, r, p] = params.split(':').map(Number);
    const salt = Buffer.from(saltB64, 'base64');
    const expected = Buffer.from(hashB64, 'base64');
    const actual = crypto.scryptSync(password, salt, expected.length, { N: 1 << nExp, r, p, maxmem: 64 * (1 << (nExp + r + 1)) });
    return crypto.timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

export function validatePasswordPolicy(password: string): string | null {
  if (password.length < 8) return 'Password must be at least 8 characters long.';
  if (!/[a-zA-Z]/.test(password)) return 'Password must contain a letter.';
  if (!/\d/.test(password)) return 'Password must contain a number.';
  return null;
}

/** Validate a phone number for Bangladesh (01X-XXXXXXXX or +8801X...). */
export function isValidPhone(input: string): boolean {
  const s = (input || '').replace(/[\s-]/g, '');
  return /^(\+?88)?01[3-9]\d{8}$/.test(s) || /^\d{3,15}$/.test(s);
}

export function sha256File(filePath: string): string {
  const h = crypto.createHash('sha256');
  h.update(fs.readFileSync(filePath));
  return h.digest('hex');
}

export function sha256Buffer(buf: Buffer): string {
  return crypto.createHash('sha256').update(buf).digest('hex');
}
