import { NextRequest, NextResponse } from "next/server";
import { processCheck } from "@/services/check-engine";
import { analyzeContent } from "@/services/ai-check-service";

// LOGGING RULE: never log user content. Log message strings only —
// never prompt bodies or error objects that may echo content.
// This is also how we surface quota-vs-overload during testing.

const MAX_TEXT_LENGTH = 5000; // Prevents massive token consumption

type DeepScanStatus = "full" | "busy" | "off" | "skipped";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const textContent: unknown = body?.textContent;
    const deepScanRequested: boolean = body?.deepScan === true;

    if (!textContent || typeof textContent !== "string") {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    }
    if (textContent.length > MAX_TEXT_LENGTH) {
      return NextResponse.json(
        { error: `Text is too long. Please limit your input to ${MAX_TEXT_LENGTH} characters.` },
        { status: 400 }
      );
    }

    // Tier 1 — deterministic checks: instant, free, always on (spec §12)
    const response = await processCheck({ toolType: "AI", textContent });

    // Tier 2 — deep AI analysis. Runs ONLY when the user explicitly opted in
    // (deepScan) AND the administrator kill switch allows it (spec §13/§20).
    const isAiEnabled = process.env.AI_ENABLED === "true";
    const hasApiKey = !!process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.length > 10;
    let aiUsed = false;
    let deepScanStatus: DeepScanStatus = "skipped";

    if (deepScanRequested && textContent.trim().length > 0) {
      if (!isAiEnabled) {
        deepScanStatus = "off";
        response.limitations =
          "Deep AI analysis was requested but is switched off by the administrator in this test build. Pattern checks ran.";
      } else if (!hasApiKey) {
        deepScanStatus = "off";
        response.limitations =
          "Deep AI analysis was requested but no AI provider is configured. Pattern checks ran.";
      } else {
        try {
          const aiResult = await analyzeContent(textContent);
          aiUsed = true;
          deepScanStatus = "full";

          if (aiResult.additionalFindings && aiResult.additionalFindings.length > 0) {
            response.findings.push(...aiResult.additionalFindings);
          }
          if (aiResult.saferVersion) {
            response.saferVersion = aiResult.saferVersion;
          }

          if (aiResult.additionalFindings?.some((f: any) => f.severity === "HIGH")) {
            response.riskLevel = "HIGH";
          } else if (
            response.riskLevel !== "HIGH" &&
            aiResult.additionalFindings?.some((f: any) => f.severity === "MEDIUM")
          ) {
            response.riskLevel = "MEDIUM";
          }

          response.summary = `We found ${response.findings.length} thing${response.findings.length === 1 ? "" : "s"} to check.`;

          if (response.riskLevel === "HIGH") {
            response.dont = "DO NOT send this prompt to the AI in its current form.";
            response.check = "The specific high-risk items flagged in the findings.";
            response.do = "Use the 'Safer Version' provided below, or remove the flagged details manually.";
            response.why = "Sharing private context, credentials, or confidential company info with public AI can lead to data leaks.";
            response.next = "Copy the safer version and use that instead.";
          }
        } catch (aiError: any) {
          // Non-fatal: deterministic results stand. Message-only log also
          // reveals whether the cause is quota or overload.
          console.error("AI analysis failed:", String(aiError?.message ?? ""));
          deepScanStatus = "busy";
          response.limitations =
            "Deep AI analysis was requested but is temporarily unavailable (provider busy or quota reached). Pattern checks ran — try again shortly.";
        }
      }
    }

    if (deepScanStatus === "skipped") {
      response.limitations =
        "Deep AI analysis was not requested (it's optional). Local pattern checks ran on our server.";
    }

    return NextResponse.json({ ...response, aiUsed, deepScanStatus });
  } catch (error: any) {
    console.error("API Route Error:", String(error?.message ?? ""));
    return NextResponse.json(
      { error: "Something went wrong while checking this. Please try again." },
      { status: 500 }
    );
  }
}