/**
 * RBAC matrix — enforced by the same production dispatch path that ships
 * (invokeHandler in electron/ipc.ts): session check → lock check →
 * permission gate → handler. The renderer can never assert identity; every
 * operation is gated here in the main process.
 *
 * The matrix below mirrors the seeded roles in shared/permissions.ts.
 * Financial restrictions (receptionists record but never void payments,
 * dentists invoice but never touch money, nurses see no billing) are asserted
 * explicitly, because those are the money-safety boundaries.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import os from 'node:os';

vi.mock('electron', () => ({
  ipcMain: { handle: () => {} },
  BrowserWindow: class {},
  dialog: { showOpenDialog: async () => ({ canceled: true, filePaths: [] }) },
  app: { getPath: () => os.tmpdir() },
  shell: { openPath: async () => '' },
}));

import { invokeHandler } from '../electron/ipc';
import { SessionManager } from '../electron/services/session';
import * as admin from '../electron/services/admin';
import * as staff from '../electron/services/staff';
import { makeFixture, makePatient, cleanup, type Fixture } from './helpers';
import type { ApiResult } from '../shared/types';

let f: Fixture;
beforeEach(() => {
  f = makeFixture();
});
afterEach(() => cleanup(f));

function invoke(sess: SessionManager, channel: string, args?: unknown): Promise<ApiResult<unknown>> {
  return invokeHandler(f.core, sess, channel, args);
}

function code(r: ApiResult<unknown>): string {
  if (r.ok) throw new Error('Expected the call to fail.');
  return r.error!.code;
}

function roleByName(name: string): number {
  return (f.core.db.prepare('SELECT id FROM roles WHERE name = ?').get(name) as { id: number }).id;
}

function makeUser(username: string, roleNames: string[]): void {
  admin.saveUser(f.core, f.actor, {
    username,
    displayName: username,
    password: 'User@12345',
    roleIds: roleNames.map(roleByName),
    active: true,
  });
}

function makeCustomRole(name: string, perms: string[]): number {
  const r = admin.saveRole(f.core, f.actor, { id: undefined, name, description: 'test role', permissions: perms });
  return r.id;
}

function makeUserWithRoleIds(username: string, roleIds: number[]): void {
  admin.saveUser(f.core, f.actor, { username, displayName: username, password: 'User@12345', roleIds, active: true });
}

function loginAs(username: string, password = 'User@12345'): SessionManager {
  const s = new SessionManager(f.core);
  s.login(username, password);
  return s;
}

beforeEach(() => {
  // shared test users for the matrix
  makeUser('dentist', ['Dentist']);
  makeUser('reception', ['Receptionist']);
  makeUser('nurse', ['Nurse/Assistant']);
  makeUser('accountant', ['Accountant']);
  makePatient(f.core, f.actor, { fullName: 'Matrix Patient' });
});

describe('session gate', () => {
  it('rejects every protected operation without a session (AUTH_REQUIRED), public ones still work', async () => {
    const anon = new SessionManager(f.core);
    const protectedChannels = ['patients.list', 'payments.record', 'invoices.list', 'backup.list', 'audit.list'];
    for (const ch of protectedChannels) {
      expect(code(await invoke(anon, ch))).toBe('AUTH_REQUIRED');
    }
    const info = await invoke(anon, 'app.info');
    expect(info.ok).toBe(true);
  });

  it('unknown channels return a VALIDATION error, not a crash', async () => {
    const r = await invoke(f.sess, 'no.such.channel');
    if (r.ok) throw new Error('expected the unknown channel to fail');
    expect(r.error.code).toBe('VALIDATION');
  });
});

describe('role matrix', () => {
  it('Owner can do everything', async () => {
    const day = new Date().toISOString().slice(0, 10);
    const r1 = await invoke(f.sess, 'patients.list', {});
    expect(r1.ok).toBe(true);
    const r2 = await invoke(f.sess, 'accounting.report', { from: '2020-01-01', to: day });
    expect(r2.ok).toBe(true);
    const r3 = await invoke(f.sess, 'users.list', {});
    expect(r3.ok).toBe(true);
    const r4 = await invoke(f.sess, 'audit.list', {});
    expect(r4.ok).toBe(true);
    const r5 = await invoke(f.sess, 'backup.list', {});
    expect(r5.ok).toBe(true);
  });

  it('Dentist: clinical + create invoices, but no payment entry, no voiding, no financial reports, no admin', async () => {
    const s = loginAs('dentist');
    const patientId = (f.core.db.prepare('SELECT id FROM patients LIMIT 1').get() as { id: number }).id;
    expect((await invoke(s, 'patients.list', {})).ok).toBe(true);
    expect((await invoke(s, 'visits.create', { patientId, chiefComplaint: 'Pain' })).ok).toBe(true);
    expect((await invoke(s, 'prescriptions.create', { patientId, items: [{ name: 'Paracetamol', dose: '1 tab', frequency: 'TDS', morning: true, noon: true, night: true }] })).ok).toBe(true);
    expect((await invoke(s, 'invoices.create', { patientId, items: [{ description: 'Filling', quantity: 1, unitPricePaise: 10000 }] })).ok).toBe(true);
    expect((await invoke(s, 'invoices.list', {})).ok).toBe(true);

    // financial boundary: dentists create invoices but cannot record/void payments or read reports
    expect(code(await invoke(s, 'payments.record', { patientId, amountPaise: 100, method: 'cash' }))).toBe('FORBIDDEN');
    expect(code(await invoke(s, 'payments.void', { id: 1, reason: 'x' }))).toBe('FORBIDDEN');
    expect(code(await invoke(s, 'invoices.void', { id: 1, reason: 'x' }))).toBe('FORBIDDEN');
    expect(code(await invoke(s, 'accounting.report', { from: '2026-01-01', to: '2026-12-31' }))).toBe('FORBIDDEN');
    expect(code(await invoke(s, 'invoices.outstanding', {}))).toBe('FORBIDDEN');
    expect(code(await invoke(s, 'users.list', {}))).toBe('FORBIDDEN');
  });

  it('Receptionist: front-desk billing entry, but can never void money or touch clinical records or accounting', async () => {
    const s = loginAs('reception');
    const patientId = (f.core.db.prepare('SELECT id FROM patients LIMIT 1').get() as { id: number }).id;
    expect((await invoke(s, 'patients.list', {})).ok).toBe(true);
    expect((await invoke(s, 'appointments.create', { patientId, apptDate: '2026-10-05', startTime: '10:00' })).ok).toBe(true);
    expect((await invoke(s, 'queue.add', { patientId })).ok).toBe(true);
    expect((await invoke(s, 'invoices.create', { patientId, items: [{ description: 'Scaling', quantity: 1, unitPricePaise: 1000 }] })).ok).toBe(true);
    expect((await invoke(s, 'payments.record', { patientId, amountPaise: 500, method: 'cash' })).ok).toBe(true);

    // the money-safety boundary: record but never void; no reports, no clinical, no admin
    expect(code(await invoke(s, 'payments.void', { id: 1, reason: 'x' }))).toBe('FORBIDDEN');
    expect(code(await invoke(s, 'invoices.void', { id: 1, reason: 'x' }))).toBe('FORBIDDEN');
    expect(code(await invoke(s, 'accounting.report', { from: '2026-01-01', to: '2026-12-31' }))).toBe('FORBIDDEN');
    expect(code(await invoke(s, 'accounting.create', { kind: 'expense', categoryId: 1, amountPaise: 100, description: 'x' }))).toBe('FORBIDDEN');
    expect(code(await invoke(s, 'visits.create', { patientId, chiefComplaint: 'x' }))).toBe('FORBIDDEN');
    expect(code(await invoke(s, 'chart.set', { patientId, toothId: 11, conditionKey: 'caries' }))).toBe('FORBIDDEN');
    expect(code(await invoke(s, 'settings.save', { patch: { backup_interval_days: 3 } }))).toBe('FORBIDDEN');
  });

  it('Nurse/Assistant: clinical support only — zero billing access', async () => {
    const s = loginAs('nurse');
    const patientId = (f.core.db.prepare('SELECT id FROM patients LIMIT 1').get() as { id: number }).id;
    expect((await invoke(s, 'patients.list', {})).ok).toBe(true);
    expect((await invoke(s, 'queue.add', { patientId })).ok).toBe(true);
    expect((await invoke(s, 'appointments.list', {})).ok).toBe(true);

    expect(code(await invoke(s, 'invoices.list', {}))).toBe('FORBIDDEN');
    expect(code(await invoke(s, 'invoices.create', { patientId, items: [{ description: 'x', quantity: 1, unitPricePaise: 1 }] }))).toBe('FORBIDDEN');
    expect(code(await invoke(s, 'payments.record', { patientId, amountPaise: 1, method: 'cash' }))).toBe('FORBIDDEN');
    expect(code(await invoke(s, 'payments.list', {}))).toBe('FORBIDDEN');
    expect(code(await invoke(s, 'prescriptions.create', { patientId, items: [{ name: 'x' }] }))).toBe('FORBIDDEN');
    expect(code(await invoke(s, 'visits.create', { patientId, chiefComplaint: 'x' }))).toBe('FORBIDDEN');
    expect(code(await invoke(s, 'chart.set', { patientId, toothId: 11, conditionKey: 'caries' }))).toBe('FORBIDDEN');
  });

  it('Accountant: full money access, zero clinical editing', async () => {
    const s = loginAs('accountant');
    expect((await invoke(s, 'invoices.list', {})).ok).toBe(true);
    expect((await invoke(s, 'payments.list', {})).ok).toBe(true);
    expect((await invoke(s, 'accounting.report', { from: '2026-01-01', to: '2026-12-31' })).ok).toBe(true);

    const patientId = (f.core.db.prepare('SELECT id FROM patients LIMIT 1').get() as { id: number }).id;
    expect(code(await invoke(s, 'visits.create', { patientId, chiefComplaint: 'x' }))).toBe('FORBIDDEN');
    expect(code(await invoke(s, 'chart.set', { patientId, toothId: 11, conditionKey: 'caries' }))).toBe('FORBIDDEN');
    expect(code(await invoke(s, 'prescriptions.create', { patientId, items: [{ name: 'x' }] }))).toBe('FORBIDDEN');
    expect(code(await invoke(s, 'inventory.move', { itemId: 1, move: { type: 'stock_in', quantity: 1 } }))).toBe('FORBIDDEN');
    expect(code(await invoke(s, 'users.list', {}))).toBe('FORBIDDEN');
  });

  it('a custom role with zero permissions is denied even read access', async () => {
    const roleId = makeCustomRole('Observer-None', []);
    makeUserWithRoleIds('observer', [roleId]);
    const s = loginAs('observer');
    expect(code(await invoke(s, 'patients.list', {}))).toBe('FORBIDDEN');
    expect(code(await invoke(s, 'appointments.list', {}))).toBe('FORBIDDEN');
  });

  it('denials are written to the audit log (accountable RBAC)', async () => {
    const before = (f.core.db.prepare("SELECT COUNT(*) c FROM audit_logs WHERE action = 'permission.denied'").get() as { c: number }).c;
    const s = loginAs('nurse');
    await invoke(s, 'payments.record', { patientId: 1, amountPaise: 1, method: 'cash' });
    const after = (f.core.db.prepare("SELECT COUNT(*) c FROM audit_logs WHERE action = 'permission.denied'").get() as { c: number }).c;
    expect(after).toBe(before + 1);
    const row = f.core.db
      .prepare("SELECT username, result, entity_id FROM audit_logs WHERE action = 'permission.denied' ORDER BY id DESC LIMIT 1")
      .get() as { username: string; result: string; entity_id: string };
    expect(row.username).toBe('nurse');
    expect(row.result).toBe('denied');
    expect(row.entity_id).toBe('billing.payment.create');
  });

  it('sensitive staff data (salary, ID) is stripped unless staff.sensitive is granted', async () => {
    const st = staff.saveStaff(f.core, f.actor, null, {
      fullName: 'Salary Staff',
      phone: '01812-345678',
      position: 'Dental Assistant',
      salaryPaise: 3000000,
      idNumber: 'NID-123',
    }, true); // owner holds staff.sensitive
    expect(st.salaryPaise).toBe(3000000); // owner sees it

    makeCustomRole('StaffViewer', ['staff.view']);
    makeUserWithRoleIds('viewer1', [roleByName('StaffViewer')]);
    const s1 = loginAs('viewer1');
    const r1 = (await invoke(s1, 'staff.list', {})) as ApiResult<Array<{ salaryPaise: number | null; idNumber: string | null }>>;
    if (!r1.ok) throw new Error(`staff.list should succeed: ${r1.error.code}`);
    expect(r1.data.every((m) => m.salaryPaise === null && m.idNumber === null)).toBe(true);

    makeCustomRole('StaffSensitive', ['staff.view', 'staff.sensitive']);
    makeUserWithRoleIds('viewer2', [roleByName('StaffSensitive')]);
    const s2 = loginAs('viewer2');
    const r2 = (await invoke(s2, 'staff.list', {})) as ApiResult<Array<{ salaryPaise: number | null }>>;
    if (!r2.ok) throw new Error(`staff.list should succeed: ${r2.error.code}`);
    expect(r2.data.find((m) => m.salaryPaise === 3000000)).toBeTruthy();
  });
});

describe('session lifecycle security', () => {
  it('locked session blocks everything until the correct password is entered', async () => {
    const s = loginAs('reception');
    expect((await invoke(s, 'patients.list', {})).ok).toBe(true);
    s.lock();
    expect(code(await invoke(s, 'patients.list', {}))).toBe('LOCKED');
    expect(() => s.unlock('wrong-password')).toThrow();
    s.unlock('User@12345');
    expect((await invoke(s, 'patients.list', {})).ok).toBe(true);
  });

  it('a deactivated account cannot log in or keep acting', () => {
    const u = (f.core.db.prepare('SELECT id FROM users WHERE username = ?').get('nurse') as { id: number });
    admin.saveUser(f.core, f.actor, { id: u.id, username: 'nurse', displayName: 'Nurse', roleIds: [roleByName('Nurse/Assistant')], active: false });
    const s = new SessionManager(f.core);
        // no account enumeration: deactivated accounts fail with the same generic message as unknown ones
    expect(() => s.login('nurse', 'User@12345')).toThrow(/Invalid username or password/);
  });

  it('five failed logins lock the account; even the right password is rejected while locked', () => {
    const s = new SessionManager(f.core);
    for (let i = 0; i < 4; i++) expect(() => s.login('dentist', 'nope')).toThrow();
    // 5th failure trips the lock
    expect(() => s.login('dentist', 'nope')).toThrow(/locked/i);
    // correct password is useless while locked
    expect(() => s.login('dentist', 'User@12345')).toThrow(/locked/i);
  });

  it('login failures and successes are audited', () => {
    const s = new SessionManager(f.core);
    expect(() => s.login('dentist', 'wrong')).toThrow();
    s.login('dentist', 'User@12345');
    const fails = (f.core.db.prepare("SELECT COUNT(*) c FROM audit_logs WHERE action = 'login.failed'").get() as { c: number }).c;
    const ok = (f.core.db.prepare("SELECT COUNT(*) c FROM audit_logs WHERE action = 'login.success'").get() as { c: number }).c;
    expect(fails).toBeGreaterThanOrEqual(1);
    expect(ok).toBeGreaterThanOrEqual(1);
  });
});

describe('owner protection', () => {
  it('the Owner role cannot be assigned or revoked by a non-owner administrator', () => {
    makeCustomRole('TempAdmin', ['admin.users', 'admin.roles']);
    makeUserWithRoleIds('tempadmin', [roleByName('TempAdmin')]);
    const s = loginAs('tempadmin');
    const ownerId = roleByName('Owner');
    expect(() => admin.saveUser(f.core, s.actor(), { username: 'evil', displayName: 'Evil', password: 'Evil@12345', roleIds: [ownerId] })).toThrow(/owner/i);
  });
});
