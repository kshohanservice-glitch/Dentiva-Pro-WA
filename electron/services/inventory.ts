import type { Core, Actor } from '../core';
import { ApiError } from './errors';
import { nowIso, localDateStr, addDays } from '../../shared/date';
import type { InventoryItem, InventoryTransaction, Supplier } from '../../shared/types';

const ITEM_SELECT = `
  SELECT i.*, s.name AS supplierName
  FROM inventory_items i LEFT JOIN suppliers s ON s.id = i.supplier_id
`;

function rowToItem(r: Record<string, unknown>, expiryWindowDays: number): InventoryItem {
  const expiry = (r.expiry_date as string) || null;
  const today = localDateStr();
  const windowEnd = addDays(today, expiryWindowDays);
  return {
    id: r.id as number,
    sku: r.sku as string,
    name: r.name as string,
    category: (r.category as string) ?? '',
    supplierId: (r.supplier_id as number) ?? null,
    supplierName: (r.supplierName as string) ?? null,
    unit: (r.unit as string) ?? 'pcs',
    purchasePricePaise: r.purchase_price as number,
    sellingPricePaise: (r.selling_price as number) ?? null,
    stockQuantity: r.stock_quantity as number,
    reorderLevel: r.reorder_level as number,
    batchLot: (r.batch_lot as string) ?? '',
    expiryDate: expiry,
    location: (r.location as string) ?? '',
    notes: (r.notes as string) ?? '',
    active: !!r.active,
    lowStock: (r.stock_quantity as number) <= (r.reorder_level as number),
    expiringSoon: !!expiry && expiry > today && expiry <= windowEnd,
    expired: !!expiry && expiry < today,
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
  };
}

export function listItems(core: Core, f: { q?: string; lowStock?: boolean; expiring?: boolean; page?: number; pageSize?: number } = {}): { items: InventoryItem[]; total: number } {
  const window = core.settingGet<number>('notification.expiry_days', 30) ?? 30;
  const where: string[] = [];
  const params: unknown[] = [];
  if (f.q) {
    where.push('(i.name LIKE ? OR i.sku LIKE ? OR i.category LIKE ?)');
    params.push(`%${f.q}%`, `%${f.q}%`, `%${f.q}%`);
  }
  if (f.lowStock) where.push('i.stock_quantity <= i.reorder_level AND i.active = 1');
  if (f.expiring) where.push(`(i.expiry_date IS NOT NULL AND i.expiry_date <= ? AND i.active = 1)`);
  if (f.expiring) params.push(addDays(localDateStr(), window));
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const total = (core.db
    .prepare(`SELECT COUNT(*) AS c FROM inventory_items i LEFT JOIN suppliers s ON s.id = i.supplier_id ${whereSql}`)
    .get(...params) as { c: number }).c;
  const rows = core.db
    .prepare(`${ITEM_SELECT} ${whereSql} ORDER BY i.name LIMIT ? OFFSET ?`)
    .all(...params, Math.min(500, f.pageSize ?? 100), (Math.max(1, f.page ?? 1) - 1) * (f.pageSize ?? 100)) as Array<Record<string, unknown>>;
  return { items: rows.map((r) => rowToItem(r, window)), total };
}

export interface ItemInput {
  sku?: string;
  name: string;
  category?: string;
  supplierId?: number | null;
  unit?: string;
  purchasePricePaise?: number;
  sellingPricePaise?: number | null;
  reorderLevel?: number;
  batchLot?: string;
  expiryDate?: string | null;
  location?: string;
  notes?: string;
  active?: boolean;
}

export function saveItem(core: Core, actor: Actor, id: number | null, input: ItemInput): InventoryItem {
  if (!input.name.trim()) throw ApiError.validation('Item name is required.');
  const window = core.settingGet<number>('notification.expiry_days', 30) ?? 30;
  const now = nowIso();
  if (id) {
    const existing = core.db.prepare(`${ITEM_SELECT} WHERE i.id = ?`).get(id) as Record<string, unknown> | undefined;
    if (!existing) throw ApiError.notFound('inventory item', id);
    if (input.sku) {
      const dup = core.db.prepare('SELECT id FROM inventory_items WHERE sku = ? COLLATE NOCASE AND id != ?').get(input.sku.toUpperCase(), id) as { id: number } | undefined;
      if (dup) throw ApiError.duplicate(`SKU ${input.sku.toUpperCase()} is already used.`);
    }
    core.tx(() => {
      core.db
        .prepare(
          `UPDATE inventory_items SET sku = COALESCE(?, sku), name = ?, category = ?, supplier_id = ?, unit = ?, purchase_price = ?,
            selling_price = ?, reorder_level = ?, batch_lot = ?, expiry_date = ?, location = ?, notes = ?, active = ?, updated_at = ? WHERE id = ?`,
        )
        .run(
          input.sku ? input.sku.toUpperCase() : null,
          input.name.trim(),
          input.category ?? '',
          input.supplierId === undefined ? null : input.supplierId,
          input.unit ?? 'pcs',
          input.purchasePricePaise ?? 0,
          input.sellingPricePaise === undefined ? null : input.sellingPricePaise,
          input.reorderLevel ?? 5,
          input.batchLot ?? '',
          input.expiryDate === undefined ? null : input.expiryDate,
          input.location ?? '',
          input.notes ?? '',
          (input.active ?? true) ? 1 : 0,
          now,
          id,
        );
    });
    core.audit('inventory.item_updated', 'inventory', String(id), { name: input.name }, actor);
  } else {
    const sku = (input.sku || `SKU-${id ?? ''}${Math.floor(Math.random() * 900 + 100)}`).toUpperCase();
    const dup = core.db.prepare('SELECT id FROM inventory_items WHERE sku = ? COLLATE NOCASE').get(sku) as { id: number } | undefined;
    if (dup) throw ApiError.duplicate(`SKU ${sku} is already used.`);
    const r = core.tx(() => {
      const rr = core.db
        .prepare(
          `INSERT INTO inventory_items (sku, name, category, supplier_id, unit, purchase_price, selling_price, stock_quantity, reorder_level, batch_lot, expiry_date, location, notes, active, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, 1, ?, ?)`,
        )
        .run(sku, input.name.trim(), input.category ?? '', input.supplierId ?? null, input.unit ?? 'pcs', input.purchasePricePaise ?? 0, input.sellingPricePaise ?? null, input.reorderLevel ?? 5, input.batchLot ?? '', input.expiryDate ?? null, input.location ?? '', input.notes ?? '', now, now);
      return Number(rr.lastInsertRowid);
    });
    core.audit('inventory.item_created', 'inventory', String(r), { name: input.name, sku }, actor);
    id = r;
  }
  const row = core.db.prepare(`${ITEM_SELECT} WHERE i.id = ?`).get(id) as Record<string, unknown>;
  return rowToItem(row, window);
}

export interface StockMoveInput {
  type: 'stock_in' | 'stock_out' | 'adjustment' | 'damaged' | 'expired';
  quantity: number;
  reason?: string;
  reference?: string;
  unitCostPaise?: number | null;
}

export function stockMove(core: Core, actor: Actor, itemId: number, input: StockMoveInput): InventoryTransaction {
  const item = core.db.prepare('SELECT * FROM inventory_items WHERE id = ?').get(itemId) as Record<string, unknown> | undefined;
  if (!item) throw ApiError.notFound('inventory item', itemId);
  const qty = input.quantity;
  if (!Number.isFinite(qty) || qty === 0) throw ApiError.validation('Quantity must be a non-zero number.');
  const allowNegative = core.settingGet<boolean>('inventory.allow_negative', false) ?? false;

  const delta =
    input.type === 'stock_in' ? qty :
    input.type === 'stock_out' ? -qty :
    input.type === 'damaged' ? -qty :
    input.type === 'expired' ? -qty :
    qty; // adjustment: signed as given

  const current = item.stock_quantity as number;
  const next = Math.round((current + delta) * 100) / 100;
  if (next < 0 && !allowNegative) {
    throw ApiError.state(
      `This move would reduce stock from ${current} to ${next}. Negative stock is not allowed. Enable it in Settings → Inventory if intentional.`,
    );
  }
  const now = nowIso();
  const id = core.tx(() => {
    core.db.prepare('UPDATE inventory_items SET stock_quantity = ?, updated_at = ? WHERE id = ?').run(next, now, itemId);
    const r = core.db
      .prepare(
        `INSERT INTO inventory_transactions (item_id, type, quantity, reason, reference, unit_cost, user_id, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(itemId, input.type, delta, input.reason ?? '', input.reference ?? '', input.unitCostPaise ?? null, actor.userId, now);
    return Number(r.lastInsertRowid);
  });
  core.audit('inventory.stock_moved', 'inventory', String(itemId), { type: input.type, qty: delta, next }, actor);
  if (next <= (item.reorder_level as number)) {
    core.notify('warning', 'inventory', 'Low stock: ' + (item.name as string), `Stock level ${next} ${item.unit} is at or below the reorder level.`, `/inventory`, `lowstock-${itemId}-${nowIso().slice(0, 10).replace(/-/g, '')}`);
  }
  const row = core.db.prepare('SELECT * FROM inventory_transactions WHERE id = ?').get(id) as Record<string, unknown>;
  return rowToTxn(row, item.name as string);
}

const rowToTxn = (r: Record<string, unknown>, itemName: string): InventoryTransaction => ({
  id: r.id as number,
  itemId: r.item_id as number,
  itemName,
  type: r.type as InventoryTransaction['type'],
  quantity: r.quantity as number,
  reason: (r.reason as string) ?? '',
  reference: (r.reference as string) ?? '',
  unitCostPaise: (r.unit_cost as number) ?? null,
  userName: null,
  createdAt: r.created_at as string,
});

export function listTransactions(core: Core, itemId: number | null, page = 1, pageSize = 50): { items: InventoryTransaction[]; total: number } {
  const where = itemId ? 'WHERE t.item_id = ?' : '';
  const params: unknown[] = itemId ? [itemId] : [];
  const total = (core.db.prepare(`SELECT COUNT(*) AS c FROM inventory_transactions t ${where}`).get(...params) as { c: number }).c;
  const rows = core.db
    .prepare(
      `SELECT t.*, i.name AS itemName, u.display_name AS userName
       FROM inventory_transactions t
       JOIN inventory_items i ON i.id = t.item_id
       LEFT JOIN users u ON u.id = t.user_id
       ${where} ORDER BY t.created_at DESC, t.id DESC LIMIT ? OFFSET ?`,
    )
    .all(...params, pageSize, (page - 1) * pageSize) as Array<Record<string, unknown>>;
  return {
    total,
    items: rows.map((r) => ({
      id: r.id as number,
      itemId: r.item_id as number,
      itemName: r.itemName as string,
      type: r.type as InventoryTransaction['type'],
      quantity: r.quantity as number,
      reason: (r.reason as string) ?? '',
      reference: (r.reference as string) ?? '',
      unitCostPaise: (r.unit_cost as number) ?? null,
      userName: (r.userName as string) ?? null,
      createdAt: r.created_at as string,
    })),
  };
}

// ================================================================ SUPPLIERS

export function listSuppliers(core: Core): Supplier[] {
  const rows = core.db
    .prepare(
      `SELECT s.*, (SELECT COUNT(*) FROM inventory_transactions t WHERE t.item_id IN (SELECT id FROM inventory_items WHERE supplier_id = s.id)) AS purchaseCount
       FROM suppliers s ORDER BY s.name`,
    )
    .all() as Array<Record<string, unknown>>;
  return rows.map((r) => ({
    id: r.id as number,
    name: r.name as string,
    contactPerson: (r.contact_person as string) ?? '',
    phone: (r.phone as string) ?? '',
    address: (r.address as string) ?? '',
    email: (r.email as string) ?? '',
    notes: (r.notes as string) ?? '',
    purchaseCount: r.purchaseCount as number,
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
  }));
}

export function saveSupplier(core: Core, actor: Actor, input: { id?: number; name: string; contactPerson?: string; phone?: string; address?: string; email?: string; notes?: string }): Supplier {
  if (!input.name.trim()) throw ApiError.validation('Supplier name is required.');
  const now = nowIso();
  let id = input.id ?? 0;
  core.tx(() => {
    if (input.id) {
      core.db.prepare('UPDATE suppliers SET name = ?, contact_person = ?, phone = ?, address = ?, email = ?, notes = ?, updated_at = ? WHERE id = ?')
        .run(input.name.trim(), input.contactPerson ?? '', input.phone ?? '', input.address ?? '', input.email ?? '', input.notes ?? '', now, input.id);
      id = input.id;
    } else {
      const r = core.db.prepare('INSERT INTO suppliers (name, contact_person, phone, address, email, notes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
        .run(input.name.trim(), input.contactPerson ?? '', input.phone ?? '', input.address ?? '', input.email ?? '', input.notes ?? '', now, now);
      id = Number(r.lastInsertRowid);
    }
  });
  core.audit('supplier.saved', 'supplier', String(id), { name: input.name }, actor);
  return listSuppliers(core).find((s) => s.id === id)!;
}

export function deleteSupplier(core: Core, actor: Actor, id: number): void {
  const used = core.db.prepare('SELECT COUNT(*) AS c FROM inventory_items WHERE supplier_id = ?').get(id) as { c: number };
  if (used.c > 0) throw ApiError.state('This supplier is linked to inventory items. Reassign them first.');
  core.tx(() => {
    core.db.prepare('DELETE FROM suppliers WHERE id = ?').run(id);
  });
  core.audit('supplier.deleted', 'supplier', String(id), null, actor);
}
