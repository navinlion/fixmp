import { NextRequest, NextResponse } from "next/server";
import { analyzePhoto } from "@/services/photo-check-service";

// NATIVE COST CONTROLS
const ALLOWED_MIME_TYPES = ["image/jpeg", "image/png", "image/webp", "image/jpg"];
const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5MB

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { imageBase64 } = body;

    if (!imageBase64 || typeof imageBase64 !== "string") {
      return NextResponse.json({ error: "No image provided" }, { status: 400 });
    }

    // 1. Validate Size (Base64 string length is roughly 4/3 of the binary size)
    const estimatedSize = (imageBase64.length * 3) / 4;
    if (estimatedSize > MAX_FILE_SIZE_BYTES) {
      return NextResponse.json({ error: "Image is too large. Maximum size is 5MB. Please compress or crop the image." }, { status: 400 });
    }

    // 2. Validate MIME Type
    const mimeTypeMatch = imageBase64.match(/^data:(image\/[a-zA-Z+]+);base64,/);
    if (!mimeTypeMatch || !ALLOWED_MIME_TYPES.includes(mimeTypeMatch[1].toLowerCase())) {
      return NextResponse.json({ error: "Invalid file type. Only JPEG, PNG, and WebP images are allowed." }, { status: 400 });
    }

    // 3. Run AI Vision Analysis
    const isAiEnabled = process.env.AI_ENABLED !== "false";
    const hasApiKey = !!process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.length > 10;
    
    if (!isAiEnabled || !hasApiKey) {
      return NextResponse.json({ 
        status: "SUCCESS",
        riskLevel: "MEDIUM",
        summary: "Photo check requires AI analysis.",
        findings: [{ category: "Service Unavailable", severity: "MEDIUM", description: "Advanced AI vision analysis is currently disabled.", recommendedAction: "Please try again later or manually review the image for documents, screens, or QR codes." }],
        dont: "Do not share this photo if you are unsure about its contents.",
        check: "Manually review the image for documents, screens, QR codes, or location clues.",
        do: "Blur or crop any sensitive background details before sharing.",
        why: "Background details can reveal more about you than you intend to share.",
        next: "Use your device's built-in photo editor to redact sensitive areas.",
        confidence: 0.5,
        limitations: "Advanced AI analysis is currently disabled by the administrator."
      }, { status: 503 });
    }

    const aiResult = await analyzePhoto(imageBase64);

    // 4. Calculate Overall Risk
    let riskLevel: "LOW" | "MEDIUM" | "HIGH" = "LOW";
    if (aiResult.findings.some((f) => f.severity === "HIGH")) riskLevel = "HIGH";
    else if (aiResult.findings.some((f) => f.severity === "MEDIUM")) riskLevel = "MEDIUM";

    return NextResponse.json({
      status: "SUCCESS",
      riskLevel,
      summary: aiResult.summary || (aiResult.findings.length > 0 ? `We found ${aiResult.findings.length} thing(s) to check in this photo.` : "No obvious visual privacy risks detected."),
      findings: aiResult.findings,
      dont: aiResult.dont || (riskLevel === "HIGH" ? "Do not share this photo in its current form." : "Proceed with caution."),
      check: aiResult.check || "Review the specific areas flagged in the findings.",
      do: aiResult.do || (riskLevel === "HIGH" ? "Use your phone's editor to blur or crop the flagged areas." : "Double-check the background before posting."),
      why: aiResult.why || "Background details can reveal more about you than you intend to share.",
      next: aiResult.next || "Edit the photo to redact the flagged items, then run the check again.",
      confidence: 0.85,
      limitations: "This is an automated visual analysis. It may not catch highly obscured details, tiny text, or hidden metadata (like GPS coordinates).",
    });

  } catch (error: any) {
    console.error("Photo Check API Error:", error);
    return NextResponse.json({ error: "Failed to analyze image. Please try a smaller file or try again later." }, { status: 500 });
  }
}