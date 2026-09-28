import type { Core, Actor } from '../core';
import { ApiError } from './errors';
import { nowIso, isoToLocalDate } from '../../shared/date';
import type { PatientInput } from '../../shared/types';
import { isValidPhone } from '../security';
import type { Patient, PatientListItem, TimelineEvent } from '../../shared/types';

export interface PatientFilter {
  q?: string;
  dateRange?: 'today' | '7d' | '30d' | '90d' | 'year' | 'all' | 'custom';
  from?: string;
  to?: string;
  gender?: string;
  bloodGroup?: string;
  dentistId?: number;
  archived?: boolean;
  page?: number;
  pageSize?: number;
}

interface PatientRow {
  id: number;
  code: string;
  full_name: string;
  age: number | null;
  dob: string | null;
  gender: string;
  blood_group: string;
  address: string;
  phone: string;
  emergency_phone: string;
  emergency_contact_name: string;
  emergency_contact_relationship: string;
  occupation: string;
  preferred_language: string;
  referral_source: string;
  presenting_problem: string;
  previous_medical_history: string;
  previous_dental_history: string;
  allergies: string;
  medications: string;
  medical_history: string;
  dental_history: string;
  notes: string;
  assigned_dentist_id: number | null;
  created_by: number | null;
  archived: number;
  archived_reason: string | null;
  created_at: string;
  updated_at: string;
  dentist_name: string | null;
  last_visit_at: string | null;
  invoice_count: number;
  outstanding: number;
}

const rowToPatient = (r: PatientRow): Patient => ({
  id: r.id,
  code: r.code,
  fullName: r.full_name,
  age: r.age,
  dob: r.dob,
  gender: r.gender,
  bloodGroup: r.blood_group,
  address: r.address,
  phone: r.phone,
  emergencyPhone: r.emergency_phone,
  emergencyContactName: r.emergency_contact_name,
  emergencyContactRelationship: r.emergency_contact_relationship,
  occupation: r.occupation,
  preferredLanguage: r.preferred_language,
  referralSource: r.referral_source,
  presentingProblem: r.presenting_problem,
  previousMedicalHistory: r.previous_medical_history,
  previousDentalHistory: r.previous_dental_history,
  allergies: r.allergies,
  medications: r.medications,
  medicalHistory: r.medical_history,
  dentalHistory: r.dental_history,
  notes: r.notes,
  assignedDentistId: r.assigned_dentist_id,
  assignedDentistName: r.dentist_name,
  archived: !!r.archived,
  archivedReason: r.archived_reason,
  createdBy: r.created_by,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

const LIST_SELECT = `
  SELECT p.*, d.name AS dentist_name,
    (SELECT MAX(v.visit_date) FROM visits v WHERE v.patient_id = p.id) AS last_visit_at,
    (SELECT COUNT(*) FROM invoices i WHERE i.patient_id = p.id AND i.status != 'void') AS invoice_count,
    (SELECT COALESCE(SUM(i.total - i.paid), 0) FROM invoices i WHERE i.patient_id = p.id AND i.status NOT IN ('void','paid','overpaid')) AS outstanding
  FROM patients p
  LEFT JOIN dentists d ON d.id = p.assigned_dentist_id
`;

export function listPatients(core: Core, f: PatientFilter): { items: PatientListItem[]; total: number; page: number; pageSize: number } {
  const where: string[] = [];
  const params: unknown[] = [];
  if (f.q) {
    where.push('(p.full_name LIKE ? OR p.code LIKE ? OR p.phone LIKE ? OR p.emergency_phone LIKE ? OR p.address LIKE ?)');
    const q = `%${f.q}%`;
    params.push(q, q, q, q, q);
  }
  if (f.gender) {
    where.push('p.gender = ?');
    params.push(f.gender);
  }
  if (f.bloodGroup) {
    where.push('p.blood_group = ?');
    params.push(f.bloodGroup);
  }
  if (f.dentistId) {
    where.push('p.assigned_dentist_id = ?');
    params.push(f.dentistId);
  }
  const archived = f.archived ?? false;
  where.push(archived ? 'p.archived = 1' : 'p.archived = 0');

  // registration-date filters (default: newest first over all time)
  const today = new Date();
  const iso = (d: Date) => d.toISOString();
  if (f.dateRange === 'today') where.push(`date(p.created_at) = date('${today.toISOString().slice(0, 10)}')`);
  else if (f.dateRange === '7d') where.push(`p.created_at >= ${JSON.stringify(iso(new Date(today.getTime() - 7 * 86400000)))}`);
  else if (f.dateRange === '30d') where.push(`p.created_at >= ${JSON.stringify(iso(new Date(today.getTime() - 30 * 86400000)))}`);
  else if (f.dateRange === '90d') where.push(`p.created_at >= ${JSON.stringify(iso(new Date(today.getTime() - 90 * 86400000)))}`);
  else if (f.dateRange === 'year') where.push(`p.created_at >= ${JSON.stringify(iso(new Date(today.getFullYear(), 0, 1)))}`);
  else if (f.dateRange === 'custom') {
    if (f.from) {
      where.push('p.created_at >= ?');
      params.push(f.from + 'T00:00:00.000Z');
    }
    if (f.to) {
      where.push('p.created_at <= ?');
      params.push(f.to + 'T23:59:59.999Z');
    }
  }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const total = (core.db
    .prepare(`SELECT COUNT(*) AS c FROM patients p LEFT JOIN dentists d ON d.id = p.assigned_dentist_id ${whereSql}`)
    .get(...params) as { c: number }).c;

  const page = Math.max(1, f.page ?? 1);
  const pageSize = Math.min(200, Math.max(1, f.pageSize ?? 50));
  const rows = core.db
    .prepare(`${LIST_SELECT} ${whereSql} ORDER BY p.created_at DESC, p.id DESC LIMIT ? OFFSET ?`)
    .all(...params, pageSize, (page - 1) * pageSize) as PatientRow[];

  return {
    items: rows.map((r) => ({ ...rowToPatient(r), lastVisitAt: r.last_visit_at, invoiceCount: r.invoice_count, outstandingPaise: r.outstanding })),
    total,
    page,
    pageSize,
  };
}

export type { PatientInput } from '../../shared/types';

function validatePatientInput(core: Core, i: PatientInput, isEdit: boolean, ignoreId?: number): void {
  if (!i.fullName || !i.fullName.trim()) throw ApiError.validation('Patient name is required.');
  if (i.fullName.trim().length > 120) throw ApiError.validation('Patient name is too long.');
  if (i.phone && !isValidPhone(i.phone)) throw ApiError.validation('The phone number looks invalid. Use the format 01XXXXXXXXX.');
  if (i.emergencyPhone && !isValidPhone(i.emergencyPhone)) throw ApiError.validation('The emergency phone number looks invalid.');
  if (i.age !== undefined && i.age !== null && (i.age < 0 || i.age > 130)) {
    throw ApiError.validation('Age must be between 0 and 130.');
  }
  if (i.dob && !/^\d{4}-\d{2}-\d{2}$/.test(i.dob)) throw ApiError.validation('Invalid date of birth.');
  if (!isEdit && i.phone) {
    const dup = duplicatePhoneCheck(core, i.phone, ignoreId);
    if (dup) throw ApiError.duplicate(`A patient with this phone number already exists (${dup.code} — ${dup.fullName}).`);
  }
}

function duplicatePhoneCheckCore(c: Core, phone: string, ignoreId?: number): { code: string; fullName: string } | null {
  const row = c.db
    .prepare('SELECT code, full_name FROM patients WHERE phone = ? COLLATE NOCASE AND id != ? AND archived = 0')
    .get(phone.trim(), ignoreId ?? -1) as { code: string; full_name: string } | undefined;
  return row ? { code: row.code, fullName: row.full_name } : null;
}

export function duplicatePhoneCheck(core: Core, phone: string, ignoreId?: number): { code: string; fullName: string } | null {
  return duplicatePhoneCheckCore(core, phone, ignoreId);
}

export function createPatient(core: Core, actor: Actor, input: PatientInput): Patient {
  validatePatientInput(core, input, false);
  const now = nowIso();
  const id = core.tx(() => {
    const code = core.nextCode('patients', 'PAT-');
    const r = core.db
      .prepare(
        `INSERT INTO patients (code, full_name, age, dob, gender, blood_group, address, phone, emergency_phone,
          emergency_contact_name, emergency_contact_relationship, occupation, preferred_language, referral_source,
          presenting_problem, previous_medical_history, previous_dental_history, allergies, medications,
          medical_history, dental_history, notes, assigned_dentist_id, created_by, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        code,
        input.fullName.trim(),
        input.age ?? null,
        input.dob ?? null,
        input.gender ?? '',
        input.bloodGroup ?? '',
        input.address ?? '',
        (input.phone ?? '').trim(),
        (input.emergencyPhone ?? '').trim(),
        input.emergencyContactName ?? '',
        input.emergencyContactRelationship ?? '',
        input.occupation ?? '',
        input.preferredLanguage ?? 'en',
        input.referralSource ?? '',
        input.presentingProblem ?? '',
        input.previousMedicalHistory ?? '',
        input.previousDentalHistory ?? '',
        input.allergies ?? '',
        input.medications ?? '',
        input.medicalHistory ?? '',
        input.dentalHistory ?? '',
        input.notes ?? '',
        input.assignedDentistId ?? null,
        actor.userId,
        now,
        now,
      );
    return Number(r.lastInsertRowid);
  });
  const patient = getPatient(core, id)!;
  core.audit('patient.created', 'patient', patient.code, { name: patient.fullName }, actor);
  core.notify('info', 'patients', `New patient registered: ${patient.fullName}`, patient.code, `/patients/${id}`);
  return patient;
}

export function updatePatient(core: Core, actor: Actor, id: number, input: PatientInput): Patient {
  const existing = getPatient(core, id);
  if (!existing) throw ApiError.notFound('patient', id);
  validatePatientInput(core, input, true, id);
  const now = nowIso();
  core.tx(() => {
    core.db
      .prepare(
        `UPDATE patients SET full_name = ?, age = ?, dob = ?, gender = ?, blood_group = ?, address = ?, phone = ?,
          emergency_phone = ?, emergency_contact_name = ?, emergency_contact_relationship = ?, occupation = ?,
          preferred_language = ?, referral_source = ?, presenting_problem = ?, previous_medical_history = ?,
          previous_dental_history = ?, allergies = ?, medications = ?, medical_history = ?, dental_history = ?,
          notes = ?, assigned_dentist_id = ?, updated_at = ?
         WHERE id = ?`,
      )
      .run(
        input.fullName.trim(),
        input.age ?? null,
        input.dob ?? null,
        input.gender ?? '',
        input.bloodGroup ?? '',
        input.address ?? '',
        (input.phone ?? '').trim(),
        (input.emergencyPhone ?? '').trim(),
        input.emergencyContactName ?? '',
        input.emergencyContactRelationship ?? '',
        input.occupation ?? '',
        input.preferredLanguage ?? 'en',
        input.referralSource ?? '',
        input.presentingProblem ?? '',
        input.previousMedicalHistory ?? '',
        input.previousDentalHistory ?? '',
        input.allergies ?? '',
        input.medications ?? '',
        input.medicalHistory ?? '',
        input.dentalHistory ?? '',
        input.notes ?? '',
        input.assignedDentistId ?? null,
        now,
        id,
      );
  });
  const changed: Record<string, string> = {};
  for (const k of ['fullName', 'phone', 'address', 'gender', 'bloodGroup', 'age'] as const) {
    if (String(existing[k] ?? '') !== String(input[k] ?? '')) changed[k] = `${existing[k]} → ${input[k]}`;
  }
  core.audit('patient.edited', 'patient', existing.code, changed, actor);
  return getPatient(core, id)!;
}

export function archivePatient(core: Core, actor: Actor, id: number, reason: string): void {
  const p = getPatient(core, id);
  if (!p) throw ApiError.notFound('patient', id);
  if (p.archived) throw ApiError.state('Patient is already archived.');
  core.tx(() => {
    core.db.prepare('UPDATE patients SET archived = 1, archived_reason = ?, updated_at = ? WHERE id = ?').run(reason, nowIso(), id);
  });
  core.audit('patient.archived', 'patient', p.code, { reason }, actor);
}

export function restorePatient(core: Core, actor: Actor, id: number): void {
  const p = getPatient(core, id);
  if (!p) throw ApiError.notFound('patient', id);
  core.tx(() => {
    core.db.prepare('UPDATE patients SET archived = 0, archived_reason = NULL, updated_at = ? WHERE id = ?').run(nowIso(), id);
  });
  core.audit('patient.restored', 'patient', p.code, null, actor);
}

/** Hard delete — destructive; permission + re-auth enforced at IPC layer. */
export function hardDeletePatient(core: Core, actor: Actor, id: number): void {
  const p = getPatient(core, id);
  if (!p) throw ApiError.notFound('patient', id);
  core.tx(() => {
    core.db.prepare('DELETE FROM patient_history WHERE patient_id = ?').run(id);
    core.db.prepare('DELETE FROM patient_tooth_state WHERE patient_id = ?').run(id);
    // visits cascade → tooth conditions & treatments cascade with them
    core.db.prepare('DELETE FROM visits WHERE patient_id = ?').run(id);
    core.db.prepare('DELETE FROM prescriptions WHERE patient_id = ?').run(id);
    core.db.prepare('DELETE FROM referrals WHERE patient_id = ?').run(id);
    core.db.prepare('DELETE FROM appointments WHERE patient_id = ?').run(id);
    core.db.prepare('DELETE FROM queue_entries WHERE patient_id = ?').run(id);
    core.db.prepare('DELETE FROM invoices WHERE patient_id = ?').run(id);
    core.db.prepare('DELETE FROM payments WHERE patient_id = ?').run(id);
    core.db.prepare('DELETE FROM attachments WHERE patient_id = ?').run(id);
    core.db.prepare('DELETE FROM patients WHERE id = ?').run(id);
  });
  core.audit('patient.hard_deleted', 'patient', p.code, { name: p.fullName, permanent: true }, actor);
  core.notify('critical', 'security', 'Patient record permanently deleted', `${p.fullName} (${p.code}) was permanently deleted by ${actor.username ?? 'unknown'}.`);
}

export function getPatient(core: Core, id: number): Patient | null {
  const row = core.db
    .prepare(`${LIST_SELECT} WHERE p.id = ?`)
    .get(id) as PatientRow | undefined;
  if (!row) return null;
  return rowToPatient(row);
}

export interface Patient360 {
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

export function getPatient360(core: Core, id: number): Patient360 {
  const patient = getPatient(core, id);
  if (!patient) throw ApiError.notFound('patient', id);
  const db = core.db;
  const stats = db
    .prepare(
      `SELECT
        (SELECT COUNT(*) FROM visits WHERE patient_id = ?) AS visitCount,
        (SELECT COUNT(*) FROM invoices WHERE patient_id = ? AND status != 'void') AS invoiceCount,
        (SELECT COALESCE(SUM(total), 0) FROM invoices WHERE patient_id = ? AND status != 'void') AS totalBilledPaise,
        (SELECT COALESCE(SUM(paid), 0) FROM invoices WHERE patient_id = ? AND status != 'void') AS totalPaidPaise,
        (SELECT COALESCE(SUM(total - paid), 0) FROM invoices WHERE patient_id = ? AND status NOT IN ('void', 'paid', 'overpaid')) AS outstandingPaise,
        (SELECT MAX(visit_date) FROM visits WHERE patient_id = ?) AS lastVisitAt,
        (SELECT MIN(appt_date || ' ' || start_time) FROM appointments WHERE patient_id = ? AND appt_date >= ? AND status IN ('scheduled','confirmed','arrived','waiting','rescheduled')) AS nextAppointmentAt`,
    )
    .get(id, id, id, id, id, id, id, isoToLocalDate(new Date())) as {
    visitCount: number;
    invoiceCount: number;
    totalBilledPaise: number;
    totalPaidPaise: number;
    outstandingPaise: number;
    lastVisitAt: string | null;
    nextAppointmentAt: string | null;
  };

  const toothStates = (
    db.prepare(
      `SELECT ts.tooth_id AS toothId, ts.condition_key AS conditionKey, ts.note, ts.updated_at AS updatedAt,
              c.label AS conditionLabel, c.color
       FROM patient_tooth_state ts JOIN tooth_condition_types c ON c.key = ts.condition_key
       WHERE ts.patient_id = ? ORDER BY ts.tooth_id`,
    )
      .all(id) as Array<{ toothId: number; conditionKey: string; conditionLabel: string; color: string; note: string | null; updatedAt: string }>
  );

  const recentAppointments = (
    db.prepare(
      `SELECT a.id, a.code, a.appt_date AS apptDate, a.start_time AS startTime, a.status, d.name AS dentistName
       FROM appointments a LEFT JOIN dentists d ON d.id = a.dentist_id
       WHERE a.patient_id = ? ORDER BY a.appt_date DESC, a.start_time DESC LIMIT 8`,
    )
      .all(id) as Array<{ id: number; code: string; apptDate: string; startTime: string; status: string; dentistName: string | null }>
  );

  return { patient, stats: { ...stats, nextAppointmentAt: stats.nextAppointmentAt ?? null }, toothStates, recentAppointments };
}

/** Chronological clinical timeline (newest first), filterable by kind. */
export function getTimeline(core: Core, patientId: number, kinds?: string[]): TimelineEvent[] {
  const db = core.db;
  const out: TimelineEvent[] = [];
  const push = (id: number, kind: string, title: string, detail: string, ts: string, meta: string | null) =>
    out.push({ id, kind, title, detail, timestamp: ts, meta });

  push(0, 'registration', 'Patient registered', `Registered on ${isoToLocalDate(patientCreated(core, patientId))}`, patientCreated(core, patientId), null);

  for (const v of db.prepare('SELECT * FROM visits WHERE patient_id = ? ORDER BY visit_date DESC').all(patientId) as Array<Record<string, unknown>>) {
    const vid = v.id as number;
    push(vid, 'visit', 'Visit', v.chief_complaint ? `C/C: ${String(v.chief_complaint).slice(0, 120)}` : 'Visit recorded', v.visit_date as string, v.diagnosis ? `Dx: ${String(v.diagnosis)}` : null);
    const trts = db.prepare('SELECT name, quantity FROM visit_treatments WHERE visit_id = ?').all(vid) as Array<{ name: string; quantity: number }>;
    if (trts.length) push(vid + 0.1, 'treatment', 'Treatments performed', trts.map((t) => `${t.name} ×${t.quantity}`).join(', '), (v.visit_date as string), null);
    const rx = db.prepare('SELECT code FROM prescriptions WHERE visit_id = ?').all(vid) as Array<{ code: string }>;
    if (rx.length) push(vid + 0.2, 'prescription', 'Prescription issued', rx.map((r) => r.code).join(', '), (v.visit_date as string), null);
  }
  for (const r of db.prepare('SELECT * FROM referrals WHERE patient_id = ? ORDER BY referral_date DESC').all(patientId) as Array<Record<string, unknown>>) {
    push(r.id as number, 'referral', r.direction === 'in' ? 'Referred to this clinic' : 'Referred out', String(r.referred_to_name || r.reason || ''), r.referral_date as string, String(r.clinic_hospital || ''));
  }
  for (const a of db.prepare('SELECT * FROM appointments WHERE patient_id = ? ORDER BY appt_date DESC LIMIT 20').all(patientId) as Array<Record<string, unknown>>) {
    push(a.id as number, 'appointment', `Appointment (${a.status})`, String(a.reason || a.type || ''), `${a.appt_date}T${a.start_time}:00`, null);
  }
  for (const i of db.prepare('SELECT * FROM invoices WHERE patient_id = ? AND status != \'void\' ORDER BY invoice_date DESC LIMIT 20').all(patientId) as Array<Record<string, unknown>>) {
    push(i.id as number, 'invoice', `Invoice ${i.number}`, `Total ${i.total} — ${i.status}`, i.invoice_date as string, null);
  }
  for (const p of db.prepare('SELECT * FROM payments WHERE patient_id = ? AND void = 0 ORDER BY payment_date DESC LIMIT 20').all(patientId) as Array<Record<string, unknown>>) {
    push(p.id as number, 'payment', 'Payment received', `Method: ${p.method} — ${p.amount} paisa`, p.payment_date as string, p.reference ? `Ref: ${p.reference}` : null);
  }
  for (const h of db.prepare('SELECT * FROM patient_history WHERE patient_id = ? ORDER BY created_at DESC LIMIT 50').all(patientId) as Array<Record<string, unknown>>) {
    push(h.id as number, String(h.kind) as string, historyTitle(String(h.kind)), String(h.entry), h.created_at as string, null);
  }
  for (const a of db.prepare('SELECT * FROM attachments WHERE patient_id = ? ORDER BY created_at DESC').all(patientId) as Array<Record<string, unknown>>) {
    push(a.id as number, 'attachment', `Attachment: ${a.original_name}`, '', a.created_at as string, null);
  }

  if (kinds && kinds.length) {
    const set = new Set(kinds);
    return out.filter((e) => set.has(e.kind)).sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1));
  }
  return out.sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1));
}

function historyTitle(kind: string): string {
  switch (kind) {
    case 'medical':
      return 'Medical history entry';
    case 'dental':
      return 'Dental history entry';
    case 'medication':
      return 'Medication record';
    case 'allergy':
      return 'Allergy record';
    default:
      return 'History entry';
  }
}

function patientCreated(core: Core, patientId: number): string {
  const row = core.db.prepare('SELECT created_at FROM patients WHERE id = ?').get(patientId) as { created_at: string };
  return row.created_at;
}

export function addHistoryEntry(core: Core, actor: Actor, patientId: number, kind: string, entry: string): void {
  if (!['medical', 'dental', 'medication', 'allergy'].includes(kind)) throw ApiError.validation('Invalid history type.');
  if (!entry.trim()) throw ApiError.validation('The history entry text is required.');
  const p = getPatient(core, patientId);
  if (!p) throw ApiError.notFound('patient', patientId);
  core.tx(() => {
    core.db.prepare('INSERT INTO patient_history (patient_id, kind, entry, recorded_by, created_at) VALUES (?, ?, ?, ?, ?)').run(patientId, kind, entry.trim(), actor.userId, nowIso());
  });
  core.audit('patient.history_added', 'patient', p.code, { kind, entry: entry.slice(0, 200) }, actor);
}
