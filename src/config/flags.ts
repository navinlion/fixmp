/**
 * FIXMP feature flags & cost-control configuration.
 * Spec: cost safety kill switches — flip any to false without taking the site down.
 */

// ── Testing ────────────────────────────────────────────────
// While true: test banner shows, honest "local only" copy is used.
export const TEST_MODE = true;

// ── Kill switches (all OFF until launch — ₹0 API spend) ────
export const AI_ENABLED = false;
export const IMAGE_ANALYSIS_ENABLED = false;
export const URL_ANALYSIS_ENABLED = false; // remote reputation APIs off; local heuristics only

// ── Configurable limits (spec §13) ─────────────────────────
export const LIMITS = {
  MAX_TEXT_LENGTH: 10_000,
  MAX_IMAGE_SIZE_MB: 8,
  MAX_DOCUMENT_SIZE_MB: 5,
  MAX_CHECKS_PER_DAY: 25, // per browser during testing; move server-side at launch
} as const;