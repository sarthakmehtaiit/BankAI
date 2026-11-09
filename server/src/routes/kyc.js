import { Router } from 'express';
import multer from 'multer';
import { latestKyc, submitKyc } from '../services/kyc.js';

const router = Router();

// The photo is kept in memory (not on disk) while we check it.
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

router.get('/', async (req, res) => {
  res.json({ status: req.user.kyc_status, application: await latestKyc(req.user.id) });
});

router.post('/', upload.single('image'), async (req, res) => {
  const { name, dob, pan } = req.body ?? {};
  const application = await submitKyc({ user: req.user, name, dob, pan, file: req.file });
  res.status(201).json({ status: application.status, application });
});

export default router;
