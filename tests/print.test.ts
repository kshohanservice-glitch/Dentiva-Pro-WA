/**
 * Print engine output: the exact HTML that goes to the system printer /
 * PDF pipeline. Validates the A4/A5/thermal layouts — two-column
 * prescription with C/C, O/E, R/E + advice (left) and medicines (right),
 * signature space, embedded OFL fonts as data URLs, ৳ money formatting,
 * invoice totals, receipt lines, and patient summary.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as documents from '../electron/services/documents';
import * as clinical from '../electron/services/clinical';
import * as billing from '../electron/services/billing';
import { makeFixture, makePatient, cleanup, A4, THERMAL80, type Fixture } from './helpers';

let f: Fixture;
beforeEach(() => {
  f = makeFixture();
});
afterEach(() => cleanup(f));

function makeRx(patientId: number): number {
  const rx = clinical.createPrescription(f.core, f.actor, {
    patientId,
    chiefComplaint: 'Toothache in lower right molar since 2 days',
    examination: 'Pulpitis — tooth 46, tender to percussion',
    diagnosis: 'Irreversible pulpitis 46',
    advice: 'Avoid very hot/cold food. Finish all medicines. Review in 7 days.',
    items: [
      {
        name: 'Amoxicillin 500mg',
        form: 'Capsule',
        strength: '500mg',
        dose: '1 cap',
        frequency: 'TDS',
        beforeAfter: 'After meals',
        durationDays: 7,
        quantity: '21',
      },
      {
        name: 'Ibuprofen 400mg',
        form: 'Tablet',
        dose: '1 tab',
        frequency: 'SOS',
        prn: true,
        instruction: 'For pain only, max 3/day',
      },
    ],
  });
  return rx.id;
}

describe('prescription (A4, two-column)', () => {
  let rxId: number;
  beforeEach(() => {
    const p = makePatient(f.core, f.actor, { fullName: 'Print Patient', gender: 'male', age: 34 });
    rxId = makeRx(p.id);
  });

  it('lays out C/C, O/E, R/E and advice on the left, medicines on the right', () => {
    const d = documents.buildDocument(f.core, 'prescription', { id: rxId }, A4);
    const h = d.html;
    expect(h).toContain('C/C — Chief Complaint');
    expect(h).toContain('O/E — On Examination');
    expect(h).toContain('R/E — Diagnosis');
    expect(h).toContain('<div class="label">Advice</div>');
    expect(h).toContain('Medicines');
    // two columns: left 1.05 / right .95 inside a flex row
    expect(h).toContain('display:flex;gap:8mm');
    expect(h).toContain('flex: 1.05');
    expect(h).toContain('flex: .95');
    // medicines rendered on the right with numbering, dose, frequency, duration, PRN chip
    expect(h).toContain('1. Amoxicillin 500mg');
    expect(h).toContain('2. Ibuprofen 400mg');
    expect(h).toContain('<b>TDS</b>');
    expect(h).toContain('7 days');
    expect(h).toContain('PRN');
    expect(h).toContain('For pain only, max 3/day');
    // patient + date + Rx number
    expect(h).toContain('Print Patient');
    expect(h).toContain('Male, 34 yr');
    expect(h).toMatch(/RX-\d{6}/);
    // clinic + prescribing dentist (reg number) + signature space
    expect(h).toContain('Test Dental Clinic');
    expect(h).toContain('Dr. Test Dentist');
    expect(h).toContain('BDA-12345');
    expect(h).toContain('>Signature<');
  });

  it('uses the A4 page geometry and embeds the OFL fonts as data URLs', () => {
    const d = documents.buildDocument(f.core, 'prescription', { id: rxId }, A4);
    expect(d.html).toContain('@page { size: 210mm 297mm; margin: 12mm 12mm 14mm 12mm; }');
    expect(d.html).toContain("font-family: 'Inter', 'Noto Sans Bengali', 'Nirmala UI'");
    expect(d.html).toContain('data:font/woff2;base64,');
    expect(d.html).toContain('@font-face{font-family:\'Noto Sans Bengali\';font-weight:400;');
    expect(d.title).toMatch(/^Prescription RX-\d{6}$/);
  });

  it('escapes user content (XSS-safe print output)', () => {
    const p = makePatient(f.core, f.actor, { fullName: 'Evil <script>alert(1)</script>' });
    const rx = clinical.createPrescription(f.core, f.actor, {
      patientId: p.id,
      chiefComplaint: '<img src=x onerror=alert(1)>',
      items: [{ name: 'Med <b>x</b>' }],
    });
    const d = documents.buildDocument(f.core, 'prescription', { id: rx.id }, A4);
    expect(d.html).not.toContain('<script>');
    expect(d.html).toContain('&lt;script&gt;');
    expect(d.html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(d.html).toContain('Med &lt;b&gt;x&lt;/b&gt;');
  });
});

describe('prescription (thermal 80mm, single column)', () => {
  it('switches to a single-column continuous layout with compact page geometry', () => {
    const p = makePatient(f.core, f.actor, { fullName: 'Thermal Patient' });
    const rxId = makeRx(p.id);
    const d = documents.buildDocument(f.core, 'prescription', { id: rxId }, THERMAL80);
    expect(d.html).toContain('@page { size: 80mm; margin: 4mm 4mm 4mm 4mm; }');
    expect(d.html).toContain('font-size: 8.5pt');
    // no two-column layout, no signature block on thermal
    expect(d.html).not.toContain('display:flex;gap:8mm');
    expect(d.html).not.toContain('Signature');
    // compact labels
    expect(d.html).toContain('C/C:');
    expect(d.html).toContain('Dx:');
    expect(d.html).toContain('Medicines');
  });
});

describe('invoice & receipt', () => {
  it('renders exact ৳ amounts, status badge, and flips to PAID after settlement', () => {
    const p = makePatient(f.core, f.actor, { fullName: 'Invoice Print' });
    const inv = billing.createInvoice(f.core, f.actor, {
      patientId: p.id,
      items: [
        { description: 'Composite filling 46', quantity: 1, unitPricePaise: 50000 },
        { description: 'Scaling', quantity: 2, unitPricePaise: 15000 },
      ],
      discountPaise: 5000,
    });
    expect(inv.totalPaise).toBe(75000);

    const d1 = documents.buildDocument(f.core, 'invoice', { id: inv.id }, A4);
    expect(d1.html).toContain(inv.number);
    expect(d1.html).toContain('@page { size: 210mm 297mm');
    expect(d1.html).toContain('Subtotal');
    expect(d1.html).toContain('৳ 800');
    expect(d1.html).toContain('− ৳ 50');
    expect(d1.html).toContain('৳ 750');
    expect(d1.html).toContain('UNPAID');
    expect(d1.html).toContain('Balance Due');
    expect(d1.html).not.toContain('badge ok">PAID</span>');

    billing.recordPayment(f.core, f.actor, { patientId: p.id, invoiceId: inv.id, amountPaise: 75000, method: 'bkash' });
    const d2 = documents.buildDocument(f.core, 'invoice', { id: inv.id }, A4);
    expect(d2.html).toContain('<span class="badge ok">PAID</span>');
    expect(d2.html).toContain('৳ 750');
  });

  it('void invoices print as VOID with the reason', () => {
    const p = makePatient(f.core, f.actor);
    const inv = billing.createInvoice(f.core, f.actor, { patientId: p.id, items: [{ description: 'x', quantity: 1, unitPricePaise: 1000 }] });
    billing.voidInvoice(f.core, f.actor, inv.id, 'Patient cancelled');
    const d = documents.buildDocument(f.core, 'invoice', { id: inv.id }, A4);
    expect(d.html).toContain('<span class="badge bad">VOID</span>');
    expect(d.html).toContain('Patient cancelled');
  });

  it('receipts show method label, reference, amount and receiver', () => {
    const p = makePatient(f.core, f.actor, { fullName: 'Receipt Person' });
    const inv = billing.createInvoice(f.core, f.actor, { patientId: p.id, items: [{ description: 'Checkup', quantity: 1, unitPricePaise: 12000 }] });
    const r = billing.recordPayment(f.core, f.actor, { patientId: p.id, invoiceId: inv.id, amountPaise: 12000, method: 'nagad', reference: 'NAG-777' });
    const payId = r.payments[0].id;
    const d = documents.buildDocument(f.core, 'receipt', { id: payId }, A4);
    expect(d.html).toContain('PAYMENT RECEIPT');
    expect(d.html).toContain('Nagad');
    expect(d.html).toContain('NAG-777');
    expect(d.html).toContain('৳ 120');
    expect(d.html).toContain('Receipt Person');
    expect(d.html).toContain('Practice Owner');
    // thermal receipt: compact page, single column
    const dt = documents.buildDocument(f.core, 'receipt', { id: payId }, THERMAL80);
    expect(dt.html).toContain('@page { size: 80mm;');
  });
});

describe('patient summary', () => {
  it('aggregates visits, chart conditions and money stats', () => {
    const p = makePatient(f.core, f.actor, { fullName: 'Summary Person', gender: 'female', age: 29, bloodGroup: 'B+' });
    clinical.createVisit(f.core, f.actor, {
      patientId: p.id,
      chiefComplaint: 'Sensitivity',
      diagnosis: 'Moderate caries 36',
      status: 'in_progress',
    });
    const toothId = (f.core.db.prepare("SELECT id FROM teeth WHERE numbering = 'fdi' AND dentition = 'adult' AND name = 'FDI 36'").get() as { id: number } | undefined)?.id;
    if (toothId) clinical.setToothState(f.core, f.actor, p.id, toothId, 'caries', 'Class II');
    const inv = billing.createInvoice(f.core, f.actor, { patientId: p.id, items: [{ description: 'Filling 36', quantity: 1, unitPricePaise: 40000 }] });
    billing.recordPayment(f.core, f.actor, { patientId: p.id, invoiceId: inv.id, amountPaise: 15000, method: 'cash' });

    const d = documents.buildDocument(f.core, 'patient_summary', { id: p.id }, A4);
    expect(d.html).toContain('PATIENT SUMMARY');
    expect(d.html).toContain('Summary Person');
    expect(d.html).toContain('female · 29 yr · Blood B+');
    expect(d.html).toContain('Moderate caries 36');
    expect(d.html).toContain('৳ 400');
    expect(d.html).toContain('৳ 150');
    // outstanding = 250.00 shown in the stats strip
    expect(d.html).toContain('৳ 250');
  });
});

describe('document dispatcher', () => {
  it('rejects unknown ids with NOT_FOUND', () => {
    expect(() => documents.buildDocument(f.core, 'prescription', { id: 99999 }, A4)).toThrow(/not found/i);
    expect(() => documents.buildDocument(f.core, 'invoice', { id: 99999 }, A4)).toThrow(/not found/i);
    expect(() => documents.buildDocument(f.core, 'receipt', { id: 99999 }, A4)).toThrow(/not found/i);
  });
});
