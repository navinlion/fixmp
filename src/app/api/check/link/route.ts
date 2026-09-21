import { NextRequest, NextResponse } from "next/server";
import { validateUrl } from "@/lib/url-security";
import { analyzeUrlDeterministic, getRegistrableDomain } from "@/lib/link-checks";
import { generateObject } from "ai";
import { aiModel } from "@/lib/ai-provider";
import { z } from "zod";
import type { CheckResponse, Finding, RiskLevel } from "@/types/check";

// LOGGING RULE: never log user-submitted URLs beyond what's needed for debugging
// (URLs may contain tokens). Prefer message-only logging.

const MAX_URL_LENGTH = 2048;
const MAX_REDIRECTS = 3;
const PROBE_TIMEOUT_MS = 4000;

const linkSchema = z.object({
  summary: z.string(),
  findings: z.array(
    z.object({
      category: z.string(),
      severity: z.enum(["LOW", "MEDIUM", "HIGH"]),
      description: z.string(),
      recommendedAction: z.string(),
    })
  ),
});

function maxSeverity(findings: Finding[]): RiskLevel {
  if (findings.some((f) => f.severity === "HIGH")) return "HIGH";
  if (findings.some((f) => f.severity === "MEDIUM")) return "MEDIUM";
  return "LOW";
}

/** Spec §8 wording — link checks speak their own honest language. */
function guidanceFor(level: RiskLevel, findingsCount: number) {
  const statusText =
    level === "HIGH" ? "STRONG WARNING SIGNS" : level === "MEDIUM" ? "CHECK CAREFULLY" : "NO OBVIOUS RED FLAGS";

  if (level === "HIGH") {
    return {
      statusText,
      dont: "Do NOT open this link.",
      check: "Who actually sent this, and through which channel — was it expected at all?",
      do: "If you need what's behind it, contact the sender/company through an official channel instead of clicking.",
      why: findingsCount > 0
        ? "The patterns we found are strongly associated with phishing and scam links."
        : "Our security rules flagged this address as unsafe to inspect or visit.",
      next: "Report the message as phishing and delete it if the sender can't be verified.",
    };
  }
  if (level === "MEDIUM") {
    return {
      statusText,
      dont: "Don't enter passwords, OTPs or payment details on this site without independent verification.",
      check: "Whether you genuinely expected this link — and where the address really points.",
      do: "Open a new tab and type the company's official address yourself instead of trusting this link.",
      why: "The flags we found are common in phishing, though occasionally legitimate sites trigger them too.",
      next: "If the site asks for login or payment details, verify the domain character by character first.",
    };
  }
  return {
    statusText,
    dont: "Don't treat this as a guarantee — no automated check can promise a site is safe.",
    check: "What the site asks you to do once you're there — urgency, logins, payments are your red flags now.",
    do: "If it looks right to you, proceed carefully. You've done the check.",
    why: "Our pattern and redirect checks found nothing — but zero-day and compromised-legitimate sites exist.",
    next: "Stay alert after opening: unexpected login pages or payment requests are the real test.",
  };
}

interface ProbeResult {
  status?: number;
  finalUrl?: string;
  chain: string[];
  unreachable?: boolean;
  tooManyRedirects?: boolean;
  blockedDuringRedirect?: string;
}

/** Spec §22: follow redirects MANUALLY, re-validating every hop against private ranges. */
async function probe(startUrl: string): Promise<ProbeResult> {
  const chain: string[] = [];
  let current = startUrl;

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const v = validateUrl(current);
    if (!v.isValid) {
      chain.push(`blocked: ${v.error}`);
      return { chain, blockedDuringRedirect: v.error };
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
    try {
      const res = await fetch(v.cleanUrl!, {
        method: "HEAD",
        redirect: "manual",
        signal: controller.signal,
        headers: { "User-Agent": "FixMP-Security-Checker/1.0" },
      });
      clearTimeout(timer);

      if ([301, 302, 303, 307, 308].includes(res.status)) {
        const loc = res.headers.get("location");
        if (!loc) return { status: res.status, finalUrl: v.cleanUrl!, chain };
        current = new URL(loc, current).toString();
        chain.push(`${res.status} → ${current}`);
        continue;
      }
      return { status: res.status, finalUrl: v.cleanUrl!, chain };
    } catch (e: any) {
      clearTimeout(timer);
      return { chain, unreachable: true };
    }
  }
  return { chain, tooManyRedirects: true };
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const urlToCheck: unknown = body?.urlToCheck;

    if (typeof urlToCheck !== "string" || !urlToCheck.trim()) {
      return NextResponse.json({ error: "Please paste a link to check." }, { status: 400 });
    }

    // Normalize bare domains ("example.com/x" → "https://example.com/x")
    let candidate = urlToCheck.trim();
    if (!/^https?:\/\//i.test(candidate)) candidate = "https://" + candidate;

    if (candidate.length > MAX_URL_LENGTH) {
      return NextResponse.json(
        { error: "Link is too long to check. Maximum length is 2048 characters." },
        { status: 400 }
      );
    }

    // 1. Security validation (SSRF / protocol / private ranges)
    const validation = validateUrl(candidate);
    if (!validation.isValid) {
      const guidance = guidanceFor("HIGH", 1);
      const response: CheckResponse = {
        status: "SUCCESS",
        riskLevel: "HIGH",
        summary: "This link was blocked by FixMP's security rules before any inspection.",
        findings: [
          {
            category: "Security block",
            severity: "HIGH",
            description: validation.error ?? "This address is restricted.",
            recommendedAction: "Do not proceed with this link.",
          },
        ],
        ...guidance,
        confidence: 1,
        limitations: "Strict security block — the address targets a range or protocol FixMP never inspects.",
        aiUsed: false,
        deepScanStatus: "full",
      };
      return NextResponse.json(response);
    }

    const cleanUrl = validation.cleanUrl!;
    const url = new URL(cleanUrl);

    // 2. Deterministic analysis — instant, free, always on (spec §12)
    const findings = analyzeUrlDeterministic(url);
    console.log(`[FixMP] link check: ${findings.length} deterministic finding(s)`);

    // 3. Safe probe — manual redirects, every hop re-validated (spec §22)
    const p = await probe(cleanUrl);
    const originalDomain = getRegistrableDomain(url.hostname);

    if (p.finalUrl) {
      const finalDomain = getRegistrableDomain(new URL(p.finalUrl).hostname);
      if (finalDomain !== originalDomain) {
        findings.push({
          category: "Redirects to a different website",
          severity: "MEDIUM",
          description: `This link actually leads to a different site (${finalDomain}) than the one you were shown (${originalDomain}). Common with shorteners — and with scams.`,
          recommendedAction: "Judge the FINAL domain, not the one you were given. If you don't recognise it, don't open it.",
        });
      }
      if (p.status && p.status >= 400) {
        findings.push({
          category: "Site returns an error",
          severity: "LOW",
          description: `The site answered with HTTP ${p.status} — it may be down, dead, or already taken down for abuse.`,
          recommendedAction: "A dead link is usually not worth chasing. If it claims to be important, contact the sender.",
        });
      }
    }
    if (p.blockedDuringRedirect) {
      findings.push({
        category: "Redirects into a restricted network",
        severity: "HIGH",
        description: "This link redirects toward a private/internal network address — an extremely hostile signal for a public link.",
        recommendedAction: "Do not open. Report the message as phishing.",
      });
    }
    if (p.tooManyRedirects) {
      findings.push({
        category: "Redirect chain",
        severity: "MEDIUM",
        description: "This link bounces through multiple redirects before settling — a tactic used to dodge security scanners.",
        recommendedAction: "Treat with suspicion; find the destination's official address instead.",
      });
    }
    if (p.unreachable) {
      findings.push({
        category: "Couldn't reach the site",
        severity: "LOW",
        description: "The site didn't respond to our check — it may be down, offline, or blocking automated visitors.",
        recommendedAction: "A dead link isn't automatically dangerous, but also can't be verified. Proceed only if you fully trust the sender.",
      });
    }

    const riskLevel = maxSeverity(findings);
    const guidance = guidanceFor(riskLevel, findings.length);

    // 4. Optional AI enrichment — kill-switched, never required (spec §20)
    const isAiEnabled = process.env.AI_ENABLED === "true"; // safe default OFF
    const hasApiKey = !!process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.length > 10;

    if (isAiEnabled && hasApiKey) {
      try {
        const { object } = await generateObject({
          model: aiModel,
          schema: linkSchema,
          abortSignal: AbortSignal.timeout(45_000),
          prompt: `You are FixMP, a link safety analyst. Review this URL inspection data and add any further phishing insight as findings. Never invent findings — return an empty array if nothing new.

URL: ${cleanUrl}
Final URL after redirects: ${p.finalUrl ?? "unreachable"}
HTTP status: ${p.status ?? "no response"}
Deterministic signals already found: ${findings.map((f) => `${f.category} (${f.severity})`).join("; ") || "none"}

Write plain, calm language for non-technical users.`,
        });
        findings.push(...object.findings);
        return NextResponse.json({
          status: "SUCCESS",
          riskLevel: maxSeverity(findings),
          ...guidanceFor(maxSeverity(findings), findings.length),
          summary: object.summary || `We found ${findings.length} thing${findings.length === 1 ? "" : "s"} worth knowing about this link.`,
          findings,
          confidence: 0.85,
          limitations:
            "No automated check can guarantee a site is safe — zero-day threats and compromised legitimate sites exist. Never 100%.",
          aiUsed: true,
          deepScanStatus: "full",
        } satisfies CheckResponse);
      } catch (aiError: any) {
        console.error("AI Link analysis failed:", String(aiError?.message ?? ""));
        // fall through to deterministic response, labeled partial
      }
    }

    // 5. Deterministic-only response, honestly labeled
    return NextResponse.json({
      status: "SUCCESS",
      riskLevel,
      ...guidance,
      summary:
        findings.length > 0
          ? `We found ${findings.length} thing${findings.length === 1 ? "" : "s"} worth knowing about this link.`
          : "No obvious red flags found by our pattern and redirect checks.",
      findings,
      confidence: findings.length > 0 ? 0.9 : 0.65,
      limitations: isAiEnabled
        ? "Deep AI analysis is temporarily unavailable (provider busy). Pattern and redirect checks ran. No checker can guarantee a site is safe."
        : "Deep AI analysis is switched off in this test build. Pattern and redirect checks ran. No checker can guarantee a site is safe.",
      aiUsed: false,
      deepScanStatus: isAiEnabled ? "busy" : "off",
    } satisfies CheckResponse);
  } catch (error: any) {
    console.error("Link check failed:", String(error?.message ?? "")); // message only
    return NextResponse.json(
      { error: "Something went wrong while checking this link. Please try again." },
      { status: 500 }
    );
  }
}