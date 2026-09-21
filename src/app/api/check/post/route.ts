import { NextRequest, NextResponse } from "next/server";
import { processCheck } from "@/services/check-engine";
import { analyzeContent } from "@/services/ai-check-service";
import { LIMITS } from "@/config/flags";
import type { CheckResponse, Finding, RiskLevel } from "@/types/check";

// LOGGING RULE: never log user content (textContent, image data, findings evidence).

const MAX_TEXT_LENGTH = 5000; // matches AI Check — shared analyzeContent budget

function maxSeverity(findings: Finding[]): RiskLevel {
  if (findings.some((f) => f.severity === "HIGH")) return "HIGH";
  if (findings.some((f) => f.severity === "MEDIUM")) return "MEDIUM";
  return "LOW";
}

/** The honesty rule: if an image was submitted but couldn't be analyzed,
 *  that GAP is a finding — never a quiet "no red flags". */
function imageGapFinding(reason: "off" | "busy"): Finding {
  return reason === "off"
    ? {
        category: "Image not analyzed",
        severity: "MEDIUM",
        description:
          "Deep image analysis is switched off in this test build — backgrounds, screens and documents in your image were NOT checked.",
        recommendedAction:
          "Review the image manually (backgrounds, screens, documents, other people), or re-enable deep analysis.",
      }
    : {
        category: "Image not analyzed",
        severity: "MEDIUM",
        description:
          "The deep scan couldn't analyze your image just now — backgrounds, screens and documents were NOT checked.",
        recommendedAction:
          "Try the check again in a minute, or review the background manually before posting.",
      };
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const textContent: unknown = body?.textContent;
    const imageBase64: unknown = body?.imageBase64;

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

    const aiRequested = text.trim().length > 0 || !!image;
    const isAiEnabled = process.env.AI_ENABLED === "true"; // SAFE default: OFF (spec §13/§20)
    const hasApiKey = !!process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.length > 10;

    // 3. Tier 2 — deep analysis (text + vision), guarded by the kill switch
    if (aiRequested && isAiEnabled && hasApiKey) {
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

        return NextResponse.json({
          ...response,
          aiUsed: true,
          deepScanStatus: "full",
        });
      } catch (aiError: any) {
        const msg = String(aiError?.message ?? "");
        const busy = /overload|high demand|503|rate|timeout|fetch failed|network/i.test(msg);

        console.error("AI Post analysis failed:", msg); // message only, never content

        // Text-only + AI down → deterministic results stand, labeled partial.
        if (!image) {
          response.limitations = busy
            ? "Deep analysis is temporarily unavailable (provider busy). Pattern checks ran; tone/context review may be missing. Try again shortly."
            : "Deep analysis is switched off in this test build. Only pattern checks ran.";
          return NextResponse.json({
            ...response,
            aiUsed: false,
            deepScanStatus: busy ? "busy" : "off",
          });
        }

        // Image present + AI down → the gap itself becomes a finding.
        response.findings.push(imageGapFinding(busy ? "busy" : "off"));
        response.riskLevel = maxSeverity(response.findings);
        response.summary = `We found ${response.findings.length} thing${response.findings.length === 1 ? "" : "s"} to check — but your image could not be analyzed.`;
        response.dont = "Don't publish the image until it has actually been analyzed.";
        response.check = "Backgrounds, screens, documents and other people in the image — manually for now.";
        response.do = busy
          ? "Retry the check in a minute for the full image analysis."
          : "Review the image manually, or re-enable deep analysis in this test build.";
        response.why = "An unchecked image can contain location clues, documents or screens you didn't notice.";
        response.next = "Retry the check, or use Photo Check once the deep scan is available.";

        return NextResponse.json({
          ...response,
          aiUsed: false,
          deepScanStatus: busy ? "busy" : "off",
        });
      }
    }

    // 4. Kill switch / no key — honest partial state, gap finding if image present
    if (image) {
      response.findings.push(imageGapFinding("off"));
      response.riskLevel = maxSeverity(response.findings);
      response.summary = `We found ${response.findings.length} thing${response.findings.length === 1 ? "" : "s"} to check — but your image could not be analyzed.`;
      response.dont = "Don't publish the image until it has actually been analyzed.";
      response.check = "Backgrounds, screens, documents and other people in the image — manually for now.";
      response.do = "Review the image manually, or re-enable deep analysis in this test build.";
      response.why = "An unchecked image can contain location clues, documents or screens you didn't notice.";
      response.next = "Retry with deep analysis enabled, or use the Photo Check checklist.";
    } else {
      response.limitations =
        "Deep analysis is switched off in this test build. Only pattern checks ran.";
    }

    return NextResponse.json({ ...response, aiUsed: false, deepScanStatus: "off" });
  } catch (error: any) {
    console.error("Post check failed:", String(error?.message ?? "")); // message only
    return NextResponse.json(
      { error: "Something went wrong while checking this post. Please try again." },
      { status: 500 }
    );
  }
}