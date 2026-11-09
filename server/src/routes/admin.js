import { Router } from 'express';
import { query } from '../db.js';
import { AppError } from '../errors.js';
import { decideKyc, UPLOAD_DIR } from '../services/kyc.js';
import { reviewAlert } from '../services/transfer.js';

const router = Router();

function parseId(value) {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) throw new AppError(400, 'Invalid id');
  return id;
}

// ---------- Fraud alerts ----------

router.get('/alerts', async (req, res) => {
  const status = ['open', 'approved', 'rejected'].includes(req.query.status) ? req.query.status : 'open';
  const { rows } = await query(
    `SELECT al.id, al.reasons, al.ai_explanation, al.status, al.created_at,
            t.id AS transaction_id, t.amount_paise, t.merchant, t.note,
            fu.name AS from_name, fu.email AS from_email, tu.name AS to_name
     FROM fraud_alerts al
     JOIN transactions t ON t.id = al.transaction_id
     JOIN accounts fa ON fa.id = t.from_account_id
     JOIN users fu ON fu.id = fa.user_id
     LEFT JOIN accounts ta ON ta.id = t.to_account_id
     LEFT JOIN users tu ON tu.id = ta.user_id
     WHERE al.status = $1
     ORDER BY al.created_at DESC
     LIMIT 50`,
    [status],
  );
  res.json({
    alerts: rows.map((r) => ({
      id: r.id,
      status: r.status,
      createdAt: r.created_at,
      reasons: r.reasons,
      explanation: r.ai_explanation,
      amountPaise: r.amount_paise,
      from: { name: r.from_name, email: r.from_email },
      to: r.merchant ?? r.to_name,
      note: r.note,
    })),
  });
});

router.post('/alerts/:id/approve', async (req, res) => {
  res.json(await reviewAlert({ alertId: parseId(req.params.id), adminId: req.user.id, approve: true }));
});

router.post('/alerts/:id/reject', async (req, res) => {
  res.json(await reviewAlert({ alertId: parseId(req.params.id), adminId: req.user.id, approve: false }));
});

// ---------- KYC review queue ----------

router.get('/kyc', async (req, res) => {
  const status = ['needs_review', 'verified', 'rejected'].includes(req.query.status) ? req.query.status : 'needs_review';
  const { rows } = await query(
    `SELECT k.id, k.entered_name, k.entered_dob, k.pan_masked, k.extracted, k.checks, k.status, k.reason,
            k.created_at, (k.image_path IS NOT NULL) AS has_image, u.name AS user_name, u.email
     FROM kyc_applications k JOIN users u ON u.id = k.user_id
     WHERE k.status = $1
     ORDER BY k.created_at DESC
     LIMIT 50`,
    [status],
  );
  res.json({
    applications: rows.map((r) => ({
      id: r.id,
      user: { name: r.user_name, email: r.email },
      entered: { name: r.entered_name, dob: r.entered_dob, pan: r.pan_masked },
      extracted: r.extracted,
      checks: r.checks,
      status: r.status,
      reason: r.reason,
      hasImage: r.has_image,
      createdAt: r.created_at,
    })),
  });
});

router.get('/kyc/:id/image', async (req, res) => {
  const { rows } = await query('SELECT image_path FROM kyc_applications WHERE id = $1', [parseId(req.params.id)]);
  if (!rows[0]?.image_path) throw new AppError(404, 'No image stored for this application');
  res.set('Cache-Control', 'no-store');
  res.sendFile(rows[0].image_path, { root: UPLOAD_DIR });
});

router.post('/kyc/:id/approve', async (req, res) => {
  res.json(await decideKyc({ applicationId: parseId(req.params.id), adminId: req.user.id, approve: true }));
});

router.post('/kyc/:id/reject', async (req, res) => {
  res.json(await decideKyc({ applicationId: parseId(req.params.id), adminId: req.user.id, approve: false }));
});

export default router;
