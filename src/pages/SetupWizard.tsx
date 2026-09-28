import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Building2, Stethoscope, CalendarClock, UserCircle2, ShieldCheck, DatabaseBackup, CheckCircle2, Plus, Trash2, Upload } from 'lucide-react';
import { api, ApiError } from '../lib/api';
import { Button, Field, Input, Select, Checkbox, Card } from '../components/ui';
import type { SetupPayload } from '@shared/types';

const STEPS = [
  { key: 'clinic', label: 'Clinic', icon: <Building2 size={17} /> },
  { key: 'dentists', label: 'Dentists', icon: <Stethoscope size={17} /> },
  { key: 'hours', label: 'Hours & Preferences', icon: <CalendarClock size={17} /> },
  { key: 'admin', label: 'Administrator', icon: <UserCircle2 size={17} /> },
  { key: 'security', label: 'Security', icon: <ShieldCheck size={17} /> },
  { key: 'backup', label: 'Backup', icon: <DatabaseBackup size={17} /> },
  { key: 'review', label: 'Review', icon: <CheckCircle2 size={17} /> },
];

interface DentistForm {
  name: string;
  designations: string;
  qualifications: string;
  registrationNo: string;
  phone: string;
  consultationHours: string;
}

const emptyDentist = (): DentistForm => ({ name: '', designations: '', qualifications: '', registrationNo: '', phone: '', consultationHours: '' });

export function SetupWizard() {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const [clinicName, setClinicName] = useState('');
  const [logo, setLogo] = useState<string | null>(null);
  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const logoInput = useRef<HTMLInputElement>(null);

  const [dentists, setDentists] = useState<DentistForm[]>([emptyDentist()]);
  const [consultationHours, setConsultationHours] = useState('9:00 AM – 8:00 PM, Sat – Thu');
  const [dateFormat, setDateFormat] = useState('DD/MM/YYYY');
  const [timeFormat, setTimeFormat] = useState('24h');
  const [numbering, setNumbering] = useState<'fdi' | 'universal'>('fdi');

  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');

  const [autoLock, setAutoLock] = useState(15);
  const [failLimit, setFailLimit] = useState(5);

  const [backupDest, setBackupDest] = useState('');
  const [interval, setIntervalDays] = useState(7);

  const pwdOk =
    password.length >= 8 && /[a-zA-Z]/.test(password) && /\d/.test(password) && password === password2;

  const setDentist = (i: number, patch: Partial<DentistForm>) => {
    setDentists((ds) => ds.map((d, j) => (j === i ? { ...d, ...patch } : d)));
  };

  const validateStep = (): string | null => {
    switch (STEPS[step].key) {
      case 'clinic':
        if (!clinicName.trim()) return 'Clinic name is required.';
        return null;
      case 'dentists':
        if (!dentists.length) return 'At least one dentist is required.';
        for (let i = 0; i < dentists.length; i++) {
          if (!dentists[i].name.trim()) return `Dentist ${i + 1}: name is required.`;
        }
        return null;
      case 'hours':
        return null;
      case 'admin':
        if (!username.trim()) return 'Administrator username is required.';
        if (!/^[a-zA-Z0-9._-]{3,32}$/.test(username.trim())) return 'Username must be 3–32 characters (letters, numbers, dot, dash).';
        if (password.length < 8) return 'Password must be at least 8 characters.';
        if (!/[a-zA-Z]/.test(password) || !/\d/.test(password)) return 'Password must contain at least one letter and one number.';
        if (password !== password2) return 'Passwords do not match.';
        return null;
      case 'security':
        return null;
      case 'backup':
        return null;
      default:
        return null;
    }
  };

  const next = () => {
    const problem = validateStep();
    if (problem) {
      setErr(problem);
      return;
    }
    setErr('');
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  };

  const finish = async () => {
    setBusy(true);
    setErr('');
    const payload: SetupPayload = {
      clinic: { name: clinicName.trim(), address, phone, email, logoBase64: logo, consultationHours },
      dentists: dentists.map((d) => ({
        name: d.name.trim(),
        designations: d.designations,
        qualifications: d.qualifications,
        registrationNo: d.registrationNo,
        phone: d.phone,
        consultationHours: d.consultationHours || consultationHours,
      })),
      admin: { username: username.trim(), password, displayName: displayName.trim() || username.trim() },
      security: { autoLockMinutes: autoLock, failedLoginLimit: failLimit, accountLockMinutes: 15 },
      backup: { destination: backupDest, intervalDays: interval },
      preferences: { dateFormat, timeFormat, numberingSystem: numbering },
    };
    try {
      await api('setup.complete', payload);
      navigate('/login');
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Setup failed. Please try again.');
      setBusy(false);
    }
  };

  const pickLogo = async (f: File | undefined) => {
    if (!f) return;
    if (f.size > 2 * 1024 * 1024) {
      setErr('Logo must be under 2 MB.');
      return;
    }
    if (!/^image\/(png|jpeg)$/.test(f.type)) {
      setErr('Logo must be a PNG or JPG image.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setLogo(String(reader.result));
    reader.readAsDataURL(f);
  };

  const pickBackup = async () => {
    try {
      const r = await api<{ path: string | null }>('dialogs.pickFolder');
      if (r.path) setBackupDest(r.path);
    } catch {
      /* ignore */
    }
  };

  return (
    <div style={{ display: 'flex', height: '100%', background: 'var(--c-bg)' }}>
      {/* step rail */}
      <aside style={{ width: 250, background: '#0d1f26', color: '#fff', padding: '28px 18px', display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 30 }}>
          <img src="./icon/icon.png" alt="" style={{ width: 34, height: 34, borderRadius: 9 }} />
          <div>
            <div style={{ fontWeight: 700, fontSize: 15 }}>Setup Wizard</div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>Dentiva Pro</div>
          </div>
        </div>
        {STEPS.map((s, i) => (
          <button
            key={s.key}
            onClick={() => i < step && setStep(i)}
            disabled={i > step}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 11,
              padding: '9px 12px',
              borderRadius: 'var(--r-md)',
              marginBottom: 3,
              fontSize: 13.5,
              fontWeight: i === step ? 650 : 500,
              color: i === step ? '#5eead4' : i < step ? 'rgba(255,255,255,0.75)' : 'rgba(255,255,255,0.35)',
              background: i === step ? 'rgba(94,234,212,0.12)' : 'transparent',
              cursor: i < step ? 'pointer' : 'default',
              textAlign: 'left',
            }}
          >
            <span style={{ opacity: 0.9 }}>{i < step ? <CheckCircle2 size={16} /> : s.icon}</span>
            {s.label}
          </button>
        ))}
        <div style={{ marginTop: 'auto', fontSize: 11, color: 'rgba(255,255,255,0.35)', lineHeight: 1.5 }}>
          Step {step + 1} of {STEPS.length}. You can go back to any completed step.
        </div>
      </aside>

      {/* content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '34px 42px' }}>
        <div style={{ maxWidth: 760 }} className="anim-fade-up" key={step}>
          {STEPS[step].key === 'clinic' && (
            <>
              <h1 style={{ fontSize: 24, fontWeight: 700 }}>Your clinic</h1>
              <p style={{ color: 'var(--c-text-2)', marginTop: 6, marginBottom: 24 }}>These details appear on prescriptions, invoices and reports.</p>
              <Card>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <Field label="Clinic / Dental Care name" required>
                    <Input value={clinicName} onChange={(e) => setClinicName(e.target.value)} placeholder="e.g. Shohag Dental Care" autoFocus />
                  </Field>
                  <div>
                    <div style={{ fontSize: 'var(--fs-small)', fontWeight: 600, color: 'var(--c-text-2)', marginBottom: 5 }}>Logo (optional, PNG/JPG, max 2 MB)</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                      {logo ? (
                        <img src={logo} alt="Logo preview" style={{ width: 64, height: 64, objectFit: 'contain', border: '1px solid var(--c-border)', borderRadius: 10, padding: 4 }} />
                      ) : (
                        <div style={{ width: 64, height: 64, border: '1px dashed var(--c-border-strong)', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--c-text-3)' }}>
                          <Upload size={20} />
                        </div>
                      )}
                      <input ref={logoInput} type="file" accept="image/png,image/jpeg" hidden onChange={(e) => pickLogo(e.target.files?.[0])} />
                      <Button variant="secondary" size="sm" onClick={() => logoInput.current?.click()}>
                        {logo ? 'Change logo' : 'Upload logo'}
                      </Button>
                      {logo && (
                        <Button variant="ghost" size="sm" onClick={() => setLogo(null)}>
                          Remove
                        </Button>
                      )}
                    </div>
                  </div>
                  <Field label="Address">
                    <Input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Street, area, city" />
                  </Field>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                    <Field label="Phone">
                      <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="e.g. 01711-000000" />
                    </Field>
                    <Field label="Email (optional)">
                      <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="clinic@example.com" />
                    </Field>
                  </div>
                </div>
              </Card>
            </>
          )}

          {STEPS[step].key === 'dentists' && (
            <>
              <h1 style={{ fontSize: 24, fontWeight: 700 }}>Your dentists</h1>
              <p style={{ color: 'var(--c-text-2)', marginTop: 6, marginBottom: 24 }}>Add one or more dentists. The first entry is the primary prescriber shown on documents.</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {dentists.map((d, i) => (
                  <Card key={i}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                      <strong style={{ fontSize: 'var(--fs-body)' }}>Dentist {i + 1}</strong>
                      {dentists.length > 1 && (
                        <Button variant="ghost" size="sm" icon={<Trash2 size={14} />} onClick={() => setDentists((ds) => ds.filter((_, j) => j !== i))}>
                          Remove
                        </Button>
                      )}
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                      <Field label="Full name" required>
                        <Input value={d.name} onChange={(e) => setDentist(i, { name: e.target.value })} placeholder="e.g. Dr. Md. Rahman" />
                      </Field>
                      <Field label="Designations" hint="e.g. BDS, FDS RCS (shown on prescriptions)">
                        <Input value={d.designations} onChange={(e) => setDentist(i, { designations: e.target.value })} placeholder="BDS, MDS" />
                      </Field>
                      <Field label="Qualifications">
                        <Input value={d.qualifications} onChange={(e) => setDentist(i, { qualifications: e.target.value })} placeholder="e.g. BDS, MDS (Conservative Dentistry)" />
                      </Field>
                      <Field label="Registration number">
                        <Input value={d.registrationNo} onChange={(e) => setDentist(i, { registrationNo: e.target.value })} placeholder="BD Dental Council reg. no." />
                      </Field>
                      <Field label="Phone">
                        <Input value={d.phone} onChange={(e) => setDentist(i, { phone: e.target.value })} />
                      </Field>
                      <Field label="Consultation hours">
                        <Input value={d.consultationHours} onChange={(e) => setDentist(i, { consultationHours: e.target.value })} placeholder="e.g. 9 AM – 8 PM" />
                      </Field>
                    </div>
                  </Card>
                ))}
                <Button variant="secondary" icon={<Plus size={15} />} onClick={() => setDentists((ds) => [...ds, emptyDentist()])}>
                  Add another dentist
                </Button>
              </div>
            </>
          )}

          {STEPS[step].key === 'hours' && (
            <>
              <h1 style={{ fontSize: 24, fontWeight: 700 }}>Hours & preferences</h1>
              <p style={{ color: 'var(--c-text-2)', marginTop: 6, marginBottom: 24 }}>Default consultation hours and display preferences. All can be changed later in Settings.</p>
              <Card>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <Field label="Default consultation hours" hint="Shown on prescriptions and invoices.">
                    <Input value={consultationHours} onChange={(e) => setConsultationHours(e.target.value)} />
                  </Field>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
                    <Field label="Date format">
                      <Select value={dateFormat} onChange={(e) => setDateFormat(e.target.value)}>
                        <option value="DD/MM/YYYY">DD/MM/YYYY</option>
                        <option value="MM/DD/YYYY">MM/DD/YYYY</option>
                        <option value="YYYY-MM-DD">YYYY-MM-DD</option>
                      </Select>
                    </Field>
                    <Field label="Time format">
                      <Select value={timeFormat} onChange={(e) => setTimeFormat(e.target.value)}>
                        <option value="24h">24-hour</option>
                        <option value="12h">12-hour (AM/PM)</option>
                      </Select>
                    </Field>
                    <Field label="Tooth numbering">
                      <Select value={numbering} onChange={(e) => setNumbering(e.target.value as 'fdi' | 'universal')}>
                        <option value="fdi">FDI (international, 18-48)</option>
                        <option value="universal">Universal (1–32)</option>
                      </Select>
                    </Field>
                  </div>
                </div>
              </Card>
            </>
          )}

          {STEPS[step].key === 'admin' && (
            <>
              <h1 style={{ fontSize: 24, fontWeight: 700 }}>Administrator account</h1>
              <p style={{ color: 'var(--c-text-2)', marginTop: 6, marginBottom: 24 }}>
                This is the first owner account for the practice. There are no default passwords — the password you choose now is the only way in.
              </p>
              <Card>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                  <Field label="Username" required>
                    <Input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="e.g. admin" autoFocus />
                  </Field>
                  <Field label="Display name">
                    <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="e.g. Dr. Shohan Khan" />
                  </Field>
                  <Field label="Password" required hint="Minimum 8 characters with at least one letter and one number.">
                    <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} error={!!password && !pwdOk} />
                  </Field>
                  <Field label="Confirm password" required error={password && password !== password2 ? 'Passwords do not match.' : undefined}>
                    <Input type="password" value={password2} onChange={(e) => setPassword2(e.target.value)} error={!!password && password !== password2} />
                  </Field>
                </div>
              </Card>
            </>
          )}

          {STEPS[step].key === 'security' && (
            <>
              <h1 style={{ fontSize: 24, fontWeight: 700 }}>Security settings</h1>
              <p style={{ color: 'var(--c-text-2)', marginTop: 6, marginBottom: 24 }}>Protect the workstation from shoulder-surfing and unauthorized access.</p>
              <Card>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
                  <Field label="Auto-lock the application after inactivity">
                    <Select value={String(autoLock)} onChange={(e) => setAutoLock(Number(e.target.value))}>
                      <option value="5">After 5 minutes</option>
                      <option value="10">After 10 minutes</option>
                      <option value="15">After 15 minutes</option>
                      <option value="30">After 30 minutes</option>
                      <option value="0">Never (not recommended)</option>
                    </Select>
                  </Field>
                  <Field label="Temporary account lock after failed sign-ins">
                    <Select value={String(failLimit)} onChange={(e) => setFailLimit(Number(e.target.value))}>
                      <option value="3">After 3 failures</option>
                      <option value="5">After 5 failures</option>
                      <option value="10">After 10 failures</option>
                    </Select>
                  </Field>
                  <div style={{ background: 'var(--c-primary-subtle)', borderRadius: 'var(--r-md)', padding: '10px 14px', fontSize: 'var(--fs-small)', color: 'var(--c-primary)' }}>
                    When locked, all data is hidden and your password is required to resume. Locked sessions are recorded in the audit log.
                  </div>
                </div>
              </Card>
            </>
          )}

          {STEPS[step].key === 'backup' && (
            <>
              <h1 style={{ fontSize: 24, fontWeight: 700 }}>Backup</h1>
              <p style={{ color: 'var(--c-text-2)', marginTop: 6, marginBottom: 24 }}>
                Where Dentiva Pro keeps automatic backups of your clinic data. Choose a folder you control — an external drive or network location works well.
              </p>
              <Card>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
                  <Field label="Backup destination folder">
                    <div style={{ display: 'flex', gap: 10 }}>
                      <Input value={backupDest || 'Default: Dentiva Pro data folder (recommended)'} readOnly placeholder="Folder path" style={{ background: 'var(--c-surface-2)' }} />
                      <Button variant="secondary" onClick={pickBackup}>
                        Choose…
                      </Button>
                    </div>
                  </Field>
                  <Field label="Automatic backup interval">
                    <Select value={String(interval)} onChange={(e) => setIntervalDays(Number(e.target.value))}>
                      <option value="7">Every 7 days</option>
                      <option value="15">Every 15 days</option>
                      <option value="30">Every 30 days</option>
                    </Select>
                  </Field>
                  <Checkbox label="I understand I should also copy backups to an external drive regularly." />
                </div>
              </Card>
            </>
          )}

          {STEPS[step].key === 'review' && (
            <>
              <h1 style={{ fontSize: 24, fontWeight: 700 }}>Review & finish</h1>
              <p style={{ color: 'var(--c-text-2)', marginTop: 6, marginBottom: 24 }}>Confirm everything before creating your workspace.</p>
              <Card>
                <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr', gap: '10px 16px', fontSize: 'var(--fs-body)' }}>
                  <span style={{ color: 'var(--c-text-3)' }}>Clinic</span>
                  <strong>{clinicName || '—'}</strong>
                  <span style={{ color: 'var(--c-text-3)' }}>Address</span>
                  <span>{address || '—'}</span>
                  <span style={{ color: 'var(--c-text-3)' }}>Phone</span>
                  <span>{phone || '—'}</span>
                  <span style={{ color: 'var(--c-text-3)' }}>Dentists</span>
                  <span>{dentists.map((d) => d.name).filter(Boolean).join(', ') || '—'}</span>
                  <span style={{ color: 'var(--c-text-3)' }}>Consultation hours</span>
                  <span>{consultationHours || '—'}</span>
                  <span style={{ color: 'var(--c-text-3)' }}>Administrator</span>
                  <span>
                    @{username} ({displayName || username})
                  </span>
                  <span style={{ color: 'var(--c-text-3)' }}>Auto-lock</span>
                  <span>{autoLock ? `After ${autoLock} minutes` : 'Off'}</span>
                  <span style={{ color: 'var(--c-text-3)' }}>Backups</span>
                  <span>
                    Every {interval} days → {backupDest || 'default data folder'}
                  </span>
                  <span style={{ color: 'var(--c-text-3)' }}>Formats</span>
                  <span>
                    {dateFormat} · {timeFormat === '24h' ? '24h' : '12h'} · {numbering === 'fdi' ? 'FDI numbering' : 'Universal numbering'}
                  </span>
                </div>
              </Card>
            </>
          )}

          {err && (
            <div role="alert" style={{ marginTop: 14, background: 'var(--c-danger-subtle)', color: '#991b1b', borderRadius: 'var(--r-md)', padding: '10px 14px', fontSize: 'var(--fs-small)', fontWeight: 500 }}>
              {err}
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 26 }}>
            <Button variant="secondary" disabled={step === 0} onClick={() => setStep((s) => s - 1)}>
              Back
            </Button>
            {step < STEPS.length - 1 ? (
              <Button onClick={next}>Continue</Button>
            ) : (
              <Button loading={busy} onClick={finish}>
                Finish setup
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
