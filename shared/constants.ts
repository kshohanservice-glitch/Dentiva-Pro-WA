/** Domain constants shared between main process and renderer. */

export const APP_NAME = 'Dentiva Pro';
export const APP_ID = 'DentivaPro';
export const APP_VERSION = '1.0.0';
export const SCHEMA_VERSION = 1;

export const DEVELOPER = {
  name: 'Shohan Khan',
  email: 'helloiamshohan@gmail.com',
} as const;

// ---------------------------------------------------------------- payment
export const PAYMENT_METHODS = [
  { key: 'cash', label: 'Cash' },
  { key: 'bank', label: 'Bank' },
  { key: 'card', label: 'Card' },
  { key: 'bkash', label: 'bKash' },
  { key: 'nagad', label: 'Nagad' },
  { key: 'rocket', label: 'Rocket' },
  { key: 'upay', label: 'Upay' },
  { key: 'other', label: 'Other' },
] as const;
export type PaymentMethodKey = (typeof PAYMENT_METHODS)[number]['key'];
export const PAYMENT_METHOD_LABEL: Record<string, string> = Object.fromEntries(
  PAYMENT_METHODS.map((m) => [m.key, m.label]),
);

// ---------------------------------------------------------------- paper
export interface PaperPreset {
  key: string;
  label: string;
  widthMm: number;
  heightMm: number | null; // null = continuous roll
  margins: { top: number; right: number; bottom: number; left: number };
}

export const PAPER_PRESETS: PaperPreset[] = [
  { key: 'A4', label: 'A4 (210×297)', widthMm: 210, heightMm: 297, margins: { top: 12, right: 12, bottom: 14, left: 12 } },
  { key: 'A5', label: 'A5 (148×210)', widthMm: 148, heightMm: 210, margins: { top: 10, right: 10, bottom: 12, left: 10 } },
  { key: 'Legal', label: 'Legal (216×356)', widthMm: 216, heightMm: 356, margins: { top: 12, right: 12, bottom: 14, left: 12 } },
  { key: 'Thermal80', label: 'Thermal 80mm', widthMm: 80, heightMm: null, margins: { top: 4, right: 4, bottom: 4, left: 4 } },
  { key: 'Thermal58', label: 'Thermal 58mm', widthMm: 58, heightMm: null, margins: { top: 3, right: 3, bottom: 3, left: 3 } },
  { key: 'Receipt80', label: 'Receipt 80mm', widthMm: 80, heightMm: 200, margins: { top: 4, right: 4, bottom: 4, left: 4 } },
  { key: 'Custom', label: 'Custom', widthMm: 210, heightMm: 297, margins: { top: 10, right: 10, bottom: 10, left: 10 } },
];

export const isThermal = (widthMm: number): boolean => widthMm <= 90;

// ---------------------------------------------------------------- appointments
export const APPOINTMENT_STATUSES = [
  { key: 'scheduled', label: 'Scheduled', tone: 'info' },
  { key: 'confirmed', label: 'Confirmed', tone: 'success' },
  { key: 'arrived', label: 'Arrived', tone: 'warning' },
  { key: 'waiting', label: 'Waiting', tone: 'warning' },
  { key: 'in_treatment', label: 'In Treatment', tone: 'primary' },
  { key: 'completed', label: 'Completed', tone: 'success' },
  { key: 'cancelled', label: 'Cancelled', tone: 'muted' },
  { key: 'no_show', label: 'No-show', tone: 'danger' },
  { key: 'rescheduled', label: 'Rescheduled', tone: 'info' },
] as const;
export type AppointmentStatusKey = (typeof APPOINTMENT_STATUSES)[number]['key'];
export const APPOINTMENT_STATUS_LABEL: Record<string, string> = Object.fromEntries(
  APPOINTMENT_STATUSES.map((s) => [s.key, s.label]),
);

export const APPOINTMENT_TYPES = [
  { key: 'new', label: 'New Patient' },
  { key: 'follow_up', label: 'Follow-up' },
  { key: 'emergency', label: 'Emergency' },
  { key: 'cleaning', label: 'Cleaning' },
  { key: 'consultation', label: 'Consultation' },
  { key: 'treatment', label: 'Treatment' },
  { key: 'other', label: 'Other' },
] as const;
export const APPOINTMENT_TYPE_LABEL: Record<string, string> = Object.fromEntries(
  APPOINTMENT_TYPES.map((t) => [t.key, t.label]),
);

// ---------------------------------------------------------------- queue
export const QUEUE_STATUSES = [
  { key: 'waiting', label: 'Waiting' },
  { key: 'called', label: 'Called' },
  { key: 'in_treatment', label: 'In Treatment' },
  { key: 'completed', label: 'Completed' },
  { key: 'skipped', label: 'Skipped' },
  { key: 'cancelled', label: 'Cancelled' },
] as const;
export type QueueStatusKey = (typeof QUEUE_STATUSES)[number]['key'];
export const QUEUE_STATUS_LABEL: Record<string, string> = Object.fromEntries(
  QUEUE_STATUSES.map((s) => [s.key, s.label]),
);

// ---------------------------------------------------------------- tooth conditions
export interface ToothConditionType {
  key: string;
  label: string;
  color: string;
}

export const TOOTH_CONDITIONS: ToothConditionType[] = [
  { key: 'healthy', label: 'Healthy', color: '#16a34a' },
  { key: 'caries', label: 'Caries / Decay', color: '#dc2626' },
  { key: 'restored', label: 'Restored (filling)', color: '#f59e0b' },
  { key: 'root_canal', label: 'Root canal treated', color: '#8b5cf6' },
  { key: 'crowned', label: 'Crown / Cap', color: '#0ea5e9' },
  { key: 'bridge', label: 'Bridge', color: '#14b8a6' },
  { key: 'missing', label: 'Missing', color: '#6b7280' },
  { key: 'extraction_recommended', label: 'Extraction recommended', color: '#991b1b' },
  { key: 'cracked', label: 'Cracked / Fractured', color: '#ea580c' },
  { key: 'painful', label: 'Painful / Symptomatic', color: '#ef4444' },
  { key: 'implant', label: 'Implant', color: '#06b6d4' },
  { key: 'brace', label: 'Orthodontic appliance', color: '#a855f7' },
  { key: 'periapical', label: 'Periapical lesion', color: '#b91c1c' },
  { key: 'mobility', label: 'Mobility', color: '#d97706' },
];
export const TOOTH_CONDITION_MAP: Record<string, ToothConditionType> = Object.fromEntries(
  TOOTH_CONDITIONS.map((c) => [c.key, c]),
);

// ---------------------------------------------------------------- settings
export interface SettingsDefaults {
  [k: string]: unknown;
}
export const SETTINGS_DEFAULTS: SettingsDefaults = {
  'security.auto_lock_minutes': 15, // 5 | 10 | 15 | 30 | 0(off)
  'security.failed_login_limit': 5,
  'security.account_lock_minutes': 15,
  'security.require_reauth_for_destructive': true,
  'backup.interval_days': 7, // 7 | 15 | 30
  'backup.last_at': null,
  'backup.last_status': null,
  'appointment.default_duration': 30,
  'appointment.working_hours': { from: '09:00', to: '20:00' },
  'notification.upcoming_appointments': true,
  'notification.low_stock': true,
  'notification.expiry_days': 30,
  'notification.outstanding_balance': true,
  'print.default_profile_id': null,
  'numbering.default': 'fdi',
  'language.ui': 'en',
  'ui.date_format': 'DD/MM/YYYY',
  'ui.time_format': '24h',
  'inventory.allow_negative': false,
  'clinical.visit_edit_window_days': 30,
};

// ---------------------------------------------------------------- seed data
export const TREATMENT_SEED: Array<{
  code: string;
  name: string;
  category: string;
  pricePaise: number;
  duration: number;
}> = [
  { code: 'T-001', name: 'Consultation / OPD', category: 'Consultation', pricePaise: 50000, duration: 15 },
  { code: 'T-002', name: 'Scaling & Polishing', category: 'Prophylaxis', pricePaise: 150000, duration: 45 },
  { code: 'T-003', name: 'Amalgam Filling', category: 'Restorative', pricePaise: 150000, duration: 30 },
  { code: 'T-004', name: 'Composite Filling', category: 'Restorative', pricePaise: 300000, duration: 40 },
  { code: 'T-005', name: 'Glass Ionomer Filling', category: 'Restorative', pricePaise: 250000, duration: 30 },
  { code: 'T-006', name: 'Root Canal Treatment (RCT)', category: 'Endodontics', pricePaise: 1500000, duration: 60 },
  { code: 'T-007', name: 'Pulpotomy', category: 'Endodontics', pricePaise: 2000000, duration: 45 },
  { code: 'T-008', name: 'Simple Extraction', category: 'Surgery', pricePaise: 100000, duration: 20 },
  { code: 'T-009', name: 'Surgical Extraction', category: 'Surgery', pricePaise: 500000, duration: 45 },
  { code: 'T-010', name: 'Impacted Wisdom Tooth Surgery', category: 'Surgery', pricePaise: 800000, duration: 60 },
  { code: 'T-011', name: 'PFM Crown', category: 'Prosthodontics', pricePaise: 15000000, duration: 30 },
  { code: 'T-012', name: 'Zirconia Crown', category: 'Prosthodontics', pricePaise: 30000000, duration: 30 },
  { code: 'T-013', name: 'Metal Crown (Ni-Cr)', category: 'Prosthodontics', pricePaise: 10000000, duration: 30 },
  { code: 'T-014', name: 'Partial Denture', category: 'Prosthodontics', pricePaise: 25000000, duration: 30 },
  { code: 'T-015', name: 'Complete Denture', category: 'Prosthodontics', pricePaise: 45000000, duration: 30 },
  { code: 'T-016', name: 'Impression Taking', category: 'Prosthodontics', pricePaise: 1000000, duration: 20 },
  { code: 'T-017', name: 'Teeth Whitening', category: 'Aesthetics', pricePaise: 15000000, duration: 60 },
  { code: 'T-018', name: 'Splinting', category: 'Periodontics', pricePaise: 3000000, duration: 30 },
  { code: 'T-019', name: 'Periodontal Deep Cleaning (SRP)', category: 'Periodontics', pricePaise: 5000000, duration: 60 },
  { code: 'T-020', name: 'Night Guard', category: 'Prosthodontics', pricePaise: 12000000, duration: 30 },
  { code: 'T-021', name: 'Braces Consultation', category: 'Orthodontics', pricePaise: 2000000, duration: 30 },
  { code: 'T-022', name: 'Braces Treatment (per arch, per month)', category: 'Orthodontics', pricePaise: 25000000, duration: 60 },
  { code: 'T-023', name: 'Re-cementation', category: 'Restorative', pricePaise: 500000, duration: 20 },
  { code: 'T-024', name: 'Emergency Pain Management', category: 'Emergency', pricePaise: 1000000, duration: 20 },
];

export const MEDICINE_SEED: Array<{
  name: string;
  genericName: string;
  form: string;
  strength: string;
  commonDosage: string;
}> = [
  { name: 'Amoxicillin 500 mg Capsule', genericName: 'Amoxicillin', form: 'Capsule', strength: '500 mg', commonDosage: '1 capsule TDS × 5 days' },
  { name: 'Amoxicillin + Clavulanic Acid 625 mg Tablet', genericName: 'Amoxiclav', form: 'Tablet', strength: '625 mg', commonDosage: '1 tablet BD × 5 days' },
  { name: 'Metronidazole 400 mg Tablet', genericName: 'Metronidazole', form: 'Tablet', strength: '400 mg', commonDosage: '1 tablet TDS × 5 days' },
  { name: 'Diclofenac Sodium 50 mg Tablet', genericName: 'Diclofenac', form: 'Tablet', strength: '50 mg', commonDosage: '1 tablet BD after food' },
  { name: 'Ibuprofen 400 mg Tablet', genericName: 'Ibuprofen', form: 'Tablet', strength: '400 mg', commonDosage: '1 tablet TDS after food' },
  { name: 'Paracetamol 500 mg Tablet', genericName: 'Paracetamol', form: 'Tablet', strength: '500 mg', commonDosage: '1 tablet TDS/QDS' },
  { name: 'Paracetamol 650 mg Tablet', genericName: 'Paracetamol', form: 'Tablet', strength: '650 mg', commonDosage: '1 tablet TDS' },
  { name: 'Aceclofenac 100 mg Tablet', genericName: 'Aceclofenac', form: 'Tablet', strength: '100 mg', commonDosage: '1 tablet BD after food' },
  { name: 'Mefenamic Acid 500 mg Tablet', genericName: 'Mefenamic acid', form: 'Tablet', strength: '500 mg', commonDosage: '1 tablet TDS after food' },
  { name: 'Dexamethasone 0.5 mg Tablet', genericName: 'Dexamethasone', form: 'Tablet', strength: '0.5 mg', commonDosage: '1 tablet OD × 3 days (taper)' },
  { name: 'Cefixime 200 mg Capsule', genericName: 'Cefixime', form: 'Capsule', strength: '200 mg', commonDosage: '1 capsule BD × 5 days' },
  { name: 'Azithromycin 500 mg Tablet', genericName: 'Azithromycin', form: 'Tablet', strength: '500 mg', commonDosage: '1 tablet OD × 3 days' },
  { name: 'Chlorhexidine 0.2% Mouthwash', genericName: 'Chlorhexidine gluconate', form: 'Mouthwash', strength: '0.2%', commonDosage: '10 ml, rinse twice daily × 1 week' },
  { name: 'Oral Gel (Benzocaine 20%)', genericName: 'Benzocaine', form: 'Gel', strength: '20%', commonDosage: 'Apply locally PRN' },
  { name: 'Tab. Dolo-Plus (Paracetamol + Phenylephrine)', genericName: 'Compound paracetamol', form: 'Tablet', strength: '500 mg', commonDosage: '1 tablet TDS' },
];

export const INCOME_CATEGORY_SEED = [
  'Treatment Revenue',
  'Consultation Fee',
  'Denture / Prosthesis',
  'Orthodontics',
  'Lab Charges',
  'Other Income',
];

export const EXPENSE_CATEGORY_SEED = [
  'Clinic Rent',
  'Electricity',
  'Internet',
  'Water',
  'Dental Supplies',
  'Consumables',
  'Equipment',
  'Staff Salary',
  'Maintenance',
  'Transportation',
  'Marketing',
  'Laboratory Fees',
  'Miscellaneous',
];

export const GENDERS = [
  { key: 'male', label: 'Male' },
  { key: 'female', label: 'Female' },
  { key: 'other', label: 'Other' },
] as const;

export const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'] as const;

export const REFERRAL_STATUSES = [
  { key: 'pending', label: 'Pending' },
  { key: 'in_progress', label: 'In Progress' },
  { key: 'completed', label: 'Completed' },
  { key: 'closed', label: 'Closed' },
] as const;

/** Allowed attachment MIME types + max size. */
export const ATTACHMENT_TYPES: Record<string, string[]> = {
  'application/pdf': ['pdf'],
  'image/jpeg': ['jpg', 'jpeg'],
  'image/png': ['png'],
  'text/plain': ['txt'],
  'application/msword': ['doc'],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['docx'],
};
export const ATTACHMENT_MAX_BYTES = 15 * 1024 * 1024;
