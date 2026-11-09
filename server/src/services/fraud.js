import { query } from '../db.js';
import { askJson } from '../ai/gemini.js';
import { formatRupees } from '../utils/money.js';

// Rules DECIDE, the AI only EXPLAINS. Bank decisions must be predictable and auditable.

export const RULES = {
  LARGE_MULTIPLIER: 3, // flag if amount > 3 x the customer's average payment
  MIN_HISTORY: 5, // need at least 5 past payments before "unusual" means anything
  BURST_WINDOW_MS: 10 * 60 * 1000, // 10 minutes
  BURST_LIMIT: 5, // more than 5 payments in 10 minutes is suspicious
  NEW_PAYEE_HOURS: 24,
  NEW_PAYEE_LIMIT_PAISE: 10_000_00, // Rs 10,000
};

// Binary search: index of the first timestamp >= target. O(log n).
// `sorted` must be in ascending order.
export function lowerBound(sorted, target) {
  let lo = 0;
  let hi = sorted.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (sorted[mid] < target) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

// Sliding window: how many payments happened in the last `windowMs`?
// The window always ends "now" and slides forward with time; older payments fall out.
export function countInWindow(sortedTimestamps, now, windowMs) {
  return sortedTimestamps.length - lowerBound(sortedTimestamps, now - windowMs);
}

/**
 * pastAmounts:      amounts (paise) of the customer's completed payments in the last 90 days
 * recentTimestamps: times (ms) of those payments, oldest first
 * payeeAddedAt:     when the payee was saved (ms), or null for merchant payments
 */
export function checkFraud({ amountPaise, pastAmounts, recentTimestamps, payeeAddedAt = null, now = Date.now() }) {
  const reasons = [];

  if (pastAmounts.length >= RULES.MIN_HISTORY) {
    const average = pastAmounts.reduce((sum, a) => sum + a, 0) / pastAmounts.length;
    if (amountPaise > RULES.LARGE_MULTIPLIER * average) {
      reasons.push({
        code: 'LARGE_AMOUNT',
        message: `Amount is ${(amountPaise / average).toFixed(1)}x this customer's average payment of ${formatRupees(Math.round(average))}`,
      });
    }
  }

  const paymentsInWindow = countInWindow(recentTimestamps, now, RULES.BURST_WINDOW_MS) + 1; // +1 = this payment
  if (paymentsInWindow > RULES.BURST_LIMIT) {
    reasons.push({
      code: 'TOO_FAST',
      message: `${paymentsInWindow} payments in the last 10 minutes (limit is ${RULES.BURST_LIMIT})`,
    });
  }

  const payeeIsNew = payeeAddedAt !== null && now - payeeAddedAt < RULES.NEW_PAYEE_HOURS * 60 * 60 * 1000;
  if (payeeIsNew && amountPaise > RULES.NEW_PAYEE_LIMIT_PAISE) {
    reasons.push({
      code: 'NEW_PAYEE_LARGE',
      message: `Large payment of ${formatRupees(amountPaise)} to a payee added less than 24 hours ago`,
    });
  }

  return { flagged: reasons.length > 0, reasons };
}

// Used straight away, so the alert always has a readable explanation, even without AI.
export function templateExplanation(reasons) {
  return `Held because: ${reasons.map((r) => r.message).join('; ')}.`;
}

// After the payment is saved, ask Gemini for a clearer note for the analyst.
// Runs in the background: a slow or failed AI never delays or breaks a payment.
export function explainAlertInBackground({ alertId, amountPaise, payee, reasons }) {
  askJson({
    prompt:
      `A bank's fraud rules held a payment of ${formatRupees(amountPaise)} to "${payee}". ` +
      `Rules that fired: ${reasons.map((r) => r.message).join('; ')}. ` +
      'Write 2 short sentences for a fraud analyst: why it looks risky, and what to check before releasing it. ' +
      'Do not decide whether to approve it.',
    schema: { type: 'OBJECT', properties: { explanation: { type: 'STRING' } }, required: ['explanation'] },
  })
    .then(({ explanation }) => query('UPDATE fraud_alerts SET ai_explanation = $1 WHERE id = $2', [explanation, alertId]))
    .catch(() => {}); // the template explanation stays
}
