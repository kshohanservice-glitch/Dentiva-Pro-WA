import { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, CalendarDays, X } from 'lucide-react';
import { api, hasPerm } from '../lib/api';
import { useApp } from '../context/AppContext';
import { PageHeader } from '../components/Shell';
import { PatientPicker } from '../components/PatientPicker';
import {
  Button, Card, Table, Column, Pagination, Badge, Input, Select, Field, Modal, ConfirmModal, Textarea, Checkbox,
  useToast, toastError, Loading, EmptyState,
} from '../components/ui';
import type { Appointment, Dentist } from '@shared/types';
import { fmtDate } from '@shared/date';
import { APPOINTMENT_STATUSES, APPOINTMENT_STATUS_LABEL, APPOINTMENT_TYPES } from '@shared/constants';

const PAGE_SIZE = 25;

export function Appointments() {
  const { session, ui } = useApp();
  const [from, setFrom] = useState(() => new Date().toISOString().slice(0, 10));
  const [to, setTo] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 6);
    return d.toISOString().slice(0, 10);
  });
  const [status, setStatus] = useState('');
  const [dentistId, setDentistId] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<{ items: Appointment[]; total: number } | null>(null);
  const [error, setError] = useState('');
  const [dentists, setDentists] = useState<Dentist[]>([]);
  const [showNew, setShowNew] = useState(false);
  const [detail, setDetail] = useState<Appointment | null>(null);
  const [cancel, setCancel] = useState<Appointment | null>(null);
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  const can = (perm: string) => hasPerm(session?.perms, perm);

  const load = useCallback(() => {
    setError('');
    api<{ items: Appointment[]; total: number }>(
      'appointments.list',
      { from: from || undefined, to: to || undefined, status: status || undefined, dentistId: dentistId ? Number(dentistId) : undefined, page, pageSize: PAGE_SIZE },
    )
      .then(setData)
      .catch((e) => setError(String((e as Error)?.message ?? e)));
  }, [from, to, status, dentistId, page]);

  useEffect(load, [load]);
  useEffect(() => {
    api<Dentist[]>('dentists.list').then(setDentists).catch(() => undefined);
  }, []);

  const columns = useMemo<Column<Appointment>[]>(
    () => [
      { key: 'date', label: 'Date', render: (r) => fmtDate(r.apptDate, ui.dateFormat), width: 105 },
      { key: 'time', label: 'Time', render: (r) => (
        <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>{r.startTime} <span style={{ color: 'var(--c-text-3)', fontWeight: 400, fontSize: 'var(--fs-caption)' }}>· {r.durationMinutes}m</span></span>
      ), width: 100 },
      { key: 'patient', label: 'Patient', render: (r) => (
        <div>
          <div style={{ fontWeight: 650 }}>{r.patientName}</div>
          <div style={{ fontSize: 'var(--fs-caption)', color: 'var(--c-text-3)' }}>{r.patientCode}{r.patientPhone ? ` · ${r.patientPhone}` : ''}</div>
        </div>
      ) },
      { key: 'dentist', label: 'Dentist', render: (r) => r.dentistName ?? '—', width: 140 },
      { key: 'type', label: 'Type', render: (r) => (
        <span style={{ textTransform: 'capitalize' }}>{APPOINTMENT_TYPES.find((t) => t.key === r.type)?.label ?? r.type}</span>
      ), width: 110 },
      { key: 'reason', label: 'Reason', render: (r) => (
        <div style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.reason}>{r.reason || '—'}</div>
      ) },
      { key: 'status', label: 'Status', width: 115, render: (r) => {
        const def = APPOINTMENT_STATUSES.find((s) => s.key === r.status);
        return <Badge tone={(def?.tone as 'info') ?? 'muted'}>{APPOINTMENT_STATUS_LABEL[r.status] ?? r.status}</Badge>;
      } },
    ],
    [ui],
  );

  return (
    <div style={{ padding: 22, maxWidth: 1280, margin: '0 auto' }}>
      <PageHeader
        title="Appointments"
        subtitle="Schedule, confirm and track patient visits"
        actions={can('appointments.create') ? (
          <Button icon={<Plus size={15} />} onClick={() => setShowNew(true)}>New appointment</Button>
        ) : undefined}
      />

      <Card style={{ padding: 14, marginBottom: 14 }}>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <Field label="From" className="inline">
            <Input type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPage(1); }} style={{ width: 150 }} />
          </Field>
          <Field label="To" className="inline">
            <Input type="date" value={to} onChange={(e) => { setTo(e.target.value); setPage(1); }} style={{ width: 150 }} />
          </Field>
          <Field label="Status" className="inline">
            <Select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} style={{ width: 150 }}>
              <option value="">All</option>
              {APPOINTMENT_STATUSES.map((s) => (
                <option key={s.key} value={s.key}>{s.label}</option>
              ))}
            </Select>
          </Field>
          <Field label="Dentist" className="inline">
            <Select value={dentistId} onChange={(e) => { setDentistId(e.target.value); setPage(1); }} style={{ width: 170 }}>
              <option value="">All</option>
              {dentists.map((d) => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </Select>
          </Field>
          <div style={{ flex: 1 }} />
          <span style={{ fontSize: 'var(--fs-caption)', color: 'var(--c-text-3)' }}>{data ? `${data.total} appointments` : ''}</span>
        </div>
      </Card>

      <Card style={{ padding: 0 }}>
        {!data ? (
          <div style={{ padding: 30 }}><Loading label="Loading appointments…" /></div>
        ) : error ? (
          <div style={{ padding: 30, color: 'var(--c-danger)', fontSize: 'var(--fs-small)' }}>{error}</div>
        ) : (
          <>
            <Table
              columns={columns}
              rows={data.items}
              onRowClick={setDetail}
              empty={<EmptyState icon={<CalendarDays size={22} />} title="No appointments in this range" hint="Adjust the date range or create a new appointment." />}
            />
            <div style={{ padding: '10px 14px' }}>
              <Pagination page={page} pageSize={PAGE_SIZE} total={data.total} onPage={setPage} />
            </div>
          </>
        )}
      </Card>

      {showNew && <AppointmentForm onClose={() => setShowNew(false)} onSaved={() => { setShowNew(false); load(); }} />}

      {detail && (
        <AppointmentDetail
          appt={detail}
          onClose={() => setDetail(null)}
          onStatus={async (statusKey: string) => {
            try {
              await api('appointments.update', { id: detail.id, input: { status: statusKey } });
              toast('success', `Status updated to ${APPOINTMENT_STATUS_LABEL[statusKey]}.`);
              setDetail({ ...detail, status: statusKey });
              load();
            } catch (e) {
              toastError(toast, e);
            }
          }}
          onCancel={() => { setCancel(detail); setDetail(null); }}
          canEdit={can('appointments.edit')}
          canCancel={can('appointments.cancel')}
          uiDateFormat={ui.dateFormat}
        />
      )}

      {cancel && (
        <ConfirmModal
          title="Cancel appointment"
          danger
          confirmLabel="Cancel appointment"
          message={
            <>
              Cancel the appointment for <strong>{cancel.patientName}</strong> on {fmtDate(cancel.apptDate, ui.dateFormat)} at {cancel.startTime}?
              <div style={{ marginTop: 12 }}>
                <Checkbox
                  label="Mark as no-show (patient did not arrive)"
                  defaultChecked={false}
                  id="noshow"
                />
              </div>
            </>
          }
          busy={busy}
          onClose={() => setCancel(null)}
          onConfirm={async () => {
            setBusy(true);
            try {
              const noShow = (document.getElementById('noshow') as HTMLInputElement | null)?.checked ?? false;
              await api('appointments.cancel', { id: cancel.id, noShow });
              toast('success', noShow ? 'Appointment marked as no-show.' : 'Appointment cancelled.');
              setCancel(null);
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

function AppointmentForm({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [dentists, setDentists] = useState<Dentist[]>([]);
  const [patientId, setPatientId] = useState<number | null>(null);
  const [dentistId, setDentistId] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [time, setTime] = useState('10:00');
  const [duration, setDuration] = useState('30');
  const [type, setType] = useState('consultation');
  const [reason, setReason] = useState('');
  const [notes, setNotes] = useState('');
  const [reminder, setReminder] = useState(true);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<Dentist[]>('dentists.list').then(setDentists).catch(() => undefined);
  }, []);

  const save = async () => {
    setErr('');
    if (!patientId) {
      setErr('Select a patient.');
      return;
    }
    setBusy(true);
    try {
      await api('appointments.create', {
        patientId,
        dentistId: dentistId ? Number(dentistId) : null,
        apptDate: date,
        startTime: time,
        durationMinutes: Number(duration) || 30,
        type,
        reason,
        notes,
        reminderEnabled: reminder,
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
      title="New appointment"
      onClose={onClose}
      width={600}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={save} loading={busy}>Book appointment</Button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <Field label="Patient" required>
          <PatientPicker value={patientId} onChange={(id) => setPatientId(id)} />
        </Field>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <Field label="Dentist">
            <Select value={dentistId} onChange={(e) => setDentistId(e.target.value)}>
              <option value="">—</option>
              {dentists.map((d) => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </Select>
          </Field>
          <Field label="Type">
            <Select value={type} onChange={(e) => setType(e.target.value)}>
              {APPOINTMENT_TYPES.map((t) => (
                <option key={t.key} value={t.key}>{t.label}</option>
              ))}
            </Select>
          </Field>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 100px', gap: 14 }}>
          <Field label="Date" required>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label="Start time" required>
            <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
          </Field>
          <Field label="Duration (min)">
            <Select value={duration} onChange={(e) => setDuration(e.target.value)}>
              {[15, 30, 45, 60, 90, 120].map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </Select>
          </Field>
        </div>
        <Field label="Reason / treatment planned">
          <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. RCT completion, cleaning" />
        </Field>
        <Field label="Notes">
          <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
        <Checkbox label="Notify via in-app reminder" checked={reminder} onChange={(e) => setReminder(e.target.checked)} />
        {err && <div style={{ color: 'var(--c-danger)', fontSize: 'var(--fs-small)', fontWeight: 500 }}>{err}</div>}
      </div>
    </Modal>
  );
}

function AppointmentDetail({ appt, onClose, onStatus, onCancel, canEdit, canCancel, uiDateFormat }: { appt: Appointment; onClose: () => void; onStatus: (s: string) => void; onCancel: () => void; canEdit: boolean; canCancel: boolean; uiDateFormat: string }) {
  return (
    <Modal
      title={`Appointment — ${appt.patientName}`}
      subtitle={`${appt.code} · booked ${fmtDate(appt.createdAt, uiDateFormat)}`}
      onClose={onClose}
      width={560}
      footer={
        <>
          {canCancel && appt.status !== 'cancelled' && appt.status !== 'completed' && (
            <Button variant="danger" onClick={onCancel} icon={<X size={14} />}>Cancel</Button>
          )}
          <Button variant="secondary" onClick={onClose}>Close</Button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div style={{ background: 'var(--c-surface-2)', borderRadius: 'var(--r-md)', padding: '10px 12px' }}>
            <div style={{ fontSize: 'var(--fs-caption)', color: 'var(--c-text-3)', fontWeight: 700 }}>WHEN</div>
            <div style={{ fontWeight: 650, marginTop: 2 }}>{fmtDate(appt.apptDate, uiDateFormat)} · {appt.startTime} ({appt.durationMinutes} min)</div>
          </div>
          <div style={{ background: 'var(--c-surface-2)', borderRadius: 'var(--r-md)', padding: '10px 12px' }}>
            <div style={{ fontSize: 'var(--fs-caption)', color: 'var(--c-text-3)', fontWeight: 700 }}>WITH</div>
            <div style={{ fontWeight: 650, marginTop: 2 }}>{appt.dentistName ?? 'Unassigned'}</div>
          </div>
        </div>
        {appt.reason && <div><strong style={{ fontSize: 'var(--fs-small)', color: 'var(--c-text-2)' }}>Reason:</strong> <span>{appt.reason}</span></div>}
        {appt.notes && <div><strong style={{ fontSize: 'var(--fs-small)', color: 'var(--c-text-2)' }}>Notes:</strong> <span>{appt.notes}</span></div>}
        <div>
          <strong style={{ fontSize: 'var(--fs-small)', color: 'var(--c-text-2)' }}>Current status:</strong>{' '}
          <Badge tone={(APPOINTMENT_STATUSES.find((s) => s.key === appt.status)?.tone as 'info') ?? 'muted'}>{APPOINTMENT_STATUS_LABEL[appt.status]}</Badge>
        </div>
        {canEdit && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', borderTop: '1px solid var(--c-border)', paddingTop: 12 }}>
            {APPOINTMENT_STATUSES.filter((s) => s.key !== appt.status && !['cancelled', 'no_show'].includes(s.key)).map((s) => (
              <button
                key={s.key}
                onClick={() => onStatus(s.key)}
                style={{ padding: '6px 12px', borderRadius: 'var(--r-md)', border: '1px solid var(--c-border)', background: 'var(--c-surface)', fontSize: 'var(--fs-small)', fontWeight: 600, color: 'var(--c-text-2)' }}
              >
                Mark {s.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
}
