import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { SCHEMA_VERSION, SETTINGS_DEFAULTS } from '../shared/constants';
import { nowIso } from '../shared/date';
import type { DataPaths } from './paths';
import type { Logger } from './logger';
import { seed } from './db/seed';

export interface Actor {
  userId: number | null;
  username: string | null;
  roleName: string | null;
}

export const NO_ACTOR: Actor = { userId: null, username: null, roleName: null };

export type Db = InstanceType<typeof Database>;

export class Core {
  db: Db;
  paths: DataPaths;
  log: Logger;

  constructor(paths: DataPaths, log: Logger) {
    this.paths = paths;
    this.log = log;
    for (const dir of [paths.data, paths.attachments, paths.logs, paths.config]) {
      fs.mkdirSync(dir, { recursive: true });
    }
    this.db = new Database(paths.dbFile);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
    this.db.pragma('busy_timeout = 5000');
    this.migrate();
  }

  private migrate(): void {
    // A brand-new database has no tables yet — reading the version key
    // would fail, so treat "no meta table" as version 0.
    let current: string;
    try {
      current = this.metaGet('schema_version', '0');
    } catch {
      current = '0';
    }
    if (current === String(SCHEMA_VERSION)) return;
    if (current !== '0') {
      // Higher-than-supported schema (e.g. from a newer build): refuse to touch data.
      throw new Error(
        `Database schema version ${current} is not supported by this build (${SCHEMA_VERSION}). Restore an older backup if needed.`,
      );
    }
    const schema = fs.readFileSync(path.join(__dirname, 'db', 'schema.sql'), 'utf8');
    this.db.exec(schema);
    seed(this);
    this.metaSet('schema_version', String(SCHEMA_VERSION));
    this.metaSet('created_at', nowIso());
    this.log.info('Database initialized', { schemaVersion: SCHEMA_VERSION });
  }

  // ---------------------------------------------------------------- meta
  metaGet(key: string, def: string): string {
    const row = this.db.prepare('SELECT value FROM meta WHERE key = ?').get(key) as
      | { value: string }
      | undefined;
    return row ? row.value : def;
  }

  metaSet(key: string, value: string): void {
    this.db
      .prepare('INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
      .run(key, value);
  }

  // ---------------------------------------------------------------- settings
  settingGet<T = unknown>(key: string, fallback?: T): T {
    const row = this.db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as
      | { value: string }
      | undefined;
    if (row) {
      try {
        return JSON.parse(row.value) as T;
      } catch {
        /* corrupted value — fall through to fallback */
      }
    }
    if (fallback !== undefined) return fallback;
    return (SETTINGS_DEFAULTS[key] ?? null) as T;
  }

  settingSet(key: string, value: unknown, actor?: Actor): void {
    this.db
      .prepare('INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at')
      .run(key, JSON.stringify(value), nowIso());
    if (actor?.username) this.audit('settings.changed', 'settings', key, { value }, actor);
  }

  // ---------------------------------------------------------------- sequences
  /** Sequential code like PAT-000001. Caller must be inside a transaction. */
  nextCode(table: string, prefix: string, width = 6): string {
    const row = this.db.prepare(`SELECT COALESCE(MAX(id), 0) AS m FROM ${table}`).get() as { m: number };
    return `${prefix}${String(row.m + 1).padStart(width, '0')}`;
  }

  nextInvoiceNumber(): string {
    const year = new Date().getFullYear();
    const like = `INV-${year}-%`;
    const row = this.db.prepare('SELECT COUNT(*) AS c FROM invoices WHERE number LIKE ?').get(like) as { c: number };
    return `INV-${year}-${String(row.c + 1).padStart(6, '0')}`;
  }

  // ---------------------------------------------------------------- audit
  audit(
    action: string,
    entity: string,
    entityId: string | null,
    context: unknown,
    actor?: Actor,
    result = 'success',
  ): void {
    try {
      this.db
        .prepare(
          `INSERT INTO audit_logs (timestamp, user_id, username, role_name, action, entity, entity_id, context, result)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          nowIso(),
          actor?.userId ?? null,
          actor?.username ?? null,
          actor?.roleName ?? null,
          action,
          entity,
          entityId,
          context === undefined ? null : JSON.stringify(context),
          result,
        );
    } catch (e) {
      this.log.error('audit insert failed', { action, entity, err: String(e) });
    }
  }

  // ---------------------------------------------------------------- notifications
  notify(
    severity: 'info' | 'success' | 'warning' | 'critical',
    category: string,
    title: string,
    body = '',
    link: string | null = null,
    dedupeKey: string | null = null,
  ): void {
    try {
      this.db
        .prepare(
          `INSERT INTO notifications (severity, category, title, body, link, dedupe_key, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(dedupe_key) DO NOTHING`,
        )
        .run(severity, category, title, body, link, dedupeKey, nowIso());
    } catch (e) {
      this.log.error('notify insert failed', { title, err: String(e) });
    }
  }

  // ---------------------------------------------------------------- tx helper
  tx<T>(fn: () => T): T {
    return this.db.transaction(fn)();
  }

  now(): string {
    return nowIso();
  }

  integrityCheck(): boolean {
    const row = this.db.prepare('PRAGMA integrity_check').get() as { integrity_check: string };
    return row.integrity_check === 'ok';
  }

  dbSizeBytes(): number {
    try {
      return fs.statSync(this.paths.dbFile).size;
    } catch {
      return 0;
    }
  }

  attachmentCount(): number {
    const row = this.db.prepare('SELECT COUNT(*) AS c FROM attachments').get() as { c: number };
    return row.c;
  }

  close(): void {
    try {
      this.db.close();
    } catch {
      /* already closed */
    }
  }

  /**
   * Close the current connection and reopen the database file.
   * Used by restore: the live DB file is replaced on disk, so the open
   * connection must be released before the swap and re-established after.
   */
  reopen(): void {
    this.close();
    this.db = new Database(this.paths.dbFile);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
    this.db.pragma('busy_timeout = 5000');
    this.migrate();
  }
}
