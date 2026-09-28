/**
 * Canonical permission catalog and default role grants.
 * This file is the single source of truth used by DB seeding, RBAC enforcement
 * and the RBAC test matrix. 45 granular permissions.
 */

export interface PermissionDef {
  key: string;
  category: string;
  label: string;
  sensitive?: boolean;
}

const P = (key: string, category: string, label: string, sensitive = false): PermissionDef => ({
  key,
  category,
  label,
  sensitive,
});

export const PERMISSIONS: PermissionDef[] = [
  // Patients
  P('patients.view', 'Patients', 'View patients and profiles'),
  P('patients.create', 'Patients', 'Register new patients'),
  P('patients.edit', 'Patients', 'Edit patient records'),
  P('patients.archive', 'Patients', 'Archive or restore patients'),
  P('patients.hard_delete', 'Patients', 'Permanently delete patient records', true),
  // Clinical
  P('clinical.view', 'Clinical', 'View visits, treatments, prescriptions and charts'),
  P('clinical.visit.create', 'Clinical', 'Create visit records'),
  P('clinical.visit.edit', 'Clinical', 'Edit visit records'),
  P('clinical.prescription.create', 'Clinical', 'Create prescriptions'),
  P('clinical.prescription.cancel', 'Clinical', 'Cancel prescriptions'),
  P('clinical.chart.edit', 'Clinical', 'Mark dental chart conditions'),
  P('clinical.treatment_catalog.manage', 'Clinical', 'Manage the treatment catalog'),
  P('clinical.attachments.manage', 'Clinical', 'Add or remove patient attachments'),
  // Appointments & queue
  P('appointments.view', 'Appointments', 'View appointments and queue'),
  P('appointments.create', 'Appointments', 'Create appointments'),
  P('appointments.edit', 'Appointments', 'Edit or reschedule appointments'),
  P('appointments.cancel', 'Appointments', 'Cancel or mark no-show', true),
  P('queue.manage', 'Queue', 'Manage the walk-in queue'),
  // Billing
  P('billing.invoice.view', 'Billing', 'View invoices'),
  P('billing.invoice.create', 'Billing', 'Create invoices'),
  P('billing.invoice.void', 'Billing', 'Void invoices', true),
  P('billing.payment.view', 'Billing', 'View payments'),
  P('billing.payment.create', 'Billing', 'Record payments'),
  P('billing.payment.void', 'Billing', 'Void payments', true),
  // Financial & accounting
  P('financial.reports.view', 'Financial', 'View financial reports and receivables', true),
  P('accounting.view', 'Accounting', 'View accounting transactions', true),
  P('accounting.create', 'Accounting', 'Record income and expense entries'),
  P('accounting.manage', 'Accounting', 'Manage accounting categories and entries', true),
  // Inventory
  P('inventory.view', 'Inventory', 'View inventory and stock history'),
  P('inventory.manage', 'Inventory', 'Manage inventory items and stock movements'),
  P('suppliers.manage', 'Inventory', 'Manage suppliers'),
  // Staff
  P('staff.view', 'Staff', 'View staff list'),
  P('staff.manage', 'Staff', 'Manage staff records'),
  P('staff.sensitive', 'Staff', 'View sensitive staff data (salary, ID number)', true),
  // Administration
  P('admin.users', 'Administration', 'Manage users', true),
  P('admin.roles', 'Administration', 'Manage roles and permissions', true),
  P('admin.settings', 'Administration', 'Manage application settings', true),
  P('admin.backup', 'Administration', 'Create backups', true),
  P('admin.restore', 'Administration', 'Restore from backup', true),
  P('admin.audit', 'Administration', 'View the audit log', true),
  P('admin.data', 'Administration', 'Perform destructive data actions', true),
];

export const ALL_PERMISSION_KEYS: string[] = PERMISSIONS.map((p) => p.key);

export const SENSITIVE_PERMISSION_KEYS: string[] = PERMISSIONS.filter((p) => p.sensitive).map(
  (p) => p.key,
);

export interface RoleSeed {
  name: string;
  description: string;
  grants: string[];
}

const G = (...keys: string[]): string[] => keys;

export const ROLE_SEEDS: RoleSeed[] = [
  {
    name: 'Owner',
    description: 'Practice owner. Full access to everything, including destructive actions.',
    grants: ALL_PERMISSION_KEYS,
  },
  {
    name: 'Administrator',
    description: 'Manages the practice: users, settings, backups, all modules.',
    grants: ALL_PERMISSION_KEYS,
  },
  {
    name: 'Dentist',
    description: 'Clinical care: patients, visits, chart, prescriptions, own appointments. No financial reports.',
    grants: G(
      'patients.view', 'patients.create', 'patients.edit',
      'clinical.view', 'clinical.visit.create', 'clinical.visit.edit',
      'clinical.prescription.create', 'clinical.prescription.cancel',
      'clinical.chart.edit', 'clinical.attachments.manage',
      'appointments.view', 'appointments.create', 'appointments.edit',
      'queue.manage',
      'billing.invoice.view', 'billing.invoice.create', 'billing.payment.view',
    ),
  },
  {
    name: 'Receptionist',
    description: 'Front desk: patients, appointments, queue, billing entry. No reports, no accounting, no admin.',
    grants: G(
      'patients.view', 'patients.create', 'patients.edit',
      'clinical.view', 'clinical.attachments.manage',
      'appointments.view', 'appointments.create', 'appointments.edit', 'appointments.cancel',
      'queue.manage',
      'billing.invoice.view', 'billing.invoice.create',
      'billing.payment.view', 'billing.payment.create',
    ),
  },
  {
    name: 'Nurse/Assistant',
    description: 'Clinical support: view patients and clinical records, manage the queue. No billing access.',
    grants: G(
      'patients.view',
      'clinical.view', 'clinical.attachments.manage',
      'appointments.view', 'queue.manage',
    ),
  },
  {
    name: 'Accountant',
    description: 'Billing and accounting: invoices, payments, reports, income/expense. No clinical editing.',
    grants: G(
      'patients.view',
      'billing.invoice.view', 'billing.invoice.create', 'billing.invoice.void',
      'billing.payment.view', 'billing.payment.create', 'billing.payment.void',
      'financial.reports.view',
      'accounting.view', 'accounting.create', 'accounting.manage',
    ),
  },
  {
    name: 'Inventory Manager',
    description: 'Stock control: inventory items, stock movements, suppliers. No patient or financial access.',
    grants: G('inventory.view', 'inventory.manage', 'suppliers.manage'),
  },
];

/** Permission keys grouped for UI display in the role editor. */
export const PERMISSION_CATEGORIES = [
  'Patients',
  'Clinical',
  'Appointments',
  'Queue',
  'Billing',
  'Financial',
  'Accounting',
  'Inventory',
  'Staff',
  'Administration',
] as const;
