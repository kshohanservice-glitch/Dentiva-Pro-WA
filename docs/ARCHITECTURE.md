# Dentiva Pro — Architecture

## 1. System Overview

```
┌────────────────────────────── Dentiva Pro (Electron) ─────────────────────────────┐
│                                                                                   │
│  Main process (Node 20+, TypeScript)                                              │
│  ┌────────────┐   ┌────────────────────────────┐   ┌──────────────────────────┐   │
│  │ Lifecycle  │──▶│  Service layer (all        │──▶│  SQLite (better-sqlite3) │   │
│  │ bootstrap, │   │  business rules, RBAC,     │   │  data/dentiva.db (WAL)   │   │
│  │ auto-lock, │   │  money math, validation)   │   │                          │   │
│  │ crash guard│   └────────────────────────────┘   └──────────────────────────┘   │
│  └────────────┘            │                                │                    │
│                            ▼                                ▼                    │
│                   ┌─────────────────┐             ┌──────────────────────┐       │
│                   │ Document engine │             │ Filesystem stores    │       │
│                   │ (print/PDF via  │             │ attachments/ logs/   │       │
│                   │ webContents)    │             │ backups (user path)  │       │
│                   └─────────────────┘             ──────────────────────┘       │
│                            ▲                                                      │
│  IPC (contextBridge)  ─────┘   typed channels, session resolved in main          │
│  ┌────────────────────────────────────────────────────────────────────────────┐  │
│  │ Renderer (React 18, Vite, bundled to file://)                             │  │
│  │ Design system · Routing · All UI modules · Print preview (iframe sandbox) │  │
│  └────────────────────────────────────────────────────────────────────────────┘  │
└───────────────────────────────────────────────────────────────────────────────────┘
```

## 2. Key Decisions

1. **No local HTTP server.** Electron in-process IPC replaces a localhost server: no port
   conflicts, no orphan processes, no network surface, no browser launch — satisfying §8 with
   simpler, safer semantics. "Local browser UI" = Chromium embedded in the EXE.
2. **Single-writer SQLite, WAL mode.** Desktop single-machine product; WAL gives readers
   (search, dashboard) no lock contention. `busy_timeout=5000`, foreign keys ON.
3. **Business logic lives exclusively in the main process.** The renderer is a pure view.
   Every IPC handler resolves the authenticated session itself and enforces permissions
   before touching data → financial restrictions cannot be bypassed from the renderer,
   devtools, or crafted calls (§30, §70, §79).
4. **Money is integer paisa (1 BDT = 100 units)** end-to-end (DB `INTEGER`, services, IPC).
   No floating point in money paths. Display: `৳ 1,250` (decimals only when non-zero).
5. **Times are UTC ISO-8601 strings**; `YYYY-MM-DD` for date-only fields; one formatter for
   display (Asia/Dhaka, user date/time format from settings).
6. **Immutability by design.** Invoice/payment/visit history is append-mostly: corrections are
   void/adjustment records, never in-place rewrites. Treatment price, medicine, and dentist
   designation are snapshotted onto transactional rows (§96).
7. **Documents are built as self-contained HTML** with embedded CSS (fonts referenced by
   file URL, logo as data URL) and rendered by Chromium — so preview, `webContents.print()`,
   and `printToPDF()` all produce identical output. Pagination is the browser's, constrained
   by `break-inside: avoid` blocks and `@page` rules per paper profile.
8. **Backups are portable ZIPs** (DB snapshot + attachments + manifest with SHA-256 + schema
   version). DB snapshot taken with the online backup API (safe under WAL) → no torn copies.

## 3. Process & Data Layout (Windows)

```
%LOCALAPPDATA%\Programs\Dentiva Pro\      ← binaries (installer)
%APPDATA%\Dentiva Pro\
  data\dentiva.db                          ← database (+ -wal/-shm)
  attachments\<uuid>.<ext>                 ← patient/staff files
  config\app.json                          ← machine-local prefs (window bounds)
  logs\app-YYYYMMDD.jsonl                  ← rotated JSONL
  backups\ (default, user-configurable)    ← DentivaPro_Backup_YYYY-MM-DD_HH-mm-ss.zip
```

Tests override with `DENTIVA_DATA_DIR`.

## 4. Startup Flow

```
EXE → single-instance lock → data dir init → DB open+migrate+seed
  → crash-guard (uncaughtException: log + safe dialog + reopen)
  → meta.activated?  ── no → Activation screen
  → meta.setup_complete? ── no → Setup Wizard (creates clinic, dentists, admin)
  → Login → Session (user, roles, perms) → Dashboard
  → auto-lock timer (activity-tracked) → Lock screen (password to resume)
```

## 5. IPC Contract

`window.dentiva.invoke(channel, args)` → `{ ok: true, data }` or `{ ok: false, error: {code,message} }`.
Channels are grouped `domain.action`. Authenticated channels reject missing/locked sessions
(`AUTH_REQUIRED` / `LOCKED`). Public channels: `auth.*`, `activation.*`, `app.*`, `setup.*`.
Events pushed to renderer: `session:locked`, `notification:created`.

Error codes: `VALIDATION, NOT_FOUND, DUPLICATE, FORBIDDEN, AUTH_REQUIRED, LOCKED, STATE, FILE, DB`.

## 6. Module → Service Map

| UI module | Main-process service | Key permissions |
|-----------|---------------------|-----------------|
| Dashboard | dashboard.ts | patients.view (or any) |
| Patients | patients.ts | patients.* |
| Visits/Chart/Prescriptions | clinical.ts | clinical.* |
| Appointments/Queue | appointments.ts | appointments.*, queue.manage |
| Invoices/Payments | billing.ts | billing.* |
| Accounting | accounting.ts | accounting.*, financial.reports.view |
| Inventory/Suppliers | inventory.ts | inventory.*, suppliers.manage |
| Staff | staff.ts | staff.* |
| Users/Roles/Settings | admin.ts | admin.* |
| Backup/Restore | backup.ts | admin.backup / admin.restore |
| Audit | admin.ts (audit read) | admin.audit |
| Search | search.ts | patients.view (scopes per entity) |
| Documents/Print | print.ts | follows underlying document's permission |

## 7. Concurrency & Integrity

- All mutations in `db.transaction(...)`.
- Sequence numbers computed inside transactions (`max(id)+1`).
- `UNIQUE` constraints as final guard (codes, usernames, SKUs, dedupe keys).
- No `ON DELETE CASCADE` on clinical/financial history roots; soft delete/archive elsewhere.
