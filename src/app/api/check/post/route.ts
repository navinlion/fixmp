import { NextRequest, NextResponse } from "next/server";
import { processCheck } from "@/services/check-engine";
import { analyzeContent } from "@/services/ai-check-service";
import { LIMITS } from "@/config/flags";
import type { CheckResponse, Finding, RiskLevel } from "@/types/check";

// LOGGING RULE: never log user content. Message strings only.
// Quota vs overload is now distinguishable in the logs — copy reflects both.

const MAX_TEXT_LENGTH = 5000; // matches AI Check — shared analyzeContent budget

type DeepScanStatus = "full" | "busy" | "off" | "skipped";

function maxSeverity(findings: Finding[]): RiskLevel {
  if (findings.some((f) => f.severity === "HIGH")) return "HIGH";
  if (findings.some((f) => f.severity === "MEDIUM")) return "MEDIUM";
  return "LOW";
}

/** The honesty rule: if an image was submitted but NOT analyzed — whether the
 *  user skipped deep scan, AI is off, or AI failed — that GAP is a finding,
 *  never a quiet "no red flags". Wording adapts to the reason. */
function imageGapFinding(status: DeepScanStatus): Finding {
  const description =
    status === "skipped"
      ? "Deep image analysis wasn't requested (it's optional) — backgrounds, screens and documents in your image were NOT checked."
      : status === "off"
        ? "Deep image analysis is switched off in this test build — backgrounds, screens and documents in your image were NOT checked."
        : "The deep scan couldn't analyze your image just now — backgrounds, screens and documents were NOT checked.";

  const recommendedAction =
    status === "skipped"
      ? "Either review the background manually before posting, or turn on Deep AI analysis and run the check again."
      : status === "off"
        ? "Review the image manually (backgrounds, screens, documents, other people), or re-enable deep analysis."
        : "Try the check again in a minute, or review the background manually before posting.";

  return {
    category: "Image not analyzed",
    severity: "MEDIUM",
    description,
    recommendedAction,
  };
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const textContent: unknown = body?.textContent;
    const imageBase64: unknown = body?.imageBase64;
    const deepScanRequested: boolean = body?.deepScan === true;

    const text = typeof textContent === "string" ? textContent : "";
    const image = typeof imageBase64 === "string" ? imageBase64 : "";

    // 1. Validate input (spec §21 — never trust the client)
    if (!text.trim() && !image) {
      return NextResponse.json({ error: "Add a caption or attach an image to check." }, { status: 400 });
    }
    if (text.length > MAX_TEXT_LENGTH) {
      return NextResponse.json(
        { error: `Caption is too long. Please limit it to ${MAX_TEXT_LENGTH.toLocaleString()} characters.` },
        { status: 400 }
      );
    }
    if (image) {
      if (!/^data:image\/(jpeg|jpg|png|webp);base64,/.test(image)) {
        return NextResponse.json(
          { error: "Unsupported image format. Please use JPG, PNG or WebP." },
          { status: 400 }
        );
      }
      const maxChars = LIMITS.MAX_IMAGE_SIZE_MB * 1024 * 1024 * 1.4; // base64 inflates ~4/3
      if (image.length > maxChars) {
        return NextResponse.json(
          { error: `Image is too large. Please use an image under ${LIMITS.MAX_IMAGE_SIZE_MB}MB.` },
          { status: 400 }
        );
      }
    }

    // 2. Tier 1 — deterministic text checks: instant, free, always on (spec §12)
    const response =
      text.trim().length > 0
        ? await processCheck({ toolType: "POST", textContent: text })
        : ({
            status: "SUCCESS",
            riskLevel: "LOW",
            summary: "Image submitted for analysis.",
            findings: [] as Finding[],
            dont: "",
            check: "",
            do: "",
            why: "",
            next: "",
            confidence: 0,
            limitations: "",
          } as CheckResponse);

    const isAiEnabled = process.env.AI_ENABLED === "true"; // SAFE default: OFF (spec §13/§20)
    const hasApiKey = !!process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.length > 10;

    // 3. Tier 2 — deep analysis. Runs ONLY when the user explicitly opted in
    //    (deepScan) AND the kill switch allows it. Never automatic. (spec §20)
    let deepScanStatus: DeepScanStatus = "skipped";

    if (deepScanRequested) {
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
          const aiResult = await analyzeContent(text || "", image || undefined);

          if (aiResult.additionalFindings?.length > 0) {
            response.findings.push(...aiResult.additionalFindings);
          }
          if (aiResult.saferVersion) {
            response.saferVersion = aiResult.saferVersion;
          }

          response.riskLevel = maxSeverity(response.findings);
          response.summary = `We found ${response.findings.length} thing${response.findings.length === 1 ? "" : "s"} to check in your post.`;

          if (response.riskLevel === "HIGH") {
            response.dont = "DO NOT publish this post in its current form.";
            response.check = "The specific high-risk items flagged in the findings.";
            response.do = "Crop, blur, or remove the flagged items before posting — or use the safer caption.";
            response.why = "Background details or hidden text can identify you, your location, or your accounts.";
            response.next = "Edit the post, then run the check again.";
          }

          return NextResponse.json({ ...response, aiUsed: true, deepScanStatus: "full" });
        } catch (aiError: any) {
          const msg = String(aiError?.message ?? "");
          const quota = /quota|RESOURCE_EXHAUSTED/i.test(msg);
          const busy = /overload|high demand|503|rate|timeout|fetch failed|network/i.test(msg);

          console.error("AI Post analysis failed:", msg); // message only, never content

          if (!image) {
            // Text-only: deterministic results stand, honestly labeled.
            response.limitations = quota
              ? "Deep AI daily limit reached (free tier). It resets tonight — pattern checks ran and are unaffected."
              : "Deep AI analysis was requested but is temporarily unavailable (provider busy). Pattern checks ran — try again shortly.";
            return NextResponse.json({
              ...response,
              aiUsed: false,
              deepScanStatus: "busy",
            });
          }

          // Image present + AI failed → the gap itself becomes a finding.
          response.findings.push(imageGapFinding("busy"));
          response.riskLevel = maxSeverity(response.findings);
          response.summary = `We found ${response.findings.length} thing${response.findings.length === 1 ? "" : "s"} to check — but your image could not be analyzed.`;
          response.dont = "Don't publish the image until it has actually been analyzed.";
          response.check = "Backgrounds, screens, documents and other people in the image — manually for now.";
          response.do = quota
            ? "The deep scan's daily limit is reached — it resets tonight. Meanwhile, review the background manually before posting."
            : "Retry the check in a minute for the full image analysis.";
          response.why = "An unchecked image can contain location clues, documents or screens you didn't notice.";
          response.next = "Retry after the reset, or use Photo Check's self-check list meanwhile.";

          return NextResponse.json({ ...response, aiUsed: false, deepScanStatus: "busy" });
        }
      }
    }

    // 4. Skipped / disabled — deterministic results stand, gap finding if image present
    if (image) {
      response.findings.push(imageGapFinding(deepScanStatus));
      response.riskLevel = maxSeverity(response.findings);
      response.summary = `We found ${response.findings.length} thing${response.findings.length === 1 ? "" : "s"} to check — but your image was not analyzed.`;
      response.dont = "Don't publish the image until it has actually been analyzed.";
      response.check = "Backgrounds, screens, documents and other people in the image — manually for now.";
      response.do =
        deepScanStatus === "skipped"
          ? "Turn on Deep AI analysis and run the check again for the full image review."
          : "Review the image manually, or re-enable deep analysis in this test build.";
      response.why = "An unchecked image can contain location clues, documents or screens you didn't notice.";
      response.next = "Run the check with Deep AI analysis on, or use the Photo Check checklist.";
    } else if (deepScanStatus === "skipped") {
      response.limitations =
        "Deep AI analysis was not requested (it's optional). Local pattern checks ran on our server.";
    }

    return NextResponse.json({ ...response, aiUsed: false, deepScanStatus });
  } catch (error: any) {
    console.error("Post check failed:", String(error?.message ?? "")); // message only
    return NextResponse.json(
      { error: "Something went wrong while checking this post. Please try again." },
      { status: 500 }
    );
  }
}