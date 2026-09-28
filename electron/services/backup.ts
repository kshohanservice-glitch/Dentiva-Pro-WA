import fs from 'node:fs';
import path from 'node:path';
import AdmZip from 'adm-zip';
import type { Core, Actor } from '../core';
import { ApiError } from './errors';
import { nowIso } from '../../shared/date';
import { APP_ID, APP_VERSION, SCHEMA_VERSION } from '../../shared/constants';
import { sha256File, sha256Buffer } from '../security';
import type { BackupRecord } from '../../shared/types';

const MANIFEST = 'manifest.json';

interface Manifest {
  app: string;
  version: string;
  schemaVersion: number;
  createdAt: string;
  dbBytes: number;
  dbSha256: string;
  attachmentCount: number;
  attachments: Array<{ storedName: string; sha256: string; bytes: number }>;
}

function backupFileName(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${APP_ID}_Backup_${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}-${p(d.getMinutes())}-${p(d.getSeconds())}.zip`;
}

interface BackupRecInput {
  fileName: string;
  filePath: string;
  sizeBytes: number;
  sha256: string;
  schemaVersion: number;
  type: BackupRecord['type'];
  status: BackupRecord['status'];
  note: string | null;
  createdBy: number | null; // user id (FK) — display name resolved in listBackupRecords
}

function recordBackup(core: Core, r: BackupRecInput): void {
  core.db
    .prepare(
      `INSERT INTO backup_records (file_name, file_path, size_bytes, sha256, schema_version, type, status, note, created_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(r.fileName, r.filePath, r.sizeBytes, r.sha256, r.schemaVersion, r.type, r.status, r.note, r.createdBy, nowIso());
}

/**
 * Create a backup zip: DB snapshot (online backup API) + attachments + manifest with checksums.
 * Returns the file path.
 */
export async function createBackup(core: Core, actor: Actor, destination: string, type: 'manual' | 'scheduled' | 'pre_restore'): Promise<string> {
  let dest = destination;
  if (!dest) {
    dest = path.join(core.paths.root, 'backups');
  }
  try {
    fs.mkdirSync(dest, { recursive: true });
  } catch (e) {
    throw ApiError.file(`Backup destination is not writable: ${String(e)}`);
  }

  // 1. snapshot DB with the online backup API (safe under WAL)
  const snapPath = path.join(core.paths.config, `backup-snapshot-${Date.now()}.db`);
  try {
    await core.db.backup(snapPath);
  } catch (e) {
    throw ApiError.db(`Database snapshot failed: ${String(e)}`);
  }

  // 2. assemble zip
  const fileName = backupFileName();
  const zipPath = path.join(dest, fileName);
  try {
    const zip = new AdmZip();
    zip.addFile('dentiva.db', fs.readFileSync(snapPath));
    const attDir = core.paths.attachments;
    let attachments: Manifest['attachments'] = [];
    if (fs.existsSync(attDir)) {
      const files = fs.readdirSync(attDir).filter((f) => !f.startsWith('.'));
      attachments = files.map((f) => {
        const full = path.join(attDir, f);
        const st = fs.statSync(full);
        return { storedName: f, sha256: sha256File(full), bytes: st.size };
      });
      for (const a of attachments) {
        zip.addFile(`attachments/${a.storedName}`, fs.readFileSync(path.join(attDir, a.storedName)));
      }
    }
    const dbSha = sha256File(snapPath);
    const manifest: Manifest = {
      app: APP_ID,
      version: APP_VERSION,
      schemaVersion: SCHEMA_VERSION,
      createdAt: nowIso(),
      dbBytes: fs.statSync(snapPath).size,
      dbSha256: dbSha,
      attachmentCount: attachments.length,
      attachments,
    };
    zip.addFile(MANIFEST, Buffer.from(JSON.stringify(manifest, null, 2)));
    zip.writeZip(zipPath);
  } finally {
    try {
      fs.rmSync(snapPath, { force: true });
    } catch {
      /* ignore */
    }
  }

  const zipSha = sha256File(zipPath);
  const size = fs.statSync(zipPath).size;
  core.settingSet('backup.last_at', nowIso(), actor);
  core.settingSet('backup.last_status', 'success', actor);
  recordBackup(core, {
    fileName,
    filePath: zipPath,
    sizeBytes: size,
    sha256: zipSha,
    schemaVersion: SCHEMA_VERSION,
    type,
    status: 'success',
    note: null,
    createdBy: actor.userId,
  });
  core.audit('backup.created', 'backup', fileName, { type, bytes: size }, actor);
  core.notify('success', 'backup', `Backup created: ${fileName}`, `Saved to ${dest}`, `/backup`);
  return zipPath;
}

export interface RestoreValidation {
  ok: boolean;
  error?: string;
  manifest?: Manifest;
  warnings: string[];
}

export function validateBackupFile(_core: Core, filePath: string): RestoreValidation {
  const warnings: string[] = [];
  if (!fs.existsSync(filePath)) return { ok: false, error: 'The backup file was not found.', warnings };
  let zip: AdmZip;
  try {
    zip = new AdmZip(filePath);
  } catch (e) {
    return { ok: false, error: `This file is not a valid Dentiva Pro backup (unreadable archive): ${String(e)}`, warnings };
  }
  const manifestEntry = zip.getEntry(MANIFEST);
  if (!manifestEntry) return { ok: false, error: 'Backup is invalid: missing manifest. It may be corrupted or from another application.', warnings };
  let manifest: Manifest;
  try {
    manifest = JSON.parse(manifestEntry.getData().toString('utf8')) as Manifest;
  } catch {
    return { ok: false, error: 'Backup is invalid: manifest is unreadable.', warnings };
  }
  if (manifest.app !== APP_ID) {
    return { ok: false, error: `This backup belongs to "${manifest.app}", not ${APP_ID}.`, warnings };
  }
  if (manifest.schemaVersion !== SCHEMA_VERSION) {
    return {
      ok: false,
      error: `Backup schema version ${manifest.schemaVersion} is not supported by this build (schema ${SCHEMA_VERSION}). Restoring it would risk data loss — the restore was blocked.`,
      warnings,
    };
  }
  const dbEntry = zip.getEntry('dentiva.db');
  if (!dbEntry) return { ok: false, error: 'Backup is invalid: database file missing from the archive.', warnings };
  const dbBuf = dbEntry.getData();
  const dbSha = sha256Buffer(dbBuf);
  if (dbSha !== manifest.dbSha256) {
    return { ok: false, error: 'Backup is invalid: database integrity check failed (checksum mismatch). The file may be corrupted or tampered with.', warnings };
  }
  // verify each attachment hash; missing files are warnings, hash mismatch is fatal
  for (const a of manifest.attachments) {
    const e = zip.getEntry(`attachments/${a.storedName}`);
    if (!e) {
      warnings.push(`Attachment "${a.storedName}" listed in the manifest is missing from the archive; it will be recorded as unavailable.`);
      continue;
    }
    const sha = sha256Buffer(e.getData());
    if (sha !== a.sha256) return { ok: false, error: `Backup is invalid: attachment "${a.storedName}" failed its integrity check.`, warnings };
  }
  return { ok: true, manifest, warnings };
}

/**
 * Restore from a validated backup.
 * 1) mandatory pre-restore backup
 * 2) swap DB + attachments
 */
export async function performRestore(core: Core, actor: Actor, backupPath: string, preRestoreDestination: string): Promise<{ preRestoreBackup: string; warnings: string[] }> {
  const v = validateBackupFile(core, backupPath);
  if (!v.ok || !v.manifest) throw ApiError.file(v.error ?? 'Backup validation failed.');

  // mandatory safety backup first
  const preDest = preRestoreDestination || path.join(core.paths.root, 'backups');
  let preRestoreBackup: string;
  try {
    preRestoreBackup = await createBackup(core, actor, preDest, 'pre_restore');
  } catch (e) {
    throw ApiError.file(
      `Restore aborted: the mandatory pre-restore safety backup could not be created (${String(e)}). No data was changed.`,
    );
  }

  const zip = new AdmZip(backupPath);
  const dbEntry = zip.getEntry('dentiva.db');
  if (!dbEntry) throw ApiError.file('Backup lost its database file during restore.');

  // stage new data in the config dir, then swap
  const staging = path.join(core.paths.config, `restore-${Date.now()}`);
  fs.mkdirSync(path.join(staging, 'attachments'), { recursive: true });
  fs.writeFileSync(path.join(staging, 'dentiva.db'), dbEntry.getData());
  for (const a of v.manifest.attachments) {
    const e = zip.getEntry(`attachments/${a.storedName}`);
    if (e) fs.writeFileSync(path.join(staging, 'attachments', a.storedName), e.getData());
  }

  // The swap must happen while the database connection is closed: the live
  // file is replaced on disk, and an open connection would keep writing to
  // the old (deleted) file handle.
  core.close();
  try {
    const live = core.paths.dbFile;
    for (const suffix of ['', '-wal', '-shm']) {
      try {
        fs.rmSync(live + suffix, { force: true });
      } catch {
        /* ignore */
      }
    }
    fs.copyFileSync(path.join(staging, 'dentiva.db'), live);
    // replace attachments
    const att = core.paths.attachments;
    if (fs.existsSync(att)) {
      const oldDir = path.join(core.paths.root, `attachments.old-${Date.now()}`);
      fs.renameSync(att, oldDir);
      try {
        fs.rmSync(oldDir, { recursive: true, force: true });
      } catch {
        /* pruned on next startup */
      }
    }
    fs.renameSync(path.join(staging, 'attachments'), att);
  } finally {
    // Always re-establish the connection, even if the swap failed partway.
    core.reopen();
  }

  fs.rmSync(staging, { recursive: true, force: true });

  // The ledger above belongs to the OLD database (replaced by the restore).
  // Re-record the safety backup in the live, restored ledger so the
  // post-restore audit trail also shows it.
  try {
    recordBackup(core, {
      fileName: path.basename(preRestoreBackup),
      filePath: preRestoreBackup,
      sizeBytes: fs.statSync(preRestoreBackup).size,
      sha256: sha256File(preRestoreBackup),
      schemaVersion: SCHEMA_VERSION,
      type: 'pre_restore',
      status: 'success',
      note: `Safety backup created before restore from ${path.basename(backupPath)}`,
      createdBy: actor.userId,
    });
  } catch (e) {
    core.log.warn('pre-restore ledger entry failed after swap', { err: String(e) });
  }

  core.audit('backup.restored', 'backup', path.basename(backupPath), { preRestoreBackup, warnings: v.warnings.length }, actor);
  core.notify('critical', 'backup', 'Backup restored', `Data was replaced from ${path.basename(backupPath)}. Safety backup: ${path.basename(preRestoreBackup)}`, `/backup`);
  return { preRestoreBackup, warnings: v.warnings };
}

export function listBackupRecords(core: Core): BackupRecord[] {
  const rows = core.db
    .prepare(
      `SELECT b.*, u.display_name AS created_by_name
       FROM backup_records b LEFT JOIN users u ON u.id = b.created_by
       ORDER BY b.created_at DESC LIMIT 200`,
    )
    .all() as Array<Record<string, unknown>>;
  return rows.map((r) => ({
    id: r.id as number,
    fileName: r.file_name as string,
    filePath: r.file_path as string,
    sizeBytes: r.size_bytes as number,
    sha256: (r.sha256 as string) ?? '',
    schemaVersion: r.schema_version as number,
    type: r.type as BackupRecord['type'],
    status: r.status as BackupRecord['status'],
    note: (r.note as string) ?? null,
    createdBy: (r.created_by_name as string) ?? null,
    createdAt: r.created_at as string,
  }));
}

export function deleteBackupRecord(core: Core, actor: Actor, id: number): void {
  const row = core.db.prepare('SELECT * FROM backup_records WHERE id = ?').get(id) as Record<string, unknown> | undefined;
  if (!row) throw ApiError.notFound('backup record', id);
  core.tx(() => {
    core.db.prepare('DELETE FROM backup_records WHERE id = ?').run(id);
  });
  core.audit('backup.record_deleted', 'backup', String(row.file_name), { file: String(row.file_path) }, actor);
}

/** Ensure the configured backup destination exists; used by scheduler. */
export function backupDestination(core: Core): string {
  const s = core.settingGet<string | null>('backup.destination', null);
  return s || path.join(core.paths.root, 'backups');
}

/**
 * Run scheduled backup if due. Returns path if a backup was made.
 */
export async function runScheduledBackupIfDue(core: Core): Promise<string | null> {
  const intervalDays = core.settingGet<number>('backup.interval_days', 7) ?? 7;
  const last = core.settingGet<string | null>('backup.last_at', null);
  if (last && Date.now() - new Date(last).getTime() < intervalDays * 86400000) return null;
  try {
    return await createBackup(core, { userId: null, username: 'system', roleName: 'system' }, backupDestination(core), 'scheduled');
  } catch (e) {
    core.settingSet('backup.last_status', 'failed', { userId: null, username: 'system', roleName: 'system' });
    core.notify('critical', 'backup', 'Scheduled backup failed', String(e), '/backup');
    core.audit('backup.failed', 'backup', null, { error: String(e) }, { userId: null, username: 'system', roleName: 'system' }, 'failure');
    return null;
  }
}
