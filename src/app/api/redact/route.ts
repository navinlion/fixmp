import { NextRequest, NextResponse } from "next/server";

// LOGGING RULE: never log image content. Status/message only.
// Forwards a CROPPED PATCH + mask to the LaMa endpoint (IOPaint locally).

const MAX_PATCH_CHARS = 8 * 1024 * 1024;
const TIMEOUT_MS = 120_000;

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

    const imgBytes = Buffer.from(image.split(",")[1], "base64");
    const maskBytes = Buffer.from(mask.split(",")[1], "base64");

    const attempt = (imageField: string) => {
      const form = new FormData();
      form.append(imageField, new Blob([new Uint8Array(imgBytes)], { type: "image/png" }), "image.png");
      form.append("mask", new Blob([new Uint8Array(maskBytes)], { type: "image/png" }), "mask.png");
      form.append("model", "lama");
      form.append("model_name", "lama");
      return fetch(endpoint, {
        method: "POST",
        body: form,
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    };

    let res = await attempt("image");
    if (res.status === 422) {
      res = await attempt("file"); // legacy IOPaint field-name alias
    }

    if (!res.ok) {
      console.error("Retouch service error:", res.status); // status only
      return NextResponse.json(
        { error: "The AI retouch service returned an error. Standard retouch still works." },
        { status: 502 }
      );
    }

    const buf = Buffer.from(await res.arrayBuffer());
    if (!looksLikeImage(buf)) {
      console.error("Retouch service returned non-image:", buf.toString("utf8").slice(0, 200));
      return NextResponse.json(
        { error: "AI retouch service responded unexpectedly. Standard retouch still works." },
        { status: 502 }
      );
    }

    return NextResponse.json({ image: `data:image/png;base64,${buf.toString("base64")}` });
  } catch (error: any) {
    const msg = String(error?.message ?? "");
    console.error("Retouch failed:", msg); // message only
    if (/ECONNREFUSED|fetch failed|network|abort|timeout/i.test(msg)) {
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