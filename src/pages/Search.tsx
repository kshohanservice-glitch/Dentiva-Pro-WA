import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search as SearchIcon, Users2, CalendarDays, Receipt, Wallet, FlaskConical, Stethoscope, Boxes } from 'lucide-react';
import { api } from '../lib/api';
import { useApp } from '../context/AppContext';
import { PageHeader } from '../components/Shell';
import { Card, Badge, Input, EmptyState } from '../components/ui';
import { fmtMoney } from '@shared/money';
import { fmtDate } from '@shared/date';
import { APPOINTMENT_STATUS_LABEL } from '@shared/constants';

interface Results {
  patients: Array<{ id: number; code: string; fullName: string; phone: string; gender: string; bloodGroup: string; age: number | null; match: string }>;
  appointments: Array<{ id: number; code: string; patientName: string; apptDate: string; startTime: string; status: string; match: string }>;
  invoices: Array<{ id: number; number: string; patientName: string; totalPaise: number; status: string; invoiceDate: string; match: string }>;
  payments: Array<{ id: number; code: string; patientName: string; amountPaise: number; method: string; paymentDate: string; match: string }>;
  prescriptions: Array<{ id: number; code: string; patientName: string; createdAt: string; match: string }>;
  treatments: Array<{ id: number; code: string; name: string; category: string; match: string }>;
  inventory: Array<{ id: number; sku: string; name: string; stockQuantity: number; match: string }>;
  total: number;
}

const EMPTY_RESULTS: Results = { patients: [], appointments: [], invoices: [], payments: [], prescriptions: [], treatments: [], inventory: [], total: 0 };

export function Search() {
  const navigate = useNavigate();
  const { ui } = useApp();
  const [q, setQ] = useState('');
  const [results, setResults] = useState<Results | null>(null);
  const [searched, setSearched] = useState(false);
  const [incl, setIncl] = useState<Record<string, boolean>>({
    patients: true, appointments: true, invoices: true, payments: true, prescriptions: true, treatments: true, inventory: true,
  });
  const [gender, setGender] = useState('');
  const [blood, setBlood] = useState('');
  const [ageMin, setAgeMin] = useState('');
  const [ageMax, setAgeMax] = useState('');

  const run = () => {
    if (q.trim().length < 2) {
      setResults(null);
      setSearched(false);
      return;
    }
    setResults(null);
    api<Results>(
      'search.global',
      {
        q: q.trim(),
        include: {
          patients: incl.patients, appointments: incl.appointments, invoices: incl.invoices, payments: incl.payments,
          prescriptions: incl.prescriptions, treatments: incl.treatments, inventory: incl.inventory,
        },
        patientFilters: {
          gender: gender || undefined,
          bloodGroup: blood || undefined,
          ageMin: ageMin ? Number(ageMin) : undefined,
          ageMax: ageMax ? Number(ageMax) : undefined,
        },
      },
    )
      .then((r) => { setResults(r); setSearched(true); })
      .catch(() => { setResults(EMPTY_RESULTS); setSearched(true); });
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        navigate('/search');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [navigate]);

  const Section = ({ title, icon, count, children }: { title: string; icon: React.ReactNode; count: number; children: React.ReactNode }) => (
    <Card>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: count ? 10 : 0 }}>
        <span style={{ color: 'var(--c-text-3)' }}>{icon}</span>
        <strong style={{ fontSize: 'var(--fs-body)' }}>{title}</strong>
        <Badge tone="muted">{count}</Badge>
      </div>
      {count ? children : <div style={{ color: 'var(--c-text-3)', fontSize: 'var(--fs-small)' }}>No matches.</div>}
    </Card>
  );

  return (
    <div style={{ padding: 22, maxWidth: 1100, margin: '0 auto' }}>
      <PageHeader title="Global search" subtitle="Find patients, appointments, invoices, payments, prescriptions, treatments and stock in one place" />

      <Card style={{ padding: 16, marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <div style={{ position: 'relative', flex: '1 1 340px' }}>
            <SearchIcon size={15} style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: 'var(--c-text-3)' }} />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && run()}
              placeholder="Search name, code, phone, invoice no., reference… (min. 2 characters)"
              style={{ paddingLeft: 34 }}
              autoFocus
            />
          </div>
          <ButtonSearch onClick={run}>Search</ButtonSearch>
        </div>
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginTop: 12, alignItems: 'center' }}>
          {Object.entries({ patients: 'Patients', appointments: 'Appointments', invoices: 'Invoices', payments: 'Payments', prescriptions: 'Prescriptions', treatments: 'Treatments', inventory: 'Inventory' }).map(([k, label]) => (
            <label key={k} style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 'var(--fs-small)', color: 'var(--c-text-2)', cursor: 'pointer' }}>
              <input type="checkbox" checked={incl[k]} onChange={(e) => setIncl((x) => ({ ...x, [k]: e.target.checked }))} style={{ width: 14, height: 14, accentColor: 'var(--c-primary)' }} />
              {label}
            </label>
          ))}
          <span style={{ width: 1, height: 20, background: 'var(--c-border)' }} />
          <SelectSm value={gender} onChange={setGender} label="Gender" options={[['', 'Any'], ['male', 'Male'], ['female', 'Female'], ['other', 'Other']]} />
          <SelectSm value={blood} onChange={setBlood} label="Blood" options={[['', 'Any'], ...['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'].map((b) => [b, b] as [string, string])]} />
          <Input type="number" placeholder="Age from" value={ageMin} onChange={(e) => setAgeMin(e.target.value)} style={{ width: 90 }} />
          <Input type="number" placeholder="Age to" value={ageMax} onChange={(e) => setAgeMax(e.target.value)} style={{ width: 90 }} />
        </div>
      </Card>

      {!results && !searched && (
        <EmptyState icon={<SearchIcon size={24} />} title="Type at least 2 characters" hint="Search covers patients, codes, phones, invoice numbers, payment references and more." />
      )}
      {!results && searched && <EmptyState icon={<SearchIcon size={24} />} title="No results" hint="Try different keywords or broaden the filters." />}

      {results && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ fontSize: 'var(--fs-small)', color: 'var(--c-text-2)', fontWeight: 600 }}>{results.total} results for “{q.trim()}”</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <Section title="Patients" icon={<Users2 size={15} />} count={results.patients.length}>
              {results.patients.map((p) => (
                <button key={p.id} onClick={() => navigate(`/patients/${p.id}`)} style={rowStyle}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 650, fontSize: 'var(--fs-body)' }}>{p.fullName}</div>
                    <div style={{ fontSize: 'var(--fs-caption)', color: 'var(--c-text-3)' }}>{p.code} {p.phone ? `· ${p.phone}` : ''} {p.age != null ? `· ${p.age} yrs` : ''} {p.bloodGroup ? `· ${p.bloodGroup}` : ''}</div>
                  </div>
                  {p.match === 'phone' && <Badge tone="info">phone</Badge>}
                  {p.match === 'code' && <Badge tone="info">code</Badge>}
                </button>
              ))}
            </Section>
            <Section title="Appointments" icon={<CalendarDays size={15} />} count={results.appointments.length}>
              {results.appointments.map((a) => (
                <button key={a.id} onClick={() => navigate('/appointments')} style={rowStyle}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 650, fontSize: 'var(--fs-body)' }}>{a.patientName}</div>
                    <div style={{ fontSize: 'var(--fs-caption)', color: 'var(--c-text-3)' }}>{a.code} · {fmtDate(a.apptDate, ui.dateFormat)} {a.startTime}</div>
                  </div>
                  <Badge tone="muted">{APPOINTMENT_STATUS_LABEL[a.status] ?? a.status}</Badge>
                </button>
              ))}
            </Section>
            <Section title="Invoices" icon={<Receipt size={15} />} count={results.invoices.length}>
              {results.invoices.map((i) => (
                <button key={i.id} onClick={() => navigate('/invoices')} style={rowStyle}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 650, fontSize: 'var(--fs-body)' }}>{i.number}</div>
                    <div style={{ fontSize: 'var(--fs-caption)', color: 'var(--c-text-3)' }}>{i.patientName} · {fmtDate(i.invoiceDate, ui.dateFormat)}</div>
                  </div>
                  <span style={{ fontWeight: 700, fontSize: 'var(--fs-small)' }}>{fmtMoney(i.totalPaise, ui.currencySymbol)}</span>
                </button>
              ))}
            </Section>
            <Section title="Payments" icon={<Wallet size={15} />} count={results.payments.length}>
              {results.payments.map((p) => (
                <button key={p.id} onClick={() => navigate('/payments')} style={rowStyle}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 650, fontSize: 'var(--fs-body)' }}>{p.code}</div>
                    <div style={{ fontSize: 'var(--fs-caption)', color: 'var(--c-text-3)' }}>{p.patientName} · {p.method} · {fmtDate(p.paymentDate, ui.dateFormat)}</div>
                  </div>
                  <span style={{ fontWeight: 700, fontSize: 'var(--fs-small)' }}>{fmtMoney(p.amountPaise, ui.currencySymbol)}</span>
                </button>
              ))}
            </Section>
            <Section title="Prescriptions" icon={<FlaskConical size={15} />} count={results.prescriptions.length}>
              {results.prescriptions.map((p) => (
                <button key={p.id} onClick={() => navigate('/prescriptions')} style={rowStyle}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 650, fontSize: 'var(--fs-body)' }}>{p.code}</div>
                    <div style={{ fontSize: 'var(--fs-caption)', color: 'var(--c-text-3)' }}>{p.patientName} · {fmtDate(p.createdAt, ui.dateFormat)}</div>
                  </div>
                </button>
              ))}
            </Section>
            <Section title="Treatments" icon={<Stethoscope size={15} />} count={results.treatments.length}>
              {results.treatments.map((t) => (
                <button key={t.id} onClick={() => navigate('/treatments')} style={rowStyle}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 650, fontSize: 'var(--fs-body)' }}>{t.name}</div>
                    <div style={{ fontSize: 'var(--fs-caption)', color: 'var(--c-text-3)' }}>{t.code} {t.category ? `· ${t.category}` : ''}</div>
                  </div>
                </button>
              ))}
            </Section>
            <Section title="Inventory" icon={<Boxes size={15} />} count={results.inventory.length}>
              {results.inventory.map((i) => (
                <button key={i.id} onClick={() => navigate('/inventory')} style={rowStyle}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 650, fontSize: 'var(--fs-body)' }}>{i.name}</div>
                    <div style={{ fontSize: 'var(--fs-caption)', color: 'var(--c-text-3)' }}>{i.sku || 'no SKU'}</div>
                  </div>
                  <span style={{ fontSize: 'var(--fs-small)', color: 'var(--c-text-2)' }}>{i.stockQuantity} in stock</span>
                </button>
              ))}
            </Section>
          </div>
        </div>
      )}
    </div>
  );
}

const rowStyle: React.CSSProperties = {
  display: 'flex',
  gap: 10,
  alignItems: 'center',
  justifyContent: 'space-between',
  width: '100%',
  textAlign: 'left',
  padding: '9px 10px',
  borderRadius: 'var(--r-md)',
  borderBottom: '1px solid var(--c-border)',
};

function ButtonSearch({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        background: 'var(--c-primary)',
        color: '#fff',
        fontWeight: 700,
        fontSize: 'var(--fs-body)',
        padding: '9px 22px',
        borderRadius: 'var(--r-md)',
        display: 'flex',
        gap: 8,
        alignItems: 'center',
      }}
    >
      <SearchIcon size={15} />
      {children}
    </button>
  );
}

function SelectSm({ value, onChange, label, options }: { value: string; onChange: (v: string) => void; label: string; options: Array<[string, string]> }) {
  return (
    <span style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 'var(--fs-small)', color: 'var(--c-text-3)' }}>
      {label}
      <select value={value} onChange={(e) => onChange(e.target.value)} style={{ padding: '5px 8px', borderRadius: 8, border: '1px solid var(--c-border)', background: 'var(--c-surface)', fontSize: 'var(--fs-small)' }}>
        {options.map(([v, l]) => (
          <option key={v} value={v}>{l}</option>
        ))}
      </select>
    </span>
  );
}
