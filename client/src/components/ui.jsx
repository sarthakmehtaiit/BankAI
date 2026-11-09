import { CheckCircle2, CircleAlert, Loader2, XCircle } from 'lucide-react';

// Small reusable building blocks, so every page looks the same.

export function Card({ className = '', children }) {
  return <div className={`rounded-2xl border border-slate-200 bg-white p-5 shadow-sm ${className}`}>{children}</div>;
}

const BUTTON_STYLES = {
  primary: 'bg-indigo-600 text-white hover:bg-indigo-700',
  secondary: 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50',
  success: 'bg-emerald-600 text-white hover:bg-emerald-700',
  danger: 'bg-rose-600 text-white hover:bg-rose-700',
};

export function Button({ variant = 'primary', className = '', busy = false, children, disabled, ...props }) {
  return (
    <button
      className={`inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${BUTTON_STYLES[variant]} ${className}`}
      disabled={disabled || busy}
      {...props}
    >
      {busy && <Loader2 className="h-4 w-4 animate-spin" />}
      {children}
    </button>
  );
}

const inputBase =
  'rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 disabled:bg-slate-100';
export const inputClass = `w-full ${inputBase}`;
// For small filters (month picker, category) that should not stretch across the page.
export const compactInputClass = `w-auto ${inputBase}`;

export function Field({ label, hint, children }) {
  return (
    <label className="block space-y-1">
      <span className="text-sm font-medium text-slate-700">{label}</span>
      {children}
      {hint && <span className="block text-xs text-slate-500">{hint}</span>}
    </label>
  );
}

const ALERT_STYLES = {
  info: 'border-indigo-200 bg-indigo-50 text-indigo-900',
  success: 'border-emerald-200 bg-emerald-50 text-emerald-900',
  warning: 'border-amber-200 bg-amber-50 text-amber-900',
  error: 'border-rose-200 bg-rose-50 text-rose-900',
};

export function Alert({ tone = 'info', children, className = '' }) {
  return <div className={`rounded-xl border px-4 py-3 text-sm ${ALERT_STYLES[tone]} ${className}`}>{children}</div>;
}

const BADGE_STYLES = {
  green: 'bg-emerald-100 text-emerald-800',
  yellow: 'bg-amber-100 text-amber-800',
  red: 'bg-rose-100 text-rose-800',
  gray: 'bg-slate-100 text-slate-700',
  indigo: 'bg-indigo-100 text-indigo-800',
};

export function Badge({ tone = 'gray', children }) {
  return <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${BADGE_STYLES[tone]}`}>{children}</span>;
}

export function StatusBadge({ status }) {
  const map = {
    completed: ['green', 'Completed'],
    on_hold: ['yellow', 'On hold'],
    rejected: ['red', 'Rejected'],
    verified: ['green', 'Verified'],
    needs_review: ['yellow', 'Under review'],
    not_started: ['gray', 'Not started'],
    open: ['yellow', 'Open'],
    approved: ['green', 'Approved'],
  };
  const [tone, label] = map[status] ?? ['gray', status];
  return <Badge tone={tone}>{label}</Badge>;
}

export function PageTitle({ title, subtitle, action }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function Loading({ text = 'Loading...' }) {
  return (
    <div className="flex items-center gap-2 py-6 text-sm text-slate-500">
      <Loader2 className="h-4 w-4 animate-spin" /> {text}
    </div>
  );
}

export function FullPageLoader() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <Loader2 className="h-6 w-6 animate-spin text-indigo-600" />
    </div>
  );
}

// The list of KYC checks, with an icon for pass / review / fail.
export function CheckList({ checks = [] }) {
  const icons = {
    pass: <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" />,
    review: <CircleAlert className="h-5 w-5 shrink-0 text-amber-500" />,
    fail: <XCircle className="h-5 w-5 shrink-0 text-rose-600" />,
  };
  return (
    <ul className="space-y-2">
      {checks.map((c) => (
        <li key={c.name} className="flex gap-3 text-sm">
          {icons[c.result]}
          <span>
            <span className="font-medium text-slate-800">{c.name}:</span> <span className="text-slate-600">{c.detail}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

export function AuthShell({ title, subtitle, children }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-indigo-50 via-white to-emerald-50 px-4">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-600 text-2xl font-bold text-white">₹</div>
          <h1 className="text-2xl font-semibold">{title}</h1>
          <p className="mt-1 text-sm text-slate-500">{subtitle}</p>
        </div>
        <Card className="p-6">{children}</Card>
      </div>
    </div>
  );
}
