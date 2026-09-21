import type { CheckResponse, Severity, Verdict, VerdictLevel, RiskLevel } from "@/types/check";

const LEVEL_MAP: Record<RiskLevel, VerdictLevel> = {
  HIGH: "stop",
  MEDIUM: "review",
  LOW: "clear",
};

const STATUS_MAP: Record<RiskLevel, string> = {
  HIGH: "PAUSE BEFORE YOU ACT",
  MEDIUM: "A FEW THINGS TO REVIEW",
  LOW: "NO OBVIOUS RED FLAGS",
};

/** Converts a V1 API CheckResponse into the canonical V2 Verdict for the UI. */
export function toVerdict(res: CheckResponse, original: string, tool: string): Verdict {
  return {
    tool,
    original,
    riskLevel: LEVEL_MAP[res.riskLevel] ?? "review",
        statusText: res.statusText ?? STATUS_MAP[res.riskLevel] ?? "A FEW THINGS TO REVIEW",
    summary: res.summary,
    findings: (res.findings ?? []).map((f, i) => ({
      id: `f-${i}-${f.category.toLowerCase().replace(/\W+/g, "-")}`,
      category: f.category,
      severity: f.severity.toLowerCase() as Severity,
      description: f.description,
      evidence: f.evidence ?? "",
      action: f.recommendedAction,
      region: f.region,
    })),
    dont: res.dont,
    check: res.check,
    do: res.do,
    why: res.why,
    next: res.next,
    confidence: res.confidence,
    limitations: res.limitations,
    saferVersion: res.saferVersion,
    aiUsed: res.aiUsed,
deepScanStatus: res.deepScanStatus, // NEW
  };
}