import { useCallback, useEffect, useState } from 'react';
import { ShieldCheck, Search } from 'lucide-react';
import { api } from '../lib/api';
import { useApp } from '../context/AppContext';
import { PageHeader } from '../components/Shell';
import { Card, Table, Column, Pagination, Badge, Input, Select, useToast, Loading, EmptyState } from '../components/ui';
import type { AuditEntry } from '@shared/types';
import { fmtDateTime } from '@shared/date';

const PAGE_SIZE = 30;

export function Audit() {
  const { ui } = useApp();
  const [q, setQ] = useState('');
  const [action, setAction] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [actions, setActions] = useState<string[]>([]);
  const [page, setPage] = useState(1);
  const [data, setData] = useState<{ items: AuditEntry[]; total: number } | null>(null);
  const toast = useToast();

  const load = useCallback(() => {
    api<{ items: AuditEntry[]; total: number }>(
      'audit.list',
      { q: q || undefined, action: action || undefined, from: from || undefined, to: to || undefined, page, pageSize: PAGE_SIZE },
    )
      .then(setData)
      .catch((e) => toast('error', String((e as Error)?.message ?? e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, action, from, to, page]);

  useEffect(load, [load]);
  useEffect(() => {
    api<string[]>('audit.actions').then(setActions).catch(() => undefined);
  }, [data]);

  const columns: Column<AuditEntry>[] = [
    { key: 'ts', label: 'Time', render: (r) => (
      <span style={{ fontVariantNumeric: 'tabular-nums', fontSize: 'var(--fs-small)', whiteSpace: 'nowrap' }}>{fmtDateTime(r.timestamp, ui.dateFormat, ui.timeFormat === '24h')}</span>
    ), width: 160 },
    { key: 'user', label: 'User', render: (r) => (
      <div>
        <div style={{ fontWeight: 650, fontSize: 'var(--fs-body)' }}>{r.username ?? 'system'}</div>
        {r.roleName && <div style={{ fontSize: 'var(--fs-caption)', color: 'var(--c-text-3)' }}>{r.roleName}</div>}
      </div>
    ), width: 140 },
    { key: 'action', label: 'Action', render: (r) => <code style={{ fontSize: 'var(--fs-small)', background: 'var(--c-surface-2)', padding: '2px 7px', borderRadius: 6 }}>{r.action}</code>, width: 190 },
    { key: 'entity', label: 'Entity', render: (r) => (
      <div>
        <div style={{ fontSize: 'var(--fs-body)' }}>{r.entity}</div>
        {r.entityId && <div style={{ fontSize: 'var(--fs-caption)', color: 'var(--c-text-3)' }}>#{r.entityId}</div>}
      </div>
    ), width: 150 },
    { key: 'context', label: 'Context', render: (r) => (
      <div style={{ maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--c-text-2)', fontSize: 'var(--fs-small)' }} title={r.context ?? ''}>
        {r.context ?? '—'}
      </div>
    ) },
    { key: 'result', label: 'Result', width: 90, render: (r) => (
      <Badge tone={r.result === 'success' ? 'success' : r.result === 'failure' ? 'danger' : 'muted'}>{r.result}</Badge>
    ) },
  ];

  return (
    <div style={{ padding: 22, maxWidth: 1280, margin: '0 auto' }}>
      <PageHeader
        title="Audit log"
        subtitle="A tamper-evident record of who did what. Entries are written by the application and cannot be edited or deleted from the UI."
      />

      <Card style={{ padding: 14, marginBottom: 14 }}>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ position: 'relative', flex: '1 1 220px' }}>
            <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--c-text-3)' }} />
            <Input value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} placeholder="Search user, action, entity…" style={{ paddingLeft: 30 }} />
          </div>
          <Select value={action} onChange={(e) => { setAction(e.target.value); setPage(1); }} style={{ width: 230 }}>
            <option value="">All actions</option>
            {actions.map((a) => (
              <option key={a} value={a}>{a}</option>
            ))}
          </Select>
          <Input type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPage(1); }} style={{ width: 150 }} />
          <Input type="date" value={to} onChange={(e) => { setTo(e.target.value); setPage(1); }} style={{ width: 150 }} />
          <div style={{ flex: 1 }} />
          <span style={{ fontSize: 'var(--fs-caption)', color: 'var(--c-text-3)' }}>{data ? `${data.total} entries` : ''}</span>
        </div>
      </Card>

      <Card style={{ padding: 0 }}>
        {!data ? (
          <div style={{ padding: 30 }}><Loading label="Loading audit log…" /></div>
        ) : (
          <>
            <Table
              columns={columns}
              rows={data.items}
              empty={<EmptyState icon={<ShieldCheck size={22} />} title="No audit entries match" hint="Try widening the date range or clearing filters." />}
            />
            <div style={{ padding: '10px 14px' }}>
              <Pagination page={page} pageSize={PAGE_SIZE} total={data.total} onPage={setPage} />
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
