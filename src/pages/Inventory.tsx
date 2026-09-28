import { useCallback, useEffect, useState } from 'react';
import { Plus, Pencil, Search, ArrowDownToLine, ArrowUpFromLine, AlertTriangle, Trash2 } from 'lucide-react';
import { api, hasPerm } from '../lib/api';
import { useApp } from '../context/AppContext';
import { PageHeader } from '../components/Shell';
import {
  Button, Card, Table, Column, Pagination, Badge, Input, Select, Field, Modal, Tabs, useToast, toastError, Loading, EmptyState, Checkbox,
} from '../components/ui';
import type { InventoryItem, InventoryTransaction, Supplier } from '@shared/types';
import { fmtMoney, toPaise } from '@shared/money';
import { fmtDate, fmtDateTime } from '@shared/date';

const PAGE_SIZE = 25;

export function Inventory() {
  const { session } = useApp();
  const [tab, setTab] = useState('items');
  return (
    <div style={{ padding: 22, maxWidth: 1280, margin: '0 auto' }}>
      <PageHeader title="Inventory" subtitle="Stock levels, movements, expiry tracking and suppliers" />
      <Tabs
        tabs={[
          { key: 'items', label: 'Stock items' },
          { key: 'moves', label: 'Stock movements' },
          { key: 'suppliers', label: 'Suppliers' },
        ]}
        active={tab}
        onChange={setTab}
      />
      {tab === 'items' && <ItemsTab canManage={hasPerm(session?.perms, 'inventory.manage')} />}
      {tab === 'moves' && <MovesTab />}
      {tab === 'suppliers' && <SuppliersTab canManage={hasPerm(session?.perms, 'suppliers.manage')} />}
    </div>
  );
}

// ================================================================ ITEMS

function ItemsTab({ canManage }: { canManage: boolean }) {
  const { ui } = useApp();
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<'all' | 'low' | 'expiring'>('all');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<{ items: InventoryItem[]; total: number } | null>(null);
  const [editing, setEditing] = useState<InventoryItem | 'new' | null>(null);
  const [moving, setMoving] = useState<InventoryItem | null>(null);
  const [deleting, setDeleting] = useState<InventoryItem | null>(null);
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  const load = useCallback(() => {
    api<{ items: InventoryItem[]; total: number }>(
      'inventory.items',
      { q: q || undefined, lowStock: filter === 'low' || undefined, expiring: filter === 'expiring' || undefined, page, pageSize: PAGE_SIZE },
    )
      .then(setData)
      .catch((e) => toast('error', String((e as Error)?.message ?? e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, filter, page]);

  useEffect(load, [load]);

  const columns: Column<InventoryItem>[] = [
    { key: 'sku', label: 'SKU', render: (r) => <span style={{ fontVariantNumeric: 'tabular-nums', color: 'var(--c-text-2)' }}>{r.sku || '—'}</span>, width: 100 },
    { key: 'name', label: 'Item', render: (r) => (
      <div>
        <div style={{ fontWeight: 650 }}>{r.name}</div>
        {r.batchLot && <div style={{ fontSize: 'var(--fs-caption)', color: 'var(--c-text-3)' }}>Batch {r.batchLot}{r.expiryDate ? ` · exp ${fmtDate(r.expiryDate, ui.dateFormat)}` : ''}</div>}
      </div>
    ) },
    { key: 'category', label: 'Category', render: (r) => (r.category ? <Badge tone="primary">{r.category}</Badge> : '—'), width: 120 },
    { key: 'stock', label: 'Stock', align: 'center', width: 90, render: (r) => (
      <span style={{ fontWeight: 750, color: r.stockQuantity <= 0 ? 'var(--c-danger)' : r.lowStock ? 'var(--c-warning)' : 'var(--c-text)' }}>{r.stockQuantity} {r.unit}</span>
    ) },
    { key: 'reorder', label: 'Reorder at', align: 'center', render: (r) => r.reorderLevel, width: 90 },
    { key: 'price', label: 'Cost / Price', align: 'right', render: (r) => (
      <span style={{ fontSize: 'var(--fs-small)' }}>{fmtMoney(r.purchasePricePaise, ui.currencySymbol)} / {r.sellingPricePaise != null ? fmtMoney(r.sellingPricePaise, ui.currencySymbol) : '—'}</span>
    ), width: 150 },
    { key: 'alerts', label: 'Alerts', width: 150, render: (r) => (
      <span style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
        {r.expired && <Badge tone="danger">EXPIRED</Badge>}
        {!r.expired && r.expiringSoon && <Badge tone="warning">Expiring soon</Badge>}
        {r.lowStock && <Badge tone="warning">Low stock</Badge>}
        {!r.active && <Badge tone="muted">Inactive</Badge>}
      </span>
    ) },
    ...(canManage
      ? [{
          key: 'act', label: '', align: 'right' as const, width: 150, render: (r: InventoryItem) => (
            <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
              <Button size="sm" variant="ghost" icon={<ArrowDownToLine size={13} />} onClick={() => setMoving(r)}>Stock</Button>
              <Button size="sm" variant="ghost" icon={<Pencil size={13} />} onClick={() => setEditing(r)}>Edit</Button>
            </div>
          ),
        }]
      : []),
  ];

  return (
    <>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 14, flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: '0 1 260px' }}>
          <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--c-text-3)' }} />
          <Input value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} placeholder="Search name or SKU…" style={{ paddingLeft: 30 }} />
        </div>
        <Select value={filter} onChange={(e) => { setFilter(e.target.value as 'all' | 'low' | 'expiring'); setPage(1); }} style={{ width: 170 }}>
          <option value="all">All items</option>
          <option value="low">Low stock only</option>
          <option value="expiring">Expiring soon only</option>
        </Select>
        <div style={{ flex: 1 }} />
        {canManage && <Button size="sm" icon={<Plus size={14} />} onClick={() => setEditing('new')}>New item</Button>}
      </div>
      <Card style={{ padding: 0 }}>
        {!data ? (
          <div style={{ padding: 30 }}><Loading label="Loading inventory…" /></div>
        ) : (
          <>
            <Table
              columns={columns}
              rows={data.items}
              empty={<EmptyState icon={<AlertTriangle size={22} />} title="No items" hint={filter !== 'all' ? 'No items match this filter.' : 'Add your first stock item.'} />}
            />
            <div style={{ padding: '10px 14px' }}>
              <Pagination page={page} pageSize={PAGE_SIZE} total={data.total} onPage={setPage} />
            </div>
          </>
        )}
      </Card>
      {editing && <ItemForm item={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />}
      {moving && <MoveForm item={moving} onClose={() => setMoving(null)} onSaved={() => { setMoving(null); load(); }} />}
      {deleting && (
        <Modal
          title="Deactivate item"
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
                    await api('inventory.save', {
                      id: deleting.id,
                      input: {
                        sku: deleting.sku, name: deleting.name, category: deleting.category, supplierId: deleting.supplierId,
                        unit: deleting.unit, purchasePricePaise: deleting.purchasePricePaise, sellingPricePaise: deleting.sellingPricePaise,
                        reorderLevel: deleting.reorderLevel, batchLot: deleting.batchLot, expiryDate: deleting.expiryDate, location: deleting.location,
                        notes: deleting.notes, active: false,
                      },
                    });
                    toast('success', 'Item deactivated (history preserved).');
                    setDeleting(null);
                    load();
                  } catch (e) {
                    toastError(toast, e);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Deactivate
              </Button>
            </>
          }
        >
          <p style={{ fontSize: 'var(--fs-body)', color: 'var(--c-text-2)' }}>
            Items with stock history are never hard-deleted. Deactivating <strong>{deleting.name}</strong> hides it from selection lists while preserving every past movement.
          </p>
        </Modal>
      )}
    </>
  );
}

function ItemForm({ item, onClose, onSaved }: { item: InventoryItem | null; onClose: () => void; onSaved: () => void }) {
  const { ui } = useApp();
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [form, setForm] = useState({
    sku: item?.sku ?? '',
    name: item?.name ?? '',
    category: item?.category ?? '',
    supplierId: item?.supplierId ? String(item.supplierId) : '',
    unit: item?.unit ?? 'pcs',
    purchasePricePaise: item ? (item.purchasePricePaise / 100).toString() : '',
    sellingPricePaise: item?.sellingPricePaise != null ? (item.sellingPricePaise / 100).toString() : '',
    reorderLevel: item?.reorderLevel ?? 5,
    batchLot: item?.batchLot ?? '',
    expiryDate: item?.expiryDate ?? '',
    location: item?.location ?? '',
    notes: item?.notes ?? '',
    active: item?.active ?? true,
  });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<Supplier[]>('suppliers.list').then(setSuppliers).catch(() => undefined);
  }, []);

  const set = (k: string, v: string | number | boolean) => setForm((f) => ({ ...f, [k]: v }));

  const save = async () => {
    setErr('');
    const pp = toPaise(form.purchasePricePaise);
    const sp = form.sellingPricePaise === '' ? null : toPaise(form.sellingPricePaise);
    if (!Number.isFinite(pp) || pp < 0) {
      setErr('Enter a valid purchase price.');
      return;
    }
    if (sp != null && !Number.isFinite(sp)) {
      setErr('Enter a valid selling price (or leave it empty).');
      return;
    }
    setBusy(true);
    try {
      await api('inventory.save', {
        id: item?.id ?? null,
        input: {
          sku: form.sku,
          name: form.name,
          category: form.category,
          supplierId: form.supplierId ? Number(form.supplierId) : null,
          unit: form.unit,
          purchasePricePaise: pp,
          sellingPricePaise: sp,
          reorderLevel: Number(form.reorderLevel) || 0,
          batchLot: form.batchLot,
          expiryDate: form.expiryDate || null,
          location: form.location,
          notes: form.notes,
          active: form.active,
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
      title={item ? `Edit item — ${item.name}` : 'New stock item'}
      onClose={onClose}
      width={640}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={save} loading={busy}>{item ? 'Save changes' : 'Add item'}</Button>
        </>
      }
    >
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <Field label="Name" required>
          <Input value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="e.g. Composite A2" />
        </Field>
        <Field label="SKU" hint="Auto-uppercase; unique">
          <Input value={form.sku} onChange={(e) => set('sku', e.target.value.toUpperCase())} placeholder="e.g. COMP-A2" />
        </Field>
        <Field label="Category">
          <Input value={form.category} onChange={(e) => set('category', e.target.value)} placeholder="e.g. Restorative" />
        </Field>
        <Field label="Supplier">
          <Select value={form.supplierId} onChange={(e) => set('supplierId', e.target.value)}>
            <option value="">—</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </Select>
        </Field>
        <Field label={`Purchase price (${ui.currencySymbol})`} required>
          <Input value={form.purchasePricePaise} onChange={(e) => set('purchasePricePaise', e.target.value)} placeholder="0.00" inputMode="decimal" />
        </Field>
        <Field label={`Selling price (${ui.currencySymbol})`}>
          <Input value={form.sellingPricePaise} onChange={(e) => set('sellingPricePaise', e.target.value)} placeholder="optional" inputMode="decimal" />
        </Field>
        <Field label="Unit">
          <Input value={form.unit} onChange={(e) => set('unit', e.target.value)} placeholder="pcs / box / ml" />
        </Field>
        <Field label="Reorder level" hint="Low-stock alert triggers at or below this">
          <Input type="number" min={0} value={form.reorderLevel} onChange={(e) => set('reorderLevel', Number(e.target.value) || 0)} />
        </Field>
        <Field label="Batch / lot no.">
          <Input value={form.batchLot} onChange={(e) => set('batchLot', e.target.value)} />
        </Field>
        <Field label="Expiry date">
          <Input type="date" value={form.expiryDate} onChange={(e) => set('expiryDate', e.target.value)} />
        </Field>
        <Field label="Location / shelf">
          <Input value={form.location} onChange={(e) => set('location', e.target.value)} />
        </Field>
        <div style={{ display: 'flex', alignItems: 'flex-end' }}>
          <Checkbox label="Active" checked={form.active} onChange={(e) => set('active', e.target.checked)} />
        </div>
        <div style={{ gridColumn: '1 / -1' }}>
          <Field label="Notes">
            <Input value={form.notes} onChange={(e) => set('notes', e.target.value)} />
          </Field>
        </div>
        {err && <div style={{ gridColumn: '1 / -1', color: 'var(--c-danger)', fontSize: 'var(--fs-small)', fontWeight: 500 }}>{err}</div>}
      </div>
    </Modal>
  );
}

function MoveForm({ item, onClose, onSaved }: { item: InventoryItem; onClose: () => void; onSaved: () => void }) {
  const { ui } = useApp();
  const [type, setType] = useState<InventoryTransaction['type']>('stock_in');
  const [quantity, setQuantity] = useState('');
  const [reason, setReason] = useState('');
  const [reference, setReference] = useState('');
  const [unitCost, setUnitCost] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const qty = Number(quantity);
  const delta =
    type === 'stock_in' ? Math.abs(qty) : type === 'adjustment' ? qty : -Math.abs(qty);
  const projected = item.stockQuantity + (Number.isFinite(qty) ? delta : 0);

  const save = async () => {
    setErr('');
    if (!Number.isFinite(qty) || qty === 0) {
      setErr('Enter a non-zero quantity.');
      return;
    }
    setBusy(true);
    try {
      await api('inventory.move', {
        itemId: item.id,
        move: {
          type,
          quantity: type === 'adjustment' ? qty : Math.abs(qty),
          reason,
          reference,
          unitCostPaise: unitCost === '' ? null : toPaise(unitCost),
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
      title={`Stock movement — ${item.name}`}
      subtitle={`Current stock: ${item.stockQuantity} ${item.unit}`}
      onClose={onClose}
      width={520}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={save} loading={busy}>Record movement</Button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          {(['stock_in', 'stock_out', 'adjustment', 'damaged', 'expired'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setType(t)}
              style={{
                padding: '9px 12px',
                borderRadius: 'var(--r-md)',
                border: `1px solid ${type === t ? 'var(--c-primary)' : 'var(--c-border)'}`,
                background: type === t ? 'var(--c-primary-subtle)' : 'var(--c-surface)',
                color: type === t ? 'var(--c-primary)' : 'var(--c-text-2)',
                fontWeight: 600,
                fontSize: 'var(--fs-small)',
                display: 'flex',
                gap: 8,
                alignItems: 'center',
              }}
            >
              {t === 'stock_in' ? <ArrowDownToLine size={14} /> : t === 'adjustment' ? <Pencil size={14} /> : <ArrowUpFromLine size={14} />}
              {t === 'stock_in' ? 'Stock in (purchase)' : t === 'stock_out' ? 'Stock out (consumed)' : t === 'adjustment' ? 'Adjustment (±count)' : t === 'damaged' ? 'Damaged' : 'Expired'}
            </button>
          ))}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <Field label={type === 'adjustment' ? 'Adjustment (signed)' : 'Quantity'} required hint={type === 'adjustment' ? 'Signed delta: e.g. -2 for a shortage found on count, +3 for surplus.' : undefined}>
            <Input value={quantity} onChange={(e) => setQuantity(e.target.value)} inputMode="decimal" autoFocus placeholder="0" />
          </Field>
          <Field label={type === 'stock_in' ? `Unit cost (${ui.currencySymbol})` : 'Reference'}>
            <Input value={type === 'stock_in' ? unitCost : reference} onChange={(e) => (type === 'stock_in' ? setUnitCost(e.target.value) : setReference(e.target.value))} placeholder={type === 'stock_in' ? '0.00' : 'PO no. / voucher'} />
          </Field>
        </div>
        <Field label="Reason">
          <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder={type === 'stock_out' ? 'e.g. Used for patient T-46' : 'optional'} />
        </Field>
        {Number.isFinite(qty) && qty !== 0 && (
          <div style={{ background: projected < 0 ? 'var(--c-danger-subtle)' : 'var(--c-surface-2)', borderRadius: 'var(--r-md)', padding: '10px 14px', fontSize: 'var(--fs-small)', color: projected < 0 ? 'var(--c-danger)' : 'var(--c-text-2)', fontWeight: 600 }}>
            Projected stock after this movement: {projected} {item.unit}
            {projected < 0 && ' — blocked unless “allow negative stock” is enabled in Settings.'}
          </div>
        )}
        {err && <div style={{ color: 'var(--c-danger)', fontSize: 'var(--fs-small)', fontWeight: 500 }}>{err}</div>}
      </div>
    </Modal>
  );
}

// ================================================================ MOVEMENTS

function MovesTab() {
  const { ui } = useApp();
  const [page, setPage] = useState(1);
  const [data, setData] = useState<{ items: InventoryTransaction[]; total: number } | null>(null);

  const load = useCallback(() => {
    api<{ items: InventoryTransaction[]; total: number }>('inventory.transactions', { page, pageSize: PAGE_SIZE }).then(setData).catch(() => undefined);
  }, [page]);

  useEffect(load, [load]);

  if (!data) return <Loading label="Loading movements…" />;

  const typeTone: Record<string, 'success' | 'danger' | 'warning' | 'info' | 'muted'> = {
    stock_in: 'success',
    stock_out: 'info',
    adjustment: 'warning',
    damaged: 'danger',
    expired: 'danger',
  };

  const columns: Column<InventoryTransaction>[] = [
    { key: 'when', label: 'When', render: (r) => fmtDateTime(r.createdAt, ui.dateFormat, ui.timeFormat === '24h'), width: 150 },
    { key: 'item', label: 'Item', render: (r) => (
      <div>
        <div style={{ fontWeight: 650 }}>{r.itemName}</div>
      </div>
    ) },
    { key: 'type', label: 'Type', width: 120, render: (r) => <Badge tone={typeTone[r.type] ?? 'muted'}>{r.type.replace('_', ' ')}</Badge> },
    { key: 'qty', label: 'Qty', align: 'right', width: 80, render: (r) => (
      <span style={{ fontWeight: 700, color: r.type === 'stock_in' ? 'var(--c-success)' : r.type === 'adjustment' && r.quantity >= 0 ? 'var(--c-warning)' : 'var(--c-danger)' }}>
        {r.type === 'stock_in' ? '+' : r.type === 'adjustment' && r.quantity >= 0 ? '+' : ''}{r.quantity}
      </span>
    ) },
    { key: 'reason', label: 'Reason', render: (r) => (
      <div style={{ maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--c-text-2)' }} title={r.reason}>{r.reason || '—'}</div>
    ) },
    { key: 'by', label: 'By', render: (r) => r.userName ?? '—', width: 130 },
  ];

  return (
    <Card style={{ padding: 0 }}>
      <Table
        columns={columns}
        rows={data.items}
        empty={<EmptyState title="No stock movements yet" hint="Every stock-in, consumption, damage and adjustment is recorded here." />}
      />
      <div style={{ padding: '10px 14px' }}>
        <Pagination page={page} pageSize={PAGE_SIZE} total={data.total} onPage={setPage} />
      </div>
    </Card>
  );
}

// ================================================================ SUPPLIERS

function SuppliersTab({ canManage }: { canManage: boolean }) {
  const [items, setItems] = useState<Supplier[]>([]);
  const [editing, setEditing] = useState<Supplier | 'new' | null>(null);
  const [deleting, setDeleting] = useState<Supplier | null>(null);
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  const load = useCallback(() => {
    api<Supplier[]>('suppliers.list').then(setItems).catch((e) => toast('error', String((e as Error)?.message ?? e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(load, [load]);

  const columns: Column<Supplier>[] = [
    { key: 'name', label: 'Supplier', render: (r) => (
      <div>
        <div style={{ fontWeight: 650 }}>{r.name}</div>
        {r.contactPerson && <div style={{ fontSize: 'var(--fs-caption)', color: 'var(--c-text-3)' }}>Contact: {r.contactPerson}</div>}
      </div>
    ) },
    { key: 'phone', label: 'Phone', render: (r) => r.phone || '—', width: 130 },
    { key: 'email', label: 'Email', render: (r) => r.email || '—', width: 180 },
    { key: 'address', label: 'Address', render: (r) => (
      <div style={{ maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--c-text-2)' }} title={r.address}>{r.address || '—'}</div>
    ) },
    { key: 'purchases', label: 'Items', align: 'center', width: 90, render: (r) => r.purchaseCount },
    ...(canManage
      ? [{
          key: 'act', label: '', align: 'right' as const, width: 140, render: (r: Supplier) => (
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
        {canManage && <Button size="sm" icon={<Plus size={14} />} onClick={() => setEditing('new')}>New supplier</Button>}
      </div>
      <Card style={{ padding: 0 }}>
        <Table columns={columns} rows={items} empty={<EmptyState title="No suppliers" hint="Add suppliers to link purchases to stock items." />} />
      </Card>
      {editing && <SupplierForm supplier={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />}
      {deleting && (
        <Modal
          title="Delete supplier"
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
                    await api('suppliers.delete', { id: deleting.id });
                    toast('success', 'Supplier deleted.');
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
          <p style={{ fontSize: 'var(--fs-body)', color: 'var(--c-text-2)' }}>
            Delete <strong>{deleting.name}</strong>? This is only possible if no stock items are linked to them.
          </p>
        </Modal>
      )}
    </>
  );
}

function SupplierForm({ supplier, onClose, onSaved }: { supplier: Supplier | null; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(supplier?.name ?? '');
  const [contactPerson, setContactPerson] = useState(supplier?.contactPerson ?? '');
  const [phone, setPhone] = useState(supplier?.phone ?? '');
  const [email, setEmail] = useState(supplier?.email ?? '');
  const [address, setAddress] = useState(supplier?.address ?? '');
  const [notes, setNotes] = useState(supplier?.notes ?? '');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setErr('');
    setBusy(true);
    try {
      await api('suppliers.save', { id: supplier?.id, name, contactPerson, phone, email, address, notes });
      onSaved();
    } catch (e) {
      setErr(String((e as Error)?.message ?? e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title={supplier ? `Edit supplier — ${supplier.name}` : 'New supplier'}
      onClose={onClose}
      width={540}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={save} loading={busy}>{supplier ? 'Save changes' : 'Add supplier'}</Button>
        </>
      }
    >
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <Field label="Name" required>
          <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </Field>
        <Field label="Contact person">
          <Input value={contactPerson} onChange={(e) => setContactPerson(e.target.value)} />
        </Field>
        <Field label="Phone">
          <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
        </Field>
        <Field label="Email">
          <Input value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <div style={{ gridColumn: '1 / -1' }}>
          <Field label="Address">
            <Input value={address} onChange={(e) => setAddress(e.target.value)} />
          </Field>
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
