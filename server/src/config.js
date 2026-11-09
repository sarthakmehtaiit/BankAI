import 'dotenv/config';

const isProduction = process.env.NODE_ENV === 'production';

// In development we allow simple defaults. In production a missing secret stops the server.
function secret(name, devDefault) {
  const value = process.env[name];
  if (value) return value;
  if (isProduction) throw new Error(`${name} must be set in production`);
  return devDefault;
}

export const config = {
  port: Number(process.env.PORT) || 4000,
  isProduction,
  jwtSecret: secret('JWT_SECRET', 'dev-only-jwt-secret'),
  panHashSecret: secret('PAN_HASH_SECRET', 'dev-only-pan-secret'),
  geminiApiKey: process.env.GEMINI_API_KEY || '',
  geminiModel: process.env.GEMINI_MODEL || 'gemini-3.5-flash',
  geminiFallbackModel: process.env.GEMINI_FALLBACK_MODEL ?? 'gemini-3.1-flash-lite',
  geminiThinking: process.env.GEMINI_THINKING ?? 'minimal',
};
