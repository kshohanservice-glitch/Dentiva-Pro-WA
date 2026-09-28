import { useCallback, useEffect, useRef, useState } from 'react';
import { Building2, Stethoscope, ShieldCheck, Bell, Printer, KeyRound, Plus, Pencil, Trash2, Upload, Check } from 'lucide-react';
import { api, hasPerm } from '../lib/api';
import { useApp } from '../context/AppContext';
import { PageHeader } from '../components/Shell';
import { Button, Card, Field, Input, Select, Checkbox, Modal, Tabs, useToast, toastError, Badge } from '../components/ui';
import type { Clinic, Dentist, PrinterProfile } from '@shared/types';
import { PAPER_PRESETS } from '@shared/constants';

export function Settings() {
  const { session } = useApp();
  const canAdmin = hasPerm(session?.perms, 'admin.settings');
  const [tab, setTab] = useState('clinic');

  const tabs: Array<{ key: string; label: React.ReactNode }> = [
    { key: 'clinic', label: <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}><Building2 size={14} /> Clinic</span> },
    { key: 'dentists', label: <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}><Stethoscope size={14} /> Dentists</span> },
    { key: 'security', label: <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}><ShieldCheck size={14} /> Security</span> },
    { key: 'notifications', label: <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}><Bell size={14} /> Notifications</span> },
    { key: 'printers', label: <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}><Printer size={14} /> Printers</span> },
    { key: 'account', label: <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}><KeyRound size={14} /> My account</span> },
  ];
  if (!canAdmin) {
    tabs.length = 0;
    tabs.push({ key: 'account', label: <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}><KeyRound size={14} /> My account</span> });
  }
  const active = tabs.some((t) => t.key === tab) ? tab : tabs[0].key;

  return (
    <div style={{ padding: 22, maxWidth: 1000, margin: '0 auto' }}>
      <PageHeader title="Settings" subtitle={canAdmin ? 'Clinic profile, preferences, print and account management' : 'Your personal account'} />
      <Tabs tabs={tabs} active={active} onChange={setTab} />
      {active === 'clinic' && canAdmin && <ClinicTab />}
      {active === 'dentists' && canAdmin && <DentistsTab />}
      {active === 'security' && canAdmin && <SecurityTab />}
      {active === 'notifications' && canAdmin && <NotificationsTab />}
      {active === 'printers' && canAdmin && <PrintersTab />}
      {active === 'account' && <AccountTab />}
    </div>
  );
}

// ================================================================ CLINIC

function ClinicTab() {
  const [c, setC] = useState<Clinic | null>(null);
  const [form, setForm] = useState<Partial<Clinic>>({});
  const [logo, setLogo] = useState<string | null | undefined>(undefined); // undefined = keep
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    api<Clinic>('clinic.get').then((r) => { setC(r); setForm(r); }).catch((e) => toast('error', String((e as Error)?.message ?? e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const set = (k: string, v: string) => { setForm((f) => ({ ...f, [k]: v })); setDirty(true); };

  const pickLogo = async (f: File | undefined) => {
    if (!f) return;
    if (f.size > 2 * 1024 * 1024) { toast('error', 'Logo must be under 2 MB.'); return; }
    const reader = new FileReader();
    reader.onload = () => { setLogo(String(reader.result)); setDirty(true); };
    reader.readAsDataURL(f);
  };

  const save = async () => {
    setBusy(true);
    try {
      await api('clinic.save', { ...form, logoBase64: logo === undefined ? undefined : logo });
      toast('success', 'Clinic settings saved.');
      setDirty(false);
    } catch (e) {
      toastError(toast, e);
    } finally {
      setBusy(false);
    }
  };

  if (!c) return <Card>Loading…</Card>;

  return (
    <Card>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
          {form.logoDataUrl ? (
            <img src={form.logoDataUrl} alt="Clinic logo" style={{ width: 72, height: 72, objectFit: 'contain', border: '1px solid var(--c-border)', borderRadius: 12, padding: 4 }} />
          ) : (
            <div style={{ width: 72, height: 72, border: '1px dashed var(--c-border-strong)', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--c-text-3)' }}>
              <Upload size={20} />
            </div>
          )}
          <input ref={fileRef} type="file" accept="image/png,image/jpeg" hidden onChange={(e) => pickLogo(e.target.files?.[0])} />
          <div style={{ display: 'flex', gap: 8 }}>
            <Button size="sm" variant="secondary" onClick={() => fileRef.current?.click()}>Upload logo</Button>
            {form.logoDataUrl && <Button size="sm" variant="ghost" onClick={() => { setLogo(null); setDirty(true); }}>Remove</Button>}
          </div>
          <div style={{ fontSize: 'var(--fs-caption)', color: 'var(--c-text-3)', marginLeft: 8 }}>Shown on prescriptions, invoices and receipts.</div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 14 }}>
          <Field label="Clinic name" required>
            <Input value={form.name ?? ''} onChange={(e) => set('name', e.target.value)} />
          </Field>
          <Field label="Phone">
            <Input value={form.phone ?? ''} onChange={(e) => set('phone', e.target.value)} />
          </Field>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 14 }}>
          <Field label="Address">
            <Input value={form.address ?? ''} onChange={(e) => set('address', e.target.value)} />
          </Field>
          <Field label="Email">
            <Input value={form.email ?? ''} onChange={(e) => set('email', e.target.value)} />
          </Field>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <Field label="Consultation hours (printed on documents)">
            <Input value={form.consultationHours ?? ''} onChange={(e) => set('consultationHours', e.target.value)} />
          </Field>
          <Field label="Prescription footer" hint="Small print at the bottom of prescriptions">
            <Input value={form.prescriptionFooter ?? ''} onChange={(e) => set('prescriptionFooter', e.target.value)} placeholder="e.g. e-Rx: This is a computer generated prescription" />
          </Field>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14 }}>
          <Field label="Date format">
            <Select value={form.dateFormat ?? 'DD/MM/YYYY'} onChange={(e) => set('dateFormat', e.target.value)}>
              <option value="DD/MM/YYYY">DD/MM/YYYY</option>
              <option value="MM/DD/YYYY">MM/DD/YYYY</option>
              <option value="YYYY-MM-DD">YYYY-MM-DD</option>
            </Select>
          </Field>
          <Field label="Time format">
            <Select value={form.timeFormat ?? '24h'} onChange={(e) => set('timeFormat', e.target.value)}>
              <option value="24h">24-hour</option>
              <option value="12h">12-hour (AM/PM)</option>
            </Select>
          </Field>
          <Field label="Default tooth numbering">
            <Select value={form.numberingSystem ?? 'fdi'} onChange={(e) => set('numberingSystem', e.target.value)}>
              <option value="fdi">FDI (international)</option>
              <option value="universal">Universal</option>
            </Select>
          </Field>
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <Button loading={busy} disabled={!dirty} onClick={save} icon={<Check size={15} />}>Save clinic settings</Button>
        </div>
      </div>
    </Card>
  );
}

// ================================================================ DENTISTS

function DentistsTab() {
  const [items, setItems] = useState<Dentist[]>([]);
  const [editing, setEditing] = useState<Dentist | 'new' | null>(null);
  const toast = useToast();

  const load = useCallback(() => {
    api<Dentist[]>('dentists.list', { includeInactive: true }).then(setItems).catch((e) => toast('error', String((e as Error)?.message ?? e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(load, [load]);

  return (
    <Card style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <Button size="sm" icon={<Plus size={14} />} onClick={() => setEditing('new')}>Add dentist</Button>
      </div>
      {items.length === 0 && <div style={{ color: 'var(--c-text-3)', fontSize: 'var(--fs-small)' }}>No dentists configured yet.</div>}
      {items.map((d) => (
        <div key={d.id} style={{ display: 'flex', gap: 12, alignItems: 'center', border: '1px solid var(--c-border)', borderRadius: 'var(--r-md)', padding: '10px 14px' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 650, fontSize: 'var(--fs-body)' }}>
              {d.name} {d.designations && <span style={{ color: 'var(--c-text-2)', fontWeight: 400 }}>— {d.designations}</span>}
              {!d.active && <Badge tone="muted">Inactive</Badge>}
            </div>
            <div style={{ fontSize: 'var(--fs-caption)', color: 'var(--c-text-3)' }}>
              {[d.qualifications, d.registrationNo ? `Reg. ${d.registrationNo}` : '', d.phone, d.consultationHours ? `Hours: ${d.consultationHours}` : ''].filter(Boolean).join(' · ') || '—'}
            </div>
          </div>
          <Button size="sm" variant="ghost" icon={<Pencil size={13} />} onClick={() => setEditing(d)}>Edit</Button>
        </div>
      ))}
      {editing && <DentistForm dentist={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />}
    </Card>
  );
}

function DentistForm({ dentist, onClose, onSaved }: { dentist: Dentist | null; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({
    name: dentist?.name ?? '',
    designations: dentist?.designations ?? '',
    qualifications: dentist?.qualifications ?? '',
    registrationNo: dentist?.registrationNo ?? '',
    phone: dentist?.phone ?? '',
    consultationHours: dentist?.consultationHours ?? '',
    active: dentist?.active ?? true,
  });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k: string, v: string | boolean) => setForm((f) => ({ ...f, [k]: v }));

  const save = async () => {
    setErr('');
    setBusy(true);
    try {
      await api('dentists.save', { id: dentist?.id, ...form });
      onSaved();
    } catch (e) {
      setErr(String((e as Error)?.message ?? e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title={dentist ? `Edit dentist — ${dentist.name}` : 'Add dentist'}
      onClose={onClose}
      width={560}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={save} loading={busy}>{dentist ? 'Save changes' : 'Add dentist'}</Button>
        </>
      }
    >
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <Field label="Full name (with Dr.)" required>
          <Input value={form.name} onChange={(e) => set('name', e.target.value)} autoFocus />
        </Field>
        <Field label="Designations" hint="Printed after the name on prescriptions">
          <Input value={form.designations} onChange={(e) => set('designations', e.target.value)} placeholder="e.g. BDS, FDS RCS" />
        </Field>
        <div style={{ gridColumn: '1 / -1' }}>
          <Field label="Qualifications">
            <Input value={form.qualifications} onChange={(e) => set('qualifications', e.target.value)} />
          </Field>
        </div>
        <Field label="Registration number">
          <Input value={form.registrationNo} onChange={(e) => set('registrationNo', e.target.value)} />
        </Field>
        <Field label="Phone">
          <Input value={form.phone} onChange={(e) => set('phone', e.target.value)} />
        </Field>
        <div style={{ gridColumn: '1 / -1' }}>
          <Field label="Consultation hours (printed on documents)">
            <Input value={form.consultationHours} onChange={(e) => set('consultationHours', e.target.value)} placeholder="e.g. 9:00 AM – 8:00 PM, Sat – Thu" />
          </Field>
        </div>
        <Checkbox label="Active" checked={form.active} onChange={(e) => set('active', e.target.checked)} />
        {err && <div style={{ gridColumn: '1 / -1', color: 'var(--c-danger)', fontSize: 'var(--fs-small)', fontWeight: 500 }}>{err}</div>}
      </div>
    </Modal>
  );
}

// ================================================================ SECURITY

function SecurityTab() {
  const [s, setS] = useState<Record<string, unknown> | null>(null);
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const toast = useToast();

  useEffect(() => {
    api<Record<string, unknown>>('settings.get').then((r) => { setS(r); setDirty(false); }).catch((e) => toast('error', String((e as Error)?.message ?? e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!s) return <Card>Loading…</Card>;

  const patch = (k: string, v: unknown) => {
    setS((x) => ({ ...(x ?? {}), [k]: v }));
    setDirty(true);
  };

  const save = async () => {
    setBusy(true);
    try {
      await api('settings.save', {
        patch: {
          'security.auto_lock_minutes': s['security.auto_lock_minutes'],
          'security.failed_login_limit': s['security.failed_login_limit'],
          'security.account_lock_minutes': s['security.account_lock_minutes'],
          'security.require_reauth_for_destructive': s['security.require_reauth_for_destructive'],
          'inventory.allow_negative': s['inventory.allow_negative'],
          'clinical.visit_edit_window_days': s['clinical.visit_edit_window_days'],
          'appointment.default_duration': s['appointment.default_duration'],
        },
      });
      toast('success', 'Security settings saved.');
      setDirty(false);
    } catch (e) {
      toastError(toast, e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <Field label="Auto-lock the application after inactivity">
          <Select value={String(s['security.auto_lock_minutes'] ?? 15)} onChange={(e) => patch('security.auto_lock_minutes', Number(e.target.value))} style={{ maxWidth: 280 }}>
            <option value="5">After 5 minutes</option>
            <option value="10">After 10 minutes</option>
            <option value="15">After 15 minutes</option>
            <option value="30">After 30 minutes</option>
            <option value="0">Never (not recommended)</option>
          </Select>
        </Field>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <Field label="Temporary lock after failed sign-ins">
            <Select value={String(s['security.failed_login_limit'] ?? 5)} onChange={(e) => patch('security.failed_login_limit', Number(e.target.value))}>
              <option value="3">After 3 failures</option>
              <option value="5">After 5 failures</option>
              <option value="10">After 10 failures</option>
            </Select>
          </Field>
          <Field label="Account lock duration (minutes)">
            <Select value={String(s['security.account_lock_minutes'] ?? 15)} onChange={(e) => patch('security.account_lock_minutes', Number(e.target.value))}>
              <option value="15">15 minutes</option>
              <option value="30">30 minutes</option>
              <option value="60">1 hour</option>
            </Select>
          </Field>
        </div>
        <Checkbox
          label="Require re-authentication (your password) before destructive actions such as permanent deletions"
          checked={!!s['security.require_reauth_for_destructive']}
          onChange={(e) => patch('security.require_reauth_for_destructive', e.target.checked)}
        />
        <div style={{ borderTop: '1px solid var(--c-border)', paddingTop: 14 }}>
          <Field label="Visits can be edited for how many days after the visit date">
            <Select value={String(s['clinical.visit_edit_window_days'] ?? 30)} onChange={(e) => patch('clinical.visit_edit_window_days', Number(e.target.value))} style={{ maxWidth: 280 }}>
              <option value="0">No editing after completion</option>
              <option value="7">7 days</option>
              <option value="30">30 days</option>
              <option value="90">90 days</option>
            </Select>
          </Field>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <Field label="Default appointment duration (minutes)">
            <Select value={String(s['appointment.default_duration'] ?? 30)} onChange={(e) => patch('appointment.default_duration', Number(e.target.value))}>
              {[15, 30, 45, 60].map((m) => (
                <option key={m} value={m}>{m} minutes</option>
              ))}
            </Select>
          </Field>
          <div style={{ display: 'flex', alignItems: 'flex-end' }}>
            <Checkbox
              label="Allow inventory stock to go negative (not recommended)"
              checked={!!s['inventory.allow_negative']}
              onChange={(e) => patch('inventory.allow_negative', e.target.checked)}
            />
          </div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <Button loading={busy} disabled={!dirty} onClick={save} icon={<Check size={15} />}>Save security settings</Button>
        </div>
      </div>
    </Card>
  );
}

// ================================================================ NOTIFICATIONS

function NotificationsTab() {
  const [s, setS] = useState<Record<string, unknown> | null>(null);
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const toast = useToast();

  useEffect(() => {
    api<Record<string, unknown>>('settings.get').then((r) => { setS(r); setDirty(false); }).catch((e) => toast('error', String((e as Error)?.message ?? e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!s) return <Card>Loading…</Card>;

  const patch = (k: string, v: unknown) => { setS((x) => ({ ...(x ?? {}), [k]: v })); setDirty(true); };

  const save = async () => {
    setBusy(true);
    try {
      await api('settings.save', {
        patch: {
          'notification.upcoming_appointments': s['notification.upcoming_appointments'],
          'notification.low_stock': s['notification.low_stock'],
          'notification.outstanding_balance': s['notification.outstanding_balance'],
          'notification.expiry_days': s['notification.expiry_days'],
          'backup.interval_days': s['backup.interval_days'],
        },
      });
      toast('success', 'Notification settings saved.');
      setDirty(false);
    } catch (e) {
      toastError(toast, e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ fontSize: 'var(--fs-small)', color: 'var(--c-text-2)' }}>In-app notifications appear in the bell menu and are generated automatically while you work.</div>
        <Checkbox
          label="Notify me of appointments coming up today"
          checked={!!s['notification.upcoming_appointments']}
          onChange={(e) => patch('notification.upcoming_appointments', e.target.checked)}
        />
        <Checkbox
          label="Notify me when stock falls to the reorder level"
          checked={!!s['notification.low_stock']}
          onChange={(e) => patch('notification.low_stock', e.target.checked)}
        />
        <Checkbox
          label="Notify me about outstanding patient balances"
          checked={!!s['notification.outstanding_balance']}
          onChange={(e) => patch('notification.outstanding_balance', e.target.checked)}
        />
        <Field label="Expiry warning window (days before expiry date)">
          <Select value={String(s['notification.expiry_days'] ?? 30)} onChange={(e) => patch('notification.expiry_days', Number(e.target.value))} style={{ maxWidth: 200 }}>
            {[7, 15, 30, 60, 90].map((d) => (
              <option key={d} value={d}>{d} days</option>
            ))}
          </Select>
        </Field>
        <div style={{ borderTop: '1px solid var(--c-border)', paddingTop: 14 }}>
          <Field label="Automatic backup interval">
            <Select value={String(s['backup.interval_days'] ?? 7)} onChange={(e) => patch('backup.interval_days', Number(e.target.value))} style={{ maxWidth: 240 }}>
              <option value="7">Every 7 days</option>
              <option value="15">Every 15 days</option>
              <option value="30">Every 30 days</option>
            </Select>
          </Field>
          <div style={{ fontSize: 'var(--fs-caption)', color: 'var(--c-text-3)', marginTop: 6 }}>The app checks for a due scheduled backup when it starts and hourly while open.</div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <Button loading={busy} disabled={!dirty} onClick={save} icon={<Check size={15} />}>Save notification settings</Button>
        </div>
      </div>
    </Card>
  );
}

// ================================================================ PRINTERS

function PrintersTab() {
  const [items, setItems] = useState<PrinterProfile[]>([]);
  const [editing, setEditing] = useState<PrinterProfile | 'new' | null>(null);
  const [deleting, setDeleting] = useState<PrinterProfile | null>(null);
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  const load = useCallback(() => {
    api<PrinterProfile[]>('printers.list').then(setItems).catch((e) => toast('error', String((e as Error)?.message ?? e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(load, [load]);

  const makeDefault = async (p: PrinterProfile) => {
    try {
      await api('printers.save', { ...p, isDefault: true });
      toast('success', `“${p.name}” is now the default paper profile.`);
      load();
    } catch (e) {
      toastError(toast, e);
    }
  };

  return (
    <Card style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontSize: 'var(--fs-small)', color: 'var(--c-text-2)' }}>Paper profiles control how every document is laid out and printed. The default profile is used unless another is picked at print time.</div>
        <Button size="sm" icon={<Plus size={14} />} onClick={() => setEditing('new')}>New profile</Button>
      </div>
      {items.map((p) => (
        <div key={p.id} style={{ display: 'flex', gap: 12, alignItems: 'center', border: '1px solid var(--c-border)', borderRadius: 'var(--r-md)', padding: '10px 14px' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <strong style={{ fontSize: 'var(--fs-body)' }}>{p.name}</strong>
              {p.isDefault && <Badge tone="success">Default</Badge>}
            </div>
            <div style={{ fontSize: 'var(--fs-caption)', color: 'var(--c-text-3)' }}>
              {p.paper} · {p.widthMm}mm{p.heightMm ? ` × ${p.heightMm}mm` : ' (roll)'} · margins {p.marginTopMm}/{p.marginRightMm}/{p.marginBottomMm}/{p.marginLeftMm}mm · {p.scale}%
            </div>
          </div>
          {!p.isDefault && <Button size="sm" variant="ghost" onClick={() => makeDefault(p)}>Make default</Button>}
          <Button size="sm" variant="ghost" icon={<Pencil size={13} />} onClick={() => setEditing(p)}>Edit</Button>
          <Button size="sm" variant="ghost" icon={<Trash2 size={13} />} style={{ color: 'var(--c-danger)' }} onClick={() => setDeleting(p)}>Delete</Button>
        </div>
      ))}
      {editing && <PrinterForm profile={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />}
      {deleting && (
        <Modal
          title="Delete printer profile"
          danger
          onClose={() => setDeleting(null)}
          width={440}
          footer={
            <>
              <Button variant="secondary" onClick={() => setDeleting(null)}>Cancel</Button>
              <Button
                variant="danger"
                loading={busy}
                onClick={async () => {
                  setBusy(true);
                  try {
                    await api('printers.delete', { id: deleting.id });
                    toast('success', 'Profile deleted.');
                    setDeleting(null);
                    load();
                  } catch (e) {
                    toastError(toast, e);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Delete
              </Button>
            </>
          }
        >
          <p style={{ fontSize: 'var(--fs-body)', color: 'var(--c-text-2)' }}>Delete the profile <strong>{deleting.name}</strong>? Documents will use the next available default.</p>
        </Modal>
      )}
    </Card>
  );
}

function PrinterForm({ profile, onClose, onSaved }: { profile: PrinterProfile | null; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(profile?.name ?? '');
  const [paper, setPaper] = useState(profile?.paper ?? 'A4');
  const [widthMm, setWidthMm] = useState(String(profile?.widthMm ?? 210));
  const [margins, setMargins] = useState(profile ? [profile.marginTopMm, profile.marginRightMm, profile.marginBottomMm, profile.marginLeftMm] : [12, 12, 14, 12]);
  const [scale, setScale] = useState(String(profile?.scale ?? 100));
  const [isDefault, setIsDefault] = useState(profile?.isDefault ?? false);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const preset = PAPER_PRESETS.find((p) => p.key === paper);

  const save = async () => {
    setErr('');
    setBusy(true);
    try {
      await api('printers.save', {
        id: profile?.id,
        name,
        paper,
        widthMm: Number(widthMm),
        marginTopMm: margins[0],
        marginRightMm: margins[1],
        marginBottomMm: margins[2],
        marginLeftMm: margins[3],
        scale: Number(scale) || 100,
        fitToWidth: false,
        orientation: 'portrait',
        isDefault,
      });
      onSaved();
    } catch (e) {
      setErr(String((e as Error)?.message ?? e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title={profile ? `Edit profile — ${profile.name}` : 'New printer profile'}
      onClose={onClose}
      width={560}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={save} loading={busy}>{profile ? 'Save profile' : 'Create profile'}</Button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <Field label="Profile name" required>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Front desk — A4" autoFocus />
          </Field>
          <Field label="Paper preset">
            <Select
              value={paper}
              onChange={(e) => {
                setPaper(e.target.value);
                const p = PAPER_PRESETS.find((x) => x.key === e.target.value);
                if (p) {
                  setWidthMm(String(p.widthMm));
                  setMargins([p.margins.top, p.margins.right, p.margins.bottom, p.margins.left]);
                }
              }}
            >
              {PAPER_PRESETS.map((p) => (
                <option key={p.key} value={p.key}>{p.label}</option>
              ))}
            </Select>
          </Field>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14 }}>
          <Field label="Width (mm)">
            <Input type="number" min={30} max={500} value={widthMm} onChange={(e) => setWidthMm(e.target.value)} />
          </Field>
          <Field label="Scale (%)">
            <Input type="number" min={50} max={150} value={scale} onChange={(e) => setScale(e.target.value)} />
          </Field>
          <div style={{ display: 'flex', alignItems: 'flex-end' }}>
            <Checkbox label="Set as default" checked={isDefault} onChange={(e) => setIsDefault(e.target.checked)} />
          </div>
        </div>
        <Field label={`Margins — top / right / bottom / left (mm)${preset ? ` (preset ${preset.key}: ${preset.margins.top}/${preset.margins.right}/${preset.margins.bottom}/${preset.margins.left})` : ''}`}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 10 }}>
            {['Top', 'Right', 'Bottom', 'Left'].map((label, i) => (
              <Input key={label} type="number" min={0} max={50} value={String(margins[i])} onChange={(e) => setMargins((m) => m.map((v, j) => (j === i ? Number(e.target.value) || 0 : v)))} title={label} />
            ))}
          </div>
        </Field>
        {err && <div style={{ color: 'var(--c-danger)', fontSize: 'var(--fs-small)', fontWeight: 500 }}>{err}</div>}
      </div>
    </Modal>
  );
}

// ================================================================ ACCOUNT

function AccountTab() {
  const { session } = useApp();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [next2, setNext2] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  const save = async () => {
    setErr('');
    if (next !== next2) {
      setErr('New passwords do not match.');
      return;
    }
    if (next.length < 8 || !/[a-zA-Z]/.test(next) || !/\d/.test(next)) {
      setErr('New password must be at least 8 characters with at least one letter and one number.');
      return;
    }
    setBusy(true);
    try {
      await api('auth.changeOwnPassword', { current, next });
      toast('success', 'Password changed. Use the new password next time you sign in or unlock.');
      setCurrent('');
      setNext('');
      setNext2('');
    } catch (e) {
      setErr(String((e as Error)?.message ?? e));
    } finally {
      setBusy(false);
    }
  };

  if (!session) return null;
  const u = session.user;

  return (
    <Card style={{ maxWidth: 560 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
          <span style={{ width: 52, height: 52, borderRadius: 14, background: 'var(--c-primary-subtle)', color: 'var(--c-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 20 }}>
            {u.displayName.slice(0, 1).toUpperCase()}
          </span>
          <div>
            <strong style={{ fontSize: 'var(--fs-h2)' }}>{u.displayName}</strong>
            <div style={{ fontSize: 'var(--fs-small)', color: 'var(--c-text-2)' }}>
              @{u.username} · {u.roles.join(', ')} {u.isOwner && '· Owner'}
            </div>
            <div style={{ fontSize: 'var(--fs-caption)', color: 'var(--c-text-3)' }}>
              Last sign-in: {u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString() : '—'}
            </div>
          </div>
        </div>
        <div style={{ borderTop: '1px solid var(--c-border)', paddingTop: 16 }}>
          <strong style={{ fontSize: 'var(--fs-body)' }}>Change my password</strong>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 12 }}>
            <Field label="Current password" required>
              <Input type="password" value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" />
            </Field>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <Field label="New password" required hint="≥ 8 characters, letter + number">
                <Input type="password" value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" />
              </Field>
              <Field label="Confirm new password" required error={next && next !== next2 ? 'Passwords do not match.' : undefined}>
                <Input type="password" value={next2} onChange={(e) => setNext2(e.target.value)} autoComplete="new-password" />
              </Field>
            </div>
            {err && <div style={{ color: 'var(--c-danger)', fontSize: 'var(--fs-small)', fontWeight: 500 }}>{err}</div>}
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <Button loading={busy} onClick={save} disabled={!current || !next}>Change password</Button>
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
}
