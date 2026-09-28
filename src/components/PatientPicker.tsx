import { useEffect, useRef, useState } from 'react';
import { Search } from 'lucide-react';
import { api } from '../lib/api';
import { Input } from './ui';
import type { PatientListItem } from '@shared/types';

interface Option {
  id: number;
  code: string;
  fullName: string;
  phone: string;
}

/** Type-ahead patient selector used by appointments, queue, invoices. */
export function PatientPicker({
  onChange,
  placeholder = 'Search patient by name or phone…',
  disabled,
}: {
  value?: number | null;
  onChange: (id: number | null, name: string | null) => void;
  placeholder?: string;
  disabled?: boolean;
}) {
  const [q, setQ] = useState('');
  const [options, setOptions] = useState<Option[]>([]);
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Option | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const search = (text: string) => {
    setQ(text);
    if (timer.current) window.clearTimeout(timer.current);
    if (text.trim().length < 2) {
      setOptions([]);
      return;
    }
    timer.current = window.setTimeout(() => {
      api<{ items: PatientListItem[]; total: number }>('patients.list', { q: text.trim(), pageSize: 12 })
        .then((r) => {
          setOptions(r.items.map((p) => ({ id: p.id, code: p.code, fullName: p.fullName, phone: p.phone })));
          setOpen(true);
        })
        .catch(() => undefined);
    }, 200);
  };

  const pick = (o: Option) => {
    setSelected(o);
    setQ(`${o.fullName} (${o.code})`);
    setOpen(false);
    onChange(o.id, o.fullName);
  };

  const clear = () => {
    setSelected(null);
    setQ('');
    setOptions([]);
    onChange(null, null);
  };

  return (
    <div ref={boxRef} style={{ position: 'relative' }}>
      <div style={{ position: 'relative' }}>
        <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--c-text-3)' }} />
        <Input
          value={q}
          onChange={(e) => {
            if (selected) {
              clear();
            }
            search(e.target.value);
          }}
          onFocus={() => {
            if (options.length) setOpen(true);
          }}
          placeholder={placeholder}
          disabled={disabled}
          style={{ paddingLeft: 30 }}
        />
      </div>
      {open && (
        <div style={{ position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, background: 'var(--c-surface)', border: '1px solid var(--c-border)', borderRadius: 'var(--r-md)', boxShadow: 'var(--shadow-lg)', zIndex: 60, overflow: 'hidden', maxHeight: 280, overflowY: 'auto' }}>
          {options.length === 0 && <div style={{ padding: '10px 12px', fontSize: 'var(--fs-small)', color: 'var(--c-text-3)' }}>No matching patients.</div>}
          {options.map((o) => (
            <button
              key={o.id}
              onClick={() => pick(o)}
              style={{ display: 'flex', gap: 10, width: '100%', textAlign: 'left', padding: '9px 12px', borderBottom: '1px solid var(--c-border)', fontSize: 'var(--fs-body)' }}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--c-primary-subtle)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
            >
              <span style={{ fontWeight: 650 }}>{o.fullName}</span>
              <span style={{ color: 'var(--c-text-3)', fontSize: 'var(--fs-caption)' }}>{o.code}{o.phone ? ` · ${o.phone}` : ''}</span>
            </button>
          ))}
        </div>
      )}
      {selected && (
        <div style={{ position: 'absolute', top: -2, right: 2 }}>
          <button onClick={clear} title="Clear" style={{ color: 'var(--c-text-3)', fontSize: 11, fontWeight: 700, background: 'var(--c-surface-2)', borderRadius: 999, padding: '1px 7px', border: '1px solid var(--c-border)' }}>
            ×
          </button>
        </div>
      )}
    </div>
  );
}
