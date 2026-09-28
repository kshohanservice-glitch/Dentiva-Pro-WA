import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Lock, KeyRound, ShieldCheck } from 'lucide-react';
import { api, ApiError } from '../lib/api';
import { Button, Field, Input } from '../components/ui';
import { APP_VERSION } from '@shared/constants';

function BrandPanel({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div style={{ flex: 1, background: 'linear-gradient(160deg, #0d1f26 0%, #10333c 55%, #0f766e 160%)', color: '#fff', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: '48px 44px', minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <img src="./icon/icon.png" alt="Dentiva Pro" style={{ width: 44, height: 44, borderRadius: 12 }} />
        <div>
          <div style={{ fontWeight: 700, fontSize: 19 }}>Dentiva Pro</div>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)' }}>Dental Practice Management</div>
        </div>
      </div>
      <div>
        <h2 style={{ fontSize: 30, fontWeight: 700, lineHeight: 1.25, maxWidth: 420 }}>{title}</h2>
        <p style={{ marginTop: 14, color: 'rgba(255,255,255,0.65)', fontSize: 14.5, maxWidth: 400, lineHeight: 1.6 }}>{subtitle}</p>
      </div>
      <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>
        Version {APP_VERSION} · Works completely offline · Data stays on this computer
      </div>
    </div>
  );
}

export function ActivationScreen() {
  const navigate = useNavigate();
  const [code, setCode] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr('');
    try {
      await api('activation.activate', { code });
      navigate('/setup');
    } catch (ex) {
      setErr(ex instanceof ApiError ? ex.message : 'Activation failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ display: 'flex', height: '100%' }}>
      <BrandPanel title="Activate Dentiva Pro" subtitle="Enter the activation code from your license to begin. This one-time step is required and works entirely offline." />
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 32, background: 'var(--c-bg)' }}>
        <form onSubmit={submit} style={{ width: '100%', maxWidth: 420, display: 'flex', flexDirection: 'column', gap: 18 }} className="anim-fade-up">
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <span style={{ width: 44, height: 44, borderRadius: 12, background: 'var(--c-primary-subtle)', color: 'var(--c-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <KeyRound size={22} />
            </span>
            <div>
              <h1 style={{ fontSize: 20, fontWeight: 700 }}>Enter activation code</h1>
              <div style={{ fontSize: 'var(--fs-small)', color: 'var(--c-text-2)' }}>The code was provided with your Dentiva Pro license.</div>
            </div>
          </div>
          <Field label="Activation code" required error={err}>
            <Input
              inputMode="numeric"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 16))}
              placeholder="16-digit code"
              autoFocus
              error={!!err}
              style={{ letterSpacing: '0.12em', fontWeight: 600, fontSize: 15, textAlign: 'center' }}
            />
          </Field>
          <Button type="submit" size="lg" loading={busy} style={{ width: '100%' }}>
            Activate
          </Button>
          <div style={{ fontSize: 'var(--fs-caption)', color: 'var(--c-text-3)', lineHeight: 1.6 }}>
            Activation is verified locally on this machine. No internet connection is needed, and the code is never transmitted or stored in plain text.
          </div>
        </form>
      </div>
    </div>
  );
}

export function LoginScreen({ lockedMode }: { lockedMode?: boolean }) {
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr('');
    try {
      if (lockedMode) {
        await api('auth.unlock', { password });
        navigate('/');
      } else {
        await api('auth.login', { username, password });
        navigate('/');
      }
    } catch (ex) {
      setErr(ex instanceof ApiError ? ex.message : 'Sign-in failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ display: 'flex', height: '100%' }}>
      <BrandPanel
        title={lockedMode ? 'The application is locked' : 'Welcome back'}
        subtitle={
          lockedMode
            ? 'Enter your password to resume your session. Your data has been hidden while the app was idle.'
            : 'Sign in to your clinic workspace. Every action is recorded and protected by role-based permissions.'
        }
      />
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 32, background: 'var(--c-bg)' }}>
        <form onSubmit={submit} style={{ width: '100%', maxWidth: 400, display: 'flex', flexDirection: 'column', gap: 16 }} className="anim-fade-up">
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <span style={{ width: 44, height: 44, borderRadius: 12, background: 'var(--c-primary-subtle)', color: 'var(--c-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Lock size={21} />
            </span>
            <div>
              <h1 style={{ fontSize: 20, fontWeight: 700 }}>{lockedMode ? 'Unlock' : 'Sign in'}</h1>
              <div style={{ fontSize: 'var(--fs-small)', color: 'var(--c-text-2)' }}>
                {lockedMode ? 'Your session is preserved — just enter your password.' : 'Use your clinic account credentials.'}
              </div>
            </div>
          </div>
          {lockedMode ? (
            <Field label="Password" required error={err}>
              <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoFocus error={!!err} placeholder="Your password" />
            </Field>
          ) : (
            <>
              <Field label="Username" required>
                <Input value={username} onChange={(e) => setUsername(e.target.value)} autoFocus placeholder="e.g. admin" autoComplete="username" />
              </Field>
              <Field label="Password" required error={err}>
                <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} error={!!err} placeholder="Your password" autoComplete="current-password" />
              </Field>
            </>
          )}
          <Button type="submit" size="lg" loading={busy} style={{ width: '100%' }}>
            {lockedMode ? 'Unlock' : 'Sign in'}
          </Button>
          <div style={{ fontSize: 'var(--fs-caption)', color: 'var(--c-text-3)', display: 'flex', gap: 6, alignItems: 'center' }}>
            <ShieldCheck size={13} /> Passwords are protected with a strong scrypt key-derivation and are never stored in plain text.
          </div>
        </form>
      </div>
    </div>
  );
}
