# Dentiva Pro — Printing & PDF Architecture

## Pipeline

```
document data (service) → Document Engine (main, HTML+CSS builder)
   →  preview:  renderer iframe (srcdoc, sandbox) renders page boxes at 96dpi (1mm = 3.7795px)
   →  print:    hidden BrowserWindow loads html → webContents.print() → Windows print dialog
   →  PDF:      webContents.printToPDF({pageSize: inches, margins, printBackground:true}) → save dialog
```

One HTML builder per document guarantees preview == print == PDF. No headless browser, no
external PDF service, fully offline.

## Paper profiles (`printer_profiles` table, admin-managed)

| Profile | mm | Notes |
|---|---|---|
| A4 | 210×297 | default; two-column Rx |
| A5 | 148×210 | compact Rx, two-column tighter |
| Legal | 216×356 | long Rx/invoice |
| Thermal 80 | 80×(continuous) | single-column reflow, no logo, condensed med table |
| Thermal 58 | 58×(continuous) | single-column minimal |
| Receipt 80 | 80×200 | payment receipt |
| Custom | user w/h (50–500mm) | user-defined |

Profile fields: paper, width/height (mm), margins (mm, per side), orientation, scale %,
fit-to-width flag, target printer name (informational — actual selection happens in the OS
print dialog, the professional standard for local Windows apps), is_default.

## Document set

1. **Prescription** — clinic header (logo/name/address/phone), dentist name + all designations +
   registration no., patient block (name, gender, age, date, code), two-column body:
   LEFT C/C → O/E → R/E → Diagnosis → Advice; RIGHT medication list (name/form/strength, dose,
   M-N-N marks, before/after food, duration, instruction, PRN badge), footer (consultation hours,
   contact, clinic message) + **≥40 mm clear signature area** (break-inside: avoid).
2. **Invoice** — header, patient/code, date/number, items table (description, qty, unit price,
   amount), subtotal/discount/total/paid/due, status chip (PAID/PARTIAL/VOID watermark). **No signature section.**
3. **Payment receipt** — slip (Receipt 80 / A5): payment code, patient, invoice ref, amount, method, ref, received by, date.
4. **Patient summary** — demographics, current conditions, visit history, treatments, balance.
5. **Report document** — generic titled table (accounting, patients, appointments, inventory…).

## Layout guarantees

- `@page { size: Wmm Hmm; margin: T R B L mm }` per profile; content uses mm units.
- Blocks with `break-inside: avoid` (med rows, signature area, totals, table header repetition via `thead`).
- Thermal reflow is a distinct template (not scaled A4) — requirement §25/§17.
- Bengali: `font-family: 'Noto Sans Bengali', 'Nirmala UI', Inter, sans-serif` in all documents;
  fonts shipped in `resources/fonts`; ৳ from Inter/Noto (U+09F3).
- Logo: data-URL embed (PNG/JPG ≤1MB) so printing never depends on file path.

## Preview modal

Renders stacked page divs (exact mm→px), page counter, zoom 50–200%, paper + profile selector,
Print and Save PDF buttons. Page count measured from the hidden-window render height.
