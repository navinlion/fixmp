import { NextRequest, NextResponse } from "next/server";

// LOGGING RULE: never log image content. Status/message only.
//
// IOPaint 1.6 contract (verified via /openapi.json):
//   POST /api/v1/inpaint  — application/json body { image, mask, ... }
//   where image/mask are base64 strings (Pydantic v2 bytes fields)
//   200 response — JSON, containing the result image as base64.

const MAX_PATCH_CHARS = 8 * 1024 * 1024;
const TIMEOUT_MS = 240_000;

function looksLikeImage(buf: Buffer): boolean {
  return (buf[0] === 0x89 && buf[1] === 0x50) || (buf[0] === 0xff && buf[1] === 0xd8);
}

export async function POST(req: NextRequest) {
  try {
    if (process.env.INPAINT_ENABLED !== "true") {
      return NextResponse.json({ error: "AI retouch is switched off in this test build." }, { status: 503 });
    }
    const endpoint = process.env.INPAINT_ENDPOINT;
    if (!endpoint) {
      return NextResponse.json({ error: "AI retouch service is not configured." }, { status: 503 });
    }

    const body = await req.json();
    const image: unknown = body?.image;
    const mask: unknown = body?.mask;

    if (
      typeof image !== "string" || !image.startsWith("data:image/png;base64,") ||
      typeof mask !== "string" || !mask.startsWith("data:image/png;base64,")
    ) {
      return NextResponse.json({ error: "Invalid retouch request." }, { status: 400 });
    }
    if (image.length > MAX_PATCH_CHARS || mask.length > MAX_PATCH_CHARS) {
      return NextResponse.json({ error: "Retouch region too large." }, { status: 400 });
    }

    // JSON contract: raw base64 (no data: prefix) for the bytes fields.
    const payload = {
      image: image.split(",")[1],
      mask: mask.split(",")[1],
      model: "lama",
    };

    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (!res.ok) {
      const errBody = await res.text().catch(() => "");
      console.error(`Retouch service error ${res.status}:`, errBody.slice(0, 500));
      return NextResponse.json(
        { error: "The AI retouch service returned an error. Standard retouch still works." },
        { status: 502 }
      );
    }

    // Response is JSON: { image: "<base64 png>" } (schema undocumented — handle
    // defensively; fall back to treating the body as raw image bytes).
    const text = await res.text();
    let resultB64: string | null = null;
    try {
      const j = JSON.parse(text);
      if (typeof j?.image === "string") {
        resultB64 = j.image.startsWith("data:") ? j.image.split(",")[1] : j.image;
      }
    } catch {
      /* not JSON — fall through to raw-bytes handling */
    }

    let buf: Buffer;
    if (resultB64) {
      buf = Buffer.from(resultB64, "base64");
    } else {
      buf = Buffer.from(text, "base64");
    }

    if (!looksLikeImage(buf)) {
      console.error(
        "Retouch service returned non-image:",
        text.slice(0, 300) // diagnostics only
      );
      return NextResponse.json(
        { error: "AI retouch service responded unexpectedly. Standard retouch still works." },
        { status: 502 }
      );
    }

    return NextResponse.json({ image: `data:image/png;base64,${buf.toString("base64")}` });
  } catch (error: any) {
    const msg = String(error?.message ?? "");
    console.error("Retouch failed:", msg); // message only
    if (/abort|timeout/i.test(msg)) {
      return NextResponse.json(
        { error: "AI retouch took too long and was stopped. Please retry — if it keeps happening, use Standard retouch." },
        { status: 503 }
      );
    }
    if (/ECONNREFUSED|fetch failed|network/i.test(msg)) {
      return NextResponse.json(
        { error: "AI retouch service isn't reachable. Make sure IOPaint is running, or use Standard retouch." },
        { status: 503 }
      );
    }
    return NextResponse.json(
      { error: "Something went wrong while retouching. Please try again." },
      { status: 500 }
    );
  }
}