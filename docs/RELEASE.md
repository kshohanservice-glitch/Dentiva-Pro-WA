# Dentiva Pro — Release Process

## Versioning

**v1.0.0** — final production release. Consistent in: package.json, About screen, installer
metadata, Git tag `v1.0.0`, GitHub Release, this doc.

## CI (`.github/workflows/ci.yml`) — every PR + push to main

1. `npm ci`
2. lint (ESLint)
3. typecheck (tsc strict, renderer + main)
4. unit + integration + RBAC + acceptance tests (Vitest)
5. production build (vite + tsc)
Gate: all must pass; merge blocked otherwise.

## Release (`.github/workflows/release.yml`) — on tag `v*` (windows-latest)

1. install, lint, typecheck, full tests
2. `electron-builder install-app-deps` (rebuild better-sqlite3 for Electron)
3. `electron-builder --win nsis portable` → `dist/DentivaPro-Setup-1.0.0.exe` + portable
4. Installer smoke: install to temp dir, launch `--smoke` flag (self-test: db init, activation,
   setup complete, invoice+payment, PDF generation), report
5. Uninstall smoke (with data + without data)
6. `softprops/action-gh-release` attaches installer + portable + checksums
7. Fallback: artifacts also uploaded as workflow artifacts; `dist/` in repo remains the
   documented local build output dir (binaries gitignored — release is the artifact home)

## Pre-tag checklist (run manually, recorded in PROJECT_STATUS.md)

- [ ] `npm test` green (full suite)
- [ ] stress test numbers recorded
- [ ] source audit clean (scan script: TODO/mock/placeholder/plaintext activation)
- [ ] screen inventory complete (docs/SCREEN_INVENTORY.md)
- [ ] dependency audit: package-lock diff reviewed, licenses recorded
- [ ] THIRD_PARTY_NOTICES.md current
- [ ] CI green on main
