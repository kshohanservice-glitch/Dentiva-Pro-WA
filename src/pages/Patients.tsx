import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Search, AlertTriangle } from 'lucide-react';
import { api, hasPerm } from '../lib/api';
import { useApp } from '../context/AppContext';
import { PageHeader } from '../components/Shell';
import {
  Button, Card, Table, Column, Pagination, Badge, Input, Select, Field, Modal, ConfirmModal,
  Textarea, useToast, toastError, Loading, EmptyState,
} from '../components/ui';
import type { Patient, PatientListItem, Dentist } from '@shared/types';
import { fmtMoney } from '@shared/money';
import { fmtDate } from '@shared/date';
import { GENDERS, BLOOD_GROUPS } from '@shared/constants';
import type { PatientInput } from '@shared/types';

const PAGE_SIZE = 25;

const EMPTY: PatientInput = {
  fullName: '',
  gender: '',
  bloodGroup: '',
  address: '',
  phone: '',
  emergencyPhone: '',
  emergencyContactName: '',
  emergencyContactRelationship: '',
  occupation: '',
  preferredLanguage: 'Bangla',
  referralSource: '',
  presentingProblem: '',
  previousMedicalHistory: '',
  previousDentalHistory: '',
  allergies: '',
  medications: '',
  notes: '',
  assignedDentistId: null,
};

export function Patients() {
  const { session, ui } = useApp();
  const navigate = useNavigate();
  const toast = useToast();
  const [q, setQ] = useState('');
  const [gender, setGender] = useState('');
  const [blood, setBlood] = useState('');
  const [dentistId, setDentistId] = useState('');
  const [archived, setArchived] = useState(false);
  const [page, setPage] = useState(1);
  const [data, setData] = useState<{ items: PatientListItem[]; total: number } | null>(null);
  const [error, setError] = useState('');
  const [dentists, setDentists] = useState<Dentist[]>([]);

  const [editing, setEditing] = useState<Patient | 'new' | null>(null);
  const [confirm, setConfirm] = useState<{ kind: 'archive' | 'restore' | 'delete'; patient: PatientListItem } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    setError('');
    api<{ items: PatientListItem[]; total: number }>('patients.list', {
      q: q || undefined,
      gender: gender || undefined,
      bloodGroup: blood || undefined,
      dentistId: dentistId ? Number(dentistId) : undefined,
      archived,
      page,
      pageSize: PAGE_SIZE,
    })
      .then(setData)
      .catch((e) => setError(String((e as Error)?.message ?? e)));
  }, [q, gender, blood, dentistId, archived, page]);

  useEffect(load, [load]);
  useEffect(() => {
    api<Dentist[]>('dentists.list').then(setDentists).catch(() => undefined);
  }, []);

  const can = (perm: string) => hasPerm(session?.perms, perm);

  const columns = useMemo<Column<PatientListItem>[]>(
    () => [
      { key: 'code', label: 'Code', render: (r) => <span style={{ fontVariantNumeric: 'tabular-nums', color: 'var(--c-text-2)', fontSize: 'var(--fs-small)' }}>{r.code}</span>, width: 90 },
      {
        key: 'name',
        label: 'Patient',
        render: (r) => (
          <div>
            <div style={{ fontWeight: 650 }}>{r.fullName}</div>
            <div style={{ fontSize: 'var(--fs-caption)', color: 'var(--c-text-3)' }}>{r.phone || '—'}</div>
          </div>
        ),
      },
      { key: 'age', label: 'Age', render: (r) => (r.age != null ? `${r.age} yrs` : '—'), width: 80, align: 'center' },
      { key: 'gender', label: 'Gender', render: (r) => <span style={{ textTransform: 'capitalize' }}>{r.gender || '—'}</span>, width: 90 },
      { key: 'blood', label: 'Blood', render: (r) => (r.bloodGroup ? <Badge tone="info">{r.bloodGroup}</Badge> : '—'), width: 80 },
      { key: 'lastVisit', label: 'Last visit', render: (r) => (r.lastVisitAt ? fmtDate(r.lastVisitAt, ui.dateFormat) : '—'), width: 110 },
      {
        key: 'outstanding',
        label: 'Outstanding',
        align: 'right',
        width: 120,
        render: (r) =>
          r.outstandingPaise > 0 ? (
            <span style={{ color: 'var(--c-danger)', fontWeight: 700 }}>{fmtMoney(r.outstandingPaise, ui.currencySymbol)}</span>
          ) : (
            <span style={{ color: 'var(--c-text-3)' }}>—</span>
          ),
      },
      {
        key: 'status',
        label: 'Status',
        width: 90,
        render: (r) => (r.archived ? <Badge tone="muted">Archived</Badge> : <Badge tone="success">Active</Badge>),
      },
    ],
    [ui],
  );

  return (
    <div style={{ padding: 22, maxWidth: 1280, margin: '0 auto' }}>
      <PageHeader
        title="Patients"
        subtitle={`${data?.total ?? 0} patient${(data?.total ?? 0) === 1 ? '' : 's'} ${archived ? '(archived)' : 'registered'}`}
        actions={
          can('patients.create') ? (
            <Button icon={<Plus size={15} />} onClick={() => setEditing('new')}>
              New patient
            </Button>
          ) : undefined
        }
      />

      <Card style={{ padding: 14, marginBottom: 14 }}>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ position: 'relative', flex: '0 1 320px', minWidth: 200 }}>
            <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--c-text-3)' }} />
            <Input value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} placeholder="Search name, code, phone…" style={{ paddingLeft: 30 }} />
          </div>
          <Select value={gender} onChange={(e) => { setGender(e.target.value); setPage(1); }} style={{ width: 130 }}>
            <option value="">All genders</option>
            {GENDERS.map((g) => (
              <option key={g.key} value={g.key}>{g.label}</option>
            ))}
          </Select>
          <Select value={blood} onChange={(e) => { setBlood(e.target.value); setPage(1); }} style={{ width: 120 }}>
            <option value="">All blood</option>
            {BLOOD_GROUPS.map((b) => (
              <option key={b} value={b}>{b}</option>
            ))}
          </Select>
          <Select value={dentistId} onChange={(e) => { setDentistId(e.target.value); setPage(1); }} style={{ width: 170 }}>
            <option value="">All dentists</option>
            {dentists.map((d) => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </Select>
          <label style={{ display: 'flex', gap: 7, alignItems: 'center', fontSize: 'var(--fs-small)', color: 'var(--c-text-2)', cursor: 'pointer', fontWeight: 500 }}>
            <input type="checkbox" checked={archived} onChange={(e) => { setArchived(e.target.checked); setPage(1); }} style={{ width: 15, height: 15, accentColor: 'var(--c-primary)' }} />
            Show archived
          </label>
          <div style={{ flex: 1 }} />
          <span style={{ fontSize: 'var(--fs-caption)', color: 'var(--c-text-3)' }}>
            {data ? `Page ${page} of ${Math.max(1, Math.ceil(data.total / PAGE_SIZE))}` : ''}
          </span>
        </div>
      </Card>

      <Card style={{ padding: 0 }}>
        {!data ? (
          <div style={{ padding: 30 }}><Loading label="Loading patients…" /></div>
        ) : error ? (
          <div style={{ padding: 30, color: 'var(--c-danger)', fontSize: 'var(--fs-small)' }}>{error}</div>
        ) : (
          <>
            <Table
              columns={columns}
              rows={data.items}
              onRowClick={(r) => navigate(`/patients/${r.id}`)}
              empty={
                <EmptyState
                  icon={<Search size={22} />}
                  title={archived ? 'No archived patients' : 'No patients found'}
                  hint={q || gender || blood || dentistId ? 'Try adjusting your search or filters.' : 'Register your first patient to begin.'}
                  action={can('patients.create') && !archived ? <Button size="sm" icon={<Plus size={14} />} onClick={() => setEditing('new')}>New patient</Button> : undefined}
                />
              }
            />
            <div style={{ padding: '10px 14px' }}>
              <Pagination page={page} pageSize={PAGE_SIZE} total={data.total} onPage={setPage} />
            </div>
          </>
        )}
      </Card>

      {editing && (
        <PatientForm
          patient={editing === 'new' ? null : editing}
          dentists={dentists}
          onClose={() => setEditing(null)}
          onSaved={(p) => {
            setEditing(null);
            load();
            if (editing === 'new') navigate(`/patients/${p.id}`);
          }}
        />
      )}

      {confirm && (
        <ConfirmModal
          title={confirm.kind === 'archive' ? 'Archive patient' : confirm.kind === 'restore' ? 'Restore patient' : 'Permanently delete patient'}
          danger={confirm.kind === 'delete'}
          requirePassword={confirm.kind === 'delete'}
          confirmLabel={confirm.kind === 'archive' ? 'Archive' : confirm.kind === 'restore' ? 'Restore' : 'Delete forever'}
          message={
            confirm.kind === 'archive' ? (
              <>
                Archive <strong>{confirm.patient.fullName}</strong> ({confirm.patient.code})? The record is hidden from normal lists but kept for history. This can be reversed with “Restore”.
              </>
            ) : confirm.kind === 'restore' ? (
              <>
                Restore <strong>{confirm.patient.fullName}</strong> ({confirm.patient.code}) back to active patients?
              </>
            ) : (
              <>
                <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', background: 'var(--c-danger-subtle)', borderRadius: 'var(--r-md)', padding: '10px 12px', marginBottom: 10 }}>
                  <AlertTriangle size={17} style={{ color: 'var(--c-danger)', flexShrink: 0, marginTop: 2 }} />
                  <span>
                    This will permanently erase <strong>{confirm.patient.fullName}</strong> ({confirm.patient.code}) — including visit history, dental chart, prescriptions, invoices and attachments. This cannot be undone.
                  </span>
                </div>
                Type your password to confirm the permanent deletion.
              </>
            )
          }
          busy={busy}
          onClose={() => setConfirm(null)}
          onConfirm={async (password) => {
            setBusy(true);
            try {
              if (confirm.kind === 'archive') {
                await api('patients.archive', { id: confirm.patient.id, reason: 'Archived by ' + (session?.user.displayName ?? 'user') });
                toast('success', 'Patient archived.');
              } else if (confirm.kind === 'restore') {
                await api('patients.restore', { id: confirm.patient.id });
                toast('success', 'Patient restored.');
              } else {
                await api('auth.verifyPassword', { password }).catch(() => undefined);
                await api('patients.hardDelete', { id: confirm.patient.id });
                toast('success', 'Patient permanently deleted.');
              }
              setConfirm(null);
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

function PatientForm({ patient, dentists, onClose, onSaved }: { patient: Patient | null; dentists: Dentist[]; onClose: () => void; onSaved: (p: Patient) => void }) {
  const [form, setForm] = useState<PatientInput>(patient ? { ...EMPTY, ...patient } : { ...EMPTY });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [dup, setDup] = useState<{ code: string; fullName: string } | null>(null);
  const [showMedical, setShowMedical] = useState(false);

  const set = (patch: Partial<PatientInput>) => setForm((f) => ({ ...f, ...patch }));

  const checkDup = async () => {
    if (!form.phone || form.phone.length < 10) return;
    try {
      const r = await api<{ code: string; fullName: string } | null>('patients.duplicateCheck', { phone: form.phone, ignoreId: patient?.id });
      setDup(r);
    } catch {
      setDup(null);
    }
  };

  const save = async () => {
    setErr('');
    if (!form.fullName.trim()) {
      setErr('Patient name is required.');
      return;
    }
    if (!form.phone || !/^01[3-9]\d{8}$/.test(form.phone.replace(/[\s-]/g, ''))) {
      setErr('A valid phone number is required (format: 01XXXXXXXXX).');
      return;
    }
    setBusy(true);
    try {
      const input: PatientInput = {
        ...form,
        phone: form.phone.replace(/[\s-]/g, ''),
        emergencyPhone: form.emergencyPhone ? form.emergencyPhone.replace(/[\s-]/g, '') : '',
        assignedDentistId: form.assignedDentistId ? Number(form.assignedDentistId) : null,
      };
      const p = patient
        ? await api<Patient>('patients.update', { id: patient.id, input })
        : await api<Patient>('patients.create', input);
      onSaved(p);
    } catch (e) {
      setErr(String((e as Error)?.message ?? e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title={patient ? `Edit patient — ${patient.code}` : 'New patient'}
      subtitle={patient ? `${patient.fullName} · registered ${fmtDate(patient.createdAt, 'DD/MM/YYYY')}` : 'Create a permanent patient record. Fields marked * are required.'}
      onClose={onClose}
      width={720}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={save} loading={busy}>{patient ? 'Save changes' : 'Register patient'}</Button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 14 }}>
          <Field label="Full name" required>
            <Input value={form.fullName ?? ''} onChange={(e) => set({ fullName: e.target.value })} autoFocus placeholder="Patient's full name" />
          </Field>
          <Field label="Phone" required>
            <Input value={form.phone ?? ''} onChange={(e) => set({ phone: e.target.value })} onBlur={checkDup} placeholder="01XXXXXXXXX" />
          </Field>
          <Field label="Age">
            <Input type="number" min={0} max={130} value={form.age ?? ''} onChange={(e) => set({ age: e.target.value === '' ? null : Number(e.target.value) })} placeholder="Years" />
          </Field>
        </div>
        {dup && (
          <div style={{ background: 'var(--c-warning-subtle, #fef3c7)', border: '1px solid var(--c-warning)', borderRadius: 'var(--r-md)', padding: '9px 12px', fontSize: 'var(--fs-small)', color: '#92400e', display: 'flex', gap: 8, alignItems: 'center' }}>
            <AlertTriangle size={15} />
            <span>
              A patient with this phone number already exists: <strong>{dup.fullName}</strong> ({dup.code}). You may still continue if this is a different person.
            </span>
          </div>
        )}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 14 }}>
          <Field label="Gender">
            <Select value={form.gender ?? ''} onChange={(e) => set({ gender: e.target.value })}>
              <option value="">—</option>
              {GENDERS.map((g) => (
                <option key={g.key} value={g.key}>{g.label}</option>
              ))}
            </Select>
          </Field>
          <Field label="Blood group">
            <Select value={form.bloodGroup ?? ''} onChange={(e) => set({ bloodGroup: e.target.value })}>
              <option value="">—</option>
              {BLOOD_GROUPS.map((b) => (
                <option key={b} value={b}>{b}</option>
              ))}
            </Select>
          </Field>
          <Field label="Occupation">
            <Input value={form.occupation ?? ''} onChange={(e) => set({ occupation: e.target.value })} />
          </Field>
          <Field label="Preferred language">
            <Input value={form.preferredLanguage ?? ''} onChange={(e) => set({ preferredLanguage: e.target.value })} placeholder="e.g. Bangla" />
          </Field>
        </div>
        <Field label="Address">
          <Input value={form.address ?? ''} onChange={(e) => set({ address: e.target.value })} placeholder="Street, area, city" />
        </Field>
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 14 }}>
          <Field label="Referral source" hint="How this patient found the clinic — self, doctor, friend, social media…">
            <Input value={form.referralSource ?? ''} onChange={(e) => set({ referralSource: e.target.value })} />
          </Field>
          <Field label="Assigned dentist">
            <Select value={form.assignedDentistId ?? ''} onChange={(e) => set({ assignedDentistId: e.target.value ? Number(e.target.value) : null })}>
              <option value="">—</option>
              {dentists.map((d) => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </Select>
          </Field>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14 }}>
          <Field label="Emergency contact name">
            <Input value={form.emergencyContactName ?? ''} onChange={(e) => set({ emergencyContactName: e.target.value })} />
          </Field>
          <Field label="Emergency phone">
            <Input value={form.emergencyPhone ?? ''} onChange={(e) => set({ emergencyPhone: e.target.value })} placeholder="01XXXXXXXXX" />
          </Field>
          <Field label="Relationship">
            <Input value={form.emergencyContactRelationship ?? ''} onChange={(e) => set({ emergencyContactRelationship: e.target.value })} placeholder="e.g. Spouse" />
          </Field>
        </div>

        <button onClick={() => setShowMedical((v) => !v)} style={{ fontSize: 'var(--fs-small)', fontWeight: 700, color: 'var(--c-primary)', background: 'none', padding: 0, textAlign: 'left' }}>
          {showMedical ? '▾ Hide' : '▸ Show'} medical & dental history
        </button>
        {showMedical && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <Field label="Presenting problem">
                <Textarea rows={2} value={form.presentingProblem ?? ''} onChange={(e) => set({ presentingProblem: e.target.value })} />
              </Field>
              <Field label="Allergies">
                <Textarea rows={2} value={form.allergies ?? ''} onChange={(e) => set({ allergies: e.target.value })} placeholder="e.g. Penicillin" />
              </Field>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <Field label="Previous medical history">
                <Textarea rows={3} value={form.previousMedicalHistory ?? ''} onChange={(e) => set({ previousMedicalHistory: e.target.value })} />
              </Field>
              <Field label="Previous dental history">
                <Textarea rows={3} value={form.previousDentalHistory ?? ''} onChange={(e) => set({ previousDentalHistory: e.target.value })} />
              </Field>
            </div>
            <Field label="Current medications">
              <Input value={form.medications ?? ''} onChange={(e) => set({ medications: e.target.value })} />
            </Field>
          </div>
        )}
        <Field label="Notes">
          <Textarea rows={2} value={form.notes ?? ''} onChange={(e) => set({ notes: e.target.value })} />
        </Field>
        {err && <div style={{ color: 'var(--c-danger)', fontSize: 'var(--fs-small)', fontWeight: 500 }}>{err}</div>}
      </div>
    </Modal>
  );
}
