import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CalendarDays, Users2, Wallet, Receipt, Stethoscope, Boxes, AlertTriangle, ArrowUpRight } from 'lucide-react';
import { api } from '../lib/api';
import { useApp } from '../context/AppContext';
import { StatCard, Card, Badge, Loading, ErrorState } from '../components/ui';
import { fmtMoney } from '@shared/money';
import { fmtDate, fmtTime } from '@shared/date';
import { APPOINTMENT_STATUS_LABEL } from '@shared/constants';

interface Dash {
  today: string;
  stats: {
    todayAppointments: number;
    completedToday: number;
    noShowsToday: number;
    waitingQueue: number;
    inTreatmentQueue: number;
    revenueTodayPaise: number;
    outstandingDuesPaise: number;
    visitsToday: number;
    lowStock: number;
    expiringSoon: number;
  };
  appointmentsByStatus: Array<{ status: string; count: number }>;
  recentPayments: Array<{ code: string; patientName: string; amountPaise: number; method: string; paymentDate: string }>;
  recentPatients: Array<{ id: number; code: string; fullName: string; phone: string; createdAt: string }>;
  upcoming: Array<{ id: number; code: string; startTime: string; status: string; patientName: string; dentistName: string | null }>;
  revenueTrend: Array<{ date: string; incomePaise: number; expensePaise: number }>;
  methodBreakdown: Array<{ method: string; amountPaise: number; count: number }>;
  treatmentStats: Array<{ name: string; count: number; totalPaise: number }>;
}

export function Dashboard() {
  const { ui } = useApp();
  const navigate = useNavigate();
  const [d, setD] = useState<Dash | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    api<Dash>('dashboard.get')
      .then(setD)
      .catch((e) => setError(String((e as Error)?.message ?? e)));
  }, []);

  useEffect(load, [load]);

  if (error) return <div style={{ padding: 24 }}><ErrorState message={error} onRetry={load} /></div>;
  if (!d) return <div style={{ padding: 24 }}><Loading label="Loading dashboard…" /></div>;

  const s = d.stats;
  const maxTrend = Math.max(1, ...d.revenueTrend.map((t) => Math.max(t.incomePaise, t.expensePaise)));

  return (
    <div style={{ padding: 22, maxWidth: 1280, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 18, flexWrap: 'wrap', gap: 8 }}>
        <div>
          <h1 style={{ fontSize: 'var(--fs-h1)', fontWeight: 700, letterSpacing: '-0.01em' }}>Good to see you</h1>
          <div style={{ color: 'var(--c-text-2)', fontSize: 'var(--fs-small)', marginTop: 2 }}>
            {fmtDate(d.today, ui.dateFormat)} — {d.upcoming.length ? `${d.upcoming.length} appointment${d.upcoming.length === 1 ? '' : 's'} scheduled today` : 'no more appointments scheduled today'}
          </div>
        </div>
      </div>

      {/* stat row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14, marginBottom: 18 }}>
        <StatCard label="Appointments today" value={s.todayAppointments} sub={`${s.completedToday} completed · ${s.noShowsToday} no-show`} icon={<CalendarDays size={19} />} tone="info" onClick={() => navigate('/appointments')} />
        <StatCard label="Visits today" value={s.visitsToday} sub={`${s.waitingQueue} waiting · ${s.inTreatmentQueue} in treatment`} icon={<Stethoscope size={19} />} onClick={() => navigate('/queue')} />
        <StatCard label="Revenue today" value={fmtMoney(s.revenueTodayPaise, ui.currencySymbol)} sub="collected payments" icon={<Wallet size={19} />} tone="success" onClick={() => navigate('/payments')} />
        <StatCard label="Outstanding dues" value={fmtMoney(s.outstandingDuesPaise, ui.currencySymbol)} sub="unpaid invoice balance" icon={<Receipt size={19} />} tone={s.outstandingDuesPaise > 0 ? 'warning' : 'default'} onClick={() => navigate('/invoices')} />
        <StatCard label="Low stock" value={s.lowStock} sub={s.expiringSoon ? `${s.expiringSoon} expiring soon` : 'inventory OK'} icon={s.lowStock ? <AlertTriangle size={19} /> : <Boxes size={19} />} tone={s.lowStock ? 'warning' : 'default'} onClick={() => navigate('/inventory')} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 14 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, minWidth: 0 }}>
          {/* revenue trend */}
          <Card>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <strong style={{ fontSize: 'var(--fs-body)' }}>Income & expenses — last 14 days</strong>
              <div style={{ display: 'flex', gap: 12, fontSize: 'var(--fs-caption)', color: 'var(--c-text-3)' }}>
                <span style={{ display: 'flex', gap: 5, alignItems: 'center' }}><span style={{ width: 10, height: 10, borderRadius: 3, background: 'var(--c-primary)', display: 'inline-block' }} /> Income</span>
                <span style={{ display: 'flex', gap: 5, alignItems: 'center' }}><span style={{ width: 10, height: 10, borderRadius: 3, background: '#f59e0b', display: 'inline-block' }} /> Expense</span>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 150 }}>
              {d.revenueTrend.map((t) => (
                <div key={t.date} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, height: '100%', justifyContent: 'flex-end' }} title={`${fmtDate(t.date, ui.dateFormat)}\nIncome: ${fmtMoney(t.incomePaise, ui.currencySymbol)}\nExpense: ${fmtMoney(t.expensePaise, ui.currencySymbol)}`}>
                  <div style={{ display: 'flex', gap: 2, alignItems: 'flex-end', width: '100%', justifyContent: 'center', flex: 1 }}>
                    <div style={{ width: '38%', maxWidth: 16, background: 'var(--c-primary)', borderRadius: '3px 3px 0 0', height: `${(t.incomePaise / maxTrend) * 100}%`, minHeight: t.incomePaise > 0 ? 3 : 0 }} />
                    <div style={{ width: '38%', maxWidth: 16, background: '#f59e0b', borderRadius: '3px 3px 0 0', height: `${(t.expensePaise / maxTrend) * 100}%`, minHeight: t.expensePaise > 0 ? 3 : 0 }} />
                  </div>
                  <span style={{ fontSize: 9, color: 'var(--c-text-3)', fontWeight: 600 }}>{t.date.slice(8)}/{t.date.slice(5, 7)}</span>
                </div>
              ))}
            </div>
          </Card>

          {/* recent payments */}
          <Card>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <strong style={{ fontSize: 'var(--fs-body)' }}>Recent payments</strong>
              <button style={{ fontSize: 'var(--fs-caption)', color: 'var(--c-primary)', fontWeight: 600, display: 'flex', gap: 3, alignItems: 'center' }} onClick={() => navigate('/payments')}>
                View all <ArrowUpRight size={13} />
              </button>
            </div>
            {d.recentPayments.length === 0 && <div style={{ color: 'var(--c-text-3)', fontSize: 'var(--fs-small)', padding: '8px 0' }}>No payments recorded yet.</div>}
            {d.recentPayments.map((p, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 0', borderBottom: i < d.recentPayments.length - 1 ? '1px solid var(--c-border)' : 'none' }}>
                <span style={{ width: 32, height: 32, borderRadius: 9, background: 'var(--c-success-subtle, #dcfce7)', color: 'var(--c-success)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 700 }}>৳</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 'var(--fs-body)', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.patientName}</div>
                  <div style={{ fontSize: 'var(--fs-caption)', color: 'var(--c-text-3)' }}>{p.code} · {p.method} · {fmtDate(p.paymentDate, ui.dateFormat)}</div>
                </div>
                <strong style={{ fontSize: 'var(--fs-body)' }}>{fmtMoney(p.amountPaise, ui.currencySymbol)}</strong>
              </div>
            ))}
          </Card>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, minWidth: 0 }}>
          {/* upcoming */}
          <Card>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <strong style={{ fontSize: 'var(--fs-body)' }}>Upcoming today</strong>
              <button style={{ fontSize: 'var(--fs-caption)', color: 'var(--c-primary)', fontWeight: 600, display: 'flex', gap: 3, alignItems: 'center' }} onClick={() => navigate('/appointments')}>
                Calendar <ArrowUpRight size={13} />
              </button>
            </div>
            {d.upcoming.length === 0 && <div style={{ color: 'var(--c-text-3)', fontSize: 'var(--fs-small)', padding: '8px 0' }}>Nothing scheduled after this point.</div>}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {d.upcoming.map((a) => (
                <div key={a.id} style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                  <div style={{ textAlign: 'center', minWidth: 44 }}>
                    <div style={{ fontSize: 'var(--fs-body)', fontWeight: 700 }}>{fmtTime(a.startTime, ui.timeFormat === '24h')}</div>
                  </div>
                  <div style={{ width: 1, height: 30, background: 'var(--c-border)' }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 'var(--fs-body)', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.patientName}</div>
                    <div style={{ fontSize: 'var(--fs-caption)', color: 'var(--c-text-3)' }}>{a.dentistName ?? '—'}</div>
                  </div>
                  <Badge tone={a.status === 'completed' ? 'success' : a.status === 'arrived' || a.status === 'waiting' ? 'warning' : 'info'}>
                    {APPOINTMENT_STATUS_LABEL[a.status] ?? a.status}
                  </Badge>
                </div>
              ))}
            </div>
          </Card>

          {/* payment methods */}
          <Card>
            <strong style={{ fontSize: 'var(--fs-body)' }}>Payment methods — 30 days</strong>
            {d.methodBreakdown.length === 0 && <div style={{ color: 'var(--c-text-3)', fontSize: 'var(--fs-small)', padding: '10px 0' }}>No payments in the last 30 days.</div>}
            <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {d.methodBreakdown.slice(0, 5).map((m) => {
                const max = Math.max(...d.methodBreakdown.map((x) => x.amountPaise), 1);
                return (
                  <div key={m.method}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--fs-small)', marginBottom: 3 }}>
                      <span style={{ fontWeight: 600, textTransform: 'capitalize' }}>{m.method}</span>
                      <span style={{ color: 'var(--c-text-2)' }}>{fmtMoney(m.amountPaise, ui.currencySymbol)}</span>
                    </div>
                    <div style={{ height: 6, background: 'var(--c-surface-2)', borderRadius: 999, overflow: 'hidden' }}>
                      <div style={{ width: `${(m.amountPaise / max) * 100}%`, height: '100%', background: 'var(--c-primary)', borderRadius: 999 }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>

          {/* top treatments */}
          <Card>
            <strong style={{ fontSize: 'var(--fs-body)' }}>Top treatments — 30 days</strong>
            {d.treatmentStats.length === 0 && <div style={{ color: 'var(--c-text-3)', fontSize: 'var(--fs-small)', padding: '10px 0' }}>No treatments recorded yet.</div>}
            <div style={{ marginTop: 10 }}>
              {d.treatmentStats.slice(0, 5).map((t, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 0', borderBottom: '1px solid var(--c-border)' }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 'var(--fs-body)', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.name}</div>
                    <div style={{ fontSize: 'var(--fs-caption)', color: 'var(--c-text-3)' }}>{t.count}× performed</div>
                  </div>
                  <span style={{ fontSize: 'var(--fs-small)', color: 'var(--c-text-2)', fontWeight: 600 }}>{fmtMoney(t.totalPaise, ui.currencySymbol)}</span>
                </div>
              ))}
            </div>
          </Card>

          {/* new patients */}
          <Card>
            <strong style={{ fontSize: 'var(--fs-body)' }}>Newest patients</strong>
            <div style={{ marginTop: 10 }}>
              {d.recentPatients.map((p, i) => (
                <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 0', borderBottom: i < d.recentPatients.length - 1 ? '1px solid var(--c-border)' : 'none', cursor: 'pointer' }} onClick={() => navigate(`/patients/${p.id}`)}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 'var(--fs-body)', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.fullName}</div>
                    <div style={{ fontSize: 'var(--fs-caption)', color: 'var(--c-text-3)' }}>{p.code}{p.phone ? ` · ${p.phone}` : ''}</div>
                  </div>
                  <Users2 size={14} style={{ color: 'var(--c-text-3)' }} />
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
