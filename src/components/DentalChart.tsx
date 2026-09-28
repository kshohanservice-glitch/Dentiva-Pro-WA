import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api';
import { hasPerm } from '../lib/api';
import { useApp } from '../context/AppContext';
import { TOOTH_CONDITIONS, TOOTH_CONDITION_MAP } from '@shared/constants';
import type { Tooth } from '@shared/types';
import { Loading, Button } from './ui';

interface State {
  conditionKey: string;
  conditionLabel: string;
  color: string;
  note: string | null;
  updatedAt: string;
}

/**
 * Interactive quadrant chart. Grid computed in the renderer:
 * FDI adult 11–48 (quadrants 1–4), pediatric 51–88 (quadrants 5–8),
 * Universal 1–32 (top row 1–16, bottom row 17–32).
 */
export function DentalChart({
  patientId,
  numbering,
  dentition,
  onNumberingChange,
  onDentitionChange,
  editable,
  onSaved,
}: {
  patientId: number;
  numbering: 'fdi' | 'universal';
  dentition: 'adult' | 'pediatric';
  onNumberingChange?: (n: 'fdi' | 'universal') => void;
  onDentitionChange?: (d: 'adult' | 'pediatric') => void;
  editable: boolean;
  onSaved?: () => void;
}) {
  const [data, setData] = useState<{ teeth: Tooth[]; states: Record<string, State> } | null>(null);
  const [error, setError] = useState('');
  const [pickerTooth, setPickerTooth] = useState<Tooth | null>(null);
  const [note, setNote] = useState('');
  const { session } = useApp();
  const canEdit = editable && hasPerm(session?.perms, 'clinical.chart.edit');

  const load = useCallback(() => {
    setError('');
    api<{ teeth: Tooth[]; states: Record<string, State> }>('chart.get', { patientId, numbering, dentition })
      .then(setData)
      .catch((e) => setError(String(e?.message ?? e)));
  }, [patientId, numbering, dentition]);

  useEffect(() => {
    load();
  }, [load]);

  const set = async (toothId: number, conditionKey: string | null, noteValue: string | null) => {
    try {
      await api('chart.set', { patientId, toothId, conditionKey, note: noteValue });
      load();
      onSaved?.();
    } catch (e) {
      setError(String((e as Error)?.message ?? e));
    }
  };

  if (error) return <div style={{ color: 'var(--c-danger)', fontSize: 'var(--fs-small)' }}>{error}</div>;
  if (!data) return <Loading label="Loading chart…" />;

  const { teeth, states } = data;
  const upper: Tooth[] = [];
  const lower: Tooth[] = [];
  if (numbering === 'universal') {
    for (const t of teeth) {
      if (t.position <= 16) upper.push(t);
      else lower.push(t);
    }
    upper.reverse();
  } else {
    // FDI: position 1..32; teeth 11-18,21-28,31-38,41-48 → map to rows
    for (const t of teeth) {
      const digit = t.name.replace('FDI ', '');
      const quadrant = Number(digit[0]);
      const pos = Number(digit);
      if (quadrant <= 2) upper.push(t);
      else lower.push(t);
      void pos;
    }
    // FDI upper: 11-18 (pos 1-8) then 21-28 (pos 9-16) reversed for display
    upper.sort((a, b) => {
      const pa = Number(a.name.replace('FDI ', ''));
      const pb = Number(b.name.replace('FDI ', ''));
      const qa = Math.floor(pa / 10);
      const qb = Math.floor(pb / 10);
      if (qa !== qb) return qa - qb;
      return qb === 1 ? pa - pb : pb - pa;
    });
    lower.sort((a, b) => {
      const pa = Number(a.name.replace('FDI ', ''));
      const pb = Number(b.name.replace('FDI ', ''));
      const qa = Math.floor(pa / 10);
      const qb = Math.floor(pb / 10);
      if (qa !== qb) return qb - qa;
      return pa - pb;
    });
    // ensure quadrant 2 is mirrored: 28..21
    const q1 = upper.filter((t) => Math.floor(Number(t.name.replace('FDI ', '')) / 10) === 1);
    const q2 = upper.filter((t) => Math.floor(Number(t.name.replace('FDI ', '')) / 10) === 2).reverse();
    upper.length = 0;
    upper.push(...q1, ...q2);
    const q3 = lower.filter((t) => Math.floor(Number(t.name.replace('FDI ', '')) / 10) === 3);
    const q4 = lower.filter((t) => Math.floor(Number(t.name.replace('FDI ', '')) / 10) === 4).reverse();
    lower.length = 0;
    lower.push(...q3.reverse(), ...q4);
  }

  const Cell = ({ t }: { t: Tooth }) => {
    const st = states[String(t.id)];
    const bg = st ? st.color : 'var(--c-surface-2)';
    const fg = st ? '#fff' : 'var(--c-text-2)';
    return (
      <button
        onClick={() => {
          if (canEdit) {
            setPickerTooth(t);
            setNote(st?.note ?? '');
          }
        }}
        title={`${t.name}${st ? ` — ${st.conditionLabel}` : ''}${editable ? ' (click to mark)' : ''}`}
        style={{
          width: '100%',
          aspectRatio: '1 / 1.05',
          borderRadius: 9,
          border: `1px solid ${st ? 'transparent' : 'var(--c-border-strong)'}`,
          background: bg,
          color: fg,
          fontSize: 11.5,
          fontWeight: 700,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 1,
          padding: 2,
          cursor: canEdit ? 'pointer' : 'default',
          transition: 'transform var(--t-fast), box-shadow var(--t-fast)',
        }}
        onMouseEnter={(e) => {
          if (canEdit) {
            e.currentTarget.style.transform = 'translateY(-2px)';
            e.currentTarget.style.boxShadow = 'var(--shadow-md)';
          }
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.transform = 'none';
          e.currentTarget.style.boxShadow = 'none';
        }}
      >
        <span>{t.name.replace('FDI ', '').replace(/^#?/, '')}</span>
        {st && (
          <span style={{ fontSize: 7.5, fontWeight: 600, maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={st.conditionLabel}>
            {st.conditionLabel}
          </span>
        )}
      </button>
    );
  };

  const quadLabel = (q: number) => (q >= 5 ? `Q${q} (primary)` : `Q${q}`);

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        {onNumberingChange && (
          <div style={{ display: 'flex', border: '1px solid var(--c-border)', borderRadius: 'var(--r-md)', overflow: 'hidden' }}>
            {(['fdi', 'universal'] as const).map((n) => (
              <button
                key={n}
                onClick={() => onNumberingChange(n)}
                style={{
                  padding: '6px 14px',
                  fontSize: 'var(--fs-small)',
                  fontWeight: 600,
                  background: numbering === n ? 'var(--c-primary)' : 'var(--c-surface)',
                  color: numbering === n ? '#fff' : 'var(--c-text-2)',
                  transition: 'background var(--t-fast)',
                }}
              >
                {n === 'fdi' ? 'FDI' : 'Universal'}
              </button>
            ))}
          </div>
        )}
        {onDentitionChange && numbering !== 'universal' && (
          <div style={{ display: 'flex', border: '1px solid var(--c-border)', borderRadius: 'var(--r-md)', overflow: 'hidden' }}>
            {(['adult', 'pediatric'] as const).map((d) => (
              <button
                key={d}
                onClick={() => onDentitionChange(d)}
                style={{
                  padding: '6px 14px',
                  fontSize: 'var(--fs-small)',
                  fontWeight: 600,
                  background: dentition === d ? 'var(--c-primary)' : 'var(--c-surface)',
                  color: dentition === d ? '#fff' : 'var(--c-text-2)',
                  transition: 'background var(--t-fast)',
                }}
              >
                {d === 'adult' ? 'Adult (32)' : 'Pediatric (20)'}
              </button>
            ))}
          </div>
        )}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 10, flexWrap: 'wrap', fontSize: 10.5, color: 'var(--c-text-3)' }}>
          {TOOTH_CONDITIONS.slice(0, 8).map((c) => (
            <span key={c.key} style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
              <span style={{ width: 10, height: 10, borderRadius: 3, background: c.color, display: 'inline-block' }} />
              {c.label}
            </span>
          ))}
        </div>
      </div>

      {numbering === 'universal' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 760 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(16, 1fr)', gap: 6 }}>
            {upper.map((t) => (
              <Cell key={t.id} t={t} />
            ))}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(16, 1fr)', gap: 6 }}>
            {lower.map((t) => (
              <Cell key={t.id} t={t} />
            ))}
          </div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, maxWidth: 760 }}>
          {[
            { label: 'Upper left', teeth: upper.slice(0, 8), q: numbering === 'fdi' ? (dentition === 'pediatric' ? 5 : 2) : 2 },
            { label: 'Upper right', teeth: upper.slice(8, 16), q: numbering === 'fdi' ? (dentition === 'pediatric' ? 6 : 1) : 1 },
            { label: 'Lower left', teeth: lower.slice(0, 8), q: numbering === 'fdi' ? (dentition === 'pediatric' ? 7 : 3) : 3 },
            { label: 'Lower right', teeth: lower.slice(8, 16), q: numbering === 'fdi' ? (dentition === 'pediatric' ? 8 : 4) : 4 },
          ].map((quad, qi) => (
            <div key={qi} style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)', borderRadius: 'var(--r-lg)', padding: 10 }}>
              <div style={{ fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--c-text-3)', marginBottom: 8 }}>
                {quad.label} · {quadLabel(quad.q)}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
                {quad.teeth.map((t) => (
                  <Cell key={t.id} t={t} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* condition picker */}
      {pickerTooth && (
        <div
          role="dialog"
          aria-modal="true"
          style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 120, padding: 20 }}
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setPickerTooth(null);
          }}
        >
          <div className="anim-scale-in" style={{ background: 'var(--c-surface)', borderRadius: 'var(--r-xl)', width: '100%', maxWidth: 520, boxShadow: 'var(--shadow-lg)', padding: '20px 22px', border: '1px solid var(--c-border)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <h3 style={{ fontSize: 'var(--fs-h2)', fontWeight: 650 }}>Mark {pickerTooth.name}</h3>
              <Button variant="ghost" size="sm" onClick={() => setPickerTooth(null)}>
                Close
              </Button>
            </div>
            <div style={{ fontSize: 'var(--fs-small)', color: 'var(--c-text-2)', marginBottom: 14 }}>
              Select a condition, or clear the current marking.
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              {TOOTH_CONDITIONS.map((c) => (
                <button
                  key={c.key}
                  onClick={() => {
                    set(pickerTooth.id, c.key, note.trim() || null);
                    setPickerTooth(null);
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 9,
                    padding: '8px 10px',
                    borderRadius: 'var(--r-md)',
                    border: '1px solid var(--c-border)',
                    background: states[String(pickerTooth.id)]?.conditionKey === c.key ? 'var(--c-primary-subtle)' : 'var(--c-surface)',
                    fontSize: 'var(--fs-small)',
                    fontWeight: 500,
                    textAlign: 'left',
                  }}
                >
                  <span style={{ width: 14, height: 14, borderRadius: 4, background: c.color, flexShrink: 0 }} />
                  {c.label}
                </button>
              ))}
            </div>
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Note for this tooth (optional)"
              style={{ marginTop: 14, width: '100%', padding: '9px 12px', borderRadius: 'var(--r-md)', border: '1px solid var(--c-border)', fontSize: 'var(--fs-body)' }}
            />
            <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
              {states[String(pickerTooth.id)] && (
                <Button variant="danger" size="sm" onClick={() => { set(pickerTooth.id, null, null); setPickerTooth(null); }}>
                  Clear marking
                </Button>
              )}
              <div style={{ flex: 1 }} />
              <Button variant="secondary" size="sm" onClick={() => setPickerTooth(null)}>
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** Static summary used in the patient 360 view header strip. */
export function ChartConditionStrip({ patientId }: { patientId: number }) {
  const { ui } = useApp();
  const [states, setStates] = useState<Record<string, State> | null>(null);
  useEffect(() => {
    api<{ teeth: Tooth[]; states: Record<string, State> }>('chart.get', {
      patientId,
      numbering: ui.numberingSystem,
      dentition: 'adult',
    })
      .then((r) => setStates(r.states))
      .catch(() => setStates(null));
  }, [patientId, ui.numberingSystem]);
  if (!states) return null;
  const byLabel: Record<string, number> = {};
  for (const s of Object.values(states)) byLabel[s.conditionLabel] = (byLabel[s.conditionLabel] ?? 0) + 1;
  const entries = Object.entries(byLabel);
  if (!entries.length) return <span style={{ fontSize: 'var(--fs-caption)', color: 'var(--c-text-3)' }}>No conditions marked on chart</span>;
  return (
    <span style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      {entries.map(([label, n]) => {
        const c = TOOTH_CONDITION_MAP[Object.values(states).find((s) => s.conditionLabel === label)?.conditionKey ?? ''];
        return (
          <span
            key={label}
            style={{
              fontSize: 10.5,
              fontWeight: 600,
              padding: '2px 8px',
              borderRadius: 999,
              background: c ? `${c.color}22` : 'var(--c-surface-2)',
              color: c ? c.color : 'var(--c-text-2)',
              border: `1px solid ${c ? c.color + '55' : 'var(--c-border)'}`,
            }}
          >
            {label} × {n}
          </span>
        );
      })}
    </span>
  );
}
