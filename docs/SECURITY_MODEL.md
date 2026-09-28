# Dentiva Pro — Security Model & RBAC Matrix

## Authentication

- Passwords: `scrypt` (N=2^17, r=8, p=1, salt 32B, key 64B, `1:17:8:1$salt$hash` encoding), constant-time verify. No plaintext anywhere, hashes never exposed over IPC.
- Login: username case-insensitive; 5 failures → 15-minute lock (`security.lock_minutes`), audited, critical notification.
- Sessions: single in-memory session per running app (desktop single-user model). Logout destroys it.
- **Lock vs logout**: lock keeps session, requires password to resume; auto-lock 5/10/15/30/min or off (admin-set). Lock screen renders before any data; no sensitive DOM behind it (SPA swaps to lock view only).
- First admin created by setup wizard (no defaults, no backdoor). Owner flag `is_owner=1` is irrevocable except by the owner.

## Permission catalog (45)

`patients.view|create|edit|archive|hard_delete`
`clinical.view|visit.create|visit.edit|prescription.create|prescription.cancel|chart.edit|treatment_catalog.manage|attachments.manage`
`appointments.view|create|edit|cancel`, `queue.manage`
`billing.invoice.view|create|void`, `billing.payment.view|create|void`
`financial.reports.view`, `accounting.view|create|manage`
`inventory.view|manage`, `suppliers.manage`
`staff.view|manage|sensitive`
`admin.users|roles|settings|backup|restore|audit|data`

## Role matrix (● granted, ○ denied)

| Permission | Owner | Admin | Dentist | Receptionist | Nurse | Accountant | Inv. Mgr |
|---|---|---|---|---|---|---|---|
| patients.view/create/edit | ● | ● | ● | ● | view only | view only | — |
| patients.archive / hard_delete | ● | ● | — | — | — | — | — |
| clinical.view | ● | ● | ● | ● | ● | — | — |
| clinical.visit.* / chart / prescription | ● | ● | ● | — | — | — | — |
| clinical.treatment_catalog.manage | ● | ● | — | — | — | — | — |
| clinical.attachments.manage | ● | ● | ● | ● | ● | — | — |
| appointments.view/create/edit/cancel | ● | ● | create/edit | ● (all) | view | — | — |
| queue.manage | ● | ● | ● | ● | ● | — | — |
| billing.invoice.view/create | ● | ● | ● | ● | — | ● | — |
| billing.invoice.void / payment.void | ● | ● | — | — | — | ● | — |
| billing.payment.view/create | ● | ● | view | ● | — | ● | — |
| financial.reports.view | ● | ● | **○** | **○** | ○ | ● | ○ |
| accounting.view/create/manage | ● | ● | ○ | **○** | ○ | ● | ○ |
| inventory.view/manage | ● | ● | ○ | ○ | ○ | ○ | ● |
| suppliers.manage | ● | ● | — | — | — | — | ● |
| staff.view/manage | ● | ● | ○ | ○ | ○ | ○ | — |
| staff.sensitive (salary/ID) | ● | ● | ○ | ○ | ○ | ○ | — |
| admin.users/roles/settings | ● | ● | ○ | **○** | ○ | ○ | ○ |
| admin.backup | ● | ● | ○ | **○** | ○ | ○ | ○ |
| admin.restore | ● | ● | ○ | **○** | ○ | ○ | ○ |
| admin.audit | ● | ● | ○ | ○ | ○ | ○ | — |
| admin.data (destructive) | ● | ● | ○ | ○ | ○ | ○ | — |

Custom roles: any subset; system roles editable except Owner (always all permissions).

## Enforcement points

1. **IPC router** (main): every non-public channel → session check → permission check → handler.
2. **Services**: cross-checks (e.g. voiding an invoice with payments requires `billing.payment.void`
   awareness; restoring requires `admin.restore`; destructive ops require re-auth token).
3. **Renderer**: hides UI for missing permissions — never the enforcement point.
4. **Audit**: every security/business event (login, failed login, lock, mutation, backup, restore,
   settings change) with user, role, action, entity, context JSON, result.

## Financial authorization tests

`tests/rbac.test.ts` iterates every role × every sensitive action and asserts the matrix above at
the **service/IPC boundary** (not UI), including: receptionist cannot view accounting or
financial reports, dentist cannot void, nurse cannot touch billing, inventory manager cannot
view patients.

## Other controls

- Activation: SHA-256(code‖salt) single constant; no plaintext, no logging (§60; reverse-engineering
  limitation documented, not papered over).
- Local endpoints: none (no HTTP server at all).
- Path traversal: attachment storage under `attachments/<uuid>.<ext>` only; all file IPC goes
  through main-process path builders; user-supplied paths (backup destination) resolved + validated.
- Attachments: MIME + extension allowlist, 15 MB cap, SHA-256 recorded, missing file → graceful error card.
- Logs: no secrets, no activation code, no passwords (redaction list enforced in logger).
- Destructive actions: `admin.data` + re-auth (password) + typed confirmation in UI.
- Backups: manifest checksum validation; restore always pre-backs-up; incompatible schema → rejected.
