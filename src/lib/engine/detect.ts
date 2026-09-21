import type { VerdictFinding, VerdictLevel, Severity, Verdict } from "@/types/check";

// ─── Pattern table ─────────────────────────────────────────────────────────
// Ordered: specific/high-severity patterns run first so they claim text
// before looser patterns can mask it. Tune during testing (spec Phase 13).

interface Pattern {
  id: string;
  category: string;
  severity: Severity;
  regex: RegExp;
  description: string;
  action: string;
  label: string; // replacement in the safer version
}

const PATTERNS: Pattern[] = [
  {
    id: "password",
    category: "Password or passphrase",
    severity: "high",
    regex: /\b(password|passwd|pwd|pass)\s*[:=]\s*\S+/gi,
    description: "It looks like a password is written out in this text.",
    action: "Delete it. If it was ever shared anywhere, change that password.",
    label: "[password removed]",
  },
  {
    id: "api-key",
    category: "API key or token",
    severity: "high",
    regex:
      /\b(sk-[A-Za-z0-9_-]{16,}|ghp_[A-Za-z0-9]{20,}|gho_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|xox[baprs]-[A-Za-z0-9-]{10,}|AKIA[0-9A-Z]{16}|AIza[0-9A-Za-z_-]{30,}|eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,})\b/g,
    description: "This looks like an API key or access token.",
    action: "Remove it and revoke the key — anyone who sees it can use it.",
    label: "[API key removed]",
  },
  {
    id: "private-key",
    category: "Private key",
    severity: "high",
    regex: /-----BEGIN [A-Z ]*PRIVATE KEY-----/g,
    description: "A private key block was detected.",
    action: "Never share private keys. Revoke and regenerate this one.",
    label: "[private key removed]",
  },
  {
    id: "otp",
    category: "One-time code (OTP)",
    severity: "high",
    regex:
      /\b(otp|one[- ]time (?:code|password)|verification code|security code|login code)\b[^.0-9]{0,24}\b(\d{4,8})\b/gi,
    description: "A one-time verification code appears to be included.",
    action: "Delete it — an OTP is worthless to you and gold to a scammer.",
    label: "[OTP removed]",
  },
  {
    id: "card",
    category: "Card number",
    severity: "high",
    regex: /\b(\d[ -]?){13,19}\b/g, // validated with Luhn before reporting
    description: "Something that looks like a payment card number was detected.",
    action: "Remove it. Never share full card numbers in chats or posts.",
    label: "[card number removed]",
  },
  {
    id: "aadhaar",
    category: "Aadhaar-like number",
    severity: "high",
    regex: /\b[2-9]\d{3}[\s-]?\d{4}[\s-]?\d{4}\b/g,
    description: "Something that looks like an Aadhaar number was detected.",
    action: "Remove it — share government ID numbers only with verified authorities.",
    label: "[ID number removed]",
  },
  {
    id: "pan",
    category: "PAN-like number",
    severity: "high",
    regex: /\b[A-Z]{5}\d{4}[A-Z]\b/g,
    description: "Something that looks like a PAN (tax ID) was detected.",
    action: "Remove it — share tax IDs only where legally required.",
    label: "[tax ID removed]",
  },
  {
    id: "phone",
    category: "Phone number",
    severity: "medium",
    regex:
      /\b(?:\+\d{1,3}[\s.-]?)?(?:\d{10}|\d{5}[\s.-]\d{5}|\d{3}[\s.-]\d{3}[\s.-]\d{4}|\d{4}[\s.-]\d{6}|\d{3}[\s.-]\d{7})\b/g,
    description: "A phone number is visible in this text.",
    action: "Remove it unless it's meant to be public.",
    label: "[phone number removed]",
  },
  {
    id: "email",
    category: "Email address",
    severity: "medium",
    regex: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g,
    description: "An email address is included.",
    action: "Make sure you're comfortable with whoever sees this having it.",
    label: "[email removed]",
  },
  {
    id: "address",
    category: "Street address",
    severity: "medium",
    regex:
      /\b\d{1,5}\s+[A-Za-z][A-Za-z .]+\s+(Street|St\.?|Road|Rd\.?|Avenue|Ave\.?|Lane|Ln\.?|Blvd|Nagar|Marg|Sector)\b/g,
    description: "Something that looks like a street address was detected.",
    action: "Remove the full address; share only what's necessary.",
    label: "[address removed]",
  },
  {
    id: "url",
    category: "Link",
    severity: "low",
    regex: /https?:\/\/\S+|www\.\S+/gi,
    description: "A link is included — readers may judge you by where it leads.",
    action: "Make sure the link is safe and relevant.",
    label: "[link]",
  },
];

// ─── Helpers ───────────────────────────────────────────────────────────────

function luhnValid(raw: string): boolean {
  const digits = raw.replace(/\D/g, "");
  if (digits.length < 13 || digits.length > 19) return false;
  let sum = 0;
  let double = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let n = Number(digits[i]);
    if (double) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    double = !double;
  }
  return sum % 10 === 0;
}

/** Never expose the full value — mask evidence (spec: data minimisation). */
function maskEvidence(raw: string): string {
  const v = raw.trim();
  if (v.length <= 4) return "•".repeat(v.length);
  return v.slice(0, 3) + "•".repeat(Math.min(v.length - 4, 8)) + v.slice(-1);
}

// ─── Public API ────────────────────────────────────────────────────────────

export interface ScanResult {
  findings: VerdictFinding[];
  saferVersion: string;
}

export function scanText(text: string): ScanResult {
  const findings: VerdictFinding[] = [];
  let safer = text;

  for (const pattern of PATTERNS) {
    safer = safer.replace(pattern.regex, (match) => {
      if (pattern.id === "card" && !luhnValid(match)) return match;

      const existing = findings.find((f) => f.id === pattern.id);
      if (existing) {
        existing.count = (existing.count ?? 1) + 1;
      } else {
        findings.push({
          id: pattern.id,
          category: pattern.category,
          severity: pattern.severity,
          description: pattern.description,
          evidence: maskEvidence(match),
          action: pattern.action,
          count: 1,
        });
      }
      return pattern.label;
    });
  }

  return { findings, saferVersion: safer };
}

const LIMITATIONS =
  "This scan checks for common patterns only. It cannot read context, and it can miss things — your own judgement matters too.";

export function buildVerdict(tool: string, original: string, findings: VerdictFinding[]): Verdict {
  const hasHigh = findings.some((f) => f.severity === "high");
  const hasMedium = findings.some((f) => f.severity === "medium");

  if (hasHigh) {
    return {
      tool,
      original,
      riskLevel: "stop",
      statusText: "PAUSE BEFORE YOU ACT",
      summary: `We found ${findings.length} thing${findings.length === 1 ? "" : "s"} here that shouldn't leave your device without a second look.`,
      findings,
      dont: "Share or send this in its current form.",
      check: "Each flagged item below — confirm none of them are there on purpose.",
      do: "Use the safer version, or remove the flagged details yourself.",
      why: "Details like these can be used to identify you, contact you, or get into your accounts.",
      next: "Copy the safer version, then run the check once more before you act.",
      confidence: 0.82,
      limitations: LIMITATIONS,
    };
  }

  if (hasMedium) {
    return {
      tool,
      original,
      riskLevel: "review",
      statusText: "A FEW THINGS TO REVIEW",
      summary: `We found ${findings.length} item${findings.length === 1 ? "" : "s"} you may not need to include.`,
      findings,
      dont: "Don't share until you've looked at each item below.",
      check: "Whether each detail is actually necessary for whoever will read this.",
      do: "Remove anything that isn't needed — smaller is safer.",
      why: "Small details add up. Together they can identify you or the people around you.",
      next: "Edit your text, then run the check again.",
      confidence: 0.78,
      limitations: LIMITATIONS,
    };
  }

  return {
    tool,
    original,
    riskLevel: "clear",
    statusText: "NO OBVIOUS RED FLAGS",
    summary: "Our quick scan did not find common sensitive information in this text.",
    findings: [],
    dont: "Don't treat this as a guarantee — no scan is perfect.",
    check: "Context only you would know — names, plans, locations, who else appears in this.",
    do: "If it still feels right to share, go ahead. You've done the check.",
    why: "Most accidental oversharing is about context, not patterns — that part is yours to judge.",
    next: "When you act, keep the habit: less detail, fewer strangers.",
    confidence: 0.6,
    limitations: LIMITATIONS,
  };
}

/** Spec §12 — input type detection before routing. */
export function looksLikeUrl(value: string): boolean {
  const v = value.trim();
  return (
    /^(https?:\/\/\S+|www\.\S+)$/i.test(v) ||
    /^[a-z0-9-]+(\.[a-z0-9-]+)+(\/\S*)?$/i.test(v)
  );
}

// ─── Shared UI styles for severity / risk ──────────────────────────────────

export const severityStyles: Record<Severity, { dot: string; label: string }> = {
  high: { dot: "bg-red-500", label: "HIGH RISK" },
  medium: { dot: "bg-amber-500", label: "REVIEW" },
  low: { dot: "bg-emerald-500", label: "LOW RISK" },
};

export const riskStyles: Record<VerdictLevel, { pill: string; dot: string }> = {
  stop: { pill: "bg-red-100 text-red-700", dot: "bg-red-500" },
  review: { pill: "bg-amber-100 text-amber-700", dot: "bg-amber-500" },
  clear: { pill: "bg-emerald-100 text-emerald-700", dot: "bg-emerald-500" },
};