import { useCallback, useEffect, useState } from 'react';
import { Plus, Pencil, FlaskConical, Stethoscope, Search } from 'lucide-react';
import { api, hasPerm } from '../lib/api';
import { useApp } from '../context/AppContext';
import { PageHeader } from '../components/Shell';
import {
  Button, Card, Table, Column, Badge, Input, Select, Field, Modal, Tabs, useToast, Loading, EmptyState, Textarea, Checkbox,
} from '../components/ui';
import type { TreatmentCatalogItem, MedicineCatalogItem } from '@shared/types';
import { fmtMoney, toPaise } from '@shared/money';

export function Treatments() {
  const { session, ui } = useApp();
  const [tab, setTab] = useState('treatments');
  const canManage = hasPerm(session?.perms, 'clinical.treatment_catalog.manage');

  return (
    <div style={{ padding: 22, maxWidth: 1200, margin: '0 auto' }}>
      <PageHeader title="Treatments & Medicines" subtitle="Catalog used for visit entries, invoicing and prescriptions" />
      <Tabs
        tabs={[
          { key: 'treatments', label: <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}><Stethoscope size={14} /> Treatment catalog</span> },
          { key: 'medicines', label: <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}><FlaskConical size={14} /> Medicine catalog</span> },
        ]}
        active={tab}
        onChange={setTab}
      />
      {tab === 'treatments' ? <TreatmentsList canManage={canManage} currency={ui.currencySymbol} /> : <MedicinesList canManage={canManage} />}
    </div>
  );
}

function TreatmentsList({ canManage, currency }: { canManage: boolean; currency: string }) {
  const [items, setItems] = useState<TreatmentCatalogItem[] | null>(null);
  const [q, setQ] = useState('');
  const [showInactive, setShowInactive] = useState(false);
  const [editing, setEditing] = useState<TreatmentCatalogItem | 'new' | null>(null);
  const toast = useToast();

  const load = useCallback(() => {
    api<TreatmentCatalogItem[]>('treatments.list', { includeInactive: showInactive }).then(setItems).catch((e) => toast('error', String((e as Error)?.message ?? e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showInactive]);

  useEffect(load, [load]);

  if (!items) return <Loading label="Loading treatments…" />;
  const filtered = items.filter((t) => !q || t.name.toLowerCase().includes(q.toLowerCase()) || t.code.toLowerCase().includes(q.toLowerCase()) || t.category.toLowerCase().includes(q.toLowerCase()));

  const columns: Column<TreatmentCatalogItem>[] = [
    { key: 'code', label: 'Code', render: (r) => <span style={{ fontVariantNumeric: 'tabular-nums', color: 'var(--c-text-2)' }}>{r.code}</span>, width: 90 },
    { key: 'name', label: 'Treatment', render: (r) => (
      <div>
        <div style={{ fontWeight: 650 }}>{r.name}</div>
        {r.description && <div style={{ fontSize: 'var(--fs-caption)', color: 'var(--c-text-3)', maxWidth: 320, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.description}</div>}
      </div>
    ) },
    { key: 'category', label: 'Category', render: (r) => (r.category ? <Badge tone="primary">{r.category}</Badge> : '—'), width: 130 },
    { key: 'price', label: 'Default price', align: 'right', render: (r) => <strong>{fmtMoney(r.defaultPricePaise, currency)}</strong>, width: 120 },
    { key: 'duration', label: 'Duration', render: (r) => `${r.durationMinutes} min`, width: 90, align: 'center' },
    { key: 'active', label: 'Status', width: 90, render: (r) => (r.active ? <Badge tone="success">Active</Badge> : <Badge tone="muted">Inactive</Badge>) },
    ...(canManage ? [{
      key: 'act', label: '', align: 'right' as const, width: 70, render: (r: TreatmentCatalogItem) => (
        <Button size="sm" variant="ghost" icon={<Pencil size={13} />} onClick={() => setEditing(r)}>Edit</Button>
      ),
    }] : []),
  ];

  return (
    <>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 14, flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: '0 1 280px' }}>
          <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--c-text-3)' }} />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search treatments…" style={{ paddingLeft: 30 }} />
        </div>
        <label style={{ display: 'flex', gap: 7, alignItems: 'center', fontSize: 'var(--fs-small)', color: 'var(--c-text-2)' }}>
          <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} style={{ width: 15, height: 15, accentColor: 'var(--c-primary)' }} />
          Show inactive
        </label>
        <div style={{ flex: 1 }} />
        {canManage && <Button size="sm" icon={<Plus size={14} />} onClick={() => setEditing('new')}>New treatment</Button>}
      </div>
      <Card style={{ padding: 0 }}>
        <Table columns={columns} rows={filtered} empty={<EmptyState icon={<Stethoscope size={22} />} title="No treatments" hint="Treatments in the catalog can be added to visits and invoices." />} />
      </Card>
      {editing && <TreatmentForm item={editing === 'new' ? null : editing} currency={currency} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />}
    </>
  );
}

function TreatmentForm({ item, currency, onClose, onSaved }: { item: TreatmentCatalogItem | null; currency: string; onClose: () => void; onSaved: () => void }) {
  const [code, setCode] = useState(item?.code ?? '');
  const [name, setName] = useState(item?.name ?? '');
  const [category, setCategory] = useState(item?.category ?? '');
  const [description, setDescription] = useState(item?.description ?? '');
  const [price, setPrice] = useState(item ? (item.defaultPricePaise / 100).toString() : '');
  const [duration, setDuration] = useState(item?.durationMinutes ?? 30);
  const [active, setActive] = useState(item?.active ?? true);
  const [notes, setNotes] = useState(item?.notes ?? '');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setErr('');
    const p = toPaise(price);
    if (!Number.isFinite(p) || p < 0) {
      setErr('Enter a valid default price.');
      return;
    }
    setBusy(true);
    try {
      await api('treatments.save', {
        id: item?.id,
        code,
        name,
        category,
        description,
        defaultPricePaise: p,
        durationMinutes: Number(duration) || 30,
        active,
        notes,
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
      title={item ? `Edit treatment — ${item.code}` : 'New treatment'}
      onClose={onClose}
      width={560}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={save} loading={busy}>{item ? 'Save changes' : 'Add treatment'}</Button>
        </>
      }
    >
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <Field label="Code" required hint="Unique, e.g. T-042">
          <Input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="T-000" />
        </Field>
        <Field label="Name" required>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Full Mouth Scaling" />
        </Field>
        <Field label="Category">
          <Input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="e.g. Prophylaxis" />
        </Field>
        <Field label="Duration (minutes)">
          <Input type="number" min={5} step={5} value={duration} onChange={(e) => setDuration(Number(e.target.value) || 30)} />
        </Field>
        <div style={{ gridColumn: '1 / -1' }}>
          <Field label="Description">
            <Textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
          </Field>
        </div>
        <Field label={`Default price (${currency})`} required>
          <Input value={price} onChange={(e) => setPrice(e.target.value)} placeholder="0.00" inputMode="decimal" />
        </Field>
        <div style={{ display: 'flex', alignItems: 'flex-end' }}>
          <Checkbox label="Active (available for new visits/invoices)" checked={active} onChange={(e) => setActive(e.target.checked)} />
        </div>
        <div style={{ gridColumn: '1 / -1' }}>
          <Field label="Notes">
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
          </Field>
        </div>
        {err && <div style={{ gridColumn: '1 / -1', color: 'var(--c-danger)', fontSize: 'var(--fs-small)', fontWeight: 500 }}>{err}</div>}
      </div>
    </Modal>
  );
}

function MedicinesList({ canManage }: { canManage: boolean }) {
  const [items, setItems] = useState<MedicineCatalogItem[] | null>(null);
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState<MedicineCatalogItem | 'new' | null>(null);
  const toast = useToast();

  const load = useCallback(() => {
    api<MedicineCatalogItem[]>('medicines.list', q ? { q } : undefined).then(setItems).catch((e) => toast('error', String((e as Error)?.message ?? e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  useEffect(load, [load]);

  if (!items) return <Loading label="Loading medicines…" />;

  const columns: Column<MedicineCatalogItem>[] = [
    { key: 'name', label: 'Medicine', render: (r) => (
      <div>
        <div style={{ fontWeight: 650 }}>{r.name}</div>
        {r.genericName && <div style={{ fontSize: 'var(--fs-caption)', color: 'var(--c-text-3)' }}>{r.genericName}</div>}
      </div>
    ) },
    { key: 'form', label: 'Form', render: (r) => (r.form ? <span style={{ textTransform: 'capitalize' }}>{r.form}</span> : '—'), width: 110 },
    { key: 'strength', label: 'Strength', render: (r) => r.strength || '—', width: 110 },
    { key: 'dosage', label: 'Common dosage', render: (r) => r.commonDosage || '—', width: 160 },
    { key: 'active', label: 'Status', width: 90, render: (r) => (r.active ? <Badge tone="success">Active</Badge> : <Badge tone="muted">Inactive</Badge>) },
    ...(canManage ? [{
      key: 'act', label: '', align: 'right' as const, width: 70, render: (r: MedicineCatalogItem) => (
        <Button size="sm" variant="ghost" icon={<Pencil size={13} />} onClick={() => setEditing(r)}>Edit</Button>
      ),
    }] : []),
  ];

  return (
    <>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 14, flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: '0 1 280px' }}>
          <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--c-text-3)' }} />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search medicines…" style={{ paddingLeft: 30 }} />
        </div>
        <div style={{ flex: 1 }} />
        {canManage && <Button size="sm" icon={<Plus size={14} />} onClick={() => setEditing('new')}>New medicine</Button>}
      </div>
      <Card style={{ padding: 0 }}>
        <Table columns={columns} rows={items} empty={<EmptyState icon={<FlaskConical size={22} />} title="No medicines found" hint="The medicine catalog powers the prescription builder." />} />
      </Card>
      {editing && <MedicineForm item={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />}
    </>
  );
}

function MedicineForm({ item, onClose, onSaved }: { item: MedicineCatalogItem | null; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(item?.name ?? '');
  const [genericName, setGenericName] = useState(item?.genericName ?? '');
  const [form, setForm] = useState(item?.form ?? 'tablet');
  const [strength, setStrength] = useState(item?.strength ?? '');
  const [commonDosage, setCommonDosage] = useState(item?.commonDosage ?? '');
  const [active, setActive] = useState(item?.active ?? true);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setErr('');
    setBusy(true);
    try {
      await api('medicines.save', { id: item?.id, name, genericName, form, strength, commonDosage, active });
      onSaved();
    } catch (e) {
      setErr(String((e as Error)?.message ?? e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title={item ? `Edit medicine — ${item.name}` : 'New medicine'}
      onClose={onClose}
      width={520}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={save} loading={busy}>{item ? 'Save changes' : 'Add medicine'}</Button>
        </>
      }
    >
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <Field label="Brand name" required>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Augmentin" />
        </Field>
        <Field label="Generic name">
          <Input value={genericName} onChange={(e) => setGenericName(e.target.value)} placeholder="e.g. Amoxicillin + Clavulanate" />
        </Field>
        <Field label="Form">
          <Select value={form} onChange={(e) => setForm(e.target.value)}>
            {['tablet', 'capsule', 'syrup', 'injection', 'gel', 'ointment', 'drops', 'rinse', 'other'].map((f) => (
              <option key={f} value={f}>{f[0].toUpperCase() + f.slice(1)}</option>
            ))}
          </Select>
        </Field>
        <Field label="Strength">
          <Input value={strength} onChange={(e) => setStrength(e.target.value)} placeholder="e.g. 625 mg" />
        </Field>
        <div style={{ gridColumn: '1 / -1' }}>
          <Field label="Common dosage" hint="Prefilled into prescriptions">
            <Input value={commonDosage} onChange={(e) => setCommonDosage(e.target.value)} placeholder="e.g. 1 tab TDS for 5 days" />
          </Field>
        </div>
        <div style={{ gridColumn: '1 / -1' }}>
          <Checkbox label="Active" checked={active} onChange={(e) => setActive(e.target.checked)} />
        </div>
        {err && <div style={{ gridColumn: '1 / -1', color: 'var(--c-danger)', fontSize: 'var(--fs-small)', fontWeight: 500 }}>{err}</div>}
      </div>
    </Modal>
  );
}
