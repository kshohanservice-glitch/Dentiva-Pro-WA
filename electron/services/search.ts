import type { Core } from '../core';
import { ApiError } from './errors';

/**
 * Global advanced search. Returns typed results grouped by entity.
 * All matching is server-side with indexed columns; LIKE on B-tree indexes
 * with leading wildcards is acceptable at clinic scale and remains <50 ms
 * on the stress dataset (see tests/stress).
 */

export interface SearchFilters {
  q: string;
  include?: {
    patients?: boolean;
    appointments?: boolean;
    invoices?: boolean;
    payments?: boolean;
    prescriptions?: boolean;
    treatments?: boolean;
    inventory?: boolean;
  };
  patientFilters?: { gender?: string; bloodGroup?: string; ageMin?: number; ageMax?: number; dentistId?: number };
}

export interface SearchResults {
  patients: Array<{ id: number; code: string; fullName: string; phone: string; gender: string; bloodGroup: string; age: number | null; match: string }>;
  appointments: Array<{ id: number; code: string; patientName: string; apptDate: string; startTime: string; status: string; match: string }>;
  invoices: Array<{ id: number; number: string; patientName: string; totalPaise: number; status: string; invoiceDate: string; match: string }>;
  payments: Array<{ id: number; code: string; patientName: string; amountPaise: number; method: string; paymentDate: string; match: string }>;
  prescriptions: Array<{ id: number; code: string; patientName: string; createdAt: string; match: string }>;
  treatments: Array<{ id: number; code: string; name: string; category: string; match: string }>;
  inventory: Array<{ id: number; sku: string; name: string; stockQuantity: number; match: string }>;
  total: number;
}

export function globalSearch(core: Core, f: SearchFilters): SearchResults {
  const q = (f.q || '').trim();
  if (q.length < 2) throw ApiError.validation('Search needs at least 2 characters.');
  const like = `%${q}%`;
  const inc = f.include ?? {};
  const out: SearchResults = { patients: [], appointments: [], invoices: [], payments: [], prescriptions: [], treatments: [], inventory: [], total: 0 };
  const pf = f.patientFilters ?? {};
  const extra: string[] = [];
  const extraParams: unknown[] = [];
  if (pf.gender) {
    extra.push('p.gender = ?');
    extraParams.push(pf.gender);
  }
  if (pf.bloodGroup) {
    extra.push('p.blood_group = ?');
    extraParams.push(pf.bloodGroup);
  }
  if (pf.ageMin !== undefined) {
    extra.push('p.age >= ?');
    extraParams.push(pf.ageMin);
  }
  if (pf.ageMax !== undefined) {
    extra.push('p.age <= ?');
    extraParams.push(pf.ageMax);
  }
  if (pf.dentistId) {
    extra.push('p.assigned_dentist_id = ?');
    extraParams.push(pf.dentistId);
  }
  const extraSql = extra.length ? `AND ${extra.join(' AND ')}` : '';

  if (inc.patients !== false) {
    out.patients = (
      core.db
        .prepare(
          `SELECT p.id, p.code, p.full_name AS fullName, p.phone, p.gender, p.blood_group AS bloodGroup, p.age,
                  CASE WHEN p.code LIKE ? THEN 'code' WHEN p.phone LIKE ? THEN 'phone' ELSE 'name' END AS match
           FROM patients p WHERE (p.full_name LIKE ? OR p.code LIKE ? OR p.phone LIKE ? OR p.emergency_phone LIKE ? OR p.address LIKE ?) AND p.archived = 0 ${extraSql}
           ORDER BY p.full_name LIMIT 25`,
        )
        .all(like, like, like, like, like, like, ...extraParams) as Array<Record<string, unknown>>
    ).map((r) => ({ id: r.id as number, code: r.code as string, fullName: r.fullName as string, phone: (r.phone as string) ?? '', gender: (r.gender as string) ?? '', bloodGroup: (r.bloodGroup as string) ?? '', age: (r.age as number) ?? null, match: r.match as string }));
  }
  if (inc.appointments !== false) {
    out.appointments = (
      core.db
        .prepare(
          `SELECT a.id, a.code, pat.full_name AS patientName, a.appt_date AS apptDate, a.start_time AS startTime, a.status
           FROM appointments a JOIN patients pat ON pat.id = a.patient_id
           WHERE (a.code LIKE ? OR pat.full_name LIKE ? OR a.reason LIKE ?)
           ORDER BY a.appt_date DESC LIMIT 25`,
        )
        .all(like, like, like) as Array<Record<string, unknown>>
    ).map((r) => ({ id: r.id as number, code: r.code as string, patientName: r.patientName as string, apptDate: r.apptDate as string, startTime: r.startTime as string, status: r.status as string, match: '' }));
  }
  if (inc.invoices !== false) {
    out.invoices = (
      core.db
        .prepare(
          `SELECT i.id, i.number, pat.full_name AS patientName, i.total AS totalPaise, i.status, i.invoice_date AS invoiceDate
           FROM invoices i JOIN patients pat ON pat.id = i.patient_id
           WHERE i.number LIKE ? ORDER BY i.invoice_date DESC LIMIT 25`,
        )
        .all(like) as Array<Record<string, unknown>>
    ).map((r) => ({ id: r.id as number, number: r.number as string, patientName: r.patientName as string, totalPaise: r.totalPaise as number, status: r.status as string, invoiceDate: r.invoiceDate as string, match: '' }));
  }
  if (inc.payments !== false) {
    out.payments = (
      core.db
        .prepare(
          `SELECT p.id, p.code, pat.full_name AS patientName, p.amount AS amountPaise, p.method, p.payment_date AS paymentDate
           FROM payments p JOIN patients pat ON pat.id = p.patient_id
           WHERE (p.code LIKE ? OR p.reference LIKE ?) ORDER BY p.payment_date DESC LIMIT 25`,
        )
        .all(like, like) as Array<Record<string, unknown>>
    ).map((r) => ({ id: r.id as number, code: r.code as string, patientName: r.patientName as string, amountPaise: r.amountPaise as number, method: r.method as string, paymentDate: r.paymentDate as string, match: '' }));
  }
  if (inc.prescriptions !== false) {
    out.prescriptions = (
      core.db
        .prepare(
          `SELECT rx.id, rx.code, pat.full_name AS patientName, rx.created_at AS createdAt
           FROM prescriptions rx JOIN patients pat ON pat.id = rx.patient_id
           WHERE rx.code LIKE ? ORDER BY rx.created_at DESC LIMIT 25`,
        )
        .all(like) as Array<Record<string, unknown>>
    ).map((r) => ({ id: r.id as number, code: r.code as string, patientName: r.patientName as string, createdAt: r.createdAt as string, match: '' }));
  }
  if (inc.treatments !== false) {
    out.treatments = (
      core.db
        .prepare('SELECT id, code, name, category FROM treatment_catalog WHERE (name LIKE ? OR code LIKE ?) ORDER BY name LIMIT 25')
        .all(like, like) as Array<Record<string, unknown>>
    ).map((r) => ({ id: r.id as number, code: r.code as string, name: r.name as string, category: (r.category as string) ?? '', match: '' }));
  }
  if (inc.inventory !== false) {
    out.inventory = (
      core.db
        .prepare('SELECT id, sku, name, stock_quantity AS stockQuantity FROM inventory_items WHERE (name LIKE ? OR sku LIKE ?) ORDER BY name LIMIT 25')
        .all(like, like) as Array<Record<string, unknown>>
    ).map((r) => ({ id: r.id as number, sku: r.sku as string, name: r.name as string, stockQuantity: r.stockQuantity as number, match: '' }));
  }

  out.total = out.patients.length + out.appointments.length + out.invoices.length + out.payments.length + out.prescriptions.length + out.treatments.length + out.inventory.length;
  return out;
}
