# Dentiva Pro

**Premium offline dental practice management software for clinics in Bangladesh.**

Dentiva Pro is a complete, single-machine desktop application. It runs entirely
on the local computer — local database, local printing, local backups. **No
internet connection, no cloud account, no subscription, no recurring cost —
ever.** This is the final version (v1.0.0); every module ships complete.

- **Developer:** Shohan Khan — [helloiamshohan@gmail.com](mailto:helloiamshohan@gmail.com)
- **Version:** 1.0.0 (final)
- **Platform:** Windows 10 / 11 (64-bit)
- **Currency:** ৳ Bangladeshi Taka (exact integer-paisa money math)
- **Language:** English UI with full Bengali Unicode in patient records and prints

---

## Getting started

1. Run **`DentivaPro-Setup-1.0.0.exe`** (recommended) or copy
   **`DentivaPro-Portable-1.0.0.exe`** anywhere and double-click it.
2. **Activate** with your 16-digit activation code. Validation happens fully
   offline against a derived representation — the code is never stored or
   transmitted in plaintext.
3. Complete the **first-run setup wizard**: clinic profile, lead dentist,
   admin account, security preferences, backup schedule.
4. Log in and go to work.

All practice data lives in `%APPDATA%\Dentiva Pro` (database, attachments,
logs, backups). The uninstaller asks before removing this data.

Verify your download before installing:

```
certutil -hashfile DentivaPro-Setup-1.0.0.exe SHA256
```

and compare with `SHA256SUMS.txt`.

## What's inside

- **Patients** — full clinical record (history, allergies, medications,
  emergency contacts, attachments), soft-archive with reason, global search
- **Dental chart** — FDI + Universal numbering, adult (32) and pediatric
  (20) dentition, 14 persisted condition types per tooth with notes
- **Appointments & walk-in queue** — scheduling, reschedule, no-show,
  one-click queue with waiting → called → in-treatment → completed flow
- **Visits & treatments** — visit notes, C/C · O/E · R/E, treatment catalog
  with price snapshots, visit timeline
- **Prescriptions** — C/C, O/E, R/E, advice on the left; numbered medicines
  with dose/frequency (TDS/OD/SOS…), duration, PRN on the right; signature
  space; print to **A4 / A5 / thermal 80/58 mm** or save **PDF**
- **Billing** — immutable invoices (void with reason only), payments in
  **Cash · Bank · Card · bKash · Nagad · Rocket · Upay · Other**, advance
  payments auto-applied as credit, receivables tracker
- **Accounting** — income/expense categories, ledger, period reports,
  method breakdown; payments book income automatically; voids reverse it
- **Inventory** — items, SKUs, stock in/out/damage/expiry/adjustment,
  low-stock and expiry alerts, no negative stock by default, suppliers
- **Staff & referrals** — staff records with photos, department,
  confidentiality for salary/ID fields; in/out referrals
- **Security** — scrypt password hashing, granular RBAC (7 seeded roles +
  custom roles over 45 permissions) with **financial restrictions enforced
  at the service layer**, auto-lock (5/10/15/30 min), 5-fail account lock,
  full audit log of every action
- **Backups** — one-click professional backups (`DentivaPro_Backup_YYYY-MM-DD_HH-mm-ss.zip`
  with manifest + SHA-256 integrity), scheduled backups, restore with
  **mandatory pre-restore safety backup** and integrity validation
- **Search & notifications** — Ctrl+K global search across patients,
  appointments, invoices, payments, prescriptions, treatments, inventory;
  in-app notification center

## Printing

Prescriptions, invoices, receipts, patient summaries and reports render to a
system print dialog, PDF, or preview — all from the same print engine.
Printer profiles (paper size, margins, scale, default profile) are
configurable per clinic; thermal receipts use single-column continuous
layout. Bengali text prints correctly via bundled Open Font License fonts.

## System requirements

| | |
|---|---|
| OS | Windows 10 or 11, 64-bit |
| CPU/RAM | Any 64-bit CPU, 4 GB RAM (2 GB minimum) |
| Disk | ~400 MB installed |
| Internet | **Not required** (only to download the installer) |

## Data, privacy & offline guarantee

There is no telemetry, no analytics, no crash reporting and no network code
path in Dentiva Pro. After activation, the application never needs the
internet. Your data never leaves your machine unless you copy a backup file.

## Security notes (honest summary)

- Passwords are hashed with **scrypt** (N=17, r=8, p=1) with per-user salt;
  hashes are never reversible or logged.
- The activation code is validated against a **derived, salted digest** — it
  does not appear in the binary or in logs.
- RBAC is enforced in the main process (the only code path that can touch
  the database), not merely hidden in the UI.
- Destructive actions (void, delete, restore) require confirmation and most
  require re-authentication; everything is written to the audit log.
- This is strong *practical* desktop security — not a HSM. Backups contain
  your data in a compacted-but-not-encrypted archive; store them safely.

## Development

```bash
npm install        # install dependencies
npm run dev        # hot-reload development (Vite + Electron)
npm test           # offline test suite (RBAC matrix, financial, inventory,
                   #  backup/restore, print HTML) — 55 tests
npm run typecheck  # strict TypeScript, renderer + main process
npm run lint       # ESLint
npm run scan       # source audit: no dead-end markers, no plaintext
                   #  activation code, dependency license check
npm run build      # compile main process + renderer
npm run dist:win   # package NSIS + Portable EXEs (Windows)
```

**Release pipeline** — the distributable EXEs are built exclusively by
[GitHub Actions](.github/workflows/release.yml): quality gates (typecheck,
lint, source/license audit, tests) → Windows packaging → structural smoke
test of the artifacts → GitHub Release with SHA-256 checksums. If a GitHub
Release cannot be created, the validated `dist/` artifacts remain
downloadable from the workflow run.

See [`docs/PROJECT_STATUS.md`](docs/PROJECT_STATUS.md) for the complete
status: what was validated, known limitations, and the acceptance checklist.

## License & third-party components

Dentiva Pro is proprietary — **all rights reserved**. Bundled open-source
components and their licenses are listed in
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

---

© 2026 Shohan Khan. Developed for Bangladeshi dental practices.
