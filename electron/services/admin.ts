import fs from 'node:fs';
import path from 'node:path';
import type { Core, Actor } from '../core';
import { ApiError } from './errors';
import { hashPassword, validatePasswordPolicy, verifyPassword } from '../security';
import { nowIso, localDateStr } from '../../shared/date';
import { APP_VERSION, SCHEMA_VERSION, PAPER_PRESETS } from '../../shared/constants';
import { PERMISSIONS, ALL_PERMISSION_KEYS } from '../../shared/permissions';
import type { Clinic, Dentist, UserSummary, RoleDef, PrinterProfile, AuditEntry, SetupPayload } from '../../shared/types';

export type { SetupPayload } from '../../shared/types';

// ================================================================ USERS

const USER_SELECT = `
  SELECT u.*, (SELECT GROUP_CONCAT(r.name, ', ') FROM roles r JOIN user_roles ur ON ur.role_id = r.id WHERE ur.user_id = u.id) AS roleNames
  FROM users u
`;

const rowToUser = (r: Record<string, unknown>): UserSummary => ({
  id: r.id as number,
  username: r.username as string,
  displayName: r.display_name as string,
  isOwner: !!(r.is_owner as number),
  active: !!(r.active as number),
  roles: (r.roleNames as string) ? ((r.roleNames as string).split(', ') as string[]) : [],
  lastLoginAt: (r.last_login_at as string) ?? null,
  createdAt: r.created_at as string,
});

export function listUsers(core: Core): UserSummary[] {
  const rows = core.db.prepare(`${USER_SELECT} ORDER BY u.username`).all() as Array<Record<string, unknown>>;
  return rows.map(rowToUser);
}

export function listRoles(core: Core): RoleDef[] {
  const rows = core.db.prepare('SELECT * FROM roles ORDER BY name').all() as Array<Record<string, unknown>>;
  return rows.map((r) => {
    const perms = (core.db.prepare('SELECT perm_key FROM role_permissions WHERE role_id = ?').all(r.id as number) as Array<{ perm_key: string }>).map((p) => p.perm_key);
    const userCount = (core.db.prepare('SELECT COUNT(*) AS c FROM user_roles WHERE role_id = ?').get(r.id as number) as { c: number }).c;
    return { id: r.id as number, name: r.name as string, description: (r.description as string) ?? '', isSystem: !!(r.is_system as number), permissions: perms, userCount };
  });
}

export function listPermissions(): Array<{ key: string; category: string; label: string }> {
  return PERMISSIONS.map((p) => ({ key: p.key, category: p.category, label: p.label }));
}

export interface UserInput {
  id?: number;
  username: string;
  displayName: string;
  password?: string;
  roleIds: number[];
  active?: boolean;
}

export function saveUser(core: Core, actor: Actor, input: UserInput): UserSummary {
  const uname = (input.username || '').trim();
  if (!/^[a-zA-Z0-9._-]{3,32}$/.test(uname)) throw ApiError.validation('Username must be 3-32 characters (letters, numbers, dot, dash, underscore).');
  if (!input.displayName.trim()) throw ApiError.validation('Display name is required.');
  if (!input.roleIds?.length) throw ApiError.validation('Assign at least one role.');

  const existing = input.id ? (core.db.prepare('SELECT * FROM users WHERE id = ?').get(input.id) as Record<string, unknown> | undefined) : undefined;
  if (input.id && !existing) throw ApiError.notFound('user', input.id);

  // Owner protections
  if (existing && existing.is_owner && actor.userId !== (existing.id as number)) {
    throw ApiError.forbidden('The owner account can only be modified by the owner.');
  }
  if (existing?.is_owner && input.active === false) {
    throw ApiError.state('The owner account cannot be deactivated.');
  }
  const actorIsOwner =
    !!actor.userId &&
    ((core.db.prepare('SELECT is_owner FROM users WHERE id = ?').get(actor.userId) as { is_owner: number } | undefined)?.is_owner === 1);
  if (existing?.is_owner) {
    if (!input.roleIds.includes(ownerRoleId(core))) throw ApiError.state('The owner account must keep the Owner role.');
  }
  if (!existing && input.roleIds.includes(ownerRoleId(core)) && !actorIsOwner) {
    throw ApiError.forbidden('Only the owner can assign the Owner role.');
  }

  const dup = core.db.prepare('SELECT id FROM users WHERE username = ? COLLATE NOCASE AND id != ?').get(uname, input.id ?? -1) as { id: number } | undefined;
  if (dup) throw ApiError.duplicate(`The username "${uname}" is already taken.`);

  if (!existing && !input.password) throw ApiError.validation('A password is required for a new user.');
  if (input.password) {
    const policy = validatePasswordPolicy(input.password);
    if (policy) throw ApiError.validation(policy);
  }

  const now = nowIso();
  let userId = 0;
  core.tx(() => {
    if (existing) {
      core.db
        .prepare('UPDATE users SET username = ?, display_name = ?, active = ?, updated_at = ? WHERE id = ?')
        .run(uname, input.displayName.trim(), (input.active ?? true) ? 1 : 0, now, input.id);
      userId = input.id as number;
      if (input.password) {
        core.db.prepare('UPDATE users SET password_hash = ?, must_change_password = 0 WHERE id = ?').run(hashPassword(input.password), input.id);
      }
      core.db.prepare('DELETE FROM user_roles WHERE user_id = ?').run(input.id);
      for (const rid of input.roleIds) core.db.prepare('INSERT OR IGNORE INTO user_roles (user_id, role_id) VALUES (?, ?)').run(input.id, rid);
    } else {
      const r = core.db
        .prepare('INSERT INTO users (username, display_name, password_hash, is_owner, active, must_change_password, created_at, updated_at) VALUES (?, ?, ?, 0, 1, ?, ?, ?)')
        .run(uname, input.displayName.trim(), hashPassword(input.password!), 0, now, now);
      userId = Number(r.lastInsertRowid);
      for (const rid of input.roleIds) core.db.prepare('INSERT OR IGNORE INTO user_roles (user_id, role_id) VALUES (?, ?)').run(userId, rid);
    }
  });
  core.audit(input.id ? 'user.updated' : 'user.created', 'user', uname, { roles: input.roleIds, by: actor.username }, actor);
  return listUsers(core).find((u) => u.id === userId)!;
}

function ownerRoleId(core: Core): number {
  const r = core.db.prepare("SELECT id FROM roles WHERE name = 'Owner'").get() as { id: number };
  return r.id;
}

export function deleteUser(core: Core, actor: Actor, id: number): void {
  const existing = core.db.prepare('SELECT * FROM users WHERE id = ?').get(id) as Record<string, unknown> | undefined;
  if (!existing) throw ApiError.notFound('user', id);
  if (existing.is_owner) throw ApiError.state('The owner account cannot be deleted.');
  if (id === actor.userId) throw ApiError.state('You cannot delete your own account while signed in.');
  core.tx(() => {
    core.db.prepare('DELETE FROM user_roles WHERE user_id = ?').run(id);
    core.db.prepare('DELETE FROM users WHERE id = ?').run(id);
  });
  core.audit('user.deleted', 'user', String(id), { username: existing.username, by: actor.username }, actor);
}

export function changeOwnPassword(core: Core, actor: Actor, current: string, next: string): void {
  const row = core.db.prepare('SELECT password_hash FROM users WHERE id = ?').get(actor.userId) as { password_hash: string };
  if (!verifyPassword(current, row.password_hash)) throw ApiError.validation('Current password is incorrect.');
  const policy = validatePasswordPolicy(next);
  if (policy) throw ApiError.validation(policy);
  core.tx(() => {
    core.db.prepare('UPDATE users SET password_hash = ?, must_change_password = 0, updated_at = ? WHERE id = ?').run(hashPassword(next), nowIso(), actor.userId);
  });
  core.audit('password.changed', 'user', actor.username, null, actor);
}

// ================================================================ ROLES

export function saveRole(core: Core, actor: Actor, input: { id?: number; name: string; description: string; permissions: string[] }): RoleDef {
  const name = (input.name || '').trim();
  if (name.length < 2 || name.length > 40) throw ApiError.validation('Role name must be 2-40 characters.');
  const known = new Set(ALL_PERMISSION_KEYS);
  for (const p of input.permissions) {
    if (!known.has(p)) throw ApiError.validation(`Unknown permission: ${p}`);
  }
  const now = nowIso();
  let roleId: number;
  core.tx(() => {
    if (input.id) {
      const existing = core.db.prepare('SELECT * FROM roles WHERE id = ?').get(input.id) as Record<string, unknown> | undefined;
      if (!existing) throw ApiError.notFound('role', input.id);
      if (existing.name === 'Owner') throw ApiError.state('The Owner role is fixed and always has all permissions.');
      const dup = core.db.prepare('SELECT id FROM roles WHERE name = ? COLLATE NOCASE AND id != ?').get(name, input.id) as { id: number } | undefined;
      if (dup) throw ApiError.duplicate('A role with this name already exists.');
      core.db.prepare('UPDATE roles SET name = ?, description = ? WHERE id = ?').run(name, input.description, input.id);
      core.db.prepare('DELETE FROM role_permissions WHERE role_id = ?').run(input.id);
      for (const p of input.permissions) core.db.prepare('INSERT OR IGNORE INTO role_permissions (role_id, perm_key) VALUES (?, ?)').run(input.id, p);
      roleId = input.id;
    } else {
      const dup = core.db.prepare('SELECT id FROM roles WHERE name = ? COLLATE NOCASE').get(name) as { id: number } | undefined;
      if (dup) throw ApiError.duplicate('A role with this name already exists.');
      const r = core.db.prepare('INSERT INTO roles (name, description, is_system, created_at) VALUES (?, ?, 0, ?)').run(name, input.description, now);
      roleId = Number(r.lastInsertRowid);
      for (const p of input.permissions) core.db.prepare('INSERT OR IGNORE INTO role_permissions (role_id, perm_key) VALUES (?, ?)').run(roleId, p);
    }
  });
  core.audit('role.saved', 'role', name, { permissionCount: input.permissions.length, by: actor.username }, actor);
  core.notify('warning', 'security', `Role changed: ${name}`, 'Permission assignments may have changed. Affected users take effect on their next login.', null, `role-${name}-${localDateStr()}`);
  return listRoles(core).find((r) => r.id === roleId)!;
}

export function deleteRole(core: Core, actor: Actor, id: number): void {
  const r = core.db.prepare('SELECT * FROM roles WHERE id = ?').get(id) as Record<string, unknown> | undefined;
  if (!r) throw ApiError.notFound('role', id);
  if (r.is_system) throw ApiError.state('System roles cannot be deleted. You can edit their permissions or deactivate users instead.');
  const users = (core.db.prepare('SELECT COUNT(*) AS c FROM user_roles WHERE role_id = ?').get(id) as { c: number }).c;
  if (users > 0) throw ApiError.state(`${users} user(s) have this role. Reassign them first.`);
  core.tx(() => {
    core.db.prepare('DELETE FROM roles WHERE id = ?').run(id);
  });
  core.audit('role.deleted', 'role', String(id), { name: r.name }, actor);
}

// ================================================================ CLINIC

export function getClinic(core: Core): Clinic {
  const r = core.db.prepare('SELECT * FROM clinic WHERE id = 1').get() as Record<string, unknown>;
  let logoDataUrl: string | null = null;
  if (r.logo_path) {
    const file = path.join(core.paths.config, r.logo_path as string);
    if (fs.existsSync(file)) logoDataUrl = `data:image/png;base64,${fs.readFileSync(file).toString('base64')}`;
  }
  return {
    id: 1,
    name: r.name as string,
    logoDataUrl,
    address: (r.address as string) ?? '',
    phone: (r.phone as string) ?? '',
    email: (r.email as string) ?? '',
    registrationNo: (r.registration_no as string) ?? '',
    consultationHours: (r.consultation_hours as string) ?? '',
    prescriptionFooter: (r.prescription_footer as string) ?? '',
    currency: r.currency as string,
    currencySymbol: r.currency_symbol as string,
    dateFormat: r.date_format as string,
    timeFormat: r.time_format as string,
    numberingSystem: r.numbering_system as 'fdi' | 'universal',
    updatedAt: r.updated_at as string,
  };
}

export function saveClinic(core: Core, actor: Actor, input: Partial<Clinic> & { logoBase64?: string | null }): Clinic {
  const now = nowIso();
  let logoPath: string | null | undefined = undefined; // undefined = keep
  if (input.logoBase64 === null) {
    logoPath = null;
  } else if (input.logoBase64) {
    const buf = Buffer.from(input.logoBase64.split(',')[1] ?? input.logoBase64, 'base64');
    if (buf.length > 2 * 1024 * 1024) throw ApiError.validation('Logo must be under 2 MB.');
    logoPath = `clinic-logo-${Date.now()}.png`;
    fs.writeFileSync(path.join(core.paths.config, logoPath), buf);
  }
  core.tx(() => {
    core.db
      .prepare(
        `UPDATE clinic SET name = ?, address = ?, phone = ?, email = ?, registration_no = ?, consultation_hours = ?,
          prescription_footer = ?, currency_symbol = ?, date_format = ?, time_format = ?, numbering_system = ?,
          logo_path = COALESCE(?, logo_path), updated_at = ? WHERE id = 1`,
      )
      .run(
        input.name ?? '',
        input.address ?? '',
        input.phone ?? '',
        input.email ?? '',
        input.registrationNo ?? '',
        input.consultationHours ?? '',
        input.prescriptionFooter ?? '',
        input.currencySymbol ?? '৳',
        input.dateFormat ?? 'DD/MM/YYYY',
        input.timeFormat ?? '24h',
        input.numberingSystem ?? 'fdi',
        logoPath ?? null,
        now,
      );
  });
  core.audit('settings.clinic_updated', 'clinic', '1', { name: input.name }, actor);
  return getClinic(core);
}

// ================================================================ DENTISTS

const rowToDentist = (r: Record<string, unknown>): Dentist => ({
  id: r.id as number,
  name: r.name as string,
  designations: (r.designations as string) ?? '',
  qualifications: (r.qualifications as string) ?? '',
  registrationNo: (r.registration_no as string) ?? '',
  phone: (r.phone as string) ?? '',
  consultationHours: (r.consultation_hours as string) ?? '',
  active: !!(r.active as number),
  createdAt: r.created_at as string,
  updatedAt: r.updated_at as string,
});

export function listDentists(core: Core, includeInactive = true): Dentist[] {
  const rows = core.db.prepare(`SELECT * FROM dentists ${includeInactive ? '' : 'WHERE active = 1'} ORDER BY name`).all() as Array<Record<string, unknown>>;
  return rows.map(rowToDentist);
}

export function saveDentist(core: Core, actor: Actor, input: { id?: number; name: string; designations?: string; qualifications?: string; registrationNo?: string; phone?: string; consultationHours?: string; active?: boolean }): Dentist {
  if (!input.name.trim()) throw ApiError.validation('Dentist name is required.');
  const now = nowIso();
  let id = input.id ?? 0;
  core.tx(() => {
    if (input.id) {
      core.db
        .prepare('UPDATE dentists SET name = ?, designations = ?, qualifications = ?, registration_no = ?, phone = ?, consultation_hours = ?, active = ?, updated_at = ? WHERE id = ?')
        .run(input.name.trim(), input.designations ?? '', input.qualifications ?? '', input.registrationNo ?? '', input.phone ?? '', input.consultationHours ?? '', (input.active ?? true) ? 1 : 0, now, input.id);
      id = input.id;
    } else {
      const r = core.db.prepare('INSERT INTO dentists (name, designations, qualifications, registration_no, phone, consultation_hours, active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)')
        .run(input.name.trim(), input.designations ?? '', input.qualifications ?? '', input.registrationNo ?? '', input.phone ?? '', input.consultationHours ?? '', now, now);
      id = Number(r.lastInsertRowid);
    }
  });
  core.audit('dentist.saved', 'dentist', String(id), { name: input.name }, actor);
  const row = core.db.prepare('SELECT * FROM dentists WHERE id = ?').get(id) as Record<string, unknown>;
  return rowToDentist(row);
}

// ================================================================ SETTINGS

export function getAllSettings(core: Core): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const rows = core.db.prepare('SELECT key, value FROM settings').all() as Array<{ key: string; value: string }>;
  for (const r of rows) {
    try {
      out[r.key] = JSON.parse(r.value);
    } catch {
      out[r.key] = r.value;
    }
  }
  return out;
}

export function saveSettings(core: Core, actor: Actor, patch: Record<string, unknown>): Record<string, unknown> {
  core.tx(() => {
    for (const [k, v] of Object.entries(patch)) core.settingSet(k, v, actor);
  });
  return getAllSettings(core);
}

// ================================================================ PRINTER PROFILES

const rowToProfile = (r: Record<string, unknown>): PrinterProfile => ({
  id: r.id as number,
  name: r.name as string,
  paper: r.paper as string,
  widthMm: r.width_mm as number,
  heightMm: (r.height_mm as number) ?? null,
  marginTopMm: r.margin_top_mm as number,
  marginBottomMm: r.margin_bottom_mm as number,
  marginLeftMm: r.margin_left_mm as number,
  marginRightMm: r.margin_right_mm as number,
  orientation: r.orientation as 'portrait' | 'landscape',
  scale: r.scale as number,
  fitToWidth: !!(r.fit_to_width as number),
  printerName: (r.printer_name as string) ?? '',
  isDefault: !!(r.is_default as number),
  createdAt: r.created_at as string,
});

export function listPrinterProfiles(core: Core): PrinterProfile[] {
  const rows = core.db.prepare('SELECT * FROM printer_profiles ORDER BY is_default DESC, id').all() as Array<Record<string, unknown>>;
  return rows.map(rowToProfile);
}

export function savePrinterProfile(core: Core, actor: Actor, input: Partial<PrinterProfile> & { name: string; paper: string }): PrinterProfile {
  if (!input.name.trim()) throw ApiError.validation('Profile name is required.');
  if (input.widthMm === undefined || input.widthMm < 30 || input.widthMm > 500) throw ApiError.validation('Width must be between 30 and 500 mm.');
  const preset = PAPER_PRESETS.find((p) => p.key === input.paper);
  const now = nowIso();
  let id = input.id ?? 0;
  core.tx(() => {
    const widthMm = input.widthMm ?? preset?.widthMm ?? 210;
    const heightMm = input.paper === 'Thermal80' || input.paper === 'Thermal58' ? null : (input.heightMm ?? preset?.heightMm ?? 297);
    const m = preset?.margins ?? { top: 10, right: 10, bottom: 10, left: 10 };
    if (input.id) {
      const dup = core.db.prepare('SELECT id FROM printer_profiles WHERE name = ? COLLATE NOCASE AND id != ?').get(input.name.trim(), input.id) as { id: number } | undefined;
      if (dup) throw ApiError.duplicate('A profile with this name already exists.');
      core.db
        .prepare(
          `UPDATE printer_profiles SET name = ?, paper = ?, width_mm = ?, height_mm = ?, margin_top_mm = ?, margin_bottom_mm = ?,
            margin_left_mm = ?, margin_right_mm = ?, orientation = ?, scale = ?, fit_to_width = ?, printer_name = ?, is_default = ?
           WHERE id = ?`,
        )
        .run(
          input.name.trim(), input.paper, widthMm, heightMm,
          input.marginTopMm ?? m.top, input.marginBottomMm ?? m.bottom,
          input.marginLeftMm ?? m.left, input.marginRightMm ?? m.right,
          input.orientation ?? 'portrait', input.scale ?? 100, input.fitToWidth ? 1 : 0, input.printerName ?? '', input.isDefault ? 1 : 0, input.id,
        );
      if (input.isDefault) core.db.prepare('UPDATE printer_profiles SET is_default = 0 WHERE id != ?').run(input.id);
      id = input.id;
    } else {
      const dup = core.db.prepare('SELECT id FROM printer_profiles WHERE name = ? COLLATE NOCASE').get(input.name.trim()) as { id: number } | undefined;
      if (dup) throw ApiError.duplicate('A profile with this name already exists.');
      const r = core.db
        .prepare(
          `INSERT INTO printer_profiles (name, paper, width_mm, height_mm, margin_top_mm, margin_bottom_mm, margin_left_mm, margin_right_mm, orientation, scale, fit_to_width, printer_name, is_default, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(input.name.trim(), input.paper, widthMm, heightMm, m.top, m.bottom, m.left, m.right, 'portrait', 100, 0, '', 0, now);
      id = Number(r.lastInsertRowid);
    }
  });
  core.audit('settings.printer_profile', 'printer', String(id), { name: input.name }, actor);
  const row = core.db.prepare('SELECT * FROM printer_profiles WHERE id = ?').get(id) as Record<string, unknown>;
  return rowToProfile(row);
}

export function deletePrinterProfile(core: Core, actor: Actor, id: number): void {
  const row = core.db.prepare('SELECT * FROM printer_profiles WHERE id = ?').get(id) as Record<string, unknown> | undefined;
  if (!row) throw ApiError.notFound('printer profile', id);
  if (row.is_default) throw ApiError.state('Make another profile the default before deleting this one.');
  core.tx(() => {
    core.db.prepare('DELETE FROM printer_profiles WHERE id = ?').run(id);
  });
  core.audit('settings.printer_profile_deleted', 'printer', String(id), null, actor);
}

// ================================================================ AUDIT LOG

export function listAudit(core: Core, f: { q?: string; from?: string; to?: string; action?: string; page?: number; pageSize?: number } = {}): { items: AuditEntry[]; total: number } {
  const where: string[] = [];
  const params: unknown[] = [];
  if (f.q) {
    where.push('(username LIKE ? OR action LIKE ? OR entity LIKE ? OR context LIKE ?)');
    params.push(`%${f.q}%`, `%${f.q}%`, `%${f.q}%`, `%${f.q}%`);
  }
  if (f.from) {
    where.push('timestamp >= ?');
    params.push(f.from + 'T00:00:00.000Z');
  }
  if (f.to) {
    where.push('timestamp <= ?');
    params.push(f.to + 'T23:59:59.999Z');
  }
  if (f.action) {
    where.push('action = ?');
    params.push(f.action);
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const total = (core.db.prepare(`SELECT COUNT(*) AS c FROM audit_logs ${whereSql}`).get(...params) as { c: number }).c;
  const rows = core.db
    .prepare(`SELECT * FROM audit_logs ${whereSql} ORDER BY timestamp DESC, id DESC LIMIT ? OFFSET ?`)
    .all(...params, Math.min(500, f.pageSize ?? 100), (Math.max(1, f.page ?? 1) - 1) * (f.pageSize ?? 100)) as Array<Record<string, unknown>>;
  return {
    total,
    items: rows.map((r) => ({
      id: r.id as number,
      timestamp: r.timestamp as string,
      username: (r.username as string) ?? null,
      roleName: (r.role_name as string) ?? null,
      action: r.action as string,
      entity: r.entity as string,
      entityId: (r.entity_id as string) ?? null,
      context: (r.context as string) ?? null,
      result: r.result as string,
    })),
  };
}

export function listAuditActions(core: Core): string[] {
  const rows = core.db.prepare('SELECT DISTINCT action FROM audit_logs ORDER BY action').all() as Array<{ action: string }>;
  return rows.map((r) => r.action);
}

// ================================================================ APP / ACTIVATION / SETUP

export function appInfo(core: Core) {
  return {
    version: APP_VERSION,
    activated: core.metaGet('activated', '0') === '1',
    setupComplete: core.metaGet('setup_complete', '0') === '1',
    activatedAt: core.metaGet('activated_at', '') || null,
    dataDir: core.paths.root,
    dbSizeBytes: core.dbSizeBytes(),
    attachmentCount: core.attachmentCount(),
    lastBackupAt: core.settingGet<string | null>('backup.last_at', null),
    lastBackupStatus: core.settingGet<string | null>('backup.last_status', null),
  };
}

export function activate(core: Core, _code: string): void {
  if (core.metaGet('activated', '0') === '1') throw ApiError.state('This installation is already activated.');
  // checkActivationCode is imported in ipc layer; here we persist after validation
  core.metaSet('activated', '1');
  core.metaSet('activated_at', nowIso());
  core.audit('activation.success', 'system', null, null, NO_ACTOR_LOCAL);
}
const NO_ACTOR_LOCAL = { userId: null, username: null, roleName: null };

export interface SetupDentistInput {
  name: string;
  designations: string;
  qualifications: string;
  registrationNo: string;
  phone: string;
  consultationHours: string;
}

export function completeSetup(core: Core, payload: SetupPayload): void {
  if (core.metaGet('setup_complete', '0') === '1') throw ApiError.state('Setup is already complete.');
  if (!payload.clinic?.name?.trim()) throw ApiError.validation('Clinic name is required.');
  if (!payload.dentists?.length || !payload.dentists[0]?.name?.trim()) throw ApiError.validation('At least one dentist with a name is required.');
  const uname = (payload.admin?.username ?? '').trim();
  if (!/^[a-zA-Z0-9._-]{3,32}$/.test(uname)) throw ApiError.validation('Admin username must be 3-32 characters (letters, numbers, dot, dash, underscore).');
  const policy = validatePasswordPolicy(payload.admin?.password ?? '');
  if (policy) throw ApiError.validation(policy);

  const now = nowIso();
  core.tx(() => {
    // clinic
    let logoPath: string | null = null;
    if (payload.clinic.logoBase64) {
      const buf = Buffer.from(payload.clinic.logoBase64.split(',')[1] ?? payload.clinic.logoBase64, 'base64');
      if (buf.length <= 2 * 1024 * 1024) {
        logoPath = 'clinic-logo.png';
        fs.writeFileSync(path.join(core.paths.config, logoPath), buf);
      }
    }
    core.db
      .prepare(
        `UPDATE clinic SET name = ?, address = ?, phone = ?, email = ?, consultation_hours = ?, logo_path = ?, date_format = ?, time_format = ?, numbering_system = ?, updated_at = ? WHERE id = 1`,
      )
      .run(
        payload.clinic.name.trim(),
        payload.clinic.address ?? '',
        payload.clinic.phone ?? '',
        payload.clinic.email ?? '',
        payload.clinic.consultationHours ?? '',
        logoPath,
        payload.preferences?.dateFormat ?? 'DD/MM/YYYY',
        payload.preferences?.timeFormat ?? '24h',
        payload.preferences?.numberingSystem ?? 'fdi',
        now,
      );
    // dentists
    const insD = core.db.prepare(
      'INSERT INTO dentists (name, designations, qualifications, registration_no, phone, consultation_hours, active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)',
    );
    for (const d of payload.dentists) {
      insD.run(d.name.trim(), d.designations ?? '', d.qualifications ?? '', d.registrationNo ?? '', d.phone ?? '', d.consultationHours ?? '', now, now);
    }
    // admin user with Owner role
    const ownerRole = core.db.prepare("SELECT id FROM roles WHERE name = 'Owner'").get() as { id: number };
    const r = core.db
      .prepare('INSERT INTO users (username, display_name, password_hash, is_owner, active, must_change_password, failed_logins, created_at, updated_at) VALUES (?, ?, ?, 1, 1, 0, 0, ?, ?)')
      .run(uname, payload.admin.displayName?.trim() || uname, hashPassword(payload.admin.password), now, now);
    core.db.prepare('INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)').run(Number(r.lastInsertRowid), ownerRole.id);
    // security + backup settings
    core.settingSet('security.auto_lock_minutes', payload.security?.autoLockMinutes ?? 15, NO_ACTOR_LOCAL);
    core.settingSet('security.failed_login_limit', payload.security?.failedLoginLimit ?? 5, NO_ACTOR_LOCAL);
    core.settingSet('security.account_lock_minutes', payload.security?.accountLockMinutes ?? 15, NO_ACTOR_LOCAL);
    if (payload.backup?.destination) {
      try {
        fs.mkdirSync(payload.backup.destination, { recursive: true });
      } catch (e) {
        throw ApiError.file(`Backup destination is not usable: ${String(e)}`);
      }
    }
    core.settingSet('backup.interval_days', payload.backup?.intervalDays ?? 7, NO_ACTOR_LOCAL);
    core.metaSet('setup_complete', '1');
  });
  core.audit('setup.completed', 'system', null, { clinic: payload.clinic.name, admin: uname, dentists: payload.dentists.length }, NO_ACTOR_LOCAL);
}

export function schemaVersion(core: Core): number {
  return parseInt(core.metaGet('schema_version', '0'), 10);
}

export { SCHEMA_VERSION };
