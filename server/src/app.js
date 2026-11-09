import express from 'express';
import cookieParser from 'cookie-parser';
import multer from 'multer';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ZodError } from 'zod';
import { AppError } from './errors.js';
import { requireAdmin, requireAuth } from './middleware/auth.js';
import authRoutes from './routes/auth.js';
import kycRoutes from './routes/kyc.js';
import bankingRoutes from './routes/banking.js';
import aiRoutes from './routes/ai.js';
import adminRoutes from './routes/admin.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const clientDist = path.resolve(here, '../../client/dist');

export function createApp() {
  const app = express();
  app.set('trust proxy', 1); // Render runs us behind a proxy; needed for correct IPs in rate limits
  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());

  app.get('/api/health', (req, res) => res.json({ ok: true }));
  app.use('/api/auth', authRoutes);
  app.use('/api/kyc', requireAuth, kycRoutes);
  app.use('/api/ai', requireAuth, aiRoutes);
  app.use('/api/admin', requireAuth, requireAdmin, adminRoutes);
  app.use('/api', requireAuth, bankingRoutes);
  app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));

  // In production the API also serves the built React app, so everything is one service on one domain.
  if (fs.existsSync(clientDist)) {
    app.use(express.static(clientDist));
    app.use((req, res, next) => {
      if (req.method === 'GET') return res.sendFile(path.join(clientDist, 'index.html'));
      next();
    });
  }

  app.use(errorHandler);
  return app;
}

// One place that turns every error into a clean JSON response.
// Express 5 sends errors from async handlers here automatically.
function errorHandler(err, req, res, _next) {
  if (err instanceof AppError) {
    return res.status(err.status).json({ error: err.message, code: err.code });
  }
  if (err instanceof ZodError) {
    return res.status(400).json({ error: err.issues[0]?.message || 'Invalid input' });
  }
  if (err instanceof multer.MulterError) {
    const message = err.code === 'LIMIT_FILE_SIZE' ? 'Image must be smaller than 5 MB' : 'Upload failed';
    return res.status(400).json({ error: message });
  }
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Invalid JSON' });
  }
  console.error(err); // unexpected: log the details, but never send them to the user
  res.status(500).json({ error: 'Something went wrong. Please try again.' });
}
