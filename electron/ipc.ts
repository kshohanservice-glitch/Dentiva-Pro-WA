import { ipcMain } from 'electron';
import type { Core, Actor } from './core';
import type { SessionManager } from './services/session';
import { ApiError } from './services/errors';
import type { ApiResult } from '../shared/types';
import { checkActivationCode } from './activation';
import { verifyPassword } from './security';

import * as patients from './services/patients';
import * as clinical from './services/clinical';
import * as appointments from './services/appointments';
import * as billing from './services/billing';
import * as accounting from './services/accounting';
import * as inventory from './services/inventory';
import * as staff from './services/staff';
import * as admin from './services/admin';
import * as backup from './services/backup';
import * as search from './services/search';
import * as dashboard from './services/dashboard';
import * as notifications from './services/notifications';
import * as documents from './services/documents';
import * as print from './print';

type Handler = {
  /** required permission (any-of); absent = any authenticated session */
  perm?: string[];
  /** available without a session (login/activation/setup/app info) */
  public?: boolean;
  run: (core: Core, sess: SessionManager, actor: Actor, args: any) => unknown;
};

type HandlerDef = Handler | Handler['run'];

const H = (perm: string[] | undefined, run: Handler['run']): Handler => ({ perm, run });
const PUB = (run: Handler['run']): Handler => ({ public: true, run });

export function buildRouter(): Record<string, HandlerDef> {
  return {
    // ------------------------------------------------ app
    'app.info': PUB((core) => admin.appInfo(core)),
    'app.getUiSettings': (core) => {
      const clinic = admin.getClinic(core);
      return {
        dateFormat: clinic.dateFormat,
        timeFormat: clinic.timeFormat,
        numberingSystem: clinic.numberingSystem,
        currencySymbol: clinic.currencySymbol,
        autoLockMinutes: core.settingGet<number>('security.auto_lock_minutes', 15) ?? 15,
        allowNegativeStock: core.settingGet<boolean>('inventory.allow_negative', false) ?? false,
      };
    },

    // ------------------------------------------------ native dialogs (local machine only)
    'dialogs.pickFolder': PUB((_core, _s, _a) => print.pickFolder('Choose a folder')),
    'dialogs.pickFile': PUB((_core, _s, _a, args?: { title?: string; purpose?: string }) => {
      const filters =
        args?.purpose === 'logo'
          ? [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg'] }]
          : args?.purpose === 'backup'
            ? [{ name: 'Dentiva Pro backup', extensions: ['zip'] }]
            : undefined;
      return print.pickFile(args?.title ?? 'Choose a file', filters);
    }),

    // ------------------------------------------------ activation (pre-setup)
    'activation.check': PUB((core, _s, _a) => ({ activated: core.metaGet('activated', '0') === '1' })),
    'activation.activate': PUB((core, _s, _a, args: { code: string }) => {
      const res = checkActivationCode(String(args?.code ?? ''));
      if (!res.valid) {
        core.audit('activation.failed', 'system', null, null, undefined, 'failure');
        throw ApiError.validation(res.reason ?? 'Invalid activation code.');
      }
      admin.activate(core, String(args.code));
      return { activated: true };
    }),

    // ------------------------------------------------ setup wizard
    'setup.status': PUB((core) => ({
      setupComplete: core.metaGet('setup_complete', '0') === '1',
      clinic: admin.getClinic(core),
      dentists: admin.listDentists(core),
    })),
    'setup.complete': PUB((core, _s, _a, args: admin.SetupPayload) => {
      if (core.metaGet('setup_complete', '0') === '1') throw ApiError.state('Setup is already complete.');
      admin.completeSetup(core, args);
      return { ok: true };
    }),

    // ------------------------------------------------ auth
    'auth.login': PUB((core, sess, _a, args: { username: string; password: string }) => {
      if (core.metaGet('activated', '0') !== '1') throw ApiError.state('This installation is not activated.');
      const s = sess.login(String(args?.username ?? ''), String(args?.password ?? ''));
      return sessionInfo(core, sess, s);
    }),
    'auth.info': (core, sess) => (sess.current ? sessionInfo(core, sess, sess.current) : null),
    'auth.logout': (_c, sess) => {
      sess.logout();
      return { ok: true };
    },
    'auth.lock': (_c, sess) => {
      sess.lock();
      return { ok: true };
    },
    'auth.unlock': (_c, sess, _a, args: { password: string }) => {
      if (!sess.current) throw ApiError.auth();
      sess.unlock(String(args?.password ?? ''));
      return { ok: true };
    },
    'auth.changeOwnPassword': (_c, _s, actor, args: { current: string; next: string }) => {
      admin.changeOwnPassword(_c, actor, String(args?.current ?? ''), String(args?.next ?? ''));
      return { ok: true };
    },
    'auth.verifyPassword': (core, _s, actor, args: { password: string }) => {
      // Re-authentication gate for destructive actions (typed confirmation in UI).
      const row = core.db.prepare('SELECT password_hash FROM users WHERE id = ?').get(actor.userId) as { password_hash: string } | undefined;
      if (!row) throw ApiError.forbidden('Your account is not available.');
      if (!verifyPassword(String(args?.password ?? ''), row.password_hash)) {
        throw ApiError.forbidden('The password you entered does not match your account.');
      }
      core.audit('session.reauth', 'session', String(actor.userId), { purpose: 'destructive-action' }, actor);
      return { ok: true };
    },

    // ------------------------------------------------ patients
    'patients.list': H(['patients.view'], (core, _s, _a, f) => patients.listPatients(core, f ?? {})),
    'patients.get360': H(['patients.view'], (core, _s, _a, args: { id: number }) => patients.getPatient360(core, args.id)),
    'patients.get': H(['patients.view'], (core, _s, _a, args: { id: number }) => {
      const p = patients.getPatient(core, args.id);
      if (!p) throw ApiError.notFound('patient', args.id);
      return p;
    }),
    'patients.create': H(['patients.create'], (core, _s, actor, input) => patients.createPatient(core, actor, input)),
    'patients.update': H(['patients.edit'], (core, _s, actor, args: { id: number; input: unknown }) =>
      patients.updatePatient(core, actor, args.id, args.input as patients.PatientInput),
    ),
    'patients.archive': H(['patients.archive'], (core, _s, actor, args: { id: number; reason: string }) =>
      patients.archivePatient(core, actor, args.id, String(args.reason ?? '')),
    ),
    'patients.restore': H(['patients.archive'], (core, _s, actor, args: { id: number }) => {
      patients.restorePatient(core, actor, args.id);
      return { ok: true };
    }),
    'patients.hardDelete': H(['patients.hard_delete'], (core, _s, actor, args: { id: number }) => {
      patients.hardDeletePatient(core, actor, args.id);
      return { ok: true };
    }),
    'patients.timeline': H(['patients.view'], (core, _s, _a, args: { id: number; kinds?: string[] }) =>
      patients.getTimeline(core, args.id, args.kinds),
    ),
    'patients.duplicateCheck': H(['patients.view'], (_core, _s, _a, args: { phone: string; ignoreId?: number }) =>
      patients.duplicatePhoneCheck(_core, String(args?.phone ?? ''), args?.ignoreId),
    ),
    'patients.history.add': H(['clinical.visit.create', 'patients.edit'], (core, _s, actor, args: { id: number; kind: string; entry: string }) => {
      patients.addHistoryEntry(core, actor, args.id, String(args.kind), String(args.entry));
      return { ok: true };
    }),

    // ------------------------------------------------ visits
    'visits.list': H(['clinical.view'], (core, _s, _a, args: { patientId: number; page?: number }) =>
      clinical.listVisits(core, args.patientId, args.page ?? 1),
    ),
    'visits.get': H(['clinical.view'], (core, _s, _a, args: { id: number }) => clinical.getVisit(core, args.id)),
    'visits.create': H(['clinical.visit.create'], (core, _s, actor, input) => clinical.createVisit(core, actor, input)),
    'visits.update': H(['clinical.visit.edit'], (core, _s, actor, args: { id: number; input: unknown }) =>
      clinical.updateVisit(core, actor, args.id, args.input as Partial<clinical.VisitInput>),
    ),
    'visits.complete': H(['clinical.visit.edit'], (core, _s, actor, args: { id: number }) => clinical.completeVisit(core, actor, args.id)),

    // ------------------------------------------------ chart
    'chart.get': H(['clinical.view'], (core, _s, _a, args: { patientId: number; numbering?: 'fdi' | 'universal'; dentition?: 'adult' | 'pediatric' }) => {
      const r = clinical.getPatientChart(core, args.patientId, args.numbering ?? 'fdi', args.dentition ?? 'adult');
      return { teeth: r.teeth, states: Object.fromEntries(r.states) as Record<string, { conditionKey: string; conditionLabel: string; color: string; note: string | null; updatedAt: string }> };
    }),
    'chart.set': H(['clinical.chart.edit'], (core, _s, actor, args: { patientId: number; toothId: number; conditionKey: string | null; note?: string | null; visitId?: number | null }) => {
      clinical.setToothState(core, actor, args.patientId, args.toothId, args.conditionKey, args.note ?? null, args.visitId ?? null);
      return { ok: true };
    }),

    // ------------------------------------------------ treatment catalog
    'treatments.list': H(['clinical.view'], (core, _s, _a, args?: { includeInactive?: boolean }) =>
      clinical.listTreatments(core, args?.includeInactive),
    ),
    'treatments.save': H(['clinical.treatment_catalog.manage'], (core, _s, actor, data) => clinical.saveTreatment(core, actor, data)),

    // ------------------------------------------------ prescriptions
    'prescriptions.list': H(['clinical.view'], (core, _s, _a, f) => clinical.listPrescriptions(core, f ?? {})),
    'prescriptions.get': H(['clinical.view'], (core, _s, _a, args: { id: number }) => clinical.getPrescription(core, args.id)),
    'prescriptions.create': H(['clinical.prescription.create'], (core, _s, actor, data) => clinical.createPrescription(core, actor, data)),
    'prescriptions.update': H(['clinical.prescription.create'], (core, _s, actor, args: { id: number; data: unknown }) =>
      clinical.updatePrescription(core, actor, args.id, args.data as { chiefComplaint?: string; examination?: string; diagnosis?: string; advice?: string; notes?: string; items?: clinical.RxItemInput[] }),
    ),
    'prescriptions.cancel': H(['clinical.prescription.cancel'], (core, _s, actor, args: { id: number; reason: string }) => {
      clinical.cancelPrescription(core, actor, args.id, String(args.reason ?? ''));
      return { ok: true };
    }),

    // ------------------------------------------------ medicines
    'medicines.list': H(['clinical.view'], (core, _s, _a, args?: { q?: string }) => clinical.listMedicines(core, args?.q)),
    'medicines.save': H(['clinical.treatment_catalog.manage'], (core, _s, actor, data) => {
      clinical.saveMedicine(core, actor, data);
      return { ok: true };
    }),

    // ------------------------------------------------ referrals
    'referrals.list': H(['clinical.view'], (core, _s, _a, args: { patientId: number }) => clinical.listReferrals(core, args.patientId)),
    'referrals.create': H(['clinical.visit.create'], (core, _s, actor, data) => clinical.createReferral(core, actor, data)),
    'referrals.updateStatus': H(['clinical.visit.edit'], (core, _s, actor, args: { id: number; status: string }) => {
      clinical.updateReferralStatus(core, actor, args.id, String(args.status));
      return { ok: true };
    }),

    // ------------------------------------------------ attachments
    'attachments.list': H(['clinical.attachments.manage', 'clinical.view'], (core, _s, _a, args: { patientId?: number | null; staffId?: number | null }) =>
      clinical.listAttachments(core, args?.patientId === undefined ? null : args.patientId, args?.staffId),
    ),
    'attachments.add': H(['clinical.attachments.manage'], (core, _s, actor, data) => clinical.addAttachment(core, actor, data)),
    'attachments.get': H(['clinical.view'], (core, _s, _a, args: { id: number }) => clinical.readAttachment(core, args.id)),
    'attachments.delete': H(['clinical.attachments.manage'], (core, _s, actor, args: { id: number }) => {
      clinical.deleteAttachment(core, actor, args.id);
      return { ok: true };
    }),

    // ------------------------------------------------ appointments
    'appointments.list': H(['appointments.view'], (core, _s, _a, f) => appointments.listAppointments(core, f ?? {})),
    'appointments.get': H(['appointments.view'], (core, _s, _a, args: { id: number }) => {
      const a = appointments.getAppointment(core, args.id);
      if (!a) throw ApiError.notFound('appointment', args.id);
      return a;
    }),
    'appointments.create': H(['appointments.create'], (core, _s, actor, input) => appointments.createAppointment(core, actor, input)),
    'appointments.update': H(['appointments.edit'], (core, _s, actor, args: { id: number; input: unknown }) =>
      appointments.updateAppointment(core, actor, args.id, args.input as Partial<appointments.AppointmentInput> & { status?: string }),
    ),
    'appointments.cancel': H(['appointments.cancel'], (core, _s, actor, args: { id: number; noShow?: boolean }) =>
      appointments.cancelAppointment(core, actor, args.id, !!args.noShow),
    ),

    // ------------------------------------------------ queue
    'queue.list': H(['appointments.view', 'queue.manage'], (core, _s, _a, args?: { date?: string }) => appointments.listQueue(core, args?.date ?? localDateStrLocal())),
    'queue.add': H(['queue.manage'], (core, _s, actor, input) => appointments.addQueueEntry(core, actor, input)),
    'queue.setStatus': H(['queue.manage'], (core, _s, actor, args: { id: number; status: string }) =>
      appointments.setQueueStatus(core, actor, args.id, args.status as 'waiting' | 'called' | 'in_treatment' | 'completed' | 'skipped' | 'cancelled'),
    ),

    // ------------------------------------------------ invoices
    'invoices.list': H(['billing.invoice.view'], (core, _s, _a, f) => billing.listInvoices(core, f ?? {})),
    'invoices.get': H(['billing.invoice.view'], (core, _s, _a, args: { id: number }) => billing.getInvoice(core, args.id)),
    'invoices.create': H(['billing.invoice.create'], (core, _s, actor, input) => billing.createInvoice(core, actor, input)),
    'invoices.void': H(['billing.invoice.void'], (core, _s, actor, args: { id: number; reason: string }) => {
      billing.voidInvoice(core, actor, args.id, String(args.reason ?? ''));
      return { ok: true };
    }),
    'invoices.outstanding': H(['financial.reports.view'], (core) => billing.outstandingReceivables(core)),

    // ------------------------------------------------ payments
    'payments.list': H(['billing.payment.view'], (core, _s, _a, f) => billing.listPayments(core, f ?? {})),
    'payments.record': H(['billing.payment.create'], (core, _s, actor, input) => billing.recordPayment(core, actor, input)),
    'payments.void': H(['billing.payment.void'], (core, _s, actor, args: { id: number; reason: string }) => {
      billing.voidPayment(core, actor, args.id, String(args.reason ?? ''));
      return { ok: true };
    }),
    'payments.credit': H(['billing.payment.view'], (core, _s, _a, args: { patientId: number }) => ({ creditPaise: billing.patientCredit(core, args.patientId) })),

    // ------------------------------------------------ accounting
    'accounting.transactions': H(['accounting.view'], (core, _s, _a, f) => accounting.listTransactions(core, f ?? {})),
    'accounting.categories': H(['accounting.view'], (core, _s, _a, args: { from?: string; to?: string }) => ({
      income: accounting.listCategories(core, 'income', args?.from, args?.to),
      expense: accounting.listCategories(core, 'expense', args?.from, args?.to),
    })),
    'accounting.create': H(['accounting.create'], (core, _s, actor, input) => accounting.createTransaction(core, actor, input)),
    'accounting.delete': H(['accounting.manage'], (core, _s, actor, args: { id: number }) => {
      accounting.deleteTransaction(core, actor, args.id);
      return { ok: true };
    }),
    'accounting.saveCategory': H(['accounting.manage'], (core, _s, actor, args: { kind: 'income' | 'expense'; input: unknown }) => {
      accounting.saveCategory(core, actor, args.kind, args.input as { id?: number; name: string; active?: boolean });
      return { ok: true };
    }),
    'accounting.report': H(['financial.reports.view'], (core, _s, _a, args: { from: string; to: string }) =>
      accounting.accountingReport(core, String(args.from), String(args.to)),
    ),

    // ------------------------------------------------ inventory
    'inventory.items': H(['inventory.view'], (core, _s, _a, f) => inventory.listItems(core, f ?? {})),
    'inventory.save': H(['inventory.manage'], (core, _s, actor, args: { id: number | null; input: unknown }) =>
      inventory.saveItem(core, actor, args.id, args.input as inventory.ItemInput),
    ),
    'inventory.move': H(['inventory.manage'], (core, _s, actor, args: { itemId: number; move: unknown }) =>
      inventory.stockMove(core, actor, args.itemId, args.move as inventory.StockMoveInput),
    ),
    'inventory.transactions': H(['inventory.view'], (core, _s, _a, args: { itemId?: number | null; page?: number }) =>
      inventory.listTransactions(core, args?.itemId ?? null, args?.page ?? 1),
    ),
    'suppliers.list': H(['inventory.view', 'suppliers.manage'], (core) => inventory.listSuppliers(core)),
    'suppliers.save': H(['suppliers.manage'], (core, _s, actor, input) => inventory.saveSupplier(core, actor, input)),
    'suppliers.delete': H(['suppliers.manage'], (core, _s, actor, args: { id: number }) => {
      inventory.deleteSupplier(core, actor, args.id);
      return { ok: true };
    }),

    // ------------------------------------------------ staff
    'staff.list': H(['staff.view'], (core, _s, actor) =>
      staff.listStaff(core, actor, actorPermsHave(_s, 'staff.sensitive')),
    ),
    'staff.save': H(['staff.manage'], (core, _s, actor, args: { id: number | null; input: unknown }) =>
      staff.saveStaff(core, actor, args.id, args.input as staff.StaffInput, actorPermsHave(_s, 'staff.sensitive')),
    ),
    'staff.delete': H(['staff.manage'], (core, _s, actor, args: { id: number }) => {
      staff.deleteStaff(core, actor, args.id);
      return { ok: true };
    }),

    // ------------------------------------------------ users & roles
    'users.list': H(['admin.users'], (core) => admin.listUsers(core)),
    'users.save': H(['admin.users'], (core, _s, actor, input) => admin.saveUser(core, actor, input)),
    'users.delete': H(['admin.users'], (core, _s, actor, args: { id: number }) => {
      admin.deleteUser(core, actor, args.id);
      return { ok: true };
    }),
    'roles.list': H(['admin.roles'], (core) => admin.listRoles(core)),
    'roles.save': H(['admin.roles'], (core, _s, actor, input) => admin.saveRole(core, actor, input)),
    'roles.delete': H(['admin.roles'], (core, _s, actor, args: { id: number }) => {
      admin.deleteRole(core, actor, args.id);
      return { ok: true };
    }),
    'permissions.list': H(['admin.roles'], () => admin.listPermissions()),

    // ------------------------------------------------ clinic / dentists / settings
    'clinic.get': (_core, _s, _a) => admin.getClinic(_core),
    'clinic.save': H(['admin.settings'], (core, _s, actor, input) => admin.saveClinic(core, actor, input)),
    'dentists.list': (_core, _s, _a, args?: { includeInactive?: boolean }) => admin.listDentists(_core, args?.includeInactive ?? true),
    'dentists.save': H(['admin.settings'], (core, _s, actor, input) => admin.saveDentist(core, actor, input)),
    'settings.get': (_core, _s, _a) => admin.getAllSettings(_core),
    'settings.save': H(['admin.settings'], (core, _s, actor, args: { patch: Record<string, unknown> }) =>
      admin.saveSettings(core, actor, args?.patch ?? {}),
    ),

    // ------------------------------------------------ printers
    'printers.list': (_core, _s, _a) => admin.listPrinterProfiles(_core),
    'printers.save': H(['admin.settings'], (core, _s, actor, input) => admin.savePrinterProfile(core, actor, input)),
    'printers.delete': H(['admin.settings'], (core, _s, actor, args: { id: number }) => {
      admin.deletePrinterProfile(core, actor, args.id);
      return { ok: true };
    }),

    // ------------------------------------------------ audit
    'audit.list': H(['admin.audit'], (core, _s, _a, f) => admin.listAudit(core, f ?? {})),
    'audit.actions': H(['admin.audit'], (core) => admin.listAuditActions(core)),

    // ------------------------------------------------ notifications
    'notifications.list': (_core, _s, _a, args?: { unreadOnly?: boolean }) => notifications.listNotifications(_core, !!args?.unreadOnly),
    'notifications.unread': (_core, _s, _a) => ({ count: notifications.unreadCount(_core) }),
    'notifications.markRead': (_core, _s, _a, args: { id: number }) => {
      notifications.markRead(_core, args.id);
      return { ok: true };
    },
    'notifications.markAllRead': (_core, _s, _a) => {
      notifications.markAllRead(_core);
      return { ok: true };
    },

    // ------------------------------------------------ search
    'search.global': H(['patients.view', 'appointments.view', 'billing.invoice.view', 'clinical.view', 'inventory.view'], (core, _s, _a, f) =>
      search.globalSearch(core, f ?? { q: '' }),
    ),

    // ------------------------------------------------ dashboard
    'dashboard.get': H(['patients.view', 'appointments.view'], (core) => dashboard.dashboardData(core)),

    // ------------------------------------------------ backup
    'backup.create': H(['admin.backup'], async (core, _s, actor, args: { destination?: string }) => {
      const p = await backup.createBackup(core, actor, args?.destination ?? '', 'manual');
      return { path: p };
    }),
    'backup.validate': H(['admin.restore'], (_core, _s, _a, args: { path: string }) => backup.validateBackupFile(_core, String(args.path))),
    'backup.restore': H(['admin.restore'], async (core, sess, actor, args: { path: string; preRestoreDestination?: string }) => {
      const r = await backup.performRestore(core, actor, String(args.path), args?.preRestoreDestination ?? '');
      // Data (including the users table) came from the backup: the in-memory
      // session is no longer trustworthy. Force re-authentication against the
      // restored data.
      sess.logout();
      return { ...r, reauthRequired: true };
    }),
    'backup.list': H(['admin.backup'], (core) => backup.listBackupRecords(core)),
    'backup.deleteRecord': H(['admin.backup'], (core, _s, actor, args: { id: number }) => {
      backup.deleteBackupRecord(core, actor, args.id);
      return { ok: true };
    }),
    'backup.scheduledIfDue': H(['admin.backup'], async (core) => ({ path: await backup.runScheduledBackupIfDue(core) })),

    // ------------------------------------------------ documents / print
    'documents.preview': (core, sess, _a, args: { type: documents.DocumentType; id?: number; profileId?: number | null }) =>
      documentPayload(core, sess, args),
    'documents.print': async (core, sess, _a, args: { type: documents.DocumentType; id?: number; profileId?: number | null }) => {
      const doc = documentPayload(core, sess, args);
      const r = await print.printDocument(doc.profile, doc.html, doc.title);
      return { result: r };
    },
    'documents.pdf': async (core, sess, _a, args: { type: documents.DocumentType; id?: number; profileId?: number | null }) => {
      const doc = documentPayload(core, sess, args);
      const name = doc.title.replace(/[^a-z0-9]/gi, '_');
      const p = await print.savePdf(doc.profile, doc.html, name);
      return { path: p };
    },
    'reports.build': (core, sess, _a, args: { kind: string; filters?: Record<string, unknown>; profileId?: number | null }) =>
      buildReportDoc(core, sess, args),
    'reports.print': async (core, sess, _a, args: { kind: string; filters?: Record<string, unknown>; profileId?: number | null }) => {
      const doc = buildReportDoc(core, sess, args);
      const r = await print.printDocument(doc.profile, doc.html, doc.title);
      return { result: r };
    },
    'reports.pdf': async (core, sess, _a, args: { kind: string; filters?: Record<string, unknown>; profileId?: number | null }) => {
      const doc = buildReportDoc(core, sess, args);
      const name = `${args.kind}_report_${new Date().toISOString().slice(0, 10)}`;
      const p = await print.savePdf(doc.profile, doc.html, name);
      return { path: p };
    },
    'files.open': PUB(async (_c, _s, _a, args: { path: string }) => print.openItem(String(args?.path ?? ''))),
    'reports.exportCsv': async (core, sess, actor, args: { kind: string; filters?: Record<string, unknown> }) => {
      checkReportPerm(sess, args.kind);
      const data = reportRows(core, args.kind, args.filters ?? {});
      const header = data.columns.map((c) => csvEscape(c.label)).join(',');
      const lines = data.rows.map((r) => data.columns.map((c) => csvEscape(c.render ? c.render(r) : r[c.key])).join(','));
      const csv = [header, ...lines].join('\n');
      const name = `${args.kind}_report_${new Date().toISOString().slice(0, 10)}`;
      core.audit('report.exported', 'report', args.kind, { rows: data.rows.length }, actor);
      const p = await print.exportCsvToFile(name, csv);
      return { path: p };
    },
  };
}

// ---------------------------------------------------------------- helpers

function localDateStrLocal(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function actorPermsHave(sess: SessionManager, perm: string): boolean {
  return !!sess.current && sess.current.perms.has(perm);
}

function sessionInfo(core: Core, _sess: SessionManager, s: { user: { id: number; username: string; displayName: string; isOwner: boolean }; roles: string[]; perms: Set<string>; locked: boolean }) {
  const last = core.db.prepare('SELECT last_login_at, created_at FROM users WHERE id = ?').get(s.user.id) as { last_login_at: string | null; created_at: string };
  return {
    user: {
      id: s.user.id,
      username: s.user.username,
      displayName: s.user.displayName,
      isOwner: s.user.isOwner,
      active: true,
      roles: s.roles,
      lastLoginAt: last.last_login_at,
      createdAt: last.created_at,
    },
    perms: Array.from(s.perms),
    locked: s.locked,
  };
}

function getProfile(core: Core, profileId?: number | null): documents.PaperProfile {
  let row: Record<string, unknown> | undefined;
  if (profileId) {
    row = core.db.prepare('SELECT * FROM printer_profiles WHERE id = ?').get(profileId) as Record<string, unknown> | undefined;
  }
  if (!row) {
    row = (core.db.prepare('SELECT * FROM printer_profiles WHERE is_default = 1 LIMIT 1').get() as Record<string, unknown> | undefined) ??
      (core.db.prepare('SELECT * FROM printer_profiles ORDER BY id LIMIT 1').get() as Record<string, unknown>);
  }
  return documents.profileFromRow(row);
}

const DOC_PERMS: Record<string, string[]> = {
  prescription: ['clinical.view'],
  invoice: ['billing.invoice.view'],
  receipt: ['billing.payment.view'],
  patient_summary: ['patients.view'],
  report: [],
};

function documentPayload(core: Core, sess: SessionManager, args: { type: documents.DocumentType; id?: number; profileId?: number | null }) {
  if (!sess.current) throw ApiError.auth();
  const perms = DOC_PERMS[args.type];
  if (perms.length) {
    if (!perms.some((p) => sess.current!.perms.has(p))) {
      throw ApiError.forbidden('You do not have permission to view this document.');
    }
  }
  const profile = getProfile(core, args.profileId);
  const doc = documents.buildDocument(core, args.type, { id: args.id }, profile);
  return doc;
}

const REPORT_PERMS: Record<string, string[]> = {
  accounting: ['accounting.view'],
  patients: ['patients.view'],
  appointments: ['appointments.view'],
  inventory: ['inventory.view'],
  treatments: ['clinical.view'],
  payments: ['billing.payment.view'],
  outstanding: ['financial.reports.view'],
};

function reportRows(core: Core, kind: string, f: Record<string, unknown>): { title: string; subtitle: string; columns: documents.ReportColumn[]; rows: Array<Record<string, unknown>>; summary?: Array<[string, string]> } {
  const from = String(f?.from ?? '');
  const to = String(f?.to ?? '');
  const range = from && to ? `${from} to ${to}` : 'all time';
  const money = (r: Record<string, unknown>, k: string) => `৳ ${Math.round((Number(r[k]) || 0) / 100).toLocaleString('en-US')}`;
  switch (kind) {
    case 'accounting': {
      const { items } = accounting.listTransactions(core, { from: from || undefined, to: to || undefined, pageSize: 500 });
      return {
        title: 'Accounting Report',
        subtitle: `Transactions · ${range}`,
        columns: [
          { key: 'txnDate', label: 'Date' },
          { key: 'kind', label: 'Type' },
          { key: 'categoryName', label: 'Category' },
          { key: 'description', label: 'Description' },
          { key: 'amountPaise', label: 'Amount', align: 'right', render: (r) => (r.kind === 'expense' ? '− ' : '') + money(r, 'amountPaise') },
        ],
        rows: items as unknown as Array<Record<string, unknown>>,
      };
    }
    case 'patients': {
      const { items } = patients.listPatients(core, { q: String(f?.q ?? ''), dateRange: (f?.dateRange as never) ?? 'all', pageSize: 200 });
      return {
        title: 'Patient List Report',
        subtitle: `${items.length} patient(s) · ${range}`,
        columns: [
          { key: 'code', label: 'Code' },
          { key: 'fullName', label: 'Name' },
          { key: 'phone', label: 'Phone' },
          { key: 'gender', label: 'Gender' },
          { key: 'age', label: 'Age', align: 'right' },
          { key: 'createdAt', label: 'Registered', render: (r) => new Date(String(r.createdAt)).toLocaleDateString() },
        ],
        rows: items as unknown as Array<Record<string, unknown>>,
      };
    }
    case 'appointments': {
      const { items } = appointments.listAppointments(core, { from: from || undefined, to: to || undefined, status: String(f?.status ?? '') || undefined });
      return {
        title: 'Appointment Report',
        subtitle: range,
        columns: [
          { key: 'apptDate', label: 'Date' },
          { key: 'startTime', label: 'Time' },
          { key: 'patientName', label: 'Patient' },
          { key: 'dentistName', label: 'Dentist' },
          { key: 'status', label: 'Status' },
        ],
        rows: items as unknown as Array<Record<string, unknown>>,
      };
    }
    case 'inventory': {
      const { items } = inventory.listItems(core, { pageSize: 200 });
      return {
        title: 'Inventory Report',
        subtitle: `${items.length} item(s)`,
        columns: [
          { key: 'sku', label: 'SKU' },
          { key: 'name', label: 'Item' },
          { key: 'stockQuantity', label: 'Stock', align: 'right' },
          { key: 'unit', label: 'Unit' },
          { key: 'expiryDate', label: 'Expiry', render: (r) => (r.expiryDate ? String(r.expiryDate) : '—') },
        ],
        rows: items as unknown as Array<Record<string, unknown>>,
      };
    }
    case 'treatments': {
      const items = clinical.listTreatments(core, true);
      return {
        title: 'Treatment Catalog Report',
        subtitle: `${items.length} treatment(s)`,
        columns: [
          { key: 'code', label: 'Code' },
          { key: 'name', label: 'Treatment' },
          { key: 'category', label: 'Category' },
          { key: 'defaultPricePaise', label: 'Default Price', align: 'right', render: (r) => money(r, 'defaultPricePaise') },
        ],
        rows: items as unknown as Array<Record<string, unknown>>,
      };
    }
    case 'payments': {
      const { items } = billing.listPayments(core, { from: from || undefined, to: to || undefined, pageSize: 500 });
      return {
        title: 'Payment Report',
        subtitle: range,
        columns: [
          { key: 'paymentDate', label: 'Date' },
          { key: 'code', label: 'Ref' },
          { key: 'patientName', label: 'Patient' },
          { key: 'method', label: 'Method' },
          { key: 'amountPaise', label: 'Amount', align: 'right', render: (r) => (r.void ? '— (void)' : money(r, 'amountPaise')) },
        ],
        rows: items as unknown as Array<Record<string, unknown>>,
      };
    }
    case 'outstanding': {
      const items = billing.outstandingReceivables(core);
      const total = items.reduce((s, i) => s + i.duePaise, 0);
      return {
        title: 'Outstanding Receivables Report',
        subtitle: 'Invoices with unpaid balance',
        columns: [
          { key: 'invoiceDate', label: 'Date' },
          { key: 'patientName', label: 'Patient' },
          { key: 'invoiceNumber', label: 'Invoice' },
          { key: 'duePaise', label: 'Balance Due', align: 'right', render: (r) => money(r, 'duePaise') },
        ],
        rows: items,
        summary: [['Total Outstanding', `৳ ${Math.round(total / 100).toLocaleString('en-US')}`]],
      };
    }
    default:
      throw ApiError.validation('Unknown report kind.');
  }
}

function buildReportDoc(core: Core, sess: SessionManager, args: { kind: string; filters?: Record<string, unknown>; profileId?: number | null }): documents.BuiltDocument {
  if (!sess.current) throw ApiError.auth();
  const perms = REPORT_PERMS[args.kind];
  if (!perms || !perms.some((p) => sess.current!.perms.has(p))) {
    throw ApiError.forbidden('You do not have permission to generate this report.');
  }
  const data = reportRows(core, args.kind, args.filters ?? {});
  const profile = getProfile(core, args.profileId);
  return documents.buildReport(core, data, profile);
}

function csvEscape(v: unknown): string {
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function checkReportPerm(sess: SessionManager, kind: string): void {
  const perms = REPORT_PERMS[kind];
  if (!perms) throw ApiError.validation('Unknown report kind.');
  if (!sess.current || !perms.some((p) => sess.current!.perms.has(p))) {
    throw ApiError.forbidden('You do not have permission to export this report.');
  }
}

/**
 * The single production dispatch path: public check → session check →
 * lock check → permission gate → handler. Both the real ipcMain bridge and
 * the test suite invoke through this function, so what is tested is exactly
 * what ships.
 */
export async function invokeHandler(
  core: Core,
  sess: SessionManager,
  channel: string,
  args: unknown,
  onNotify?: () => void,
): Promise<ApiResult<unknown>> {
  const router = buildRouter();
  const raw = router[channel];
  if (!raw) {
    return { ok: false, error: { code: 'VALIDATION', message: `Unknown operation: ${channel}` } };
  }
  const handler: Handler = typeof raw === 'function' ? { run: raw } : raw;
  try {
    if (!handler.public) {
      if (!sess.current) throw ApiError.auth();
      if (sess.current.locked) throw ApiError.locked();
      if (handler.perm) sess.requirePerm(...handler.perm);
    }
    const actor = sess.actor();
    const result = await handler.run(core, sess, actor, args);
    if (channel.startsWith('backup.') || channel === 'notifications.markAllRead') onNotify?.();
    return { ok: true, data: result };
  } catch (e) {
    if (e instanceof ApiError) {
      return { ok: false, error: { code: e.code, message: e.message, details: e.details } };
    }
    const msg = e instanceof Error ? e.message : String(e);
    core.log.error(`ipc ${channel} failed`, { err: msg });
    return { ok: false, error: { code: 'DB', message: 'This action could not be completed. Please try again, and if the problem persists, check the log file and contact support.' } };
  }
}

export function registerIpc(core: Core, sess: SessionManager, onNotify: () => void): void {
  ipcMain.handle('dentiva:invoke', (_e, channel: string, args: unknown): Promise<ApiResult<unknown>> =>
    invokeHandler(core, sess, channel, args, onNotify),
  );
}
