# Dentiva Pro — Testing Strategy

## Layers

| Layer | Tool | Runs where | Scope |
|---|---|---|---|
| Unit + integration | Vitest | Node (linux/windows/CI) | All main-process services against real temp SQLite DBs |
| RBAC matrix | Vitest | same | Every role × every sensitive action at IPC boundary (§79) |
| Acceptance E2E | Vitest | same | Full §106 scenario at service level |
| UI component | Vitest + React Testing Library | same | Shell, login, patient form, dental chart, invoice form states |
| Stress | Vitest (long) | CI (linux) | 20k patients / 60k visits / 40k invoices / 80k payments / 50k inv-txns; p95 list+search+dashboard timings |
| Installer/uninstall/clean-machine | GitHub Actions `windows-latest` | CI release job | Real NSIS install to temp dir, launch, activate, setup, core workflow, print PDF, uninstall with/without data |
| Regression | full `npm test` | every PR + release | Mandatory before tag |

## Rules

- A fix is complete only when the failing test passes AND the full suite passes (§107).
- Tests never touch the real user data dir — every test uses `DENTIVA_DATA_DIR` in `os.tmpdir()`.
- No test may be skipped or weakened to pass (§120). Failing test = blocked release (§105).
- CI gates: lint + typecheck + tests must pass before merge; release job fails on any test failure.

## Coverage map (minimum)

- Money: paisa math, discount, totals, overpay, void recompute
- Billing: full/partial/multi partial payment, balance states, invoice immutability, void w/ payments
- RBAC: full matrix + financial bypass attempts via direct service calls
- Patients: create/dup detection/edit/archive/search, multi-visit integrity, timeline ordering
- Clinical: visit edit window + audit, chart current vs historical, prescription pagination inputs
- Inventory: in/out/adjust/damage, negative-stock block, low-stock + expiry alerts, history
- Backup: create/validate/restore/corrupt/incompatible/pre-restore-failure
- Activation: valid/invalid codes, no plaintext constant present (source-scan test)
- Search: multi-entity, unicode, partial match, perf on stress dataset
- Audit: event recorded for each §38 category
