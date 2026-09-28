import { useCallback, useEffect, useState } from 'react';
import { Plus, BellRing, Stethoscope, CheckCircle2, SkipForward, XCircle } from 'lucide-react';
import { api, hasPerm } from '../lib/api';
import { useApp } from '../context/AppContext';
import { PageHeader } from '../components/Shell';
import { PatientPicker } from '../components/PatientPicker';
import { Button, Card, Badge, Modal, Field, Input, useToast, toastError, EmptyState, Select } from '../components/ui';
import type { QueueEntry, Appointment } from '@shared/types';
import { fmtTime } from '@shared/date';
import { QUEUE_STATUSES } from '@shared/constants';

const STATUS_TONE: Record<string, 'warning' | 'info' | 'primary' | 'success' | 'muted' | 'danger'> = {
  waiting: 'warning',
  called: 'info',
  in_treatment: 'primary',
  completed: 'success',
  skipped: 'muted',
  cancelled: 'danger',
};

export function Queue() {
  const { session, ui } = useApp();
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [items, setItems] = useState<QueueEntry[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const toast = useToast();

  const canManage = hasPerm(session?.perms, 'queue.manage');

  const load = useCallback(() => {
    api<QueueEntry[]>('queue.list', { date }).then(setItems).catch((e) => toast('error', String((e as Error)?.message ?? e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date]);

  useEffect(load, [load]);

  const setStatus = async (id: number, status: string) => {
    try {
      await api('queue.setStatus', { id, status });
      load();
    } catch (e) {
      toastError(toast, e);
    }
  };

  const active = items.filter((i) => !['completed', 'skipped', 'cancelled'].includes(i.status));
  const finished = items.filter((i) => ['completed', 'skipped', 'cancelled'].includes(i.status));

  const Row = ({ e }: { e: QueueEntry }) => (
    <div
      style={{
        display: 'flex',
        gap: 14,
        alignItems: 'center',
        padding: '12px 16px',
        borderBottom: '1px solid var(--c-border)',
        opacity: ['skipped', 'cancelled'].includes(e.status) ? 0.55 : 1,
      }}
    >
      <div
        style={{
          width: 44,
          height: 44,
          borderRadius: 12,
          background: e.status === 'in_treatment' ? 'var(--c-primary)' : e.status === 'completed' ? 'var(--c-success)' : 'var(--c-surface-2)',
          color: e.status === 'in_treatment' || e.status === 'completed' ? '#fff' : 'var(--c-text-2)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontWeight: 800,
          fontSize: 17,
          flexShrink: 0,
        }}
      >
        {e.queueNumber}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <strong style={{ fontSize: 'var(--fs-body)' }}>{e.patientName}</strong>
          <span style={{ fontSize: 'var(--fs-caption)', color: 'var(--c-text-3)' }}>{e.patientCode}</span>
          {e.dentistName && <span style={{ fontSize: 'var(--fs-caption)', color: 'var(--c-text-3)' }}>· {e.dentistName}</span>}
          <Badge tone={STATUS_TONE[e.status] ?? 'muted'}>{QUEUE_STATUSES.find((s) => s.key === e.status)?.label ?? e.status}</Badge>
        </div>
        <div style={{ fontSize: 'var(--fs-small)', color: 'var(--c-text-2)', marginTop: 2 }}>
          Arrived {fmtTime(e.arrivedAt, ui.timeFormat === '24h')}
          {e.calledAt ? ` · called ${fmtTime(e.calledAt, ui.timeFormat === '24h')}` : ''}
          {e.notes ? ` · ${e.notes}` : ''}
        </div>
      </div>
      {canManage && (
        <div style={{ display: 'flex', gap: 6, flexShrink: 0, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          {e.status === 'waiting' && (
            <Button size="sm" variant="secondary" icon={<BellRing size={13} />} onClick={() => setStatus(e.id, 'called')}>Call</Button>
          )}
          {(e.status === 'waiting' || e.status === 'called') && (
            <Button size="sm" icon={<Stethoscope size={13} />} onClick={() => setStatus(e.id, 'in_treatment')}>Start treatment</Button>
          )}
          {e.status === 'in_treatment' && (
            <Button size="sm" icon={<CheckCircle2 size={13} />} onClick={() => setStatus(e.id, 'completed')}>Complete</Button>
          )}
          {(e.status === 'waiting' || e.status === 'called') && (
            <Button size="sm" variant="ghost" icon={<SkipForward size={13} />} onClick={() => setStatus(e.id, 'skipped')}>Skip</Button>
          )}
          {e.status === 'skipped' && (
            <Button size="sm" variant="ghost" onClick={() => setStatus(e.id, 'waiting')}>Back to waiting</Button>
          )}
          {!['completed', 'skipped', 'cancelled'].includes(e.status) && (
            <Button size="sm" variant="ghost" icon={<XCircle size={13} />} style={{ color: 'var(--c-danger)' }} onClick={() => setStatus(e.id, 'cancelled')}>
              Cancel
            </Button>
          )}
        </div>
      )}
    </div>
  );

  return (
    <div style={{ padding: 22, maxWidth: 1100, margin: '0 auto' }}>
      <PageHeader
        title="Queue"
        subtitle="Live treatment queue for the selected date"
        actions={
          <>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={{ width: 160 }} />
            {canManage && <Button icon={<Plus size={15} />} onClick={() => setShowAdd(true)}>Add to queue</Button>}
          </>
        }
      />

      <Card style={{ padding: 0, marginBottom: 16 }}>
        <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--c-border)', display: 'flex', justifyContent: 'space-between' }}>
          <strong style={{ fontSize: 'var(--fs-body)' }}>Active queue</strong>
          <span style={{ fontSize: 'var(--fs-caption)', color: 'var(--c-text-3)' }}>{active.length} in queue</span>
        </div>
        {!items.length ? (
          <EmptyState icon={<BellRing size={22} />} title="Queue is empty" hint="Add patients as they arrive — with or without an appointment." />
        ) : active.length === 0 ? (
          <div style={{ padding: 22, textAlign: 'center', color: 'var(--c-text-3)', fontSize: 'var(--fs-small)' }}>All queue entries for {date} are finished.</div>
        ) : (
          active.map((e) => <Row key={e.id} e={e} />)
        )}
      </Card>

      {finished.length > 0 && (
        <Card style={{ padding: 0 }}>
          <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--c-border)' }}>
            <strong style={{ fontSize: 'var(--fs-body)' }}>Finished</strong>
          </div>
          {finished.map((e) => (
            <Row key={e.id} e={e} />
          ))}
        </Card>
      )}

      {showAdd && <AddQueue date={date} onClose={() => setShowAdd(false)} onSaved={() => { setShowAdd(false); load(); }} />}
    </div>
  );
}

function AddQueue({ date, onClose, onSaved }: { date: string; onClose: () => void; onSaved: () => void }) {
  const [patientId, setPatientId] = useState<number | null>(null);
  const [apptId, setApptId] = useState('');
  const [notes, setNotes] = useState('');
  const [appts, setAppts] = useState<Appointment[]>([]);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!patientId) return;
    api<{ items: Appointment[]; total: number }>('appointments.list', { patientId, from: date, to: date })
      .then((r) => setAppts(r.items.filter((a) => ['scheduled', 'confirmed', 'rescheduled'].includes(a.status))))
      .catch(() => undefined);
  }, [patientId, date]);

  const save = async () => {
    setErr('');
    if (!patientId) {
      setErr('Select a patient.');
      return;
    }
    setBusy(true);
    try {
      await api('queue.add', {
        patientId,
        appointmentId: apptId ? Number(apptId) : null,
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
      title="Add to queue"
      subtitle="Walk-in patients can be queued without an appointment."
      onClose={onClose}
      width={520}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={save} loading={busy}>Add to queue</Button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <Field label="Patient" required>
          <PatientPicker value={patientId} onChange={setPatientId} />
        </Field>
        {patientId && (
          <Field label="Linked appointment (optional)" hint={appts.length ? 'Today’s scheduled appointments for this patient.' : 'No open appointment today — walk-in.'}>
            <Select value={apptId} onChange={(e) => setApptId(e.target.value)} disabled={!appts.length}>
              <option value="">Walk-in (no appointment)</option>
              {appts.map((a) => (
                <option key={a.id} value={a.id}>{a.startTime} — {a.reason || a.type}</option>
              ))}
            </Select>
          </Field>
        )}
        <Field label="Notes">
          <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. Urgent — severe pain" />
        </Field>
        {err && <div style={{ color: 'var(--c-danger)', fontSize: 'var(--fs-small)', fontWeight: 500 }}>{err}</div>}
      </div>
    </Modal>
  );
}
