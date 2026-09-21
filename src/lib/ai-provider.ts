import { createGoogleGenerativeAI } from '@ai-sdk/google';

const google = createGoogleGenerativeAI({
  apiKey: process.env.GEMINI_API_KEY || '',
});

// Primary model — overridable via .env.local (GEMINI_MODEL=<id>)
export const aiModel = google(process.env.GEMINI_MODEL || 'gemini-3.6-flash');

// Overload failover: when the primary is busy, we retry once on a DIFFERENT
// flash model. Overload is per-model, so this roughly doubles availability.
// Set GEMINI_MODEL_FALLBACK in .env.local to another flash id from your
// models list. If unset, failover is simply skipped (harmless).
export const aiModelFallback = process.env.GEMINI_MODEL_FALLBACK
  ? google(process.env.GEMINI_MODEL_FALLBACK)
  : null;