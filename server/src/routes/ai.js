import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { runAssistant } from '../ai/assistant.js';
import { getInsights } from '../ai/insights.js';

const router = Router();

// AI calls cost money, so each IP gets a fair limit.
const aiLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 15,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many AI requests. Please wait a minute.' },
});

router.post('/chat', aiLimiter, async (req, res) => {
  res.json(await runAssistant({ user: req.user, messages: req.body?.messages }));
});

router.get('/insights', aiLimiter, async (req, res) => {
  res.json(await getInsights(req.user, req.query.month));
});

export default router;
