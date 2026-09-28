/**
 * Money handling. All money is stored as integer PAISA (1 BDT = 100 paisa).
 * No floating point is ever used in money arithmetic.
 */

export type Paise = number;

/** Parse user input (e.g. "1,250.50" or "৳ 300") into integer paisa. Throws on invalid. */
export function toPaise(input: string | number): Paise {
  if (typeof input === 'number') {
    if (!Number.isFinite(input) || input < 0) throw new Error('Invalid amount');
    return Math.round(input * 100);
  }
  const cleaned = String(input).replace(/[৳,,\s]/g, '').trim();
  if (cleaned === '') return 0;
  if (!/^\d{1,12}(\.\d{1,2})?$/.test(cleaned)) throw new Error('Invalid amount format');
  const [whole, frac = ''] = cleaned.split('.');
  const paise = parseInt(whole, 10) * 100 + parseInt((frac + '00').slice(0, 2), 10);
  if (!Number.isSafeInteger(paise) || paise < 0) throw new Error('Invalid amount');
  return paise;
}

/** Format paisa for display: ৳ 1,250  /  ৳ 1,250.50 */
export function fmtMoney(paise: number, symbol = '৳'): string {
  const n = Math.round(paise);
  const negative = n < 0;
  const abs = Math.abs(n);
  const taka = Math.floor(abs / 100);
  const rem = abs % 100;
  const whole = taka.toLocaleString('en-US');
  const s = rem > 0 ? `${whole}.${String(rem).padStart(2, '0')}` : whole;
  return `${negative ? '-' : ''}${symbol} ${s}`;
}

export const add = (...vals: Paise[]): Paise => vals.reduce((a, b) => a + b, 0);
export const sub = (a: Paise, b: Paise): Paise => a - b;
export const mul = (a: Paise, q: number): Paise => Math.round(a * q);
