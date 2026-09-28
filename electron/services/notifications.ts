import type { Core } from '../core';
import { localDateStr, addDays } from '../../shared/date';
import type { NotificationItem } from '../../shared/types';

export function listNotifications(core: Core, unreadOnly = false, limit = 100): NotificationItem[] {
  const rows = core.db
    .prepare(
      `SELECT * FROM notifications ${unreadOnly ? 'WHERE read_at IS NULL' : ''} ORDER BY created_at DESC LIMIT ?`,
    )
    .all(limit) as Array<Record<string, unknown>>;
  return rows.map((r) => ({
    id: r.id as number,
    severity: r.severity as NotificationItem['severity'],
    category: r.category as string,
    title: r.title as string,
    body: (r.body as string) ?? '',
    link: (r.link as string) ?? null,
    createdAt: r.created_at as string,
    readAt: (r.read_at as string) ?? null,
  }));
}

export function unreadCount(core: Core): number {
  return (core.db.prepare('SELECT COUNT(*) AS c FROM notifications WHERE read_at IS NULL').get() as { c: number }).c;
}

export function markRead(core: Core, id: number): void {
  core.db.prepare('UPDATE notifications SET read_at = ? WHERE id = ? AND read_at IS NULL').run(new Date().toISOString(), id);
}

export function markAllRead(core: Core): void {
  core.db.prepare('UPDATE notifications SET read_at = ? WHERE read_at IS NULL').run(new Date().toISOString());
}

/**
 * Notification sweep — runs at startup and after relevant operations.
 * Every notification has a stable dedupe key so the same condition is never
 * re-announced within its natural window (no spam).
 */
export function sweep(core: Core): void {
  const db = core.db;
  const today = localDateStr();
  const dateTag = today.replace(/-/g, '');

  // upcoming appointments today
  if (core.settingGet<boolean>('notification.upcoming_appointments', true)) {
    const rows = db
      .prepare(`SELECT id, start_time, pat.full_name FROM appointments a JOIN patients pat ON pat.id = a.patient_id WHERE appt_date = ? AND status IN ('scheduled','confirmed') ORDER BY start_time LIMIT 20`)
      .all(today) as Array<{ id: number; start_time: string; full_name: string }>;
    for (const r of rows) {
      core.notify('info', 'appointments', `Appointment today ${r.start_time}: ${r.full_name}`, '', `/appointments`, `appt-${dateTag}-${r.id}`);
    }
  }

  // no-shows today
  const noShows = db
    .prepare(`SELECT a.id, pat.full_name FROM appointments a JOIN patients pat ON pat.id = a.patient_id WHERE appt_date = ? AND status = 'no_show' LIMIT 10`)
    .all(today) as Array<{ id: number; full_name: string }>;
  for (const r of noShows) core.notify('warning', 'appointments', `No-show today: ${r.full_name}`, 'The appointment was marked as no-show.', `/appointments`, `noshow-${dateTag}-${r.id}`);

  // low stock
  if (core.settingGet<boolean>('notification.low_stock', true)) {
    const items = db
      .prepare('SELECT id, name, stock_quantity, reorder_level FROM inventory_items WHERE active = 1 AND stock_quantity <= reorder_level LIMIT 20')
      .all() as Array<{ id: number; name: string; stock_quantity: number; reorder_level: number }>;
    for (const i of items) {
      core.notify(
        'warning',
        'inventory',
        `Low stock: ${i.name}`,
        `Current stock ${i.stock_quantity} is at or below the reorder level (${i.reorder_level}).`,
        '/inventory',
        `lowstock-${dateTag}-${i.id}`,
      );
    }
  }

  // expiring stock
  const window = core.settingGet<number>('notification.expiry_days', 30) ?? 30;
  const expiring = db
    .prepare('SELECT id, name, expiry_date FROM inventory_items WHERE active = 1 AND expiry_date IS NOT NULL AND expiry_date <= ? AND expiry_date >= ? LIMIT 20')
    .all(addDays(today, window), today) as Array<{ id: number; name: string; expiry_date: string }>;
  for (const i of expiring) {
    core.notify('warning', 'inventory', `Expiring soon: ${i.name}`, `Expiry date ${i.expiry_date}.`, '/inventory', `expiry-${dateTag}-${i.id}`);
  }

  // outstanding balances older than 30 days
  if (core.settingGet<boolean>('notification.outstanding_balance', true)) {
    const owing = db
      .prepare(
        `SELECT pat.id AS pid, pat.full_name, (i.total - i.paid) AS due FROM invoices i JOIN patients pat ON pat.id = i.patient_id
         WHERE i.status NOT IN ('void','paid','overpaid') AND i.total > i.paid AND date(i.invoice_date) < date('now', '-30 day')
         GROUP BY pat.id HAVING due > 0 ORDER BY due DESC LIMIT 10`,
      )
      .all() as Array<{ pid: number; full_name: string; due: number }>;
    for (const o of owing) {
      core.notify(
        'warning',
        'billing',
        `Outstanding balance: ${o.full_name}`,
        `Unpaid balance of ৳ ${Math.ceil(o.due / 100)} on invoices older than 30 days.`,
        `/patients/${o.pid}`,
        `due-${dateTag}-${o.pid}`,
      );
    }
  }
}
