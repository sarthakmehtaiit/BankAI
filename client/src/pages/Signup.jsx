import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { Alert, AuthShell, Button, Field, inputClass } from '../components/ui.jsx';

export default function Signup() {
  const { user, setUser } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to="/" replace />;

  const update = (key) => (e) => setForm({ ...form, [key]: e.target.value });

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const data = await api('/auth/signup', { method: 'POST', body: form });
      setUser(data.user);
      navigate('/kyc'); // new customers start with KYC
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell title="Open your account" subtitle="It takes a minute. KYC comes next.">
      <form onSubmit={submit} className="space-y-4">
        {error && <Alert tone="error">{error}</Alert>}
        <Field label="Full name">
          <input className={inputClass} value={form.name} onChange={update('name')} required autoComplete="name" />
        </Field>
        <Field label="Email">
          <input className={inputClass} type="email" value={form.email} onChange={update('email')} required autoComplete="email" />
        </Field>
        <Field label="Password" hint="At least 8 characters">
          <input className={inputClass} type="password" value={form.password} onChange={update('password')} required minLength={8} autoComplete="new-password" />
        </Field>
        <Button type="submit" busy={busy} className="w-full">
          Create account
        </Button>
        <p className="text-center text-sm text-slate-500">
          Already have an account?{' '}
          <Link to="/login" className="font-medium text-indigo-600 hover:underline">
            Log in
          </Link>
        </p>
      </form>
    </AuthShell>
  );
}
