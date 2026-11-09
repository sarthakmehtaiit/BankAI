import { query, transaction } from '../db.js';
import { AppError } from '../errors.js';
import { toPaise } from '../utils/money.js';
import { getAccount } from './accounts.js';
import { categorizeMerchant } from './categorize.js';
import { checkFraud, explainAlertInBackground, templateExplanation } from './fraud.js';

export const MAX_PAYMENT_PAISE = 2_00_000_00; // Rs 2,00,000 per payment

/**
 * Moves money between two accounts. Must run INSIDE a database transaction.
 *
 * The debit is ONE SQL statement that checks and subtracts at the same time:
 *   UPDATE accounts SET balance = balance - X WHERE id = A AND balance >= X
 * If two payments arrive together, Postgres runs these updates one after the other on
 * that row, so the balance can never go below zero. 0 rows updated = not enough money.
 */
export async function moveMoney(client, fromAccountId, toAccountId, amountPaise) {
  const debit = () =>
    client.query('UPDATE accounts SET balance_paise = balance_paise - $1 WHERE id = $2 AND balance_paise >= $1', [
      amountPaise,
      fromAccountId,
    ]);
  const credit = () =>
    client.query('UPDATE accounts SET balance_paise = balance_paise + $1 WHERE id = $2', [amountPaise, toAccountId]);

  // Always touch the SMALLER account id first. Then A->B and B->A at the same moment lock
  // rows in the same order and can never wait for each other forever (a deadlock).
  let debited;
  if (toAccountId && toAccountId < fromAccountId) {
    await credit();
    debited = await debit(); // if this fails, ROLLBACK also undoes the credit
  } else {
    debited = await debit();
    if (debited.rowCount === 1 && toAccountId) await credit();
  }
  if (debited.rowCount === 0) throw new AppError(400, 'Insufficient balance', 'INSUFFICIENT_FUNDS');
}

async function findByRequestId(fromAccountId, requestId) {
  const { rows } = await query('SELECT * FROM transactions WHERE from_account_id = $1 AND request_id = $2', [
    fromAccountId,
    requestId,
  ]);
  return rows[0] ?? null;
}

/**
 * Saves the payment and moves the money, all in ONE database transaction.
 * If fraud rules fired, the payment is saved as 'on_hold' and NO money moves yet.
 */
export async function commitTransaction({
  fromAccountId, toAccountId = null, merchant = null, amountPaise, requestId, category, note = null, fraudReasons = [], userId = null,
}) {
  const held = fraudReasons.length > 0;
  try {
    return await transaction(async (client) => {
      const { rows } = await client.query(
        `INSERT INTO transactions (request_id, from_account_id, to_account_id, merchant, amount_paise, category, note, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
        [requestId, fromAccountId, toAccountId, merchant, amountPaise, category, note, held ? 'on_hold' : 'completed'],
      );
      const txn = rows[0];
      let alertId = null;

      if (held) {
        const balance = await client.query('SELECT balance_paise FROM accounts WHERE id = $1', [fromAccountId]);
        if (balance.rows[0].balance_paise < amountPaise) throw new AppError(400, 'Insufficient balance', 'INSUFFICIENT_FUNDS');
        const alert = await client.query(
          'INSERT INTO fraud_alerts (transaction_id, reasons, ai_explanation) VALUES ($1, $2, $3) RETURNING id',
          [txn.id, JSON.stringify(fraudReasons), templateExplanation(fraudReasons)],
        );
        alertId = alert.rows[0].id;
      } else {
        await moveMoney(client, fromAccountId, toAccountId, amountPaise);
      }

      await client.query('INSERT INTO audit_log (user_id, action, details) VALUES ($1, $2, $3)', [
        userId, held ? 'PAYMENT_HELD' : 'PAYMENT_DONE', JSON.stringify({ transactionId: txn.id, amountPaise }),
      ]);
      return { transaction: txn, replayed: false, alertId };
    });
  } catch (err) {
    // 23505 = unique violation: a request with the same requestId was saved a moment ago
    // (for example a double click). Return that payment instead of paying twice.
    if (err.code === '23505' && err.constraint === 'transactions_request_unique') {
      const existing = await findByRequestId(fromAccountId, requestId);
      if (existing) return { transaction: existing, replayed: true, alertId: null };
    }
    throw err;
  }
}

/**
 * The full "send money" flow used by the API and the AI assistant's confirm button.
 * Pay a saved payee (beneficiaryId) or a merchant (merchant name).
 */
export async function sendMoney({ user, requestId, beneficiaryId, merchant, amount, note }) {
  if (user.kyc_status !== 'verified') throw new AppError(403, 'Complete your KYC before sending money', 'KYC_REQUIRED');
  if (typeof requestId !== 'string' || requestId.length < 8 || requestId.length > 100) {
    throw new AppError(400, 'Missing or invalid requestId');
  }
  const amountPaise = toPaise(amount);
  if (amountPaise < 100) throw new AppError(400, 'Minimum payment is ₹1');
  if (amountPaise > MAX_PAYMENT_PAISE) throw new AppError(400, 'Maximum payment is ₹2,00,000');
  const cleanNote = note ? String(note).trim().slice(0, 100) : null;

  const from = await getAccount(user.id);

  // Seen this requestId before? Return the earlier result. Nothing is paid twice.
  const existing = await findByRequestId(from.id, requestId);
  if (existing) return { transaction: existing, replayed: true };

  let toAccountId = null;
  let payeeName;
  let payeeAddedAt = null;
  let category;
  let merchantName = null;

  if (beneficiaryId) {
    if (!Number.isInteger(Number(beneficiaryId))) throw new AppError(400, 'Invalid payee');
    const { rows } = await query(
      `SELECT b.nickname, b.created_at, a.id AS account_id
       FROM beneficiaries b JOIN accounts a ON a.account_number = b.account_number
       WHERE b.id = $1 AND b.user_id = $2`,
      [beneficiaryId, user.id],
    );
    if (!rows[0]) throw new AppError(404, 'Payee not found');
    toAccountId = rows[0].account_id;
    payeeName = rows[0].nickname;
    payeeAddedAt = rows[0].created_at.getTime();
    category = 'Transfer';
    if (toAccountId === from.id) throw new AppError(400, 'You cannot pay yourself');
  } else {
    merchantName = String(merchant ?? '').trim();
    if (merchantName.length < 2 || merchantName.length > 60) throw new AppError(400, 'Enter a merchant name');
    payeeName = merchantName;
    // Done BEFORE the database transaction: we never hold DB locks while waiting for the AI.
    category = (await categorizeMerchant(merchantName)).category;
  }

  const history = await query(
    `SELECT amount_paise, created_at FROM transactions
     WHERE from_account_id = $1 AND status = 'completed' AND created_at > now() - interval '90 days'
     ORDER BY created_at`,
    [from.id],
  );
  const fraud = checkFraud({
    amountPaise,
    pastAmounts: history.rows.map((r) => r.amount_paise),
    recentTimestamps: history.rows.map((r) => r.created_at.getTime()),
    payeeAddedAt,
  });

  const result = await commitTransaction({
    fromAccountId: from.id,
    toAccountId,
    merchant: merchantName,
    amountPaise,
    requestId,
    category,
    note: cleanNote,
    fraudReasons: fraud.reasons,
    userId: user.id,
  });

  if (result.alertId) {
    explainAlertInBackground({ alertId: result.alertId, amountPaise, payee: payeeName, reasons: fraud.reasons });
  }
  return result;
}

// Admin decision on a held payment.
export async function reviewAlert({ alertId, adminId, approve }) {
  return transaction(async (client) => {
    // "AND status = 'open'" means two admins clicking at once can't both decide.
    const { rows } = await client.query(
      `UPDATE fraud_alerts SET status = $1, reviewed_by = $2, reviewed_at = now()
       WHERE id = $3 AND status = 'open' RETURNING transaction_id`,
      [approve ? 'approved' : 'rejected', adminId, alertId],
    );
    if (!rows[0]) throw new AppError(409, 'This alert was already reviewed');

    const txn = (await client.query('SELECT * FROM transactions WHERE id = $1', [rows[0].transaction_id])).rows[0];
    if (approve) {
      // Balance is checked again now: the customer may have spent the money meanwhile.
      await moveMoney(client, txn.from_account_id, txn.to_account_id, txn.amount_paise);
      await client.query(`UPDATE transactions SET status = 'completed' WHERE id = $1`, [txn.id]);
    } else {
      await client.query(`UPDATE transactions SET status = 'rejected' WHERE id = $1`, [txn.id]);
    }
    await client.query(`INSERT INTO audit_log (user_id, action, details) VALUES ($1, 'ALERT_REVIEWED', $2)`, [
      adminId, JSON.stringify({ alertId, transactionId: txn.id, approve }),
    ]);
    return { status: approve ? 'approved' : 'rejected' };
  });
}
