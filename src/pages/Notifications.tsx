import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, CheckCheck } from 'lucide-react';
import { api } from '../lib/api';
import { useApp } from '../context/AppContext';
import { PageHeader } from '../components/Shell';
import { Button, Card, Badge, useToast, toastError, Loading, EmptyState } from '../components/ui';
import type { NotificationItem } from '@shared/types';
import { fmtDateTime } from '@shared/date';

const SEV_TONE: Record<NotificationItem['severity'], 'info' | 'success' | 'warning' | 'danger'> = {
  info: 'info',
  success: 'success',
  warning: 'warning',
  critical: 'danger',
};

export function Notifications() {
  const { ui } = useApp();
  const navigate = useNavigate();
  const [items, setItems] = useState<NotificationItem[] | null>(null);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const toast = useToast();

  const load = useCallback(() => {
    api<NotificationItem[]>('notifications.list', { unreadOnly }).then(setItems).catch((e) => toast('error', String((e as Error)?.message ?? e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unreadOnly]);

  useEffect(load, [load]);

  const markAll = async () => {
    try {
      await api('notifications.markAllRead');
      toast('success', 'All notifications marked as read.');
      load();
    } catch (e) {
      toastError(toast, e);
    }
  };

  const open = async (n: NotificationItem) => {
    if (!n.readAt) {
      await api('notifications.markRead', { id: n.id }).catch(() => undefined);
      setItems((xs) => (xs ? xs.map((x) => (x.id === n.id ? { ...x, readAt: new Date().toISOString() } : x)) : xs));
    }
    if (n.link) navigate(n.link);
  };

  return (
    <div style={{ padding: 22, maxWidth: 860, margin: '0 auto' }}>
      <PageHeader
        title="Notifications"
        subtitle="Alerts generated automatically: today’s appointments, low stock, expiring items and outstanding balances"
        actions={
          <>
            <label style={{ display: 'flex', gap: 7, alignItems: 'center', fontSize: 'var(--fs-small)', color: 'var(--c-text-2)', cursor: 'pointer' }}>
              <input type="checkbox" checked={unreadOnly} onChange={(e) => setUnreadOnly(e.target.checked)} style={{ width: 15, height: 15, accentColor: 'var(--c-primary)' }} />
              Unread only
            </label>
            <Button size="sm" variant="secondary" icon={<CheckCheck size={14} />} onClick={markAll}>Mark all read</Button>
          </>
        }
      />

      <Card style={{ padding: 0 }}>
        {!items ? (
          <div style={{ padding: 30 }}><Loading label="Loading notifications…" /></div>
        ) : items.length === 0 ? (
          <EmptyState icon={<Bell size={22} />} title="No notifications" hint={unreadOnly ? 'Nothing unread.' : 'You’re all caught up.'} />
        ) : (
          items.map((n) => (
            <button
              key={n.id}
              onClick={() => open(n)}
              style={{
                display: 'flex',
                gap: 12,
                width: '100%',
                textAlign: 'left',
                padding: '13px 16px',
                borderBottom: '1px solid var(--c-border)',
                background: n.readAt ? 'transparent' : 'var(--c-primary-subtle)',
              }}
            >
              <span
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: 999,
                  flexShrink: 0,
                  marginTop: 5,
                  background:
                    n.severity === 'critical' ? 'var(--c-danger)' : n.severity === 'warning' ? 'var(--c-warning)' : n.severity === 'success' ? 'var(--c-success)' : 'var(--c-info)',
                }}
              />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                  <strong style={{ fontSize: 'var(--fs-body)' }}>{n.title}</strong>
                  <Badge tone={SEV_TONE[n.severity]}>{n.severity}</Badge>
                  {!n.readAt && <Badge tone="info">new</Badge>}
                </div>
                {n.body && <div style={{ fontSize: 'var(--fs-small)', color: 'var(--c-text-2)', marginTop: 3 }}>{n.body}</div>}
                <div style={{ fontSize: 'var(--fs-caption)', color: 'var(--c-text-3)', marginTop: 4 }}>
                  {n.category} · {fmtDateTime(n.createdAt, ui.dateFormat, ui.timeFormat === '24h')}
                </div>
              </div>
            </button>
          ))
        )}
      </Card>
    </div>
  );
}
