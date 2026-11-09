import { config } from './config.js';
import { createApp } from './app.js';
import { aiEnabled } from './ai/gemini.js';
import { applySchema, query } from './db.js';

// Make sure all tables exist before taking requests (safe to run on every start).
await applySchema();

// On a fresh hosted database (like Render's), load the demo data once.
if (process.env.SEED_DEMO_DATA === 'true') {
  const { rows } = await query('SELECT COUNT(*)::int AS n FROM users');
  if (rows[0].n === 0) {
    const { seedDemoData } = await import('../scripts/seed.js');
    await seedDemoData();
    console.log('Empty database: demo data loaded.');
  }
}

const app = createApp();

app.listen(config.port, () => {
  console.log(`BankAI API running on http://localhost:${config.port}`);
  if (!aiEnabled()) console.log('GEMINI_API_KEY not set: AI features will use safe fallbacks.');
});
