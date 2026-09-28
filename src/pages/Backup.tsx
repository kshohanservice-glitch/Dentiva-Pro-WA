import { useCallback, useEffect, useState } from 'react';
import { DatabaseBackup, ShieldCheck, UploadCloud, FolderOpen, Trash2, AlertTriangle, HardDriveDownload, Plus } from 'lucide-react';
import { api, hasPerm } from '../lib/api';
import { useApp } from '../context/AppContext';
import { PageHeader } from '../components/Shell';
import { Button, Card, Table, Column, Badge, Modal, Field, Input, useToast, toastError, Loading, EmptyState, ConfirmModal } from '../components/ui';
import type { BackupRecord } from '@shared/types';
import { fmtDateTime } from '@shared/date';

interface ValidationResult {
  ok: boolean;
  error?: string;
  warnings: string[];
  manifest?: {
    app: string;
    version: string;
    schemaVersion: number;
    createdAt: string;
    dbBytes: number;
    attachmentCount: number;
  };
}

export function Backup() {
  const { session, ui } = useApp();
  const [records, setRecords] = useState<BackupRecord[]>([]);
  const [creating, setCreating] = useState(false);
  const [creatingDest, setCreatingDest] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [restorePath, setRestorePath] = useState('');
  const [restoreState, setRestoreState] = useState<'idle' | 'validated' | 'restoring' | 'done'>('idle');
  const [validation, setValidation] = useState<ValidationResult | null>(null);
  const [deleteRec, setDeleteRec] = useState<BackupRecord | null>(null);
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  const canBackup = hasPerm(session?.perms, 'admin.backup');
  const canRestore = hasPerm(session?.perms, 'admin.restore');

  const load = useCallback(() => {
    api<BackupRecord[]>('backup.list').then(setRecords).catch((e) => toast('error', String((e as Error)?.message ?? e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(load, [load]);

  const createBackup = async () => {
    setCreating(true);
    try {
      const r = await api<{ path: string }>('backup.create', { destination: creatingDest || undefined });
      toast('success', `Backup created: ${r.path.split(/[\\/]/).pop()}`);
      setShowCreate(false);
      setCreatingDest('');
      load();
    } catch (e) {
      toastError(toast, e);
    } finally {
      setCreating(false);
    }
  };

  const runScheduled = async () => {
    setBusy(true);
    try {
      const r = await api<{ path: string | null }>('backup.scheduledIfDue');
      toast(r.path ? 'success' : 'info', r.path ? 'Scheduled backup was due — it has been created.' : 'The scheduled backup is not due yet (runs automatically from the app on the configured interval).');
      load();
    } catch (e) {
      toastError(toast, e);
    } finally {
      setBusy(false);
    }
  };

  const pickFile = async () => {
    try {
      const r = await api<{ path: string | null }>('dialogs.pickFile', { title: 'Choose a Dentiva Pro backup (.zip)', purpose: 'backup' });
      if (r.path) {
        setRestorePath(r.path);
        setRestoreState('idle');
        setValidation(null);
      }
    } catch {
      /* cancelled */
    }
  };

  const validate = async () => {
    if (!restorePath) return;
    setValidation(null);
    setRestoreState('idle');
    try {
      const v = await api<ValidationResult>('backup.validate', { path: restorePath });
      setValidation(v);
      setRestoreState(v.ok ? 'validated' : 'idle');
      if (!v.ok) toast('error', v.error ?? 'Backup validation failed.');
      else toast('success', 'Backup is valid and ready to restore.');
    } catch (e) {
      toastError(toast, e);
    }
  };

  const doRestore = async () => {
    setRestoreState('restoring');
    try {
      const r = await api<{ preRestoreBackup: string; warnings: string[]; reauthRequired: boolean }>('backup.restore', { path: restorePath });
      setRestoreState('done');
      toast('success', 'Restore complete. You must sign in again with the credentials from the restored data.');
      // Give the UI a beat, then force the sign-in screen.
      window.setTimeout(() => window.location.reload(), 2500);
      void r;
    } catch (e) {
      setRestoreState('validated');
      toastError(toast, e);
    }
  };

  const columns: Column<BackupRecord>[] = [
    { key: 'file', label: 'Backup file', render: (r) => (
      <div>
        <div style={{ fontWeight: 650, fontSize: 'var(--fs-body)' }}>{r.fileName}</div>
        <div style={{ fontSize: 'var(--fs-caption)', color: 'var(--c-text-3)', maxWidth: 340, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.filePath}>{r.filePath}</div>
      </div>
    ) },
    { key: 'date', label: 'Created', render: (r) => fmtDateTime(r.createdAt, ui.dateFormat, ui.timeFormat === '24h'), width: 160 },
    { key: 'type', label: 'Type', width: 110, render: (r) => (
      <Badge tone={r.type === 'pre_restore' ? 'warning' : r.type === 'scheduled' ? 'info' : 'primary'}>
        {r.type === 'pre_restore' ? 'Pre-restore' : r.type === 'scheduled' ? 'Scheduled' : 'Manual'}
      </Badge>
    ) },
    { key: 'size', label: 'Size', align: 'right', render: (r) => `${(r.sizeBytes / 1024 / 1024).toFixed(1)} MB`, width: 90 },
    { key: 'status', label: 'Status', width: 90, render: (r) => (r.status === 'success' ? <Badge tone="success">OK</Badge> : <Badge tone="danger">FAILED</Badge>) },
    { key: 'by', label: 'By', render: (r) => r.createdBy ?? '—', width: 120 },
    ...(canBackup
      ? [{
          key: 'act', label: '', align: 'right' as const, width: 80, render: (r: BackupRecord) => (
            <Button size="sm" variant="ghost" icon={<Trash2 size={13} />} style={{ color: 'var(--c-danger)' }} onClick={() => setDeleteRec(r)}>Delete</Button>
          ),
        }]
      : []),
  ];

  return (
    <div style={{ padding: 22, maxWidth: 1200, margin: '0 auto' }}>
      <PageHeader
        title="Backup & Restore"
        subtitle="Protected copies of your entire clinic database and attachments"
        actions={
          <>
            {canBackup && (
              <>
                <Button variant="secondary" icon={<HardDriveDownload size={14} />} loading={busy} onClick={runScheduled}>
                  Run if scheduled backup is due
                </Button>
                <Button icon={<Plus size={15} />} onClick={() => setShowCreate(true)}>New backup</Button>
              </>
            )}
          </>
        }
      />

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 16 }}>
        <Card>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 10 }}>
            <span style={{ width: 40, height: 40, borderRadius: 11, background: 'var(--c-success-subtle, #dcfce7)', color: 'var(--c-success)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <ShieldCheck size={20} />
            </span>
            <div>
              <strong style={{ fontSize: 'var(--fs-body)' }}>How backups work</strong>
              <div style={{ fontSize: 'var(--fs-caption)', color: 'var(--c-text-3)' }}>Every backup is verified with SHA-256 checksums</div>
            </div>
          </div>
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 'var(--fs-small)', color: 'var(--c-text-2)', lineHeight: 1.9 }}>
            <li>A <strong>manual or scheduled backup</strong> is a single .zip containing the database snapshot and all attachments, named <code>DentivaPro_Backup_YYYY-MM-DD_HH-mm-ss.zip</code>.</li>
            <li>Before any restore, Dentiva Pro <strong>creates a safety backup of the current data first</strong> — you can never restore into nothing.</li>
            <li>Restoring validates the archive, checks schema compatibility, swaps the data and then requires you to <strong>sign in again</strong>.</li>
            <li>Copy backups to an external drive regularly. In-app backups live on this computer’s disk.</li>
          </ul>
        </Card>
        <Card>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 10 }}>
            <span style={{ width: 40, height: 40, borderRadius: 11, background: 'var(--c-primary-subtle)', color: 'var(--c-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <HardDriveDownload size={20} />
            </span>
            <div>
              <strong style={{ fontSize: 'var(--fs-body)' }}>Restore from a backup file</strong>
              <div style={{ fontSize: 'var(--fs-caption)', color: 'var(--c-text-3)' }}>Requires the restore permission</div>
            </div>
          </div>
          {!canRestore ? (
            <div style={{ fontSize: 'var(--fs-small)', color: 'var(--c-text-3)' }}>Your role does not include restore rights.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'flex', gap: 8 }}>
                <Button variant="secondary" icon={<FolderOpen size={14} />} onClick={pickFile}>Choose backup file…</Button>
                {restorePath && restoreState !== 'restoring' && restoreState !== 'done' && (
                  <Button variant="ghost" size="sm" onClick={() => { setRestorePath(''); setValidation(null); setRestoreState('idle'); }}>Clear</Button>
                )}
              </div>
              {restorePath && (
                <Input value={restorePath} readOnly style={{ background: 'var(--c-surface-2)' }} />
              )}
              {restorePath && restoreState === 'idle' && (
                <Button variant="secondary" icon={<ShieldCheck size={14} />} onClick={validate}>Validate first</Button>
              )}
              {validation && !validation.ok && (
                <div style={{ background: 'var(--c-danger-subtle)', color: '#991b1b', borderRadius: 'var(--r-md)', padding: '10px 12px', fontSize: 'var(--fs-small)', fontWeight: 500 }}>{validation.error}</div>
              )}
              {validation?.ok && (
                <div style={{ background: 'var(--c-success-subtle, #dcfce7)', borderRadius: 'var(--r-md)', padding: '10px 12px', fontSize: 'var(--fs-small)', color: '#166534' }}>
                  <strong>Valid backup.</strong> Created {fmtDateTime(validation.manifest?.createdAt, ui.dateFormat)} · schema {validation.manifest?.schemaVersion} · {validation.manifest?.attachmentCount} attachments.
                  {validation.warnings.length > 0 && (
                    <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 3 }}>
                      {validation.warnings.map((w, i) => (
                        <span key={i} style={{ display: 'flex', gap: 6 }}><AlertTriangle size={12} style={{ flexShrink: 0, marginTop: 2 }} />{w}</span>
                      ))}
                    </div>
                  )}
                </div>
              )}
              {restoreState === 'validated' && (
                <Button variant="danger" onClick={doRestore} icon={<UploadCloud size={14} />}>
                  Restore this backup (a safety backup is made first)
                </Button>
              )}
              {restoreState === 'restoring' && (
                <div style={{ display: 'flex', gap: 10, alignItems: 'center', fontSize: 'var(--fs-small)', color: 'var(--c-text-2)' }}>
                  <Loading label="" /> Replacing data… keep the app open.
                </div>
              )}
              {restoreState === 'done' && (
                <div style={{ background: 'var(--c-primary-subtle)', color: 'var(--c-primary)', borderRadius: 'var(--r-md)', padding: '10px 12px', fontSize: 'var(--fs-small)', fontWeight: 600 }}>
                  Restore complete — reloading to the sign-in screen…
                </div>
              )}
            </div>
          )}
        </Card>
      </div>

      <Card style={{ padding: 0 }}>
        <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--c-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <strong style={{ fontSize: 'var(--fs-body)' }}>Backup history</strong>
          <span style={{ fontSize: 'var(--fs-caption)', color: 'var(--c-text-3)' }}>{records.length} records</span>
        </div>
        {!records.length ? (
          <EmptyState icon={<DatabaseBackup size={22} />} title="No backups yet" hint="Create your first backup to protect your clinic data." action={canBackup ? <Button size="sm" icon={<Plus size={14} />} onClick={() => setShowCreate(true)}>New backup</Button> : undefined} />
        ) : (
          <Table columns={columns} rows={records} />
        )}
      </Card>

      {showCreate && (
        <Modal
          title="New backup"
          subtitle="A verified .zip snapshot of the database and attachments."
          onClose={() => setShowCreate(false)}
          width={500}
          footer={
            <>
              <Button variant="secondary" onClick={() => setShowCreate(false)} disabled={creating}>Cancel</Button>
              <Button loading={creating} onClick={createBackup} icon={<DatabaseBackup size={14} />}>Create backup</Button>
            </>
          }
        >
          <Field label="Destination folder" hint="Leave empty to use the default backups folder next to your data.">
            <Input value={creatingDest} onChange={(e) => setCreatingDest(e.target.value)} placeholder="Default (recommended)" />
          </Field>
        </Modal>
      )}

      {deleteRec && (
        <ConfirmModal
          title="Delete backup record"
          danger
          confirmLabel="Delete"
          message={<>Delete the record for <strong>{deleteRec.fileName}</strong>? The file on disk is deleted too. This cannot be undone.</>}
          busy={busy}
          onClose={() => setDeleteRec(null)}
          onConfirm={async () => {
            setBusy(true);
            try {
              await api('backup.deleteRecord', { id: deleteRec.id });
              toast('success', 'Backup deleted.');
              setDeleteRec(null);
              load();
            } catch (e) {
              toastError(toast, e);
            } finally {
              setBusy(false);
            }
          }}
        />
      )}
    </div>
  );
}
