import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Wallet, X, Plus } from 'lucide-react';
import { api, hasPerm } from '../lib/api';
import { useApp } from '../context/AppContext';
import { PageHeader } from '../components/Shell';
import { DocPreview, DocSpec } from '../components/DocPreview';
import { PatientPicker } from '../components/PatientPicker';
import {
  Button, Card, Table, Column, Pagination, Badge, Input, Select, Field, Modal, useToast, toastError, Loading, EmptyState,
} from '../components/ui';
import type { Payment, Invoice } from '@shared/types';
import { fmtMoney, toPaise } from '@shared/money';
import { fmtDate } from '@shared/date';
import { PAYMENT_METHODS, PAYMENT_METHOD_LABEL } from '@shared/constants';

const PAGE_SIZE = 25;

export function Payments() {
  const { session, ui } = useApp();
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [method, setMethod] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<{ items: Payment[]; total: number } | null>(null);
  const [preview, setPreview] = useState<DocSpec | null>(null);
  const [voiding, setVoiding] = useState<Payment | null>(null);
  const [reason, setReason] = useState('');
  const [showNew, setShowNew] = useState(false);
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  const can = useCallback((perm: string) => hasPerm(session?.perms, perm), [session?.perms]);

  const load = useCallback(() => {
    api<{ items: Payment[]; total: number }>(
      'payments.list',
      { q: q || undefined, method: method || undefined, from: from || undefined, to: to || undefined, page, pageSize: PAGE_SIZE },
    )
      .then(setData)
      .catch((e) => toast('error', String((e as Error)?.message ?? e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, method, from, to, page]);

  useEffect(load, [load]);

  const columns = useMemo<Column<Payment>[]>(
    () => [
      { key: 'code', label: 'Code', render: (r) => <span style={{ fontVariantNumeric: 'tabular-nums', color: 'var(--c-text-2)', fontWeight: 600 }}>{r.code}</span>, width: 100 },
      { key: 'date', label: 'Date', render: (r) => fmtDate(r.paymentDate, ui.dateFormat), width: 105 },
      { key: 'patient', label: 'Patient', render: (r) => (
        <div>
          <div style={{ fontWeight: 650 }}>{r.patientName}</div>
        </div>
      ) },
      { key: 'amount', label: 'Amount', align: 'right', render: (r) => (
        <span style={{ fontWeight: 750, color: r.void ? 'var(--c-text-3)' : 'var(--c-success)', textDecoration: r.void ? 'line-through' : 'none' }}>{fmtMoney(r.amountPaise, ui.currencySymbol)}</span>
      ), width: 110 },
      { key: 'method', label: 'Method', render: (r) => (
        <Badge tone={r.method === 'cash' ? 'success' : r.method === 'credit' ? 'info' : 'primary'}>{PAYMENT_METHOD_LABEL[r.method] ?? r.method}</Badge>
      ), width: 100 },
      { key: 'invoice', label: 'Against', render: (r) => r.invoiceNumber ?? (r.method === 'credit' ? 'Credit applied' : 'Advance'), width: 150 },
      { key: 'reference', label: 'Reference', render: (r) => (
        <div style={{ maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--c-text-2)' }} title={r.reference}>{r.reference || '—'}</div>
      ) },
      { key: 'status', label: '', width: 70, render: (r) => (r.void ? <Badge tone="danger">VOID</Badge> : null) },
      ...(can('billing.payment.void')
        ? [{
            key: 'act', label: '', align: 'right' as const, width: 80, render: (r: Payment) =>
              !r.void && r.method !== 'credit' ? (
                <Button size="sm" variant="ghost" icon={<X size={13} />} style={{ color: 'var(--c-danger)' }} onClick={() => { setReason(''); setVoiding(r); }}>
                  Void
                </Button>
              ) : null,
          }]
        : []),
    ],
    [ui, can],
  );

  return (
    <div style={{ padding: 22, maxWidth: 1280, margin: '0 auto' }}>
      <PageHeader
        title="Payments"
        subtitle="All money received — advances, invoice payments and credit applications"
        actions={can('billing.payment.create') ? <Button icon={<Plus size={15} />} onClick={() => setShowNew(true)}>Record payment</Button> : undefined}
      />

      <Card style={{ padding: 14, marginBottom: 14 }}>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <Input value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} placeholder="Code, patient, reference…" style={{ maxWidth: 260, flex: '1 1 200px' }} />
          <Select value={method} onChange={(e) => { setMethod(e.target.value); setPage(1); }} style={{ width: 130 }}>
            <option value="">All methods</option>
            {PAYMENT_METHODS.map((m) => (
              <option key={m.key} value={m.key}>{m.label}</option>
            ))}
          </Select>
          <Input type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPage(1); }} style={{ width: 150 }} />
          <Input type="date" value={to} onChange={(e) => { setTo(e.target.value); setPage(1); }} style={{ width: 150 }} />
          <div style={{ flex: 1 }} />
          <span style={{ fontSize: 'var(--fs-caption)', color: 'var(--c-text-3)' }}>{data ? `${data.total} payments` : ''}</span>
        </div>
      </Card>

      <Card style={{ padding: 0 }}>
        {!data ? (
          <div style={{ padding: 30 }}><Loading label="Loading payments…" /></div>
        ) : (
          <>
            <Table
              columns={columns}
              rows={data.items}
              onRowClick={(r) => {
                if (!r.void) {
                  if (r.method === 'credit') navigate('/');
                  else setPreview({ channel: 'documents', type: 'receipt', id: r.id });
                }
              }}
              empty={<EmptyState icon={<Wallet size={22} />} title="No payments found" hint="Record a payment or adjust the filters." />}
            />
            <div style={{ padding: '10px 14px' }}>
              <Pagination page={page} pageSize={PAGE_SIZE} total={data.total} onPage={setPage} />
            </div>
          </>
        )}
      </Card>

      {preview && <DocPreview spec={preview} onClose={() => setPreview(null)} />}
      {showNew && <PaymentFormGlobal onClose={() => setShowNew(false)} onSaved={() => { setShowNew(false); load(); }} />}

      {voiding && (
        <Modal
          title={`Void payment ${voiding.code}`}
          danger
          onClose={() => setVoiding(null)}
          width={480}
          footer={
            <>
              <Button variant="secondary" onClick={() => setVoiding(null)} disabled={busy}>Keep it</Button>
              <Button
                variant="danger"
                loading={busy}
                disabled={!reason.trim()}
                onClick={async () => {
                  setBusy(true);
                  try {
                    await api('payments.void', { id: voiding.id, reason: reason.trim() });
                    toast('success', 'Payment voided — reversal booked to accounting.');
                    setVoiding(null);
                    load();
                  } catch (e) {
                    toastError(toast, e);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Void payment
              </Button>
            </>
          }
        >
          <p style={{ fontSize: 'var(--fs-body)', color: 'var(--c-text-2)', marginBottom: 10 }}>
            Void <strong>{voiding.code}</strong> of {fmtMoney(voiding.amountPaise, ui.currencySymbol)} from <strong>{voiding.patientName}</strong>? A negative reversal entry is added to accounting and the invoice balance is recalculated. This is audited.
          </p>
          <Field label="Reason" required>
            <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Wrong amount entered" autoFocus />
          </Field>
        </Modal>
      )}
    </div>
  );
}

function PaymentFormGlobal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const { ui } = useApp();
  const [patientId, setPatientId] = useState<number | null>(null);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [invoiceId, setInvoiceId] = useState('');
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('cash');
  const [reference, setReference] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  useEffect(() => {
    if (!patientId) {
      setInvoices([]);
      return;
    }
    api<{ items: Invoice[]; total: number }>('invoices.list', { patientId, pageSize: 100 })
      .then((r) => {
        setInvoices(r.items);
        const firstUnpaid = r.items.find((i) => i.duePaise > 0);
        if (firstUnpaid) setInvoiceId(String(firstUnpaid.id));
      })
      .catch(() => undefined);
  }, [patientId]);

  const selected = invoices.find((i) => String(i.id) === invoiceId);

  const save = async () => {
    setErr('');
    if (!patientId) {
      setErr('Select a patient.');
      return;
    }
    const amt = toPaise(amount);
    if (!Number.isFinite(amt) || amt <= 0) {
      setErr('Enter a valid payment amount.');
      return;
    }
    setBusy(true);
    try {
      const r = await api<{ creditApplied: number }>('payments.record', {
        patientId,
        invoiceId: invoiceId ? Number(invoiceId) : null,
        amountPaise: amt,
        method,
        reference,
        paymentDate: date,
        notes,
      });
      toast('success', r.creditApplied > 0 ? `Payment recorded — ৳${(r.creditApplied / 100).toLocaleString('en-US')} of saved credit applied first.` : 'Payment recorded.');
      onSaved();
    } catch (e) {
      setErr(String((e as Error)?.message ?? e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title="Record payment"
      subtitle="Saved advance/credit is applied before real money. Real money is booked as income automatically."
      onClose={onClose}
      width={560}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={save} loading={busy}>Record {amount ? fmtMoney(toPaise(amount), ui.currencySymbol) : 'payment'}</Button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <Field label="Patient" required>
          <PatientPicker value={patientId} onChange={setPatientId} />
        </Field>
        <Field label="Against invoice" hint={selected ? `${selected.number} — due ${fmtMoney(selected.duePaise, ui.currencySymbol)}` : 'Empty = advance payment (saved as credit).'}>
          <Select value={invoiceId} onChange={(e) => setInvoiceId(e.target.value)} disabled={!invoices.length}>
            <option value="">Advance (no invoice)</option>
            {invoices.filter((i) => i.status !== 'void').map((i) => (
              <option key={i.id} value={i.id}>{i.number} — {fmtDate(i.invoiceDate, ui.dateFormat)} — due {fmtMoney(i.duePaise, ui.currencySymbol)}</option>
            ))}
          </Select>
        </Field>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <Field label="Amount (৳)" required>
            <Input value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" inputMode="decimal" autoFocus />
          </Field>
          <Field label="Method">
            <Select value={method} onChange={(e) => setMethod(e.target.value)}>
              {PAYMENT_METHODS.map((m) => (
                <option key={m.key} value={m.key}>{m.label}</option>
              ))}
            </Select>
          </Field>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <Field label="Reference" hint="TrxID, cheque no., etc.">
            <Input value={reference} onChange={(e) => setReference(e.target.value)} />
          </Field>
          <Field label="Payment date">
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} max={new Date().toISOString().slice(0, 10)} />
          </Field>
        </div>
        <Field label="Notes">
          <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
        {err && <div style={{ color: 'var(--c-danger)', fontSize: 'var(--fs-small)', fontWeight: 500 }}>{err}</div>}
      </div>
    </Modal>
  );
}
