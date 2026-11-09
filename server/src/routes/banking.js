import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { query } from '../db.js';
import { AppError } from '../errors.js';
import { currentMonth, getAccount, isMonth, listTransactions, spendingByCategory } from '../services/accounts.js';
import { ALL_CATEGORIES } from '../services/categorize.js';
import { sendMoney } from '../services/transfer.js';
import { maskAccountNumber } from '../utils/mask.js';

const router = Router();

const paymentLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many payments. Please wait a minute.' },
});

router.get('/account', async (req, res) => {
  const account = await getAccount(req.user.id);
  res.json({
    account: { accountNumber: account.account_number, balancePaise: account.balance_paise },
    kycStatus: req.user.kyc_status,
  });
});

router.get('/beneficiaries', async (req, res) => {
  const { rows } = await query(
    `SELECT b.id, b.nickname, b.account_number, b.created_at, u.name AS holder_name
     FROM beneficiaries b
     JOIN accounts a ON a.account_number = b.account_number
     JOIN users u ON u.id = a.user_id
     WHERE b.user_id = $1 ORDER BY b.nickname`,
    [req.user.id],
  );
  res.json({
    beneficiaries: rows.map((b) => ({
      id: b.id,
      nickname: b.nickname,
      holderName: b.holder_name,
      accountMasked: maskAccountNumber(b.account_number),
      addedAt: b.created_at,
    })),
  });
});

const payeeSchema = z.object({
  nickname: z.string().trim().min(2, 'Nickname is too short').max(40),
  accountNumber: z.string().trim().regex(/^\d{12}$/, 'Account number must be 12 digits'),
});

router.post('/beneficiaries', async (req, res) => {
  const { nickname, accountNumber } = payeeSchema.parse(req.body);
  const own = await getAccount(req.user.id);
  if (own.account_number === accountNumber) throw new AppError(400, 'You cannot add your own account');

  const target = await query('SELECT id FROM accounts WHERE account_number = $1', [accountNumber]);
  if (!target.rows[0]) throw new AppError(404, 'No BankAI account has this number');

  try {
    await query('INSERT INTO beneficiaries (user_id, nickname, account_number) VALUES ($1, $2, $3)', [
      req.user.id, nickname, accountNumber,
    ]);
  } catch (err) {
    if (err.code === '23505') throw new AppError(409, 'This payee is already saved');
    throw err;
  }
  res.status(201).json({ ok: true });
});

router.get('/transactions', async (req, res) => {
  const account = await getAccount(req.user.id);
  const category = ALL_CATEGORIES.includes(req.query.category) ? req.query.category : undefined;
  const transactions = await listTransactions(account.id, { month: req.query.month, category, limit: req.query.limit });
  res.json({ transactions });
});

router.get('/spending', async (req, res) => {
  const account = await getAccount(req.user.id);
  const month = isMonth(req.query.month) ? req.query.month : currentMonth();
  res.json({ month, byCategory: await spendingByCategory(account.id, month) });
});

router.post('/transfers', paymentLimiter, async (req, res) => {
  const { requestId, beneficiaryId, merchant, amount, note } = req.body ?? {};
  const result = await sendMoney({ user: req.user, requestId, beneficiaryId, merchant, amount, note });
  const t = result.transaction;
  const message = t.status === 'on_hold'
    ? 'Payment is on hold for a quick security check. Our team will review it soon.'
    : t.status === 'completed'
      ? 'Payment successful.'
      : 'Payment was rejected';
  res.status(result.replayed ? 200 : 201).json({
    status: t.status,
    message,
    replayed: result.replayed,
    transaction: { id: t.id, amountPaise: t.amount_paise, category: t.category, createdAt: t.created_at },
  });
});

export default router;
