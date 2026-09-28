# Third-Party Notices — Dentiva Pro v1.0.0

Dentiva Pro is proprietary software (all rights reserved) developed by **Shohan Khan**.
It ships with the following third-party components. Every dependency below was
audited for license compatibility with closed, commercial distribution
(enforced in CI by `npm run scan` — see `scripts/source-audit.mjs`).

## Runtime components (embedded in the application)

| Component | Version | License | Used for |
|---|---|---|---|
| React | 18.3.1 | MIT | UI rendering |
| React DOM | 18.3.1 | MIT | DOM binding |
| React Router DOM | 6.28.1 | MIT | In-app navigation |
| Recharts | 2.15.0 | MIT | Dashboard charts |
| Lucide (lucide-react) | 0.469.0 | ISC | Icon set |
| better-sqlite3 | 11.10.0 | MIT | Local SQLite database driver |
| SQLite | (bundled with better-sqlite3) | Public Domain | Database engine |
| adm-zip | 0.5.16 | MIT | Backup archive (zip) creation/validation |
| Inter font | via @fontsource/inter 5.2.5 | SIL Open Font License 1.1 | UI + print typography (Latin) |
| Noto Sans Bengali font | via @fontsource/noto-sans-bengali 5.2.5 | SIL Open Font License 1.1 | Bengali Unicode rendering (UI + prints) |

## Runtime environment (the desktop shell)

| Component | Version | License | Role |
|---|---|---|---|
| Electron | 33.3.1 | MIT (see additional terms below) | Desktop runtime (Chromium + Node.js) |

Electron's MIT license is subject to the [Chromium license](https://www.chromium.org/)
and [Node.js license](https://github.com/nodejs/node) terms that apply to its
embedded components. Both are compatible with the bundled, commercial
distribution of this application.

## Build-time-only dependencies (NOT shipped)

TypeScript, Vite, Vitest, ESLint + plugins, electron-builder and related
tooling are used only during development and CI release builds. They do not
ship in the installer or the portable EXE and carry no distribution
obligations for the final product.

## Font licenses (summary)

The **Inter** and **Noto Sans Bengali** font files are licensed under the
SIL Open Font License 1.1, which permits free use, redistribution and
embedding in software. Full license texts are shipped with the application in
`resources/fonts/` (`OFL-Inter.txt`, `OFL-NotoSansBengali.txt`).

## Privacy & offline guarantee

Dentiva Pro contains no telemetry, no analytics, no crash reporting, and no
network code paths. It does not phone home, check for updates, or transmit
any data. All processing happens on the local machine using the components
listed above.
