// Integration tests against a REAL Postgres database.
// They run only when TEST_DATABASE_URL is set (GitHub Actions sets it automatically).
// WARNING: they delete all data in that database. Never point this at real data.
import 'dotenv/config';
import { after, before, beforeEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

const url = process.env.TEST_DATABASE_URL;

describe('money transfers on a real database', { skip: !url && 'set TEST_DATABASE_URL to run these tests' }, () => {
  let db;
  let commitTransaction;
  let A; // account ids
  let B;

  const balance = async (id) => (await db.query('SELECT balance_paise FROM accounts WHERE id = $1', [id])).rows[0].balance_paise;
  const pay = (from, to, amountPaise, requestId = randomUUID()) =>
    commitTransaction({ fromAccountId: from, toAccountId: to, amountPaise, requestId, category: 'Transfer' });

  before(async () => {
    process.env.DATABASE_URL = url;
    db = await import('../src/db.js');
    ({ commitTransaction } = await import('../src/services/transfer.js'));
    await db.applySchema();
  });

  // Fresh data before every test: two customers with Rs 1,000 each.
  beforeEach(async () => {
    await db.query(`TRUNCATE audit_log, fraud_alerts, kyc_applications, transactions, beneficiaries,
                    merchant_categories, accounts, users RESTART IDENTITY CASCADE`);
    const ids = [];
    for (const name of ['A', 'B']) {
      const u = await db.query(`INSERT INTO users (name, email, password_hash, kyc_status) VALUES ($1, $2, 'x', 'verified') RETURNING id`, [
        name, `${name}@test.dev`,
      ]);
      const a = await db.query('INSERT INTO accounts (user_id, account_number, balance_paise) VALUES ($1, $2, 100000) RETURNING id', [
        u.rows[0].id, `50100000000${ids.length}`,
      ]);
      await db.query(`INSERT INTO transactions (to_account_id, amount_paise, category, status) VALUES ($1, 100000, 'Deposit', 'completed')`, [
        a.rows[0].id,
      ]);
      ids.push(a.rows[0].id);
    }
    [A, B] = ids;
  });

  after(async () => {
    await db?.closeDb();
  });

  test('a payment bigger than the balance is refused and nothing changes', async () => {
    await assert.rejects(pay(A, B, 100001), /Insufficient balance/);
    assert.equal(await balance(A), 100000);
    assert.equal(await balance(B), 100000);
    const saved = await db.query('SELECT COUNT(*)::int AS n FROM transactions WHERE from_account_id = $1', [A]);
    assert.equal(saved.rows[0].n, 0); // the rollback also removed the transaction row
  });

  test('the same requestId never pays twice, even when sent 5 times at once', async () => {
    const requestId = randomUUID();
    const results = await Promise.all(Array.from({ length: 5 }, () => pay(A, B, 10000, requestId)));
    assert.equal(results.filter((r) => !r.replayed).length, 1);
    assert.equal(await balance(A), 90000);
    assert.equal(await balance(B), 110000);
  });

  test('20 payments of Rs 100 at the same time from Rs 1,000: exactly 10 succeed', async () => {
    const results = await Promise.allSettled(Array.from({ length: 20 }, () => pay(A, B, 10000)));
    assert.equal(results.filter((r) => r.status === 'fulfilled').length, 10);
    assert.equal(await balance(A), 0); // never negative
    assert.equal(await balance(B), 200000);
  });

  test('A->B and B->A at the same time: no deadlock and total money is unchanged', async () => {
    const jobs = [];
    for (let i = 0; i < 15; i++) jobs.push(pay(A, B, 1000), pay(B, A, 1000));
    const results = await Promise.allSettled(jobs);
    assert.equal(results.filter((r) => r.status === 'rejected').length, 0);
    assert.equal((await balance(A)) + (await balance(B)), 200000);
  });

  test('every balance equals money in minus money out (the ledger adds up)', async () => {
    await Promise.allSettled([pay(A, B, 2500), pay(B, A, 700), pay(A, B, 99999999), pay(A, null, 1200)]);
    for (const id of [A, B]) {
      const { rows } = await db.query(
        `SELECT COALESCE(SUM(CASE WHEN to_account_id = $1 THEN amount_paise ELSE 0 END), 0)
              - COALESCE(SUM(CASE WHEN from_account_id = $1 THEN amount_paise ELSE 0 END), 0) AS expected
         FROM transactions WHERE status = 'completed' AND (from_account_id = $1 OR to_account_id = $1)`,
        [id],
      );
      assert.equal(Number(rows[0].expected), await balance(id));
    }
  });
});
