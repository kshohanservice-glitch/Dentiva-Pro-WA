import type { Core, Actor } from '../core';
import { ApiError } from './errors';
import { nowIso, localDateStr } from '../../shared/date';
import type { Appointment, QueueEntry } from '../../shared/types';

const APPT_SELECT = `
  SELECT a.*, pat.full_name AS patientName, pat.code AS patientCode, pat.phone AS patientPhone, d.name AS dentistName
  FROM appointments a
  JOIN patients pat ON pat.id = a.patient_id
  LEFT JOIN dentists d ON d.id = a.dentist_id
`;

const rowToAppt = (r: Record<string, unknown>): Appointment => ({
  id: r.id as number,
  code: r.code as string,
  patientId: r.patient_id as number,
  patientName: r.patientName as string,
  patientCode: r.patientCode as string,
  patientPhone: (r.patientPhone as string) ?? '',
  dentistId: (r.dentist_id as number) ?? null,
  dentistName: (r.dentistName as string) ?? null,
  apptDate: r.appt_date as string,
  startTime: r.start_time as string,
  durationMinutes: r.duration_minutes as number,
  type: (r.type as string) ?? 'consultation',
  reason: (r.reason as string) ?? '',
  status: r.status as string,
  notes: (r.notes as string) ?? '',
  reminderEnabled: !!(r.reminder_enabled as number),
  rescheduledFrom: (r.rescheduled_from as number) ?? null,
  createdBy: (r.created_by as number) ?? null,
  createdAt: r.created_at as string,
  updatedAt: r.updated_at as string,
});

function validateTime(t: string): void {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(t)) throw ApiError.validation('Invalid time. Use HH:MM (24h).');
}

function validateDate(d: string): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) throw ApiError.validation('Invalid date.');
}

export function listAppointments(core: Core, f: { from?: string; to?: string; status?: string; dentistId?: number; patientId?: number; page?: number; pageSize?: number } = {}): { items: Appointment[]; total: number } {
  const where: string[] = [];
  const params: unknown[] = [];
  if (f.from) {
    where.push('a.appt_date >= ?');
    params.push(f.from);
  }
  if (f.to) {
    where.push('a.appt_date <= ?');
    params.push(f.to);
  }
  if (f.status) {
    where.push('a.status = ?');
    params.push(f.status);
  }
  if (f.dentistId) {
    where.push('a.dentist_id = ?');
    params.push(f.dentistId);
  }
  if (f.patientId) {
    where.push('a.patient_id = ?');
    params.push(f.patientId);
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const total = (core.db
    .prepare(
      `SELECT COUNT(*) AS c
       FROM appointments a
       JOIN patients pat ON pat.id = a.patient_id
       LEFT JOIN dentists d ON d.id = a.dentist_id ${whereSql}`,
    )
    .get(...params) as { c: number }).c;
  const rows = core.db
    .prepare(`${APPT_SELECT} ${whereSql} ORDER BY a.appt_date DESC, a.start_time DESC LIMIT ? OFFSET ?`)
    .all(...params, Math.min(500, f.pageSize ?? 200), (Math.max(1, f.page ?? 1) - 1) * (f.pageSize ?? 200)) as Array<Record<string, unknown>>;
  return { items: rows.map(rowToAppt), total };
}

export function getAppointment(core: Core, id: number): Appointment | null {
  const row = core.db.prepare(`${APPT_SELECT} WHERE a.id = ?`).get(id) as Record<string, unknown> | undefined;
  return row ? rowToAppt(row) : null;
}

export interface AppointmentInput {
  patientId: number;
  dentistId?: number | null;
  apptDate: string;
  startTime: string;
  durationMinutes?: number;
  type?: string;
  reason?: string;
  notes?: string;
  reminderEnabled?: boolean;
}

export function createAppointment(core: Core, actor: Actor, input: AppointmentInput): Appointment {
  const patient = core.db.prepare('SELECT code, archived FROM patients WHERE id = ?').get(input.patientId) as { code: string; archived: number } | undefined;
  if (!patient) throw ApiError.notFound('patient', input.patientId);
  if (patient.archived) throw ApiError.state('This patient is archived and cannot have new appointments.');
  validateDate(input.apptDate);
  validateTime(input.startTime);
  const now = nowIso();
  const id = core.tx(() => {
    const code = core.nextCode('appointments', 'AP-');
    const r = core.db
      .prepare(
        `INSERT INTO appointments (code, patient_id, dentist_id, appt_date, start_time, duration_minutes, type, reason, status, notes, reminder_enabled, created_by, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'scheduled', ?, ?, ?, ?, ?)`,
      )
      .run(
        code,
        input.patientId,
        input.dentistId ?? null,
        input.apptDate,
        input.startTime,
        input.durationMinutes ?? core.settingGet<number>('appointment.default_duration', 30) ?? 30,
        input.type ?? 'consultation',
        input.reason ?? '',
        input.notes ?? '',
        input.reminderEnabled ? 1 : 0,
        actor.userId,
        now,
        now,
      );
    return Number(r.lastInsertRowid);
  });
  core.audit('appointment.created', 'appointment', String(id), { patient: patient.code, date: input.apptDate, time: input.startTime }, actor);
  return getAppointment(core, id)!;
}

export function updateAppointment(core: Core, actor: Actor, id: number, input: Partial<AppointmentInput> & { status?: string }): Appointment {
  const existing = getAppointment(core, id);
  if (!existing) throw ApiError.notFound('appointment', id);
  if (input.apptDate) validateDate(input.apptDate);
  if (input.startTime) validateTime(input.startTime);
  const now = nowIso();
  const changed: Record<string, string> = {};
  if (input.apptDate && input.apptDate !== existing.apptDate) changed.date = `${existing.apptDate} → ${input.apptDate}`;
  if (input.startTime && input.startTime !== existing.startTime) changed.time = `${existing.startTime} → ${input.startTime}`;
  if (input.status && input.status !== existing.status) changed.status = `${existing.status} → ${input.status}`;
  core.tx(() => {
    core.db
      .prepare(
        `UPDATE appointments SET appt_date = COALESCE(?, appt_date), start_time = COALESCE(?, start_time),
          duration_minutes = COALESCE(?, duration_minutes), dentist_id = COALESCE(?, dentist_id),
          type = COALESCE(?, type), reason = COALESCE(?, reason), status = COALESCE(?, status),
          notes = COALESCE(?, notes), reminder_enabled = COALESCE(?, reminder_enabled), updated_at = ?
         WHERE id = ?`,
      )
      .run(
        input.apptDate ?? null,
        input.startTime ?? null,
        input.durationMinutes ?? null,
        input.dentistId === undefined ? null : input.dentistId,
        input.type ?? null,
        input.reason === undefined ? null : input.reason,
        input.status ?? null,
        input.notes === undefined ? null : input.notes,
        input.reminderEnabled === undefined ? null : (input.reminderEnabled ? 1 : 0),
        now,
        id,
      );
  });
  core.audit('appointment.updated', 'appointment', existing.code, changed, actor);
  return getAppointment(core, id)!;
}

export function cancelAppointment(core: Core, actor: Actor, id: number, asNoShow: boolean): Appointment {
  const existing = getAppointment(core, id);
  if (!existing) throw ApiError.notFound('appointment', id);
  if (!['scheduled', 'confirmed', 'arrived', 'waiting', 'rescheduled'].includes(existing.status)) {
    throw ApiError.state(`An appointment that is already ${existing.status} cannot be cancelled.`);
  }
  core.tx(() => {
    core.db.prepare('UPDATE appointments SET status = ?, updated_at = ? WHERE id = ?').run(asNoShow ? 'no_show' : 'cancelled', nowIso(), id);
  });
  core.audit(asNoShow ? 'appointment.no_show' : 'appointment.cancelled', 'appointment', existing.code, null, actor);
  return getAppointment(core, id)!;
}

// ================================================================ QUEUE

const QUEUE_SELECT = `
  SELECT q.*, pat.full_name AS patientName, pat.code AS patientCode, d.name AS dentistName, a.id AS apptRef
  FROM queue_entries q
  JOIN patients pat ON pat.id = q.patient_id
  LEFT JOIN dentists d ON d.id = (SELECT dentist_id FROM appointments WHERE id = q.appointment_id)
  LEFT JOIN appointments a ON a.id = q.appointment_id
`;

const rowToQueue = (r: Record<string, unknown>): QueueEntry => ({
  id: r.id as number,
  appointmentId: (r.appointment_id as number) ?? null,
  patientId: r.patient_id as number,
  patientName: r.patientName as string,
  patientCode: r.patientCode as string,
  dentistName: (r.dentistName as string) ?? null,
  queueNumber: r.queue_number as number,
  arrivedAt: r.arrived_at as string,
  calledAt: (r.called_at as string) ?? null,
  startedAt: (r.started_at as string) ?? null,
  completedAt: (r.completed_at as string) ?? null,
  status: r.status as string,
  notes: (r.notes as string) ?? '',
  updatedAt: r.updated_at as string,
});

export function listQueue(core: Core, date: string, includeFinished = true): QueueEntry[] {
  const rows = core.db
    .prepare(
      `${QUEUE_SELECT} WHERE date(q.arrived_at) = ? ${includeFinished ? '' : "AND q.status IN ('waiting','called','in_treatment')"} ORDER BY q.queue_number`,
    )
    .all(date) as Array<Record<string, unknown>>;
  return rows.map(rowToQueue);
}

export function addQueueEntry(core: Core, actor: Actor, input: { patientId: number; appointmentId?: number | null; notes?: string }): QueueEntry {
  const patient = core.db.prepare('SELECT code FROM patients WHERE id = ?').get(input.patientId) as { code: string } | undefined;
  if (!patient) throw ApiError.notFound('patient', input.patientId);
  const today = localDateStr();
  const dup = core.db
    .prepare(
      `SELECT q.id FROM queue_entries q WHERE q.patient_id = ? AND date(q.arrived_at) = ? AND q.status IN ('waiting','called','in_treatment')`,
    )
    .get(input.patientId, today) as { id: number } | undefined;
  if (dup) throw ApiError.duplicate('This patient is already in today\'s active queue.');

  let apptId = input.appointmentId ?? null;
  if (apptId) {
    const appt = core.db.prepare('SELECT id, appt_date, status FROM appointments WHERE id = ?').get(apptId) as { id: number; appt_date: string; status: string } | undefined;
    if (!appt) throw ApiError.notFound('appointment', apptId);
    if (!['scheduled', 'confirmed', 'arrived', 'waiting', 'rescheduled'].includes(appt.status)) {
      throw ApiError.state('This appointment is not in an actionable state.');
    }
    const alreadyQueued = core.db.prepare('SELECT id FROM queue_entries WHERE appointment_id = ?').get(apptId) as { id: number } | undefined;
    if (alreadyQueued) throw ApiError.duplicate('This appointment already has a queue entry.');
  } else {
    // auto-link an appointment if one exists for today and is not yet queued
    const linkable = core.db
      .prepare(
        `SELECT id FROM appointments WHERE patient_id = ? AND appt_date = ? AND status IN ('scheduled','confirmed','arrived','waiting','rescheduled')
         AND id NOT IN (SELECT appointment_id FROM queue_entries WHERE appointment_id IS NOT NULL) LIMIT 1`,
      )
      .get(input.patientId, today) as { id: number } | undefined;
    if (linkable) apptId = linkable.id;
  }

  const entry = core.tx(() => {
    const queueNumber = (core.db.prepare("SELECT COALESCE(MAX(queue_number), 0) AS m FROM queue_entries WHERE date(arrived_at) = ?").get(today) as { m: number }).m + 1;
    const r = core.db
      .prepare(
        `INSERT INTO queue_entries (appointment_id, patient_id, queue_number, arrived_at, status, notes, created_by, created_at, updated_at)
         VALUES (?, ?, ?, ?, 'waiting', ?, ?, ?, ?)`,
      )
      .run(apptId, input.patientId, queueNumber, nowIso(), input.notes ?? '', actor.userId, nowIso(), nowIso());
    if (apptId) {
      core.db.prepare("UPDATE appointments SET status = 'waiting', updated_at = ? WHERE id = ?").run(nowIso(), apptId);
    }
    const row = core.db.prepare(`${QUEUE_SELECT} WHERE q.id = ?`).get(Number(r.lastInsertRowid)) as Record<string, unknown>;
    return rowToQueue(row);
  });
  core.audit('queue.added', 'queue', String(entry.id), { patient: patient.code, number: entry.queueNumber }, actor);
  core.notify('info', 'queue', `Patient in queue: ${entry.patientName}`, `Queue number ${entry.queueNumber} — arrived ${new Date(entry.arrivedAt).toLocaleTimeString()}`, `/queue`);
  return entry;
}

export function setQueueStatus(core: Core, actor: Actor, id: number, status: 'waiting' | 'called' | 'in_treatment' | 'completed' | 'skipped' | 'cancelled'): QueueEntry {
  const existing = core.db.prepare(`${QUEUE_SELECT} WHERE q.id = ?`).get(id) as Record<string, unknown> | undefined;
  if (!existing) throw ApiError.notFound('queue entry', id);
  const now = nowIso();
  const allowed: Record<string, string[]> = {
    waiting: ['waiting', 'skipped', 'cancelled'],
    called: ['called', 'in_treatment', 'skipped', 'cancelled', 'waiting'],
    in_treatment: ['in_treatment', 'completed', 'skipped'],
    completed: ['completed'],
    skipped: ['skipped', 'waiting', 'cancelled'],
    cancelled: ['cancelled'],
  };
  const cur = existing.status as string;
  if (!allowed[cur]?.includes(status)) {
    throw ApiError.state(`Cannot move a ${cur} patient to ${status}.`);
  }
  core.tx(() => {
    const sets: string[] = ['status = ?', 'updated_at = ?'];
    const params: unknown[] = [status, now];
    if (status === 'called') {
      sets.push('called_at = ?');
      params.push(now);
    }
    if (status === 'in_treatment') {
      sets.push('started_at = ?');
      params.push(now);
    }
    if (status === 'completed') {
      sets.push('completed_at = ?');
      params.push(now);
    }
    params.push(id);
    core.db.prepare(`UPDATE queue_entries SET ${sets.join(', ')} WHERE id = ?`).run(...params);
    const apptId = existing.appointment_id as number | null;
    if (apptId) {
      const apptStatus = status === 'called' ? 'arrived' : status === 'in_treatment' ? 'in_treatment' : status === 'completed' ? 'completed' : status;
      core.db.prepare('UPDATE appointments SET status = ?, updated_at = ? WHERE id = ?').run(apptStatus, now, apptId);
    }
  });
  core.audit('queue.status_changed', 'queue', String(id), { from: cur, to: status }, actor);
  const row = core.db.prepare(`${QUEUE_SELECT} WHERE q.id = ?`).get(id) as Record<string, unknown>;
  return rowToQueue(row);
}
