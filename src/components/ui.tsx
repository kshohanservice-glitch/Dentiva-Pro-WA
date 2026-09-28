import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { CSSProperties, ReactNode, InputHTMLAttributes, TextareaHTMLAttributes, SelectHTMLAttributes, ButtonHTMLAttributes, HTMLAttributes } from 'react';
import { X, AlertTriangle, CheckCircle2, Info, Loader2, AlertCircle } from 'lucide-react';

// ------------------------------------------------------------------ Button

type BtnVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'dangerOutline';

const BTN_STYLES: Record<BtnVariant, CSSProperties> = {
  primary: { background: 'var(--c-primary)', color: '#fff' },
  secondary: { background: 'var(--c-surface)', color: 'var(--c-text)', border: '1px solid var(--c-border-strong)' },
  ghost: { background: 'transparent', color: 'var(--c-text-2)' },
  danger: { background: 'var(--c-danger)', color: '#fff' },
  dangerOutline: { background: 'transparent', color: 'var(--c-danger)', border: '1px solid var(--c-danger)' },
};

export function Button({
  variant = 'primary',
  size = 'md',
  icon,
  children,
  loading,
  className,
  style,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: BtnVariant;
  size?: 'sm' | 'md' | 'lg';
  icon?: ReactNode;
  loading?: boolean;
}) {
  const h = size === 'sm' ? 30 : size === 'lg' ? 40 : 34;
  const px = size === 'sm' ? 10 : 14;
  return (
    <button
      {...rest}
      disabled={rest.disabled || loading}
      className={className}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 7,
        height: h,
        padding: `0 ${px}px`,
        borderRadius: 'var(--r-md)',
        fontWeight: 600,
        fontSize: size === 'sm' ? 12.5 : 13.5,
        transition: 'background var(--t-fast) var(--ease), box-shadow var(--t-fast) var(--ease), transform var(--t-fast)',
        border: '1px solid transparent',
        opacity: rest.disabled ? 0.55 : 1,
        cursor: rest.disabled ? 'not-allowed' : 'pointer',
        whiteSpace: 'nowrap',
        ...BTN_STYLES[variant],
        ...style,
      }}
      onMouseEnter={(e) => {
        if (!rest.disabled && !loading) {
          if (variant === 'primary') e.currentTarget.style.background = 'var(--c-primary-hover)';
          if (variant === 'secondary') e.currentTarget.style.background = 'var(--c-surface-2)';
          if (variant === 'ghost') e.currentTarget.style.background = 'var(--c-disabled-bg)';
          if (variant === 'danger') e.currentTarget.style.filter = 'brightness(1.08)';
        }
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = BTN_STYLES[variant].background as string;
        e.currentTarget.style.filter = '';
      }}
    >
      {loading ? <Loader2 size={15} style={{ animation: 'spin 0.8s linear infinite' }} /> : icon}
      {children}
    </button>
  );
}

export function IconBtn({
  label,
  icon,
  active,
  danger,
  style,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string; icon: ReactNode; active?: boolean; danger?: boolean }) {
  return (
    <button
      {...rest}
      aria-label={label}
      title={label}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 32,
        height: 32,
        borderRadius: 'var(--r-md)',
        color: danger ? 'var(--c-danger)' : active ? 'var(--c-primary)' : 'var(--c-text-2)',
        background: active ? 'var(--c-primary-subtle)' : 'transparent',
        transition: 'background var(--t-fast), color var(--t-fast)',
        flexShrink: 0,
        ...style,
      }}
      onMouseEnter={(e) => {
        if (!rest.disabled) e.currentTarget.style.background = active ? 'var(--c-primary-soft)' : 'var(--c-disabled-bg)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = active ? 'var(--c-primary-subtle)' : 'transparent';
      }}
    >
      {icon}
    </button>
  );
}

// ------------------------------------------------------------------ form controls

export function Field({ label, required, error, hint, children, className, style }: { label?: string; required?: boolean; error?: string; hint?: string; children: ReactNode; className?: string; style?: CSSProperties }) {
  return (
    <div className={className} style={{ display: 'flex', flexDirection: 'column', gap: 5, ...style }}>
      {label && (
        <label style={{ fontSize: 'var(--fs-small)', fontWeight: 600, color: 'var(--c-text-2)' }}>
          {label} {required && <span style={{ color: 'var(--c-danger)' }}>*</span>}
        </label>
      )}
      {children}
      {error ? (
        <div role="alert" style={{ fontSize: 'var(--fs-caption)', color: 'var(--c-danger)', display: 'flex', alignItems: 'center', gap: 4 }}>
          <AlertCircle size={12} /> {error}
        </div>
      ) : hint ? (
        <div style={{ fontSize: 'var(--fs-caption)', color: 'var(--c-text-3)' }}>{hint}</div>
      ) : null}
    </div>
  );
}

const controlBase: CSSProperties = {
  width: '100%',
  border: '1px solid var(--c-border-strong)',
  borderRadius: 'var(--r-md)',
  background: 'var(--c-surface)',
  padding: '0 11px',
  height: 34,
  transition: 'border-color var(--t-fast), box-shadow var(--t-fast)',
};

export function Input({ error, style, ...rest }: InputHTMLAttributes<HTMLInputElement> & { error?: boolean }) {
  return (
    <input
      {...rest}
      style={{
        ...controlBase,
        borderColor: error ? 'var(--c-danger)' : undefined,
        ...(style || {}),
      }}
      onFocus={(e) => {
        e.currentTarget.style.borderColor = error ? 'var(--c-danger)' : 'var(--c-primary)';
        e.currentTarget.style.boxShadow = 'var(--focus-ring)';
        rest.onFocus?.(e);
      }}
      onBlur={(e) => {
        e.currentTarget.style.borderColor = error ? 'var(--c-danger)' : 'var(--c-border-strong)';
        e.currentTarget.style.boxShadow = 'none';
        rest.onBlur?.(e);
      }}
    />
  );
}

export function Textarea({ error, style, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement> & { error?: boolean }) {
  return (
    <textarea
      {...rest}
      style={{
        ...controlBase,
        height: 'auto',
        padding: '8px 11px',
        minHeight: 72,
        resize: 'vertical',
        lineHeight: 1.5,
        borderColor: error ? 'var(--c-danger)' : undefined,
        ...(style || {}),
      }}
      onFocus={(e) => {
        e.currentTarget.style.borderColor = error ? 'var(--c-danger)' : 'var(--c-primary)';
        e.currentTarget.style.boxShadow = 'var(--focus-ring)';
        rest.onFocus?.(e);
      }}
      onBlur={(e) => {
        e.currentTarget.style.borderColor = error ? 'var(--c-danger)' : 'var(--c-border-strong)';
        e.currentTarget.style.boxShadow = 'none';
        rest.onBlur?.(e);
      }}
    />
  );
}

export function Select({ error, style, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement> & { error?: boolean }) {
  return (
    <select
      {...rest}
      style={{
        ...controlBase,
        appearance: 'none',
        backgroundImage:
          "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%2364748b' stroke-width='2.4' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")",
        backgroundRepeat: 'no-repeat',
        backgroundPosition: 'right 10px center',
        paddingRight: 30,
        borderColor: error ? 'var(--c-danger)' : undefined,
        ...(style || {}),
      }}
      onFocus={(e) => {
        e.currentTarget.style.borderColor = 'var(--c-primary)';
        e.currentTarget.style.boxShadow = 'var(--focus-ring)';
        rest.onFocus?.(e);
      }}
      onBlur={(e) => {
        e.currentTarget.style.borderColor = error ? 'var(--c-danger)' : 'var(--c-border-strong)';
        e.currentTarget.style.boxShadow = 'none';
        rest.onBlur?.(e);
      }}
    >
      {children}
    </select>
  );
}

export function Checkbox({ label, ...rest }: InputHTMLAttributes<HTMLInputElement> & { label: ReactNode }) {
  return (
    <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 'var(--fs-body)', userSelect: 'none' }}>
      <input type="checkbox" {...rest} style={{ width: 16, height: 16, accentColor: 'var(--c-primary)', cursor: 'pointer' }} />
      {label}
    </label>
  );
}

// ------------------------------------------------------------------ surfaces

export function Card({ children, style, pad = 18, className, ...rest }: HTMLAttributes<HTMLDivElement> & { pad?: number }) {
  return (
    <div
      {...rest}
      className={className}
      style={{
        background: 'var(--c-surface)',
        border: '1px solid var(--c-border)',
        borderRadius: 'var(--r-lg)',
        padding: pad,
        boxShadow: 'var(--shadow-sm)',
        ...style,
      }}
    >
      {children}
    </div>
  );
}

export function StatCard({ label, value, sub, icon, tone = 'default', onClick }: { label: string; value: ReactNode; sub?: ReactNode; icon?: ReactNode; tone?: 'default' | 'success' | 'warning' | 'danger' | 'info'; onClick?: () => void }) {
  const tones: Record<string, [string, string]> = {
    default: ['var(--c-surface)', 'var(--c-text)'],
    success: ['var(--c-success-subtle)', 'var(--c-success)'],
    warning: ['var(--c-warning-subtle)', 'var(--c-warning)'],
    danger: ['var(--c-danger-subtle)', 'var(--c-danger)'],
    info: ['var(--c-info-subtle)', 'var(--c-info)'],
  };
  const [bg, fg] = tones[tone];
  return (
    <div
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      onKeyDown={(e) => {
        if (onClick && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault();
          onClick();
        }
      }}
      style={{
        background: 'var(--c-surface)',
        border: '1px solid var(--c-border)',
        borderRadius: 'var(--r-lg)',
        padding: '14px 16px',
        boxShadow: 'var(--shadow-sm)',
        cursor: onClick ? 'pointer' : 'default',
        transition: 'box-shadow var(--t-fast) var(--ease), transform var(--t-fast) var(--ease)',
        display: 'flex',
        gap: 12,
        alignItems: 'flex-start',
      }}
      onMouseEnter={(e) => {
        if (onClick) {
          e.currentTarget.style.boxShadow = 'var(--shadow-md)';
          e.currentTarget.style.transform = 'translateY(-1px)';
        }
      }}
      onMouseLeave={(e) => {
        if (onClick) {
          e.currentTarget.style.boxShadow = 'var(--shadow-sm)';
          e.currentTarget.style.transform = 'none';
        }
      }}
    >
      {icon && (
        <div style={{ width: 36, height: 36, borderRadius: 10, background: bg, color: fg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          {icon}
        </div>
      )}
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 'var(--fs-caption)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--c-text-3)' }}>{label}</div>
        <div style={{ fontSize: 20, fontWeight: 650, lineHeight: 1.25, marginTop: 2, fontVariantNumeric: 'tabular-nums' }}>{value}</div>
        {sub && <div style={{ fontSize: 'var(--fs-caption)', color: 'var(--c-text-2)', marginTop: 2 }}>{sub}</div>}
      </div>
    </div>
  );
}

export function Badge({ children, tone = 'muted' }: { children: ReactNode; tone?: 'muted' | 'success' | 'warning' | 'danger' | 'info' | 'primary' }) {
  const map: Record<string, [string, string]> = {
    muted: ['#f1f5f9', '#475569'],
    success: ['#dcfce7', '#166534'],
    warning: ['#fef3c7', '#92400e'],
    danger: ['#fee2e2', '#991b1b'],
    info: ['#e0f2fe', '#075985'],
    primary: ['#ccfbf1', '#115e59'],
  };
  const [bg, fg] = map[tone];
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: bg, color: fg, borderRadius: 999, padding: '2px 9px', fontSize: 11.5, fontWeight: 600, whiteSpace: 'nowrap' }}>
      {children}
    </span>
  );
}

// ------------------------------------------------------------------ states

export function Loading({ label = 'Loading…' }: { label?: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, padding: '56px 20px', color: 'var(--c-text-2)' }}>
      <Loader2 size={26} style={{ animation: 'spin 0.9s linear infinite', color: 'var(--c-primary)' }} />
      <div style={{ fontSize: 'var(--fs-small)' }}>{label}</div>
    </div>
  );
}

export function EmptyState({ icon, title, hint, action }: { icon?: ReactNode; title: string; hint?: string; action?: ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '52px 24px', textAlign: 'center' }}>
      {icon && <div style={{ color: 'var(--c-text-3)', marginBottom: 4, display: 'flex' }}>{icon}</div>}
      <div style={{ fontWeight: 650, fontSize: 'var(--fs-card)', color: 'var(--c-text-2)' }}>{title}</div>
      {hint && <div style={{ fontSize: 'var(--fs-small)', color: 'var(--c-text-3)', maxWidth: 380 }}>{hint}</div>}
      {action && <div style={{ marginTop: 10 }}>{action}</div>}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, padding: '48px 24px', textAlign: 'center' }}>
      <div style={{ width: 44, height: 44, borderRadius: '50%', background: 'var(--c-danger-subtle)', color: 'var(--c-danger)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <AlertTriangle size={22} />
      </div>
      <div style={{ fontWeight: 650, color: 'var(--c-text)' }}>Something didn't work</div>
      <div style={{ fontSize: 'var(--fs-small)', color: 'var(--c-text-2)', maxWidth: 420 }}>{message}</div>
      {onRetry && (
        <Button variant="secondary" size="sm" onClick={onRetry} style={{ marginTop: 4 }}>
          Try again
        </Button>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ modal

export function Modal({
  title,
  subtitle,
  onClose,
  children,
  width = 560,
  footer,
  danger,
}: {
  title: ReactNode;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
  width?: number;
  footer?: ReactNode;
  danger?: boolean;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 20, animation: 'fadeIn 0.15s var(--ease)' }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="anim-scale-in"
        style={{
          background: 'var(--c-surface)',
          borderRadius: 'var(--r-xl)',
          width: '100%',
          maxWidth: width,
          maxHeight: 'calc(100vh - 48px)',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: 'var(--shadow-lg)',
          border: `1px solid ${danger ? 'var(--c-danger)' : 'var(--c-border)'}`,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '18px 20px 12px' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h2 style={{ fontSize: 'var(--fs-h2)', fontWeight: 650 }}>{title}</h2>
            {subtitle && <div style={{ fontSize: 'var(--fs-small)', color: 'var(--c-text-2)', marginTop: 3 }}>{subtitle}</div>}
          </div>
          <IconBtn label="Close" icon={<X size={17} />} onClick={onClose} />
        </div>
        <div style={{ padding: '4px 20px 16px', overflowY: 'auto', flex: 1 }}>{children}</div>
        {footer && <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, padding: '12px 20px', borderTop: '1px solid var(--c-border)', background: 'var(--c-surface-2)', borderRadius: '0 0 var(--r-xl) var(--r-xl)' }}>{footer}</div>}
      </div>
    </div>
  );
}

export function ConfirmModal({
  title,
  message,
  confirmLabel = 'Confirm',
  danger,
  onConfirm,
  onClose,
  busy,
  requirePassword,
}: {
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  danger?: boolean;
  onConfirm: (password?: string) => void;
  onClose: () => void;
  busy?: boolean;
  requirePassword?: boolean;
}) {
  const [pw, setPw] = useState('');
  return (
    <Modal
      title={
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, color: danger ? 'var(--c-danger)' : 'var(--c-text)' }}>
          {danger && <AlertTriangle size={18} />}
          {title}
        </span>
      }
      onClose={onClose}
      width={470}
      danger={danger}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant={danger ? 'danger' : 'primary'} loading={busy} onClick={() => onConfirm(pw)} disabled={requirePassword && pw.length < 6}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div style={{ fontSize: 'var(--fs-body)', color: 'var(--c-text-2)', lineHeight: 1.55 }}>{message}</div>
      {requirePassword && (
        <Field label="Enter your password to confirm" required style={{ marginTop: 14 }}>
          <Input type="password" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="Password" autoFocus />
        </Field>
      )}
    </Modal>
  );
}

// ------------------------------------------------------------------ table

export interface Column<T> {
  key: string;
  label: ReactNode;
  render: (row: T) => ReactNode;
  width?: number | string;
  align?: 'left' | 'right' | 'center';
}

export function Table<T extends { id: number | string }>({ columns, rows, onRowClick, empty }: { columns: Column<T>[]; rows: T[]; onRowClick?: (row: T) => void; empty?: ReactNode }) {
  if (!rows.length && empty) return <>{empty}</>;
  if (!rows.length) return <EmptyState title="No records" />;
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--fs-body)' }}>
        <thead>
          <tr>
            {columns.map((c) => (
              <th
                key={c.key}
                style={{
                  textAlign: c.align ?? 'left',
                  fontSize: 'var(--fs-caption)',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  color: 'var(--c-text-3)',
                  padding: '9px 12px',
                  borderBottom: '1px solid var(--c-border)',
                  whiteSpace: 'nowrap',
                  width: c.width,
                }}
              >
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr
              key={r.id}
              onClick={() => onRowClick?.(r)}
              style={{ cursor: onRowClick ? 'pointer' : 'default', transition: 'background var(--t-fast)' }}
              onMouseEnter={(e) => {
                if (onRowClick) e.currentTarget.style.background = 'var(--c-primary-subtle)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent';
              }}
            >
              {columns.map((c) => (
                <td key={c.key} style={{ padding: '10px 12px', borderBottom: '1px solid var(--c-border)', textAlign: c.align ?? 'left', verticalAlign: 'middle' }}>
                  {c.render(r)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Pagination({ page, pageSize, total, onPage }: { page: number; pageSize: number; total: number; onPage: (p: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 2px 0', fontSize: 'var(--fs-small)', color: 'var(--c-text-2)' }}>
      <span>
        {total.toLocaleString()} record{total === 1 ? '' : 's'} · page {page} of {pages}
      </span>
      <div style={{ display: 'flex', gap: 6 }}>
        <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => onPage(page - 1)}>
          Previous
        </Button>
        <Button variant="secondary" size="sm" disabled={page >= pages} onClick={() => onPage(page + 1)}>
          Next
        </Button>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ tabs

export function Tabs({ tabs, active, onChange }: { tabs: Array<{ key: string; label: ReactNode }>; active: string; onChange: (k: string) => void }) {
  return (
    <div role="tablist" style={{ display: 'flex', gap: 2, borderBottom: '1px solid var(--c-border)', overflowX: 'auto' }}>
      {tabs.map((t) => (
        <button
          key={t.key}
          role="tab"
          aria-selected={active === t.key}
          onClick={() => onChange(t.key)}
          style={{
            padding: '9px 14px',
            fontSize: 'var(--fs-body)',
            fontWeight: active === t.key ? 650 : 500,
            color: active === t.key ? 'var(--c-primary)' : 'var(--c-text-2)',
            borderBottom: `2px solid ${active === t.key ? 'var(--c-primary)' : 'transparent'}`,
            marginBottom: -1,
            whiteSpace: 'nowrap',
            transition: 'color var(--t-fast)',
          }}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

// ------------------------------------------------------------------ toasts

interface Toast {
  id: number;
  tone: 'success' | 'error' | 'info' | 'warning';
  message: string;
}

const ToastCtx = createContext<{ toast: (tone: Toast['tone'], message: string) => void } | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const idRef = useRef(1);
  const toast = useCallback((tone: Toast['tone'], message: string) => {
    const id = idRef.current++;
    setToasts((t) => [...t, { id, tone, message }].slice(-5));
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 5200);
  }, []);
  const icons = {
    success: <CheckCircle2 size={17} style={{ color: 'var(--c-success)' }} />,
    error: <AlertCircle size={17} style={{ color: 'var(--c-danger)' }} />,
    warning: <AlertTriangle size={17} style={{ color: 'var(--c-warning)' }} />,
    info: <Info size={17} style={{ color: 'var(--c-info)' }} />,
  };
  return (
    <ToastCtx.Provider value={{ toast }}>
      {children}
      <div style={{ position: 'fixed', bottom: 18, right: 18, zIndex: 200, display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 380 }}>
        {toasts.map((t) => (
          <div
            key={t.id}
            role="status"
            className="anim-fade-up"
            style={{
              display: 'flex',
              gap: 10,
              alignItems: 'flex-start',
              background: 'var(--c-surface)',
              border: '1px solid var(--c-border)',
              borderLeft: `3px solid ${t.tone === 'success' ? 'var(--c-success)' : t.tone === 'error' ? 'var(--c-danger)' : t.tone === 'warning' ? 'var(--c-warning)' : 'var(--c-info)'}`,
              borderRadius: 'var(--r-md)',
              padding: '11px 14px',
              boxShadow: 'var(--shadow-lg)',
              fontSize: 'var(--fs-small)',
              lineHeight: 1.45,
            }}
          >
            <div style={{ marginTop: 1 }}>{icons[t.tone]}</div>
            <div style={{ flex: 1 }}>{t.message}</div>
            <IconBtn label="Dismiss" icon={<X size={14} />} style={{ width: 22, height: 22 }} onClick={() => setToasts((x) => x.filter((y) => y.id !== t.id))} />
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

export function useToast() {
  const v = useContext(ToastCtx);
  if (!v) throw new Error('useToast outside provider');
  return v.toast;
}

/** Show an ApiError (or generic error) as a toast. */
export function toastError(toast: (t: Toast['tone'], m: string) => void, e: unknown): void {
  const msg = e instanceof Error ? e.message : String(e);
  toast('error', msg);
}
