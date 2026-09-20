import { CheckRequest, CheckResponse, RiskLevel, Finding } from "@/types/check";
import { runDeterministicChecks } from "@/lib/deterministic-checks";

export async function processCheck(request: CheckRequest): Promise<CheckResponse> {
  try {
    let findings: Finding[] = [];
    
    // 1. Run deterministic checks on text content
    if (request.textContent) {
      findings = runDeterministicChecks(request.textContent);
    }

    // 2. Determine overall risk level based on findings
    const riskLevel = calculateOverallRisk(findings);

    // 3. Generate the FixMP structured response
    const response = generateFixMPResponse(request.toolType, riskLevel, findings);

    return response;
  } catch (error) {
    console.error("Check Engine Error:", error);
    return {
      status: "ERROR",
      riskLevel: "MEDIUM",
      summary: "We encountered an issue while checking your content.",
      findings: [],
      dont: "Do not proceed with the action yet.",
      check: "Try again or simplify your input.",
      do: "Review your content manually for sensitive information.",
      why: "The automated checking system temporarily failed.",
      next: "Refresh the page and try again.",
      confidence: 0.0,
      limitations: "Automated check failed.",
    };
  }
}

function calculateOverallRisk(findings: Finding[]): RiskLevel {
  if (findings.some((f) => f.severity === "HIGH")) return "HIGH";
  if (findings.some((f) => f.severity === "MEDIUM")) return "MEDIUM";
  return "LOW";
}

function generateFixMPResponse(
  toolType: CheckRequest["toolType"],
  riskLevel: RiskLevel,
  findings: Finding[]
): CheckResponse {
  const count = findings.length;
  
  let dont = "Proceed with caution.";
  let check = "Review the content for any personal context.";
  let doAction = "Double-check the details before you act.";
  let why = "It's always best to pause and verify before taking digital action.";
  let next = "Review the findings above and adjust your content.";

  if (riskLevel === "HIGH") {
    dont = "DO NOT share, send, or post this content in its current form.";
    check = "The specific high-risk items flagged in the findings.";
    doAction = "Remove or redact the flagged sensitive information immediately.";
    why = "Sharing this could lead to privacy breaches, financial loss, or identity theft.";
    next = "Edit your content to remove the flagged items, then run the check again.";
  } else if (riskLevel === "MEDIUM") {
    dont = "Avoid sharing this publicly without reviewing the flagged items.";
    check = "The medium-risk items that might expose more than you intend.";
    doAction = "Consider removing or generalizing the flagged information.";
    why = "While not immediately critical, this information could be used to profile or contact you.";
    next = "Decide if this information is necessary for your intended action.";
  }

  return {
    status: "SUCCESS",
    riskLevel,
    summary: count === 0 
      ? "No obvious red flags detected by our standard checks." 
      : `We found ${count} thing${count === 1 ? "" : "s"} to check.`,
    findings,
    dont,
    check: check,
    do: doAction,
    why,
    next,
    confidence: count === 0 ? 0.8 : 0.95, // Deterministic checks are highly confident
    limitations: "This is an automated check. It may not catch context-specific risks or hidden metadata.",
  };
}