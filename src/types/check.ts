// ═══════════════════════════════════════════════════════════════
// FIXMP result model — V2 (canonical) + V1 (legacy) compatibility
//
// CANONICAL (used by all redesigned UI):
//   Severity, VerdictLevel, VerdictFinding, Verdict
//
// LEGACY (still produced by V1 API routes + services; kept so
// check-engine, deterministic-checks, CheckResult and the
// not-yet-redesigned pages keep compiling):
//   RiskLevel, Finding, CheckRequest, CheckResponse
// ═══════════════════════════════════════════════════════════════

// ── Canonical ──────────────────────────────────────────────────
export type Severity = "high" | "medium" | "low";
export type VerdictLevel = "stop" | "review" | "clear";

export interface VerdictFinding {
  id: string;
  category: string;
  severity: Severity;
  description: string;
  evidence: string; // always masked — never the full value
  action: string;
  count?: number;
}

export interface Verdict {
  tool: string;
  original: string;
  riskLevel: VerdictLevel;
  statusText: string;
  summary: string;
  findings: VerdictFinding[];
  dont: string; // 🚫
  check: string; // ⚠️
  do: string; // ✅
  why: string; // 🔍
  next: string; // ➡️
  confidence: number;
  limitations: string;
  saferVersion?: string;
  aiUsed?: boolean; // NEW
}

// ── Legacy (V1) ────────────────────────────────────────────────
export type RiskLevel = "HIGH" | "MEDIUM" | "LOW";

export interface Finding {
  category: string;
  severity: RiskLevel;
  description: string;
  evidence?: string;
  recommendedAction: string;
}

export interface CheckRequest {
  toolType: "AI" | "POST" | "PHOTO" | "LINK";
  textContent?: string;
  imageBase64?: string;
}

export interface CheckResponse {
  status: string; // "SUCCESS" | "ERROR"
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
aiUsed?: boolean; // NEW — true only when Gemini actually processed this check
}