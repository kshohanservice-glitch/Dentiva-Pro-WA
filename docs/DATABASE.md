# Dentiva Pro — Database Schema (SQLite, schema version 1)

Full DDL in `electron/db/schema.sql`. Money columns are `INTEGER` **paisa** (৳1.00 = 100).
Timestamps are UTC ISO-8601 strings.

## Entity map (spec §95 coverage)

| Spec entity | Table |
|---|---|
| clinic/business | `clinic` (singleton row id=1) |
| dentists | `dentists` |
| users / roles / permissions / role_permissions / user_roles | same names |
| patients | `patients` |
| patient_contacts | folded into `patients` (phone, emergency phone, address — structured columns) |
| medical_history / dental_history | `patient_history` (kind: medical/dental/medication/allergy, append-only) |
| visits | `visits` |
| clinical_findings | `visits.examination` + `visit_treatments` |
| diagnoses | `visits.diagnosis` (structured single primary diagnosis per visit) |
| teeth / tooth_conditions | `teeth`, `tooth_condition_types`, `patient_tooth_state` (current), `visit_tooth_conditions` (history) |
| treatments / treatment_catalog | `visit_treatments` / `treatment_catalog` |
| prescriptions / prescription_items / medicines | same names (`medicine_catalog`) |
| appointments / queue_entries | same names |
| referrals | `referrals` (direction in/out) |
| invoices / invoice_items / payments | same names |
| accounting_transactions / expense_categories / income_categories | same names |
| inventory_items / inventory_transactions / suppliers | same names |
| staff | `staff` |
| attachments | `attachments` |
| notifications | `notifications` |
| audit_logs | `audit_logs` |
| backup_records | `backup_records` |
| printer_profiles | `printer_profiles` |
| settings | `settings` (JSON values) + `meta` (app-level keys) |

## Key relationships

- patients 1—N visits 1—N (visit_treatments, visit_tooth_conditions); N—1 dentists
- patients 1—N prescriptions 1—N prescription_items (medicine snapshots)
- patients 1—N invoices 1—N invoice_items (price snapshots); patients 1—N payments N—1 invoices
- payments 1—0..1 accounting_transactions (auto income entry; expenses standalone)
- patients 1—N (referrals, attachments, patient_history, patient_tooth_state N—1 teeth)
- inventory_items 1—N inventory_transactions; N—1 suppliers
- users N—N roles N—N permissions; roles seeded, permissions fixed catalog (45 keys)

## Immutability rules (§96)

- `invoice_items.unit_price`, `visit_treatments.price`, `prescription_items.*`,
  `accounting_transactions.category_name` are **snapshots** — master-data edits never rewrite history.
- Invoices: `status` transitions `unpaid|partial|paid|overpaid → void` only (voided_at, void_reason, audit).
- Payments: `void=1` flag (void_reason, voided_at) — never deleted; balances = Σ non-void.
- Patients: archived flag; hard delete only with `patients.hard_delete` + re-auth + typed confirm.
- Visits: editable window = status `in_progress` OR age ≤ 30 days; every edit audited with diff summary.

## Indexes (§69)

`patients(code UQ, full_name, phone, created_at DESC, archived)`, `visits(patient_id,visit_date)`,
`appointments(appt_date,start_time; patient_id)`, `invoices(invoice_date; patient_id)`,
`payments(payment_date; patient_id; invoice_id)`, `accounting_transactions(txn_date; kind)`,
`inventory_items(sku UQ, expiry_date)`, `inventory_transactions(item_id)`,
`audit_logs(timestamp; entity,entity_id)`, `notifications(dedupe_key UQ)`.

## Sequences

`PAT-`/`AP-`/`RX-`/`PAY-` (6-digit), `INV-YYYY-` (6-digit, per calendar year). Computed in-transaction.
