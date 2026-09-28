import crypto from 'node:crypto';

/**
 * Offline activation.
 *
 * The activation code is NOT stored in source. Only a derived representation is:
 * SHA-256(code || SALT) stored as a raw byte array. Entering the code computes the
 * same digest and compares constant-time. The code is never logged, never sent
 * anywhere, and appears in exactly one file.
 *
 * Known limitation (documented per spec §60): a determined attacker with full
 * binary access may brute-force a fixed offline code. This design prevents
 * casual extraction and plaintext exposure, and does not claim to do more.
 */

const SALT = 'dentiva-pro-activation-v1';
const CODE_LENGTH = 16;

// SHA-256(activation_code || SALT) — derived once, never derived back.
const EXPECTED_DIGEST = [
  125, 249, 17, 90, 227, 6, 94, 45, 219, 98, 199, 8, 252, 26, 229, 158, 182, 122, 109, 150, 242,
  80, 106, 24, 48, 75, 61, 223, 185, 214, 215, 40,
];

export interface ActivationCheck {
  valid: boolean;
  reason?: string;
}

export function checkActivationCode(input: string): ActivationCheck {
  const code = (input || '').trim();
  if (code.length !== CODE_LENGTH) {
    return { valid: false, reason: 'Invalid activation code.' };
  }
  if (!/^\d+$/.test(code)) {
    return { valid: false, reason: 'Invalid activation code.' };
  }
  const digest = crypto.createHash('sha256').update(code + SALT, 'utf8').digest();
  const expected = Buffer.from(EXPECTED_DIGEST);
  if (digest.length !== expected.length || !crypto.timingSafeEqual(digest, expected)) {
    return { valid: false, reason: 'Invalid activation code.' };
  }
  return { valid: true };
}
