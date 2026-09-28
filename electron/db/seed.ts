import type { Core } from '../core';
import {
  TOOTH_CONDITIONS,
  TREATMENT_SEED,
  MEDICINE_SEED,
  INCOME_CATEGORY_SEED,
  EXPENSE_CATEGORY_SEED,
  APP_VERSION,
} from '../../shared/constants';
import { PERMISSIONS, ROLE_SEEDS } from '../../shared/permissions';
import { nowIso } from '../../shared/date';

/**
 * Idempotent seed: only runs on a brand-new database (schema migration path).
 * Seeds reference data only — never patients, users or demo data.
 */
export function seed(core: Core): void {
  const db = core.db;
  core.tx(() => {
    const now = nowIso();

    // ---- permissions
    const insPerm = db.prepare('INSERT OR IGNORE INTO permissions (key, category, label) VALUES (?, ?, ?)');
    for (const p of PERMISSIONS) insPerm.run(p.key, p.category, p.label);

    // ---- roles + grants
    const insRole = db.prepare('INSERT INTO roles (name, description, is_system, created_at) VALUES (?, ?, 1, ?)');
    const getRole = db.prepare('SELECT id FROM roles WHERE name = ?');
    const delGrants = db.prepare('DELETE FROM role_permissions WHERE role_id = ?');
    const insGrant = db.prepare('INSERT OR IGNORE INTO role_permissions (role_id, perm_key) VALUES (?, ?)');
    for (const seedRole of ROLE_SEEDS) {
      const r = insRole.run(seedRole.name, seedRole.description, now);
      const roleId = Number(r.lastInsertRowid);
      delGrants.run(roleId);
      for (const key of seedRole.grants) insGrant.run(roleId, key);
      void getRole;
    }

    // ---- tooth condition types
    const insCond = db.prepare('INSERT OR IGNORE INTO tooth_condition_types (key, label, color) VALUES (?, ?, ?)');
    for (const c of TOOTH_CONDITIONS) insCond.run(c.key, c.label, c.color);

    // ---- teeth charts
    // FDI adult: 11-18, 21-28, 31-38, 41-48
    const insTooth = db.prepare(
      'INSERT OR IGNORE INTO teeth (numbering, dentition, position, name) VALUES (?, ?, ?, ?)',
    );
    const fdiAdult = [11, 12, 13, 14, 15, 16, 17, 18, 21, 22, 23, 24, 25, 26, 27, 28, 31, 32, 33, 34, 35, 36, 37, 38, 41, 42, 43, 44, 45, 46, 47, 48];
    fdiAdult.forEach((n, i) => insTooth.run('fdi', 'adult', i + 1, `FDI ${n}`));
    // FDI pediatric: 51-58, 61-68, 71-78, 81-88
    const fdiPed = [51, 52, 53, 54, 55, 56, 57, 58, 61, 62, 63, 64, 65, 66, 67, 68, 71, 72, 73, 74, 75, 76, 77, 78, 81, 82, 83, 84, 85, 86, 87, 88];
    fdiPed.forEach((n, i) => insTooth.run('fdi', 'pediatric', i + 1, `FDI ${n}`));
    // Universal adult: 1-32
    for (let n = 1; n <= 32; n++) insTooth.run('universal', 'adult', n, `#${n}`);
    // Universal pediatric: A-T
    const letters = 'ABCDEFGHIJKLMNOPQRST'.split('');
    letters.forEach((L, i) => insTooth.run('universal', 'pediatric', i + 1, L));

    // ---- treatment catalog
    const insTrt = db.prepare(
      'INSERT OR IGNORE INTO treatment_catalog (code, name, category, description, default_price, duration_minutes, active, notes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?)',
    );
    for (const t of TREATMENT_SEED) {
      insTrt.run(t.code, t.name, t.category, '', t.pricePaise, t.duration, '', now, now);
    }

    // ---- medicine catalog
    const insMed = db.prepare(
      'INSERT OR IGNORE INTO medicine_catalog (name, generic_name, form, strength, common_dosage, active) VALUES (?, ?, ?, ?, ?, 1)',
    );
    for (const m of MEDICINE_SEED) insMed.run(m.name, m.genericName, m.form, m.strength, m.commonDosage);

    // ---- accounting categories
    const insInc = db.prepare('INSERT OR IGNORE INTO income_categories (name, active) VALUES (?, 1)');
    for (const c of INCOME_CATEGORY_SEED) insInc.run(c);
    const insExp = db.prepare('INSERT OR IGNORE INTO expense_categories (name, active) VALUES (?, 1)');
    for (const c of EXPENSE_CATEGORY_SEED) insExp.run(c);

    // ---- clinic singleton
    db.prepare(
      `INSERT OR IGNORE INTO clinic (id, name, address, phone, email, registration_no, consultation_hours,
        prescription_footer, currency, currency_symbol, date_format, time_format, numbering_system, updated_at)
       VALUES (1, '', '', '', '', '', '', '', 'BDT', '৳', 'DD/MM/YYYY', '24h', 'fdi', ?)`,
    ).run(now);

    // ---- default printer profile
    db.prepare(
      `INSERT OR IGNORE INTO printer_profiles (id, name, paper, width_mm, height_mm, margin_top_mm, margin_bottom_mm,
        margin_left_mm, margin_right_mm, orientation, scale, fit_to_width, printer_name, is_default, created_at)
       VALUES (1, 'Clinic A4', 'A4', 210, 297, 12, 14, 12, 12, 'portrait', 100, 0, '', 1, ?)`,
    ).run(now);
    db.prepare(
      `INSERT OR IGNORE INTO printer_profiles (id, name, paper, width_mm, height_mm, margin_top_mm, margin_bottom_mm,
        margin_left_mm, margin_right_mm, orientation, scale, fit_to_width, printer_name, is_default, created_at)
       VALUES (2, 'Thermal 80', 'Thermal80', 80, NULL, 4, 4, 4, 4, 'portrait', 100, 1, '', 0, ?)`,
    ).run(now);

    core.metaSet('app_version', APP_VERSION);
  });
}
