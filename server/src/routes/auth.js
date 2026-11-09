import { Router } from 'express';
import bcrypt from 'bcryptjs';
import rateLimit from 'express-rate-limit';
import { randomInt } from 'node:crypto';
import { z } from 'zod';
import { query, transaction } from '../db.js';
import { AppError } from '../errors.js';
import { clearAuthCookie, requireAuth, setAuthCookie } from '../middleware/auth.js';

const router = Router();

// Slows down password guessing: at most 10 tries per 15 minutes per IP.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many attempts. Please try again in 15 minutes.' },
});

const signupSchema = z.object({
  name: z.string().trim().min(2, 'Name is too short').max(60),
  email: z.string().trim().toLowerCase().email('Enter a valid email'),
  password: z.string().min(8, 'Password must be at least 8 characters').max(100),
});

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email('Enter a valid email'),
  password: z.string().min(1, 'Enter your password'),
});

// 12-digit account number starting with 5010
function newAccountNumber() {
  return '5010' + String(randomInt(0, 100_000_000)).padStart(8, '0');
}

router.post('/signup', authLimiter, async (req, res) => {
  const { name, email, password } = signupSchema.parse(req.body);
  const passwordHash = await bcrypt.hash(password, 10);

  let user;
  try {
    // User and account are created together: never a user without an account.
    user = await transaction(async (client) => {
      const { rows } = await client.query(
        `INSERT INTO users (name, email, password_hash) VALUES ($1, $2, $3)
         RETURNING id, name, email, role, kyc_status`,
        [name, email, passwordHash],
      );
      await client.query('INSERT INTO accounts (user_id, account_number) VALUES ($1, $2)', [rows[0].id, newAccountNumber()]);
      await client.query(`INSERT INTO audit_log (user_id, action) VALUES ($1, 'SIGNUP')`, [rows[0].id]);
      return rows[0];
    });
  } catch (err) {
    if (err.code === '23505') throw new AppError(409, 'This email is already registered');
    throw err;
  }

  setAuthCookie(res, user);
  res.status(201).json({ user });
});

router.post('/login', authLimiter, async (req, res) => {
  const { email, password } = loginSchema.parse(req.body);
  const { rows } = await query('SELECT id, name, email, role, kyc_status, password_hash FROM users WHERE email = $1', [email]);
  const found = rows[0];

  // Same message for "no such email" and "wrong password", so attackers can't find valid emails.
  if (!found || !(await bcrypt.compare(password, found.password_hash))) {
    throw new AppError(401, 'Wrong email or password');
  }

  await query(`INSERT INTO audit_log (user_id, action) VALUES ($1, 'LOGIN')`, [found.id]);
  const { password_hash: _hidden, ...user } = found;
  setAuthCookie(res, user);
  res.json({ user });
});

router.post('/logout', (req, res) => {
  clearAuthCookie(res);
  res.json({ ok: true });
});

router.get('/me', requireAuth, (req, res) => {
  res.json({ user: req.user });
});

export default router;
