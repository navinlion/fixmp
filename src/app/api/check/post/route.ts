import { NextRequest, NextResponse } from "next/server";
import { processCheck } from "@/services/check-engine";
import { analyzeContent } from "@/services/ai-check-service";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { textContent, imageBase64 } = body;

    if (!textContent && !imageBase64) {
      return NextResponse.json({ error: "Provide text or an image" }, { status: 400 });
    }

    // Enforce a 5MB limit for base64 images to protect serverless limits
    if (imageBase64 && imageBase64.length > 5 * 1024 * 1024) {
      return NextResponse.json({ error: "Image too large. Max 5MB." }, { status: 400 });
    }

    // 1. Run deterministic checks on text
    const response = await processCheck({ toolType: "POST", textContent });

    // 2. Run AI checks (Text + Vision)
    const hasApiKey = !!process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.length > 10;

    if (hasApiKey && (textContent?.trim().length > 0 || imageBase64)) {
      try {
        const aiResult = await analyzeContent(textContent || "", imageBase64);
        
        if (aiResult.additionalFindings.length > 0) {
          response.findings.push(...aiResult.additionalFindings);
        }
        
        if (aiResult.saferVersion) {
          response.saferVersion = aiResult.saferVersion;
        }

        // Recalculate risk
        if (aiResult.additionalFindings.some((f: any) => f.severity === "HIGH")) {
          response.riskLevel = "HIGH";
        } else if (response.riskLevel !== "HIGH" && aiResult.additionalFindings.some((f: any) => f.severity === "MEDIUM")) {
          response.riskLevel = "MEDIUM";
        }

        response.summary = `We found ${response.findings.length} thing${response.findings.length === 1 ? "" : "s"} to check in your post.`;

        if (response.riskLevel === "HIGH") {
          response.dont = "DO NOT publish this post in its current form.";
          response.do = "Crop, blur, or remove the flagged items before posting.";
          response.why = "Background details or hidden text can be used to identify you, your location, or your accounts.";
          response.next = "Edit the image or text, then run the check again.";
        }

      } catch (aiError: any) {
        console.error("AI Post analysis failed:", aiError);
      }
    }

    return NextResponse.json(response);
  } catch (error: any) {
    console.error("API Route Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}