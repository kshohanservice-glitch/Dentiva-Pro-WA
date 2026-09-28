/** Domain types shared between main process and renderer. */

export type Paise = number; // integer 1/100 BDT

// ------------------------------------------------------------------ clinic
export interface Clinic {
  id: number;
  name: string;
  logoDataUrl: string | null;
  address: string;
  phone: string;
  email: string;
  registrationNo: string;
  consultationHours: string;
  prescriptionFooter: string;
  currency: string;
  currencySymbol: string;
  dateFormat: string;
  timeFormat: string;
  numberingSystem: 'fdi' | 'universal';
  updatedAt: string;
}

export interface Dentist {
  id: number;
  name: string;
  designations: string;
  qualifications: string;
  registrationNo: string;
  phone: string;
  consultationHours: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

// ------------------------------------------------------------------ users
export interface UserSummary {
  id: number;
  username: string;
  displayName: string;
  isOwner: boolean;
  active: boolean;
  roles: string[];
  lastLoginAt: string | null;
  createdAt: string;
}

export interface RoleDef {
  id: number;
  name: string;
  description: string;
  isSystem: boolean;
  permissions: string[];
  userCount: number;
}

export interface SessionInfo {
  user: UserSummary;
  perms: string[];
  locked: boolean;
}

// ------------------------------------------------------------------ patients
export interface Patient {
  id: number;
  code: string;
  fullName: string;
  age: number | null;
  dob: string | null;
  gender: string;
  bloodGroup: string;
  address: string;
  phone: string;
  emergencyPhone: string;
  emergencyContactName: string;
  emergencyContactRelationship: string;
  occupation: string;
  preferredLanguage: string;
  referralSource: string;
  presentingProblem: string;
  previousMedicalHistory: string;
  previousDentalHistory: string;
  allergies: string;
  medications: string;
  medicalHistory: string;
  dentalHistory: string;
  notes: string;
  assignedDentistId: number | null;
  assignedDentistName: string | null;
  archived: boolean;
  archivedReason: string | null;
  createdBy: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface PatientListItem extends Patient {
  lastVisitAt: string | null;
  invoiceCount: number;
  outstandingPaise: number;
}

export interface PatientInput {
  fullName: string;
  age?: number | null;
  dob?: string | null;
  gender?: string;
  bloodGroup?: string;
  address?: string;
  phone?: string;
  emergencyPhone?: string;
  emergencyContactName?: string;
  emergencyContactRelationship?: string;
  occupation?: string;
  preferredLanguage?: string;
  referralSource?: string;
  presentingProblem?: string;
  previousMedicalHistory?: string;
  previousDentalHistory?: string;
  allergies?: string;
  medications?: string;
  medicalHistory?: string;
  dentalHistory?: string;
  notes?: string;
  assignedDentistId?: number | null;
}

export interface Visit {
  id: number;
  patientId: number;
  dentistId: number | null;
  dentistName: string | null;
  userId: number | null;
  visitDate: string;
  chiefComplaint: string;
  history: string;
  examination: string;
  diagnosis: string;
  procedure: string;
  advice: string;
  followUpDate: string | null;
  followUpNote: string;
  referralOut: boolean;
  notes: string;
  status: 'in_progress' | 'completed';
  createdAt: string;
  updatedAt: string;
}

export interface VisitTreatment {
  id: number;
  visitId: number;
  catalogId: number | null;
  name: string;
  code: string | null;
  pricePaise: number;
  quantity: number;
  notes: string;
  createdAt: string;
}

export interface Tooth {
  id: number;
  numbering: 'fdi' | 'universal';
  dentition: 'adult' | 'pediatric';
  position: number;
  name: string;
}

export interface ToothState {
  toothId: number;
  conditionKey: string;
  conditionLabel: string;
  color: string;
  note: string | null;
  updatedAt: string;
}

export interface TimelineEvent {
  id: number;
  kind: string;
  title: string;
  detail: string;
  timestamp: string;
  meta: string | null;
}

// ------------------------------------------------------------------ appointments
export interface Appointment {
  id: number;
  code: string;
  patientId: number;
  patientName: string;
  patientCode: string;
  patientPhone: string;
  dentistId: number | null;
  dentistName: string | null;
  apptDate: string;
  startTime: string;
  durationMinutes: number;
  type: string;
  reason: string;
  status: string;
  notes: string;
  reminderEnabled: boolean;
  rescheduledFrom: number | null;
  createdBy: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface QueueEntry {
  id: number;
  appointmentId: number | null;
  patientId: number;
  patientName: string;
  patientCode: string;
  dentistName: string | null;
  queueNumber: number;
  arrivedAt: string;
  calledAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  status: string;
  notes: string;
  updatedAt: string;
}

// ------------------------------------------------------------------ clinical
export interface TreatmentCatalogItem {
  id: number;
  code: string;
  name: string;
  category: string;
  description: string;
  defaultPricePaise: number;
  durationMinutes: number;
  active: boolean;
  notes: string;
  updatedAt: string;
}

export interface MedicineCatalogItem {
  id: number;
  name: string;
  genericName: string;
  form: string;
  strength: string;
  commonDosage: string;
  active: boolean;
}

export interface PrescriptionItem {
  id: number;
  name: string;
  genericName: string;
  form: string;
  strength: string;
  dose: string;
  frequency: string;
  morning: boolean;
  noon: boolean;
  night: boolean;
  beforeAfter: string;
  durationDays: number | null;
  quantity: string;
  prn: boolean;
  instruction: string;
  sortOrder: number;
}

export interface Prescription {
  id: number;
  code: string;
  patientId: number;
  patientName: string;
  patientCode: string;
  patientGender: string;
  patientAge: number | null;
  dentistId: number | null;
  dentistName: string;
  dentistDesignations: string;
  dentistRegistrationNo: string;
  visitId: number | null;
  chiefComplaint: string;
  examination: string;
  diagnosis: string;
  advice: string;
  notes: string;
  status: 'active' | 'cancelled';
  createdAt: string;
  items: PrescriptionItem[];
}

// ------------------------------------------------------------------ billing
export interface InvoiceItem {
  id: number;
  description: string;
  catalogId: number | null;
  quantity: number;
  unitPricePaise: number;
  amountPaise: number;
  sortOrder: number;
}

export interface Invoice {
  id: number;
  number: string;
  patientId: number;
  patientName: string;
  patientCode: string;
  visitId: number | null;
  invoiceDate: string;
  subtotalPaise: number;
  discountPaise: number;
  totalPaise: number;
  paidPaise: number;
  duePaise: number;
  status: 'unpaid' | 'partial' | 'paid' | 'overpaid' | 'void';
  voidReason: string | null;
  voidedAt: string | null;
  notes: string;
  createdBy: number | null;
  createdAt: string;
  items: InvoiceItem[];
}

export interface Payment {
  id: number;
  code: string;
  patientId: number;
  patientName: string;
  invoiceId: number | null;
  invoiceNumber: string | null;
  amountPaise: number;
  method: string;
  reference: string;
  paymentDate: string;
  notes: string;
  receivedBy: string | null;
  void: boolean;
  voidReason: string | null;
  createdAt: string;
}

// ------------------------------------------------------------------ accounting
export interface AccountingTransaction {
  id: number;
  kind: 'income' | 'expense';
  categoryId: number;
  categoryName: string;
  amountPaise: number;
  txnDate: string;
  method: string;
  description: string;
  reference: string;
  patientId: number | null;
  invoiceId: number | null;
  paymentId: number | null;
  attachmentId: number | null;
  createdBy: string | null;
  createdAt: string;
}

export interface CategoryRow {
  id: number;
  name: string;
  active: boolean;
  totalPaise: number;
}

// ------------------------------------------------------------------ inventory
export interface Supplier {
  id: number;
  name: string;
  contactPerson: string;
  phone: string;
  address: string;
  email: string;
  notes: string;
  purchaseCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface InventoryItem {
  id: number;
  sku: string;
  name: string;
  category: string;
  supplierId: number | null;
  supplierName: string | null;
  unit: string;
  purchasePricePaise: number;
  sellingPricePaise: number | null;
  stockQuantity: number;
  reorderLevel: number;
  batchLot: string;
  expiryDate: string | null;
  location: string;
  notes: string;
  active: boolean;
  lowStock: boolean;
  expiringSoon: boolean;
  expired: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface InventoryTransaction {
  id: number;
  itemId: number;
  itemName: string;
  type: 'stock_in' | 'stock_out' | 'adjustment' | 'damaged' | 'expired';
  quantity: number;
  reason: string;
  reference: string;
  unitCostPaise: number | null;
  userName: string | null;
  createdAt: string;
}

// ------------------------------------------------------------------ staff
export interface StaffMember {
  id: number;
  fullName: string;
  age: number | null;
  dob: string | null;
  gender: string;
  address: string;
  phone: string;
  emergencyContact: string;
  emergencyPhone: string;
  bloodGroup: string;
  idNumber: string | null;
  photoDataUrl: string | null;
  department: string;
  position: string;
  salaryPaise: number | null;
  joiningDate: string | null;
  status: 'active' | 'on_leave' | 'resigned';
  notes: string;
  createdAt: string;
  updatedAt: string;
}

// ------------------------------------------------------------------ misc
export interface AttachmentRow {
  id: number;
  patientId: number | null;
  staffId: number | null;
  originalName: string;
  storedName: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
  addedBy: string | null;
  createdAt: string;
  missing: boolean;
}

export interface NotificationItem {
  id: number;
  severity: 'info' | 'success' | 'warning' | 'critical';
  category: string;
  title: string;
  body: string;
  link: string | null;
  createdAt: string;
  readAt: string | null;
}

export interface AuditEntry {
  id: number;
  timestamp: string;
  username: string | null;
  roleName: string | null;
  action: string;
  entity: string;
  entityId: string | null;
  context: string | null;
  result: string;
}

export interface BackupRecord {
  id: number;
  fileName: string;
  filePath: string;
  sizeBytes: number;
  sha256: string;
  schemaVersion: number;
  type: 'manual' | 'scheduled' | 'pre_restore';
  status: 'success' | 'failed';
  note: string | null;
  createdBy: string | null;
  createdAt: string;
}

export interface PrinterProfile {
  id: number;
  name: string;
  paper: string;
  widthMm: number;
  heightMm: number | null;
  marginTopMm: number;
  marginBottomMm: number;
  marginLeftMm: number;
  marginRightMm: number;
  orientation: 'portrait' | 'landscape';
  scale: number;
  fitToWidth: boolean;
  printerName: string;
  isDefault: boolean;
  createdAt: string;
}

export interface Referral {
  id: number;
  patientId: number;
  direction: 'in' | 'out';
  referredToName: string;
  specialty: string;
  clinicHospital: string;
  phone: string;
  reason: string;
  referralDate: string;
  followUpNote: string;
  status: string;
  notes: string;
  createdAt: string;
}

// ------------------------------------------------------------------ IPC
export type ApiErrorCode =
  | 'VALIDATION'
  | 'NOT_FOUND'
  | 'DUPLICATE'
  | 'FORBIDDEN'
  | 'AUTH_REQUIRED'
  | 'LOCKED'
  | 'STATE'
  | 'FILE'
  | 'DB';

export interface ApiError {
  code: ApiErrorCode;
  message: string;
  details?: unknown;
}

export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: ApiError };

export interface AppInfo {
  version: string;
  activated: boolean;
  setupComplete: boolean;
  activatedAt: string | null;
  dataDir: string;
  dbSizeBytes: number;
  attachmentCount: number;
  lastBackupAt: string | null;
  lastBackupStatus: string | null;
}

export interface SetupPayload {
  clinic: {
    name: string;
    address: string;
    phone: string;
    email: string;
    logoBase64: string | null;
    consultationHours: string;
  };
  dentists: Array<{
    name: string;
    designations: string;
    qualifications: string;
    registrationNo: string;
    phone: string;
    consultationHours: string;
  }>;
  admin: { username: string; password: string; displayName: string };
  security: { autoLockMinutes: number; failedLoginLimit: number; accountLockMinutes: number };
  backup: { destination: string; intervalDays: number };
  preferences: { dateFormat: string; timeFormat: string; numberingSystem: 'fdi' | 'universal' };
}
