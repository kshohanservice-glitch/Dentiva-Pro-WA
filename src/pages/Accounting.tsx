import { useCallback, useEffect, useState } from 'react';
import { Plus, Landmark, Trash2, Printer, Pencil } from 'lucide-react';
import { api, hasPerm } from '../lib/api';
import { useApp } from '../context/AppContext';
import { PageHeader } from '../components/Shell';
import { DocPreview, DocSpec } from '../components/DocPreview';
import {
  Button, Card, Table, Column, Pagination, Badge, Input, Select, Field, Modal, useToast, toastError, Loading, EmptyState,
} from '../components/ui';
import type { AccountingTransaction, CategoryRow } from '@shared/types';
import { fmtMoney, toPaise } from '@shared/money';
import { fmtDate, monthRange, localDateStr } from '@shared/date';

const PAGE_SIZE = 25;

interface Report {
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

export function Accounting() {
  const { session, ui } = useApp();
  const can = (perm: string) => hasPerm(session?.perms, perm);
  const [kind, setKind] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [from, setFrom] = useState(() => monthRange(localDateStr()).from);
  const [to, setTo] = useState(() => localDateStr());
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<{ items: AccountingTransaction[]; total: number } | null>(null);
  const [categories, setCategories] = useState<{ income: CategoryRow[]; expense: CategoryRow[] } | null>(null);
  const [report, setReport] = useState<Report | null>(null);
  const [showTxn, setShowTxn] = useState(false);
  const [showCat, setShowCat] = useState<'income' | 'expense' | null>(null);
  const [deleting, setDeleting] = useState<AccountingTransaction | null>(null);
  const [preview, setPreview] = useState<DocSpec | null>(null);
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  const canView = can('accounting.view');
  const canCreate = can('accounting.create');
  const canManage = can('accounting.manage');
  const canReport = can('financial.reports.view');

  const load = useCallback(() => {
    if (!canView) return;
    api<{ items: AccountingTransaction[]; total: number }>(
      'accounting.transactions',
      { kind: kind || undefined, categoryId: categoryId ? Number(categoryId) : undefined, from: from || undefined, to: to || undefined, q: q || undefined, page, pageSize: PAGE_SIZE },
    )
      .then(setData)
      .catch((e) => toast('error', String((e as Error)?.message ?? e)));
    api<{ income: CategoryRow[]; expense: CategoryRow[] }>('accounting.categories', { from: from || undefined, to: to || undefined })
      .then(setCategories)
      .catch(() => undefined);
    if (canReport) {
      api<Report>('accounting.report', { from, to }).then(setReport).catch(() => undefined);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, categoryId, from, to, q, page, canView, canReport]);

  useEffect(load, [load]);

  const allCats = categories ? [...categories.income, ...categories.expense] : [];

  const columns: Column<AccountingTransaction>[] = [
    { key: 'date', label: 'Date', render: (r) => fmtDate(r.txnDate, ui.dateFormat), width: 105 },
    { key: 'kind', label: 'Type', width: 95, render: (r) => (r.kind === 'income' ? <Badge tone="success">Income</Badge> : <Badge tone="danger">Expense</Badge>) },
    { key: 'category', label: 'Category', render: (r) => r.categoryName, width: 160 },
    { key: 'desc', label: 'Description', render: (r) => (
      <div style={{ maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.description}>{r.description || '—'}</div>
    ) },
    { key: 'ref', label: 'Reference', render: (r) => (
      <div style={{ maxWidth: 130, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--c-text-2)' }} title={r.reference}>{r.reference || '—'}</div>
    ) },
    { key: 'method', label: 'Method', render: (r) => (r.method ? <span style={{ textTransform: 'capitalize' }}>{r.method}</span> : '—'), width: 90 },
    { key: 'amount', label: 'Amount', align: 'right', width: 120, render: (r) => (
      <strong style={{ color: r.kind === 'income' ? 'var(--c-success)' : 'var(--c-danger)' }}>{r.kind === 'income' ? '+' : '−'}{fmtMoney(r.amountPaise, ui.currencySymbol)}</strong>
    ) },
    { key: 'by', label: 'By', render: (r) => r.createdBy ?? '—', width: 120 },
    ...(canManage
      ? [{
          key: 'act', label: '', align: 'right' as const, width: 70, render: (r: AccountingTransaction) =>
            !r.paymentId ? (
              <Button size="sm" variant="ghost" icon={<Trash2 size={13} />} style={{ color: 'var(--c-danger)' }} onClick={() => setDeleting(r)}>Delete</Button>
            ) : (
              <span title="Payment-derived entries cannot be deleted — void the payment instead" style={{ color: 'var(--c-text-3)', fontSize: 'var(--fs-caption)' }}>locked</span>
            ),
        }]
      : []),
  ];

  return (
    <div style={{ padding: 22, maxWidth: 1280, margin: '0 auto' }}>
      <PageHeader
        title="Accounting"
        subtitle="Income and expense ledger with period reporting"
        actions={
          <>
            {canReport && (
              <>
                <Button variant="secondary" icon={<Printer size={14} />} onClick={() => setPreview({ channel: 'reports', type: 'accounting', filters: { from, to } })}>
                  Report (print / PDF / CSV)
                </Button>
              </>
            )}
            {canCreate && <Button icon={<Plus size={15} />} onClick={() => setShowTxn(true)}>New entry</Button>}
            {canManage && (
              <Button variant="secondary" icon={<Pencil size={14} />} onClick={() => setShowCat('income')}>
                Manage categories
              </Button>
            )}
          </>
        }
      />

      {report && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14, marginBottom: 18 }}>
          <Card style={{ padding: 14 }}>
            <div style={{ fontSize: 'var(--fs-caption)', color: 'var(--c-text-3)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Income ({fmtDate(from, ui.dateFormat)} – {fmtDate(to, ui.dateFormat)})</div>
            <div style={{ fontSize: 'var(--fs-h2)', fontWeight: 750, color: 'var(--c-success)', marginTop: 4 }}>{fmtMoney(report.totalIncomePaise, ui.currencySymbol)}</div>
          </Card>
          <Card style={{ padding: 14 }}>
            <div style={{ fontSize: 'var(--fs-caption)', color: 'var(--c-text-3)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Expenses</div>
            <div style={{ fontSize: 'var(--fs-h2)', fontWeight: 750, color: 'var(--c-danger)', marginTop: 4 }}>{fmtMoney(report.totalExpensePaise, ui.currencySymbol)}</div>
          </Card>
          <Card style={{ padding: 14 }}>
            <div style={{ fontSize: 'var(--fs-caption)', color: 'var(--c-text-3)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Net</div>
            <div style={{ fontSize: 'var(--fs-h2)', fontWeight: 750, color: report.netPaise >= 0 ? 'var(--c-success)' : 'var(--c-danger)', marginTop: 4 }}>
              {report.netPaise >= 0 ? '+' : ''}{fmtMoney(report.netPaise, ui.currencySymbol)}
            </div>
          </Card>
          <Card style={{ padding: 14 }}>
            <div style={{ fontSize: 'var(--fs-caption)', color: 'var(--c-text-3)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Outstanding in period</div>
            <div style={{ fontSize: 'var(--fs-h2)', fontWeight: 750, color: report.outstandingPaise > 0 ? 'var(--c-warning)' : 'var(--c-text)', marginTop: 4 }}>{fmtMoney(report.outstandingPaise, ui.currencySymbol)}</div>
          </Card>
        </div>
      )}

      <Card style={{ padding: 14, marginBottom: 14 }}>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <Select value={kind} onChange={(e) => { setKind(e.target.value); setCategoryId(''); setPage(1); }} style={{ width: 120 }}>
            <option value="">All types</option>
            <option value="income">Income</option>
            <option value="expense">Expense</option>
          </Select>
          <Select value={categoryId} onChange={(e) => { setCategoryId(e.target.value); setPage(1); }} style={{ width: 190 }}>
            <option value="">All categories</option>
            {allCats.map((c) => (
              <option key={`c${c.id}`} value={c.id}>{c.name}</option>
            ))}
          </Select>
          <Input type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPage(1); }} style={{ width: 150 }} />
          <Input type="date" value={to} onChange={(e) => { setTo(e.target.value); setPage(1); }} style={{ width: 150 }} />
          <Input value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} placeholder="Search description / reference…" style={{ flex: '1 1 180px', maxWidth: 260 }} />
          <div style={{ flex: 1 }} />
          <span style={{ fontSize: 'var(--fs-caption)', color: 'var(--c-text-3)' }}>{data ? `${data.total} entries` : ''}</span>
        </div>
      </Card>

      <Card style={{ padding: 0 }}>
        {!data ? (
          <div style={{ padding: 30 }}><Loading label="Loading ledger…" /></div>
        ) : (
          <>
            <Table
              columns={columns}
              rows={data.items}
              empty={<EmptyState icon={<Landmark size={22} />} title="No ledger entries" hint="Payment-derived income appears here automatically; add expenses and other income manually." />}
            />
            <div style={{ padding: '10px 14px' }}>
              <Pagination page={page} pageSize={PAGE_SIZE} total={data.total} onPage={setPage} />
            </div>
          </>
        )}
      </Card>

      {report && report.incomeByCategory.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginTop: 14 }}>
          <Card>
            <strong style={{ fontSize: 'var(--fs-body)' }}>Income by category</strong>
            {report.incomeByCategory.map((c) => (
              <div key={c.name} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderBottom: '1px solid var(--c-border)', fontSize: 'var(--fs-body)' }}>
                <span>{c.name}</span>
                <strong style={{ color: 'var(--c-success)' }}>{fmtMoney(c.amountPaise, ui.currencySymbol)}</strong>
              </div>
            ))}
          </Card>
          <Card>
            <strong style={{ fontSize: 'var(--fs-body)' }}>Expenses by category</strong>
            {report.expenseByCategory.length === 0 && <div style={{ color: 'var(--c-text-3)', fontSize: 'var(--fs-small)', padding: '8px 0' }}>No expenses in this period.</div>}
            {report.expenseByCategory.map((c) => (
              <div key={c.name} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderBottom: '1px solid var(--c-border)', fontSize: 'var(--fs-body)' }}>
                <span>{c.name}</span>
                <strong style={{ color: 'var(--c-danger)' }}>{fmtMoney(c.amountPaise, ui.currencySymbol)}</strong>
              </div>
            ))}
          </Card>
        </div>
      )}

      {showTxn && <TxnForm categories={categories?.income ?? []} onClose={() => setShowTxn(false)} onSaved={() => { setShowTxn(false); load(); }} />}
      {showCat && <CategoryForm kind={showCat} categories={showCat === 'income' ? categories?.income ?? [] : categories?.expense ?? []} onClose={() => setShowCat(null)} onSaved={() => { setShowCat(null); load(); }} />}
      {preview && <DocPreview spec={preview} onClose={() => setPreview(null)} />}

      {deleting && (
        <Modal
          title="Delete ledger entry"
          danger
          onClose={() => setDeleting(null)}
          width={460}
          footer={
            <>
              <Button variant="secondary" onClick={() => setDeleting(null)}>Cancel</Button>
              <Button
                variant="danger"
                loading={busy}
                onClick={async () => {
                  setBusy(true);
                  try {
                    await api('accounting.delete', { id: deleting.id });
                    toast('success', 'Entry deleted.');
                    setDeleting(null);
                    load();
                  } catch (e) {
                    toastError(toast, e);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Delete entry
              </Button>
            </>
          }
        >
          <p style={{ fontSize: 'var(--fs-body)', color: 'var(--c-text-2)' }}>
            Delete this {deleting.kind} entry of {fmtMoney(deleting.amountPaise, ui.currencySymbol)} ({deleting.categoryName})? Only manually-added entries can be deleted — payment-derived entries must be voided via their payment.
          </p>
        </Modal>
      )}
    </div>
  );
}

function TxnForm({ categories, onClose, onSaved }: { categories: CategoryRow[]; onClose: () => void; onSaved: () => void }) {
  const { ui } = useApp();
  const [kind, setKind] = useState<'income' | 'expense'>('expense');
  const [allIncome, setAllIncome] = useState<CategoryRow[]>(categories);
  const [allExpense, setAllExpense] = useState<CategoryRow[]>([]);
  const [categoryId, setCategoryId] = useState('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(localDateStr());
  const [method, setMethod] = useState('cash');
  const [description, setDescription] = useState('');
  const [reference, setReference] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (kind === 'expense') {
      api<{ income: CategoryRow[]; expense: CategoryRow[] }>('accounting.categories').then((r) => {
        setAllExpense(r.expense);
        if (!categoryId && r.expense.length) setCategoryId(String(r.expense[0].id));
      }).catch(() => undefined);
    } else {
      api<{ income: CategoryRow[]; expense: CategoryRow[] }>('accounting.categories').then((r) => {
        setAllIncome(r.income);
        if (!categoryId && r.income.length) setCategoryId(String(r.income[0].id));
      }).catch(() => undefined);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind]);

  const cats = kind === 'income' ? allIncome : allExpense;
  const amt = toPaise(amount);

  const save = async () => {
    setErr('');
    if (!categoryId) {
      setErr('Select a category.');
      return;
    }
    if (!Number.isFinite(amt) || amt <= 0) {
      setErr('Enter a valid amount.');
      return;
    }
    if (!description.trim()) {
      setErr('A description is required.');
      return;
    }
    setBusy(true);
    try {
      await api('accounting.create', {
        kind,
        categoryId: Number(categoryId),
        amountPaise: amt,
        txnDate: date,
        method,
        description: description.trim(),
        reference,
      });
      onSaved();
    } catch (e) {
      setErr(String((e as Error)?.message ?? e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title="New ledger entry"
      subtitle="Manual income or expense. Payment-derived income is created automatically — do not re-enter it here."
      onClose={onClose}
      width={540}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={save} loading={busy}>Add entry</Button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          {(['expense', 'income'] as const).map((k) => (
            <button
              key={k}
              onClick={() => { setKind(k); setCategoryId(''); }}
              style={{
                padding: '10px 12px',
                borderRadius: 'var(--r-md)',
                border: `1px solid ${kind === k ? 'var(--c-primary)' : 'var(--c-border)'}`,
                background: kind === k ? 'var(--c-primary-subtle)' : 'var(--c-surface)',
                color: kind === k ? 'var(--c-primary)' : 'var(--c-text-2)',
                fontWeight: 700,
                fontSize: 'var(--fs-small)',
                textTransform: 'capitalize',
              }}
            >
              {k}
            </button>
          ))}
        </div>
        <Field label="Category" required>
          <Select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
            <option value="">Select…</option>
            {cats.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </Select>
        </Field>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <Field label={`Amount (${ui.currencySymbol})`} required>
            <Input value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" inputMode="decimal" autoFocus />
          </Field>
          <Field label="Date">
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} max={localDateStr()} />
          </Field>
        </div>
        <Field label="Description" required>
          <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder={kind === 'expense' ? 'e.g. Lab work — 4 impressions' : 'e.g. Lab fees received (non-dental)'} />
        </Field>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <Field label="Method">
            <Select value={method} onChange={(e) => setMethod(e.target.value)}>
              {['cash', 'bank', 'card', 'bkash', 'nagad', 'rocket', 'upay', 'other'].map((m) => (
                <option key={m} value={m}>{m === 'bkash' ? 'bKash' : m === 'nagad' ? 'Nagad' : m[0].toUpperCase() + m.slice(1)}</option>
              ))}
            </Select>
          </Field>
          <Field label="Reference">
            <Input value={reference} onChange={(e) => setReference(e.target.value)} />
          </Field>
        </div>
        {err && <div style={{ color: 'var(--c-danger)', fontSize: 'var(--fs-small)', fontWeight: 500 }}>{err}</div>}
      </div>
    </Modal>
  );
}

function CategoryForm({ kind, categories, onClose, onSaved }: { kind: 'income' | 'expense'; categories: CategoryRow[]; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState('');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  const save = async () => {
    setErr('');
    setBusy(true);
    try {
      await api('accounting.saveCategory', { kind, input: { id: editingId ?? undefined, name: name.trim(), active: true } });
      toast('success', editingId ? 'Category updated.' : 'Category added.');
      setName('');
      setEditingId(null);
      onSaved();
    } catch (e) {
      setErr(String((e as Error)?.message ?? e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title={`Manage ${kind} categories`}
      onClose={onClose}
      width={520}
      footer={<Button variant="secondary" onClick={onClose}>Close</Button>}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', gap: 10 }}>
          <Input value={name} onChange={(e) => { setName(e.target.value); setEditingId(null); }} placeholder={kind === 'income' ? 'e.g. Equipment sale' : 'e.g. Lab fees'} />
          <Button loading={busy} onClick={save} disabled={!name.trim()}>{editingId ? 'Save' : 'Add'}</Button>
        </div>
        {err && <div style={{ color: 'var(--c-danger)', fontSize: 'var(--fs-small)' }}>{err}</div>}
        <div style={{ borderTop: '1px solid var(--c-border)', paddingTop: 10 }}>
          {categories.length === 0 && <div style={{ color: 'var(--c-text-3)', fontSize: 'var(--fs-small)' }}>No categories yet.</div>}
          {categories.map((c) => (
            <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0', borderBottom: '1px solid var(--c-border)' }}>
              <span style={{ flex: 1, fontSize: 'var(--fs-body)', fontWeight: 600 }}>{c.name}</span>
              <span style={{ fontSize: 'var(--fs-caption)', color: 'var(--c-text-3)' }}>{c.active ? 'active' : 'inactive'}</span>
              <Button size="sm" variant="ghost" icon={<Pencil size={12} />} onClick={() => { setEditingId(c.id); setName(c.name); }}>
                Rename
              </Button>
            </div>
          ))}
        </div>
      </div>
    </Modal>
  );
}
