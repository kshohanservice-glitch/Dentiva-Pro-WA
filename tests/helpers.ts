/**
 * Shared test fixtures.
 *
 * Every test gets a fully isolated, throwaway data directory (temp folder),
 * a real SQLite database migrated + seeded by the production Core, and a real
 * SessionManager with the production setup wizard completed. No mocks of
 * business logic — the only mocked module is 'electron' itself (UI shell),
 * which none of the code under test needs at runtime.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Core, NO_ACTOR } from '../electron/core';
import type { Actor } from '../electron/core';
import type { Logger } from '../electron/logger';
import { SessionManager } from '../electron/services/session';
import { completeSetup } from '../electron/services/admin';
import * as patients from '../electron/services/patients';
import type { DataPaths } from '../electron/paths';
import type { PaperProfile } from '../electron/services/documents';
import type { SetupPayload, Patient } from '../shared/types';

export const ADMIN = { username: 'admin', password: 'Admin@1234', displayName: 'Practice Owner' };

let counter = 0;

export function makeLogger(): Logger {
  return { info: () => {}, warn: () => {}, error: () => {}, dir: '' };
}

export function setupPayload(): SetupPayload {
  return {
    clinic: {
      name: 'Test Dental Clinic',
      address: '12 Test Road, Tangail',
      phone: '+880 1711-000000',
      email: 'test@example.com',
      logoBase64: null,
      consultationHours: 'Sat-Thu 9:00 AM - 2:00 PM, 5:00 PM - 9:00 PM',
    },
    dentists: [
      {
        name: 'Test Dentist',
        designations: 'BDS',
        qualifications: 'BDS (Dhaka)',
        registrationNo: 'BDA-12345',
        phone: '+880 1711-000001',
        consultationHours: 'Daily',
      },
    ],
    admin: { ...ADMIN },
    security: { autoLockMinutes: 15, failedLoginLimit: 5, accountLockMinutes: 15 },
    backup: { destination: '', intervalDays: 7 },
    preferences: { dateFormat: 'DD/MM/YYYY', timeFormat: '24h', numberingSystem: 'fdi' },
  };
}

export interface Fixture {
  tmp: string;
  paths: DataPaths;
  core: Core;
  sess: SessionManager;
  /** actor of the logged-in owner (for direct service calls) */
  actor: Actor;
}

/** Fresh isolated installation: temp dir + real DB + completed setup + owner session. */
export function makeFixture(): Fixture {
  counter++;
  const tmp = mkdtempSync(path.join(os.tmpdir(), `dentiva-test-${counter}-`));
  const paths: DataPaths = {
    root: tmp,
    data: path.join(tmp, 'data'),
    attachments: path.join(tmp, 'attachments'),
    logs: path.join(tmp, 'logs'),
    config: path.join(tmp, 'config'),
    dbFile: path.join(tmp, 'data', 'dentiva.db'),
  };
  const core = new Core(paths, makeLogger());
  completeSetup(core, setupPayload());
  const sess = new SessionManager(core);
  sess.login(ADMIN.username, ADMIN.password);
  return { tmp, paths, core, sess, actor: sess.actor() };
}

export function cleanup(f: Fixture): void {
  try {
    f.core.close();
  } catch {
    /* already closed */
  }
  rmSync(f.tmp, { recursive: true, force: true });
}

/** Unique-ish phone so patient duplicate checks never collide across fixtures. */
const uniquePhone = () => `01${String(700000000 + Math.floor(Math.random() * 99999999)).padStart(9, '0')}`;

export function makePatient(core: Core, actor: Actor, over: Partial<Parameters<typeof patients.createPatient>[2]> = {}): Patient {
  return patients.createPatient(core, actor, {
    fullName: 'Test Patient',
    phone: uniquePhone(),
    age: 34,
    gender: 'male',
    ...over,
  });
}

/** Paper profiles mirroring PAPER_PRESETS (A4 + Thermal 80mm). */
export const A4: PaperProfile = {
  name: 'A4',
  widthMm: 210,
  heightMm: 297,
  marginTopMm: 12,
  marginBottomMm: 14,
  marginLeftMm: 12,
  marginRightMm: 12,
  orientation: 'portrait',
  scale: 100,
  fitToWidth: false,
};

export const THERMAL80: PaperProfile = {
  name: 'Thermal 80mm',
  widthMm: 80,
  heightMm: null,
  marginTopMm: 4,
  marginBottomMm: 4,
  marginLeftMm: 4,
  marginRightMm: 4,
  orientation: 'portrait',
  scale: 100,
  fitToWidth: false,
};

export function expectApiError(result: { ok: boolean; error?: { code: string; message: string } }): string {
  if (result.ok) throw new Error('Expected an API error, but the call succeeded.');
  return result.error!.code;
}

export { NO_ACTOR };
