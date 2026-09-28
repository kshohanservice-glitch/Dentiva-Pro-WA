import type { Core } from '../core';
import { localDateStr, isoToLocalDate } from '../../shared/date';

/** All dashboard numbers come from real queries — no decorative widgets. */

export function dashboardData(core: Core) {
  const db = core.db;
  const today = localDateStr();
  const one = (sql: string, ...p: unknown[]): number => (db.prepare(sql).get(...p) as { s: number }).s;

  const todayAppointments = one(
    `SELECT COUNT(*) AS s FROM appointments WHERE appt_date = ? AND status NOT IN ('cancelled','no_show')`,
    today,
  );
  const appointmentsByStatus = (db.prepare(`SELECT status, COUNT(*) AS c FROM appointments WHERE appt_date = ? GROUP BY status`).all(today) as Array<{ status: string; c: number }>).map((r) => ({ status: r.status, count: r.c }));
  const completedToday = appointmentsByStatus.find((s) => s.status === 'completed')?.count ?? 0;
  const noShowsToday = appointmentsByStatus.find((s) => s.status === 'no_show')?.count ?? 0;
  const waitingQueue = one(`SELECT COUNT(*) AS s FROM queue_entries WHERE date(arrived_at) = ? AND status = 'waiting'`, today);
  const inTreatmentQueue = one(`SELECT COUNT(*) AS s FROM queue_entries WHERE date(arrived_at) = ? AND status IN ('called','in_treatment')`, today);

  const revenueToday = one(
    `SELECT COALESCE(SUM(amount), 0) AS s FROM payments WHERE date(payment_date) = ? AND void = 0`,
    today,
  );
  const outstandingDues = one(
    `SELECT COALESCE(SUM(total - paid), 0) AS s FROM invoices WHERE status NOT IN ('void','paid','overpaid') AND total > paid`,
  );

  const recentPayments = (
    db.prepare(
      `SELECT p.code, pat.full_name AS patientName, p.amount AS amountPaise, p.method, p.payment_date AS paymentDate
       FROM payments p JOIN patients pat ON pat.id = p.patient_id
       WHERE p.void = 0 ORDER BY p.payment_date DESC, p.id DESC LIMIT 6`,
    )
      .all() as Array<Record<string, unknown>>
  ).map((r) => ({ code: r.code as string, patientName: r.patientName as string, amountPaise: r.amountPaise as number, method: r.method as string, paymentDate: r.paymentDate as string }));

  const lowStock = one('SELECT COUNT(*) AS s FROM inventory_items WHERE active = 1 AND stock_quantity <= reorder_level');
  const expiringSoon = one(`SELECT COUNT(*) AS s FROM inventory_items WHERE active = 1 AND expiry_date IS NOT NULL AND expiry_date <= date('now', '+30 day') AND expiry_date >= date('now')`);

  const recentPatients = (
    db.prepare(`SELECT id, code, full_name AS fullName, phone, created_at AS createdAt FROM patients WHERE archived = 0 ORDER BY created_at DESC LIMIT 6`)
      .all() as Array<Record<string, unknown>>
  ).map((r) => ({ id: r.id as number, code: r.code as string, fullName: r.fullName as string, phone: (r.phone as string) ?? '', createdAt: r.createdAt as string }));

  const upcoming = (
    db.prepare(
      `SELECT a.id, a.code, a.start_time AS startTime, a.status, pat.full_name AS patientName, d.name AS dentistName
       FROM appointments a JOIN patients pat ON pat.id = a.patient_id LEFT JOIN dentists d ON d.id = a.dentist_id
       WHERE a.appt_date = ? AND a.status IN ('scheduled','confirmed','arrived','waiting','rescheduled')
       ORDER BY a.start_time LIMIT 8`,
    )
      .all(today) as Array<Record<string, unknown>>
  ).map((r) => ({ id: r.id as number, code: r.code as string, startTime: r.startTime as string, status: r.status as string, patientName: r.patientName as string, dentistName: (r.dentistName as string) ?? null }));

  // revenue trend — last 14 days
  const trend: Array<{ date: string; incomePaise: number; expensePaise: number }> = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const ds = isoToLocalDate(d);
    trend.push({
      date: ds,
      incomePaise: one(`SELECT COALESCE(SUM(amount),0) AS s FROM accounting_transactions WHERE kind = 'income' AND date(txn_date) = ?`, ds),
      expensePaise: one(`SELECT COALESCE(SUM(amount),0) AS s FROM accounting_transactions WHERE kind = 'expense' AND date(txn_date) = ?`, ds),
    });
  }

  // payment method breakdown — last 30 days
  const methodBreakdown = (
    db.prepare(
      `SELECT method, COALESCE(SUM(amount), 0) AS amountPaise, COUNT(*) AS count
       FROM payments WHERE void = 0 AND date(payment_date) >= date('now', '-29 day')
       GROUP BY method ORDER BY amountPaise DESC`,
    )
      .all() as Array<{ method: string; amountPaise: number; count: number }>
  );

  // treatment stats — last 30 days by catalog name (snapshot)
  const treatmentStats = (
    db.prepare(
      `SELECT vt.name, SUM(vt.quantity) AS count, SUM(vt.price * vt.quantity) AS totalPaise
       FROM visit_treatments vt WHERE date(vt.created_at) >= date('now', '-29 day')
       GROUP BY vt.name ORDER BY count DESC LIMIT 8`,
    )
      .all() as Array<{ name: string; count: number; totalPaise: number }>
  );

  // visits today
  const visitsToday = one(`SELECT COUNT(*) AS s FROM visits WHERE date(visit_date) = ?`, today);

  return {
    today,
    stats: {
      todayAppointments,
      completedToday,
      noShowsToday,
      waitingQueue,
      inTreatmentQueue,
      revenueTodayPaise: revenueToday,
      outstandingDuesPaise: outstandingDues,
      visitsToday,
      lowStock,
      expiringSoon,
    },
    appointmentsByStatus,
    recentPayments,
    recentPatients,
    upcoming,
    revenueTrend: trend,
    methodBreakdown,
    treatmentStats,
  };
}
