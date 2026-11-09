import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ShieldCheck } from 'lucide-react';
import { api, formatDateTime } from '../api.js';
import { useAuth } from '../auth.jsx';
import { Alert, Button, Card, CheckList, Field, inputClass, Loading, PageTitle, StatusBadge } from '../components/ui.jsx';

export default function Kyc() {
  const { refresh } = useAuth();
  const [state, setState] = useState(null); // { status, application }
  const [form, setForm] = useState({ name: '', dob: '', pan: '' });
  const [file, setFile] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = () => api('/kyc').then(setState).catch((err) => setError(err.message));
  useEffect(() => {
    load();
  }, []);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const body = new FormData();
      body.append('name', form.name);
      body.append('dob', form.dob);
      body.append('pan', form.pan);
      body.append('image', file);
      await api('/kyc', { method: 'POST', form: body });
      await Promise.all([load(), refresh()]);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (!state) return error ? <Alert tone="error">{error}</Alert> : <Loading />;
  const { status, application } = state;
  const canApply = status === 'not_started' || status === 'rejected';

  return (
    <div className="space-y-6">
      <PageTitle title="KYC verification" subtitle="Know Your Customer: we confirm your identity before you can send money." />

      {application && (
        <Card>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="font-semibold">Latest application</h2>
              <p className="text-xs text-slate-500">
                Submitted {formatDateTime(application.created_at)} · PAN {application.pan_masked}
              </p>
            </div>
            <StatusBadge status={application.status} />
          </div>
          {application.status === 'verified' && (
            <Alert tone="success" className="mb-4">
              You are verified. You can now <Link to="/send" className="font-medium underline">send money</Link>.
            </Alert>
          )}
          {application.status === 'needs_review' && (
            <Alert tone="warning" className="mb-4">
              Something needs a human check. A reviewer will look at it soon. You don't need to do anything.
            </Alert>
          )}
          {application.status === 'rejected' && (
            <Alert tone="error" className="mb-4">
              Not approved: {application.reason}. You can fix it and apply again below.
            </Alert>
          )}
          <CheckList checks={application.checks} />
        </Card>
      )}

      {canApply && (
        <Card>
          <div className="mb-4 flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-indigo-600" />
            <h2 className="font-semibold">Verify with your PAN card</h2>
          </div>
          <form onSubmit={submit} className="grid gap-4 md:grid-cols-2">
            {error && <Alert tone="error" className="md:col-span-2">{error}</Alert>}
            <Field label="Full name (as on PAN card)">
              <input className={inputClass} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            </Field>
            <Field label="Date of birth">
              <input className={inputClass} type="date" value={form.dob} onChange={(e) => setForm({ ...form, dob: e.target.value })} required />
            </Field>
            <Field label="PAN number" hint="5 letters, 4 digits, 1 letter. Example: ABCDE1234F">
              <input
                className={`${inputClass} uppercase`}
                value={form.pan}
                maxLength={10}
                onChange={(e) => setForm({ ...form, pan: e.target.value.toUpperCase() })}
                required
              />
            </Field>
            <Field label="Photo of PAN card" hint="JPG, PNG or WEBP, under 5 MB. Use the SAMPLE cards in /samples for demos.">
              <input
                className={inputClass}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                required
              />
            </Field>
            <div className="md:col-span-2">
              <Button type="submit" busy={busy}>
                {busy ? 'Checking your card...' : 'Submit for verification'}
              </Button>
              <p className="mt-3 text-xs text-slate-500">
                How it works: AI reads the card, our code checks the details, and a person reviews anything unclear. We store only a masked PAN, and
                your photo is deleted after the decision.
              </p>
            </div>
          </form>
        </Card>
      )}
    </div>
  );
}
