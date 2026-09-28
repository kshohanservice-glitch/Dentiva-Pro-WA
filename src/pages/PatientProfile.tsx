import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft, Plus, Pencil, Archive, Printer, Wallet, FilePlus2, Stethoscope, FlaskConical, Paperclip,
  ArrowLeftRight, History, CheckCircle2, Trash2, Upload, X,
} from 'lucide-react';
import { api, hasPerm } from '../lib/api';
import { useApp } from '../context/AppContext';
import { DentalChart, ChartConditionStrip } from '../components/DentalChart';
import { DocPreview, DocSpec } from '../components/DocPreview';
import {
  Button, Card, Table, Column, Badge, Input, Select, Field, Modal, ConfirmModal, Textarea, Checkbox,
  useToast, toastError, Loading, EmptyState, Tabs,
} from '../components/ui';
import type {
  Patient, Visit, VisitTreatment, Prescription, Invoice, Payment,
  AttachmentRow, Referral, TimelineEvent, Dentist, TreatmentCatalogItem, MedicineCatalogItem,
} from '@shared/types';
import { fmtMoney, toPaise } from '@shared/money';
import { fmtDate, fmtDateTime } from '@shared/date';
import { PAYMENT_METHODS, PAYMENT_METHOD_LABEL, APPOINTMENT_STATUS_LABEL, REFERRAL_STATUSES } from '@shared/constants';

interface P360 {
  patient: Patient;
  stats: {
    visitCount: number;
    invoiceCount: number;
    totalBilledPaise: number;
    totalPaidPaise: number;
    outstandingPaise: number;
    lastVisitAt: string | null;
    nextAppointmentAt: string | null;
  };
  toothStates: Array<{ toothId: number; conditionKey: string; conditionLabel: string; color: string; note: string | null; updatedAt: string }>;
  recentAppointments: Array<{ id: number; code: string; apptDate: string; startTime: string; status: string; dentistName: string | null }>;
}

export function PatientProfile() {
  const { id } = useParams();
  const patientId = Number(id);
  const navigate = useNavigate();
  const { session, ui } = useApp();
  const toast = useToast();
  const [data, setData] = useState<P360 | null>(null);
  const [error, setError] = useState('');
  const [tab, setTab] = useState('overview');
  const [preview, setPreview] = useState<DocSpec | null>(null);
  const [confirm, setConfirm] = useState<'archive' | 'edit' | 'visit' | 'prescription' | 'invoice' | 'payment' | null>(null);
  const [archiveReason, setArchiveReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [numbering, setNumbering] = useState<'fdi' | 'universal'>(ui.numberingSystem);

  const can = (perm: string) => hasPerm(session?.perms, perm);

  const load = useCallback(() => {
    setError('');
    api<P360>('patients.get360', { id: patientId })
      .then(setData)
      .catch((e) => setError(String((e as Error)?.message ?? e)));
  }, [patientId]);

  useEffect(load, [load]);

  if (error) return <div style={{ padding: 24 }}><EmptyState title="Patient not found" hint={error} action={<Button size="sm" onClick={() => navigate('/patients')}>Back to patients</Button>} /></div>;
  if (!data) return <div style={{ padding: 24 }}><Loading label="Loading patient…" /></div>;

  const { patient, stats } = data;
  const p = patient;

  return (
    <div style={{ padding: 22, maxWidth: 1280, margin: '0 auto' }}>
      <button onClick={() => navigate('/patients')} style={{ display: 'flex', gap: 7, alignItems: 'center', fontSize: 'var(--fs-small)', color: 'var(--c-text-2)', fontWeight: 600, marginBottom: 14 }}>
        <ArrowLeft size={15} /> All patients
      </button>

      {/* header */}
      <Card style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-start' }}>
          <div style={{ width: 62, height: 62, borderRadius: 16, background: 'var(--c-primary-subtle)', color: 'var(--c-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, fontWeight: 700, flexShrink: 0 }}>
            {p.fullName.slice(0, 1).toUpperCase()}
          </div>
          <div style={{ flex: 1, minWidth: 260 }}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <h1 style={{ fontSize: 'var(--fs-h1)', fontWeight: 700, letterSpacing: '-0.01em' }}>{p.fullName}</h1>
              <Badge tone="info">{p.code}</Badge>
              {p.archived && <Badge tone="muted">Archived</Badge>}
              {p.allergies && <Badge tone="danger">Allergy: {p.allergies}</Badge>}
            </div>
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginTop: 8, fontSize: 'var(--fs-small)', color: 'var(--c-text-2)' }}>
              {p.age != null && <span><strong style={{ color: 'var(--c-text)' }}>{p.age}</strong> yrs</span>}
              {p.gender && <span style={{ textTransform: 'capitalize' }}>{p.gender}</span>}
              {p.bloodGroup && <span>Blood <strong style={{ color: 'var(--c-text)' }}>{p.bloodGroup}</strong></span>}
              {p.phone && <span>📞 {p.phone}</span>}
              {p.address && <span>📍 {p.address}</span>}
              {p.assignedDentistName && <span>Dentist: <strong style={{ color: 'var(--c-text)' }}>{p.assignedDentistName}</strong></span>}
            </div>
            {tab === 'overview' && (
              <div style={{ marginTop: 10 }}>
                <ChartConditionStrip patientId={patientId} />
              </div>
            )}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(120px, 1fr))', gap: 8, minWidth: 260 }}>
            <MiniStat label="Visits" value={String(stats.visitCount)} />
            <MiniStat label="Outstanding" value={fmtMoney(stats.outstandingPaise, ui.currencySymbol)} tone={stats.outstandingPaise > 0 ? 'danger' : 'default'} />
            <MiniStat label="Total billed" value={fmtMoney(stats.totalBilledPaise, ui.currencySymbol)} />
            <MiniStat label="Last visit" value={stats.lastVisitAt ? fmtDate(stats.lastVisitAt, ui.dateFormat) : '—'} />
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 16, flexWrap: 'wrap' }}>
          {can('clinical.visit.create') && <Button size="sm" icon={<Stethoscope size={14} />} onClick={() => setConfirm('visit')}>New visit</Button>}
          {can('clinical.prescription.create') && <Button size="sm" variant="secondary" icon={<FlaskConical size={14} />} onClick={() => setConfirm('prescription')}>New prescription</Button>}
          {can('billing.invoice.create') && <Button size="sm" variant="secondary" icon={<FilePlus2 size={14} />} onClick={() => setConfirm('invoice')}>New invoice</Button>}
          {can('billing.payment.create') && <Button size="sm" variant="secondary" icon={<Wallet size={14} />} onClick={() => setConfirm('payment')}>Record payment</Button>}
          <Button size="sm" variant="secondary" icon={<Printer size={14} />} onClick={() => setPreview({ channel: 'documents', type: 'patient_summary', id: patientId })}>Print summary</Button>
          {can('patients.edit') && <Button size="sm" variant="ghost" icon={<Pencil size={13} />} onClick={() => setConfirm('edit')}>Edit</Button>}
          {can('patients.archive') && !p.archived && (
            <Button size="sm" variant="ghost" icon={<Archive size={13} />} onClick={() => { setArchiveReason(''); setConfirm('archive'); }}>
              Archive
            </Button>
          )}
          {can('patients.archive') && p.archived && (
            <Button size="sm" variant="ghost" icon={<CheckCircle2 size={13} />} onClick={async () => {
              try {
                await api('patients.restore', { id: patientId });
                toast('success', 'Patient restored.');
                load();
              } catch (e) { toastError(toast, e); }
            }}>
              Restore
            </Button>
          )}
        </div>
      </Card>

      <Tabs
        tabs={[
          { key: 'overview', label: 'Overview' },
          { key: 'chart', label: 'Dental chart' },
          { key: 'visits', label: `Visits (${stats.visitCount})` },
          { key: 'prescriptions', label: 'Prescriptions' },
          { key: 'billing', label: 'Invoices & payments' },
          { key: 'attachments', label: 'Attachments' },
          { key: 'referrals', label: 'Referrals' },
          { key: 'timeline', label: 'Timeline' },
        ]}
        active={tab}
        onChange={setTab}
      />

      {tab === 'overview' && <OverviewTab p={p} recentAppointments={data.recentAppointments} onLoad={load} />}
      {tab === 'chart' && (
        <Card>
          <DentalChart
            patientId={patientId}
            numbering={numbering}
            dentition={p.age != null && p.age < 12 ? 'pediatric' : 'adult'}
            onNumberingChange={setNumbering}
            editable={can('clinical.chart.edit')}
            onSaved={load}
          />
        </Card>
      )}
      {tab === 'visits' && <VisitsTab patientId={patientId} onLoad={load} onNewVisit={() => setConfirm('visit')} canCreate={can('clinical.visit.create')} />}
      {tab === 'prescriptions' && <PrescriptionsTab patientId={patientId} onPreview={setPreview} onNew={() => setConfirm('prescription')} canCreate={can('clinical.prescription.create')} />}
      {tab === 'billing' && <BillingTab patientId={patientId} onPreview={setPreview} onNewInvoice={() => setConfirm('invoice')} onNewPayment={() => setConfirm('payment')} canInvoice={can('billing.invoice.create')} canPay={can('billing.payment.create')} />}
      {tab === 'attachments' && <AttachmentsTab patientId={patientId} canManage={can('clinical.attachments.manage')} />}
      {tab === 'referrals' && <ReferralsTab patientId={patientId} canCreate={can('clinical.visit.create')} canEdit={can('clinical.visit.edit')} />}
      {tab === 'timeline' && <TimelineTab patientId={patientId} />}

      {preview && <DocPreview spec={preview} onClose={() => setPreview(null)} />}

      {confirm === 'visit' && <VisitForm patientId={patientId} patientName={p.fullName} onClose={() => setConfirm(null)} onSaved={() => { setConfirm(null); load(); }} />}
      {confirm === 'prescription' && <PrescriptionForm patientId={patientId} patientName={p.fullName} onClose={() => setConfirm(null)} onSaved={() => { setConfirm(null); load(); }} />}
      {confirm === 'invoice' && <InvoiceForm patientId={patientId} onClose={() => setConfirm(null)} onSaved={() => { setConfirm(null); load(); }} />}
      {confirm === 'payment' && <PaymentForm patientId={patientId} onClose={() => { setConfirm(null); load(); }} />}
      {confirm === 'edit' && <EditPatientModal patient={p} onClose={() => setConfirm(null)} onSaved={() => { setConfirm(null); load(); }} />}

      {confirm === 'archive' && (
        <ConfirmModal
          title="Archive patient"
          confirmLabel="Archive"
          message={
            <>
              Archive <strong>{p.fullName}</strong> ({p.code})? The record is hidden from normal lists but kept for history.
              <div style={{ marginTop: 12 }}>
                <Field label="Reason (recorded in audit log)" required>
                  <Input value={archiveReason} onChange={(e) => setArchiveReason(e.target.value)} placeholder="e.g. Moved to another city" />
                </Field>
              </div>
            </>
          }
          busy={busy}
          onClose={() => setConfirm(null)}
          onConfirm={async () => {
            if (!archiveReason.trim()) {
              toast('warning', 'Please provide an archive reason.');
              return;
            }
            setBusy(true);
            try {
              await api('patients.archive', { id: patientId, reason: archiveReason.trim() });
              toast('success', 'Patient archived.');
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

function MiniStat({ label, value, tone = 'default' }: { label: string; value: string; tone?: 'default' | 'danger' }) {
  return (
    <div style={{ background: 'var(--c-surface-2)', borderRadius: 'var(--r-md)', padding: '8px 12px' }}>
      <div style={{ fontSize: 'var(--fs-caption)', color: 'var(--c-text-3)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
      <div style={{ fontSize: 'var(--fs-body)', fontWeight: 700, color: tone === 'danger' ? 'var(--c-danger)' : 'var(--c-text)', marginTop: 2 }}>{value}</div>
    </div>
  );
}

// ================================================================ OVERVIEW

function OverviewTab({ p, recentAppointments, onLoad }: { p: Patient; recentAppointments: P360['recentAppointments']; onLoad: () => void }) {
  const { ui } = useApp();
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  const addNote = async () => {
    if (!note.trim()) return;
    setBusy(true);
    try {
      await api('patients.history.add', { id: p.id, kind: 'note', entry: note.trim() });
      setNote('');
      toast('success', 'Note added to timeline.');
      onLoad();
    } catch (e) {
      toastError(toast, e);
    } finally {
      setBusy(false);
    }
  };

  const Row = ({ label, value }: { label: string; value: React.ReactNode }) => (
    <div style={{ display: 'flex', gap: 10, padding: '9px 0', borderBottom: '1px solid var(--c-border)', fontSize: 'var(--fs-body)' }}>
      <span style={{ width: 170, flexShrink: 0, color: 'var(--c-text-3)', fontWeight: 600, fontSize: 'var(--fs-small)' }}>{label}</span>
      <span style={{ color: value ? 'var(--c-text)' : 'var(--c-text-3)' }}>{value || '—'}</span>
    </div>
  );

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
      <Card>
        <strong style={{ fontSize: 'var(--fs-body)' }}>Personal & contact</strong>
        <div style={{ marginTop: 8 }}>
          <Row label="Date of birth" value={p.dob ? fmtDate(p.dob, ui.dateFormat) : ''} />
          <Row label="Gender" value={p.gender} />
          <Row label="Blood group" value={p.bloodGroup} />
          <Row label="Occupation" value={p.occupation} />
          <Row label="Preferred language" value={p.preferredLanguage} />
          <Row label="Phone" value={p.phone} />
          <Row label="Address" value={p.address} />
          <Row label="Emergency contact" value={p.emergencyContactName ? `${p.emergencyContactName} (${p.emergencyContactRelationship})` : ''} />
          <Row label="Emergency phone" value={p.emergencyPhone} />
          <Row label="Referral source" value={p.referralSource} />
        </div>
      </Card>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <Card>
          <strong style={{ fontSize: 'var(--fs-body)' }}>Medical & dental history</strong>
          <div style={{ marginTop: 8 }}>
            <Row label="Presenting problem" value={p.presentingProblem} />
            <Row label="Allergies" value={p.allergies} />
            <Row label="Medical history" value={p.previousMedicalHistory} />
            <Row label="Dental history" value={p.previousDentalHistory} />
            <Row label="Current medications" value={p.medications} />
            <Row label="Notes" value={p.notes} />
          </div>
        </Card>
        <Card>
          <strong style={{ fontSize: 'var(--fs-body)' }}>Upcoming / recent appointments</strong>
          {recentAppointments.length === 0 && <div style={{ color: 'var(--c-text-3)', fontSize: 'var(--fs-small)', marginTop: 8 }}>No appointments recorded.</div>}
          <div style={{ marginTop: 8 }}>
            {recentAppointments.map((a) => (
              <div key={a.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 0', borderBottom: '1px solid var(--c-border)', fontSize: 'var(--fs-body)' }}>
                <span>{fmtDate(a.apptDate, ui.dateFormat)} · {a.startTime} {a.dentistName ? `· ${a.dentistName}` : ''}</span>
                <Badge tone={a.status === 'completed' ? 'success' : a.status === 'cancelled' || a.status === 'no_show' ? 'danger' : 'info'}>{APPOINTMENT_STATUS_LABEL[a.status] ?? a.status}</Badge>
              </div>
            ))}
          </div>
        </Card>
        <Card>
          <strong style={{ fontSize: 'var(--fs-body)' }}>Add a timeline note</strong>
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Patient reported sensitivity after RCT…" />
            <Button size="sm" loading={busy} onClick={addNote} disabled={!note.trim()}>Add</Button>
          </div>
        </Card>
      </div>
    </div>
  );
}

// ================================================================ VISITS

function VisitsTab({ patientId, onLoad, onNewVisit, canCreate }: { patientId: number; onLoad: () => void; onNewVisit: () => void; canCreate: boolean }) {
  const { ui, session } = useApp();
  const [data, setData] = useState<{ items: Visit[]; total: number } | null>(null);
  const [open, setOpen] = useState<Visit | null>(null);
  const toast = useToast();

  const load = useCallback(() => {
    api<{ items: Visit[]; total: number }>('visits.list', { patientId })
      .then(setData)
      .catch((e) => toast('error', String((e as Error)?.message ?? e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patientId]);

  useEffect(load, [load]);

  if (!data) return <Loading label="Loading visits…" />;

  const columns: Column<Visit>[] = [
    { key: 'date', label: 'Date', render: (r) => fmtDate(r.visitDate, ui.dateFormat), width: 110 },
    { key: 'complaint', label: 'Chief complaint', render: (r) => (
      <div style={{ maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.chiefComplaint}>{r.chiefComplaint || '—'}</div>
    ) },
    { key: 'diagnosis', label: 'Diagnosis', render: (r) => (
      <div style={{ maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.diagnosis}>{r.diagnosis || '—'}</div>
    ) },
    { key: 'dentist', label: 'Dentist', render: (r) => r.dentistName ?? '—', width: 140 },
    { key: 'status', label: 'Status', width: 120, render: (r) => (r.status === 'completed' ? <Badge tone="success">Completed</Badge> : <Badge tone="warning">In progress</Badge>) },
  ];

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
        {canCreate && <Button size="sm" icon={<Plus size={14} />} onClick={onNewVisit}>New visit</Button>}
      </div>
      <Card style={{ padding: 0 }}>
        <Table columns={columns} rows={data.items} onRowClick={setOpen} empty={<EmptyState icon={<Stethoscope size={22} />} title="No visits yet" hint="Record the first clinical visit for this patient." />} />
      </Card>
      {open && (
        <VisitDetail
          visit={open}
          onClose={() => setOpen(null)}
          onCompleted={() => { setOpen(null); load(); onLoad(); }}
          uiDateFormat={ui.dateFormat}
          canComplete={hasPerm(session?.perms, 'clinical.visit.edit')}
        />
      )}
    </>
  );
}

function VisitDetail({ visit, onClose, onCompleted, uiDateFormat, canComplete }: { visit: Visit; onClose: () => void; onCompleted: () => void; uiDateFormat: string; canComplete: boolean }) {
  const [detail, setDetail] = useState<{ visit: Visit; treatments: VisitTreatment[]; teeth: Array<{ toothId: number; conditionKey: string; conditionLabel: string; color: string; note: string | null }> } | null>(null);
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  const [toothNames, setToothNames] = useState<Record<string, string>>({});

  useEffect(() => {
    api<typeof detail>('visits.get', { id: visit.id }).then(setDetail).catch((e) => toast('error', String((e as Error)?.message ?? e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visit.id]);

  useEffect(() => {
    (async () => {
      const map: Record<string, string> = {};
      const specs: Array<[string, string]> = [
        ['fdi', 'adult'],
        ['fdi', 'pediatric'],
        ['universal', 'adult'],
      ];
      await Promise.all(
        specs.map(([n, d]) =>
          api<{ teeth: Array<{ id: number; name: string }> }>('chart.get', { patientId: visit.patientId, numbering: n, dentition: d })
            .then((r) => r.teeth.forEach((t) => { map[String(t.id)] = t.name; }))
            .catch(() => undefined),
        ),
      );
      setToothNames(map);
    })();
  }, [visit.patientId]);

  const complete = async () => {
    setBusy(true);
    try {
      await api('visits.complete', { id: visit.id });
      toast('success', 'Visit completed.');
      onCompleted();
    } catch (e) {
      toastError(toast, e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title={`Visit — ${fmtDate(visit.visitDate, uiDateFormat)}`}
      subtitle={visit.dentistName ? `Seen by ${visit.dentistName}` : undefined}
      onClose={onClose}
      width={680}
      footer={
        <>
          {canComplete && visit.status !== 'completed' && (
            <Button loading={busy} onClick={complete} icon={<CheckCircle2 size={15} />}>Mark completed</Button>
          )}
          <Button variant="secondary" onClick={onClose}>Close</Button>
        </>
      }
    >
      {!detail ? (
        <Loading label="Loading visit…" />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {([
            ['Chief complaint', visit.chiefComplaint],
            ['History', visit.history],
            ['Examination', visit.examination],
            ['Diagnosis', visit.diagnosis],
            ['Procedure', visit.procedure],
            ['Advice', visit.advice],
            ['Follow-up', visit.followUpDate ? `${fmtDate(visit.followUpDate, uiDateFormat)}${visit.followUpNote ? ` — ${visit.followUpNote}` : ''}` : ''],
            ['Notes', visit.notes],
          ] as Array<[string, string]>).filter(([, v]) => v).map(([label, v]) => (
            <div key={label}>
              <div style={{ fontSize: 'var(--fs-caption)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--c-text-3)', marginBottom: 3 }}>{label}</div>
              <div style={{ fontSize: 'var(--fs-body)', lineHeight: 1.5 }}>{v}</div>
            </div>
          ))}
          {detail.teeth.length > 0 && (
            <div>
              <div style={{ fontSize: 'var(--fs-caption)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--c-text-3)', marginBottom: 6 }}>Teeth marked during this visit</div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {detail.teeth.map((t) => (
                  <span key={t.toothId} style={{ fontSize: 11, fontWeight: 600, padding: '3px 9px', borderRadius: 999, background: `${t.color}22`, color: t.color, border: `1px solid ${t.color}55` }}>
                    {toothNames[String(t.toothId)] ?? `Tooth ${t.toothId}`} · {t.conditionLabel}
                  </span>
                ))}
              </div>
            </div>
          )}
          {detail.treatments.length > 0 && (
            <div>
              <div style={{ fontSize: 'var(--fs-caption)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--c-text-3)', marginBottom: 6 }}>Treatments performed</div>
              {detail.treatments.map((t) => (
                <div key={t.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--c-border)', fontSize: 'var(--fs-body)' }}>
                  <span>{t.name} {t.quantity > 1 ? `× ${t.quantity}` : ''}</span>
                  <span style={{ fontWeight: 650 }}>{fmtMoney(t.pricePaise * t.quantity)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}

// ================================================================ VISIT FORM

function VisitForm({ patientId, patientName, onClose, onSaved }: { patientId: number; patientName: string; onClose: () => void; onSaved: () => void }) {
  const { ui } = useApp();
  const [dentists, setDentists] = useState<Dentist[]>([]);
  const [treatments, setTreatments] = useState<TreatmentCatalogItem[]>([]);
  const [dentistId, setDentistId] = useState('');
  const [visitDate, setVisitDate] = useState(new Date().toISOString().slice(0, 10));
  const [cc, setCc] = useState('');
  const [history, setHistory] = useState('');
  const [examination, setExamination] = useState('');
  const [diagnosis, setDiagnosis] = useState('');
  const [procedure, setProcedure] = useState('');
  const [advice, setAdvice] = useState('');
  const [followUpDate, setFollowUpDate] = useState('');
  const [followUpNote, setFollowUpNote] = useState('');
  const [referralOut, setReferralOut] = useState(false);
  const [notes, setNotes] = useState('');
  const [txns, setTxns] = useState<Array<{ catalogId: number | null; name: string; pricePaise: number; quantity: number; notes: string }>>([]);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<Dentist[]>('dentists.list').then(setDentists).catch(() => undefined);
    api<TreatmentCatalogItem[]>('treatments.list').then(setTreatments).catch(() => undefined);
  }, []);

  const save = async () => {
    setErr('');
    if (!cc.trim() && !diagnosis.trim()) {
      setErr('Provide at least a chief complaint or a diagnosis.');
      return;
    }
    setBusy(true);
    try {
      await api('visits.create', {
        patientId,
        dentistId: dentistId ? Number(dentistId) : null,
        visitDate,
        chiefComplaint: cc,
        history,
        examination,
        diagnosis,
        procedure,
        advice,
        followUpDate: followUpDate || null,
        followUpNote,
        referralOut,
        notes,
        status: 'in_progress',
        treatments: txns,
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
      title={`New visit — ${patientName}`}
      subtitle="Clinical record for this visit. Treatments added here appear on the visit and can be invoiced."
      onClose={onClose}
      width={720}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={save} loading={busy}>Save visit</Button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <Field label="Dentist">
            <Select value={dentistId} onChange={(e) => setDentistId(e.target.value)}>
              <option value="">—</option>
              {dentists.map((d) => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </Select>
          </Field>
          <Field label="Visit date">
            <Input type="date" value={visitDate} onChange={(e) => setVisitDate(e.target.value)} max={new Date().toISOString().slice(0, 10)} />
          </Field>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <Field label="Chief complaint" required>
            <Input value={cc} onChange={(e) => setCc(e.target.value)} placeholder="e.g. Pain in lower right molar" />
          </Field>
          <Field label="Diagnosis">
            <Input value={diagnosis} onChange={(e) => setDiagnosis(e.target.value)} placeholder="e.g. Deep caries 46" />
          </Field>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <Field label="History">
            <Textarea rows={2} value={history} onChange={(e) => setHistory(e.target.value)} />
          </Field>
          <Field label="Examination">
            <Textarea rows={2} value={examination} onChange={(e) => setExamination(e.target.value)} />
          </Field>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <Field label="Procedure performed">
            <Input value={procedure} onChange={(e) => setProcedure(e.target.value)} />
          </Field>
          <Field label="Advice given">
            <Input value={advice} onChange={(e) => setAdvice(e.target.value)} />
          </Field>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <Field label="Follow-up date">
            <Input type="date" value={followUpDate} onChange={(e) => setFollowUpDate(e.target.value)} />
          </Field>
          <Field label="Follow-up note">
            <Input value={followUpNote} onChange={(e) => setFollowUpNote(e.target.value)} />
          </Field>
        </div>
        <Checkbox label="Patient referred out to another specialist" checked={referralOut} onChange={(e) => setReferralOut(e.target.checked)} />

        {/* treatments */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <strong style={{ fontSize: 'var(--fs-small)', color: 'var(--c-text-2)' }}>Treatments (optional)</strong>
            <Select
              value=""
              onChange={(e) => {
                const t = treatments.find((x) => String(x.id) === e.target.value);
                if (t) setTxns((xs) => [...xs, { catalogId: t.id, name: t.name, pricePaise: t.defaultPricePaise, quantity: 1, notes: '' }]);
              }}
              style={{ width: 240 }}
            >
              <option value="">+ Add treatment…</option>
              {treatments.map((t) => (
                <option key={t.id} value={t.id}>{t.name} — {fmtMoney(t.defaultPricePaise, ui.currencySymbol)}</option>
              ))}
            </Select>
          </div>
          {txns.map((t, i) => (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 110px 90px 34px', gap: 8, marginBottom: 8, alignItems: 'center' }}>
              <Input value={t.name} onChange={(e) => setTxns((xs) => xs.map((x, j) => (j === i ? { ...x, name: e.target.value, catalogId: null } : x)))} />
              <Input type="number" min={0} step="0.01" value={(t.pricePaise / 100).toString()} onChange={(e) => setTxns((xs) => xs.map((x, j) => (j === i ? { ...x, pricePaise: toPaise(e.target.value) } : x)))} />
              <Input type="number" min={1} value={t.quantity} onChange={(e) => setTxns((xs) => xs.map((x, j) => (j === i ? { ...x, quantity: Math.max(1, Number(e.target.value) || 1) } : x)))} />
              <IconBtnLike onClick={() => setTxns((xs) => xs.filter((_, j) => j !== i))}>
                <X size={13} />
              </IconBtnLike>
            </div>
          ))}
        </div>
        <Field label="Notes">
          <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
        {err && <div style={{ color: 'var(--c-danger)', fontSize: 'var(--fs-small)', fontWeight: 500 }}>{err}</div>}
      </div>
    </Modal>
  );
}

function IconBtnLike({ children, onClick, title }: { children: React.ReactNode; onClick: () => void; title?: string }) {
  return (
    <button title={title} onClick={onClick} style={{ width: 30, height: 30, borderRadius: 8, border: '1px solid var(--c-border)', background: 'var(--c-surface)', color: 'var(--c-text-3)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      {children}
    </button>
  );
}

// ================================================================ PRESCRIPTIONS

function PrescriptionsTab({ patientId, onPreview, onNew, canCreate }: { patientId: number; onPreview: (s: DocSpec) => void; onNew: () => void; canCreate: boolean }) {
  const { ui } = useApp();
  const [data, setData] = useState<Array<Omit<Prescription, 'items'>> | null>(null);
  const toast = useToast();

  const load = useCallback(() => {
    api<{ items: Array<Omit<Prescription, 'items'>>; total: number }>('prescriptions.list', { patientId })
      .then((r) => setData(r.items))
      .catch((e) => toast('error', String((e as Error)?.message ?? e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patientId]);

  useEffect(load, [load]);

  if (!data) return <Loading label="Loading prescriptions…" />;

  const columns: Column<Omit<Prescription, 'items'>>[] = [
    { key: 'code', label: 'Code', render: (r) => <span style={{ fontVariantNumeric: 'tabular-nums', color: 'var(--c-text-2)' }}>{r.code}</span>, width: 100 },
    { key: 'date', label: 'Date', render: (r) => fmtDate(r.createdAt, ui.dateFormat), width: 110 },
    { key: 'diagnosis', label: 'Diagnosis', render: (r) => (
      <div style={{ maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.diagnosis}>{r.diagnosis || '—'}</div>
    ) },
    { key: 'dentist', label: 'Prescriber', render: (r) => r.dentistName || '—', width: 150 },
    { key: 'status', label: 'Status', width: 100, render: (r) => (r.status === 'active' ? <Badge tone="success">Active</Badge> : <Badge tone="danger">Cancelled</Badge>) },
  ];

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
        {canCreate && <Button size="sm" icon={<Plus size={14} />} onClick={onNew}>New prescription</Button>}
      </div>
      <Card style={{ padding: 0 }}>
        <Table
          columns={columns}
          rows={data}
          onRowClick={(r) => onPreview({ channel: 'documents', type: 'prescription', id: r.id })}
          empty={<EmptyState icon={<FlaskConical size={22} />} title="No prescriptions" hint="Prescriptions created for this patient will appear here." />}
        />
      </Card>
    </>
  );
}

interface RxItemDraft {
  medicineId: number | null;
  name: string;
  genericName: string;
  form: string;
  strength: string;
  dose: string;
  frequency: string;
  morning: boolean;
  noon: boolean;
  night: boolean;
  beforeAfter: string;
  durationDays: number | null;
  quantity: string;
  prn: boolean;
  instruction: string;
}

function PrescriptionForm({ patientId, patientName, onClose, onSaved }: { patientId: number; patientName: string; onClose: () => void; onSaved: () => void }) {
  const [dentists, setDentists] = useState<Dentist[]>([]);
  const [medicines, setMedicines] = useState<MedicineCatalogItem[]>([]);
  const [dentistId, setDentistId] = useState('');
  const [cc, setCc] = useState('');
  const [examination, setExamination] = useState('');
  const [diagnosis, setDiagnosis] = useState('');
  const [advice, setAdvice] = useState('');
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState<RxItemDraft[]>([]);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<Dentist[]>('dentists.list').then(setDentists).catch(() => undefined);
    api<MedicineCatalogItem[]>('medicines.list').then(setMedicines).catch(() => undefined);
  }, []);

  const addMedicine = (m: MedicineCatalogItem | null) => {
    if (!m) return;
    setItems((xs) => [
      ...xs,
      {
        medicineId: m.id, name: m.name, genericName: m.genericName, form: m.form, strength: m.strength,
        dose: '', frequency: m.commonDosage, morning: false, noon: false, night: true, beforeAfter: 'C/C',
        durationDays: null, quantity: '', prn: false, instruction: '',
      },
    ]);
  };

  const setItem = (i: number, patch: Partial<RxItemDraft>) =>
    setItems((xs) => xs.map((x, j) => (j === i ? { ...x, ...patch } : x)));

  const save = async () => {
    setErr('');
    if (!items.length) {
      setErr('Add at least one medicine.');
      return;
    }
    setBusy(true);
    try {
      await api('prescriptions.create', {
        patientId,
        dentistId: dentistId ? Number(dentistId) : null,
        visitId: null,
        chiefComplaint: cc,
        examination,
        diagnosis,
        advice,
        notes,
        items: items.map((x) => ({
          medicineId: x.medicineId === null ? null : Number(x.medicineId),
          name: String(x.name),
          genericName: String(x.genericName || ''),
          form: String(x.form || ''),
          strength: String(x.strength || ''),
          dose: String(x.dose || ''),
          frequency: String(x.frequency || ''),
          morning: !!x.morning,
          noon: !!x.noon,
          night: !!x.night,
          beforeAfter: String(x.beforeAfter || 'C/C'),
          durationDays: x.durationDays === null ? null : Number(x.durationDays),
          quantity: String(x.quantity || ''),
          prn: !!x.prn,
          instruction: String(x.instruction || ''),
        })),
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
      title={`New prescription — ${patientName}`}
      subtitle="Medicines and directions. Print from the list after saving (A4, A5 or thermal)."
      onClose={onClose}
      width={780}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={save} loading={busy}>Save prescription</Button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <Field label="Prescribing dentist">
            <Select value={dentistId} onChange={(e) => setDentistId(e.target.value)}>
              <option value="">—</option>
              {dentists.map((d) => (
                <option key={d.id} value={d.id}>{d.name}{d.designations ? ` — ${d.designations}` : ''}</option>
              ))}
            </Select>
          </Field>
          <Field label="Diagnosis">
            <Input value={diagnosis} onChange={(e) => setDiagnosis(e.target.value)} />
          </Field>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <Field label="Chief complaint">
            <Input value={cc} onChange={(e) => setCc(e.target.value)} />
          </Field>
          <Field label="Examination">
            <Input value={examination} onChange={(e) => setExamination(e.target.value)} />
          </Field>
        </div>
        <Field label="Advice (printed in the left column)">
          <Textarea rows={3} value={advice} onChange={(e) => setAdvice(e.target.value)} placeholder="Diet, hygiene, follow-up instructions…" />
        </Field>

        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <strong style={{ fontSize: 'var(--fs-small)', color: 'var(--c-text-2)' }}>Medicines</strong>
            <Select value="" onChange={(e) => { const m = medicines.find((x) => String(x.id) === e.target.value); addMedicine(m ?? null); }} style={{ width: 260 }}>
              <option value="">+ Add medicine…</option>
              {medicines.map((m) => (
                <option key={m.id} value={m.id}>{m.name}{m.strength ? ` ${m.strength}` : ''} ({m.form})</option>
              ))}
            </Select>
          </div>
          {items.map((x, i) => (
            <div key={i} style={{ border: '1px solid var(--c-border)', borderRadius: 'var(--r-md)', padding: 12, marginBottom: 10, background: 'var(--c-surface-2)' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 90px 110px 34px', gap: 8, marginBottom: 8 }}>
                <Input value={String(x.name)} onChange={(e) => setItem(i, { name: e.target.value, medicineId: null })} placeholder="Medicine name" />
                <Input value={String(x.dose)} onChange={(e) => setItem(i, { dose: e.target.value })} placeholder="Dose (e.g. 1 tab)" />
                <Input value={String(x.frequency)} onChange={(e) => setItem(i, { frequency: e.target.value })} placeholder="Frequency" />
                <IconBtnLike title="Remove" onClick={() => setItems((xs) => xs.filter((_, j) => j !== i))}>
                  <X size={13} />
                </IconBtnLike>
              </div>
              <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'center' }}>
                <Checkbox label="Morning" checked={!!x.morning} onChange={(e) => setItem(i, { morning: e.target.checked })} />
                <Checkbox label="Noon" checked={!!x.noon} onChange={(e) => setItem(i, { noon: e.target.checked })} />
                <Checkbox label="Night" checked={!!x.night} onChange={(e) => setItem(i, { night: e.target.checked })} />
                <Select value={String(x.beforeAfter)} onChange={(e) => setItem(i, { beforeAfter: e.target.value })} style={{ padding: '5px 8px', width: 110 }}>
                  <option value="C/C">C/C (with food)</option>
                  <option value="O/E">O/E (empty stomach)</option>
                  <option value="R/E">R/E (as needed)</option>
                </Select>
                <Input type="number" min={0} value={x.durationDays === null ? '' : String(x.durationDays)} onChange={(e) => setItem(i, { durationDays: e.target.value === '' ? null : Number(e.target.value) })} placeholder="Days" style={{ width: 70 }} />
                <Input value={String(x.quantity)} onChange={(e) => setItem(i, { quantity: e.target.value })} placeholder="Qty" style={{ width: 60 }} />
                <Checkbox label="PRN" checked={!!x.prn} onChange={(e) => setItem(i, { prn: e.target.checked })} />
              </div>
              <Input value={String(x.instruction)} onChange={(e) => setItem(i, { instruction: e.target.value })} placeholder="Additional instruction for this medicine (optional)" style={{ marginTop: 8 }} />
            </div>
          ))}
          {items.length === 0 && <div style={{ color: 'var(--c-text-3)', fontSize: 'var(--fs-small)', padding: '6px 0' }}>No medicines added yet.</div>}
        </div>
        <Field label="Notes">
          <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
        {err && <div style={{ color: 'var(--c-danger)', fontSize: 'var(--fs-small)', fontWeight: 500 }}>{err}</div>}
      </div>
    </Modal>
  );
}

// ================================================================ BILLING

function BillingTab({ patientId, onPreview, onNewInvoice, onNewPayment, canInvoice, canPay }: { patientId: number; onPreview: (s: DocSpec) => void; onNewInvoice: () => void; onNewPayment: () => void; canInvoice: boolean; canPay: boolean }) {
  const { ui } = useApp();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [credit, setCredit] = useState(0);
  const toast = useToast();

  const load = useCallback(() => {
    api<{ items: Invoice[]; total: number }>('invoices.list', { patientId, pageSize: 100 }).then((r) => setInvoices(r.items)).catch((e) => toast('error', String((e as Error)?.message ?? e)));
    api<{ items: Payment[]; total: number }>('payments.list', { patientId, pageSize: 100 }).then((r) => setPayments(r.items)).catch(() => undefined);
    api<{ creditPaise: number }>('payments.credit', { patientId }).then((r) => setCredit(r.creditPaise)).catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patientId]);

  useEffect(load, [load]);

  const invColumns: Column<Invoice>[] = [
    { key: 'number', label: 'Invoice', render: (r) => r.number, width: 150 },
    { key: 'date', label: 'Date', render: (r) => fmtDate(r.invoiceDate, ui.dateFormat), width: 105 },
    { key: 'total', label: 'Total', align: 'right', render: (r) => fmtMoney(r.totalPaise, ui.currencySymbol), width: 110 },
    { key: 'paid', label: 'Paid', align: 'right', render: (r) => fmtMoney(r.paidPaise, ui.currencySymbol), width: 110 },
    { key: 'due', label: 'Due', align: 'right', render: (r) => (r.duePaise > 0 ? <span style={{ color: 'var(--c-danger)', fontWeight: 700 }}>{fmtMoney(r.duePaise, ui.currencySymbol)}</span> : '—'), width: 110 },
    { key: 'status', label: 'Status', width: 100, render: (r) => (
      <Badge tone={r.status === 'paid' ? 'success' : r.status === 'partial' ? 'warning' : r.status === 'void' ? 'muted' : r.status === 'overpaid' ? 'info' : 'danger'}>{r.status.toUpperCase()}</Badge>
    ) },
  ];

  const payColumns: Column<Payment>[] = [
    { key: 'code', label: 'Code', render: (r) => <span style={{ color: 'var(--c-text-2)', fontVariantNumeric: 'tabular-nums' }}>{r.code}</span>, width: 100 },
    { key: 'date', label: 'Date', render: (r) => fmtDate(r.paymentDate, ui.dateFormat), width: 105 },
    { key: 'amount', label: 'Amount', align: 'right', render: (r) => (
      <span style={{ fontWeight: 700, color: r.void ? 'var(--c-text-3)' : 'var(--c-text)', textDecoration: r.void ? 'line-through' : 'none' }}>{fmtMoney(r.amountPaise, ui.currencySymbol)}</span>
    ), width: 110 },
    { key: 'method', label: 'Method', render: (r) => <span style={{ textTransform: 'capitalize' }}>{PAYMENT_METHOD_LABEL[r.method] ?? r.method}</span>, width: 90 },
    { key: 'invoice', label: 'Invoice', render: (r) => r.invoiceNumber ?? (r.method === 'credit' ? 'Credit applied' : 'Advance'), width: 140 },
    { key: 'status', label: '', width: 80, render: (r) => (r.void ? <Badge tone="danger">VOID</Badge> : null) },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <Badge tone="info">Advance credit: {fmtMoney(credit, ui.currencySymbol)}</Badge>
        <div style={{ flex: 1 }} />
        {canPay && <Button size="sm" variant="secondary" icon={<Wallet size={14} />} onClick={onNewPayment}>Record payment</Button>}
        {canInvoice && <Button size="sm" icon={<FilePlus2 size={14} />} onClick={onNewInvoice}>New invoice</Button>}
      </div>
      <Card style={{ padding: 0 }}>
        <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--c-border)' }}><strong style={{ fontSize: 'var(--fs-body)' }}>Invoices</strong></div>
        <Table
          columns={invColumns}
          rows={invoices}
          onRowClick={(r) => onPreview({ channel: 'documents', type: 'invoice', id: r.id })}
          empty={<EmptyState icon={<FilePlus2 size={22} />} title="No invoices" hint="Create an invoice for treatments performed." />}
        />
      </Card>
      <Card style={{ padding: 0 }}>
        <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--c-border)' }}><strong style={{ fontSize: 'var(--fs-body)' }}>Payments</strong></div>
        <Table columns={payColumns} rows={payments} empty={<EmptyState icon={<Wallet size={22} />} title="No payments" hint="Recorded payments will appear here." />} />
      </Card>
    </div>
  );
}

function InvoiceForm({ patientId, onClose, onSaved }: { patientId: number; onClose: () => void; onSaved: () => void }) {
  const { ui } = useApp();
  const [treatments, setTreatments] = useState<TreatmentCatalogItem[]>([]);
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
    if (!items.length) {
      setErr('Add at least one item.');
      return;
    }
    if (items.some((i) => !i.description.trim())) {
      setErr('Every item needs a description.');
      return;
    }
    setBusy(true);
    try {
      await api('invoices.create', {
        patientId,
        visitId: null,
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
        <Field label="Invoice date">
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} max={new Date().toISOString().slice(0, 10)} />
        </Field>
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <strong style={{ fontSize: 'var(--fs-small)', color: 'var(--c-text-2)' }}>Items</strong>
            <Select value="" onChange={(e) => { const t = treatments.find((x) => String(x.id) === e.target.value); if (t) setItems((xs) => [...xs, { description: t.name, catalogId: t.id, quantity: 1, unitPricePaise: t.defaultPricePaise }]); }} style={{ width: 250 }}>
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
              <IconBtnLike title="Remove" onClick={() => setItems((xs) => xs.filter((_, j) => j !== i))}>
                <X size={13} />
              </IconBtnLike>
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
          <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
        {err && <div style={{ color: 'var(--c-danger)', fontSize: 'var(--fs-small)', fontWeight: 500 }}>{err}</div>}
      </div>
    </Modal>
  );
}

function PaymentForm({ patientId, onClose }: { patientId: number; onClose: () => void }) {
  const { ui } = useApp();
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
    api<{ items: Invoice[]; total: number }>('invoices.list', { patientId, pageSize: 100 }).then((r) => {
      setInvoices(r.items);
      const firstUnpaid = r.items.find((i) => i.duePaise > 0);
      if (firstUnpaid) setInvoiceId(String(firstUnpaid.id));
    }).catch(() => undefined);
  }, [patientId]);

  const selected = invoices.find((i) => String(i.id) === invoiceId);

  const save = async () => {
    setErr('');
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
      toast('success', r.creditApplied > 0 ? `Payment recorded — ৳${(r.creditApplied / 100).toLocaleString('en-US')} of saved credit was applied.` : 'Payment recorded.');
      onClose();
    } catch (e) {
      setErr(String((e as Error)?.message ?? e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title="Record payment"
      subtitle="Saved advance/credit is applied first; any real money becomes income automatically."
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
        <Field label="Against invoice" hint={selected ? `${selected.number} — due ${fmtMoney(selected.duePaise, ui.currencySymbol)}` : 'Leave empty to record an advance payment.'}>
          <Select value={invoiceId} onChange={(e) => setInvoiceId(e.target.value)}>
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

// ================================================================ ATTACHMENTS

const ALLOWED_MIME: Record<string, string> = {
  'application/pdf': 'pdf',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'text/plain': 'txt',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
};

function AttachmentsTab({ patientId, canManage }: { patientId: number; canManage: boolean }) {
  const { ui } = useApp();
  const [items, setItems] = useState<AttachmentRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<{ dataUrl: string; name: string } | null>(null);
  const [confirmDel, setConfirmDel] = useState<AttachmentRow | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const toast = useToast();

  const load = useCallback(() => {
    api<AttachmentRow[]>('attachments.list', { patientId }).then(setItems).catch((e) => toast('error', String((e as Error)?.message ?? e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patientId]);

  useEffect(load, [load]);

  const upload = async (f: File | undefined) => {
    if (!f) return;
    const ext = f.name.split('.').pop()?.toLowerCase() ?? '';
    const mime = f.type;
    if (!ALLOWED_MIME[mime] || ALLOWED_MIME[mime] !== ext) {
      toast('error', `File type ".${ext}" is not allowed. Use PDF, JPG, PNG, TXT, DOC or DOCX.`);
      return;
    }
    if (f.size > 15 * 1024 * 1024) {
      toast('error', 'File exceeds the 15 MB limit.');
      return;
    }
    setBusy(true);
    const reader = new FileReader();
    reader.onload = async () => {
      const base64 = String(reader.result).split(',')[1] ?? '';
      try {
        await api('attachments.add', { patientId, originalName: f.name, mimeType: mime, base64 });
        toast('success', 'Attachment uploaded.');
        load();
      } catch (e) {
        toastError(toast, e);
      } finally {
        setBusy(false);
      }
    };
    reader.readAsDataURL(f);
  };

  const open = async (a: AttachmentRow) => {
    try {
      const r = await api<{ dataUrl: string; originalName: string; missing: boolean }>('attachments.get', { id: a.id });
      if (r.missing) toast('error', 'The file is missing from disk.');
      else setPreview({ dataUrl: r.dataUrl, name: r.originalName });
    } catch (e) {
      toastError(toast, e);
    }
  };

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
        {canManage && (
          <>
            <input ref={fileRef} type="file" hidden accept=".pdf,.jpg,.jpeg,.png,.txt,.doc,.docx" onChange={(e) => { upload(e.target.files?.[0]); e.target.value = ''; }} />
            <Button size="sm" icon={<Upload size={14} />} loading={busy} onClick={() => fileRef.current?.click()}>Upload file</Button>
          </>
        )}
      </div>
      <Card style={{ padding: 0 }}>
        <Table
          columns={[
            { key: 'name', label: 'File', render: (r: AttachmentRow) => (
              <div style={{ display: 'flex', gap: 9, alignItems: 'center' }}>
                <Paperclip size={15} style={{ color: 'var(--c-text-3)' }} />
                <div>
                  <div style={{ fontWeight: 600, fontSize: 'var(--fs-body)' }}>{r.originalName}</div>
                  <div style={{ fontSize: 'var(--fs-caption)', color: 'var(--c-text-3)' }}>{(r.sizeBytes / 1024).toFixed(1)} KB{r.missing ? ' · MISSING' : ''}</div>
                </div>
              </div>
            ) },
            { key: 'by', label: 'Added by', render: (r: AttachmentRow) => r.addedBy ?? '—', width: 140 },
            { key: 'date', label: 'Date', render: (r: AttachmentRow) => fmtDate(r.createdAt, ui.dateFormat), width: 110 },
            { key: 'act', label: '', align: 'right', width: 130, render: (r: AttachmentRow) => (
              <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                <Button size="sm" variant="ghost" onClick={() => open(r)}>Open</Button>
                {canManage && (
                  <Button size="sm" variant="ghost" icon={<Trash2 size={13} />} style={{ color: 'var(--c-danger)' }} onClick={() => setConfirmDel(r)}>Delete</Button>
                )}
              </div>
            ) },
          ] as Column<AttachmentRow>[]}
          rows={items}
          empty={<EmptyState icon={<Paperclip size={22} />} title="No attachments" hint="Upload X-rays, lab reports, consent forms (PDF, JPG, PNG, TXT, DOC)." />}
        />
      </Card>
      {preview && (
        <Modal title={preview.name} onClose={() => setPreview(null)} width={760} footer={<Button variant="secondary" onClick={() => setPreview(null)}>Close</Button>}>
          {preview.dataUrl.startsWith('data:image/') ? (
            <img src={preview.dataUrl} alt={preview.name} style={{ width: '100%', borderRadius: 'var(--r-md)' }} />
          ) : preview.dataUrl.startsWith('data:application/pdf') ? (
            <iframe src={preview.dataUrl} title={preview.name} style={{ width: '100%', height: 560, border: '1px solid var(--c-border)', borderRadius: 'var(--r-md)' }} />
          ) : (
            <pre style={{ whiteSpace: 'pre-wrap', fontSize: 'var(--fs-small)', maxHeight: 520, overflowY: 'auto' }}>{atob(preview.dataUrl.split(',')[1] ?? '')}</pre>
          )}
        </Modal>
      )}
      {confirmDel && (
        <ConfirmModal
          title="Delete attachment"
          danger
          confirmLabel="Delete"
          requirePassword
          message={<>Permanently delete <strong>{confirmDel.originalName}</strong>? This cannot be undone.</>}
          busy={busy}
          onClose={() => setConfirmDel(null)}
          onConfirm={async (password) => {
            setBusy(true);
            try {
              await api('auth.verifyPassword', { password: password ?? '' });
              await api('attachments.delete', { id: confirmDel.id });
              toast('success', 'Attachment deleted.');
              setConfirmDel(null);
              load();
            } catch (e) {
              toastError(toast, e);
            } finally {
              setBusy(false);
            }
          }}
        />
      )}
    </>
  );
}

// ================================================================ REFERRALS

function ReferralsTab({ patientId, canCreate, canEdit }: { patientId: number; canCreate: boolean; canEdit: boolean }) {
  const { ui } = useApp();
  const [items, setItems] = useState<Referral[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ direction: 'out', referredToName: '', specialty: '', clinicHospital: '', phone: '', reason: '', followUpNote: '' });
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  const load = useCallback(() => {
    api<Referral[]>('referrals.list', { patientId }).then(setItems).catch((e) => toast('error', String((e as Error)?.message ?? e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patientId]);

  useEffect(load, [load]);

  const save = async () => {
    setBusy(true);
    try {
      await api('referrals.create', { patientId, ...form });
      toast('success', 'Referral recorded.');
      setShowForm(false);
      setForm({ direction: 'out', referredToName: '', specialty: '', clinicHospital: '', phone: '', reason: '', followUpNote: '' });
      load();
    } catch (e) {
      toastError(toast, e);
    } finally {
      setBusy(false);
    }
  };

  const setStatus = async (r: Referral, status: string) => {
    try {
      await api('referrals.updateStatus', { id: r.id, status });
      load();
    } catch (e) {
      toastError(toast, e);
    }
  };

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
        {canCreate && <Button size="sm" icon={<Plus size={14} />} onClick={() => setShowForm((v) => !v)}>Record referral</Button>}
      </div>
      {showForm && (
        <Card style={{ marginBottom: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field label="Direction">
              <Select value={form.direction} onChange={(e) => setForm({ ...form, direction: e.target.value as 'in' | 'out' })}>
                <option value="out">Outgoing (we referred the patient)</option>
                <option value="in">Incoming (someone referred the patient)</option>
              </Select>
            </Field>
            <Field label={form.direction === 'out' ? 'Referred to (doctor/clinic)' : 'Referred by'} required={form.direction === 'out'}>
              <Input value={form.referredToName} onChange={(e) => setForm({ ...form, referredToName: e.target.value })} />
            </Field>
            <Field label="Specialty">
              <Input value={form.specialty} onChange={(e) => setForm({ ...form, specialty: e.target.value })} placeholder="e.g. Oral & Maxillofacial Surgery" />
            </Field>
            <Field label="Clinic / hospital">
              <Input value={form.clinicHospital} onChange={(e) => setForm({ ...form, clinicHospital: e.target.value })} />
            </Field>
            <Field label="Phone">
              <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </Field>
            <Field label="Reason">
              <Input value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} />
            </Field>
            <Field label="Follow-up note">
              <Input value={form.followUpNote} onChange={(e) => setForm({ ...form, followUpNote: e.target.value })} />
            </Field>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 12, justifyContent: 'flex-end' }}>
            <Button size="sm" variant="secondary" onClick={() => setShowForm(false)}>Cancel</Button>
            <Button size="sm" loading={busy} onClick={save}>Save referral</Button>
          </div>
        </Card>
      )}
      <Card style={{ padding: 0 }}>
        <Table
          columns={[
            { key: 'dir', label: 'Direction', width: 100, render: (r: Referral) => (r.direction === 'out' ? <Badge tone="info">Outgoing</Badge> : <Badge tone="primary">Incoming</Badge>) },
            { key: 'to', label: 'With', render: (r) => (
              <div>
                <div style={{ fontWeight: 600, fontSize: 'var(--fs-body)' }}>{r.referredToName || '—'}</div>
                <div style={{ fontSize: 'var(--fs-caption)', color: 'var(--c-text-3)' }}>{[r.specialty, r.clinicHospital].filter(Boolean).join(' · ')}</div>
              </div>
            ) },
            { key: 'date', label: 'Date', render: (r: Referral) => fmtDate(r.referralDate, ui.dateFormat), width: 105 },
            { key: 'reason', label: 'Reason', render: (r: Referral) => (
              <div style={{ maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.reason}>{r.reason || '—'}</div>
            ) },
            { key: 'status', label: 'Status', width: 160, render: (r: Referral) => canEdit ? (
              <Select value={r.status} onChange={(e) => setStatus(r, e.target.value)} style={{ padding: '4px 8px', width: 140 }}>
                {REFERRAL_STATUSES.map((s) => (
                  <option key={s.key} value={s.key}>{s.label}</option>
                ))}
              </Select>
            ) : (
              <Badge tone="muted">{REFERRAL_STATUSES.find((s) => s.key === r.status)?.label ?? r.status}</Badge>
            ) },
          ] as Column<Referral>[]}
          rows={items}
          empty={<EmptyState icon={<ArrowLeftRight size={22} />} title="No referrals" hint="Track incoming and outgoing referrals for this patient." />}
        />
      </Card>
    </>
  );
}

// ================================================================ TIMELINE

function TimelineTab({ patientId }: { patientId: number }) {
  const { ui } = useApp();
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [filter, setFilter] = useState('');
  const toast = useToast();

  const load = useCallback(() => {
    api<TimelineEvent[]>('patients.timeline', { id: patientId, kinds: filter ? [filter] : undefined }).then(setEvents).catch((e) => toast('error', String((e as Error)?.message ?? e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patientId, filter]);

  useEffect(load, [load]);

  const KINDS = ['visit', 'appointment', 'prescription', 'invoice', 'payment', 'referral', 'note', 'attachment', 'chart'];

  return (
    <Card>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
        <button onClick={() => setFilter('')} style={{ padding: '5px 12px', borderRadius: 999, fontSize: 'var(--fs-small)', fontWeight: 600, border: '1px solid ' + (filter === '' ? 'var(--c-primary)' : 'var(--c-border)'), background: filter === '' ? 'var(--c-primary-subtle)' : 'transparent', color: filter === '' ? 'var(--c-primary)' : 'var(--c-text-2)' }}>
          All
        </button>
        {KINDS.map((k) => (
          <button key={k} onClick={() => setFilter(k)} style={{ padding: '5px 12px', borderRadius: 999, fontSize: 'var(--fs-small)', fontWeight: 600, border: '1px solid ' + (filter === k ? 'var(--c-primary)' : 'var(--c-border)'), background: filter === k ? 'var(--c-primary-subtle)' : 'transparent', color: filter === k ? 'var(--c-primary)' : 'var(--c-text-2)', textTransform: 'capitalize' }}>
            {k}
          </button>
        ))}
      </div>
      {events.length === 0 && <EmptyState icon={<History size={22} />} title="Nothing recorded yet" />}
      <div style={{ position: 'relative', paddingLeft: 22 }}>
        <div style={{ position: 'absolute', left: 7, top: 6, bottom: 6, width: 2, background: 'var(--c-border)' }} />
        {events.map((e) => (
          <div key={e.id} style={{ position: 'relative', padding: '10px 0 14px' }}>
            <span style={{ position: 'absolute', left: -21, top: 14, width: 12, height: 12, borderRadius: 999, background: 'var(--c-primary)', border: '2.5px solid var(--c-surface)' }} />
            <div style={{ display: 'flex', gap: 10, alignItems: 'baseline', flexWrap: 'wrap' }}>
              <strong style={{ fontSize: 'var(--fs-body)' }}>{e.title}</strong>
              <span style={{ fontSize: 'var(--fs-caption)', color: 'var(--c-text-3)' }}>{fmtDateTime(e.timestamp, ui.dateFormat, ui.timeFormat === '24h')}</span>
              <Badge tone="muted">{e.kind}</Badge>
            </div>
            {e.detail && <div style={{ fontSize: 'var(--fs-small)', color: 'var(--c-text-2)', marginTop: 3 }}>{e.detail}</div>}
          </div>
        ))}
      </div>
    </Card>
  );
}

// ================================================================ EDIT PATIENT

function EditPatientModal({ patient, onClose, onSaved }: { patient: Patient; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({
    fullName: patient.fullName, age: patient.age ?? '', dob: patient.dob ?? '', gender: patient.gender, bloodGroup: patient.bloodGroup,
    address: patient.address, phone: patient.phone, emergencyPhone: patient.emergencyPhone, emergencyContactName: patient.emergencyContactName,
    emergencyContactRelationship: patient.emergencyContactRelationship, occupation: patient.occupation, preferredLanguage: patient.preferredLanguage,
    referralSource: patient.referralSource, presentingProblem: patient.presentingProblem, previousMedicalHistory: patient.previousMedicalHistory,
    previousDentalHistory: patient.previousDentalHistory, allergies: patient.allergies, medications: patient.medications, notes: patient.notes,
  });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const save = async () => {
    setErr('');
    setBusy(true);
    try {
      await api('patients.update', {
        id: patient.id,
        input: {
          fullName: form.fullName,
          age: form.age === '' ? null : Number(form.age),
          dob: form.dob || null,
          gender: form.gender, bloodGroup: form.bloodGroup, address: form.address, phone: form.phone,
          emergencyPhone: form.emergencyPhone, emergencyContactName: form.emergencyContactName, emergencyContactRelationship: form.emergencyContactRelationship,
          occupation: form.occupation, preferredLanguage: form.preferredLanguage, referralSource: form.referralSource,
          presentingProblem: form.presentingProblem, previousMedicalHistory: form.previousMedicalHistory, previousDentalHistory: form.previousDentalHistory,
          allergies: form.allergies, medications: form.medications, notes: form.notes,
        },
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
      title={`Edit patient — ${patient.code}`}
      onClose={onClose}
      width={640}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={save} loading={busy}>Save changes</Button>
        </>
      }
    >
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <Field label="Full name" required>
          <Input value={form.fullName} onChange={(e) => set('fullName', e.target.value)} />
        </Field>
        <Field label="Phone">
          <Input value={form.phone} onChange={(e) => set('phone', e.target.value)} />
        </Field>
        <Field label="Age">
          <Input type="number" min={0} max={130} value={form.age} onChange={(e) => set('age', e.target.value)} />
        </Field>
        <Field label="Date of birth">
          <Input type="date" value={form.dob} onChange={(e) => set('dob', e.target.value)} />
        </Field>
        <Field label="Gender">
          <Select value={form.gender} onChange={(e) => set('gender', e.target.value)}>
            <option value="">—</option>
            <option value="male">Male</option>
            <option value="female">Female</option>
            <option value="other">Other</option>
          </Select>
        </Field>
        <Field label="Blood group">
          <Select value={form.bloodGroup} onChange={(e) => set('bloodGroup', e.target.value)}>
            <option value="">—</option>
            {['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'].map((b) => (
              <option key={b} value={b}>{b}</option>
            ))}
          </Select>
        </Field>
        <div style={{ gridColumn: '1 / -1' }}>
          <Field label="Address">
            <Input value={form.address} onChange={(e) => set('address', e.target.value)} />
          </Field>
        </div>
        <Field label="Emergency contact">
          <Input value={form.emergencyContactName} onChange={(e) => set('emergencyContactName', e.target.value)} />
        </Field>
        <Field label="Emergency phone">
          <Input value={form.emergencyPhone} onChange={(e) => set('emergencyPhone', e.target.value)} />
        </Field>
        <Field label="Occupation">
          <Input value={form.occupation} onChange={(e) => set('occupation', e.target.value)} />
        </Field>
        <Field label="Allergies">
          <Input value={form.allergies} onChange={(e) => set('allergies', e.target.value)} />
        </Field>
        <div style={{ gridColumn: '1 / -1' }}>
          <Field label="Medical history">
            <Textarea rows={2} value={form.previousMedicalHistory} onChange={(e) => set('previousMedicalHistory', e.target.value)} />
          </Field>
        </div>
        <div style={{ gridColumn: '1 / -1' }}>
          <Field label="Dental history">
            <Textarea rows={2} value={form.previousDentalHistory} onChange={(e) => set('previousDentalHistory', e.target.value)} />
          </Field>
        </div>
        {err && <div style={{ gridColumn: '1 / -1', color: 'var(--c-danger)', fontSize: 'var(--fs-small)', fontWeight: 500 }}>{err}</div>}
      </div>
    </Modal>
  );
}
