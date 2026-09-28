import React, { useEffect, useRef, useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, Users2, CalendarDays, ListOrdered, Stethoscope, FileText, Receipt,
  Wallet, Boxes, Landmark, UserCog, DatabaseBackup, Settings, Info, Bell, Search,
  Lock, LogOut, ChevronLeft, ChevronRight, ShieldCheck,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { hasPerm } from '../lib/api';
import { IconBtn } from './ui';
import { api } from '../lib/api';
import type { NotificationItem } from '@shared/types';
import { fmtDate } from '@shared/date';
import { APP_VERSION } from '@shared/constants';

interface NavItem {
  to: string;
  label: string;
  icon: React.ReactNode;
  perm?: string[];
}

const SECTIONS: Array<{ title: string; items: NavItem[] }> = [
  {
    title: 'Practice',
    items: [
      { to: '/', label: 'Dashboard', icon: <LayoutDashboard size={18} /> },
      { to: '/patients', label: 'Patients', icon: <Users2 size={18} />, perm: ['patients.view'] },
      { to: '/appointments', label: 'Appointments', icon: <CalendarDays size={18} />, perm: ['appointments.view'] },
      { to: '/queue', label: 'Queue', icon: <ListOrdered size={18} />, perm: ['queue.manage', 'appointments.view'] },
    ],
  },
  {
    title: 'Clinical',
    items: [
      { to: '/treatments', label: 'Treatments', icon: <Stethoscope size={18} />, perm: ['clinical.view'] },
      { to: '/prescriptions', label: 'Prescriptions', icon: <FileText size={18} />, perm: ['clinical.view'] },
    ],
  },
  {
    title: 'Billing',
    items: [
      { to: '/invoices', label: 'Invoices', icon: <Receipt size={18} />, perm: ['billing.invoice.view'] },
      { to: '/payments', label: 'Payments', icon: <Wallet size={18} />, perm: ['billing.payment.view'] },
      { to: '/inventory', label: 'Inventory', icon: <Boxes size={18} />, perm: ['inventory.view'] },
      { to: '/accounting', label: 'Accounting', icon: <Landmark size={18} />, perm: ['accounting.view', 'financial.reports.view'] },
    ],
  },
  {
    title: 'Administration',
    items: [
      { to: '/staff', label: 'Staff & Users', icon: <UserCog size={18} />, perm: ['staff.view', 'admin.users', 'admin.roles'] },
      { to: '/backup', label: 'Backup & Restore', icon: <DatabaseBackup size={18} />, perm: ['admin.backup', 'admin.restore'] },
      { to: '/audit', label: 'Audit Log', icon: <ShieldCheck size={18} />, perm: ['admin.audit'] },
      { to: '/settings', label: 'Settings', icon: <Settings size={18} />, perm: ['admin.settings'] },
      { to: '/about', label: 'About', icon: <Info size={18} /> },
    ],
  },
];

function useOutside(onOut: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const fn = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onOut();
    };
    document.addEventListener('mousedown', fn);
    return () => document.removeEventListener('mousedown', fn);
  }, [onOut]);
  return ref;
}

export function Shell({ children }: { children: React.ReactNode }) {
  const { session, ui, lock, logout } = useApp();
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [userOpen, setUserOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const [notifs, setNotifs] = useState<NotificationItem[]>([]);
  const notifRef = useOutside(() => setNotifOpen(false));
  const userRef = useOutside(() => setUserOpen(false));

  const perms = session?.perms ?? [];
  const today = new Date().toISOString().slice(0, 10);

  const refreshUnread = React.useCallback(() => {
    api<{ count: number }>('notifications.unread')
      .then((r) => setUnread(r.count))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    refreshUnread();
    const off = window.dentiva.on('notification:created', () => refreshUnread());
    return off;
  }, [refreshUnread]);

  const openNotifs = async () => {
    const open = !notifOpen;
    setNotifOpen(open);
    if (open) {
      try {
        setNotifs(await api<NotificationItem[]>('notifications.list'));
        refreshUnread();
      } catch {
        /* ignore */
      }
    }
  };

  const visibleSections = SECTIONS.map((s) => ({
    ...s,
    items: s.items.filter((i) => !i.perm || i.perm.some((p) => hasPerm(perms, p))),
  })).filter((s) => s.items.length > 0);

  return (
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden' }}>
      {/* ------------------------------------------------ sidebar */}
      <aside
        style={{
          width: collapsed ? 'var(--sidebar-w-collapsed)' : 'var(--sidebar-w)',
          background: '#0d1f26',
          display: 'flex',
          flexDirection: 'column',
          transition: 'width var(--t-med) var(--ease)',
          flexShrink: 0,
          overflow: 'hidden',
        }}
      >
        <div style={{ height: 'var(--header-h)', display: 'flex', alignItems: 'center', gap: 10, padding: '0 14px', borderBottom: '1px solid rgba(255,255,255,0.07)', flexShrink: 0 }}>
          <img src="./icon/icon.png" alt="Dentiva Pro" style={{ width: 32, height: 32, borderRadius: 8, flexShrink: 0 }} />
          {!collapsed && (
            <div style={{ minWidth: 0 }}>
              <div style={{ color: '#fff', fontWeight: 700, fontSize: 15, letterSpacing: '0.01em', whiteSpace: 'nowrap' }}>Dentiva Pro</div>
              <div style={{ color: 'rgba(255,255,255,0.45)', fontSize: 11, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {session ? 'Dental Practice Management' : ''}
              </div>
            </div>
          )}
        </div>

        <nav style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', padding: '10px 8px' }}>
          {visibleSections.map((sec) => (
            <div key={sec.title} style={{ marginBottom: 14 }}>
              {!collapsed && (
                <div style={{ fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.09em', color: 'rgba(255,255,255,0.35)', padding: '6px 10px 4px' }}>
                  {sec.title}
                </div>
              )}
              {collapsed && <div style={{ height: 1, background: 'rgba(255,255,255,0.08)', margin: '8px 6px' }} />}
              {sec.items.map((it) => (
                <NavLink
                  key={it.to}
                  to={it.to}
                  end={it.to === '/'}
                  title={collapsed ? it.label : undefined}
                  style={({ isActive }) => ({
                    display: 'flex',
                    alignItems: 'center',
                    gap: 11,
                    padding: collapsed ? '9px 0' : '9px 12px',
                    justifyContent: collapsed ? 'center' : 'flex-start',
                    borderRadius: 'var(--r-md)',
                    color: isActive ? '#5eead4' : 'rgba(255,255,255,0.72)',
                    background: isActive ? 'rgba(94,234,212,0.12)' : 'transparent',
                    fontWeight: isActive ? 650 : 500,
                    fontSize: 13.5,
                    marginBottom: 2,
                    whiteSpace: 'nowrap',
                    transition: 'background var(--t-fast), color var(--t-fast)',
                  })}
                  onMouseEnter={(e) => {
                    if (!(e.currentTarget as HTMLElement).classList.contains('active')) e.currentTarget.style.background = 'rgba(255,255,255,0.06)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'transparent';
                  }}
                >
                  <span style={{ display: 'flex', flexShrink: 0 }}>{it.icon}</span>
                  {!collapsed && <span>{it.label}</span>}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>

        <div style={{ padding: 10, borderTop: '1px solid rgba(255,255,255,0.07)', flexShrink: 0 }}>
          <IconBtn
            label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            icon={collapsed ? <ChevronRight size={17} style={{ color: 'rgba(255,255,255,0.6)' }} /> : <ChevronLeft size={17} style={{ color: 'rgba(255,255,255,0.6)' }} />}
            style={{ color: 'rgba(255,255,255,0.6)', width: '100%', height: 30, background: 'transparent' }}
            onClick={() => setCollapsed((c) => !c)}
          />
          {!collapsed && <div style={{ textAlign: 'center', color: 'rgba(255,255,255,0.3)', fontSize: 10.5, marginTop: 6 }}>Version {APP_VERSION}</div>}
        </div>
      </aside>

      {/* ------------------------------------------------ main */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <header
          style={{
            height: 'var(--header-h)',
            background: 'var(--c-surface)',
            borderBottom: '1px solid var(--c-border)',
            display: 'flex',
            alignItems: 'center',
            gap: 14,
            padding: '0 18px',
            flexShrink: 0,
          }}
        >
          <button
            onClick={() => navigate('/search')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 9,
              background: 'var(--c-surface-2)',
              border: '1px solid var(--c-border)',
              borderRadius: 'var(--r-md)',
              padding: '7px 12px',
              color: 'var(--c-text-3)',
              fontSize: 'var(--fs-small)',
              width: 300,
              transition: 'border-color var(--t-fast)',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.borderColor = 'var(--c-border-strong)')}
            onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'var(--c-border)')}
          >
            <Search size={15} />
            Search patients, invoices, payments…
            <span style={{ marginLeft: 'auto', border: '1px solid var(--c-border)', borderRadius: 5, padding: '0 6px', fontSize: 10.5, fontWeight: 600, background: 'var(--c-surface)' }}>
              Ctrl K
            </span>
          </button>

          <div style={{ flex: 1 }} />

          <div style={{ fontSize: 'var(--fs-small)', color: 'var(--c-text-2)', fontWeight: 500, whiteSpace: 'nowrap' }}>
            {fmtDate(today, ui.dateFormat)}
          </div>

          <div ref={notifRef} style={{ position: 'relative' }}>
            <IconBtn label="Notifications" icon={<Bell size={18} />} active={notifOpen} onClick={openNotifs} />
            {unread > 0 && (
              <span style={{ position: 'absolute', top: 4, right: 4, minWidth: 16, height: 16, borderRadius: 999, background: 'var(--c-danger)', color: '#fff', fontSize: 10, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 4px' }}>
                {unread > 9 ? '9+' : unread}
              </span>
            )}
            {notifOpen && (
              <div className="anim-fade-up" style={{ position: 'absolute', right: 0, top: 40, width: 360, background: 'var(--c-surface)', border: '1px solid var(--c-border)', borderRadius: 'var(--r-lg)', boxShadow: 'var(--shadow-lg)', zIndex: 50, overflow: 'hidden' }}>
                <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--c-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <strong style={{ fontSize: 'var(--fs-body)' }}>Notifications</strong>
                  <button
                    style={{ fontSize: 'var(--fs-caption)', color: 'var(--c-primary)', fontWeight: 600 }}
                    onClick={async () => {
                      await api('notifications.markAllRead').catch(() => undefined);
                      setNotifs((n) => n.map((x) => ({ ...x, readAt: new Date().toISOString() })));
                      refreshUnread();
                    }}
                  >
                    Mark all read
                  </button>
                </div>
                <div style={{ maxHeight: 380, overflowY: 'auto' }}>
                  {notifs.length === 0 && <div style={{ padding: 24, textAlign: 'center', color: 'var(--c-text-3)', fontSize: 'var(--fs-small)' }}>No notifications</div>}
                  {notifs.slice(0, 30).map((n) => (
                    <button
                      key={n.id}
                      style={{ display: 'block', width: '100%', textAlign: 'left', padding: '10px 14px', borderBottom: '1px solid var(--c-border)', background: n.readAt ? 'transparent' : 'var(--c-primary-subtle)', fontSize: 'var(--fs-small)' }}
                      onClick={async () => {
                        await api('notifications.markRead', { id: n.id }).catch(() => undefined);
                        setNotifOpen(false);
                        refreshUnread();
                        if (n.link) navigate(n.link);
                      }}
                    >
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <span
                          style={{
                            width: 8,
                            height: 8,
                            borderRadius: 999,
                            flexShrink: 0,
                            background:
                              n.severity === 'critical' ? 'var(--c-danger)' : n.severity === 'warning' ? 'var(--c-warning)' : n.severity === 'success' ? 'var(--c-success)' : 'var(--c-info)',
                          }}
                        />
                        <strong style={{ fontWeight: 600 }}>{n.title}</strong>
                      </div>
                      {n.body && <div style={{ color: 'var(--c-text-2)', marginTop: 2, paddingLeft: 16 }}>{n.body}</div>}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div ref={userRef} style={{ position: 'relative' }}>
            <button
              onClick={() => setUserOpen((o) => !o)}
              style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '5px 10px 5px 5px', borderRadius: 'var(--r-md)', border: '1px solid var(--c-border)', background: 'var(--c-surface)', transition: 'background var(--t-fast)' }}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--c-surface-2)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'var(--c-surface)')}
            >
              <span style={{ width: 30, height: 30, borderRadius: 8, background: 'var(--c-primary)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 13 }}>
                {session?.user.displayName?.slice(0, 1).toUpperCase() ?? '?'}
              </span>
              <span style={{ textAlign: 'left', lineHeight: 1.2 }}>
                <span style={{ display: 'block', fontWeight: 600, fontSize: 12.5, maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {session?.user.displayName}
                </span>
                <span style={{ display: 'block', fontSize: 10.5, color: 'var(--c-text-3)' }}>{session?.user.roles[0]}</span>
              </span>
            </button>
            {userOpen && (
              <div className="anim-fade-up" style={{ position: 'absolute', right: 0, top: 46, width: 220, background: 'var(--c-surface)', border: '1px solid var(--c-border)', borderRadius: 'var(--r-lg)', boxShadow: 'var(--shadow-lg)', zIndex: 50, overflow: 'hidden', padding: 6 }}>
                <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--c-border)' }}>
                  <div style={{ fontWeight: 650, fontSize: 'var(--fs-body)' }}>{session?.user.displayName}</div>
                  <div style={{ fontSize: 'var(--fs-caption)', color: 'var(--c-text-3)' }}>@{session?.user.username} · {session?.user.roles.join(', ')}</div>
                </div>
                <button style={{ display: 'flex', gap: 10, alignItems: 'center', width: '100%', padding: '9px 12px', borderRadius: 'var(--r-md)', fontSize: 'var(--fs-body)', color: 'var(--c-text-2)' }} onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--c-surface-2)')} onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')} onClick={() => setUserOpen(false)} title="Signed in.">
                  <ShieldCheck size={16} /> Account secured
                </button>
                <button
                  style={{ display: 'flex', gap: 10, alignItems: 'center', width: '100%', padding: '9px 12px', borderRadius: 'var(--r-md)', fontSize: 'var(--fs-body)', color: 'var(--c-text-2)' }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--c-surface-2)')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                  onClick={async () => {
                    setUserOpen(false);
                    await lock();
                  }}
                >
                  <Lock size={16} /> Lock app <span style={{ marginLeft: 'auto', fontSize: 10.5, color: 'var(--c-text-3)' }}>Ctrl L</span>
                </button>
                <button
                  style={{ display: 'flex', gap: 10, alignItems: 'center', width: '100%', padding: '9px 12px', borderRadius: 'var(--r-md)', fontSize: 'var(--fs-body)', color: 'var(--c-danger)' }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--c-danger-subtle)')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                  onClick={async () => {
                    setUserOpen(false);
                    await logout();
                    navigate('/login');
                  }}
                >
                  <LogOut size={16} /> Sign out
                </button>
              </div>
            )}
          </div>
        </header>

        <main style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', background: 'var(--c-bg)' }}>{children}</main>
      </div>
    </div>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: React.ReactNode; subtitle?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 18, flexWrap: 'wrap' }}>
      <div>
        <h1 style={{ fontSize: 'var(--fs-h1)', fontWeight: 700, letterSpacing: '-0.01em' }}>{title}</h1>
        {subtitle && <div style={{ color: 'var(--c-text-2)', fontSize: 'var(--fs-small)', marginTop: 3 }}>{subtitle}</div>}
      </div>
      {actions && <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>{actions}</div>}
    </div>
  );
}
