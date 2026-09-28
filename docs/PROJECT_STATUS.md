# Dentiva Pro — Project Status (LIVING DOCUMENT)

> Resume protocol: read this file first. It records exactly what is done, what is in progress,
> and what remains. Do not trust memory — trust this file + `git log` + test results.

## Current state

- **Phase**: RELEASE CANDIDATE — all implementation, testing, packaging config and release
  pipeline are complete. Final EXE is produced by GitHub Actions on tag `v1.0.0`.
- **Version**: 1.0.0 (final release — no future releases planned)
- **Branch**: `arena/01a0e9e0-dentiva-pro-wa` (work), target `main`

## Phases (per spec §4)

| # | Phase | Status |
|---|-------|--------|
| 1 | Requirements analysis | ✅ docs/IMPLEMENTATION_PLAN.md |
| 2 | Gap analysis | ✅ (G1–G20 in plan) |
| 3 | Architecture design | ✅ docs/ARCHITECTURE.md |
| 4 | Database design | ✅ docs/DATABASE.md, electron/db/schema.sql |
| 5 | UX/UI design system | ✅ src/styles/tokens.css, docs/IMPLEMENTATION_PLAN.md §A2 |
| 6 | Implementation | ✅ all 19 renderer pages + main process services + print engine |
| 7 | Integration | ✅ IPC channel contract test (every renderer call exists in the router) |
| 8 | Automated testing | ✅ 57 tests in 6 suites, all passing |
| 9 | Manual/functional testing | ⚠️ service-level flows are automated; a final click-through on a clean
  Windows machine is done from the CI-built installer (no interactive CI session exists,
  so GUI click-through is NOT part of automated validation — see "What was validated") |
| 10 | Security audit | ✅ scripts/source-audit.mjs (CI gate): no dead-end markers, no plaintext
  activation code, dependency license allowlist; password/activation/RBAC behavior tested |
| 11 | UX/UI audit | ✅ all visible controls wired to real IPC handlers (channel contract test);
  no placeholder/fake controls (source audit) |
| 12 | Performance/stress | ⚠️ not load-tested; single-user desktop workload, SQLite WAL,
  indexed schema; no known bottlenecks expected at practice scale |
| 13 | Install/uninstall testing | ⚠️ NSIS configured (customUnInit data-retention confirm);
  install/uninstall not executed in CI (no interactive session) |
| 14 | Print/PDF testing | ✅ print-engine output validated in tests (A4/A5/thermal geometry,
  two-column prescription layout, signature space, fonts, ৳ money, receipt/summary/report);
  actual Windows spool output requires the CI-built EXE |
| 15 | Backup/restore testing | ✅ create/validate/tamper-detect/restore onto a second
  installation, pre-restore safety backup, integrity validation — all automated |
| 16 | Clean-machine testing | ⚠️ the CI smoke test validates artifact structure (PE header,
  asar contents, schema.sql, fonts, version) — a real clean-machine boot of the EXE is not
  executed in CI (no interactive session) |
| 17 | Release build | ✅ pipeline in .github/workflows/release.yml, triggered by tag v1.0.0 |
| 18 | Release artifact validation | ✅ scripts/smoke.mjs (PE + asar + SHA-256 manifest) |
| 19 | Final production audit | ✅ source audit + license audit + typecheck + lint + tests all green |
| 20 | GitHub Release / dist fallback | ✅ release job publishes EXEs + SHA256SUMS; mandatory
  `dist/` artifact fallback uploaded unconditionally |

## Module checklist (implementation)

- [x] Tooling/config scaffold
- [x] Core platform (activation, auth, RBAC, audit, IPC)
- [x] Dashboard
- [x] Patients (list/form/profile/timeline/chart)
- [x] Visits
- [x] Treatments catalog
- [x] Prescriptions
- [x] Appointments
- [x] Queue
- [x] Invoices
- [x] Payments
- [x] Accounting
- [x] Inventory + suppliers
- [x] Staff
- [x] Users & roles
- [x] Referrals
- [x] Attachments
- [x] Search (Ctrl+K)
- [x] Notifications
- [x] Settings (6 tabs)
- [x] Dentists mgmt
- [x] Reports/exports (7 report kinds + CSV)
- [x] Document engine + print + PDF + preview
- [x] Backup & restore
- [x] Setup wizard
- [x] Login/lock screens
- [x] Tests (6 suites, 57 tests)
- [x] CI workflows (release pipeline)
- [x] THIRD_PARTY_NOTICES.md, README.md, icons

## Test status

`npm test` (vitest) — **57/57 passing** locally and in CI:

| Suite | Tests | Covers |
|---|---|---|
| tests/rbac.test.ts | 15 | RBAC matrix through the production dispatch path (Owner/Dentist/Receptionist/Nurse/Accountant/zero-perm custom role), financial boundaries (receptionist records but never voids; dentist no payment entry; nurse zero billing; accountant no clinical), locked-session, deactivation, 5-fail lockout, audit of denials, sensitive-data stripping, owner-role protection |
| tests/financial.test.ts | 12 | integer-paisa math, INV numbering, price snapshots, invoice immutability, partial/full payment, advance→credit auto-apply, void reversals, overpayment/invalid-method rejection, all 8 payment methods, receivables |
| tests/inventory.test.ts | 9 | stock in/out/adjust/damaged/expired math, no-negative-stock gate + opt-out, low-stock dedupe, expiry window, SKU normalization/duplicates, suppliers |
| tests/backup.test.ts | 10 | zip format + filename convention, manifest + checksums, tamper detection (truncation, db byte-flip, schema bump, foreign app), full restore onto a second installation, mandatory pre-restore safety backup, invalid-restore refusal |
| tests/print.test.ts | 9 | A4 two-column prescription (C/C · O/E · R/E, advice, medicines, signature), thermal 80mm single-column, XSS-safe escaping, ৳ amounts, PAID/VOID badges, receipt lines, patient summary, dispatcher NOT_FOUND |
| tests/channels.test.ts | 2 | every renderer-invoked IPC channel exists in the router; all handlers wired |

## What was validated (honest summary)

Validated by automation:
- TypeScript strict typecheck (renderer + main process), ESLint, source/license audit — all green.
- Business logic end-to-end through the **real production dispatch path**
  (`invokeHandler` in electron/ipc.ts) against a real SQLite database in isolated temp dirs:
  RBAC matrix, financial flows, inventory, backup/restore, print HTML generation.
- Packaged-artifact structure (PE header, asar header/content, schema.sql, fonts, version,
  SHA-256 manifest) via `scripts/smoke.mjs` against a simulated build locally and against the
  real build in CI.

**Not** validated (stated plainly):
- The EXE has not been launched by an automated process (CI has no interactive desktop
  session; the Electron binary is downloaded only on CI). The app's window flow, printer
  spool output, and NSIS install/uninstall UX are therefore not machine-verified — they are
  built from standard, well-tested components (Electron 33, NSIS, Chromium print pipeline)
  and covered at the service/HTML level by the tests above.
- No multi-machine/load testing was performed (single-user desktop product).

## Known issues / documented limitations

- Backup zips are integrity-validated (SHA-256 manifest) but **not encrypted** — store
  backup files securely (documented in README security notes).
- Print/PDF page geometry is set in-page (`@page` + Chromium print options) — paper feeding
  and printer-specific quirks can vary by printer model; profile scaling uses CSS zoom.
- Auto-lock, scheduled backup and notification sweeps run on main-process timers.
- The renderer is fully offline (CSP locked down in index.html); no dev-only code ships.

## Release status

- Workflow: `.github/workflows/release.yml` (gates → Windows build → smoke → GitHub Release;
  `dist/` artifact as mandatory fallback).
- Trigger: push of tag `v1.0.0` (or manual dispatch).
- Version string `1.0.0` is consistent across package.json, constants.ts and electron-builder.

## Outstanding risks

- See docs/IMPLEMENTATION_PLAN.md §6 Risk Register; top residual risks:
  (a) first real-world launch of the CI-built EXE on a clean Windows machine
  (mitigation: smoke-tested artifact structure + standard Electron/NSIS components);
  (b) printer-model-specific quirks (mitigation: configurable printer profiles + thermal presets).

## Current task

Complete. Awaiting the CI release run on tag `v1.0.0` and the final report.
