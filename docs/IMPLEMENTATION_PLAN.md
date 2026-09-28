# Dentiva Pro — Implementation Plan & Master Checklist

Version target: **1.0.0 (final production release)**
Date of plan: 2026-09-28

## 1. Requirements Analysis Summary

The full specification (123 sections) was analyzed section-by-section. The specification is
comprehensive; the **gaps** identified for a real commercial deployment and their resolutions are:

| # | Gap identified | Resolution (professional default) |
|---|----------------|-----------------------------------|
| G1 | No policy for duplicate patient detection | Phone-based duplicate warning on create/edit (non-blocking, explicit override) |
| G2 | No receipt requirement stated | Payment receipts printable (slip + A5) as part of the document engine |
| G3 | No policy for invoice correction | Finalized invoices are immutable; corrections = void (permission-gated, audited) + new invoice |
| G4 | No policy for payment correction | Payment void (permission-gated, audited); balances recompute from non-void payments |
| G5 | No policy for account lockout after failed logins | 5 failures → 15-minute account lock (configurable), audited, critical notification |
| G6 | No policy for attachment size limits | Max 15 MB/file, allowed MIME types validated server-side, SHA-256 integrity |
| G7 | No policy for number formats | Sequential, per-prefix, zero-padded: PAT-/AP-/RX-/INV-YYYY-/PAY-; unique constraint enforced |
| G8 | No policy for stock units | Integer/decimal quantity + free-text unit; negative stock blocked unless `inventory.allow_negative` set |
| G9 | No policy for clinical record edits | Visits editable while `in_progress` and for 30 days with full audit (before/after summary); prescriptions editable until printed status flips or cancelled — all changes audited |
| G10 | No policy for multi-monitor/high-DPI | Electron DPI-aware (per-monitor v2), min usable window 1280×760, responsive breakpoints down to 1024px width |
| G11 | No policy for data retention on uninstall | NSIS uninstall offers to keep or (with typed confirmation) delete user data |
| G12 | No policy for machine portability of backups | Backups are portable zips; restore validates app name + schema version + checksum |
| G13 | No policy for concurrent access | Single-writer SQLite (WAL, busy_timeout); single-user-per-session desktop model documented |
| G14 | No policy for first-admin password policy | Min 8 chars, must contain letter + number; no default; must-change flag honored |
| G15 | No policy for time handling | All datetimes stored UTC ISO-8601; displayed in local (Asia/Dhaka) formatting; dates stored `YYYY-MM-DD` |
| G16 | No policy for log level/format | JSONL structured logs, daily + 5 MB rotation, 14 files retained; never log secrets |
| G17 | No policy for print scaling on thermal | Thermal templates are single-column reflows, not scaled A4 |
| G18 | No policy for Bengali input UX | All text fields accept Unicode; Noto Sans Bengali bundled; Nirmala UI fallback on Windows |
| G19 | No policy for keyboard shortcut docs | Shown in About → Shortcuts panel; Ctrl+K, Ctrl+P (preview), Ctrl+L (lock), etc. |
| G20 | No policy for activation storage | SHA-256(code ∥ salt) constant, single file, never logged, never sent anywhere |

## 2. Technology Stack (decided)

| Layer | Choice | License | Rationale |
|-------|--------|---------|-----------|
| Desktop shell | Electron 33 | MIT | Mature embedded-browser Windows app, print/PDF APIs, auto-update-free, offline |
| Language | TypeScript 5 (strict) | Apache-2.0 | Type safety end-to-end (main + renderer) |
| UI framework | React 18 + React Router 6 | MIT | Component model, ecosystem |
| Build (renderer) | Vite 5 | MIT | Fast, production `file://`-safe output |
| Database | SQLite via better-sqlite3 11 | MIT | Embedded, zero-service, ACID, ideal offline local store |
| Password hashing | Node `crypto.scrypt` (N=2^17, r=8, p=1, 64B) | built-in | Strong KDF, zero native deps beyond DB |
| Charts | Recharts 2 | MIT | Dashboard analytics |
| Icons | Lucide React | ISC | Consistent stroke icons, alignable |
| Fonts | Inter + Noto Sans Bengali (@fontsource) | OFL | Commercial-safe; Bengali Unicode |
| Zip (backup) | adm-zip | MIT | Read+write, small, testable |
| Installer | electron-builder + NSIS | MIT | Professional Windows installer + uninstaller |
| Tests | Vitest + React Testing Library | MIT | Node-level service tests (no Electron needed) |
| CI/CD | GitHub Actions (windows-latest) | — | Final EXE built in CI per spec §74 |

Native dependencies: `better-sqlite3` only (prebuilt for Node + Electron, all platforms).

## 3. Master Implementation Checklist

### A. Foundations
- [ ] A1 Repository structure, tooling configs (TS strict, ESLint, Prettier), .gitignore
- [ ] A2 Design system tokens + typography (EN + BN)
- [ ] A3 Application icon (all Windows sizes)
- [ ] A4 Data directories, config, logging (JSONL, rotation, no secrets)

### B. Core platform
- [ ] B1 SQLite schema v1 (all §95 entities) + migrations + seeds
- [ ] B2 Activation (derived-hash validation, offline)
- [ ] B3 Auth: scrypt hashing, login, session, logout, lock, auto-lock (5/10/15/30/off)
- [ ] B4 RBAC: 45 granular permissions, 7 system roles, custom roles, **service-level enforcement**
- [ ] B5 Audit log (all §38 events)
- [ ] B6 IPC architecture (auth-resolved handlers, typed errors, no renderer-trusted auth)

### C. Modules
- [ ] C1 Dashboard (all §13 widgets, real queries)
- [ ] C2 Patients: registration, list + date filters, duplicate detection, archive, profile 360°, quick actions
- [ ] C3 Clinical timeline (filterable, append-only history)
- [ ] C4 Visits (full §18 fields, multi-visit, metadata)
- [ ] C5 Dental chart: FDI + Universal, adult + pediatric, conditions, per-tooth notes, current + historical
- [ ] C6 Treatment catalog (admin-managed, price snapshots)
- [ ] C7 Prescriptions (multi-medicine, PRN, frequencies, two-column Rx design)
- [ ] C8 Appointments (statuses, day/week/list/calendar, navigation)
- [ ] C9 Queue (real states, elapsed time, duplicate prevention)
- [ ] C10 Invoices (multi-item, discount, immutability, void)
- [ ] C11 Payments (8 BD methods, void, balance integrity)
- [ ] C12 Accounting (income/expense, categories, reports by period)
- [ ] C13 Inventory (stock in/out/adjust/damage/expiry, alerts, history)
- [ ] C14 Suppliers
- [ ] C15 Staff (photo, sensitive-data protection)
- [ ] C16 Users & roles admin UI
- [ ] C17 Referrals (in/out, history)
- [ ] C18 Attachments (validated, hashed, missing-file tolerance)
- [ ] C19 Global search (multi-entity, filterable, performant)
- [ ] C20 Notification center (severities, dedupe, sweep)
- [ ] C21 Settings (all §46 areas)
- [ ] C22 Multiple dentists (setup + management)
- [ ] C23 Reports & exports (CSV + printable)

### D. Documents & printing
- [ ] D1 Document engine (paper profiles, margins, scaling, orientation)
- [ ] D2 Prescription (A4/A5/thermal/custom, pagination, signature space, Bengali)
- [ ] D3 Invoice (all papers, no signature section, void watermark)
- [ ] D4 Payment receipt
- [ ] D5 Patient summary
- [ ] D6 Generic report document
- [ ] D7 Print preview (page boxes, page count, zoom)
- [ ] D8 System print + save-as-PDF

### E. Data protection
- [ ] E1 Manual + scheduled backup (7/15/30d), naming, checksums, records table
- [ ] E2 Restore: validation, **mandatory pre-restore backup**, warnings, incompatibility handling
- [ ] E3 Destructive-action safeguards (re-auth + typed confirmations)
- [ ] E4 Foreign keys, indexes, soft delete, no orphan records

### F. UX quality
- [ ] F1 Every screen: loading/empty/error/success states
- [ ] F2 Form validation (server-side pre-mutation)
- [ ] F3 Keyboard shortcuts + documentation
- [ ] F4 Accessibility (focus, aria, contrast, non-color status)
- [ ] F5 Micro-animations (subtle, reduced-motion aware)
- [ ] F6 High-DPI support; min usable 1280×760
- [ ] F7 First-run setup wizard (all §63 steps, validated)

### G. QA
- [ ] G1 Unit + integration tests (money, RBAC matrix, billing, backup, inventory, search, activation, audit)
- [ ] G2 Acceptance E2E at service level (full §106 scenario)
- [ ] G3 Stress test (documented dataset sizes)
- [ ] G4 Source audit (no TODO/mock/placeholder/secret plaintext)
- [ ] G5 UI audit (screen inventory)

### H. Release
- [ ] H1 CI workflow (lint, typecheck, tests, build, package)
- [ ] H2 Release workflow (windows-latest, NSIS installer + portable, attach to release)
- [ ] H3 Git tag v1.0.0 + GitHub Release (dist/ fallback)
- [ ] H4 Dependency/license audit + THIRD_PARTY_NOTICES
- [ ] H5 Final report

## 4. Definition of Done

A module is DONE when: implemented in main-process services with permission enforcement → exposed via
typed IPC → rendered in UI with all four states → covered by automated tests → audited for fake
functionality → present in the screen inventory.

## 5. Acceptance Matrix

The §106 end-to-end scenario is implemented 1:1 as `tests/e2e-acceptance.test.ts` at the service level
(install/activate/setup are represented by core bootstrap + activation + setup completion), executed in
CI. Installer/uninstaller/clean-machine stages are executed by the CI release job (real Windows).

## 6. Risk Register

| Risk | Mitigation |
|------|------------|
| better-sqlite3 native build in CI | Prebuilt binaries for Electron windows-x64; `install-app-deps` step; pinned versions |
| NSIS build needs Windows | Release workflow runs on `windows-latest` (required by spec §74 anyway) |
| Bengali glyph coverage in PDF | Noto Sans Bengali embedded in document CSS (file-based @font-face) |
| Port/IPC conflicts | None: no HTTP server; in-process IPC (Electron), single instance lock |
| Large attachments bloat | Files on disk, metadata in DB; 15 MB cap |
| Time zone bugs | UTC storage, single display formatter |
| Activation reverse engineering | Documented limitation (§60); derived hash, single location, no logs |
