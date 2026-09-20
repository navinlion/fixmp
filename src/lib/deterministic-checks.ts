import { Finding, RiskLevel } from "@/types/check";

// Regular expressions for common sensitive data patterns
const PATTERNS = {
  EMAIL: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
  PHONE: /(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g,
  // Basic API key patterns (AWS, Generic 32+ char alphanumeric)
  API_KEY: /(?:AKIA|sk_live_|sk_test_|ghp_|[a-zA-Z0-9]{32,})/g,
  // Indian Aadhaar (basic format), SSN, etc. (Simplified for V1)
  ID_NUMBER: /\b\d{3}[-\s]?\d{4}[-\s]?\d{4}\b/g,
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

  return findings;
}

// Helper to prevent showing the full sensitive data in the UI
function maskSensitiveData(data: string): string {
  if (data.length <= 4) return "****";
  return data.substring(0, 3) + "****" + data.substring(data.length - 2);
}