import { useEffect, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Sparkles, TrendingDown, TrendingUp } from 'lucide-react';
import { api, rupees, thisMonth } from '../api.js';
import { Alert, Card, compactInputClass, Loading, PageTitle } from '../components/ui.jsx';

function monthName(month) {
  const [y, m] = month.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' });
}

export default function Insights() {
  const [month, setMonth] = useState(thisMonth());
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    setData(null);
    setError('');
    api(`/ai/insights?month=${month}`)
      .then(setData)
      .catch((err) => setError(err.message));
  }, [month]);

  const change = data && data.previousTotalPaise > 0 ? ((data.totalPaise - data.previousTotalPaise) / data.previousTotalPaise) * 100 : null;
  const chartData = (data?.byCategory ?? []).map((c) => ({
    name: c.category,
    'This month': c.totalPaise / 100,
    'Last month': c.previousPaise / 100,
  }));

  return (
    <div className="space-y-6">
      <PageTitle
        title="Monthly insights"
        subtitle="Code calculates every number. AI only turns them into plain-English tips."
        action={<input type="month" className={compactInputClass} value={month} max={thisMonth()} onChange={(e) => e.target.value && setMonth(e.target.value)} />}
      />

      {error && <Alert tone="error">{error}</Alert>}
      {!data && !error && <Loading text="Crunching your numbers..." />}

      {data && (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <Card>
              <p className="text-sm text-slate-500">Spent in {monthName(data.month)}</p>
              <p className="mt-2 text-2xl font-semibold">{rupees(data.totalPaise)}</p>
              {change !== null && (
                <p className={`mt-1 flex items-center gap-1 text-sm ${change > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                  {change > 0 ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
                  {Math.abs(change).toFixed(0)}% vs last month
                </p>
              )}
            </Card>
            <Card>
              <p className="text-sm text-slate-500">Spent last month</p>
              <p className="mt-2 text-2xl font-semibold">{rupees(data.previousTotalPaise)}</p>
            </Card>
            <Card>
              <p className="text-sm text-slate-500">Money in this month</p>
              <p className="mt-2 text-2xl font-semibold text-emerald-600">{rupees(data.incomePaise)}</p>
            </Card>
          </div>

          <Card className="border-indigo-200 bg-gradient-to-br from-indigo-50 to-white">
            <h2 className="mb-3 flex items-center gap-2 font-semibold text-indigo-900">
              <Sparkles className="h-4 w-4" /> AI summary and tips
            </h2>
            {!data.aiAvailable ? (
              <p className="text-sm text-slate-600">AI tips are off. Add a GEMINI_API_KEY in server/.env to turn them on. The numbers above still work.</p>
            ) : data.totalPaise === 0 ? (
              <p className="text-sm text-slate-600">No spending this month yet, so there is nothing to analyse.</p>
            ) : (
              <>
                <p className="text-sm text-slate-800">{data.summary}</p>
                <ul className="mt-3 space-y-2">
                  {data.tips.map((tip, i) => (
                    <li key={i} className="flex gap-2 text-sm text-slate-700">
                      <span className="font-semibold text-indigo-600">{i + 1}.</span> {tip}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </Card>

          <Card>
            <h2 className="mb-4 font-semibold">This month vs last month</h2>
            {chartData.length === 0 ? (
              <p className="py-8 text-center text-sm text-slate-500">No spending in these two months.</p>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} tickFormatter={(v) => `₹${v / 1000}k`} />
                  <Tooltip formatter={(v) => rupees(v * 100)} />
                  <Legend />
                  <Bar dataKey="Last month" fill="#cbd5e1" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="This month" fill="#4f46e5" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
