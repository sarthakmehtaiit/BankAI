import { query } from '../db.js';
import { AppError } from '../errors.js';

export async function getAccount(userId) {
  const { rows } = await query('SELECT id, account_number, balance_paise FROM accounts WHERE user_id = $1', [userId]);
  if (!rows[0]) throw new AppError(404, 'Account not found');
  return rows[0];
}

// ---------- Month helpers ('YYYY-MM') ----------

export function currentMonth() {
  return new Date().toISOString().slice(0, 7);
}

export function isMonth(value) {
  return typeof value === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
}

export function previousMonth(month) {
  const [year, m] = month.split('-').map(Number);
  return new Date(Date.UTC(year, m - 2, 1)).toISOString().slice(0, 7);
}

// ---------- Reading transactions ----------

// Outgoing payments of every status, but only COMPLETED incoming ones
// (the receiver should not see a payment that is still on hold).
export async function listTransactions(accountId, { month, category, limit = 50 } = {}) {
  const params = [accountId];
  const where = [`(t.from_account_id = $1 OR (t.to_account_id = $1 AND t.status = 'completed'))`];
  if (isMonth(month)) {
    params.push(`${month}-01`);
    const p = `$${params.length}`;
    where.push(`t.created_at >= ${p}::date AND t.created_at < (${p}::date + interval '1 month')`);
  }
  if (category) {
    params.push(category);
    where.push(`t.category = $${params.length}`);
  }
  params.push(Math.min(Math.max(Number(limit) || 50, 1), 200));

  const { rows } = await query(
    `SELECT t.id, t.amount_paise, t.category, t.status, t.note, t.merchant, t.created_at,
            (t.from_account_id = $1) AS is_debit, fu.name AS from_name, tu.name AS to_name
     FROM transactions t
     LEFT JOIN accounts fa ON fa.id = t.from_account_id LEFT JOIN users fu ON fu.id = fa.user_id
     LEFT JOIN accounts ta ON ta.id = t.to_account_id   LEFT JOIN users tu ON tu.id = ta.user_id
     WHERE ${where.join(' AND ')}
     ORDER BY t.created_at DESC
     LIMIT $${params.length}`,
    params,
  );

  return rows.map((r) => ({
    id: r.id,
    amountPaise: r.amount_paise,
    direction: r.is_debit ? 'debit' : 'credit',
    counterparty: r.merchant ?? (r.is_debit ? r.to_name : r.from_name) ?? 'Unknown',
    category: r.category,
    status: r.status,
    note: r.note,
    createdAt: r.created_at,
  }));
}

// Money spent per category in a month. The DATABASE does the maths (SUM), not the AI.
export async function spendingByCategory(accountId, month) {
  const { rows } = await query(
    `SELECT category, SUM(amount_paise)::bigint AS total_paise, COUNT(*)::int AS count
     FROM transactions
     WHERE from_account_id = $1 AND status = 'completed'
       AND created_at >= $2::date AND created_at < ($2::date + interval '1 month')
     GROUP BY category
     ORDER BY total_paise DESC`,
    [accountId, `${month}-01`],
  );
  return rows.map((r) => ({ category: r.category, totalPaise: r.total_paise, count: r.count }));
}

export async function incomeForMonth(accountId, month) {
  const { rows } = await query(
    `SELECT COALESCE(SUM(amount_paise), 0)::bigint AS total
     FROM transactions
     WHERE to_account_id = $1 AND status = 'completed'
       AND created_at >= $2::date AND created_at < ($2::date + interval '1 month')`,
    [accountId, `${month}-01`],
  );
  return rows[0].total;
}
