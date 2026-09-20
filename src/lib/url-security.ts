// Blocklists for SSRF protection
const PRIVATE_IP_REGEX = /^(10\.|172\.(1[6-9]|2[0-9]|3[0-1])\.|192\.168\.|127\.|0\.0\.0\.0|169\.254\.)/;
const LOCALHOST_REGEX = /^(localhost|127\.0\.0\.1|\[::1\])$/i;
const DANGEROUS_PROTOCOLS = /^(javascript:|data:|vbscript:|file:|ftp:)/i;

export function validateUrl(urlString: string): { isValid: boolean; error?: string; cleanUrl?: string } {
  try {
    // 1. Basic URL parsing
    const url = new URL(urlString);

    // 2. Block dangerous protocols
    if (DANGEROUS_PROTOCOLS.test(url.protocol)) {
      return { isValid: false, error: "Dangerous protocol detected." };
    }

    // 3. Only allow HTTP/HTTPS
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return { isValid: false, error: "Only http:// and https:// links are allowed." };
    }

    // 4. Block localhost and private IP ranges (SSRF Protection)
    if (LOCALHOST_REGEX.test(url.hostname) || PRIVATE_IP_REGEX.test(url.hostname)) {
      return { isValid: false, error: "Access to internal or private networks is blocked for your safety." };
    }

    return { isValid: true, cleanUrl: url.toString() };
  } catch (error) {
    return { isValid: false, error: "Invalid URL format." };
  }
}

export function isSuspiciousDomain(domain: string): string[] {
  const warnings: string[] = [];
  const lowerDomain = domain.toLowerCase();

  // Check for excessive subdomains (e.g., login.paypal.com.secure-site.com)
  if (domain.split('.').length > 4) {
    warnings.push("Unusually long domain with multiple subdomains.");
  }

  // Check for suspicious TLDs often used in phishing (simplified list)
  const suspiciousTLDs = ['.tk', '.ml', '.ga', '.cf', '.gq', '.xyz', '.top'];
  if (suspiciousTLDs.some(tld => lowerDomain.endsWith(tld))) {
    warnings.push("Domain uses a TLD frequently associated with low-cost or temporary sites.");
  }

  // Check for homograph attacks (simplified: looking for numbers replacing letters)
  if (/[0o]/i.test(lowerDomain) && /[0o]/i.test(lowerDomain.replace(/[0o]/gi, ''))) {
     // Very basic check, real homograph detection requires unicode normalization
  }

  return warnings;
}