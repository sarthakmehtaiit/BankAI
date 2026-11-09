import { query } from '../db.js';
import { askJson } from '../ai/gemini.js';
import { maskSensitive } from '../utils/mask.js';

// Categories a customer can SPEND money on.
export const SPENDING_CATEGORIES = ['Food', 'Groceries', 'Travel', 'Shopping', 'Bills', 'Entertainment', 'Health', 'Rent', 'Other'];
// Plus categories used by the bank itself.
export const ALL_CATEGORIES = [...SPENDING_CATEGORIES, 'Transfer', 'Salary', 'Deposit'];

// Step 1: simple keyword rules. Fast, free and predictable.
// Groceries comes before Food so "Swiggy Instamart" is Groceries, not Food.
const KEYWORDS = {
  Groceries: ['blinkit', 'bigbasket', 'zepto', 'dmart', 'instamart', 'grocery', 'supermarket', 'kirana'],
  Food: ['swiggy', 'zomato', 'dominos', 'mcdonald', 'kfc', 'pizza', 'starbucks', 'cafe', 'restaurant', 'biryani'],
  Travel: ['uber', 'ola', 'rapido', 'irctc', 'indigo', 'makemytrip', 'redbus', 'metro', 'petrol', 'fuel'],
  Shopping: ['amazon', 'flipkart', 'myntra', 'ajio', 'nykaa', 'meesho', 'croma'],
  Bills: ['airtel', 'jio', 'vodafone', 'electricity', 'bescom', 'broadband', 'recharge', 'gas bill', 'water bill'],
  Entertainment: ['netflix', 'spotify', 'hotstar', 'bookmyshow', 'pvr', 'prime video'],
  Health: ['apollo', 'pharmeasy', '1mg', 'medplus', 'hospital', 'clinic', 'pharmacy'],
  Rent: ['rent', 'nobroker'],
};

// Whole-word match, so "Coca Cola" does not match "ola".
export function ruleCategory(merchant) {
  const name = String(merchant).toLowerCase();
  for (const [category, words] of Object.entries(KEYWORDS)) {
    if (words.some((word) => new RegExp(`\\b${word}\\b`).test(name))) return category;
  }
  return null;
}

/**
 * Rules first -> then our saved answers (cache) -> only then ask Gemini.
 * Most payments never reach the AI, which keeps cost and delay low.
 */
export async function categorizeMerchant(merchant) {
  const key = String(merchant).trim().toLowerCase();

  const fromRule = ruleCategory(key);
  if (fromRule) return { category: fromRule, source: 'rule' };

  const cached = await query('SELECT category FROM merchant_categories WHERE merchant_key = $1', [key]);
  if (cached.rows[0]) return { category: cached.rows[0].category, source: 'cache' };

  try {
    const { category } = await askJson({
      prompt: `Which spending category best fits the Indian merchant "${maskSensitive(merchant)}"?`,
      schema: {
        type: 'OBJECT',
        properties: { category: { type: 'STRING', enum: SPENDING_CATEGORIES } },
        required: ['category'],
      },
    });
    if (!SPENDING_CATEGORIES.includes(category)) return { category: 'Other', source: 'fallback' };
    await query(
      'INSERT INTO merchant_categories (merchant_key, category) VALUES ($1, $2) ON CONFLICT (merchant_key) DO NOTHING',
      [key, category],
    );
    return { category, source: 'ai' };
  } catch {
    // No AI? The payment still goes through, just as "Other". We don't cache this, so we retry next time.
    return { category: 'Other', source: 'fallback' };
  }
}
