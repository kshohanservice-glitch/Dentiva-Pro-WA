import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Receipt, X, Plus } from 'lucide-react';
import { api, hasPerm } from '../lib/api';
import { useApp } from '../context/AppContext';
import { PageHeader } from '../components/Shell';
import { PatientPicker } from '../components/PatientPicker';
import { DocPreview, DocSpec } from '../components/DocPreview';
import {
  Button, Card, Table, Column, Pagination, Badge, Input, Select, Field, Modal, ConfirmModal, useToast, toastError, Loading, EmptyState,
} from '../components/ui';
import type { Invoice, TreatmentCatalogItem } from '@shared/types';
import { fmtMoney, toPaise } from '@shared/money';
import { fmtDate } from '@shared/date';

const PAGE_SIZE = 25;

const STATUS_TONE: Record<Invoice['status'], 'success' | 'warning' | 'danger' | 'muted' | 'info'> = {
  paid: 'success',
  partial: 'warning',
  unpaid: 'danger',
  overpaid: 'info',
  void: 'muted',
};

export function Invoices() {
  const { session, ui } = useApp();
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<{ items: Invoice[]; total: number } | null>(null);
  const [preview, setPreview] = useState<DocSpec | null>(null);
  const [voiding, setVoiding] = useState<Invoice | null>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [outstanding, setOutstanding] = useState<Array<{ patientId: number; patientName: string; patientCode: string; invoiceNumber: string; duePaise: number; invoiceDate: string }>>([]);
  const toast = useToast();

  const can = useCallback((perm: string) => hasPerm(session?.perms, perm), [session?.perms]);
  const canViewOutstanding = can('financial.reports.view');

  const load = useCallback(() => {
    api<{ items: Invoice[]; total: number }>(
      'invoices.list',
      { q: q || undefined, status: status || undefined, from: from || undefined, to: to || undefined, page, pageSize: PAGE_SIZE },
    )
      .then(setData)
      .catch((e) => toast('error', String((e as Error)?.message ?? e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, status, from, to, page]);

  useEffect(load, [load]);
  useEffect(() => {
    if (!canViewOutstanding) return;
    api<typeof outstanding>('invoices.outstanding').then(setOutstanding).catch(() => undefined);
  }, [canViewOutstanding, data]);

  const totalDue = outstanding.reduce((s, o) => s + o.duePaise, 0);

  const columns = useMemo<Column<Invoice>[]>(
    () => [
      { key: 'number', label: 'Invoice', render: (r) => <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 650 }}>{r.number}</span>, width: 150 },
      { key: 'patient', label: 'Patient', render: (r) => (
        <div>
          <div style={{ fontWeight: 650 }}>{r.patientName}</div>
          <div style={{ fontSize: 'var(--fs-caption)', color: 'var(--c-text-3)' }}>{r.patientCode}</div>
        </div>
      ) },
      { key: 'date', label: 'Date', render: (r) => fmtDate(r.invoiceDate, ui.dateFormat), width: 105 },
      { key: 'total', label: 'Total', align: 'right', render: (r) => fmtMoney(r.totalPaise, ui.currencySymbol), width: 105 },
      { key: 'paid', label: 'Paid', align: 'right', render: (r) => fmtMoney(r.paidPaise, ui.currencySymbol), width: 105 },
      { key: 'due', label: 'Due', align: 'right', render: (r) => (
        r.duePaise > 0 ? <span style={{ color: 'var(--c-danger)', fontWeight: 700 }}>{fmtMoney(r.duePaise, ui.currencySymbol)}</span> : <span style={{ color: 'var(--c-text-3)' }}>—</span>
      ), width: 105 },
      { key: 'status', label: 'Status', width: 100, render: (r) => (
        <Badge tone={STATUS_TONE[r.status]}>{r.status.toUpperCase()}</Badge>
      ) },
      ...(can('billing.invoice.void')
        ? [{
            key: 'act', label: '', align: 'right' as const, width: 80, render: (r: Invoice) =>
              r.status !== 'void' ? (
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
        title="Invoices"
        subtitle="Immutable billing records — errors are fixed by voiding and re-issuing"
        actions={can('billing.invoice.create') ? <Button icon={<Plus size={15} />} onClick={() => setShowNew(true)}>New invoice</Button> : undefined}
      />

      <Card style={{ padding: 14, marginBottom: 14 }}>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ position: 'relative', flex: '0 1 260px' }}>
            <Receipt size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--c-text-3)' }} />
            <Input value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} placeholder="Invoice number or patient…" style={{ paddingLeft: 30 }} />
          </div>
          <Select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} style={{ width: 130 }}>
            <option value="">All statuses</option>
            {['unpaid', 'partial', 'paid', 'overpaid', 'void'].map((s) => (
              <option key={s} value={s}>{s[0].toUpperCase() + s.slice(1)}</option>
            ))}
          </Select>
          <Input type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPage(1); }} style={{ width: 150 }} />
          <Input type="date" value={to} onChange={(e) => { setTo(e.target.value); setPage(1); }} style={{ width: 150 }} />
          <div style={{ flex: 1 }} />
          <span style={{ fontSize: 'var(--fs-caption)', color: 'var(--c-text-3)' }}>{data ? `${data.total} invoices` : ''}</span>
        </div>
      </Card>

      <Card style={{ padding: 0 }}>
        {!data ? (
          <div style={{ padding: 30 }}><Loading label="Loading invoices…" /></div>
        ) : (
          <>
            <Table
              columns={columns}
              rows={data.items}
              onRowClick={(r) => setPreview({ channel: 'documents', type: 'invoice', id: r.id })}
              empty={<EmptyState icon={<Receipt size={22} />} title="No invoices found" hint="Create invoices from a patient profile or the New invoice button." />}
            />
            <div style={{ padding: '10px 14px' }}>
              <Pagination page={page} pageSize={PAGE_SIZE} total={data.total} onPage={setPage} />
            </div>
          </>
        )}
      </Card>

      {canViewOutstanding && outstanding.length > 0 && (
        <Card style={{ marginTop: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <strong style={{ fontSize: 'var(--fs-body)' }}>Outstanding receivables</strong>
            <Badge tone="danger">Total due: {fmtMoney(totalDue, ui.currencySymbol)}</Badge>
          </div>
          {outstanding.slice(0, 12).map((o) => (
            <div key={o.invoiceNumber + o.patientId} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 0', borderBottom: '1px solid var(--c-border)', cursor: 'pointer' }} onClick={() => navigate(`/patients/${o.patientId}`)}>
              <span style={{ fontSize: 'var(--fs-body)' }}>
                <strong>{o.patientName}</strong>
                <span style={{ color: 'var(--c-text-3)', fontSize: 'var(--fs-caption)' }}> · {o.patientCode} · {o.invoiceNumber} · {fmtDate(o.invoiceDate, ui.dateFormat)}</span>
              </span>
              <span style={{ color: 'var(--c-danger)', fontWeight: 700 }}>{fmtMoney(o.duePaise, ui.currencySymbol)}</span>
            </div>
          ))}
        </Card>
      )}

      {preview && <DocPreview spec={preview} onClose={() => setPreview(null)} />}

      {showNew && <InvoiceForm onClose={() => setShowNew(false)} onSaved={() => { setShowNew(false); load(); }} />}

      {voiding && (
        <ConfirmModal
          title={`Void invoice ${voiding.number}`}
          danger
          confirmLabel="Void invoice"
          requirePassword
          message={
            <>
              Void <strong>{voiding.number}</strong> for <strong>{voiding.patientName}</strong> ({fmtMoney(voiding.totalPaise, ui.currencySymbol)})?
              <div style={{ marginTop: 8, fontSize: 'var(--fs-small)', color: 'var(--c-text-3)' }}>
                Voids are permanent and audited. Payments already received stay intact; the invoice will no longer be billed.
              </div>
              <div style={{ marginTop: 12 }}>
                <Field label="Reason" required>
                  <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Billing error, patient cancelled" />
                </Field>
              </div>
            </>
          }
          busy={busy}
          onClose={() => setVoiding(null)}
          onConfirm={async (pw) => {
            if (!reason.trim()) {
              toast('warning', 'A void reason is required.');
              return;
            }
            setBusy(true);
            try {
              await api('auth.verifyPassword', { password: pw ?? '' });
              await api('invoices.void', { id: voiding.id, reason: reason.trim() });
              toast('success', 'Invoice voided.');
              setVoiding(null);
              load();
            } catch (e) {
              toastError(toast, e);
            } finally {
              setBusy(false);
            }
          }}
        />
      )}
    </div>
  );
}

function InvoiceForm({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const { ui } = useApp();
  const [treatments, setTreatments] = useState<TreatmentCatalogItem[]>([]);
  const [patientId, setPatientId] = useState<number | null>(null);
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [items, setItems] = useState<Array<{ description: string; catalogId: number | null; quantity: number; unitPricePaise: number }>>([]);
  const [discount, setDiscount] = useState('');
  const [notes, setNotes] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<TreatmentCatalogItem[]>('treatments.list').then(setTreatments).catch(() => undefined);
  }, []);

  const subtotal = items.reduce((s, i) => s + i.unitPricePaise * i.quantity, 0);
  const disc = toPaise(discount);
  const total = Math.max(0, subtotal - (Number.isFinite(disc) ? disc : 0));

  const save = async () => {
    setErr('');
    if (!patientId) {
      setErr('Select a patient.');
      return;
    }
    if (!items.length) {
      setErr('Add at least one item.');
      return;
    }
    setBusy(true);
    try {
      await api('invoices.create', {
        patientId,
        invoiceDate: date,
        items,
        discountPaise: Number.isFinite(disc) && disc > 0 ? disc : 0,
        notes,
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
      title="New invoice"
      subtitle="Invoices are immutable once created — to correct an error, void it and create a new one."
      onClose={onClose}
      width={680}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={save} loading={busy}>Create invoice — {fmtMoney(total, ui.currencySymbol)}</Button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <Field label="Patient" required>
          <PatientPicker value={patientId} onChange={(id) => setPatientId(id)} />
        </Field>
        <Field label="Invoice date">
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} max={new Date().toISOString().slice(0, 10)} />
        </Field>
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <strong style={{ fontSize: 'var(--fs-small)', color: 'var(--c-text-2)' }}>Items</strong>
            <Select
              value=""
              onChange={(e) => {
                const t = treatments.find((x) => String(x.id) === e.target.value);
                if (t) setItems((xs) => [...xs, { description: t.name, catalogId: t.id, quantity: 1, unitPricePaise: t.defaultPricePaise }]);
              }}
              style={{ width: 250 }}
            >
              <option value="">+ Add treatment…</option>
              {treatments.map((t) => (
                <option key={t.id} value={t.id}>{t.name} — {fmtMoney(t.defaultPricePaise, ui.currencySymbol)}</option>
              ))}
            </Select>
          </div>
          {items.map((it, i) => (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 80px 110px 34px', gap: 8, marginBottom: 8, alignItems: 'center' }}>
              <Input value={it.description} onChange={(e) => setItems((xs) => xs.map((x, j) => (j === i ? { ...x, description: e.target.value, catalogId: null } : x)))} placeholder="Description" />
              <Input type="number" min={1} value={it.quantity} onChange={(e) => setItems((xs) => xs.map((x, j) => (j === i ? { ...x, quantity: Math.max(1, Number(e.target.value) || 1) } : x)))} />
              <Input type="number" min={0} step="0.01" value={(it.unitPricePaise / 100).toString()} onChange={(e) => setItems((xs) => xs.map((x, j) => (j === i ? { ...x, unitPricePaise: toPaise(e.target.value) } : x)))} />
              <button onClick={() => setItems((xs) => xs.filter((_, j) => j !== i))} style={{ width: 30, height: 30, borderRadius: 8, border: '1px solid var(--c-border)', background: 'var(--c-surface)', color: 'var(--c-text-3)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <X size={13} />
              </button>
            </div>
          ))}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 24, fontSize: 'var(--fs-small)', color: 'var(--c-text-2)', padding: '8px 0' }}>
            <span>Subtotal: <strong>{fmtMoney(subtotal, ui.currencySymbol)}</strong></span>
            <span style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              Discount: <Input value={discount} onChange={(e) => setDiscount(e.target.value)} placeholder="0" style={{ width: 90, textAlign: 'right' }} />
            </span>
            <span style={{ fontSize: 'var(--fs-body)' }}>Total: <strong style={{ color: 'var(--c-primary)' }}>{fmtMoney(total, ui.currencySymbol)}</strong></span>
          </div>
        </div>
        <Field label="Notes (printed on invoice)">
          <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
        {err && <div style={{ color: 'var(--c-danger)', fontSize: 'var(--fs-small)', fontWeight: 500 }}>{err}</div>}
      </div>
    </Modal>
  );
}

