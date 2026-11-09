import { AppError } from '../errors.js';

// We store money as whole paise (Rs 1 = 100 paise) and never use floating point.
// In JavaScript 0.1 + 0.2 = 0.30000000000000004, which is not acceptable for a bank.

// "499.50" -> 49950. Parsed as text, so no float maths is involved at all.
export function toPaise(input) {
  const text = String(input ?? '').trim();
  if (!/^\d{1,9}(\.\d{1,2})?$/.test(text)) {
    throw new AppError(400, 'Enter a valid amount, like 500 or 499.50');
  }
  const [rupees, paise = ''] = text.split('.');
  return Number(rupees) * 100 + Number(paise.padEnd(2, '0'));
}

// 49950 -> "₹499.50" (Indian digit grouping: ₹1,00,000.00)
export function formatRupees(paise) {
  return '₹' + (paise / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// 49950 -> "499.50" (for sending an amount back into toPaise)
export function paiseToRupeeText(paise) {
  return `${Math.floor(paise / 100)}.${String(paise % 100).padStart(2, '0')}`;
}
