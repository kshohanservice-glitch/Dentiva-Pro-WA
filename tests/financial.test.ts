/**
 * Financial integrity: immutable invoices, integer-paisa money math,
 * payments (partial/full/advance/credit), voiding with accounting reversals,
 * receivables. Money is always whole Taka in paisa (integer) — no floats.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as billing from '../electron/services/billing';
import * as clinical from '../electron/services/clinical';
import * as patientsService from '../electron/services/patients';
import { makeFixture, makePatient, cleanup, type Fixture } from './helpers';

let f: Fixture;
beforeEach(() => {
  f = makeFixture();
});
afterEach(() => cleanup(f));

describe('invoices', () => {
  it('computes totals with exact integer paisa (no float drift)', () => {
    const { core, actor } = f as Fixture & { core: Fixture['core']; actor: Fixture['actor'] };
    const p = makePatient(core, actor, { fullName: 'Money Math' });
    // 1 x ৳500 + 3 x ৳333.33 = 50,000 + 99,999 = 149,999 paise; discount 1,000 → 148,999
    const inv = billing.createInvoice(core, actor, {
      patientId: p.id,
      items: [
        { description: 'Filling (composite)', quantity: 1, unitPricePaise: 50000 },
        { description: 'Scaling', quantity: 3, unitPricePaise: 33333 },
      ],
      discountPaise: 1000,
    });
    expect(inv.subtotalPaise).toBe(149999);
    expect(inv.discountPaise).toBe(1000);
    expect(inv.totalPaise).toBe(148999);
    expect(inv.paidPaise).toBe(0);
    expect(inv.duePaise).toBe(148999);
    expect(inv.status).toBe('unpaid');
    expect(inv.number).toMatch(/^INV-\d{4}-\d{6}$/);
    // every money field is an integer (paisa)
    for (const v of [inv.subtotalPaise, inv.discountPaise, inv.totalPaise, inv.paidPaise, inv.duePaise, ...inv.items.map((i) => i.amountPaise)]) {
      expect(Number.isInteger(v)).toBe(true);
    }
  });

  it('snapshots prices at invoicing time; later catalog price changes do not rewrite invoices', () => {
    const { core, actor } = f;
    const p = makePatient(core, actor);
    const t = clinical.saveTreatment(core, actor, {
      code: 'T-901',
      name: 'Root Canal (MB)',
      category: 'Endodontics',
      description: '',
      defaultPricePaise: 150000,
      durationMinutes: 120,
      active: true,
      notes: '',
    });
    const inv = billing.createInvoice(core, actor, {
      patientId: p.id,
      items: [{ catalogId: t.id, quantity: 1 }],
    });
    expect(inv.totalPaise).toBe(150000);
    // raise the catalog price AFTER the invoice exists
    clinical.saveTreatment(core, actor, {
      id: t.id,
      code: 'T-901',
      name: 'Root Canal (MB)',
      category: 'Endodontics',
      description: '',
      defaultPricePaise: 250000,
      durationMinutes: 120,
      active: true,
      notes: '',
    });
    const re = billing.getInvoice(core, inv.id);
    expect(re.totalPaise).toBe(150000);
    expect(re.items[0].unitPricePaise).toBe(150000);
  });

  it('is immutable: there is no update API and amounts survive payment + invoice void', () => {
    expect((billing as unknown as Record<string, unknown>).updateInvoice).toBeUndefined();
    const { core, actor } = f;
    const p = makePatient(core, actor);
    const inv = billing.createInvoice(core, actor, {
      patientId: p.id,
      items: [{ description: 'Extraction', quantity: 1, unitPricePaise: 80000 }],
    });
    const rec = billing.recordPayment(core, actor, { patientId: p.id, invoiceId: inv.id, amountPaise: 30000, method: 'cash' });
    const mid = billing.getInvoice(core, inv.id);
    expect(mid.totalPaise).toBe(80000);
    expect(mid.paidPaise).toBe(30000);
    // an invoice with recorded payments must have those payments voided first (safeguard)
    expect(() => billing.voidInvoice(core, actor, inv.id, 'Duplicate entry')).toThrow(/payments/i);
    billing.voidPayment(core, actor, rec.payments[0].id, 'void before invoice void');
    billing.voidInvoice(core, actor, inv.id, 'Duplicate entry');
    const after = billing.getInvoice(core, inv.id);
    expect(after.status).toBe('void');
    expect(after.voidReason).toBe('Duplicate entry');
    expect(after.totalPaise).toBe(80000); // original amounts preserved on the voided record
  });

  it('rejects empty item lists and invoices for archived patients', () => {
    const { core, actor } = f;
    const p = makePatient(core, actor);
    expect(() => billing.createInvoice(core, actor, { patientId: p.id, items: [] })).toThrow();
    const inv = billing.createInvoice(core, actor, {
      patientId: p.id,
      items: [{ description: 'Checkup', quantity: 1, unitPricePaise: 1000 }],
    });
    patientsService.archivePatient(core, actor, p.id, 'Moved to another clinic');
    expect(() =>
      billing.createInvoice(core, actor, {
        patientId: p.id,
        items: [{ description: 'Checkup', quantity: 1, unitPricePaise: 1000 }],
      }),
    ).toThrow(/archived/);
    expect(inv.id).toBeTypeOf('number');
  });
});

describe('payments', () => {
  function invoiceOf(total: number): { pid: number; invId: number } {
    const { core, actor } = f;
    const p = makePatient(core, actor, { fullName: `Pay ${total}` });
    const inv = billing.createInvoice(core, actor, {
      patientId: p.id,
      items: [{ description: 'Treatment', quantity: 1, unitPricePaise: total }],
    });
    return { pid: p.id, invId: inv.id };
  }

  it('partial then full payment settles the invoice and books income entries', () => {
    const { core, actor } = f;
    const { pid, invId } = invoiceOf(100000);
    const r1 = billing.recordPayment(core, actor, { patientId: pid, invoiceId: invId, amountPaise: 40000, method: 'cash' });
    expect(r1.incomeEntryId).not.toBeNull();
    expect(r1.creditApplied).toBe(0);
    let inv = billing.getInvoice(core, invId);
    expect(inv.paidPaise).toBe(40000);
    expect(inv.status).toBe('partial');

    const r2 = billing.recordPayment(core, actor, { patientId: pid, invoiceId: invId, amountPaise: 60000, method: 'bkash', reference: 'TRX-1' });
    expect(r2.incomeEntryId).not.toBeNull();
    inv = billing.getInvoice(core, invId);
    expect(inv.paidPaise).toBe(100000);
    expect(inv.status).toBe('paid');
    expect(inv.duePaise).toBe(0);

    // exactly two income accounting entries of the right sizes
    const rows = core.db
      .prepare("SELECT amount FROM accounting_transactions WHERE kind = 'income' AND patient_id = ? ORDER BY id")
      .all(pid) as Array<{ amount: number }>;
    expect(rows.map((r) => r.amount)).toEqual([40000, 60000]);
  });

  it('rejects overpayment, invalid methods, and non-integer or non-positive amounts', () => {
    const { core, actor } = f;
    const { pid, invId } = invoiceOf(10000);
    expect(() => billing.recordPayment(core, actor, { patientId: pid, invoiceId: invId, amountPaise: 10001, method: 'cash' })).toThrow(/exceeds/);
    expect(() => billing.recordPayment(core, actor, { patientId: pid, invoiceId: invId, amountPaise: 5000, method: 'crypto' })).toThrow();
    expect(() => billing.recordPayment(core, actor, { patientId: pid, invoiceId: invId, amountPaise: 12.5, method: 'cash' })).toThrow();
    expect(() => billing.recordPayment(core, actor, { patientId: pid, invoiceId: invId, amountPaise: -5, method: 'cash' })).toThrow();
  });

  it('accepts every Bangladesh payment method', () => {
    const { core, actor } = f;
    for (const m of ['cash', 'bank', 'card', 'bkash', 'nagad', 'rocket', 'upay', 'other']) {
      const { pid, invId } = invoiceOf(1000);
      billing.recordPayment(core, actor, { patientId: pid, invoiceId: invId, amountPaise: 1000, method: m });
    }
    const rows = core.db.prepare("SELECT DISTINCT method FROM payments").all() as Array<{ method: string }>;
    expect(rows.map((r) => r.method).sort()).toEqual(['bank', 'bkash', 'card', 'cash', 'nagad', 'other', 'rocket', 'upay']);
  });

  it('advance payments create credit without touching any invoice, and are applied to the next invoice first', () => {
    const { core, actor } = f;
    const p = makePatient(core, actor, { fullName: 'Advance Pay' });

    // advance of ৳250 with no invoice
    const adv = billing.recordPayment(core, actor, { patientId: p.id, invoiceId: null, amountPaise: 25000, method: 'cash' });
    expect(adv.payments[0].invoiceId).toBeNull();
    expect(adv.incomeEntryId).not.toBeNull(); // cash received → booked as income at receipt
    expect(billing.patientCredit(core, p.id)).toBe(25000);

    // invoice ৳100, paid ৳100 → the full amount is covered by credit
    const inv = billing.createInvoice(core, actor, {
      patientId: p.id,
      items: [{ description: 'Checkup', quantity: 1, unitPricePaise: 10000 }],
    });
    const before = (core.db.prepare("SELECT COUNT(*) c FROM accounting_transactions WHERE kind = 'income' AND patient_id = ?").get(p.id) as { c: number }).c;
    const r = billing.recordPayment(core, actor, { patientId: p.id, invoiceId: inv.id, amountPaise: 10000, method: 'cash' });
    expect(r.creditApplied).toBe(10000);
    expect(billing.getInvoice(core, inv.id).status).toBe('paid');
    // credit application itself books NO new income (it was already booked when the advance was taken)
    const after = (core.db.prepare("SELECT COUNT(*) c FROM accounting_transactions WHERE kind = 'income' AND patient_id = ?").get(p.id) as { c: number }).c;
    expect(after).toBe(before);
    expect(billing.patientCredit(core, p.id)).toBe(15000);
  });

  it('voiding a payment reverses its income entry and reopens the invoice balance', () => {
    const { core, actor } = f;
    const { pid, invId } = invoiceOf(100000);
    billing.recordPayment(core, actor, { patientId: pid, invoiceId: invId, amountPaise: 100000, method: 'cash' });
    expect(billing.getInvoice(core, invId).status).toBe('paid');

    const payId = (core.db.prepare('SELECT id FROM payments WHERE invoice_id = ? ORDER BY id DESC LIMIT 1').get(invId) as { id: number }).id;
    billing.voidPayment(core, actor, payId, 'Paid to wrong patient');

    const inv = billing.getInvoice(core, invId);
    expect(inv.paidPaise).toBe(0);
    expect(inv.status).toBe('unpaid');

    const rows = core.db
      .prepare("SELECT amount FROM accounting_transactions WHERE kind = 'income' AND patient_id = ? ORDER BY id")
      .all(pid) as Array<{ amount: number }>;
    expect(rows.map((r) => r.amount)).toEqual([100000, -100000]);
    expect(
      (core.db.prepare("SELECT COUNT(*) c FROM accounting_transactions WHERE amount < 0 AND description LIKE 'Reversal%'").get() as { c: number }).c,
    ).toBe(1);
    // voiding again is rejected
    expect(() => billing.voidPayment(core, actor, payId, 'again')).toThrow();
  });

  it('requires a reason to void, and payments cannot cross patients', () => {
    const { core, actor } = f;
    const a = invoiceOf(5000);
    const b = invoiceOf(5000);
    expect(() => billing.voidPayment(core, actor, 999999, '')).toThrow();
    expect(() => billing.recordPayment(core, actor, { patientId: a.pid, invoiceId: b.invId, amountPaise: 1000, method: 'cash' })).toThrow(/different patient/);
  });

  it('voided invoices cannot receive further payments', () => {
    const { core, actor } = f;
    const { pid, invId } = invoiceOf(20000);
    billing.voidInvoice(core, actor, invId, 'erroneous');
    expect(() => billing.recordPayment(core, actor, { patientId: pid, invoiceId: invId, amountPaise: 1000, method: 'cash' })).toThrow(/voided/);
  });

  it('tracks outstanding receivables with exact balances', () => {
    const { core, actor } = f;
    const a = invoiceOf(70000);
    billing.recordPayment(core, actor, { patientId: a.pid, invoiceId: a.invId, amountPaise: 20000, method: 'cash' });
    const b = invoiceOf(30000); // fully unpaid
    billing.voidInvoice(core, actor, b.invId, 'cancel'); // voided → not outstanding
    const out = billing.outstandingReceivables(core);
    expect(out).toHaveLength(1);
    expect(out[0].duePaise).toBe(50000);
    expect(out[0].patientId).toBe(a.pid);
  });
});
