import { useCallback, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { Plus, Pencil, Trash2, ShieldCheck, UserCircle2, KeyRound } from 'lucide-react';
import { api, hasPerm } from '../lib/api';
import { useApp } from '../context/AppContext';
import { PageHeader } from '../components/Shell';
import {
  Button, Card, Table, Column, Badge, Input, Select, Field, Modal, ConfirmModal, Tabs, useToast, toastError, Loading, EmptyState, Textarea,
} from '../components/ui';
import type { StaffMember, UserSummary, RoleDef } from '@shared/types';
import type { PermissionDef } from '@shared/permissions';
import { fmtMoney } from '@shared/money';
import { GENDERS } from '@shared/constants';

export function Staff() {
  const { session } = useApp();
  const [tab, setTab] = useState('staff');
  const canStaff = hasPerm(session?.perms, 'staff.view');
  const canStaffManage = hasPerm(session?.perms, 'staff.manage');
  const canUsers = hasPerm(session?.perms, 'admin.users');
  const canRoles = hasPerm(session?.perms, 'admin.roles');

  const tabs: Array<{ key: string; label: ReactNode }> = [];
  if (canStaff) tabs.push({ key: 'staff', label: 'Staff records' });
  if (canUsers) tabs.push({ key: 'users', label: 'App users' });
  if (canRoles) tabs.push({ key: 'roles', label: 'Roles & permissions' });
  if (!tabs.length) tabs.push({ key: 'staff', label: 'Staff records' });
  const active = tabs.some((t) => t.key === tab) ? tab : tabs[0].key;

  return (
    <div style={{ padding: 22, maxWidth: 1200, margin: '0 auto' }}>
      <PageHeader title="Staff & Users" subtitle="Clinic staff records, application sign-in accounts and role-based permissions" />
      <Tabs tabs={tabs} active={active} onChange={setTab} />
      {active === 'staff' && <StaffTab canManage={canStaffManage} />}
      {active === 'users' && <UsersTab />}
      {active === 'roles' && <RolesTab />}
    </div>
  );
}

// ================================================================ STAFF

function StaffTab({ canManage }: { canManage: boolean }) {
  const { ui, session } = useApp();
  const [items, setItems] = useState<StaffMember[] | null>(null);
  const [editing, setEditing] = useState<StaffMember | 'new' | null>(null);
  const [deleting, setDeleting] = useState<StaffMember | null>(null);
  const [busy, setBusy] = useState(false);
  const canSensitive = hasPerm(session?.perms, 'staff.sensitive');
  const toast = useToast();

  const load = useCallback(() => {
    api<StaffMember[]>('staff.list')
      .then((r) => setItems(r))
      .catch((e) => {
        toast('error', String((e as Error)?.message ?? e));
        setItems([]);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(load, [load]);

  const columns: Column<StaffMember>[] = [
    { key: 'name', label: 'Name', render: (r) => (
      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        {r.photoDataUrl ? (
          <img src={r.photoDataUrl} alt="" style={{ width: 34, height: 34, borderRadius: 999, objectFit: 'cover' }} />
        ) : (
          <span style={{ width: 34, height: 34, borderRadius: 999, background: 'var(--c-primary-subtle)', color: 'var(--c-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 13 }}>
            {r.fullName.slice(0, 1).toUpperCase()}
          </span>
        )}
        <div>
          <div style={{ fontWeight: 650 }}>{r.fullName}</div>
          <div style={{ fontSize: 'var(--fs-caption)', color: 'var(--c-text-3)' }}>{r.position || '—'}{r.department ? ` · ${r.department}` : ''}</div>
        </div>
      </div>
    ) },
    { key: 'phone', label: 'Phone', render: (r) => r.phone || '—', width: 130 },
    { key: 'status', label: 'Status', width: 100, render: (r) => (
      <Badge tone={r.status === 'active' ? 'success' : r.status === 'on_leave' ? 'warning' : 'muted'}>
        {r.status === 'active' ? 'Active' : r.status === 'on_leave' ? 'On leave' : 'Resigned'}
      </Badge>
    ) },
    { key: 'joining', label: 'Joined', render: (r) => (r.joiningDate ? r.joiningDate.slice(0, 10) : '—'), width: 105 },
    ...(canSensitive ? [{
      key: 'salary', label: 'Salary', align: 'right' as const, width: 110, render: (r: StaffMember) =>
        r.salaryPaise != null ? <strong>{fmtMoney(r.salaryPaise, ui.currencySymbol)}</strong> : '—',
    }] : []),
    ...(canManage
      ? [{
          key: 'act', label: '', align: 'right' as const, width: 130, render: (r: StaffMember) => (
            <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
              <Button size="sm" variant="ghost" icon={<Pencil size={13} />} onClick={() => setEditing(r)}>Edit</Button>
              <Button size="sm" variant="ghost" icon={<Trash2 size={13} />} style={{ color: 'var(--c-danger)' }} onClick={() => setDeleting(r)}>Delete</Button>
            </div>
          ),
        }]
      : []),
  ];

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 14 }}>
        {canManage && <Button size="sm" icon={<Plus size={14} />} onClick={() => setEditing('new')}>New staff member</Button>}
      </div>
      {items === null ? (
        <div style={{ padding: 30 }}><Loading label="Loading staff…" /></div>
      ) : (
        <Card style={{ padding: 0 }}>
          <Table columns={columns} rows={items} empty={<EmptyState icon={<UserCircle2 size={22} />} title="No staff records" hint="Keep HR records for reception, assistants and other clinic staff." />} />
        </Card>
      )}
      {editing && <StaffForm staff={editing === 'new' ? null : editing} canSensitive={canSensitive} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />}
      {deleting && (
        <ConfirmModal
          title="Delete staff record"
          danger
          confirmLabel="Delete"
          message={<>Delete <strong>{deleting.fullName}</strong>'s record? Attached files remain until deleted separately. This cannot be undone.</>}
          busy={busy}
          onClose={() => setDeleting(null)}
          onConfirm={async () => {
            setBusy(true);
            try {
              await api('staff.delete', { id: deleting.id });
              toast('success', 'Staff record deleted.');
              setDeleting(null);
              load();
            } catch (e) {
              toastError(toast, e);
            } finally {
              setBusy(false);
            }
          }}
        />
      )}
    </>
  );
}

function StaffForm({ staff, canSensitive, onClose, onSaved }: { staff: StaffMember | null; canSensitive: boolean; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({
    fullName: staff?.fullName ?? '',
    age: staff?.age != null ? String(staff.age) : '',
    dob: staff?.dob ?? '',
    gender: staff?.gender ?? '',
    address: staff?.address ?? '',
    phone: staff?.phone ?? '',
    emergencyContact: staff?.emergencyContact ?? '',
    emergencyPhone: staff?.emergencyPhone ?? '',
    bloodGroup: staff?.bloodGroup ?? '',
    idNumber: staff?.idNumber ?? '',
    department: staff?.department ?? '',
    position: staff?.position ?? '',
    salary: staff?.salaryPaise != null ? (staff.salaryPaise / 100).toString() : '',
    joiningDate: staff?.joiningDate ?? '',
    status: staff?.status ?? ('active' as StaffMember['status']),
    notes: staff?.notes ?? '',
  });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));
  const { ui } = useApp();

  const save = async () => {
    setErr('');
    const salary = form.salary === '' ? null : Math.round(Number(form.salary) * 100);
    if (!Number.isFinite(salary as number) || (salary as number) < 0) {
      setErr('Enter a valid salary (or leave it empty).');
      return;
    }
    setBusy(true);
    try {
      await api('staff.save', {
        id: staff?.id ?? null,
        input: {
          fullName: form.fullName,
          age: form.age === '' ? null : Number(form.age),
          dob: form.dob || null,
          gender: form.gender,
          address: form.address,
          phone: form.phone,
          emergencyContact: form.emergencyContact,
          emergencyPhone: form.emergencyPhone,
          bloodGroup: form.bloodGroup,
          idNumber: form.idNumber || null,
          department: form.department,
          position: form.position,
          salaryPaise: salary,
          joiningDate: form.joiningDate || null,
          status: form.status,
          notes: form.notes,
        },
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
      title={staff ? `Edit staff — ${staff.fullName}` : 'New staff member'}
      subtitle={canSensitive ? undefined : 'Sensitive fields (salary, ID number) are hidden for your role.'}
      onClose={onClose}
      width={640}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={save} loading={busy}>{staff ? 'Save changes' : 'Add staff member'}</Button>
        </>
      }
    >
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <Field label="Full name" required>
          <Input value={form.fullName} onChange={(e) => set('fullName', e.target.value)} autoFocus />
        </Field>
        <Field label="Position">
          <Input value={form.position} onChange={(e) => set('position', e.target.value)} placeholder="e.g. Dental Assistant" />
        </Field>
        <Field label="Department">
          <Input value={form.department} onChange={(e) => set('department', e.target.value)} placeholder="e.g. Front desk" />
        </Field>
        <Field label="Phone">
          <Input value={form.phone} onChange={(e) => set('phone', e.target.value)} />
        </Field>
        <Field label="Age">
          <Input type="number" min={16} max={80} value={form.age} onChange={(e) => set('age', e.target.value)} />
        </Field>
        <Field label="Date of birth">
          <Input type="date" value={form.dob} onChange={(e) => set('dob', e.target.value)} />
        </Field>
        <Field label="Gender">
          <Select value={form.gender} onChange={(e) => set('gender', e.target.value)}>
            <option value="">—</option>
            {GENDERS.map((g) => (
              <option key={g.key} value={g.key}>{g.label}</option>
            ))}
          </Select>
        </Field>
        <Field label="Blood group">
          <Select value={form.bloodGroup} onChange={(e) => set('bloodGroup', e.target.value)}>
            <option value="">—</option>
            {['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'].map((b) => (
              <option key={b} value={b}>{b}</option>
            ))}
          </Select>
        </Field>
        <div style={{ gridColumn: '1 / -1' }}>
          <Field label="Address">
            <Input value={form.address} onChange={(e) => set('address', e.target.value)} />
          </Field>
        </div>
        <Field label="Emergency contact">
          <Input value={form.emergencyContact} onChange={(e) => set('emergencyContact', e.target.value)} />
        </Field>
        <Field label="Emergency phone">
          <Input value={form.emergencyPhone} onChange={(e) => set('emergencyPhone', e.target.value)} />
        </Field>
        {canSensitive && (
          <>
            <Field label="National ID number">
              <Input value={form.idNumber} onChange={(e) => set('idNumber', e.target.value)} />
            </Field>
            <Field label={`Salary (${ui.currencySymbol}) / month`}>
              <Input value={form.salary} onChange={(e) => set('salary', e.target.value)} placeholder="0.00" inputMode="decimal" />
            </Field>
          </>
        )}
        <Field label="Joining date">
          <Input type="date" value={form.joiningDate} onChange={(e) => set('joiningDate', e.target.value)} />
        </Field>
        <Field label="Status">
          <Select value={form.status} onChange={(e) => set('status', e.target.value)}>
            <option value="active">Active</option>
            <option value="on_leave">On leave</option>
            <option value="resigned">Resigned</option>
          </Select>
        </Field>
        <div style={{ gridColumn: '1 / -1' }}>
          <Field label="Notes">
            <Textarea rows={2} value={form.notes} onChange={(e) => set('notes', e.target.value)} />
          </Field>
        </div>
        {err && <div style={{ gridColumn: '1 / -1', color: 'var(--c-danger)', fontSize: 'var(--fs-small)', fontWeight: 500 }}>{err}</div>}
      </div>
    </Modal>
  );
}

// ================================================================ USERS

function UsersTab() {
  const [users, setUsers] = useState<UserSummary[]>([]);
  const [roles, setRoles] = useState<RoleDef[]>([]);
  const [editing, setEditing] = useState<UserSummary | 'new' | null>(null);
  const [deleting, setDeleting] = useState<UserSummary | null>(null);
  const [busy, setBusy] = useState(false);
  const { session } = useApp();
  const toast = useToast();

  const load = useCallback(() => {
    api<UserSummary[]>('users.list').then(setUsers).catch((e) => toast('error', String((e as Error)?.message ?? e)));
    api<RoleDef[]>('roles.list').then(setRoles).catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(load, [load]);

  const myId = session?.user.id;

  const columns: Column<UserSummary>[] = [
    { key: 'username', label: 'Username', render: (r) => <strong>@{r.username}</strong>, width: 150 },
    { key: 'name', label: 'Display name', render: (r) => r.displayName },
    { key: 'roles', label: 'Roles', render: (r) => (
      <span style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
        {r.roles.map((role) => (
          <Badge key={role} tone={role === 'Owner' ? 'primary' : 'info'}>{role}</Badge>
        ))}
      </span>
    ), width: 220 },
    { key: 'owner', label: 'Owner', width: 80, render: (r) => (r.isOwner ? <ShieldCheck size={16} style={{ color: 'var(--c-primary)' }} /> : null) },
    { key: 'active', label: 'Status', width: 90, render: (r) => (r.active ? <Badge tone="success">Active</Badge> : <Badge tone="danger">Disabled</Badge>) },
    { key: 'last', label: 'Last sign-in', render: (r) => (r.lastLoginAt ? new Date(r.lastLoginAt).toLocaleString() : 'never'), width: 170 },
    {
      key: 'act', label: '', align: 'right', width: 130, render: (r) => (
        <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
          <Button size="sm" variant="ghost" icon={<Pencil size={13} />} onClick={() => setEditing(r)}>Edit</Button>
          {!r.isOwner && r.id !== myId && (
            <Button size="sm" variant="ghost" icon={<Trash2 size={13} />} style={{ color: 'var(--c-danger)' }} onClick={() => setDeleting(r)}>Delete</Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 14 }}>
        <Button size="sm" icon={<Plus size={14} />} onClick={() => setEditing('new')}>New user</Button>
      </div>
      <Card style={{ padding: 0 }}>
        <Table columns={columns} rows={users} empty={<EmptyState icon={<KeyRound size={22} />} title="No users" />} />
      </Card>
      {editing && <UserForm user={editing === 'new' ? null : editing} roles={roles} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />}
      {deleting && (
        <ConfirmModal
          title="Delete user account"
          danger
          confirmLabel="Delete account"
          message={<>Delete the sign-in account <strong>@{deleting.username}</strong>? Their past audit entries are kept. This cannot be undone.</>}
          busy={busy}
          onClose={() => setDeleting(null)}
          onConfirm={async () => {
            setBusy(true);
            try {
              await api('users.delete', { id: deleting.id });
              toast('success', 'User account deleted.');
              setDeleting(null);
              load();
            } catch (e) {
              toastError(toast, e);
            } finally {
              setBusy(false);
            }
          }}
        />
      )}
    </>
  );
}

function UserForm({ user, roles, onClose, onSaved }: { user: UserSummary | null; roles: RoleDef[]; onClose: () => void; onSaved: () => void }) {
  const [username, setUsername] = useState(user?.username ?? '');
  const [displayName, setDisplayName] = useState(user?.displayName ?? '');
  const [password, setPassword] = useState('');
  const [roleIds, setRoleIds] = useState<number[]>([]);
  const [active, setActive] = useState(user?.active ?? true);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (user) {
      setRoleIds(roles.filter((r) => user.roles.includes(r.name)).map((r) => r.id));
    }
  }, [user, roles]);

  const toggleRole = (id: number) =>
    setRoleIds((xs) => (xs.includes(id) ? xs.filter((x) => x !== id) : [...xs, id]));

  const save = async () => {
    setErr('');
    if (!user && !password) {
      setErr('A password is required for new users.');
      return;
    }
    setBusy(true);
    try {
      await api('users.save', {
        id: user?.id,
        username,
        displayName,
        password: password || undefined,
        roleIds,
        active,
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
      title={user ? `Edit user — @${user.username}` : 'New user'}
      subtitle="Assign roles to control what this user can see and do."
      onClose={onClose}
      width={560}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={save} loading={busy}>{user ? 'Save changes' : 'Create user'}</Button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <Field label="Username" required hint="3–32 chars: letters, numbers, dot, dash, underscore.">
            <Input value={username} onChange={(e) => setUsername(e.target.value)} disabled={!!user && user.isOwner} />
          </Field>
          <Field label="Display name" required>
            <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
          </Field>
        </div>
        <Field label={user ? 'Reset password' : 'Password'} required={!user} hint="Minimum 8 characters with at least one letter and one number. Leave empty to keep the current password.">
          <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
        </Field>
        <div>
          <div style={{ fontSize: 'var(--fs-small)', fontWeight: 600, color: 'var(--c-text-2)', marginBottom: 8 }}>Roles (at least one)</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, border: '1px solid var(--c-border)', borderRadius: 'var(--r-md)', padding: 12, maxHeight: 220, overflowY: 'auto' }}>
            {roles.map((r) => (
              <label key={r.id} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', cursor: 'pointer', opacity: r.isSystem && r.name === 'Owner' ? 0.6 : 1 }}>
                <input type="checkbox" checked={roleIds.includes(r.id)} onChange={() => toggleRole(r.id)} disabled={user?.isOwner} style={{ marginTop: 3, width: 15, height: 15, accentColor: 'var(--c-primary)' }} />
                <span>
                  <span style={{ fontSize: 'var(--fs-body)', fontWeight: 600, display: 'block' }}>{r.name}</span>
                  <span style={{ fontSize: 'var(--fs-caption)', color: 'var(--c-text-3)' }}>{r.description}</span>
                </span>
              </label>
            ))}
          </div>
        </div>
        <CheckboxRow label="Account active (can sign in)" checked={active} onChange={setActive} disabled={user?.isOwner} />
        {err && <div style={{ color: 'var(--c-danger)', fontSize: 'var(--fs-small)', fontWeight: 500 }}>{err}</div>}
      </div>
    </Modal>
  );
}

function CheckboxRow({ label, checked, onChange, disabled }: { label: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <label style={{ display: 'flex', gap: 9, alignItems: 'center', fontSize: 'var(--fs-body)', color: 'var(--c-text-2)', cursor: 'pointer' }}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} disabled={disabled} style={{ width: 15, height: 15, accentColor: 'var(--c-primary)' }} />
      {label}
    </label>
  );
}

// ================================================================ ROLES

function RolesTab() {
  const [roles, setRoles] = useState<RoleDef[]>([]);
  const [perms, setPerms] = useState<PermissionDef[]>([]);
  const [editing, setEditing] = useState<RoleDef | 'new' | null>(null);
  const [deleting, setDeleting] = useState<RoleDef | null>(null);
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  const load = useCallback(() => {
    api<RoleDef[]>('roles.list').then(setRoles).catch((e) => toast('error', String((e as Error)?.message ?? e)));
    api<PermissionDef[]>('permissions.list').then(setPerms).catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(load, [load]);

  const categories = Array.from(new Set(perms.map((p) => p.category)));

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 14 }}>
        <Button size="sm" icon={<Plus size={14} />} onClick={() => setEditing('new')}>New role</Button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 14 }}>
        {roles.map((r) => (
          <Card key={r.id} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <ShieldCheck size={17} style={{ color: 'var(--c-primary)' }} />
                <strong style={{ fontSize: 'var(--fs-body)' }}>{r.name}</strong>
                {r.isSystem && <Badge tone="info">System</Badge>}
              </div>
              <span style={{ fontSize: 'var(--fs-caption)', color: 'var(--c-text-3)' }}>{r.userCount} user{r.userCount === 1 ? '' : 's'}</span>
            </div>
            <div style={{ fontSize: 'var(--fs-small)', color: 'var(--c-text-2)', minHeight: 32 }}>{r.description}</div>
            <div style={{ fontSize: 'var(--fs-caption)', color: 'var(--c-text-3)' }}>{r.permissions.length} permissions</div>
            <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
              <Button size="sm" variant="secondary" icon={<Pencil size={13} />} onClick={() => setEditing(r)}>Edit</Button>
              {!r.isSystem && (
                <Button size="sm" variant="ghost" icon={<Trash2 size={13} />} style={{ color: 'var(--c-danger)' }} onClick={() => setDeleting(r)}>Delete</Button>
              )}
            </div>
          </Card>
        ))}
      </div>

      {editing && <RoleForm role={editing === 'new' ? null : editing} perms={perms} categories={categories} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />}
      {deleting && (
        <ConfirmModal
          title="Delete role"
          danger
          confirmLabel="Delete role"
          message={<>Delete the role <strong>{deleting.name}</strong>? It must not be assigned to any users. This cannot be undone.</>}
          busy={busy}
          onClose={() => setDeleting(null)}
          onConfirm={async () => {
            setBusy(true);
            try {
              await api('roles.delete', { id: deleting.id });
              toast('success', 'Role deleted.');
              setDeleting(null);
              load();
            } catch (e) {
              toastError(toast, e);
            } finally {
              setBusy(false);
            }
          }}
        />
      )}
    </>
  );
}

function RoleForm({ role, perms, categories, onClose, onSaved }: { role: RoleDef | null; perms: PermissionDef[]; categories: string[]; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(role?.name ?? '');
  const [description, setDescription] = useState(role?.description ?? '');
  const [selected, setSelected] = useState<Set<string>>(new Set(role?.permissions ?? []));
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const toggle = (key: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(key)) n.delete(key);
      else n.add(key);
      return n;
    });

  const toggleCat = (cat: string, on: boolean) =>
    setSelected((s) => {
      const n = new Set(s);
      for (const p of perms) if (p.category === cat) {
        if (on) n.add(p.key);
        else n.delete(p.key);
      }
      return n;
    });

  const save = async () => {
    setErr('');
    setBusy(true);
    try {
      await api('roles.save', {
        id: role?.id,
        name: name.trim(),
        description: description.trim(),
        permissions: Array.from(selected),
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
      title={role ? `Edit role — ${role.name}` : 'New role'}
      subtitle={role?.isSystem ? 'System roles can be tuned, but not deleted.' : 'Select exactly what this role can do.'}
      onClose={onClose}
      width={620}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={save} loading={busy}>{role ? 'Save role' : 'Create role'}</Button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 14 }}>
          <Field label="Role name" required>
            <Input value={name} onChange={(e) => setName(e.target.value)} disabled={role?.isSystem} autoFocus />
          </Field>
          <Field label="Description">
            <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Who should have this role?" />
          </Field>
        </div>
        <div style={{ border: '1px solid var(--c-border)', borderRadius: 'var(--r-md)', maxHeight: 380, overflowY: 'auto', padding: 14 }}>
          {categories.map((cat) => {
            const catPerms = perms.filter((p) => p.category === cat);
            const allOn = catPerms.every((p) => selected.has(p.key));
            return (
              <div key={cat} style={{ marginBottom: 14 }}>
                <label style={{ display: 'flex', gap: 9, alignItems: 'center', marginBottom: 6, fontWeight: 700, fontSize: 'var(--fs-small)', color: 'var(--c-text-2)', cursor: 'pointer' }}>
                  <input type="checkbox" checked={allOn} onChange={(e) => toggleCat(cat, e.target.checked)} style={{ width: 15, height: 15, accentColor: 'var(--c-primary)' }} />
                  {cat}
                  <span style={{ color: 'var(--c-text-3)', fontWeight: 400 }}>({catPerms.filter((p) => selected.has(p.key)).length}/{catPerms.length})</span>
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, paddingLeft: 24 }}>
                  {catPerms.map((p) => (
                    <label key={p.key} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 'var(--fs-small)', color: 'var(--c-text-2)', cursor: 'pointer' }}>
                      <input type="checkbox" checked={selected.has(p.key)} onChange={() => toggle(p.key)} style={{ marginTop: 2, width: 14, height: 14, accentColor: 'var(--c-primary)' }} />
                      <span>
                        {p.label}
                        {p.sensitive && <span style={{ color: 'var(--c-warning)', fontSize: 'var(--fs-caption)' }}> · sensitive</span>}
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
        {err && <div style={{ color: 'var(--c-danger)', fontSize: 'var(--fs-small)', fontWeight: 500 }}>{err}</div>}
      </div>
    </Modal>
  );
}
