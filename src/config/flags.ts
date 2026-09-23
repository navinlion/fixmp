/**
 * FIXMP feature flags & cost-control configuration.
 * Client flags are env-driven so UI copy always matches server reality.
 * Server routes read the non-prefixed vars directly from process.env.
 */

// ── Testing ──────────────────────────────────────────────────
// TEST BUILD banner. Hide with NEXT_PUBLIC_TEST_MODE=false
export const TEST_MODE = process.env.NEXT_PUBLIC_TEST_MODE !== "false";

// ── Kill switches — browser-safe mirrors (public booleans only) ──
// MUST match the server-side flags in .env.local (AI_ENABLED etc.)
export const AI_ENABLED = process.env.NEXT_PUBLIC_AI_ENABLED === "true";
export const IMAGE_ANALYSIS_ENABLED =
  process.env.NEXT_PUBLIC_IMAGE_ANALYSIS_ENABLED === "true";
export const URL_ANALYSIS_ENABLED =
  process.env.NEXT_PUBLIC_URL_ANALYSIS_ENABLED === "true";
// Media Forensics runs entirely in the browser (no API cost), so unlike the
// AI-backed flags above it defaults ON and is opt-OUT via env if ever needed.
export const MEDIA_FORENSICS_ENABLED =
  process.env.NEXT_PUBLIC_MEDIA_FORENSICS_ENABLED !== "false";

// ── Configurable limits (spec §13) ───────────────────────────
export const LIMITS = {
  MAX_TEXT_LENGTH: 10_000,
  MAX_IMAGE_SIZE_MB: 8,
  MAX_DOCUMENT_SIZE_MB: 5,
  MAX_CHECKS_PER_DAY: 25, // per browser during testing; server-side at launch
} as const;