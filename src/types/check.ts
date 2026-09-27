// ═══════════════════════════════════════════════════════════════
// FIXMP result model — V2 (canonical) + V1 (legacy) compatibility
// ═══════════════════════════════════════════════════════════════

// ── Canonical ──────────────────────────────────────────────────
export type Severity = "high" | "medium" | "low";
export type VerdictLevel = "stop" | "review" | "clear";

/** Normalized region (0–1000 scale) — maps onto ANY resolution of the same image. */
export interface RedactionRegion {
  yMin: number;
  xMin: number;
  yMax: number;
  xMax: number;
}

export interface VerdictFinding {
  id: string;
  category: string;
  severity: Severity;
  description: string;
  evidence: string;
  action: string;
  count?: number;
  region?: RedactionRegion; // present when the finding is tied to a visible area
  // Stage 2.5 — local engine provenance (additive, backward compatible)
  source?: "local-ocr" | "local-ink" | "local-qr" | "local-exif" | "local-face" | "ai";
  detectionConfidence?: number; // is there something here? (detector-measured)
  readingConfidence?: number;   // how well was the content read? (OCR only)
}

export interface Verdict {
  tool: string;
  original: string;
  riskLevel: VerdictLevel;
  statusText: string;
  summary: string;
  findings: VerdictFinding[];
  dont: string;
  check: string;
  do: string;
  why: string;
  next: string;
  confidence: number;
  limitations: string;
  saferVersion?: string;
  aiUsed?: boolean;
  deepScanStatus?: "full" | "busy" | "off" | "skipped";
}

// ── Legacy (V1) ────────────────────────────────────────────────
export type RiskLevel = "HIGH" | "MEDIUM" | "LOW";

export interface Finding {
  category: string;
  severity: RiskLevel;
  description: string;
  evidence?: string;
  recommendedAction: string;
  region?: RedactionRegion;
}

export interface CheckRequest {
  toolType: "AI" | "POST" | "PHOTO" | "LINK";
  textContent?: string;
  imageBase64?: string;
}

export interface CheckResponse {
  status: string; // "SUCCESS" | "ERROR" | "AI_OFF"
  riskLevel: RiskLevel;
  summary: string;
  findings: Finding[];
  dont: string;
  check: string;
  do: string;
  why: string;
  next: string;
  confidence: number;
  limitations: string;
  saferVersion?: string;
  aiUsed?: boolean;
  deepScanStatus?: "full" | "busy" | "off" | "skipped";
statusText?: string; // optional tool-specific wording (Link Check uses spec §8 labels)
}