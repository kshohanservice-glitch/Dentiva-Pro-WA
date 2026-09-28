import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import type { Core, Actor } from '../core';
import { ApiError } from './errors';
import { nowIso } from '../../shared/date';
import type { StaffMember } from '../../shared/types';

const rowToStaff = (r: Record<string, unknown>, includeSensitive: boolean, attachmentsRoot: string): StaffMember => {
  const photoPath = (r.photo_path as string) || null;
  let photoDataUrl: string | null = null;
  if (photoPath) {
    const file = path.join(attachmentsRoot, photoPath);
    if (fs.existsSync(file)) photoDataUrl = `data:image/png;base64,${fs.readFileSync(file).toString('base64')}`;
  }
  return {
    id: r.id as number,
    fullName: r.full_name as string,
    age: (r.age as number) ?? null,
    dob: (r.dob as string) ?? null,
    gender: (r.gender as string) ?? '',
    address: (r.address as string) ?? '',
    phone: (r.phone as string) ?? '',
    emergencyContact: (r.emergency_contact as string) ?? '',
    emergencyPhone: (r.emergency_phone as string) ?? '',
    bloodGroup: (r.blood_group as string) ?? '',
    idNumber: includeSensitive ? ((r.id_number as string) ?? null) : null,
    photoDataUrl,
    department: (r.department as string) ?? '',
    position: (r.position as string) ?? '',
    salaryPaise: includeSensitive ? ((r.salary as number) ?? null) : null,
    joiningDate: (r.joining_date as string) ?? null,
    status: r.status as StaffMember['status'],
    notes: (r.notes as string) ?? '',
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
  };
};

export function listStaff(core: Core, _actor: Actor, includeSensitive: boolean): StaffMember[] {
  const rows = core.db.prepare('SELECT * FROM staff ORDER BY full_name').all() as Array<Record<string, unknown>>;
  return rows.map((r) => rowToStaff(r, includeSensitive, core.paths.attachments));
}

export interface StaffInput {
  fullName: string;
  age?: number | null;
  dob?: string | null;
  gender?: string;
  address?: string;
  phone?: string;
  emergencyContact?: string;
  emergencyPhone?: string;
  bloodGroup?: string;
  idNumber?: string | null;
  department?: string;
  position?: string;
  salaryPaise?: number | null;
  joiningDate?: string | null;
  status?: StaffMember['status'];
  notes?: string;
  photoBase64?: string | null;
}

export function saveStaff(core: Core, actor: Actor, id: number | null, input: StaffInput, includeSensitive: boolean): StaffMember {
  if (!input.fullName.trim()) throw ApiError.validation('Staff name is required.');
  const sensitiveChanged =
    includeSensitive &&
    ((input.idNumber !== undefined && input.idNumber !== null) || input.salaryPaise !== undefined);
  if (sensitiveChanged && !actor.username) throw ApiError.forbidden('Sensitive staff data requires an authenticated session.');
  const now = nowIso();

  let photoPath: string | null = null;
  if (input.photoBase64) {
    const buf = Buffer.from(input.photoBase64, 'base64');
    if (buf.length > 2 * 1024 * 1024) throw ApiError.validation('Photo must be under 2 MB.');
    photoPath = `staff-${id ?? Date.now()}-${crypto.randomBytes(4).toString('hex')}.png`;
    fs.writeFileSync(path.join(core.paths.attachments, photoPath), buf);
  }

  let resultId = 0;
  core.tx(() => {
    if (id) {
      if (photoPath) {
        const existing = core.db.prepare('SELECT photo_path FROM staff WHERE id = ?').get(id) as { photo_path: string | null };
        if (existing.photo_path) {
          fs.rmSync(path.join(core.paths.attachments, existing.photo_path), { force: true });
        }
      }
      core.db
        .prepare(
          `UPDATE staff SET full_name = ?, age = ?, dob = ?, gender = ?, address = ?, phone = ?, emergency_contact = ?,
            emergency_phone = ?, blood_group = ?, id_number = ?, photo_path = COALESCE(?, photo_path), department = ?, position = ?,
            salary = ?, joining_date = ?, status = ?, notes = ?, updated_at = ? WHERE id = ?`,
        )
        .run(
          input.fullName.trim(),
          input.age ?? null,
          input.dob ?? null,
          input.gender ?? '',
          input.address ?? '',
          input.phone ?? '',
          input.emergencyContact ?? '',
          input.emergencyPhone ?? '',
          input.bloodGroup ?? '',
          includeSensitive ? (input.idNumber ?? null) : undefined,
          photoPath,
          input.department ?? '',
          input.position ?? '',
          includeSensitive ? (input.salaryPaise ?? null) : undefined,
          input.joiningDate ?? null,
          input.status ?? 'active',
          input.notes ?? '',
          now,
          id,
        );
      resultId = id;
    } else {
      const r = core.db
        .prepare(
          `INSERT INTO staff (full_name, age, dob, gender, address, phone, emergency_contact, emergency_phone, blood_group,
            id_number, photo_path, department, position, salary, joining_date, status, notes, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          input.fullName.trim(),
          input.age ?? null,
          input.dob ?? null,
          input.gender ?? '',
          input.address ?? '',
          input.phone ?? '',
          input.emergencyContact ?? '',
          input.emergencyPhone ?? '',
          input.bloodGroup ?? '',
          includeSensitive ? (input.idNumber ?? null) : null,
          photoPath,
          input.department ?? '',
          input.position ?? '',
          includeSensitive ? (input.salaryPaise ?? null) : null,
          input.joiningDate ?? null,
          input.status ?? 'active',
          input.notes ?? '',
          now,
          now,
        );
      resultId = Number(r.lastInsertRowid);
    }
  });
  core.audit('staff.saved', 'staff', String(resultId), { name: input.fullName, sensitive: includeSensitive }, actor);
  const row = core.db.prepare('SELECT * FROM staff WHERE id = ?').get(resultId) as Record<string, unknown>;
  return rowToStaff(row, includeSensitive, core.paths.attachments);
}

export function deleteStaff(core: Core, actor: Actor, id: number): void {
  const row = core.db.prepare('SELECT * FROM staff WHERE id = ?').get(id) as Record<string, unknown> | undefined;
  if (!row) throw ApiError.notFound('staff member', id);
  core.tx(() => {
    if (row.photo_path) fs.rmSync(path.join(core.paths.attachments, row.photo_path as string), { force: true });
    core.db.prepare('DELETE FROM attachments WHERE staff_id = ?').run(id);
    core.db.prepare('DELETE FROM staff WHERE id = ?').run(id);
  });
  core.audit('staff.deleted', 'staff', String(id), { name: row.full_name }, actor);
}
