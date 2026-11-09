import { useEffect, useState } from 'react';
import { AlertTriangle, IdCard } from 'lucide-react';
import { api, formatDateTime, rupees } from '../api.js';
import { Alert, Badge, Button, Card, CheckList, Loading, PageTitle } from '../components/ui.jsx';

function AlertCard({ alert, onDecided }) {
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  async function decide(action) {
    setBusy(action);
    setError('');
    try {
      await api(`/admin/alerts/${alert.id}/${action}`, { method: 'POST' });
      onDecided();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy('');
    }
  }

  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-2xl font-semibold">{rupees(alert.amountPaise)}</p>
          <p className="text-sm text-slate-600">
            {alert.from.name} → {alert.to} · {formatDateTime(alert.createdAt)}
          </p>
          {alert.note && <p className="text-sm text-slate-500">Note: "{alert.note}"</p>}
        </div>
        <div className="flex flex-wrap gap-1">
          {alert.reasons.map((r) => (
            <Badge key={r.code} tone="red">
              {r.code}
            </Badge>
          ))}
        </div>
      </div>
      <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-slate-700">
        {alert.reasons.map((r) => (
          <li key={r.code}>{r.message}</li>
        ))}
      </ul>
      <div className="mt-3 rounded-xl bg-indigo-50 p-3 text-sm text-indigo-900">
        <span className="font-semibold">Explanation: </span>
        {alert.explanation}
      </div>
      {error && <Alert tone="error" className="mt-3">{error}</Alert>}
      <div className="mt-4 flex gap-2">
        <Button variant="success" busy={busy === 'approve'} disabled={!!busy} onClick={() => decide('approve')}>
          Approve & release
        </Button>
        <Button variant="danger" busy={busy === 'reject'} disabled={!!busy} onClick={() => decide('reject')}>
          Reject
        </Button>
      </div>
    </Card>
  );
}

function KycCard({ app, onDecided }) {
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  async function decide(action) {
    setBusy(action);
    setError('');
    try {
      await api(`/admin/kyc/${app.id}/${action}`, { method: 'POST' });
      onDecided();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy('');
    }
  }

  const rows = [
    ['Name', app.entered.name, app.extracted?.name],
    ['Date of birth', app.entered.dob, app.extracted?.dob],
    ['PAN', app.entered.pan, app.extracted?.pan],
  ];

  return (
    <Card>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-semibold">{app.user.name}</p>
          <p className="text-sm text-slate-500">
            {app.user.email} · {formatDateTime(app.createdAt)}
          </p>
        </div>
        <Badge tone="yellow">Needs review</Badge>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-slate-500">
                <th className="py-1 pr-3 font-medium">Field</th>
                <th className="py-1 pr-3 font-medium">Customer typed</th>
                <th className="py-1 font-medium">AI read from card</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(([label, typed, read]) => (
                <tr key={label} className="border-t border-slate-100">
                  <td className="py-2 pr-3 text-slate-500">{label}</td>
                  <td className="py-2 pr-3 font-medium">{typed}</td>
                  <td className={`py-2 font-medium ${read && String(read).toUpperCase() !== String(typed).toUpperCase() ? 'text-amber-700' : ''}`}>
                    {read ?? '-'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="mt-4">
            <CheckList checks={app.checks} />
          </div>
        </div>
        <div>
          {app.hasImage ? (
            <img src={`/api/admin/kyc/${app.id}/image`} alt="Uploaded PAN card" className="w-full rounded-xl border border-slate-200" />
          ) : (
            <div className="flex h-full min-h-32 items-center justify-center rounded-xl bg-slate-50 text-sm text-slate-400">No image (demo data)</div>
          )}
        </div>
      </div>

      {error && <Alert tone="error" className="mt-3">{error}</Alert>}
      <div className="mt-4 flex gap-2">
        <Button variant="success" busy={busy === 'approve'} disabled={!!busy} onClick={() => decide('approve')}>
          Approve KYC
        </Button>
        <Button variant="danger" busy={busy === 'reject'} disabled={!!busy} onClick={() => decide('reject')}>
          Reject
        </Button>
      </div>
      <p className="mt-2 text-xs text-slate-400">The photo is deleted as soon as you decide.</p>
    </Card>
  );
}

export default function Admin() {
  const [tab, setTab] = useState('alerts');
  // We remember WHICH tab the loaded list belongs to. Right after switching tabs, the old
  // list must not be drawn with the new tab's cards (alerts have no .user, KYC apps do).
  const [loaded, setLoaded] = useState({ tab: null, items: null });
  const [error, setError] = useState('');
  const items = loaded.tab === tab ? loaded.items : null;

  const load = () => {
    setError('');
    const current = tab;
    const path = current === 'alerts' ? '/admin/alerts?status=open' : '/admin/kyc?status=needs_review';
    api(path)
      .then((d) => setLoaded({ tab: current, items: current === 'alerts' ? d.alerts : d.applications }))
      .catch((err) => setError(err.message));
  };

  useEffect(load, [tab]);

  return (
    <div className="space-y-6">
      <PageTitle title="Admin" subtitle="Rules flag, AI explains, a person decides." />

      <div className="inline-flex gap-1 rounded-xl bg-slate-100 p-1">
        {[
          ['alerts', 'Fraud alerts', AlertTriangle],
          ['kyc', 'KYC reviews', IdCard],
        ].map(([value, label, Icon]) => (
          <button
            key={value}
            onClick={() => setTab(value)}
            className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium ${tab === value ? 'bg-white shadow-sm' : 'text-slate-600'}`}
          >
            <Icon className="h-4 w-4" /> {label}
          </button>
        ))}
      </div>

      {error && <Alert tone="error">{error}</Alert>}
      {!items && !error && <Loading />}
      {items && items.length === 0 && <Card className="text-center text-sm text-slate-500">Nothing to review. All clear!</Card>}
      {items && (
        <div className="space-y-4">
          {tab === 'alerts'
            ? items.map((a) => <AlertCard key={a.id} alert={a} onDecided={load} />)
            : items.map((a) => <KycCard key={a.id} app={a} onDecided={load} />)}
        </div>
      )}
    </div>
  );
}
