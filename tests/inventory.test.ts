/**
 * Inventory: stock in/out/adjust/damaged/expired with exact quantity math,
 * the no-negative-stock gate (and its explicit opt-out), low-stock and
 * expiry notifications (with dedupe), SKU integrity, supplier CRUD.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as inventory from '../electron/services/inventory';
import * as admin from '../electron/services/admin';
import { makeFixture, cleanup, type Fixture } from './helpers';

let f: Fixture;
beforeEach(() => {
  f = makeFixture();
});
afterEach(() => cleanup(f));

function item(over: Partial<inventory.ItemInput> = {}): number {
  const it = inventory.saveItem(f.core, f.actor, null, { name: 'Gloves (M)', category: 'Consumables', ...over });
  return it.id;
}

const stock = (id: number): number =>
  (f.core.db.prepare('SELECT stock_quantity FROM inventory_items WHERE id = ?').get(id) as { stock_quantity: number }).stock_quantity;

const txnRows = (id: number | null = null) =>
  f.core.db
    .prepare(id == null ? 'SELECT quantity, type FROM inventory_transactions ORDER BY id' : 'SELECT quantity, type FROM inventory_transactions WHERE item_id = ? ORDER BY id')
    .all(...(id == null ? [] : [id])) as Array<{ quantity: number; type: string }>;

describe('stock movements', () => {
  it('stock in / out / adjustment / damaged / expired all update quantity exactly', () => {
    const id = item({ reorderLevel: 100 }); // high reorder level: no low-stock noise
    inventory.stockMove(f.core, f.actor, id, { type: 'stock_in', quantity: 10, reference: 'PO-1' });
    expect(stock(id)).toBe(10);
    inventory.stockMove(f.core, f.actor, id, { type: 'stock_out', quantity: 4, reason: 'Used in treatment' });
    expect(stock(id)).toBe(6);
    inventory.stockMove(f.core, f.actor, id, { type: 'adjustment', quantity: -2, reason: 'Physical count correction' });
    expect(stock(id)).toBe(4);
    inventory.stockMove(f.core, f.actor, id, { type: 'damaged', quantity: 1 });
    expect(stock(id)).toBe(3);
    inventory.stockMove(f.core, f.actor, id, { type: 'expired', quantity: 3 });
    expect(stock(id)).toBe(0);

    // signed quantities are persisted in the ledger
    expect(txnRows(id).map((t) => t.quantity)).toEqual([10, -4, -2, -1, -3]);
  });

  it('refuses to go negative unless the practice explicitly allows it', () => {
    const id = item({ reorderLevel: 0 });
    inventory.stockMove(f.core, f.actor, id, { type: 'stock_in', quantity: 5 });
    expect(() => inventory.stockMove(f.core, f.actor, id, { type: 'stock_out', quantity: 6 })).toThrow(/Negative stock is not allowed/);
    expect(stock(id)).toBe(5); // unchanged after the rejected move

    // explicit opt-out
    admin.saveSettings(f.core, f.actor, { 'inventory.allow_negative': true });
    inventory.stockMove(f.core, f.actor, id, { type: 'stock_out', quantity: 6, reason: 'pending supplier delivery' });
    expect(stock(id)).toBe(-1);
  });

  it('zero and non-numeric quantities are rejected', () => {
    const id = item({ reorderLevel: 0 });
    expect(() => inventory.stockMove(f.core, f.actor, id, { type: 'stock_in', quantity: 0 })).toThrow();
    expect(() => inventory.stockMove(f.core, f.actor, id, { type: 'stock_in', quantity: Number.NaN })).toThrow();
  });

  it('moves against missing items are NOT_FOUND', () => {
    expect(() => inventory.stockMove(f.core, f.actor, 99999, { type: 'stock_in', quantity: 1 })).toThrow(/not found/i);
  });
});

describe('alerts', () => {
  it('low stock at/below reorder level notifies once per day (dedupe)', () => {
    const id = item({ reorderLevel: 5, name: 'Local Anesthetic' });
    inventory.stockMove(f.core, f.actor, id, { type: 'stock_in', quantity: 10 });
    const before = (f.core.db.prepare('SELECT COUNT(*) c FROM notifications').get() as { c: number }).c;
    inventory.stockMove(f.core, f.actor, id, { type: 'stock_out', quantity: 5 }); // → 5 = reorder level
    let n = (f.core.db.prepare('SELECT COUNT(*) c FROM notifications WHERE title LIKE ?').get('%Low stock%Local Anesthetic%') as { c: number }).c;
    expect(n).toBe(before + 1);
    // another same-day drop stays at/below the level → no duplicate
    inventory.stockMove(f.core, f.actor, id, { type: 'stock_out', quantity: 1 }); // → 4
    n = (f.core.db.prepare('SELECT COUNT(*) c FROM notifications WHERE title LIKE ?').get('%Low stock%Local Anesthetic%') as { c: number }).c;
    expect(n).toBe(before + 1);

    const low = inventory.listItems(f.core, { lowStock: true }).items;
    expect(low.find((i) => i.id === id)).toBeTruthy();
  });

  it('items expiring within the notification window are flagged', () => {
    const in10d = new Date(Date.now() + 10 * 86400000).toISOString().slice(0, 10);
    const in60d = new Date(Date.now() + 60 * 86400000).toISOString().slice(0, 10);
    const soon = item({ name: 'ExpSoon', expiryDate: in10d, reorderLevel: 0 });
    const later = item({ name: 'ExpLater', expiryDate: in60d, reorderLevel: 0 });
    const expiring = inventory.listItems(f.core, { expiring: true }).items;
    expect(expiring.find((i) => i.id === soon)).toBeTruthy();
    expect(expiring.find((i) => i.id === later)).toBeUndefined();
  });
});

describe('items & suppliers', () => {
  it('normalizes SKUs and rejects duplicates', () => {
    const a = inventory.saveItem(f.core, f.actor, null, { name: 'Gloves (M)', sku: 'ab-1' });
    expect(a.sku).toBe('AB-1');
    expect(() => inventory.saveItem(f.core, f.actor, null, { name: 'Other', sku: 'AB-1' })).toThrow(/already used/i);
    expect(() => inventory.saveItem(f.core, f.actor, null, { name: '' })).toThrow();
  });

  it('searches by name or sku', () => {
    item({ name: 'Cotton Rolls', sku: 'CT-01' });
    item({ name: 'Impression Putty', sku: 'IM-02' });
    expect(inventory.listItems(f.core, { q: 'cotton' }).items).toHaveLength(1);
    expect(inventory.listItems(f.core, { q: 'IM-02' }).items).toHaveLength(1);
    expect(inventory.listItems(f.core, { q: 'zzz' }).items).toHaveLength(0);
  });

  it('suppliers can be created, listed, and deleted', () => {
    const s = inventory.saveSupplier(f.core, f.actor, { name: 'MediSupply BD', phone: '02-761234' });
    expect(inventory.listSuppliers(f.core).find((x) => x.id === s.id)).toBeTruthy();
    inventory.deleteSupplier(f.core, f.actor, s.id);
    expect(inventory.listSuppliers(f.core).find((x) => x.id === s.id)).toBeUndefined();
    expect(() => inventory.saveSupplier(f.core, f.actor, { name: '' })).toThrow();
  });
});
