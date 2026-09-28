import { useCallback, useEffect, useState } from 'react';
import { Printer, FileDown, FolderOpen, RefreshCw } from 'lucide-react';
import { api } from '../lib/api';
import { Button, IconBtn, Select, Loading, toastError } from './ui';
import { useToast } from './ui';
import type { PrinterProfile } from '@shared/types';

export interface DocSpec {
  channel: 'documents' | 'reports';
  type?: string;
  id?: number;
  filters?: Record<string, unknown>;
}

interface BuiltDoc {
  title: string;
  html: string;
  profile: PrinterProfile;
  paperLabel: string;
}

/**
 * Full-height document preview with the exact HTML the print pipeline uses
 * (single source of truth: main process builds it). A4-ish preview is scaled
 * into the frame; print / PDF / CSV go through the same main-process paths.
 */
export function DocPreview({ spec, onClose }: { spec: DocSpec; onClose: () => void }) {
  const toast = useToast();
  const [doc, setDoc] = useState<BuiltDoc | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [profileId, setProfileId] = useState<number | null>(null);
  const [profiles, setProfiles] = useState<PrinterProfile[]>([]);
  const [zoom, setZoom] = useState(1);
  const [savedPdf, setSavedPdf] = useState<string | null>(null);
  const [savedCsv, setSavedCsv] = useState<string | null>(null);

  const load = useCallback(
    (pid?: number | null) => {
      setError('');
      setSavedPdf(null);
      setSavedCsv(null);
      api<BuiltDoc>(`${spec.channel}.${spec.channel === 'documents' ? 'preview' : 'build'}`, {
        type: spec.type,
        id: spec.id,
        filters: spec.filters,
        profileId: pid ?? null,
      })
        .then(setDoc)
        .catch((e) => setError(String((e as Error)?.message ?? e)));
    },
    [spec],
  );

  useEffect(() => {
    load(profileId);
    api<PrinterProfile[]>('printers.list')
      .then(setProfiles)
      .catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spec]);

  const run = async (channel: string) => {
    setBusy(true);
    try {
      const r = await api<{ result?: string; path?: string | null }>(channel, {
        type: spec.type,
        id: spec.id,
        filters: spec.filters,
        profileId,
      });
      if (channel.endsWith('.print')) {
        if (r.result === 'cancelled') toast('info', 'Print cancelled.');
        else toast('success', 'Sent to printer.');
      }
      if (channel.endsWith('.pdf')) {
        setSavedPdf(r.path ?? null);
        toast(r.path ? 'success' : 'info', r.path ? 'PDF saved.' : 'PDF save cancelled.');
      }
      if (channel.endsWith('.exportCsv')) {
        setSavedCsv(r.path ?? null);
        toast(r.path ? 'success' : 'info', r.path ? 'CSV exported.' : 'Export cancelled.');
      }
    } catch (e) {
      toastError(toast, e);
    } finally {
      setBusy(false);
    }
  };

  const openFile = async (path: string) => {
    try {
      const r = await api<{ ok: boolean; error?: string }>('files.open', { path });
      if (!r.ok) toast('error', r.error ?? 'Could not open the file.');
    } catch {
      toast('error', 'Could not open the file.');
    }
  };

  const isReport = spec.channel === 'reports';
  const widthMm = doc?.profile?.widthMm ?? 210;
  const previewWidth = Math.round(widthMm * 3.78 * zoom); // 96dpi: 1mm ≈ 3.78px

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.55)', display: 'flex', flexDirection: 'column', zIndex: 130, animation: 'fadeIn 0.15s var(--ease)' }}
    >
      {/* toolbar */}
      <div style={{ background: 'var(--c-surface)', borderBottom: '1px solid var(--c-border)', padding: '10px 18px', display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <strong style={{ fontSize: 'var(--fs-body)' }}>{doc?.title ?? 'Document'}</strong>
        <span style={{ fontSize: 'var(--fs-caption)', color: 'var(--c-text-3)' }}>{doc ? doc.paperLabel : ''}</span>
        <div style={{ flex: 1 }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 'var(--fs-caption)', color: 'var(--c-text-3)', fontWeight: 600 }}>Paper</span>
          <Select
            value={profileId ?? ''}
            onChange={(e) => {
              const v = e.target.value === '' ? null : Number(e.target.value);
              setProfileId(v);
              load(v);
            }}
            style={{ width: 190, padding: '6px 8px' }}
          >
            <option value="">{profiles.find((p) => p.isDefault)?.name ?? 'Default'}</option>
            {profiles.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        </div>
        <IconBtn label="Reload preview" icon={<RefreshCw size={16} />} onClick={() => load(profileId)} />
        <Button size="sm" variant="secondary" icon={<FileDown size={14} />} loading={busy} onClick={() => run(isReport ? 'reports.exportCsv' : 'documents.pdf')}>
          Save PDF
        </Button>
        {isReport && (
          <Button size="sm" variant="secondary" icon={<FileDown size={14} />} loading={busy} onClick={() => run('reports.exportCsv')}>
            Export CSV
          </Button>
        )}
        <Button size="sm" icon={<Printer size={14} />} loading={busy} onClick={() => run(isReport ? 'reports.print' : 'documents.print')}>
          Print
        </Button>
        <Button size="sm" variant="ghost" onClick={onClose}>
          Close
        </Button>
      </div>

      {/* body */}
      <div style={{ flex: 1, overflow: 'auto', background: '#525659', display: 'flex', justifyContent: 'center', padding: 24 }}>
        {error && (
          <div style={{ color: '#fff', background: 'rgba(220,38,38,0.9)', borderRadius: 'var(--r-md)', padding: '12px 18px', fontSize: 'var(--fs-small)', fontWeight: 500, maxWidth: 520 }}>
            {error}
          </div>
        )}
        {!error && !doc && <Loading label="Building document…" />}
        {doc && (
          <div style={{ width: previewWidth, transition: 'width var(--t-med)' }}>
            <div style={{ display: 'flex', gap: 6, marginBottom: 10, justifyContent: 'center' }}>
              {[0.6, 0.8, 1, 1.2].map((z) => (
                <button
                  key={z}
                  onClick={() => setZoom(z)}
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    padding: '3px 10px',
                    borderRadius: 999,
                    border: '1px solid rgba(255,255,255,0.35)',
                    background: zoom === z ? '#fff' : 'transparent',
                    color: zoom === z ? '#111' : '#fff',
                  }}
                >
                  {Math.round(z * 100)}%
                </button>
              ))}
            </div>
            <iframe
              title={doc.title}
              srcDoc={doc.html}
              style={{
                width: '100%',
                height: '100%',
                minHeight: 640,
                border: 'none',
                background: '#fff',
                boxShadow: '0 8px 40px rgba(0,0,0,0.45)',
                borderRadius: 4,
              }}
            />
          </div>
        )}
      </div>

      {/* saved-file chips */}
      {(savedPdf || savedCsv) && (
        <div style={{ position: 'absolute', bottom: 18, left: '50%', transform: 'translateX(-50%)', background: 'var(--c-surface)', border: '1px solid var(--c-border)', borderRadius: 'var(--r-lg)', boxShadow: 'var(--shadow-lg)', padding: '10px 16px', display: 'flex', gap: 10, alignItems: 'center', maxWidth: '90%' }}>
          {savedPdf && (
            <>
              <span style={{ fontSize: 'var(--fs-small)', maxWidth: 420, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{savedPdf}</span>
              <Button size="sm" variant="secondary" icon={<FolderOpen size={13} />} onClick={() => openFile(savedPdf)}>
                Open
              </Button>
            </>
          )}
          {savedCsv && (
            <>
              <span style={{ fontSize: 'var(--fs-small)', maxWidth: 420, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{savedCsv}</span>
              <Button size="sm" variant="secondary" icon={<FolderOpen size={13} />} onClick={() => openFile(savedCsv)}>
                Open
              </Button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
