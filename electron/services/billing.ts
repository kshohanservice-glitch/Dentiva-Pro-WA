import type { Core, Actor } from '../core';
import { ApiError } from './errors';
import { nowIso } from '../../shared/date';
import { PAYMENT_METHOD_LABEL } from '../../shared/constants';
import type { Invoice, InvoiceItem, Payment } from '../../shared/types';

const INV_SELECT = `
  SELECT i.*, pat.full_name AS patientName, pat.code AS patientCode, u.display_name AS createdByName
  FROM invoices i
  JOIN patients pat ON pat.id = i.patient_id
  LEFT JOIN users u ON u.id = i.created_by
`;

const rowToInvoice = (r: Record<string, unknown>): Omit<Invoice, 'items'> => ({
  id: r.id as number,
  number: r.number as string,
  patientId: r.patient_id as number,
  patientName: r.patientName as string,
  patientCode: r.patientCode as string,
  visitId: (r.visit_id as number) ?? null,
  invoiceDate: r.invoice_date as string,
  subtotalPaise: r.subtotal as number,
  discountPaise: r.discount as number,
  totalPaise: r.total as number,
  paidPaise: r.paid as number,
  duePaise: (r.total as number) - (r.paid as number),
  status: r.status as Invoice['status'],
  voidReason: (r.void_reason as string) ?? null,
  voidedAt: (r.voided_at as string) ?? null,
  notes: (r.notes as string) ?? '',
  createdBy: (r.created_by as number) ?? null,
  createdAt: r.created_at as string,
});

const itemRow = (r: Record<string, unknown>): InvoiceItem => ({
  id: r.id as number,
  description: r.description as string,
  catalogId: (r.catalog_id as number) ?? null,
  quantity: r.quantity as number,
  unitPricePaise: r.unit_price as number,
  amountPaise: r.amount as number,
  sortOrder: r.sort_order as number,
});

const payRow = (r: Record<string, unknown>): Payment => ({
  id: r.id as number,
  code: r.code as string,
  patientId: r.patient_id as number,
  patientName: (r.patientName as string) ?? '',
  invoiceId: (r.invoice_id as number) ?? null,
  invoiceNumber: (r.invoiceNumber as string) ?? null,
  amountPaise: r.amount as number,
  method: r.method as string,
  reference: (r.reference as string) ?? '',
  paymentDate: r.payment_date as string,
  notes: (r.notes as string) ?? '',
  receivedBy: (r.receivedByName as string) ?? null,
  void: !!(r.void as number),
  voidReason: (r.void_reason as string) ?? null,
  createdAt: r.created_at as string,
});

export function listInvoices(core: Core, f: { q?: string; patientId?: number; status?: string; from?: string; to?: string; page?: number; pageSize?: number } = {}): { items: Omit<Invoice, 'items'>[]; total: number } {
  const where: string[] = [];
  const params: unknown[] = [];
  if (f.q) {
    where.push('(i.number LIKE ? OR pat.full_name LIKE ? OR pat.code LIKE ?)');
    params.push(`%${f.q}%`, `%${f.q}%`, `%${f.q}%`);
  }
  if (f.patientId) {
    where.push('i.patient_id = ?');
    params.push(f.patientId);
  }
  if (f.status) {
    where.push('i.status = ?');
    params.push(f.status);
  }
  if (f.from) {
    where.push("date(i.invoice_date) >= ?");
    params.push(f.from);
  }
  if (f.to) {
    where.push("date(i.invoice_date) <= ?");
    params.push(f.to);
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const total = (core.db
    .prepare(
      `SELECT COUNT(*) AS c
       FROM invoices i
       JOIN patients pat ON pat.id = i.patient_id
       LEFT JOIN users u ON u.id = i.created_by ${whereSql}`,
    )
    .get(...params) as { c: number }).c;
  const rows = core.db
    .prepare(`${INV_SELECT} ${whereSql} ORDER BY i.invoice_date DESC, i.id DESC LIMIT ? OFFSET ?`)
    .all(...params, Math.min(500, f.pageSize ?? 100), (Math.max(1, f.page ?? 1) - 1) * (f.pageSize ?? 100)) as Array<Record<string, unknown>>;
  return { items: rows.map(rowToInvoice), total };
}

export function getInvoice(core: Core, id: number): Invoice {
  const row = core.db.prepare(`${INV_SELECT} WHERE i.id = ?`).get(id) as Record<string, unknown> | undefined;
  if (!row) throw ApiError.notFound('invoice', id);
  const items = core.db.prepare('SELECT * FROM invoice_items WHERE invoice_id = ? ORDER BY sort_order, id').all(id) as Array<Record<string, unknown>>;
  return { ...rowToInvoice(row), items: items.map(itemRow) };
}

export interface InvoiceItemInput {
  catalogId?: number | null;
  description?: string;
  quantity?: number;
  unitPricePaise?: number;
}

export interface CreateInvoiceInput {
  patientId: number;
  visitId?: number | null;
  invoiceDate?: string; // ISO
  items: InvoiceItemInput[];
  discountPaise?: number;
  notes?: string;
}

export function createInvoice(core: Core, actor: Actor, input: CreateInvoiceInput): Invoice {
  const patient = core.db.prepare('SELECT code, archived FROM patients WHERE id = ?').get(input.patientId) as { code: string; archived: number } | undefined;
  if (!patient) throw ApiError.notFound('patient', input.patientId);
  if (patient.archived) throw ApiError.state('This patient is archived.');
  if (!input.items?.length) throw ApiError.validation('An invoice needs at least one item.');

  let subtotal = 0;
  const resolved = input.items.map((it, idx) => {
    let description = (it.description ?? '').trim();
    const catalogId: number | null = it.catalogId ?? null;
    let unit = it.unitPricePaise;
    if (catalogId) {
      const cat = core.db.prepare('SELECT name, default_price FROM treatment_catalog WHERE id = ?').get(catalogId) as { name: string; default_price: number } | undefined;
      if (!cat) throw ApiError.validation('A selected treatment no longer exists in the catalog.');
      description = cat.name;
      unit = unit ?? cat.default_price;
    }
    if (!description) throw ApiError.validation(`Item ${idx + 1}: description or treatment selection is required.`);
    if (unit === undefined || !Number.isInteger(unit) || unit < 0) throw ApiError.validation(`Item ${idx + 1}: unit price is invalid.`);
    const qty = Math.max(1, Math.floor(it.quantity ?? 1));
    subtotal += unit * qty;
    return { description, catalogId, quantity: qty, unitPricePaise: unit, amount: unit * qty, sortOrder: idx };
  });

  const discount = input.discountPaise ?? 0;
  if (!Number.isInteger(discount) || discount < 0) throw ApiError.validation('Discount is invalid.');
  if (discount > subtotal) throw ApiError.validation('Discount cannot exceed the subtotal.');
  const total = subtotal - discount;
  const now = nowIso();

  const id = core.tx(() => {
    const number = core.nextInvoiceNumber();
    const r = core.db
      .prepare(
        `INSERT INTO invoices (number, patient_id, visit_id, invoice_date, subtotal, discount, total, paid, status, notes, created_by, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 0, 'unpaid', ?, ?, ?)`,
      )
      .run(number, input.patientId, input.visitId ?? null, input.invoiceDate || now, subtotal, discount, total, input.notes ?? '', actor.userId, now);
    const invId = Number(r.lastInsertRowid);
    const ins = core.db.prepare(
      'INSERT INTO invoice_items (invoice_id, description, catalog_id, quantity, unit_price, amount, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)',
    );
    for (const it of resolved) ins.run(invId, it.description, it.catalogId, it.quantity, it.unitPricePaise, it.amount, it.sortOrder);
    return invId;
  });
  core.audit('invoice.created', 'invoice', String(id), { patient: patient.code, total }, actor);
  return getInvoice(core, id);
}

function recalcInvoice(core: Core, invoiceId: number): void {
  const row = core.db
    .prepare('SELECT COALESCE(SUM(amount), 0) AS paid FROM payments WHERE invoice_id = ? AND void = 0')
    .get(invoiceId) as { paid: number };
  const inv = core.db.prepare('SELECT total FROM invoices WHERE id = ?').get(invoiceId) as { total: number };
  const paid = row.paid;
  let status: Invoice['status'];
  if (paid <= 0) status = 'unpaid';
  else if (paid < inv.total) status = 'partial';
  else if (paid === inv.total) status = 'paid';
  else status = 'overpaid';
  core.db.prepare('UPDATE invoices SET paid = ?, status = ? WHERE id = ?').run(paid, status, invoiceId);
}

export function voidInvoice(core: Core, actor: Actor, id: number, reason: string): void {
  if (!reason.trim()) throw ApiError.validation('A void reason is required.');
  const inv = getInvoice(core, id);
  if (inv.status === 'void') throw ApiError.state('Invoice is already void.');
  const pays = core.db.prepare('SELECT COUNT(*) AS c FROM payments WHERE invoice_id = ? AND void = 0').get(id) as { c: number };
  if (pays.c > 0) {
    throw ApiError.state('This invoice has payments recorded. Void each payment first, then void the invoice.');
  }
  core.tx(() => {
    core.db.prepare("UPDATE invoices SET status = 'void', void_reason = ?, voided_at = ? WHERE id = ?").run(reason, nowIso(), id);
  });
  core.audit('invoice.voided', 'invoice', inv.number, { reason }, actor);
  core.notify('warning', 'billing', `Invoice voided: ${inv.number}`, reason, `/invoices`);
}

// ================================================================ PAYMENTS

export interface PaymentInput {
  patientId: number;
  invoiceId?: number | null;
  amountPaise: number;
  method: string;
  reference?: string;
  paymentDate?: string; // ISO
  notes?: string;
}

export function patientCredit(core: Core, patientId: number): number {
  const row = core.db
    .prepare(
      `SELECT COALESCE(SUM(CASE WHEN invoice_id IS NULL THEN amount ELSE 0 END), 0)
         - COALESCE(SUM(CASE WHEN method = 'credit' AND invoice_id IS NOT NULL THEN amount ELSE 0 END), 0) AS credit
       FROM payments WHERE patient_id = ? AND void = 0`,
    )
    .get(patientId) as { credit: number };
  return Math.max(0, row.credit);
}

export function recordPayment(core: Core, actor: Actor, input: PaymentInput): { payments: Payment[]; creditApplied: number; invoice?: Invoice; incomeEntryId: number | null } {
  const patient = core.db.prepare('SELECT code FROM patients WHERE id = ?').get(input.patientId) as { code: string } | undefined;
  if (!patient) throw ApiError.notFound('patient', input.patientId);
  if (!Number.isInteger(input.amountPaise) || input.amountPaise <= 0) throw ApiError.validation('Payment amount must be a positive amount.');
  if (!['cash', 'bank', 'card', 'bkash', 'nagad', 'rocket', 'upay', 'other'].includes(input.method)) {
    throw ApiError.validation('Invalid payment method.');
  }
  const now = nowIso();
  const date = input.paymentDate || now;

  let invoice: Invoice | undefined;
  let remaining = input.amountPaise;
  let creditApplied = 0;
  const created: Array<{ code: string; invoiceId: number | null; method: string; reference: string; notes: string; amount: number }> = [];

  if (input.invoiceId) {
    const invRow = core.db.prepare('SELECT * FROM invoices WHERE id = ?').get(input.invoiceId) as Record<string, unknown> | undefined;
    if (!invRow) throw ApiError.notFound('invoice', input.invoiceId);
    if (invRow.status === 'void') throw ApiError.state('A voided invoice cannot receive payments.');
    if (invRow.patient_id !== input.patientId) throw ApiError.state('This invoice belongs to a different patient.');
    const balance = (invRow.total as number) - (invRow.paid as number);
    if (input.amountPaise > balance) {
      throw ApiError.validation(`Payment (৳ ${Math.ceil(input.amountPaise / 100)}) exceeds the outstanding balance (৳ ${Math.ceil(balance / 100)}).`);
    }
    // auto-apply patient credit first
    const credit = patientCredit(core, input.patientId);
    if (credit > 0) {
      creditApplied = Math.min(credit, input.amountPaise);
      if (creditApplied > 0) {
        created.push({ code: '', invoiceId: input.invoiceId, method: 'credit', reference: 'Patient credit applied', notes: 'Applied advance/credit', amount: creditApplied });
        remaining -= creditApplied;
      }
    }
    if (remaining > 0) created.push({ code: '', invoiceId: input.invoiceId, method: input.method, reference: input.reference ?? '', notes: input.notes ?? '', amount: remaining });
  } else {
    created.push({ code: '', invoiceId: null, method: input.method, reference: input.reference ?? '', notes: (input.notes ?? '') + (input.notes ? ' — advance payment' : 'advance payment'), amount: input.amountPaise });
  }

  const incomeEntryId = core.tx(() => {
    let entryId: number | null = null;
    const payCodeBase = (core.db.prepare('SELECT COALESCE(MAX(id), 0) AS m FROM payments').get() as { m: number }).m;
    let i = 0;
    for (const c of created) {
      i++;
      const code = `PAY-${String(payCodeBase + i).padStart(6, '0')}`;
      c.code = code;
      core.db
        .prepare(
          `INSERT INTO payments (code, patient_id, invoice_id, amount, method, reference, payment_date, notes, received_by, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(code, input.patientId, c.invoiceId, c.amount, c.method, c.reference, date, c.notes, actor.userId, now);
      const payId = Number((core.db.prepare('SELECT last_insert_rowid() AS id').get() as { id: number }).id);
      // Credit applications move an existing advance onto an invoice — no NEW income (already recorded when the advance was taken).
      if (c.method !== 'credit') {
        const cat = core.db.prepare('SELECT id, name FROM income_categories WHERE active = 1 ORDER BY id LIMIT 1').get() as { id: number; name: string } | undefined;
        if (cat) {
          const invRef = c.invoiceId ? (core.db.prepare('SELECT number FROM invoices WHERE id = ?').get(c.invoiceId) as { number: string }).number : 'advance payment';
          const r = core.db
            .prepare(
              `INSERT INTO accounting_transactions (kind, category_id, category_name, amount, txn_date, method, description, reference, patient_id, invoice_id, payment_id, created_by, created_at, updated_at)
               VALUES ('income', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            )
            .run(cat.id, cat.name, c.amount, date, c.method, `Payment ${code} — ${invRef}`, '', input.patientId, c.invoiceId, payId, actor.userId, now, now);
          entryId = Number(r.lastInsertRowid);
        }
      }
    }
    for (const c of created) if (c.invoiceId) recalcInvoice(core, c.invoiceId);
    return entryId;
  });

  const payments = created.map((c) => {
    const row = core.db
      .prepare(
        `SELECT p.*, pat.full_name AS patientName, i.number AS invoiceNumber, u.display_name AS receivedByName
         FROM payments p JOIN patients pat ON pat.id = p.patient_id
         LEFT JOIN invoices i ON i.id = p.invoice_id LEFT JOIN users u ON u.id = p.received_by
         WHERE p.code = ?`,
      )
      .get(c.code) as Record<string, unknown>;
    return payRow(row);
  });

  core.audit('payment.recorded', 'payment', String(input.patientId), { amount: input.amountPaise, method: input.method, invoice: input.invoiceId ?? null, creditApplied }, actor);
  if (input.invoiceId) invoice = getInvoice(core, input.invoiceId);
  core.notify('success', 'billing', 'Payment recorded', `${PAYMENT_METHOD_LABEL[input.method] ?? input.method} — ${patient.code}`, `/payments`);
  return { payments, creditApplied, invoice, incomeEntryId };
}

export function voidPayment(core: Core, actor: Actor, id: number, reason: string): void {
  if (!reason.trim()) throw ApiError.validation('A reason is required to void a payment.');
  const row = core.db
    .prepare('SELECT * FROM payments WHERE id = ?')
    .get(id) as Record<string, unknown> | undefined;
  if (!row) throw ApiError.notFound('payment', id);
  if (row.void) throw ApiError.state('This payment is already void.');
  core.tx(() => {
    core.db.prepare('UPDATE payments SET void = 1, void_reason = ?, voided_at = ? WHERE id = ?').run(reason, nowIso(), id);
    if (row.method !== 'credit') {
      const cat = core.db
        .prepare('SELECT id, name FROM income_categories WHERE active = 1 ORDER BY id LIMIT 1')
        .get() as { id: number; name: string } | undefined;
      if (cat) {
        const now = nowIso();
        core.db
          .prepare(
            `INSERT INTO accounting_transactions (kind, category_id, category_name, amount, txn_date, method, description, reference, patient_id, invoice_id, payment_id, created_by, created_at, updated_at)
             VALUES ('income', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .run(cat.id, cat.name, -(row.amount as number), now, row.method as string, `Reversal of voided payment ${row.code}`, String(row.code), row.patient_id as number, (row.invoice_id as number) ?? null, id, actor.userId, now, now);
      }
    }
    if (row.invoice_id) recalcInvoice(core, row.invoice_id as number);
  });
  core.audit('payment.voided', 'payment', String(row.code), { reason, amount: row.amount }, actor);
}

export function listPayments(core: Core, f: { q?: string; patientId?: number; method?: string; from?: string; to?: string; page?: number; pageSize?: number } = {}): { items: Payment[]; total: number } {
  const where: string[] = [];
  const params: unknown[] = [];
  if (f.q) {
    where.push('(p.code LIKE ? OR pat.full_name LIKE ? OR p.reference LIKE ?)');
    params.push(`%${f.q}%`, `%${f.q}%`, `%${f.q}%`);
  }
  if (f.patientId) {
    where.push('p.patient_id = ?');
    params.push(f.patientId);
  }
  if (f.method) {
    where.push('p.method = ?');
    params.push(f.method);
  }
  if (f.from) {
    where.push("date(p.payment_date) >= ?");
    params.push(f.from);
  }
  if (f.to) {
    where.push("date(p.payment_date) <= ?");
    params.push(f.to);
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const total = (core.db.prepare(`SELECT COUNT(*) AS c FROM payments p JOIN patients pat ON pat.id = p.patient_id ${whereSql}`).get(...params) as { c: number }).c;
  const rows = core.db
    .prepare(
      `SELECT p.*, pat.full_name AS patientName, i.number AS invoiceNumber, u.display_name AS receivedByName
       FROM payments p
       JOIN patients pat ON pat.id = p.patient_id
       LEFT JOIN invoices i ON i.id = p.invoice_id
       LEFT JOIN users u ON u.id = p.received_by
       ${whereSql}
       ORDER BY p.payment_date DESC, p.id DESC LIMIT ? OFFSET ?`,
    )
    .all(...params, Math.min(500, f.pageSize ?? 100), (Math.max(1, f.page ?? 1) - 1) * (f.pageSize ?? 100)) as Array<Record<string, unknown>>;
  return { items: rows.map(payRow), total };
}

/** Outstanding receivables: patients with balance > 0 (excludes void/paid/overpaid). */
export function outstandingReceivables(core: Core): Array<{ patientId: number; patientName: string; patientCode: string; invoiceNumber: string; duePaise: number; invoiceDate: string }> {
  return core.db
    .prepare(
      `SELECT pat.id AS patientId, pat.full_name AS patientName, pat.code AS patientCode,
              i.number AS invoiceNumber, (i.total - i.paid) AS duePaise, i.invoice_date AS invoiceDate
       FROM invoices i JOIN patients pat ON pat.id = i.patient_id
       WHERE i.status NOT IN ('void', 'paid', 'overpaid') AND i.total > i.paid
       ORDER BY i.invoice_date`,
    )
    .all() as Array<{ patientId: number; patientName: string; patientCode: string; invoiceNumber: string; duePaise: number; invoiceDate: string }>;
}
