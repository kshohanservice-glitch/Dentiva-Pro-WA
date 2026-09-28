# Dentiva Pro — Backup & Restore

## Backup file

`DentivaPro_Backup_YYYY-MM-DD_HH-mm-ss.zip`

```
manifest.json   { app:"DentivaPro", version:"1.0.0", schemaVersion:1, createdAt,
                  dbBytes, dbSha256, attachmentCount, attachments:[{storedName, sha256, bytes}] }
dentiva.db      (online snapshot via SQLite backup API — safe under WAL, no torn copies)
attachments/**  (copied verbatim; every file SHA-256 verified at creation)
```

- Manual: Settings → Backup & Restore → Choose destination (folder picker) → create.
- Scheduled: interval 7/15/30 days (admin-set); checked at startup + hourly timer; result
  recorded in `backup_records` (type manual|scheduled|pre_restore, status, checksum, size).
- Retention: no automatic deletion (clinic decides); Backup screen lists history with restore
  + open-folder + delete (delete of record requires re-auth).

## Restore protocol (strict)

1. User selects one backup file (or a folder to pick from history).
2. **Validation**: zip readable → manifest present → `app==="DentivaPro"` → `schemaVersion`
   supported (=== current) → DB sha256 matches → every attachment hash matches.
   Any failure → clear error, **nothing modified**.
3. **Mandatory pre-restore backup** to the backup destination (type `pre_restore`). If that
   backup fails (disk full, missing dir) → restore aborted with reason.
4. Warning modal: "current data will be replaced; a safety backup was created at <path>".
   Confirmation requires `admin.restore` + password re-auth + typed `RESTORE`.
5. Replace: DB snapshot copy to `dentiva.db` (after clean close of write transaction),
   attachments dir swapped (old moved to `attachments.old-<ts>` and pruned after restart),
   `backup_records` entry (type restore) + audit.
6. App reloads window → login → data verified via integrity query (`PRAGMA integrity_check`).

## Failure modes tested (G83)

corrupt zip / tampered DB hash / wrong app / wrong schema version / missing destination /
disk-full (pre-restore) / interrupted backup (partial zip detected by checksum) / restore of
backup containing attachments that were removed → recorded as missing-file warning, not crash.
