import { NextRequest, NextResponse } from "next/server";
import { validateUrl, isSuspiciousDomain } from "@/lib/url-security";
import { generateObject } from "ai";
import { aiModel } from "@/lib/ai-provider";
import { z } from "zod";

// NATIVE COST CONTROLS
const MAX_URL_LENGTH = 2048; 

const linkAnalysisSchema = z.object({
  riskLevel: z.enum(["LOW", "MEDIUM", "HIGH"]),
  summary: z.string(),
  findings: z.array(z.object({
    category: z.string(),
    severity: z.enum(["LOW", "MEDIUM", "HIGH"]),
    description: z.string(),
    recommendedAction: z.string(),
  })),
  dont: z.string(),
  check: z.string(),
  do: z.string(),
  why: z.string(),
  next: z.string(),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { urlToCheck } = body;

    if (!urlToCheck || typeof urlToCheck !== "string") {
      return NextResponse.json({ error: "Invalid URL" }, { status: 400 });
    }

    // 1. Enforce Length Limit
    if (urlToCheck.length > MAX_URL_LENGTH) {
      return NextResponse.json({ error: "URL is too long. Maximum length is 2048 characters." }, { status: 400 });
    }

    // 2. Deterministic Validation (SSRF Protection)
    const validation = validateUrl(urlToCheck);
    if (!validation.isValid) {
      return NextResponse.json({
        status: "SUCCESS",
        riskLevel: "HIGH",
        summary: "Link blocked by security rules.",
        findings: [{ category: "Security Block", severity: "HIGH", description: validation.error!, recommendedAction: "Do not proceed with this link." }],
        dont: "Do not click or visit this link.",
        check: "The URL format or destination is restricted.",
        do: "Verify the link with the sender through a different communication channel.",
        why: "FixMP blocks links to private networks or dangerous protocols to prevent server and user compromise.",
        next: "Enter a valid public https:// URL to check.",
        confidence: 1.0,
        limitations: "This is a strict security block.",
      }, { status: 400 });
    }

    const cleanUrl = validation.cleanUrl!;
    const domain = new URL(cleanUrl).hostname;
    const domainWarnings = isSuspiciousDomain(domain);

    // 3. Safe Network Inspection (HEAD request, 3s timeout)
    let fetchStatus = 0;
    let finalUrl = cleanUrl;
    let serverHeader = "Unknown";

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3000); // 3 second strict timeout

      const response = await fetch(cleanUrl, {
        method: "HEAD",
        redirect: "follow",
        signal: controller.signal,
        headers: { "User-Agent": "FixMP-Security-Checker/1.0" }
      });
      
      clearTimeout(timeoutId);
      fetchStatus = response.status;
      finalUrl = response.url; 
      serverHeader = response.headers.get("server") || "Unknown";

    } catch (error: any) {
      fetchStatus = -1; // Timeout or network error
    }

    // 4. AI Analysis
    let aiResult: any = {
      riskLevel: "LOW",
      summary: "No obvious red flags detected by our automated checks.",
      findings: domainWarnings.map((w: string) => ({ category: "Domain Characteristic", severity: "MEDIUM", description: w, recommendedAction: "Verify the sender's identity." })),
      dont: "Proceed with caution.",
      check: "Ensure you trust the source of this link.",
      do: "Hover over the link to verify the destination matches what you expect.",
      why: "Links can sometimes be misleading or lead to unexpected content.",
      next: "If you trust the source, you may proceed, but stay alert.",
    };

    const isAiEnabled = process.env.AI_ENABLED !== "false";
    const hasApiKey = !!process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.length > 10;

    if (isAiEnabled && hasApiKey) {
      try {
        const { object } = await generateObject({
          model: aiModel,
          schema: linkAnalysisSchema,
          prompt: `You are FixMP, a link safety checker. Analyze this URL metadata for phishing or security risks.
          Original URL: ${cleanUrl}
          Final Redirect URL: ${finalUrl}
          HTTP Status: ${fetchStatus}
          Server Header: ${serverHeader}
          Domain Warnings: ${domainWarnings.join(", ") || "None"}

          Rules:
          - If status is -1 (timeout/blocked) or 4xx/5xx, flag as MEDIUM/HIGH.
          - If final URL differs significantly from original, flag as HIGH (suspicious redirect).
          - Look for known phishing patterns in the domain.
          Return ONLY valid JSON matching the schema.`
        });
        aiResult = object;
      } catch (aiError) {
        console.error("AI Link analysis failed:", aiError);
      }
    } else if (!isAiEnabled) {
      aiResult.limitations = "Advanced AI analysis is currently disabled. Showing standard checks only.";
    }

    return NextResponse.json({
      status: "SUCCESS",
      ...aiResult,
      confidence: 0.85,
      limitations: aiResult.limitations || "This check analyzes metadata and patterns. It cannot guarantee a site is 100% safe from zero-day threats or compromised legitimate sites."
    });

  } catch (error: any) {
    console.error("Link Check API Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}