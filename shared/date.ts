/** Date/time helpers. Stored: UTC ISO-8601 (datetime), YYYY-MM-DD (dates, local calendar). */

const pad = (n: number): string => String(n).padStart(2, '0');

export const nowIso = (): string => new Date().toISOString();

export function localDateStr(d: Date = new Date()): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function localTimeStr(d: Date = new Date()): string {
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Local "date + time" as UTC ISO-8601. */
export function localToIso(dateStr: string, timeStr?: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  if (!y || !m || !d) throw new Error('Invalid date');
  const [hh = 0, mm = 0] = (timeStr || '00:00').split(':').map(Number);
  return new Date(y, m - 1, d, hh, mm, 0, 0).toISOString();
}

/** Extract local calendar date (YYYY-MM-DD) from a stored ISO datetime. */
export function isoToLocalDate(iso: string | Date): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function fmtDate(isoOrDate: string | null | undefined, fmt = 'DD/MM/YYYY'): string {
  if (!isoOrDate) return '';
  const d = new Date(isoOrDate.length === 10 ? isoOrDate + 'T00:00:00' : isoOrDate);
  if (Number.isNaN(d.getTime())) return isoOrDate;
  const dd = pad(d.getDate());
  const mm = pad(d.getMonth() + 1);
  const yy = String(d.getFullYear());
  return fmt
    .replace('YYYY', yy)
    .replace('MM', mm)
    .replace('DD', dd)
    .replace('DD/MM/YYYY', `${dd}/${mm}/${yy}`);
}

export function fmtTime(iso: string | null | undefined, use24h = true): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  let h = d.getHours();
  const m = pad(d.getMinutes());
  if (!use24h) {
    const ampm = h >= 12 ? 'PM' : 'AM';
    h = h % 12 || 12;
    return `${h}:${m} ${ampm}`;
  }
  return `${pad(h)}:${m}`;
}

export function fmtDateTime(iso: string | null | undefined, dateFormat = 'DD/MM/YYYY', use24h = true): string {
  if (!iso) return '';
  return `${fmtDate(iso, dateFormat)} ${fmtTime(iso, use24h)}`;
}

export function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + days);
  return localDateStr(d);
}

export function monthRange(dateStr: string): { from: string; to: string } {
  const d = new Date(dateStr + 'T00:00:00');
  const from = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-01`;
  const next = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  const to = `${next.getFullYear()}-${pad(next.getMonth() + 1)}-${pad(next.getDate())}`;
  return { from, to };
}

export function rangeLabel(from: string, to: string): 'day' | 'week' | 'month' | 'year' | 'quarter' | 'custom' {
  const a = new Date(from + 'T00:00:00');
  const b = new Date(to + 'T00:00:00');
  if (from === to) return 'day';
  const sameYear = a.getFullYear() === b.getFullYear();
  const sameMonth = sameYear && a.getMonth() === b.getMonth();
  const days = Math.round((b.getTime() - a.getTime()) / 86400000);
  if (days === 6 && a.getDay() === 1) return 'week';
  if (sameMonth && to === monthRange(from).to) return 'month';
  if (sameYear && to === `${b.getFullYear()}-12-31`) return 'year';
  if (sameYear && days === 90) return 'quarter';
  return 'custom';
}

export function daysBetween(aIso: string, bIso: string): number {
  return Math.round((new Date(bIso).getTime() - new Date(aIso).getTime()) / 86400000);
}
