import { Finding, RiskLevel } from "@/types/check";

// Regular expressions for common sensitive data patterns.
// Coverage is global: US/Canada, UK, India, Australia + generic
// international formats. Heuristic by design — limitations are
// always disclosed in the result UI (spec §29).

const PATTERNS = {
  // Works for standard addresses worldwide, incl. subdomains and co.in-style TLDs
  EMAIL: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,

  // Global phone coverage:
  //   (555) 123-4567        US with parens
  //   555-123-4567          US/CA dashed
  //   +1 (555) 123-4567     NANP with country code
  //   98765 43210           India 5-5
  //   9876543210            10-digit continuous
  //   07700 900123          UK 5-6
  //   0412 345 678          AU 4-3-3
  //   020 7946 0958         UK landline 3-4-4
  //   +44 7700 900123       generic international (any +code, 7-12 digits)
  // (?!\d) stops partial matches inside longer digit runs (e.g. 12-digit IDs)
  PHONE:
    /\(\d{3}\)[\s.-]?\d{3}[\s.-]?\d{4}(?!\d)|\+\d{1,3}(?:[\s.-]?\d){7,12}(?!\d)|\b(?:\d{3}[\s.-]\d{3,4}[\s.-]\d{3,4}|\d{4}[\s.-]\d{3}[\s.-]\d{3}|\d{5}[\s.-]\d{5,6}|\d{10,11})(?!\d)/g,

  // Prefixed secrets only — deliberately NO generic [a-zA-Z0-9]{32,} catch-all:
  // it matched hashes/serial numbers and produced false alarms.
  // Covers AWS, OpenAI (incl. proj/ant), Stripe, GitHub, Slack, Google, JWTs
  API_KEY:
    /(?:AKIA[0-9A-Z]{16}|sk-(?:ant|proj)-[A-Za-z0-9_-]{20,}|sk-[A-Za-z0-9]{20,}|sk_live_[A-Za-z0-9]{16,}|sk_test_[A-Za-z0-9]{16,}|ghp_[A-Za-z0-9]{20,}|gho_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|xox[baprs]-[A-Za-z0-9-]{10,}|AIza[0-9A-Za-z_-]{30,}|eyJ[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{10,})/g,

  // Global ID patterns:
  //   Aadhaar-style: 1234 5678 9012 / 123456789012 (12 digits, seps optional)
  //   US SSN:        123-45-6789
  ID_NUMBER: /\b(?:\d{4}[-\s]?){2}\d{4}\b|\b\d{3}-\d{2}-\d{4}\b/g,

  // Passwords/PINs written out: "password is Hunter2", "pwd=abc123", "pin: 1234"
  PASSWORD:
    /\b(?:password|passwd|pwd|passcode|pin(?:\s+code)?)\s*(?:is|:|=)\s*\S+/gi,

  // One-time codes: "the OTP I just received is 583921", "verification code 482113"
  // The bridge refuses to cross digits or sentence ends, so it binds to the NEAREST code
  OTP:
    /\b(?:otp|one[-\s]?time\s+(?:code|password|pin)|verification\s+code|security\s+code|login\s+code|passcode)\b[^.!?0-9]{0,24}?\b\d{4,8}\b/gi,

  URL: /https?:\/\/(www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_\+.~#?&//=]*)/g,
};

export function runDeterministicChecks(text: string): Finding[] {
  const findings: Finding[] = [];

  if (!text || text.trim().length === 0) return findings;

  // 1. Check for Emails
  const emails = text.match(PATTERNS.EMAIL);
  if (emails) {
    findings.push({
      category: "Email Address",
      severity: "MEDIUM",
      description: "An email address is visible in your content.",
      evidence: maskSensitiveData(emails[0]),
      recommendedAction: "Remove or replace with a generic contact method.",
    });
  }

  // 2. Check for Phone Numbers
  const phones = text.match(PATTERNS.PHONE);
  if (phones) {
    findings.push({
      category: "Phone Number",
      severity: "HIGH",
      description: "A phone number pattern was detected.",
      evidence: maskSensitiveData(phones[0]),
      recommendedAction: "Delete the phone number before sharing.",
    });
  }

  // 3. Check for API Keys / Secrets
  const apiKeys = text.match(PATTERNS.API_KEY);
  if (apiKeys) {
    findings.push({
      category: "Potential API Key or Secret",
      severity: "HIGH",
      description: "This looks like a private API key, token, or password.",
      evidence: maskSensitiveData(apiKeys[0]),
      recommendedAction: "Never share this. Revoke it immediately if it was already sent.",
    });
  }

  // 4. Check for ID Numbers
  const ids = text.match(PATTERNS.ID_NUMBER);
  if (ids) {
    findings.push({
      category: "Identification Number",
      severity: "HIGH",
      description: "A sequence matching an ID number (like Aadhaar or SSN) was found.",
      evidence: maskSensitiveData(ids[0]),
      recommendedAction: "Remove this immediately. It can be used for identity theft.",
    });
  }
  // 5. Check for passwords or PINs written out
  const passwords = text.match(PATTERNS.PASSWORD);
  if (passwords) {
    findings.push({
      category: "Password or PIN",
      severity: "HIGH",
      description: "It looks like a password or PIN is written out in this text.",
      evidence: maskSensitiveData(passwords[0]),
      recommendedAction: "Delete it. If it was ever shared anywhere, change that password.",
    });
  }

  // 6. Check for one-time codes (OTP)
  const otps = text.match(PATTERNS.OTP);
  if (otps) {
    findings.push({
      category: "One-time code (OTP)",
      severity: "HIGH",
      description: "A one-time verification code appears to be included.",
      evidence: maskSensitiveData(otps[0]),
      recommendedAction: "Delete it — an OTP is worthless to you and gold to a scammer.",
    });
  }
  return findings;
}

// Helper to prevent showing the full sensitive data in the UI
function maskSensitiveData(data: string): string {
  if (data.length <= 4) return "****";
  return data.substring(0, 3) + "****" + data.substring(data.length - 2);
}