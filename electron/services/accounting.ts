import type { Core, Actor } from '../core';
import { ApiError } from './errors';
import { nowIso } from '../../shared/date';
import type { AccountingTransaction, CategoryRow } from '../../shared/types';

export interface TxnInput {
  kind: 'income' | 'expense';
  categoryId: number;
  amountPaise: number;
  txnDate: string; // YYYY-MM-DD
  method?: string;
  description?: string;
  reference?: string;
  attachmentId?: number | null;
}

export function listCategories(core: Core, kind: 'income' | 'expense', from?: string, to?: string): CategoryRow[] {
  const table = kind === 'income' ? 'income_categories' : 'expense_categories';
  const range = from
    ? `AND date(t.txn_date) BETWEEN ? AND ?`
    : '';
  const rows = core.db
    .prepare(
      `SELECT c.id, c.name, c.active, COALESCE(SUM(CASE WHEN t.kind = ? ${range} THEN t.amount ELSE 0 END), 0) AS totalPaise
       FROM ${table} c
       LEFT JOIN accounting_transactions t ON t.category_id = c.id ${kind === 'expense' ? '' : `AND t.kind = 'income'`}${kind === 'expense' ? ` AND t.kind = 'expense'` : ''}
       GROUP BY c.id ORDER BY c.name`,
    )
    .all(
      kind === 'income' ? 'income' : 'expense',
      ...(from ? [from, to ?? '9999-12-31'] : []),
      kind === 'income' ? 'income' : 'expense',
    ) as CategoryRow[];
  return rows;
}

export function listTransactions(core: Core, f: { kind?: string; categoryId?: number; from?: string; to?: string; q?: string; page?: number; pageSize?: number } = {}): { items: AccountingTransaction[]; total: number } {
  const where: string[] = [];
  const params: unknown[] = [];
  if (f.kind) {
    where.push('t.kind = ?');
    params.push(f.kind);
  }
  if (f.categoryId) {
    where.push('t.category_id = ?');
    params.push(f.categoryId);
  }
  if (f.from) {
    where.push('date(t.txn_date) >= ?');
    params.push(f.from);
  }
  if (f.to) {
    where.push('date(t.txn_date) <= ?');
    params.push(f.to);
  }
  if (f.q) {
    where.push('(t.description LIKE ? OR t.reference LIKE ? OR t.category_name LIKE ?)');
    params.push(`%${f.q}%`, `%${f.q}%`, `%${f.q}%`);
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const total = (core.db.prepare(`SELECT COUNT(*) AS c FROM accounting_transactions t ${whereSql}`).get(...params) as { c: number }).c;
  const rows = core.db
    .prepare(
      `SELECT t.*, u.display_name AS createdByName
       FROM accounting_transactions t LEFT JOIN users u ON u.id = t.created_by
       ${whereSql}
       ORDER BY t.txn_date DESC, t.id DESC LIMIT ? OFFSET ?`,
    )
    .all(...params, Math.min(500, f.pageSize ?? 100), (Math.max(1, f.page ?? 1) - 1) * (f.pageSize ?? 100)) as Array<Record<string, unknown>>;
  return {
    total,
    items: rows.map((r) => ({
      id: r.id as number,
      kind: r.kind as 'income' | 'expense',
      categoryId: r.category_id as number,
      categoryName: r.category_name as string,
      amountPaise: r.amount as number,
      txnDate: r.txn_date as string,
      method: (r.method as string) ?? '',
      description: (r.description as string) ?? '',
      reference: (r.reference as string) ?? '',
      patientId: (r.patient_id as number) ?? null,
      invoiceId: (r.invoice_id as number) ?? null,
      paymentId: (r.payment_id as number) ?? null,
      attachmentId: (r.attachment_id as number) ?? null,
      createdBy: (r.createdByName as string) ?? null,
      createdAt: r.created_at as string,
    })),
  };
}

export function createTransaction(core: Core, actor: Actor, input: TxnInput): AccountingTransaction {
  if (!Number.isInteger(input.amountPaise) || input.amountPaise <= 0) throw ApiError.validation('Amount must be a positive number.');
  const table = input.kind === 'income' ? 'income_categories' : 'expense_categories';
  const cat = core.db.prepare(`SELECT id, name FROM ${table} WHERE id = ? AND active = 1`).get(input.categoryId) as { id: number; name: string } | undefined;
  if (!cat) throw ApiError.validation('The selected category does not exist or is inactive.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.txnDate)) throw ApiError.validation('Invalid date.');
  const now = nowIso();
  const id = core.tx(() => {
    const r = core.db
      .prepare(
        `INSERT INTO accounting_transactions (kind, category_id, category_name, amount, txn_date, method, description, reference, attachment_id, created_by, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(input.kind, cat.id, cat.name, input.amountPaise, input.txnDate, input.method ?? '', input.description ?? '', input.reference ?? '', input.attachmentId ?? null, actor.userId, now, now);
    return Number(r.lastInsertRowid);
  });
  core.audit('accounting.transaction_created', 'accounting', String(id), { kind: input.kind, category: cat.name, amount: input.amountPaise }, actor);
  const row = core.db.prepare('SELECT * FROM accounting_transactions WHERE id = ?').get(id) as Record<string, unknown>;
  return {
    id: row.id as number,
    kind: row.kind as 'income' | 'expense',
    categoryId: row.category_id as number,
    categoryName: row.category_name as string,
    amountPaise: row.amount as number,
    txnDate: row.txn_date as string,
    method: (row.method as string) ?? '',
    description: (row.description as string) ?? '',
    reference: (row.reference as string) ?? '',
    patientId: null,
    invoiceId: null,
    paymentId: null,
    attachmentId: (row.attachment_id as number) ?? null,
    createdBy: actor.username,
    createdAt: row.created_at as string,
  };
}

export function deleteTransaction(core: Core, actor: Actor, id: number): void {
  const row = core.db
    .prepare('SELECT * FROM accounting_transactions WHERE id = ?')
    .get(id) as Record<string, unknown> | undefined;
  if (!row) throw ApiError.notFound('transaction', id);
  if (row.payment_id) {
    throw ApiError.state(
      'This entry was generated from a payment and cannot be deleted. Void the payment instead — that will post an automatic reversal.',
    );
  }
  core.tx(() => {
    core.db.prepare('DELETE FROM accounting_transactions WHERE id = ?').run(id);
  });
  core.audit('accounting.transaction_deleted', 'accounting', String(id), { category: row.category_name, amount: row.amount }, actor);
}

export function saveCategory(core: Core, actor: Actor, kind: 'income' | 'expense', input: { id?: number; name: string; active?: boolean }): void {
  if (!input.name.trim()) throw ApiError.validation('Category name is required.');
  const table = kind === 'income' ? 'income_categories' : 'expense_categories';
  core.tx(() => {
    if (input.id) {
      const dup = core.db.prepare(`SELECT id FROM ${table} WHERE name = ? COLLATE NOCASE AND id != ?`).get(input.name.trim(), input.id) as { id: number } | undefined;
      if (dup) throw ApiError.duplicate('A category with this name already exists.');
      core.db.prepare(`UPDATE ${table} SET name = ?, active = ? WHERE id = ?`).run(input.name.trim(), (input.active ?? true) ? 1 : 0, input.id);
    } else {
      const dup = core.db.prepare(`SELECT id FROM ${table} WHERE name = ? COLLATE NOCASE`).get(input.name.trim()) as { id: number } | undefined;
      if (dup) throw ApiError.duplicate('A category with this name already exists.');
      core.db.prepare(`INSERT INTO ${table} (name, active) VALUES (?, ?)`).run(input.name.trim(), (input.active ?? true) ? 1 : 0);
    }
  });
  core.audit('accounting.category_saved', 'accounting', input.name, { kind }, actor);
}

export interface AccountingReport {
  from: string;
  to: string;
  totalIncomePaise: number;
  totalExpensePaise: number;
  netPaise: number;
  incomeByCategory: Array<{ name: string; amountPaise: number }>;
  expenseByCategory: Array<{ name: string; amountPaise: number }>;
  incomeByMethod: Array<{ method: string; amountPaise: number }>;
  outstandingPaise: number;
}

export function accountingReport(core: Core, from: string, to: string): AccountingReport {
  const sum = (sql: string): number => (core.db.prepare(sql).get(from, to) as { s: number }).s;
  const totalIncomePaise = sum("SELECT COALESCE(SUM(amount), 0) AS s FROM accounting_transactions WHERE kind = 'income' AND date(txn_date) BETWEEN ? AND ?");
  const totalExpensePaise = sum("SELECT COALESCE(SUM(amount), 0) AS s FROM accounting_transactions WHERE kind = 'expense' AND date(txn_date) BETWEEN ? AND ?");
  const incomeByCategory = core.db
    .prepare("SELECT category_name AS name, SUM(amount) AS amountPaise FROM accounting_transactions WHERE kind = 'income' AND date(txn_date) BETWEEN ? AND ? GROUP BY category_id ORDER BY amountPaise DESC")
    .all(from, to) as Array<{ name: string; amountPaise: number }>;
  const expenseByCategory = core.db
    .prepare("SELECT category_name AS name, SUM(amount) AS amountPaise FROM accounting_transactions WHERE kind = 'expense' AND date(txn_date) BETWEEN ? AND ? GROUP BY category_id ORDER BY amountPaise DESC")
    .all(from, to) as Array<{ name: string; amountPaise: number }>;
  const incomeByMethod = core.db
    .prepare("SELECT COALESCE(NULLIF(method, ''), 'cash') AS method, SUM(amount) AS amountPaise FROM accounting_transactions WHERE kind = 'income' AND date(txn_date) BETWEEN ? AND ? GROUP BY method ORDER BY amountPaise DESC")
    .all(from, to) as Array<{ method: string; amountPaise: number }>;
  const outstanding = core.db
    .prepare("SELECT COALESCE(SUM(total - paid), 0) AS s FROM invoices WHERE status NOT IN ('void', 'paid', 'overpaid') AND date(invoice_date) BETWEEN ? AND ?")
    .get(from, to) as { s: number };
  return {
    from,
    to,
    totalIncomePaise,
    totalExpensePaise,
    netPaise: totalIncomePaise - totalExpensePaise,
    incomeByCategory,
    expenseByCategory,
    incomeByMethod,
    outstandingPaise: outstanding.s,
  };
}
