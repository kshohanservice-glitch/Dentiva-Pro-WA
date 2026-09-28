import { useCallback, useEffect, useState } from 'react';
import { FlaskConical, X } from 'lucide-react';
import { api, hasPerm } from '../lib/api';
import { useApp } from '../context/AppContext';
import { PageHeader } from '../components/Shell';
import { DocPreview, DocSpec } from '../components/DocPreview';
import { Button, Card, Table, Column, Pagination, Badge, Input, useToast, toastError, Loading, EmptyState, Modal } from '../components/ui';
import type { Prescription } from '@shared/types';
import { fmtDate } from '@shared/date';

const PAGE_SIZE = 25;
type RxRow = Omit<Prescription, 'items'>;

export function Prescriptions() {
  const { session, ui } = useApp();
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<{ items: RxRow[]; total: number } | null>(null);
  const [preview, setPreview] = useState<DocSpec | null>(null);
  const [cancelling, setCancelling] = useState<RxRow | null>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  const canCancel = hasPerm(session?.perms, 'clinical.prescription.cancel');

  const load = useCallback(() => {
    api<{ items: RxRow[]; total: number }>('prescriptions.list', { q: q || undefined, page, pageSize: PAGE_SIZE })
      .then(setData)
      .catch((e) => toast('error', String((e as Error)?.message ?? e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, page]);

  useEffect(load, [load]);

  const columns: Column<RxRow>[] = [
    { key: 'code', label: 'Code', render: (r) => <span style={{ fontVariantNumeric: 'tabular-nums', color: 'var(--c-text-2)', fontWeight: 600 }}>{r.code}</span>, width: 110 },
    { key: 'date', label: 'Date', render: (r) => fmtDate(r.createdAt, ui.dateFormat), width: 110 },
    { key: 'patient', label: 'Patient', render: (r) => (
      <div>
        <div style={{ fontWeight: 650 }}>{r.patientName}</div>
        <div style={{ fontSize: 'var(--fs-caption)', color: 'var(--c-text-3)' }}>{r.patientCode}</div>
      </div>
    ) },
    { key: 'diagnosis', label: 'Diagnosis', render: (r) => (
      <div style={{ maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.diagnosis}>{r.diagnosis || '—'}</div>
    ) },
    { key: 'dentist', label: 'Prescriber', render: (r) => (
      <div>
        <div style={{ fontWeight: 600, fontSize: 'var(--fs-body)' }}>{r.dentistName || '—'}</div>
        {r.dentistDesignations && <div style={{ fontSize: 'var(--fs-caption)', color: 'var(--c-text-3)' }}>{r.dentistDesignations}</div>}
      </div>
    ), width: 170 },
    { key: 'status', label: 'Status', width: 105, render: (r) => (r.status === 'active' ? <Badge tone="success">Active</Badge> : <Badge tone="danger">Cancelled</Badge>) },
    ...(canCancel
      ? [{
          key: 'act', label: '', align: 'right' as const, width: 90, render: (r: RxRow) =>
            r.status === 'active' ? (
              <Button size="sm" variant="ghost" icon={<X size={13} />} style={{ color: 'var(--c-danger)' }} onClick={() => { setReason(''); setCancelling(r); }}>
                Cancel
              </Button>
            ) : null,
        }]
      : []),
  ];

  return (
    <div style={{ padding: 22, maxWidth: 1200, margin: '0 auto' }}>
      <PageHeader title="Prescriptions" subtitle="All prescriptions issued by the clinic — click a row to preview, print or save as PDF" />
      <Card style={{ padding: 14, marginBottom: 14 }}>
        <div style={{ position: 'relative', maxWidth: 360 }}>
          <FlaskConical size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--c-text-3)' }} />
          <Input value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} placeholder="Search by code or patient name…" style={{ paddingLeft: 30 }} />
        </div>
      </Card>
      <Card style={{ padding: 0 }}>
        {!data ? (
          <div style={{ padding: 30 }}><Loading label="Loading prescriptions…" /></div>
        ) : (
          <>
            <Table
              columns={columns}
              rows={data.items}
              onRowClick={(r) => setPreview({ channel: 'documents', type: 'prescription', id: r.id })}
              empty={<EmptyState icon={<FlaskConical size={22} />} title="No prescriptions yet" hint="Create prescriptions from a patient profile." />}
            />
            <div style={{ padding: '10px 14px' }}>
              <Pagination page={page} pageSize={PAGE_SIZE} total={data.total} onPage={setPage} />
            </div>
          </>
        )}
      </Card>

      {preview && <DocPreview spec={preview} onClose={() => setPreview(null)} />}

      {cancelling && (
        <Modal
          title={`Cancel prescription ${cancelling.code}`}
          danger
          onClose={() => setCancelling(null)}
          width={480}
          footer={
            <>
              <Button variant="secondary" onClick={() => setCancelling(null)} disabled={busy}>Keep it</Button>
              <Button
                variant="danger"
                loading={busy}
                disabled={!reason.trim()}
                onClick={async () => {
                  setBusy(true);
                  try {
                    await api('prescriptions.cancel', { id: cancelling.id, reason: reason.trim() });
                    toast('success', 'Prescription cancelled.');
                    setCancelling(null);
                    load();
                  } catch (e) {
                    toastError(toast, e);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Cancel prescription
              </Button>
            </>
          }
        >
          <p style={{ fontSize: 'var(--fs-body)', color: 'var(--c-text-2)', marginBottom: 12 }}>
            Cancelling a prescription is recorded in the audit log and remains visible for history. Provide a reason:
          </p>
          <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Duplicated prescription" autoFocus />
        </Modal>
      )}
    </div>
  );
}
