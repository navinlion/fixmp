import { NextRequest, NextResponse } from "next/server";
import { analyzeImage } from "@/services/photo-check-service";
import { LIMITS } from "@/config/flags";

// LOGGING RULE: never log user content (image data, findings evidence).
// The failure cause is ALWAYS logged (message only) — a swallowed error here
// once cost days of diagnosis.

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const imageBase64: unknown = body?.imageBase64;
    const note: unknown = body?.note;
    const deepScanRequested: boolean = body?.deepScan === true;

    // 0. Opt-in gate (spec §13/§20): deep analysis runs ONLY when explicitly
    //    requested. The default local self-check never reaches this route
    //    (the client handles it in-browser); this server-side gate is
    //    defense in depth against uninvited uploads.
    if (!deepScanRequested) {
      return NextResponse.json({ status: "SKIPPED" });
    }

    // 1. Validate input (spec §21 — never trust the client)
    if (typeof imageBase64 !== "string" || !imageBase64.startsWith("data:image/")) {
      return NextResponse.json({ error: "Please upload a valid image." }, { status: 400 });
    }
    if (!/^data:image\/(jpeg|jpg|png|webp);base64,/.test(imageBase64)) {
      return NextResponse.json(
        { error: "Unsupported image format. Please use JPG, PNG or WebP." },
        { status: 400 }
      );
    }
    const maxChars = LIMITS.MAX_IMAGE_SIZE_MB * 1024 * 1024 * 1.4;
    if (imageBase64.length > maxChars) {
      return NextResponse.json(
        { error: `Image is too large. Please use an image under ${LIMITS.MAX_IMAGE_SIZE_MB}MB.` },
        { status: 400 }
      );
    }

    // 2. Kill switch (spec §20). Vision analysis has no deterministic fallback,
    //    so we return an honest off-state instead of pretending.
    if (process.env.IMAGE_ANALYSIS_ENABLED !== "true") {
      return NextResponse.json({ status: "AI_OFF" });
    }

    // 3. Analyze — the ONLY deep tier. If it fails, the user gets an honest
    //    error, never a partial result dressed as a complete one.
    const response = await analyzeImage(
      imageBase64,
      typeof note === "string" && note.trim() ? note.trim().slice(0, 300) : undefined
    );

    return NextResponse.json({
      ...response,
      aiUsed: true,
      deepScanStatus: "full",
    });
  } catch (error: any) {
    const msg = String(error?.message ?? "");
    console.error("Photo check failed:", msg); // ALWAYS — this names the real cause

    // Quota vs overload vs network — distinct, honest messages (spec §28)
    if (/quota|RESOURCE_EXHAUSTED/i.test(msg)) {
      return NextResponse.json(
        { error: "The deep scan's daily free-tier limit is reached. It resets tonight — or check again tomorrow." },
        { status: 503 }
      );
    }
    if (/overload|high demand|503|rate/i.test(msg)) {
      return NextResponse.json(
        { error: "FixMP's deep scan is busy right now. Please try again in a minute." },
        { status: 503 }
      );
    }
    if (/timeout|abort/i.test(msg)) {
      return NextResponse.json(
        { error: "The deep scan took too long and was stopped. Please try again." },
        { status: 503 }
      );
    }
    if (/fetch failed|network/i.test(msg)) {
      return NextResponse.json(
        { error: "Couldn't reach the deep scan service. Please try again." },
        { status: 503 }
      );
    }

    console.error("Photo check failed (unclassified):", msg);
    return NextResponse.json(
      { error: "Something went wrong while checking this photo. Please try again." },
      { status: 500 }
    );
  }
}