import { Core, NO_ACTOR, type Actor } from '../core';
import { verifyPassword } from '../security';
import { nowIso } from '../../shared/date';
import { ApiError } from './errors';

export interface SessionUser {
  id: number;
  username: string;
  displayName: string;
  isOwner: boolean;
}

export interface SessionState {
  user: SessionUser;
  roles: string[];
  perms: Set<string>;
  locked: boolean;
  lastActivity: number;
}

/**
 * Single-session manager (desktop single-user model).
 * The session lives ONLY in the main process; the renderer can never assert
 * identity — every IPC handler resolves it here.
 */
export class SessionManager {
  current: SessionState | null = null;
  onLock: (() => void) | null = null;

  constructor(private core: Core) {}

  private loadPerms(userId: number): { roles: string[]; perms: Set<string> } {
    const roles = (
      this.core.db
        .prepare(
          `SELECT r.name FROM roles r JOIN user_roles ur ON ur.role_id = r.id WHERE ur.user_id = ?`,
        )
        .all(userId) as Array<{ name: string }>
    ).map((r) => r.name);
    const permRows = (
      this.core.db
        .prepare(
          `SELECT DISTINCT rp.perm_key FROM role_permissions rp
           JOIN user_roles ur ON ur.role_id = rp.role_id WHERE ur.user_id = ?`,
        )
        .all(userId) as Array<{ perm_key: string }>
    ).map((r) => r.perm_key);
    return { roles, perms: new Set(permRows) };
  }

  private rowToUser(id: number): SessionUser {
    const row = this.core.db
      .prepare('SELECT id, username, display_name, is_owner, active FROM users WHERE id = ?')
      .get(id) as
      | { id: number; username: string; display_name: string; is_owner: number; active: number }
      | undefined;
    if (!row || !row.active) throw ApiError.forbidden('This account has been deactivated.');
    return { id: row.id, username: row.username, displayName: row.display_name, isOwner: !!row.is_owner };
  }

  login(username: string, password: string): SessionState {
    const uname = (username || '').trim();
    if (!uname || !password) throw ApiError.validation('Username and password are required.');
    const row = this.core.db
      .prepare('SELECT * FROM users WHERE username = ? COLLATE NOCASE')
      .get(uname) as
      | {
          id: number;
          username: string;
          display_name: string;
          is_owner: number;
          active: number;
          password_hash: string;
          failed_logins: number;
          locked_until: string | null;
        }
      | undefined;

    const limit = this.core.settingGet<number>('security.failed_login_limit', 5) ?? 5;
    const lockMinutes = this.core.settingGet<number>('security.account_lock_minutes', 15) ?? 15;

    if (!row || !row.active) {
      this.core.audit('login.failed', 'user', uname || null, { reason: 'unknown user' }, NO_ACTOR, 'failure');
      throw ApiError.validation('Invalid username or password.');
    }

    if (row.locked_until && new Date(row.locked_until).getTime() > Date.now()) {
      this.core.audit('login.failed', 'user', row.username, { reason: 'account locked' }, this.actorOf(row), 'failure');
      const until = new Date(row.locked_until);
      throw ApiError.state(
        `Account is temporarily locked due to repeated failed attempts. Try again after ${until.toLocaleTimeString()}.`,
      );
    }

    if (!verifyPassword(password, row.password_hash)) {
      const failed = row.failed_logins + 1;
      let lockedUntil: string | null = null;
      if (failed >= limit) {
        lockedUntil = new Date(Date.now() + lockMinutes * 60000).toISOString();
        this.core.notify(
          'critical',
          'security',
          'Account locked after repeated failed logins',
          `The account "${row.username}" was locked for ${lockMinutes} minutes.`,
        );
      }
      this.core.db
        .prepare('UPDATE users SET failed_logins = ?, locked_until = ? WHERE id = ?')
        .run(failed, lockedUntil, row.id);
      this.core.audit('login.failed', 'user', row.username, { reason: 'bad password', attempts: failed }, this.actorOf(row), 'failure');
      if (lockedUntil) {
        throw ApiError.state(`Too many failed attempts. Account locked for ${lockMinutes} minutes.`);
      }
      const remaining = limit - failed;
      throw ApiError.validation(
        `Invalid username or password. ${remaining} attempt${remaining === 1 ? '' : 's'} remaining before a temporary lock.`,
      );
    }

    this.core.db
      .prepare('UPDATE users SET failed_logins = 0, locked_until = NULL, last_login_at = ? WHERE id = ?')
      .run(nowIso(), row.id);

    const user = this.rowToUser(row.id);
    const { roles, perms } = this.loadPerms(row.id);
    this.current = {
      user,
      roles,
      perms,
      locked: false,
      lastActivity: Date.now(),
    };
    this.core.audit('login.success', 'user', row.username, null, this.actor());
    return this.current;
  }

  logout(): void {
    if (!this.current) return;
    this.core.audit('logout', 'user', this.current.user.username, null, this.actor());
    this.current = null;
  }

  lock(): void {
    if (!this.current) return;
    this.current.locked = true;
    this.core.audit('session.lock', 'user', this.current.user.username, null, this.actor());
    this.onLock?.();
  }

  unlock(password: string): void {
    const s = this.current;
    if (!s) throw ApiError.auth();
    const row = this.core.db
      .prepare('SELECT password_hash FROM users WHERE id = ?')
      .get(s.user.id) as { password_hash: string };
    if (!verifyPassword(password, row.password_hash)) {
      this.core.audit('unlock.failed', 'user', s.user.username, null, this.actor(), 'failure');
      throw ApiError.validation('Incorrect password.');
    }
    s.locked = false;
    s.lastActivity = Date.now();
    this.core.audit('unlock.success', 'user', s.user.username, null, this.actor());
  }

  /** Auto-lock check, called on an interval and on activity. */
  checkAutoLock(): boolean {
    if (!this.current || this.current.locked) return false;
    const minutes = this.core.settingGet<number>('security.auto_lock_minutes', 15) ?? 15;
    if (!minutes) return false;
    if (Date.now() - this.current.lastActivity > minutes * 60000) {
      this.lock();
      return true;
    }
    return false;
  }

  touch(): void {
    if (this.current) this.current.lastActivity = Date.now();
  }

  actor(): Actor {
    const s = this.current;
    if (!s) return NO_ACTOR;
    return {
      userId: s.user.id,
      username: s.user.username,
      roleName: s.roles[0] ?? null,
    };
  }

  actorOf(row: { username: string }): Actor {
    return { userId: null, username: row.username, roleName: null };
  }

  /** Enforce permission for the current session. Throws FORBIDDEN. */
  requirePerm(...perms: string[]): void {
    const s = this.current;
    if (!s) throw ApiError.auth();
    if (s.locked) throw ApiError.locked();
    const ok = perms.some((p) => s.perms.has(p));
    if (!ok) {
      this.core.audit('permission.denied', 'permission', perms.join('|'), null, this.actor(), 'denied');
      throw ApiError.forbidden('You do not have permission to perform this action. Contact the administrator.');
    }
  }

  hasPerm(perm: string): boolean {
    return !!this.current && !this.current.locked && this.current.perms.has(perm);
  }

  info() {
    const s = this.current;
    if (!s) return null;
    return {
      user: {
        id: s.user.id,
        username: s.user.username,
        displayName: s.user.displayName,
        isOwner: s.user.isOwner,
        active: true,
        roles: s.roles,
        lastLoginAt: null as string | null,
        createdAt: '' as string,
      },
      perms: Array.from(s.perms),
      locked: s.locked,
    };
  }
}

