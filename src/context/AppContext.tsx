import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../lib/api';
import type { SessionInfo, AppInfo } from '@shared/types';

interface UiSettings {
  dateFormat: string;
  timeFormat: string;
  numberingSystem: 'fdi' | 'universal';
  currencySymbol: string;
  autoLockMinutes: number;
  allowNegativeStock: boolean;
}

interface AppState {
  session: SessionInfo | null;
  info: AppInfo | null;
  ui: UiSettings;
  refreshSession: () => Promise<void>;
  logout: () => Promise<void>;
  lock: () => Promise<void>;
  refreshInfo: () => Promise<void>;
}

const Ctx = createContext<AppState | null>(null);

const DEFAULT_UI: UiSettings = {
  dateFormat: 'DD/MM/YYYY',
  timeFormat: '24h',
  numberingSystem: 'fdi',
  currencySymbol: '৳',
  autoLockMinutes: 15,
  allowNegativeStock: false,
};

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [info, setInfo] = useState<AppInfo | null>(null);
  const [ui, setUi] = useState<UiSettings>(DEFAULT_UI);
  const activitySent = useRef(0);

  const loadUi = useCallback(async () => {
    try {
      const u = await api<UiSettings>('app.getUiSettings');
      setUi({ ...DEFAULT_UI, ...u });
    } catch {
      /* pre-login: defaults */
    }
  }, []);

  const refreshSession = useCallback(async () => {
    try {
      const s = await api<SessionInfo | null>('auth.info');
      setSession(s);
      if (s) await loadUi();
    } catch {
      setSession(null);
    }
  }, [loadUi]);

  const refreshInfo = useCallback(async () => {
    try {
      setInfo(await api<AppInfo>('app.info'));
    } catch {
      /* ignore */
    }
  }, []);

  const logout = useCallback(async () => {
    await api('auth.logout').catch(() => undefined);
    setSession(null);
  }, []);

  const lock = useCallback(async () => {
    await api('auth.lock').catch(() => undefined);
    setSession((s) => (s ? { ...s, locked: true } : s));
  }, []);

  useEffect(() => {
    refreshSession();
    refreshInfo();
    const offLocked = window.dentiva.on('session:locked', () => {
      setSession((s) => (s ? { ...s, locked: true } : s));
    });
    // activity beacon for auto-lock (throttled)
    const send = () => {
      const now = Date.now();
      if (now - activitySent.current > 4000) {
        activitySent.current = now;
        window.dentiva.activity();
      }
    };
    window.addEventListener('mousemove', send, { passive: true });
    window.addEventListener('keydown', send);
    window.addEventListener('click', send);
    return () => {
      offLocked();
      window.removeEventListener('mousemove', send);
      window.removeEventListener('keydown', send);
      window.removeEventListener('click', send);
    };
  }, [refreshSession, refreshInfo]);

  const value = useMemo(
    () => ({ session, info, ui, refreshSession, logout, lock, refreshInfo }),
    [session, info, ui, refreshSession, logout, lock, refreshInfo],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp(): AppState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useApp outside provider');
  return v;
}
