import fs from 'node:fs';
import path from 'node:path';
import type { Core } from '../core';
import { ApiError } from './errors';
import { fmtMoney } from '../../shared/money';
import { fmtDate, fmtDateTime } from '../../shared/date';
import { PAYMENT_METHOD_LABEL } from '../../shared/constants';
import { getPrescription, listVisits } from './clinical';
import { getInvoice } from './billing';
import { getPatient360 } from './patients';
import { getClinic } from './admin';
import type { Prescription, Invoice } from '../../shared/types';

// ---------------------------------------------------------------- fonts
let fontCache: { inter400: string; inter600: string; bengali400: string; bengali600: string } | null = null;

function loadFonts(): { inter400: string; inter600: string; bengali400: string; bengali600: string } {
  if (fontCache) return fontCache;
  const candidates = [
    path.join(__dirname, '..', '..', 'resources', 'fonts'),
    path.join(process.cwd(), 'resources', 'fonts'),
  ];
  const dir = candidates.find((d) => fs.existsSync(d)) ?? candidates[1];
  const read = (name: string): string => {
    const file = path.join(dir, name);
    if (!fs.existsSync(file)) return '';
    return fs.readFileSync(file).toString('base64');
  };
  fontCache = {
    inter400: read('Inter-400.woff2'),
    inter600: read('Inter-600.woff2'),
    bengali400: read('NotoSansBengali-400.woff2'),
    bengali600: read('NotoSansBengali-600.woff2'),
  };
  return fontCache;
}

const esc = (s: string | null | undefined): string =>
  String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// ---------------------------------------------------------------- profile
export interface PaperProfile {
  name: string;
  widthMm: number;
  heightMm: number | null;
  marginTopMm: number;
  marginBottomMm: number;
  marginLeftMm: number;
  marginRightMm: number;
  orientation: 'portrait' | 'landscape';
  scale: number;
  fitToWidth: boolean;
}

export function profileFromRow(r: Record<string, unknown>): PaperProfile {
  return {
    name: r.name as string,
    widthMm: r.width_mm as number,
    heightMm: (r.height_mm as number) ?? null,
    marginTopMm: r.margin_top_mm as number,
    marginBottomMm: r.margin_bottom_mm as number,
    marginLeftMm: r.margin_left_mm as number,
    marginRightMm: r.margin_right_mm as number,
    orientation: (r.orientation as 'portrait' | 'landscape') ?? 'portrait',
    scale: (r.scale as number) ?? 100,
    fitToWidth: !!(r.fit_to_width as number),
  };
}

export interface BuiltDocument {
  title: string;
  html: string;
  profile: PaperProfile;
  paperLabel: string;
}

function baseCss(p: PaperProfile): string {
  const fonts = loadFonts();
  const fontFaces = [
    ['Inter', fonts.inter400, '400'],
    ['Inter', fonts.inter600, '600'],
    ['Noto Sans Bengali', fonts.bengali400, '400'],
    ['Noto Sans Bengali', fonts.bengali600, '600'],
  ]
    .filter(([, b64]) => b64)
    .map(([fam, b64, w]) => `@font-face{font-family:'${fam}';font-weight:${w};src:url(data:font/woff2;base64,${b64}) format('woff2');}`)
    .join('');
  const w = p.orientation === 'landscape' && p.heightMm ? p.heightMm : p.widthMm;
  const h = p.orientation === 'landscape' && p.heightMm ? p.widthMm : p.heightMm ?? 297;
  const size = p.heightMm === null ? `${w}mm` : `${w}mm ${h}mm`;
  return `
    ${fontFaces}
    @page { size: ${size}; margin: ${p.marginTopMm}mm ${p.marginRightMm}mm ${p.marginBottomMm}mm ${p.marginLeftMm}mm; }
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; }
    body {
      font-family: 'Inter', 'Noto Sans Bengali', 'Nirmala UI', 'Segoe UI', sans-serif;
      font-size: ${p.widthMm <= 90 ? 8.5 : 10}pt;
      color: #0f172a; line-height: 1.45;
    }
    .doc { width: ${w - p.marginLeftMm - p.marginRightMm}mm; }
    .block { break-inside: avoid; page-break-inside: avoid; }
    .muted { color: #64748b; }
    .strong { font-weight: 600; }
    .row { display: flex; }
    .grow { flex: 1; }
    .right { text-align: right; }
    .center { text-align: center; }
    .small { font-size: ${p.widthMm <= 90 ? 7.5 : 8.5}pt; }
    .label { color: #64748b; font-size: ${p.widthMm <= 90 ? 7.5 : 8.5}pt; text-transform: uppercase; letter-spacing: .04em; }
    .grid { display: grid; gap: 2mm; }
    .rule { border: none; border-top: 1px solid #e2e8f0; margin: 2mm 0; }
    .rule-bold { border: none; border-top: 1.6px solid #0f766e; margin: 2mm 0; }
    table { width: 100%; border-collapse: collapse; }
    th { font-size: ${p.widthMm <= 90 ? 7.5 : 8.5}pt; text-transform: uppercase; letter-spacing: .05em; color: #475569; text-align: left; padding: 1.2mm 1.5mm; border-bottom: 1.2px solid #0f766e; }
    td { padding: 1.4mm 1.5mm; border-bottom: 1px solid #eef2f7; font-size: ${p.widthMm <= 90 ? 8 : 9.5}pt; }
    .num { text-align: right; font-variant-numeric: tabular-nums; }
    .badge { display: inline-block; padding: .4mm 2mm; border-radius: 2mm; font-size: ${p.widthMm <= 90 ? 7 : 8}pt; font-weight: 600; letter-spacing: .06em; }
    .badge.ok { background: #dcfce7; color: #166534; }
    .badge.warn { background: #fef3c7; color: #92400e; }
    .badge.bad { background: #fee2e2; color: #991b1b; }
    .badge.mute { background: #f1f5f9; color: #475569; }
    .chip { display:inline-block; background:#f0fdfa; color:#0f766e; border:1px solid #99f6e4; border-radius:2mm; padding:.2mm 1.8mm; font-size:${p.widthMm <= 90 ? 7 : 8}pt; font-weight:600; }
  `;
}

function clinicHeader(core: Core, p: PaperProfile, withDentist: boolean): string {
  const c = getClinic(core);
  const thermal = p.widthMm <= 90;
  const dentists = withDentist
    ? (core.db.prepare('SELECT * FROM dentists WHERE active = 1 ORDER BY name').all() as Array<Record<string, unknown>>)
    : [];
  const dentistLine = dentists
    .map((d) => {
      const parts = [`Dr. ${d.name as string}`];
      if (d.designations) parts.push(String(d.designations));
      if (d.registration_no) parts.push(`Reg. ${d.registration_no}`);
      return parts.join(', ');
    })
    .join('  |  ');
  return `
  <div class="block" style="display:flex;gap:4mm;align-items:flex-start;">
    ${c.logoDataUrl ? `<img src="${c.logoDataUrl}" style="width:${thermal ? 14 : 20}mm;height:${thermal ? 14 : 20}mm;object-fit:contain;" />` : ''}
    <div class="grow">
      <div style="font-size:${thermal ? 12 : 17}pt;font-weight:600;color:#0f766e;line-height:1.15;">${esc(c.name) || 'Dental Clinic'}</div>
      ${c.address ? `<div class="muted small">${esc(c.address)}</div>` : ''}
      ${c.phone ? `<div class="small">${esc(c.phone)}</div>` : ''}
    </div>
    ${withDentist && dentistLine ? `<div class="small" style="text-align:right;max-width:${thermal ? 40 : 70}mm;">
      <div class="label">Dental Surgeon</div>
      <div class="strong" style="margin-top:.5mm;">${esc(dentistLine)}</div>
      ${c.consultationHours ? `<div class="muted" style="margin-top:.5mm;">Hours: ${esc(c.consultationHours)}</div>` : ''}
    </div>` : ''}
  </div>
  <div class="rule-bold block" style="margin-top:2.5mm;"></div>`;
}

function patientLine(name: string, code: string, extra: string, p: PaperProfile): string {
  return `
  <div class="block" style="display:flex;justify-content:space-between;align-items:baseline;margin-top:1mm;">
    <div>
      <span class="label">Patient&nbsp; </span>
      <span class="strong" style="font-size:${p.widthMm <= 90 ? 10 : 12}pt;">${esc(name)}</span>
      ${extra ? `<span class="muted"> ${esc(extra)}</span>` : ''}
    </div>
    <div class="muted small">${esc(code)}</div>
  </div>`;
}

// ================================================================ PRESCRIPTION

export function buildPrescription(core: Core, rx: Prescription, p: PaperProfile): BuiltDocument {
  const c = getClinic(core);
  const thermal = p.widthMm <= 90;
  const dateStr = fmtDate(rx.createdAt, c.dateFormat) + ' ' + fmtDateTime(rx.createdAt, c.dateFormat, c.timeFormat === '24h').split(' ').slice(-1)[0];
  const genderLabel = rx.patientGender ? rx.patientGender.charAt(0).toUpperCase() + rx.patientGender.slice(1) : '';
  const ageStr = rx.patientAge != null ? `, ${rx.patientAge} yr` : '';

  const medRows = rx.items
    .map((m, i) => {
      const mn = `${m.morning ? '1' : '0'}-${m.noon ? '1' : '0'}-${m.night ? '1' : '0'}`;
      const freq = m.frequency ? esc(m.frequency) : mn !== '0-0-0' ? esc(mn) : '';
      const lines = [
        m.form ? `${esc(m.form)}` : '',
        m.strength ? `${esc(m.strength)}` : '',
      ].filter(Boolean);
      return `
      <div class="block" style="margin-bottom:2.2mm;">
        <div>
          <span class="strong">${i + 1}. ${esc(m.name)}</span>
          ${lines.length ? `<span class="muted"> — ${lines.join(', ')}</span>` : ''}
          ${m.prn ? `<span class="chip">PRN</span>` : ''}
        </div>
        <div class="small">
          ${m.dose ? esc(m.dose) + ' ' : ''}
          ${freq ? `<b>${freq}</b>` : ''}
          ${m.beforeAfter ? ` · ${esc(m.beforeAfter)}` : ''}
          ${m.durationDays ? ` · ${esc(String(m.durationDays))} days` : ''}
          ${m.quantity ? ` · Qty ${esc(m.quantity)}` : ''}
        </div>
        ${m.instruction ? `<div class="muted small" style="margin-top:.4mm;">${esc(m.instruction)}</div>` : ''}
      </div>`;
    })
    .join('');

  if (thermal) {
    const body = `
    <div class="block" style="margin-top:1.5mm;">
      ${rx.chiefComplaint ? `<div><span class="label">C/C:</span> ${esc(rx.chiefComplaint)}</div>` : ''}
      ${rx.diagnosis ? `<div><span class="label">Dx:</span> ${esc(rx.diagnosis)}</div>` : ''}
    </div>
    <div class="rule"></div>
    <div class="label block" style="margin:1mm 0;">Medicines</div>
    ${medRows}
    ${rx.advice ? `<div class="rule"></div><div class="block small"><span class="label">Advice:</span> ${esc(rx.advice)}</div>` : ''}
    <div style="height:22mm;"></div>
    <div class="block small muted center">Thank you for your trust<br/>${esc(c.name)} ${c.phone ? '· ' + esc(c.phone) : ''}</div>`;
    return { title: `Prescription ${rx.code}`, html: `<html><head><meta charset="utf-8"><style>${baseCss(p)}</style></head><body>${body}</body></html>`, profile: p, paperLabel: p.name };
  }

  const leftCol = `
    <div style="flex: ${thermal ? 1 : 1.05};">
      ${rx.chiefComplaint ? `<div class="block" style="margin-bottom:2.4mm;"><div class="label">C/C — Chief Complaint</div><div>${esc(rx.chiefComplaint)}</div></div>` : ''}
      ${rx.examination ? `<div class="block" style="margin-bottom:2.4mm;"><div class="label">O/E — On Examination</div><div>${esc(rx.examination)}</div></div>` : ''}
      ${rx.diagnosis ? `<div class="block" style="margin-bottom:2.4mm;"><div class="label">R/E — Diagnosis</div><div class="strong">${esc(rx.diagnosis)}</div></div>` : ''}
      ${rx.advice ? `<div class="block"><div class="label">Advice</div><div>${esc(rx.advice)}</div></div>` : ''}
    </div>`;

  const rightCol = `
    <div style="flex: .95;">
      <div class="label block" style="margin-bottom:1.6mm;">Medicines</div>
      ${medRows}
    </div>`;

  const html = `<html><head><meta charset="utf-8"><style>${baseCss(p)}</style></head><body>
    ${clinicHeader(core, p, true)}
    <div class="block" style="display:flex;justify-content:space-between;margin-top:1.5mm;">
      <div><span class="label">Date&nbsp; </span>${esc(dateStr)}</div>
      <div><span class="label">Rx&nbsp; </span><span class="strong">${esc(rx.code)}</span></div>
    </div>
    ${patientLine(rx.patientName, rx.patientCode, genderLabel ? `${genderLabel}${ageStr}` : '', p)}
    <div class="rule"></div>
    <div style="display:flex;gap:8mm;margin-top:1mm;">
      ${leftCol}
      ${rightCol}
    </div>
    <div class="block" style="display:flex;justify-content:space-between;align-items:flex-end;margin-top:6mm;">
      <div class="small muted" style="max-width:60%;">
        ${c.consultationHours ? `<div><b>Consultation Hours:</b> ${esc(c.consultationHours)}</div>` : ''}
        ${c.phone ? `<div><b>Phone:</b> ${esc(c.phone)}</div>` : ''}
        ${c.prescriptionFooter ? `<div style="margin-top:1mm;">${esc(c.prescriptionFooter)}</div>` : ''}
      </div>
      <div style="text-align:center;width:52mm;">
        <div style="height:24mm;"></div>
        <div class="rule" style="border-top-color:#94a3b8;"></div>
        <div class="small muted" style="margin-top:.8mm;">Signature</div>
      </div>
    </div>
  </body></html>`;
  return { title: `Prescription ${rx.code}`, html, profile: p, paperLabel: p.name };
}

// ================================================================ INVOICE

export function buildInvoice(core: Core, inv: Invoice, p: PaperProfile): BuiltDocument {
  const c = getClinic(core);
  const thermal = p.widthMm <= 90;
  const symbol = c.currencySymbol;
  const statusBadge =
    inv.status === 'paid' ? '<span class="badge ok">PAID</span>' :
    inv.status === 'partial' ? '<span class="badge warn">PARTIALLY PAID</span>' :
    inv.status === 'overpaid' ? '<span class="badge ok">OVERPAID</span>' :
    inv.status === 'void' ? '<span class="badge bad">VOID</span>' :
    '<span class="badge mute">UNPAID</span>';
  const rows = inv.items
    .map(
      (it, i) => `<div class="block"><div style="display:grid;grid-template-columns:${thermal ? '14mm 1fr 14mm 24mm' : '10mm 1fr 14mm 26mm 30mm'};gap:1mm;">
      <div class="muted">${i + 1}</div>
      <div>${esc(it.description)}</div>
      <div class="num">${it.quantity}</div>
      <div class="num">${fmtMoney(it.unitPricePaise, symbol)}</div>
      ${thermal ? '' : `<div class="num">${fmtMoney(it.amountPaise, symbol)}</div>`}
    </div></div>`,
    )
    .join('');
  const headerRow = `<div class="block"><div style="display:grid;grid-template-columns:${thermal ? '14mm 1fr 14mm 24mm' : '10mm 1fr 14mm 26mm 30mm'};gap:1mm;border-bottom:1.2px solid #0f766e;padding-bottom:1mm;">
      <div class="label">#</div><div class="label">Service / Treatment</div>
      <div class="label" style="text-align:right;">Qty</div>
      <div class="label" style="text-align:right;">Unit Price</div>
      ${thermal ? '' : '<div class="label" style="text-align:right;">Amount</div>'}
    </div></div>`;
  const totals = `
    <div class="block" style="margin-top:2mm;width:${thermal ? '60mm' : '72mm'};margin-left:auto;">
      <div style="display:flex;justify-content:space-between;padding:.8mm 0;"><span class="muted">Subtotal</span><span class="num">${fmtMoney(inv.subtotalPaise, symbol)}</span></div>
      ${inv.discountPaise > 0 ? `<div style="display:flex;justify-content:space-between;padding:.8mm 0;"><span class="muted">Discount</span><span class="num">− ${fmtMoney(inv.discountPaise, symbol)}</span></div>` : ''}
      <div style="display:flex;justify-content:space-between;padding:1.2mm 0;border-top:1.2px solid #0f766e;margin-top:.5mm;font-weight:600;font-size:${thermal ? 10 : 12}pt;"><span>Total</span><span class="num">${fmtMoney(inv.totalPaise, symbol)}</span></div>
      <div style="display:flex;justify-content:space-between;padding:.8mm 0;"><span class="muted">Paid</span><span class="num">${fmtMoney(inv.paidPaise, symbol)}</span></div>
      <div style="display:flex;justify-content:space-between;padding:.8mm 0;font-weight:600;color:${inv.duePaise > 0 ? '#b45309' : '#166534'};"><span>Balance Due</span><span class="num">${fmtMoney(inv.duePaise, symbol)}</span></div>
    </div>`;

  const html = `<html><head><meta charset="utf-8"><style>${baseCss(p)}</style></head><body>
    ${clinicHeader(core, p, false)}
    <div class="block" style="display:flex;justify-content:space-between;margin-top:2mm;">
      <div>
        <div class="label">Invoice</div>
        <div class="strong" style="font-size:${thermal ? 11 : 14}pt;">${esc(inv.number)}</div>
        <div class="small muted">Date: ${fmtDate(inv.invoiceDate, c.dateFormat)}</div>
      </div>
      <div style="text-align:right;">
        ${statusBadge}
        ${inv.status === 'void' && inv.voidReason ? `<div class="small muted" style="margin-top:1mm;">Reason: ${esc(inv.voidReason)}</div>` : ''}
      </div>
    </div>
    ${patientLine(inv.patientName, inv.patientCode, '', p)}
    <div style="margin-top:2mm;">
      ${headerRow}
      ${rows}
    </div>
    ${totals}
    <div class="rule" style="margin-top:4mm;"></div>
    <div class="block small muted center">
      ${c.prescriptionFooter ? esc(c.prescriptionFooter) + ' ' : ''}
      Thank you for choosing ${esc(c.name)}. ${c.phone ? 'Contact: ' + esc(c.phone) + '.' : ''}
    </div>
  </body></html>`;
  return { title: `Invoice ${inv.number}`, html, profile: p, paperLabel: p.name };
}

// ================================================================ RECEIPT

export function buildReceipt(core: Core, paymentId: number, p: PaperProfile): BuiltDocument {
  const c = getClinic(core);
  const row = core.db
    .prepare(
      `SELECT p.*, pat.full_name AS patientName, i.number AS invoiceNumber, u.display_name AS receivedByName
       FROM payments p JOIN patients pat ON pat.id = p.patient_id
       LEFT JOIN invoices i ON i.id = p.invoice_id LEFT JOIN users u ON u.id = p.received_by
       WHERE p.id = ?`,
    )
    .get(paymentId) as Record<string, unknown> | undefined;
  if (!row) throw ApiError.notFound('payment', paymentId);
  const symbol = c.currencySymbol;
  const lines: Array<[string, string]> = [
    ['Receipt No.', row.code as string],
    ['Date', fmtDateTime(row.payment_date as string, c.dateFormat, c.timeFormat === '24h')],
    ['Patient', (row.patientName as string) ?? ''],
    ['Invoice', (row.invoiceNumber as string) ?? 'Advance payment'],
    ['Method', PAYMENT_METHOD_LABEL[row.method as string] ?? (row.method as string)],
  ];
  if (row.reference) lines.push(['Reference', row.reference as string]);
  lines.push(['Received By', (row.receivedByName as string) ?? '']);
  const body = lines
    .map(([k, v]) => `<div style="display:flex;justify-content:space-between;padding:.7mm 0;"><span class="muted">${esc(k)}</span><span class="strong">${esc(v)}</span></div>`)
    .join('');
  const html = `<html><head><meta charset="utf-8"><style>${baseCss(p)}</style></head><body>
    <div class="block center">
      <div style="font-size:${p.widthMm <= 90 ? 12 : 15}pt;font-weight:600;color:#0f766e;">${esc(c.name)}</div>
      ${c.address ? `<div class="small muted">${esc(c.address)}</div>` : ''}
      ${c.phone ? `<div class="small muted">${esc(c.phone)}</div>` : ''}
    </div>
    <div class="rule-bold" style="margin-top:2mm;"></div>
    <div class="block center strong" style="font-size:${p.widthMm <= 90 ? 10 : 12}pt;letter-spacing:.15em;margin:1mm 0;">PAYMENT RECEIPT</div>
    <div class="block" style="margin:2mm 0;">${body}</div>
    <div class="rule"></div>
    <div class="block" style="display:flex;justify-content:space-between;font-size:${p.widthMm <= 90 ? 11 : 13}pt;font-weight:600;padding:1.5mm 0;">
      <span>Amount</span><span>${fmtMoney(row.amount as number, symbol)}</span>
    </div>
    <div class="block center small muted" style="margin-top:3mm;">This is a computer-generated receipt.<br/>${c.prescriptionFooter ? esc(c.prescriptionFooter) : ''}</div>
  </body></html>`;
  return { title: `Receipt ${row.code}`, html, profile: p, paperLabel: p.name };
}

// ================================================================ PATIENT SUMMARY

export function buildPatientSummary(core: Core, patientId: number, p: PaperProfile): BuiltDocument {
  const c = getClinic(core);
  const s360 = getPatient360(core, patientId);
  const pat = s360.patient;
  const visits = listVisits(core, patientId, 1, 8).items;
  const symbol = c.currencySymbol;
  const visitsHtml = visits
    .map(
      (v) => `<div class="block"><div style="display:grid;grid-template-columns:26mm 1fr 1fr;gap:1.5mm;">
      <div class="small muted">${fmtDate(v.visitDate, c.dateFormat)}</div>
      <div class="small"><span class="label">C/C:</span> ${esc(v.chiefComplaint) || '—'}</div>
      <div class="small"><span class="label">Dx:</span> ${esc(v.diagnosis) || '—'}</div>
    </div></div>`,
    )
    .join('');
  const toothHtml = s360.toothStates.length
    ? s360.toothStates.map((t) => `<div class="block small" style="margin-bottom:.8mm;"><span class="chip">${esc(t.conditionLabel)}</span> <span class="muted">updated ${fmtDate(t.updatedAt, c.dateFormat)}</span>${t.note ? ` — ${esc(t.note)}` : ''}</div>`).join('')
    : '<div class="small muted">No chart conditions recorded.</div>';
  const html = `<html><head><meta charset="utf-8"><style>${baseCss(p)}</style></head><body>
    ${clinicHeader(core, p, false)}
    <div class="block center strong" style="font-size:13pt;letter-spacing:.12em;margin-top:2mm;">PATIENT SUMMARY</div>
    ${patientLine(pat.fullName, pat.code, [pat.gender, pat.age != null ? `${pat.age} yr` : '', pat.bloodGroup ? `Blood ${pat.bloodGroup}` : ''].filter(Boolean).join(' · '), p)}
    <div class="grid block" style="grid-template-columns:1fr 1fr;margin-top:1.5mm;">
      <div class="small"><span class="label">Phone:</span> ${esc(pat.phone) || '—'} ${pat.emergencyPhone ? `· Emergency: ${esc(pat.emergencyPhone)}` : ''}</div>
      <div class="small"><span class="label">Address:</span> ${esc(pat.address) || '—'}</div>
      <div class="small"><span class="label">Allergies:</span> ${esc(pat.allergies) || 'None recorded'}</div>
      <div class="small"><span class="label">Medications:</span> ${esc(pat.medications) || 'None recorded'}</div>
      <div class="small"><span class="label">Medical Hx:</span> ${esc(pat.medicalHistory) || '—'}</div>
      <div class="small"><span class="label">Dental Hx:</span> ${esc(pat.dentalHistory) || '—'}</div>
    </div>
    <div class="grid block" style="grid-template-columns:repeat(4,1fr);margin-top:3mm;text-align:center;">
      <div><div class="strong" style="font-size:13pt;">${s360.stats.visitCount}</div><div class="label">Visits</div></div>
      <div><div class="strong" style="font-size:13pt;">${fmtMoney(s360.stats.totalBilledPaise, symbol)}</div><div class="label">Total Billed</div></div>
      <div><div class="strong" style="font-size:13pt;">${fmtMoney(s360.stats.totalPaidPaise, symbol)}</div><div class="label">Total Paid</div></div>
      <div><div class="strong" style="font-size:13pt;color:${s360.stats.outstandingPaise > 0 ? '#b45309' : '#166534'};">${fmtMoney(s360.stats.outstandingPaise, symbol)}</div><div class="label">Outstanding</div></div>
    </div>
    <div class="rule" style="margin-top:3mm;"></div>
    <div class="label block" style="margin:1.5mm 0;">Recent Visits</div>
    ${visitsHtml || '<div class="small muted">No visits recorded.</div>'}
    <div class="rule"></div>
    <div class="label block" style="margin:1.5mm 0;">Dental Chart — Current Conditions</div>
    ${toothHtml}
    <div class="block small muted" style="margin-top:4mm;">Generated ${fmtDateTime(new Date().toISOString(), c.dateFormat, c.timeFormat === '24h')} — ${esc(c.name)}</div>
  </body></html>`;
  return { title: `Patient Summary ${pat.code}`, html, profile: p, paperLabel: p.name };
}

// ================================================================ GENERIC REPORT

export interface ReportColumn {
  key: string;
  label: string;
  align?: 'left' | 'right';
  render?: (row: Record<string, unknown>) => string;
}

export function buildReport(
  core: Core,
  opts: { title: string; subtitle?: string; columns: ReportColumn[]; rows: Array<Record<string, unknown>>; summary?: Array<[string, string]> },
  p: PaperProfile,
): BuiltDocument {
  const c = getClinic(core);
  const thermal = p.widthMm <= 90;
  const gridCols = opts.columns.map((col) => (col.align === 'right' ? '1fr' : col.key === '_first' ? '1.4fr' : '1fr')).join(' ');
  const head = `<div class="block"><div style="display:grid;grid-template-columns:${gridCols};gap:1.5mm;border-bottom:1.2px solid #0f766e;padding-bottom:1mm;">
    ${opts.columns.map((col) => `<div class="label" style="text-align:${col.align === 'right' ? 'right' : 'left'}">${esc(col.label)}</div>`).join('')}
  </div></div>`;
  const rows = opts.rows
    .map(
      (r) => `<div class="block"><div style="display:grid;grid-template-columns:${gridCols};gap:1.5mm;">
      ${opts.columns
        .map((col) => {
          const raw = r[col.key];
          const val = col.render ? col.render(r) : esc(String(raw ?? ''));
          return `<div style="text-align:${col.align === 'right' ? 'right' : 'left'}">${val}</div>`;
        })
        .join('')}
    </div></div>`,
    )
    .join('');
  const summary = opts.summary?.length
    ? `<div class="block" style="margin-top:2mm;width:70mm;margin-left:auto;">${opts.summary
        .map(([k, v]) => `<div style="display:flex;justify-content:space-between;padding:.7mm 0;"><span class="muted">${esc(k)}</span><span class="strong num">${esc(v)}</span></div>`)
        .join('')}</div>`
    : '';
  const html = `<html><head><meta charset="utf-8"><style>${baseCss(p)}</style></head><body>
    ${clinicHeader(core, p, false)}
    <div class="block" style="margin-top:2.5mm;">
      <div class="strong" style="font-size:${thermal ? 12 : 15}pt;">${esc(opts.title)}</div>
      ${opts.subtitle ? `<div class="small muted">${esc(opts.subtitle)}</div>` : ''}
    </div>
    <div style="margin-top:2.5mm;">${head}${rows}</div>
    ${summary}
    <div class="block small muted" style="margin-top:4mm;">Generated ${fmtDateTime(new Date().toISOString(), c.dateFormat, c.timeFormat === '24h')} — ${esc(c.name)} · ${opts.rows.length} row(s)</div>
  </body></html>`;
  return { title: opts.title, html, profile: p, paperLabel: p.name };
}

// ================================================================ dispatch

export type DocumentType = 'prescription' | 'invoice' | 'receipt' | 'patient_summary' | 'report';

export function buildDocument(
  core: Core,
  type: DocumentType,
  payload: { id?: number; report?: { title: string; subtitle?: string; columns: ReportColumn[]; rows: Array<Record<string, unknown>>; summary?: Array<[string, string]> } },
  profile: PaperProfile,
): BuiltDocument {
  switch (type) {
    case 'prescription': {
      const rx = getPrescription(core, payload.id!);
      return buildPrescription(core, rx, profile);
    }
    case 'invoice': {
      const inv = getInvoice(core, payload.id!);
      return buildInvoice(core, inv, profile);
    }
    case 'receipt': {
      return buildReceipt(core, payload.id!, profile);
    }
    case 'patient_summary': {
      return buildPatientSummary(core, payload.id!, profile);
    }
    case 'report': {
      if (!payload.report) throw ApiError.validation('Report payload missing.');
      return buildReport(core, payload.report, profile);
    }
  }
}

export { fmtMoney, PAYMENT_METHOD_LABEL };
