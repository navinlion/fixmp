import type { Finding } from "@/types/check";

// Deterministic link analysis — instant, ₹0, no network (spec §12/§22).
// Judges the URL string itself; the safe network probe lives in the route.

export function getRegistrableDomain(hostname: string): string {
  const parts = hostname.toLowerCase().replace(/\.$/, "").split(".");
  if (parts.length <= 2) return parts.join(".");
  const secondLevel = new Set(["co", "org", "net", "edu", "gov", "com"]);
  if (secondLevel.has(parts[parts.length - 2])) return parts.slice(-3).join(".");
  return parts.slice(-2).join(".");
}

const SHORTENERS = new Set([
  "bit.ly", "tinyurl.com", "t.co", "is.gd", "cutt.ly", "rb.gy", "tiny.cc",
  "goo.gl", "ow.ly", "shorturl.at", "s.id", "rebrand.ly", "bit.do",
]);

const SUSPICIOUS_TLDS = new Set([
  "tk", "ml", "ga", "cf", "gq", "xyz", "top", "work", "click", "link", "icu",
  "cyou", "sbs", "fit", "rest", "zip", "mov", "loan", "men", "party", "date", "faith", "stream",
]);

const BRANDS: Array<{ name: string; official: string[] }> = [
  { name: "Google", official: ["google.com", "google.co.in", "gmail.com", "googlemail.com", "googleapis.com"] },
  { name: "Facebook", official: ["facebook.com", "fb.com", "fb.me"] },
  { name: "Instagram", official: ["instagram.com"] },
  { name: "WhatsApp", official: ["whatsapp.com"] },
  { name: "PayPal", official: ["paypal.com", "paypal.me"] },
  { name: "Apple", official: ["apple.com", "icloud.com"] },
  { name: "Microsoft", official: ["microsoft.com", "live.com", "outlook.com", "office.com", "microsoftonline.com"] },
  { name: "Amazon", official: ["amazon.com", "amazon.in", "amzn.to"] },
  { name: "Netflix", official: ["netflix.com"] },
  { name: "SBI", official: ["sbi.co.in", "onlinesbi.sbi", "sbicard.com"] },
  { name: "HDFC Bank", official: ["hdfcbank.com"] },
  { name: "ICICI Bank", official: ["icicibank.com"] },
  { name: "Axis Bank", official: ["axisbank.com"] },
  { name: "Paytm", official: ["paytm.com"] },
  { name: "PhonePe", official: ["phonepe.com"] },
];

const URGENCY_WORDS = [
  "login", "signin", "sign-in", "verify", "verification", "secure", "security",
  "update", "account", "confirm", "wallet", "password", "billing", "invoice",
  "refund", "kyc", "otp", "unlock", "suspended", "limited",
];

function brandInDomain(brand: string, domain: string): boolean {
  if (domain.includes(brand)) return true;
  // Camouflage swaps lookalike characters: paypa1→paypal, g00gle→google, amaz0n→amazon…
  // '1' can impersonate either 'l' (paypa1) or 'i' (g1thub) — check both readings.
  const normalize = (oneTo: string) =>
    domain
      .replace(/0/g, "o")
      .replace(/1/g, oneTo)
      .replace(/3/g, "e")
      .replace(/5/g, "s")
      .replace(/4/g, "a")
      .replace(/\$/g, "s");
  return normalize("l").includes(brand) || normalize("i").includes(brand);
}

export function analyzeUrlDeterministic(url: URL): Finding[] {
  const findings: Finding[] = [];
  const host = url.hostname.toLowerCase();
  const registrable = getRegistrableDomain(host);
  const labels = host.split(".");
  const subdomainCount = labels.length - getRegistrableDomain(host).split(".").length;
  const path = (url.pathname + url.search).toLowerCase();

  // 1. No encryption
  if (url.protocol === "http:") {
    findings.push({
      category: "No encryption (HTTP)",
      severity: "MEDIUM",
      description: "This link doesn't use HTTPS — anything you type on the site (including passwords) travels unencrypted and can be read or altered.",
      recommendedAction: "Avoid entering any details. If the site has an https:// version, use that instead.",
    });
  }

  // 2. Raw IP address
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.startsWith("[")) {
    findings.push({
      category: "Raw IP address",
      severity: "HIGH",
      description: "The link goes to a bare IP address instead of a named domain — legitimate consumer sites essentially never do this.",
      recommendedAction: "Do not open. Verify with the sender through a different channel.",
    });
  }

  // 3. Punycode disguise
  if (host.includes("xn--")) {
    findings.push({
      category: "Disguised characters (punycode)",
      severity: "HIGH",
      description: "The domain uses encoded international characters — a classic trick to make a fake address ('аpple.com' with a lookalike letter) render like the real one.",
      recommendedAction: "Do not open. Compare the address character-by-character with the official site.",
    });
  }

  // 4. Brand imitation
  for (const b of BRANDS) {
    if (b.official.includes(registrable)) continue; // this IS the official domain
    const token = b.name.toLowerCase().replace(/\s/g, "");
    if (brandInDomain(token, registrable)) {
      findings.push({
        category: `Possible ${b.name} imitation`,
        severity: "HIGH",
        description: `The address resembles ${b.name} but does not sit on the official domain (${b.official[0]}). This is the single most common phishing pattern.`,
        recommendedAction: `Do not log in or pay. Open a new tab and type ${b.official[0]} yourself.`,
      });
      break;
    }
  }

  // 5. Credentials in URL
  if (url.username || url.password) {
    findings.push({
      category: "Hidden credentials in the address",
      severity: "HIGH",
      description: "The link contains 'something@' before the real address — the browser ignores everything before the @, and the actual destination can be anything.",
      recommendedAction: "Do not open. This structure is almost exclusively used in phishing.",
    });
  }

  // 6. Link shortener
  if (SHORTENERS.has(registrable)) {
    findings.push({
      category: "Link shortener",
      severity: "MEDIUM",
      description: "This short link hides its real destination — you can't see where it leads until it's too late.",
      recommendedAction: "Ask the sender where it leads, or preview it by adding '+' to the end of most shortener links.",
    });
  }

  // 7. Suspicious TLD
  const tld = labels[labels.length - 1];
  if (SUSPICIOUS_TLDS.has(tld)) {
    findings.push({
      category: "High-risk domain ending",
      severity: "MEDIUM",
      description: `The '.${tld}' ending is extremely cheap to register and heavily used by temporary scam and spam sites.`,
      recommendedAction: "Treat with suspicion — did you expect a link from this sender at all?",
    });
  }

  // 8. Subdomain camouflage
  if (subdomainCount >= 3) {
    findings.push({
      category: "Deep subdomain chain",
      severity: "MEDIUM",
      description: "Long chains like 'secure-login.bank.com.verify-site.com' are built to make you read the LEFT part — but the real site is always the part just before the first single slash.",
      recommendedAction: "Read the address right to left. Only the last two/three parts are the real site.",
    });
  }

  // 9. Urgency/login wording in the host
  if (URGENCY_WORDS.some((w) => host.includes(w))) {
    findings.push({
      category: "Login or urgency wording",
      severity: "MEDIUM",
      description: "The address contains words like login/verify/update that phishing pages use to rush you into acting first and thinking later.",
      recommendedAction: "Slow down. Real companies rarely need you to 'verify' anything through an unexpected link.",
    });
  }

  // 10. Disguised download
  if (/\.(pdf|docx?|jpe?g|png|xlsx?|txt)\.(exe|scr|bat|cmd|zip|rar|js|vbs|apk)$/i.test(path)) {
    findings.push({
      category: "Disguised download",
      severity: "HIGH",
      description: "The file name pretends to be a document or photo but actually ends in a program or archive — a malware staple.",
      recommendedAction: "Do not download or open this file.",
    });
  }

  // 11. Unusual port
  if (url.port && !["80", "443", "8080"].includes(url.port)) {
    findings.push({
      category: "Unusual port",
      severity: "MEDIUM",
      description: `The address points at a non-standard port (:${url.port}) — normal websites don't need this.`,
      recommendedAction: "Treat as suspicious unless you know exactly why it's there.",
    });
  }

  // 12. Very long address
  if (url.href.length > 300) {
    findings.push({
      category: "Unusually long address",
      severity: "LOW",
      description: "Very long addresses are sometimes used to push the real destination out of view in the address bar.",
      recommendedAction: "Check which domain the link actually sits on before trusting it.",
    });
  }

  return findings;
}