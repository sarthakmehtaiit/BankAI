import { config } from './config.js';
import { createApp } from './app.js';
import { aiEnabled } from './ai/gemini.js';

const app = createApp();

app.listen(config.port, () => {
  console.log(`BankAI API running on http://localhost:${config.port}`);
  if (!aiEnabled()) console.log('GEMINI_API_KEY not set: AI features will use safe fallbacks.');
});
