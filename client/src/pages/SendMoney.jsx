import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Store, UserRound } from 'lucide-react';
import { api, newRequestId, rupees } from '../api.js';
import { useAuth } from '../auth.jsx';
import { Alert, Button, Card, Field, inputClass, Loading, PageTitle } from '../components/ui.jsx';

function AddPayee({ onAdded }) {
  const [form, setForm] = useState({ nickname: '', accountNumber: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api('/beneficiaries', { method: 'POST', body: form });
      setForm({ nickname: '', accountNumber: '' });
      onAdded();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3 rounded-xl bg-slate-50 p-4">
      <p className="text-sm font-medium">Add a new payee</p>
      {error && <Alert tone="error">{error}</Alert>}
      <div className="grid gap-3 sm:grid-cols-2">
        <input className={inputClass} placeholder="Nickname, e.g. Mom" value={form.nickname} onChange={(e) => setForm({ ...form, nickname: e.target.value })} required />
        <input
          className={inputClass}
          placeholder="12-digit account number"
          inputMode="numeric"
          value={form.accountNumber}
          onChange={(e) => setForm({ ...form, accountNumber: e.target.value.replace(/\D/g, '').slice(0, 12) })}
          required
        />
      </div>
      <Button type="submit" variant="secondary" busy={busy}>
        Save payee
      </Button>
      <p className="text-xs text-slate-500">New payees get extra fraud checks for 24 hours.</p>
    </form>
  );
}

export default function SendMoney() {
  const { user } = useAuth();
  const [mode, setMode] = useState('payee');
  const [payees, setPayees] = useState(null);
  const [balance, setBalance] = useState(null);
  const [form, setForm] = useState({ beneficiaryId: '', merchant: '', amount: '', note: '' });
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  // One id per payment attempt. If the network fails and the user clicks again,
  // the SAME id is sent, so the server never pays twice.
  const requestId = useRef(newRequestId());

  const load = () =>
    Promise.all([api('/beneficiaries'), api('/account')])
      .then(([b, a]) => {
        setPayees(b.beneficiaries);
        setBalance(a.account.balancePaise);
      })
      .catch((err) => setError(err.message));

  useEffect(() => {
    load();
  }, []);

  const verified = user.kyc_status === 'verified';

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    setResult(null);
    try {
      const body = { requestId: requestId.current, amount: form.amount, note: form.note };
      if (mode === 'payee') body.beneficiaryId = Number(form.beneficiaryId);
      else body.merchant = form.merchant;
      const data = await api('/transfers', { method: 'POST', body });
      setResult(data);
      requestId.current = newRequestId(); // this payment is finished; the next one gets a new id
      setForm({ ...form, amount: '', note: '' });
      load();
    } catch (err) {
      setError(err.message);
      // Keep the same requestId only if the outcome is unknown (network error). A clear "no" gets a new one.
      if (err.status) requestId.current = newRequestId();
    } finally {
      setBusy(false);
    }
  }

  if (!payees) return error ? <Alert tone="error">{error}</Alert> : <Loading />;

  return (
    <div className="space-y-6">
      <PageTitle title="Send money" subtitle={balance !== null ? `Available balance: ${rupees(balance)}` : ''} />

      {!verified && (
        <Alert tone="warning">
          Sending money is locked until your KYC is verified.{' '}
          <Link to="/kyc" className="font-medium underline">
            Go to KYC
          </Link>
        </Alert>
      )}

      <Card className="max-w-xl">
        <div className="mb-5 grid grid-cols-2 gap-2 rounded-xl bg-slate-100 p-1">
          {[
            ['payee', 'To a person', UserRound],
            ['merchant', 'To a merchant', Store],
          ].map(([value, label, Icon]) => (
            <button
              key={value}
              type="button"
              onClick={() => {
                setMode(value);
                setResult(null);
                setError('');
              }}
              className={`flex items-center justify-center gap-2 rounded-lg py-2 text-sm font-medium ${mode === value ? 'bg-white shadow-sm' : 'text-slate-600'}`}
            >
              <Icon className="h-4 w-4" /> {label}
            </button>
          ))}
        </div>

        <form onSubmit={submit} className="space-y-4">
          {result && (
            <Alert tone={result.status === 'completed' ? 'success' : 'warning'}>
              {result.message}
              {result.replayed && ' (This was a repeat of an earlier request, so nothing was paid twice.)'}
              {result.status === 'completed' && ` Category: ${result.transaction.category}.`}
            </Alert>
          )}
          {error && <Alert tone="error">{error}</Alert>}

          {mode === 'payee' ? (
            <Field label="Payee">
              <select className={inputClass} value={form.beneficiaryId} onChange={(e) => setForm({ ...form, beneficiaryId: e.target.value })} required disabled={!verified}>
                <option value="">Choose a payee</option>
                {payees.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nickname} ({p.holderName}, {p.accountMasked})
                  </option>
                ))}
              </select>
            </Field>
          ) : (
            <Field label="Merchant name" hint="Try Swiggy (keyword rule) or 'Third Wave Coffee' (AI picks the category).">
              <input className={inputClass} value={form.merchant} onChange={(e) => setForm({ ...form, merchant: e.target.value })} required disabled={!verified} />
            </Field>
          )}

          <Field label="Amount (₹)">
            <input
              className={inputClass}
              inputMode="decimal"
              placeholder="500"
              value={form.amount}
              onChange={(e) => setForm({ ...form, amount: e.target.value.replace(/[^\d.]/g, '') })}
              required
              disabled={!verified}
            />
          </Field>
          <Field label="Note (optional)">
            <input className={inputClass} maxLength={100} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} disabled={!verified} />
          </Field>
          <Button type="submit" busy={busy} disabled={!verified} className="w-full">
            Send {form.amount ? `₹${form.amount}` : ''}
          </Button>
        </form>

        {mode === 'payee' && (
          <div className="mt-5 border-t border-slate-100 pt-5">
            {showAdd ? (
              <AddPayee
                onAdded={() => {
                  setShowAdd(false);
                  load();
                }}
              />
            ) : (
              <button onClick={() => setShowAdd(true)} className="text-sm font-medium text-indigo-600 hover:underline">
                + Add a new payee
              </button>
            )}
          </div>
        )}
      </Card>
    </div>
  );
}
