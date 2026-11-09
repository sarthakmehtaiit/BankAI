import { useEffect, useState } from 'react';
import { api, rupees } from '../api.js';
import { Alert, Card, compactInputClass, Loading, PageTitle } from '../components/ui.jsx';
import { TransactionRow } from './Dashboard.jsx';

const CATEGORIES = ['Food', 'Groceries', 'Travel', 'Shopping', 'Bills', 'Entertainment', 'Health', 'Rent', 'Other', 'Transfer', 'Salary', 'Deposit'];

export default function Transactions() {
  const [month, setMonth] = useState('');
  const [category, setCategory] = useState('');
  const [rows, setRows] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    setRows(null);
    const params = new URLSearchParams({ limit: '200' });
    if (month) params.set('month', month);
    if (category) params.set('category', category);
    api(`/transactions?${params}`)
      .then((d) => setRows(d.transactions))
      .catch((err) => setError(err.message));
  }, [month, category]);

  const totalOut = (rows ?? []).filter((t) => t.direction === 'debit' && t.status === 'completed').reduce((s, t) => s + t.amountPaise, 0);
  const totalIn = (rows ?? []).filter((t) => t.direction === 'credit').reduce((s, t) => s + t.amountPaise, 0);

  return (
    <div className="space-y-6">
      <PageTitle title="Transactions" subtitle="Every payment is categorized automatically: keyword rules first, AI only for unknown merchants." />

      <Card>
        <div className="mb-4 flex flex-wrap gap-3">
          <input type="month" className={compactInputClass} value={month} onChange={(e) => setMonth(e.target.value)} />
          <select className={compactInputClass} value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">All categories</option>
            {CATEGORIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
          {(month || category) && (
            <button
              className="text-sm text-indigo-600 hover:underline"
              onClick={() => {
                setMonth('');
                setCategory('');
              }}
            >
              Clear filters
            </button>
          )}
        </div>

        {error && <Alert tone="error">{error}</Alert>}
        {!rows && !error && <Loading />}
        {rows && (
          <>
            <div className="mb-2 flex gap-6 text-sm">
              <span className="text-slate-500">
                Money in: <span className="font-semibold text-emerald-600">{rupees(totalIn)}</span>
              </span>
              <span className="text-slate-500">
                Money out: <span className="font-semibold text-slate-900">{rupees(totalOut)}</span>
              </span>
            </div>
            <ul className="divide-y divide-slate-100">
              {rows.map((t) => (
                <TransactionRow key={t.id} t={t} />
              ))}
            </ul>
            {rows.length === 0 && <p className="py-8 text-center text-sm text-slate-500">No transactions match these filters.</p>}
          </>
        )}
      </Card>
    </div>
  );
}
