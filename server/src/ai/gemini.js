import { config } from '../config.js';

// We call Gemini's REST API directly with fetch: no SDK, nothing hidden.
const BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models';

// "Busy" answers worth retrying on another model: rate limited, server error, overloaded.
const RETRYABLE_STATUS = [429, 500, 503];

export function aiEnabled() {
  return Boolean(config.geminiApiKey);
}

async function requestModel(model, body, timeoutMs) {
  let res;
  try {
    res = await fetch(`${BASE_URL}/${model}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': config.geminiApiKey },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs), // never let a slow AI hang our server
    });
  } catch (err) {
    const error = new Error(`Gemini ${model} did not answer: ${err.message}`);
    error.retryable = true; // timeout or network problem
    throw error;
  }
  if (!res.ok) {
    const detail = await res.text();
    const error = new Error(`Gemini ${model} error ${res.status}: ${detail.replace(/\s+/g, ' ').slice(0, 200)}`);
    error.retryable = RETRYABLE_STATUS.includes(res.status);
    throw error;
  }
  return res.json();
}

/**
 * One request to Gemini.
 *  - system:   instructions for the model
 *  - contents: the conversation, as [{ role: 'user' | 'model', parts: [...] }]
 *  - tools:    functions the model may ask us to run (function calling)
 *  - schema:   if given, the model must reply with JSON that matches this schema
 *
 * If the main model is busy or too slow, we try the backup model once.
 * If both fail, the caller falls back to non-AI behaviour.
 */
export async function callGemini({ system, contents, tools, schema, timeoutMs = 20000 }) {
  if (!aiEnabled()) throw new Error('GEMINI_API_KEY is not set');

  const body = { contents, generationConfig: {} };
  if (system) body.systemInstruction = { parts: [{ text: system }] };
  if (tools) body.tools = [{ functionDeclarations: tools }];
  if (schema) Object.assign(body.generationConfig, { responseMimeType: 'application/json', responseSchema: schema });
  // Less "thinking" = faster answers. Our tasks are simple (read a card, pick a category).
  if (config.geminiThinking) body.generationConfig.thinkingConfig = { thinkingLevel: config.geminiThinking };

  const models = [...new Set([config.geminiModel, config.geminiFallbackModel].filter(Boolean))];
  let lastError;
  for (const model of models) {
    try {
      const data = await requestModel(model, body, timeoutMs);
      const content = data.candidates?.[0]?.content ?? { role: 'model', parts: [] };
      const parts = content.parts ?? [];
      return {
        content, // the model's full turn, needed to continue a function-calling conversation
        text: parts.filter((p) => p.text && !p.thought).map((p) => p.text).join('').trim(),
        functionCalls: parts.filter((p) => p.functionCall).map((p) => p.functionCall),
      };
    } catch (err) {
      lastError = err;
      if (!err.retryable) break;
      console.warn(`${err.message}. Trying the next model.`);
    }
  }
  throw lastError;
}

// Ask a one-off question and get JSON back (structured output).
export async function askJson({ prompt, parts, schema, system }) {
  const { text } = await callGemini({
    system,
    schema,
    contents: [{ role: 'user', parts: parts ?? [{ text: prompt }] }],
  });
  return JSON.parse(text);
}
