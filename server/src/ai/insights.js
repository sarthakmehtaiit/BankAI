import { aiEnabled, askJson } from './gemini.js';
import { currentMonth, getAccount, incomeForMonth, isMonth, previousMonth, spendingByCategory } from '../services/accounts.js';

// Code does the maths. AI writes the words.
// All totals come from SQL. Gemini only turns those exact numbers into a summary and tips.

const rupees = (paise) => Math.round(paise / 100);

export async function getInsights(user, monthInput) {
  const month = isMonth(monthInput) ? monthInput : currentMonth();
  const lastMonth = previousMonth(month);
  const account = await getAccount(user.id);

  const [current, previous, incomePaise] = await Promise.all([
    spendingByCategory(account.id, month),
    spendingByCategory(account.id, lastMonth),
    incomeForMonth(account.id, month),
  ]);

  const previousByCategory = Object.fromEntries(previous.map((p) => [p.category, p.totalPaise]));
  const categories = [...new Set([...current.map((c) => c.category), ...previous.map((p) => p.category)])];
  const byCategory = categories.map((category) => ({
    category,
    totalPaise: current.find((c) => c.category === category)?.totalPaise ?? 0,
    previousPaise: previousByCategory[category] ?? 0,
  }));

  const totalPaise = current.reduce((sum, c) => sum + c.totalPaise, 0);
  const previousTotalPaise = previous.reduce((sum, p) => sum + p.totalPaise, 0);

  let summary = null;
  let tips = [];
  let aiAvailable = aiEnabled();

  if (aiAvailable && totalPaise > 0) {
    const facts = {
      month,
      income: rupees(incomePaise),
      totalSpent: rupees(totalPaise),
      totalSpentLastMonth: rupees(previousTotalPaise),
      byCategory: byCategory.map((c) => ({ category: c.category, thisMonth: rupees(c.totalPaise), lastMonth: rupees(c.previousPaise) })),
    };
    try {
      const out = await askJson({
        prompt:
          'Here is a bank customer\'s spending in rupees, already calculated by the bank (do not recalculate):\n' +
          JSON.stringify(facts) +
          '\nWrite a one-sentence summary and exactly 3 short, specific, friendly money-saving tips in simple English. ' +
          'Mention real categories and amounts from the data. No investment advice.',
        schema: {
          type: 'OBJECT',
          properties: { summary: { type: 'STRING' }, tips: { type: 'ARRAY', items: { type: 'STRING' } } },
          required: ['summary', 'tips'],
        },
      });
      summary = out.summary;
      tips = (out.tips ?? []).slice(0, 3);
    } catch (err) {
      console.warn('Insights AI failed:', err.message);
      aiAvailable = false;
    }
  }

  return { month, previousMonth: lastMonth, incomePaise, totalPaise, previousTotalPaise, byCategory, summary, tips, aiAvailable };
}
