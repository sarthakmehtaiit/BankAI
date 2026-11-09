import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import { ArrowDownLeft, ArrowUpRight, ShieldAlert } from 'lucide-react';
import { api, formatDate, rupees, thisMonth } from '../api.js';
import { useAuth } from '../auth.jsx';
import { Alert, Button, Card, Loading, PageTitle, StatusBadge } from '../components/ui.jsx';

export const CATEGORY_COLORS = {
  Food: '#f97316',
  Groceries: '#22c55e',
  Travel: '#0ea5e9',
  Shopping: '#a855f7',
  Bills: '#eab308',
  Entertainment: '#ec4899',
  Health: '#14b8a6',
  Rent: '#6366f1',
  Transfer: '#64748b',
  Other: '#94a3b8',
};

export function TransactionRow({ t }) {
  const isDebit = t.direction === 'debit';
  return (
    <li className="flex items-center gap-3 py-3">
      <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${isDebit ? 'bg-rose-50 text-rose-600' : 'bg-emerald-50 text-emerald-600'}`}>
        {isDebit ? <ArrowUpRight className="h-4 w-4" /> : <ArrowDownLeft className="h-4 w-4" />}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-slate-800">{t.counterparty}</p>
        <p className="text-xs text-slate-500">
          {formatDate(t.createdAt)} · {t.category}
          {t.note ? ` · ${t.note}` : ''}
        </p>
      </div>
      <div className="text-right">
        <p className={`text-sm font-semibold ${isDebit ? 'text-slate-900' : 'text-emerald-600'}`}>
          {isDebit ? '−' : '+'}
          {rupees(t.amountPaise)}
        </p>
        {t.status !== 'completed' && <StatusBadge status={t.status} />}
      </div>
    </li>
  );
}

export default function Dashboard() {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([api('/account'), api(`/spending?month=${thisMonth()}`), api('/transactions?limit=6')])
      .then(([account, spending, txns]) => setData({ ...account, spending: spending.byCategory, recent: txns.transactions }))
      .catch((err) => setError(err.message));
  }, []);

  if (error) return <Alert tone="error">{error}</Alert>;
  if (!data) return <Loading />;

  const chartData = data.spending.map((s) => ({ name: s.category, value: s.totalPaise }));
  const spentThisMonth = data.spending.reduce((sum, s) => sum + s.totalPaise, 0);

  return (
    <div className="space-y-6">
      <PageTitle title={`Hi, ${user.name.split(' ')[0]}`} subtitle="Here is your money at a glance." />

      {data.kycStatus !== 'verified' && (
        <Alert tone="warning" className="flex flex-wrap items-center justify-between gap-3">
          <span className="flex items-center gap-2">
            <ShieldAlert className="h-4 w-4" />
            {data.kycStatus === 'needs_review'
              ? 'Your KYC is being reviewed. You can send money once it is approved.'
              : 'Complete your KYC to start sending money.'}
          </span>
          {data.kycStatus !== 'needs_review' && (
            <Link to="/kyc">
              <Button>Complete KYC</Button>
            </Link>
          )}
        </Alert>
      )}

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="bg-gradient-to-br from-indigo-600 to-indigo-800 text-white md:col-span-2">
          <p className="text-sm text-indigo-100">Available balance</p>
          <p className="mt-2 text-4xl font-semibold tracking-tight">{rupees(data.account.balancePaise)}</p>
          <p className="mt-4 text-sm text-indigo-100">Account number {data.account.accountNumber}</p>
          <div className="mt-5 flex gap-2">
            <Link to="/send">
              <Button variant="secondary">Send money</Button>
            </Link>
            <Link to="/assistant">
              <Button variant="secondary">Ask AI</Button>
            </Link>
          </div>
        </Card>
        <Card>
          <p className="text-sm text-slate-500">Spent this month</p>
          <p className="mt-2 text-3xl font-semibold">{rupees(spentThisMonth)}</p>
          <Link to="/insights" className="mt-4 inline-block text-sm font-medium text-indigo-600 hover:underline">
            See AI insights →
          </Link>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <h2 className="mb-2 font-semibold">Spending by category</h2>
          {chartData.length === 0 ? (
            <p className="py-10 text-center text-sm text-slate-500">No spending yet this month.</p>
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie data={chartData} dataKey="value" nameKey="name" innerRadius={60} outerRadius={95} paddingAngle={2}>
                  {chartData.map((d) => (
                    <Cell key={d.name} fill={CATEGORY_COLORS[d.name] ?? '#94a3b8'} />
                  ))}
                </Pie>
                <Tooltip formatter={(value) => rupees(value)} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          )}
        </Card>
        <Card>
          <div className="mb-1 flex items-center justify-between">
            <h2 className="font-semibold">Recent transactions</h2>
            <Link to="/transactions" className="text-sm font-medium text-indigo-600 hover:underline">
              View all
            </Link>
          </div>
          <ul className="divide-y divide-slate-100">
            {data.recent.map((t) => (
              <TransactionRow key={t.id} t={t} />
            ))}
          </ul>
          {data.recent.length === 0 && <p className="py-6 text-center text-sm text-slate-500">No transactions yet.</p>}
        </Card>
      </div>
    </div>
  );
}
