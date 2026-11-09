import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { query } from '../db.js';
import { AppError } from '../errors.js';

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

// The JWT lives in an HTTP-only cookie: JavaScript in the page cannot read it,
// so an XSS bug cannot steal the session. sameSite=lax blocks most CSRF attacks.
export function setAuthCookie(res, user) {
  const token = jwt.sign({ userId: user.id }, config.jwtSecret, { expiresIn: '1d' });
  res.cookie('token', token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.isProduction,
    maxAge: ONE_DAY_MS,
  });
}

export function clearAuthCookie(res) {
  res.clearCookie('token', { httpOnly: true, sameSite: 'lax', secure: config.isProduction });
}

// Checks the cookie and loads the user fresh from the database on every request,
// so a change in KYC status or role takes effect immediately.
export async function requireAuth(req, res, next) {
  const token = req.cookies?.token;
  if (!token) throw new AppError(401, 'Please log in');

  let payload;
  try {
    payload = jwt.verify(token, config.jwtSecret);
  } catch {
    throw new AppError(401, 'Your session has expired. Please log in again');
  }

  const { rows } = await query('SELECT id, name, email, role, kyc_status FROM users WHERE id = $1', [payload.userId]);
  if (!rows[0]) throw new AppError(401, 'Please log in');
  req.user = rows[0];
  next();
}

export function requireAdmin(req, res, next) {
  if (req.user?.role !== 'admin') throw new AppError(403, 'Admins only');
  next();
}
