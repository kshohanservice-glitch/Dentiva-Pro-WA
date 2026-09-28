import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AppProvider, useApp } from './context/AppContext';
import { ToastProvider, Loading } from './components/ui';
import { Shell } from './components/Shell';
import { api } from './lib/api';
import { ActivationScreen, LoginScreen } from './pages/AuthScreens';

function Center({ children }: { children: ReactNode }) {
  return <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{children}</div>;
}
import { SetupWizard } from './pages/SetupWizard';
import { Dashboard } from './pages/Dashboard';
import { Patients } from './pages/Patients';
import { PatientProfile } from './pages/PatientProfile';
import { Appointments } from './pages/Appointments';
import { Queue } from './pages/Queue';
import { Treatments } from './pages/Treatments';
import { Prescriptions } from './pages/Prescriptions';
import { Invoices } from './pages/Invoices';
import { Payments } from './pages/Payments';
import { Inventory } from './pages/Inventory';
import { Accounting } from './pages/Accounting';
import { Staff } from './pages/Staff';
import { Backup } from './pages/Backup';
import { Settings } from './pages/Settings';
import { About } from './pages/About';
import { Search } from './pages/Search';
import { Audit } from './pages/Audit';
import { Notifications } from './pages/Notifications';

type Gate = 'loading' | 'activation' | 'setup' | 'login' | 'locked' | 'app';

function Router() {
  const { session } = useApp();
  const [gate, setGate] = useState<Gate>('loading');

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const info = await api<{ activated: boolean; setupComplete: boolean }>('app.info');
        if (!alive) return;
        if (!info.activated) setGate('activation');
        else if (!info.setupComplete) setGate('setup');
        else setGate('app'); // session state decided below from context
      } catch {
        if (alive) setGate('login');
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  if (gate === 'loading') return <Center><Loading label="Starting…" /></Center>;
  if (gate === 'activation') return <ActivationScreen />;
  if (gate === 'setup') return <SetupWizard />;

  // gate === 'app'
  const signedIn = !!session && !session.locked;
  if (!session) return <LoginScreen />;
  if (session.locked) return <LoginScreen lockedMode />;
  if (!signedIn) return <Center><Loading /></Center>;

  return (
    <Shell>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/patients" element={<Patients />} />
        <Route path="/patients/:id" element={<PatientProfile />} />
        <Route path="/appointments" element={<Appointments />} />
        <Route path="/queue" element={<Queue />} />
        <Route path="/treatments" element={<Treatments />} />
        <Route path="/prescriptions" element={<Prescriptions />} />
        <Route path="/invoices" element={<Invoices />} />
        <Route path="/payments" element={<Payments />} />
        <Route path="/inventory" element={<Inventory />} />
        <Route path="/accounting" element={<Accounting />} />
        <Route path="/staff" element={<Staff />} />
        <Route path="/backup" element={<Backup />} />
        <Route path="/audit" element={<Audit />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/about" element={<About />} />
        <Route path="/search" element={<Search />} />
        <Route path="/notifications" element={<Notifications />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Shell>
  );
}

export default function App() {
  return (
    <AppProvider>
      <ToastProvider>
        <HashRouter>
          <Router />
        </HashRouter>
      </ToastProvider>
    </AppProvider>
  );
}
