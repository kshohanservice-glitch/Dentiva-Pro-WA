import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import type { Core, Actor } from '../core';
import { ApiError } from './errors';
import { nowIso } from '../../shared/date';
import {
  ATTACHMENT_MAX_BYTES,
  ATTACHMENT_TYPES,
  TOOTH_CONDITION_MAP,
} from '../../shared/constants';
import type {
  Visit,
  VisitTreatment,
  Tooth,
  ToothState,
  Prescription,
  PrescriptionItem,
  TreatmentCatalogItem,
  MedicineCatalogItem,
  Referral,
  AttachmentRow,
} from '../../shared/types';

// ================================================================ VISITS

export interface VisitInput {
  patientId: number;
  dentistId?: number | null;
  visitDate?: string; // ISO
  chiefComplaint?: string;
  history?: string;
  examination?: string;
  diagnosis?: string;
  procedure?: string;
  advice?: string;
  followUpDate?: string | null;
  followUpNote?: string;
  referralOut?: boolean;
  notes?: string;
  status?: 'in_progress' | 'completed';
  treatments?: Array<{ catalogId?: number | null; name?: string; pricePaise?: number; quantity?: number; notes?: string }>;
}

const VISIT_SELECT = `
  SELECT v.*, d.name AS dentist_name
  FROM visits v LEFT JOIN dentists d ON d.id = v.dentist_id
`;

const rowToVisit = (r: Record<string, unknown>): Visit => ({
  id: r.id as number,
  patientId: r.patient_id as number,
  dentistId: (r.dentist_id as number) ?? null,
  dentistName: (r.dentist_name as string) ?? null,
  userId: (r.user_id as number) ?? null,
  visitDate: r.visit_date as string,
  chiefComplaint: (r.chief_complaint as string) ?? '',
  history: (r.history as string) ?? '',
  examination: (r.examination as string) ?? '',
  diagnosis: (r.diagnosis as string) ?? '',
  procedure: (r.procedure as string) ?? '',
  advice: (r.advice as string) ?? '',
  followUpDate: (r.follow_up_date as string) ?? null,
  followUpNote: (r.follow_up_note as string) ?? '',
  referralOut: !!(r.referral_out as number),
  notes: (r.notes as string) ?? '',
  status: r.status as 'in_progress' | 'completed',
  createdAt: r.created_at as string,
  updatedAt: r.updated_at as string,
});

export function listVisits(core: Core, patientId: number, page = 1, pageSize = 20): { items: Visit[]; total: number } {
  const total = (core.db.prepare('SELECT COUNT(*) AS c FROM visits WHERE patient_id = ?').get(patientId) as { c: number }).c;
  const rows = core.db
    .prepare(`${VISIT_SELECT} WHERE v.patient_id = ? ORDER BY v.visit_date DESC LIMIT ? OFFSET ?`)
    .all(patientId, pageSize, (page - 1) * pageSize) as Array<Record<string, unknown>>;
  return { items: rows.map(rowToVisit), total };
}

export function getVisit(core: Core, id: number): { visit: Visit; treatments: VisitTreatment[]; teeth: ToothState[] } {
  const row = core.db.prepare(`${VISIT_SELECT} WHERE v.id = ?`).get(id) as Record<string, unknown> | undefined;
  if (!row) throw ApiError.notFound('visit', id);
  const treatments = (
    core.db
      .prepare('SELECT * FROM visit_treatments WHERE visit_id = ? ORDER BY id')
      .all(id) as Array<Record<string, unknown>>
  ).map((t) => ({
    id: t.id as number,
    visitId: t.visit_id as number,
    catalogId: (t.catalog_id as number) ?? null,
    name: t.name as string,
    code: (t.code as string) ?? null,
    pricePaise: t.price as number,
    quantity: t.quantity as number,
    notes: (t.notes as string) ?? '',
    createdAt: t.created_at as string,
  }));
  const teeth = (
    core.db
      .prepare(
        `SELECT vtc.tooth_id AS toothId, vtc.condition_key AS conditionKey, vtc.note, vtc.created_at AS updatedAt,
                c.label AS conditionLabel, c.color
         FROM visit_tooth_conditions vtc JOIN tooth_condition_types c ON c.key = vtc.condition_key
         WHERE vtc.visit_id = ? ORDER BY vtc.tooth_id`,
      )
      .all(id) as ToothState[]
  );
  return { visit: rowToVisit(row), treatments, teeth };
}

export function createVisit(core: Core, actor: Actor, input: VisitInput): { visit: Visit; treatments: VisitTreatment[] } {
  const patient = core.db.prepare('SELECT code FROM patients WHERE id = ?').get(input.patientId) as { code: string } | undefined;
  if (!patient) throw ApiError.notFound('patient', input.patientId);
  if (!input.chiefComplaint?.trim()) throw ApiError.validation('Chief complaint is required for a visit.');
  const now = nowIso();
  const visitId = core.tx(() => {
    const r = core.db
      .prepare(
        `INSERT INTO visits (patient_id, dentist_id, user_id, visit_date, chief_complaint, history, examination, diagnosis,
          procedure, advice, follow_up_date, follow_up_note, referral_out, notes, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        input.patientId,
        input.dentistId ?? null,
        actor.userId,
        input.visitDate || now,
        input.chiefComplaint,
        input.history ?? '',
        input.examination ?? '',
        input.diagnosis ?? '',
        input.procedure ?? '',
        input.advice ?? '',
        input.followUpDate ?? null,
        input.followUpNote ?? '',
        input.referralOut ? 1 : 0,
        input.notes ?? '',
        input.status ?? 'in_progress',
        now,
        now,
      );
    const vid = Number(r.lastInsertRowid);
    insertVisitTreatments(core, vid, input.patientId, actor, input.treatments ?? []);
    return vid;
  });
  core.audit('visit.created', 'visit', String(visitId), { patient: patient.code }, actor);
  const v = getVisit(core, visitId);
  return { visit: v.visit, treatments: v.treatments };
}

export function updateVisit(core: Core, actor: Actor, id: number, input: Partial<VisitInput>): Visit {
  const existing = getVisit(core, id);
  const v = existing.visit;
  if (input.status !== undefined && input.status !== v.status) {
    throw ApiError.state('Visit status cannot be changed here.');
  }
  const windowDays = core.settingGet<number>('clinical.visit_edit_window_days', 30) ?? 30;
  const editable =
    v.status === 'in_progress' ||
    Date.now() - new Date(v.updatedAt).getTime() < windowDays * 86400000;
  if (!editable) {
    throw ApiError.state(
      `This visit is historical (edited ${windowDays}-day window passed). Create a new visit instead of modifying it.`,
    );
  }
  const now = nowIso();
  const changed: Record<string, string> = {};
  const fields: Array<[keyof VisitInput, string]> = [
    ['chiefComplaint', 'chief_complaint'],
    ['history', 'history'],
    ['examination', 'examination'],
    ['diagnosis', 'diagnosis'],
    ['procedure', 'procedure'],
    ['advice', 'advice'],
    ['followUpNote', 'follow_up_note'],
    ['notes', 'notes'],
  ];
  for (const [k] of fields) {
    if (input[k] !== undefined && String(input[k] ?? '') !== String((v as unknown as Record<string, unknown>)[k] ?? '')) {
      changed[k as string] = 'updated';
    }
  }
  core.tx(() => {
    core.db
      .prepare(
        `UPDATE visits SET dentist_id = COALESCE(?, dentist_id), chief_complaint = COALESCE(?, chief_complaint),
          history = COALESCE(?, history), examination = COALESCE(?, examination), diagnosis = COALESCE(?, diagnosis),
          procedure = COALESCE(?, procedure), advice = COALESCE(?, advice),
          follow_up_date = COALESCE(?, follow_up_date), follow_up_note = COALESCE(?, follow_up_note),
          referral_out = COALESCE(?, referral_out), notes = COALESCE(?, notes), updated_at = ?
         WHERE id = ?`,
      )
      .run(
        input.dentistId === undefined ? null : input.dentistId,
        input.chiefComplaint ?? null,
        input.history === undefined ? null : input.history,
        input.examination === undefined ? null : input.examination,
        input.diagnosis === undefined ? null : input.diagnosis,
        input.procedure === undefined ? null : input.procedure,
        input.advice === undefined ? null : input.advice,
        input.followUpDate === undefined ? null : input.followUpDate,
        input.followUpNote === undefined ? null : input.followUpNote,
        input.referralOut === undefined ? null : (input.referralOut ? 1 : 0),
        input.notes === undefined ? null : input.notes,
        now,
        id,
      );
    if (input.treatments) {
      core.db.prepare('DELETE FROM visit_treatments WHERE visit_id = ?').run(id);
      insertVisitTreatments(core, id, v.patientId, actor, input.treatments);
      changed.treatments = 'replaced';
    }
  });
  core.audit('visit.edited', 'visit', String(id), changed, actor);
  return getVisit(core, id).visit;
}

export function completeVisit(core: Core, actor: Actor, id: number): Visit {
  const v = getVisit(core, id).visit;
  core.tx(() => {
    core.db.prepare("UPDATE visits SET status = 'completed', updated_at = ? WHERE id = ?").run(nowIso(), id);
  });
  core.audit('visit.completed', 'visit', String(id), null, actor);
  return { ...v, status: 'completed' };
}

function insertVisitTreatments(
  core: Core,
  visitId: number,
  patientId: number,
  actor: Actor,
  treatments: Array<{ catalogId?: number | null; name?: string; pricePaise?: number; quantity?: number; notes?: string }>,
): void {
  if (!treatments.length) return;
  const ins = core.db.prepare(
    `INSERT INTO visit_treatments (visit_id, patient_id, catalog_id, name, code, price, quantity, notes, created_by, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  for (const t of treatments) {
    let name = (t.name ?? '').trim();
    let code: string | null = null;
    let price = t.pricePaise ?? 0;
    if (t.catalogId) {
      const cat = core.db.prepare('SELECT name, code, default_price FROM treatment_catalog WHERE id = ?').get(t.catalogId) as
        | { name: string; code: string; default_price: number }
        | undefined;
      if (!cat) throw ApiError.validation('A selected treatment no longer exists in the catalog.');
      name = cat.name;
      code = cat.code;
      price = t.pricePaise ?? cat.default_price;
    }
    if (!name) throw ApiError.validation('Every treatment needs a name (select from the catalog or type a custom name).');
    if (!Number.isInteger(price) || price < 0) throw ApiError.validation('Treatment price is invalid.');
    const qty = Math.max(1, Math.floor(t.quantity ?? 1));
    ins.run(visitId, patientId, t.catalogId ?? null, name, code, price, qty, t.notes ?? '', actor.userId, nowIso());
  }
}

// ================================================================ DENTAL CHART

export function getChart(core: Core, numbering: 'fdi' | 'universal', dentition: 'adult' | 'pediatric'): Tooth[] {
  const rows = core.db
    .prepare('SELECT * FROM teeth WHERE numbering = ? AND dentition = ? ORDER BY position')
    .all(numbering, dentition) as Array<Record<string, unknown>>;
  return rows.map((r) => ({
    id: r.id as number,
    numbering: r.numbering as 'fdi' | 'universal',
    dentition: r.dentition as 'adult' | 'pediatric',
    position: r.position as number,
    name: r.name as string,
  }));
}

export function getPatientChart(
  core: Core,
  patientId: number,
  numbering: 'fdi' | 'universal',
  dentition: 'adult' | 'pediatric',
): { teeth: Tooth[]; states: Map<number, ToothState> } {
  const teeth = getChart(core, numbering, dentition);
  const rows = core.db
    .prepare(
      `SELECT ts.tooth_id AS toothId, ts.condition_key AS conditionKey, ts.note, ts.updated_at AS updatedAt,
              c.label AS conditionLabel, c.color
       FROM patient_tooth_state ts JOIN teeth t ON t.id = ts.tooth_id
       JOIN tooth_condition_types c ON c.key = ts.condition_key
       WHERE ts.patient_id = ? AND t.numbering = ? AND t.dentition = ?`,
    )
    .all(patientId, numbering, dentition) as ToothState[];
  return { teeth, states: new Map(rows.map((r) => [r.toothId, r])) };
}

export function setToothState(
  core: Core,
  actor: Actor,
  patientId: number,
  toothId: number,
  conditionKey: string | null,
  note: string | null,
  visitId?: number | null,
): void {
  const patient = core.db.prepare('SELECT code FROM patients WHERE id = ?').get(patientId) as { code: string } | undefined;
  if (!patient) throw ApiError.notFound('patient', patientId);
  const tooth = core.db.prepare('SELECT id FROM teeth WHERE id = ?').get(toothId) as { id: number } | undefined;
  if (!tooth) throw ApiError.notFound('tooth', toothId);
  if (conditionKey && !TOOTH_CONDITION_MAP[conditionKey]) throw ApiError.validation('Unknown tooth condition.');
  const now = nowIso();
  core.tx(() => {
    if (conditionKey) {
      core.db
        .prepare(
          `INSERT INTO patient_tooth_state (patient_id, tooth_id, condition_key, note, updated_at, updated_by)
           VALUES (?, ?, ?, ?, ?, ?)
           ON CONFLICT(patient_id, tooth_id) DO UPDATE SET condition_key = excluded.condition_key,
             note = excluded.note, updated_at = excluded.updated_at, updated_by = excluded.updated_by`,
        )
        .run(patientId, toothId, conditionKey, note, now, actor.userId);
    } else {
      core.db.prepare('DELETE FROM patient_tooth_state WHERE patient_id = ? AND tooth_id = ?').run(patientId, toothId);
    }
    if (visitId) {
      if (conditionKey) {
        core.db
          .prepare(
            `INSERT INTO visit_tooth_conditions (visit_id, tooth_id, condition_key, note, created_by, created_at)
             VALUES (?, ?, ?, ?, ?, ?)
             ON CONFLICT(visit_id, tooth_id) DO UPDATE SET condition_key = excluded.condition_key, note = excluded.note`,
          )
          .run(visitId, toothId, conditionKey, note, actor.userId, now);
      } else {
        core.db.prepare('DELETE FROM visit_tooth_conditions WHERE visit_id = ? AND tooth_id = ?').run(visitId, toothId);
      }
    }
  });
  core.audit('chart.tooth_marked', 'patient', patient.code, { toothId, condition: conditionKey ?? 'cleared', note }, actor);
}

// ================================================================ TREATMENT CATALOG

export function listTreatments(core: Core, includeInactive = false): TreatmentCatalogItem[] {
  const rows = core.db
    .prepare(`SELECT * FROM treatment_catalog ${includeInactive ? '' : 'WHERE active = 1'} ORDER BY category, name`)
    .all() as Array<Record<string, unknown>>;
  return rows.map((r) => ({
    id: r.id as number,
    code: r.code as string,
    name: r.name as string,
    category: (r.category as string) ?? '',
    description: (r.description as string) ?? '',
    defaultPricePaise: r.default_price as number,
    durationMinutes: r.duration_minutes as number,
    active: !!r.active,
    notes: (r.notes as string) ?? '',
    updatedAt: r.updated_at as string,
  }));
}

export function saveTreatment(
  core: Core,
  actor: Actor,
  data: { id?: number; code: string; name: string; category: string; description: string; defaultPricePaise: number; durationMinutes: number; active: boolean; notes: string },
): TreatmentCatalogItem {
  if (!data.name.trim()) throw ApiError.validation('Treatment name is required.');
  if (!/^\d{1,12}$/.test(String(data.defaultPricePaise)) || data.defaultPricePaise < 0) {
    throw ApiError.validation('Price is invalid.');
  }
  const code = data.code.trim().toUpperCase();
  if (!code) throw ApiError.validation('A treatment code is required (e.g. T-025).');
  const now = nowIso();
  if (data.id) {
    const existing = core.db.prepare('SELECT * FROM treatment_catalog WHERE id = ?').get(data.id) as Record<string, unknown> | undefined;
    if (!existing) throw ApiError.notFound('treatment', data.id);
    const dup = core.db.prepare('SELECT id FROM treatment_catalog WHERE code = ? AND id != ?').get(code, data.id) as { id: number } | undefined;
    if (dup) throw ApiError.duplicate(`Code ${code} is already used by another treatment.`);
    core.tx(() => {
      core.db
        .prepare(
          `UPDATE treatment_catalog SET code = ?, name = ?, category = ?, description = ?, default_price = ?,
            duration_minutes = ?, active = ?, notes = ?, updated_at = ? WHERE id = ?`,
        )
        .run(code, data.name.trim(), data.category, data.description, data.defaultPricePaise, data.durationMinutes, data.active ? 1 : 0, data.notes, now, data.id);
    });
    core.audit('treatment.updated', 'treatment_catalog', code, { name: data.name }, actor);
  } else {
    const dup = core.db.prepare('SELECT id FROM treatment_catalog WHERE code = ?').get(code) as { id: number } | undefined;
    if (dup) throw ApiError.duplicate(`Code ${code} is already used by another treatment.`);
    core.tx(() => {
      core.db
        .prepare(
          `INSERT INTO treatment_catalog (code, name, category, description, default_price, duration_minutes, active, notes, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(code, data.name.trim(), data.category, data.description, data.defaultPricePaise, data.durationMinutes, data.active ? 1 : 0, data.notes, now, now);
    });
    core.audit('treatment.created', 'treatment_catalog', code, { name: data.name }, actor);
  }
  const rows = core.db.prepare('SELECT * FROM treatment_catalog WHERE code = ?').all(code) as Array<Record<string, unknown>>;
  return rows.map((r) => ({
    id: r.id as number,
    code: r.code as string,
    name: r.name as string,
    category: (r.category as string) ?? '',
    description: (r.description as string) ?? '',
    defaultPricePaise: r.default_price as number,
    durationMinutes: r.duration_minutes as number,
    active: !!r.active,
    notes: (r.notes as string) ?? '',
    updatedAt: r.updated_at as string,
  }))[0];
}

// ================================================================ PRESCRIPTIONS

export interface RxItemInput {
  medicineId?: number | null;
  name: string;
  genericName?: string;
  form?: string;
  strength?: string;
  dose?: string;
  frequency?: string;
  morning?: boolean;
  noon?: boolean;
  night?: boolean;
  beforeAfter?: string;
  durationDays?: number | null;
  quantity?: string;
  prn?: boolean;
  instruction?: string;
}

export function listPrescriptions(core: Core, f: { q?: string; patientId?: number; page?: number; pageSize?: number } = {}): { items: Array<Omit<Prescription, 'items'>>; total: number } {
  const where: string[] = [];
  const params: unknown[] = [];
  if (f.patientId) {
    where.push('p.patient_id = ?');
    params.push(f.patientId);
  }
  if (f.q) {
    where.push('(rx.code LIKE ? OR pat.full_name LIKE ?)');
    params.push(`%${f.q}%`, `%${f.q}%`);
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const total = (core.db.prepare(`SELECT COUNT(*) AS c FROM prescriptions rx JOIN patients pat ON pat.id = rx.patient_id ${whereSql}`).get(...params) as { c: number }).c;
  const rows = core.db
    .prepare(
      `SELECT rx.*, pat.full_name AS patientName, pat.code AS patientCode, pat.gender AS patientGender,
        (SELECT age FROM patients WHERE id = rx.patient_id) AS patientAge,
        d.name AS dentistName, COALESCE(d.designations, '') AS dentistDesignations, d.registration_no AS dentistRegistrationNo
       FROM prescriptions rx
       JOIN patients pat ON pat.id = rx.patient_id
       LEFT JOIN dentists d ON d.id = rx.dentist_id
       ${whereSql}
       ORDER BY rx.created_at DESC LIMIT ? OFFSET ?`,
    )
    .all(...params, Math.min(200, f.pageSize ?? 50), (Math.max(1, f.page ?? 1) - 1) * (f.pageSize ?? 50)) as Array<Record<string, unknown>>;
  return {
    total,
    items: rows.map((r) => ({
      id: r.id as number,
      code: r.code as string,
      patientId: r.patient_id as number,
      patientName: r.patientName as string,
      patientCode: r.patientCode as string,
      patientGender: (r.patientGender as string) ?? '',
      patientAge: (r.patientAge as number) ?? null,
      dentistId: (r.dentist_id as number) ?? null,
      dentistName: (r.dentistName as string) ?? '',
      dentistDesignations: r.dentistDesignations as string,
      dentistRegistrationNo: (r.dentistRegistrationNo as string) ?? '',
      visitId: (r.visit_id as number) ?? null,
      chiefComplaint: (r.chief_complaint as string) ?? '',
      examination: (r.examination as string) ?? '',
      diagnosis: (r.diagnosis as string) ?? '',
      advice: (r.advice as string) ?? '',
      notes: (r.notes as string) ?? '',
      status: r.status as 'active' | 'cancelled',
      createdAt: r.created_at as string,
    })),
  };
}

export function getPrescription(core: Core, id: number): Prescription {
  const row = core.db
    .prepare(
      `SELECT rx.*, pat.full_name AS patientName, pat.code AS patientCode, pat.gender AS patientGender,
        pat.age AS patientAge, d.name AS dentistName, COALESCE(d.designations,'') AS dentistDesignations,
        d.registration_no AS dentistRegistrationNo
       FROM prescriptions rx
       JOIN patients pat ON pat.id = rx.patient_id
       LEFT JOIN dentists d ON d.id = rx.dentist_id
       WHERE rx.id = ?`,
    )
    .get(id) as Record<string, unknown> | undefined;
  if (!row) throw ApiError.notFound('prescription', id);
  const items = (
    core.db
      .prepare('SELECT * FROM prescription_items WHERE prescription_id = ? ORDER BY sort_order, id')
      .all(id) as Array<Record<string, unknown>>
  ).map((i) => toItemRow(i));
  return {
    id: row.id as number,
    code: row.code as string,
    patientId: row.patient_id as number,
    patientName: row.patientName as string,
    patientCode: row.patientCode as string,
    patientGender: (row.patientGender as string) ?? '',
    patientAge: (row.patientAge as number) ?? null,
    dentistId: (row.dentist_id as number) ?? null,
    dentistName: (row.dentistName as string) ?? '',
    dentistDesignations: row.dentistDesignations as string,
    dentistRegistrationNo: (row.dentistRegistrationNo as string) ?? '',
    visitId: (row.visit_id as number) ?? null,
    chiefComplaint: (row.chief_complaint as string) ?? '',
    examination: (row.examination as string) ?? '',
    diagnosis: (row.diagnosis as string) ?? '',
    advice: (row.advice as string) ?? '',
    notes: (row.notes as string) ?? '',
    status: row.status as 'active' | 'cancelled',
    createdAt: row.created_at as string,
    items,
  };
}

const toItemRow = (i: Record<string, unknown>): PrescriptionItem => ({
  id: i.id as number,
  name: i.name as string,
  genericName: (i.generic_name as string) ?? '',
  form: (i.form as string) ?? '',
  strength: (i.strength as string) ?? '',
  dose: (i.dose as string) ?? '',
  frequency: (i.frequency as string) ?? '',
  morning: !!(i.morning as number),
  noon: !!(i.noon as number),
  night: !!(i.night as number),
  beforeAfter: (i.before_after as string) ?? '',
  durationDays: (i.duration_days as number) ?? null,
  quantity: (i.quantity as string) ?? '',
  prn: !!(i.prn as number),
  instruction: (i.instruction as string) ?? '',
  sortOrder: i.sort_order as number,
});

export function createPrescription(
  core: Core,
  actor: Actor,
  data: { patientId: number; dentistId?: number | null; visitId?: number | null; chiefComplaint?: string; examination?: string; diagnosis?: string; advice?: string; notes?: string; items: RxItemInput[] },
): Prescription {
  const patient = core.db.prepare('SELECT code FROM patients WHERE id = ?').get(data.patientId) as { code: string } | undefined;
  if (!patient) throw ApiError.notFound('patient', data.patientId);
  if (!data.items?.length) throw ApiError.validation('A prescription needs at least one medicine.');
  const now = nowIso();
  const id = core.tx(() => {
    const code = core.nextCode('prescriptions', 'RX-');
    const r = core.db
      .prepare(
        `INSERT INTO prescriptions (code, patient_id, dentist_id, visit_id, chief_complaint, examination, diagnosis, advice, notes, status, created_by, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?)`,
      )
      .run(
        code,
        data.patientId,
        data.dentistId ?? null,
        data.visitId ?? null,
        data.chiefComplaint ?? '',
        data.examination ?? '',
        data.diagnosis ?? '',
        data.advice ?? '',
        data.notes ?? '',
        actor.userId,
        now,
        now,
      );
    const rxId = Number(r.lastInsertRowid);
    insertRxItems(core, rxId, data.items);
    return rxId;
  });
  core.audit('prescription.created', 'prescription', String(id), { patient: patient.code, items: data.items.length }, actor);
  return getPrescription(core, id);
}

export function updatePrescription(
  core: Core,
  actor: Actor,
  id: number,
  data: { chiefComplaint?: string; examination?: string; diagnosis?: string; advice?: string; notes?: string; items?: RxItemInput[] },
): Prescription {
  const existing = getPrescription(core, id);
  if (existing.status === 'cancelled') throw ApiError.state('A cancelled prescription cannot be edited.');
  core.tx(() => {
    core.db
      .prepare(
        `UPDATE prescriptions SET chief_complaint = COALESCE(?, chief_complaint), examination = COALESCE(?, examination),
          diagnosis = COALESCE(?, diagnosis), advice = COALESCE(?, advice), notes = COALESCE(?, notes), updated_at = ?
         WHERE id = ?`,
      )
      .run(data.chiefComplaint ?? null, data.examination ?? null, data.diagnosis ?? null, data.advice ?? null, data.notes ?? null, nowIso(), id);
    if (data.items) {
      core.db.prepare('DELETE FROM prescription_items WHERE prescription_id = ?').run(id);
      insertRxItems(core, id, data.items);
    }
  });
  core.audit('prescription.modified', 'prescription', existing.code, { itemsReplaced: !!data.items }, actor);
  return getPrescription(core, id);
}

export function cancelPrescription(core: Core, actor: Actor, id: number, reason: string): void {
  const existing = getPrescription(core, id);
  if (existing.status === 'cancelled') throw ApiError.state('Prescription is already cancelled.');
  core.tx(() => {
    core.db.prepare("UPDATE prescriptions SET status = 'cancelled', updated_at = ? WHERE id = ?").run(nowIso(), id);
  });
  core.audit('prescription.cancelled', 'prescription', existing.code, { reason }, actor);
}

function insertRxItems(core: Core, rxId: number, items: RxItemInput[]): void {
  const ins = core.db.prepare(
    `INSERT INTO prescription_items (prescription_id, medicine_id, name, generic_name, form, strength, dose, frequency,
      morning, noon, night, before_after, duration_days, quantity, prn, instruction, sort_order)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  items.forEach((it, idx) => {
    let name = (it.name ?? '').trim();
    let generic = it.genericName ?? '';
    let form = it.form ?? '';
    let strength = it.strength ?? '';
    if (it.medicineId) {
      const m = core.db
        .prepare('SELECT name, generic_name, form, strength FROM medicine_catalog WHERE id = ?')
        .get(it.medicineId) as { name: string; generic_name: string; form: string; strength: string } | undefined;
      if (!m) throw ApiError.validation('A selected medicine no longer exists in the catalog.');
      name = m.name;
      generic = m.generic_name;
      form = m.form;
      strength = m.strength;
    }
    if (!name) throw ApiError.validation('Every medicine line needs a name.');
    ins.run(
      rxId,
      it.medicineId ?? null,
      name,
      generic,
      form,
      strength,
      it.dose ?? '',
      it.frequency ?? '',
      it.morning ? 1 : 0,
      it.noon ? 1 : 0,
      it.night ? 1 : 0,
      it.beforeAfter ?? 'after food',
      it.durationDays ?? null,
      it.quantity ?? '',
      it.prn ? 1 : 0,
      it.instruction ?? '',
      idx,
    );
  });
}

// ================================================================ MEDICINE CATALOG

export function listMedicines(core: Core, q?: string): MedicineCatalogItem[] {
  const rows = q
    ? (core.db
        .prepare("SELECT * FROM medicine_catalog WHERE active = 1 AND (name LIKE ? OR generic_name LIKE ?) ORDER BY name LIMIT 200")
        .all(`%${q}%`, `%${q}%`) as Array<Record<string, unknown>>)
    : (core.db.prepare('SELECT * FROM medicine_catalog WHERE active = 1 ORDER BY name LIMIT 200').all() as Array<Record<string, unknown>>);
  return rows.map((r) => ({
    id: r.id as number,
    name: r.name as string,
    genericName: (r.generic_name as string) ?? '',
    form: (r.form as string) ?? '',
    strength: (r.strength as string) ?? '',
    commonDosage: (r.common_dosage as string) ?? '',
    active: !!r.active,
  }));
}

export function saveMedicine(
  core: Core,
  actor: Actor,
  data: { id?: number; name: string; genericName?: string; form?: string; strength?: string; commonDosage?: string; active?: boolean },
): void {
  if (!data.name.trim()) throw ApiError.validation('Medicine name is required.');
  core.tx(() => {
    if (data.id) {
      core.db
        .prepare('UPDATE medicine_catalog SET name = ?, generic_name = ?, form = ?, strength = ?, common_dosage = ?, active = ? WHERE id = ?')
        .run(data.name.trim(), data.genericName ?? '', data.form ?? '', data.strength ?? '', data.commonDosage ?? '', (data.active ?? true) ? 1 : 0, data.id);
    } else {
      core.db
        .prepare('INSERT INTO medicine_catalog (name, generic_name, form, strength, common_dosage, active) VALUES (?, ?, ?, ?, ?, 1)')
        .run(data.name.trim(), data.genericName ?? '', data.form ?? '', data.strength ?? '', data.commonDosage ?? '');
    }
  });
  core.audit('medicine.saved', 'medicine_catalog', data.name, null, actor);
}

// ================================================================ REFERRALS

export function listReferrals(core: Core, patientId: number): Referral[] {
  const rows = core.db
    .prepare('SELECT * FROM referrals WHERE patient_id = ? ORDER BY referral_date DESC')
    .all(patientId) as Array<Record<string, unknown>>;
  return rows.map((r) => ({
    id: r.id as number,
    patientId: r.patient_id as number,
    direction: r.direction as 'in' | 'out',
    referredToName: (r.referred_to_name as string) ?? '',
    specialty: (r.specialty as string) ?? '',
    clinicHospital: (r.clinic_hospital as string) ?? '',
    phone: (r.phone as string) ?? '',
    reason: (r.reason as string) ?? '',
    referralDate: r.referral_date as string,
    followUpNote: (r.follow_up_note as string) ?? '',
    status: r.status as string,
    notes: (r.notes as string) ?? '',
    createdAt: r.created_at as string,
  }));
}

export function createReferral(
  core: Core,
  actor: Actor,
  data: { patientId: number; direction: 'in' | 'out'; referredToName?: string; specialty?: string; clinicHospital?: string; phone?: string; reason?: string; referralDate?: string; followUpNote?: string; notes?: string },
): Referral {
  const patient = core.db.prepare('SELECT code FROM patients WHERE id = ?').get(data.patientId) as { code: string } | undefined;
  if (!patient) throw ApiError.notFound('patient', data.patientId);
  if (data.direction === 'out' && !data.referredToName?.trim()) {
    throw ApiError.validation('For an outgoing referral, the referred doctor/clinic name is required.');
  }
  const id = core.tx(() => {
    const r = core.db
      .prepare(
        `INSERT INTO referrals (patient_id, direction, referred_to_name, specialty, clinic_hospital, phone, reason, referral_date, follow_up_note, notes, created_by, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        data.patientId,
        data.direction,
        data.referredToName ?? '',
        data.specialty ?? '',
        data.clinicHospital ?? '',
        data.phone ?? '',
        data.reason ?? '',
        data.referralDate || new Date().toISOString().slice(0, 10),
        data.followUpNote ?? '',
        data.notes ?? '',
        actor.userId,
        nowIso(),
      );
    return Number(r.lastInsertRowid);
  });
  core.audit('referral.created', 'referral', String(id), { patient: patient.code, direction: data.direction }, actor);
  return listReferrals(core, data.patientId).find((r) => r.id === id)!;
}

export function updateReferralStatus(core: Core, actor: Actor, id: number, status: string): void {
  if (!['pending', 'in_progress', 'completed', 'closed'].includes(status)) throw ApiError.validation('Invalid referral status.');
  core.tx(() => {
    core.db.prepare('UPDATE referrals SET status = ? WHERE id = ?').run(status, id);
  });
  core.audit('referral.status_changed', 'referral', String(id), { status }, actor);
}

// ================================================================ ATTACHMENTS

const SAFE_EXT = new Set(['pdf', 'jpg', 'jpeg', 'png', 'txt', 'doc', 'docx']);

export function addAttachment(
  core: Core,
  actor: Actor,
  data: { patientId?: number | null; staffId?: number | null; originalName: string; mimeType: string; base64: string },
): AttachmentRow {
  const ext = (data.originalName.split('.').pop() || '').toLowerCase();
  const mimeOk = ATTACHMENT_TYPES[data.mimeType] && ATTACHMENT_TYPES[data.mimeType].includes(ext);
  if (!SAFE_EXT.has(ext) || !mimeOk) {
    throw ApiError.validation(`File type ".${ext}" is not allowed. Use PDF, JPG, PNG, TXT, DOC or DOCX.`);
  }
  const buf = Buffer.from(data.base64, 'base64');
  if (buf.length === 0) throw ApiError.validation('The file is empty.');
  if (buf.length > ATTACHMENT_MAX_BYTES) throw ApiError.validation('File exceeds the 15 MB limit.');
  const sha = crypto.createHash('sha256').update(buf).digest('hex');
  const storedName = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}.${ext}`;
  const dest = path.join(core.paths.attachments, storedName);
  fs.writeFileSync(dest, buf);
  const id = core.tx(() => {
    const r = core.db
      .prepare(
        `INSERT INTO attachments (patient_id, staff_id, original_name, stored_name, mime_type, size_bytes, sha256, added_by, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(data.patientId ?? null, data.staffId ?? null, data.originalName, storedName, data.mimeType, buf.length, sha, actor.userId, nowIso());
    return Number(r.lastInsertRowid);
  });
  core.audit('attachment.added', 'attachment', storedName, { originalName: data.originalName, bytes: buf.length }, actor);
  return listAttachments(core, data.patientId ?? null).find((a) => a.id === id)!;
}

export function listAttachments(core: Core, patientId: number | null, staffId?: number | null): AttachmentRow[] {
  let rows: Array<Record<string, unknown>>;
  if (patientId !== null) {
    rows = core.db.prepare('SELECT a.*, u.display_name AS addedByName FROM attachments a LEFT JOIN users u ON u.id = a.added_by WHERE a.patient_id = ? ORDER BY a.created_at DESC').all(patientId) as Array<Record<string, unknown>>;
  } else if (staffId) {
    rows = core.db.prepare('SELECT a.*, u.display_name AS addedByName FROM attachments a LEFT JOIN users u ON u.id = a.added_by WHERE a.staff_id = ? ORDER BY a.created_at DESC').all(staffId) as Array<Record<string, unknown>>;
  } else {
    rows = [];
  }
  return rows.map((r) => ({
    id: r.id as number,
    patientId: (r.patient_id as number) ?? null,
    staffId: (r.staff_id as number) ?? null,
    originalName: r.original_name as string,
    storedName: r.stored_name as string,
    mimeType: (r.mime_type as string) ?? '',
    sizeBytes: r.size_bytes as number,
    sha256: (r.sha256 as string) ?? '',
    addedBy: (r.addedByName as string) ?? null,
    createdAt: r.created_at as string,
    missing: !fs.existsSync(path.join(core.paths.attachments, r.stored_name as string)),
  }));
}

export function readAttachment(core: Core, id: number): { dataUrl: string; originalName: string; missing: boolean } {
  const row = core.db.prepare('SELECT * FROM attachments WHERE id = ?').get(id) as Record<string, unknown> | undefined;
  if (!row) throw ApiError.notFound('attachment', id);
  const file = path.join(core.paths.attachments, row.stored_name as string);
  if (!fs.existsSync(file)) {
    return { dataUrl: '', originalName: row.original_name as string, missing: true };
  }
  const buf = fs.readFileSync(file);
  const mime = (row.mime_type as string) || 'application/octet-stream';
  return { dataUrl: `data:${mime};base64,${buf.toString('base64')}`, originalName: row.original_name as string, missing: false };
}

export function deleteAttachment(core: Core, actor: Actor, id: number): void {
  const row = core.db.prepare('SELECT * FROM attachments WHERE id = ?').get(id) as Record<string, unknown> | undefined;
  if (!row) throw ApiError.notFound('attachment', id);
  core.tx(() => {
    core.db.prepare('DELETE FROM attachments WHERE id = ?').run(id);
  });
  try {
    fs.rmSync(path.join(core.paths.attachments, row.stored_name as string), { force: true });
  } catch {
    /* file already gone */
  }
  core.audit('attachment.deleted', 'attachment', String(row.stored_name), { originalName: String(row.original_name) }, actor);
}
