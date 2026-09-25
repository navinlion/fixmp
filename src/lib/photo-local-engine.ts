// ═══════════════════════════════════════════════════════════════
// FixMP Local Photo Intelligence Engine (Stage 2.5.1)
//
// v2: multi-scale QR detection (small codes now found via downscale
// ladder + magnification), tighter ink regions (higher analysis res,
// narrower margins, shape filtering).
//
// Principle: "FixMP should know what it found before it asks AI for anything."
// Every detector returns explicit status — FAILURE is never a negative finding.
// Confidence values derive from measured signals with inline formulas.
// ═══════════════════════════════════════════════════════════════

import { createWorker, PSM } from "tesseract.js";
import exifr from "exifr";
import jsQR from "jsqr";
import type { RedactionRegion } from "@/types/check";
import { analyzeUrlDeterministic } from "@/lib/link-checks";

// ── Public types ───────────────────────────────────────────────

export type DetectorSource = "local-ocr" | "local-ink" | "local-qr" | "local-exif";
export type DetectorStatus = "pass" | "error";

export interface LocalFinding {
  type: string;
  category: string;
  severity: "high" | "medium" | "low";
  value?: string;
  evidence: string;
  source: DetectorSource;
  detectionConfidence: number;
  readingConfidence?: number;
  description: string;
  action: string;
  region?: RedactionRegion;
}

export interface DetectorResult {
  detector: string;
  status: DetectorStatus;
  findings: LocalFinding[];
  diagnostics: Record<string, string | number>;
  error?: string;
}

export interface LocalPhotoReport {
  fileName: string;
  width: number;
  height: number;
  analyzedAt: string;
  findings: LocalFinding[];
  detectors: {
    ocr: DetectorResult;
    ink: DetectorResult;
    qr: DetectorResult;
    metadata: DetectorResult;
  };
}

export type ProgressFn = (step: string, pct: number) => void;

// ── Helpers ────────────────────────────────────────────────────

function maskEvidence(v: string): string {
  const s = v.trim();
  if (s.length <= 4) return "•".repeat(s.length);
  return s.slice(0, 3) + "•".repeat(Math.min(s.length - 4, 8)) + s.slice(-1);
}

function toRegion(
  x0: number, y0: number, x1: number, y1: number, W: number, H: number
): RedactionRegion {
  return {
    xMin: Math.max(0, Math.round((x0 / W) * 1000)),
    yMin: Math.max(0, Math.round((y0 / H) * 1000)),
    xMax: Math.min(1000, Math.round((x1 / W) * 1000)),
    yMax: Math.min(1000, Math.round((y1 / H) * 1000)),
  };
}

async function fileToCanvas(file: File, maxEdge: number): Promise<HTMLCanvasElement> {
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.src = url;
  await img.decode();
  URL.revokeObjectURL(url);
  const scale = Math.min(1, maxEdge / Math.max(img.naturalWidth, img.naturalHeight));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("canvas unavailable");
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas;
}

/** Grayscale + percentile contrast stretch (2%–98%). */
function preprocessForOcr(src: HTMLCanvasElement): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = src.width;
  c.height = src.height;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("canvas unavailable");
  ctx.drawImage(src, 0, 0);
  const id = ctx.getImageData(0, 0, c.width, c.height);
  const d = id.data;
  const gray = new Uint8ClampedArray(d.length / 4);
  for (let i = 0, g = 0; i < d.length; i += 4, g++) {
    gray[g] = Math.round(0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]);
  }
  const sample: number[] = [];
  for (let g = 0; g < gray.length; g += 97) sample.push(gray[g]);
  sample.sort((a, b) => a - b);
  const lo = sample[Math.floor(sample.length * 0.02)] ?? 0;
  const hi = sample[Math.floor(sample.length * 0.98)] ?? 255;
  const range = Math.max(1, hi - lo);
  for (let i = 0, g = 0; i < d.length; i += 4, g++) {
    const v = Math.max(0, Math.min(255, Math.round(((gray[g] - lo) / range) * 255)));
    d[i] = d[i + 1] = d[i + 2] = v;
  }
  ctx.putImageData(id, 0, 0);
  return c;
}

// ── Detector 1: OCR + classification (unchanged from v1) ───────

const CLASSIFIERS: Array<{
  type: string; category: string; severity: "high" | "medium" | "low";
  regex: RegExp; description: string; action: string;
}> = [
  {
    type: "email", category: "Email address", severity: "medium",
    regex: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/gi,
    description: "An email address is visible in this photo.",
    action: "Remove or pixelate it unless it's meant to be public.",
  },
  {
    type: "phone", category: "Phone number", severity: "medium",
    regex: /(?!\d)(?:\+\d{1,3}[\s.-]?)?(?:\d{10}|\d{5}[-.\s]\d{5}|\d{3}[-.\s]\d{3}[-.\s]\d{4})(?!\d)/g,
    description: "A phone number is visible in this photo.",
    action: "Remove or pixelate it unless it's meant to be public.",
  },
  {
    type: "address", category: "Street address", severity: "high",
    regex: /(?:#\s?\d+[\d/\-A-Za-z\s,]{0,30}|\b\d+[/\-]\d+,?\s+[A-Za-z0-9\s,]{0,30})\s*(?:cross|main|street|st|road|rd|nagar|colony|sector|block|layout|extension|marg)\b/i,
    description: "Something that looks like a street address is visible in this photo.",
    action: "Remove it — an address tied to a face is a safety risk.",
  },
  {
    type: "url", category: "Link", severity: "low",
    regex: /https?:\/\/\S+|www\.[A-Za-z0-9-]+\.[A-Za-z]{2,}\S*/gi,
    description: "A link is visible in this photo.",
    action: "Check where it leads before sharing.",
  },
  {
    type: "id-number", category: "ID-like number", severity: "medium",
    regex: /\b(?:\d{4}[-\s]?){2}\d{4}\b/g,
    description: "A 12-digit number (ID-card format) is visible in this photo.",
    action: "Verify what it is and remove it if it identifies anyone.",
  },
];

function ocrDigitFix(s: string): string {
  return s.replace(/[Oo]/g, "0").replace(/[Il|]/g, "1");
}

interface OcrLine { text: string; confidence: number; bbox?: { x0: number; y0: number; x1: number; y1: number } }

async function detectOcrAndClassify(file: File, onProgress: ProgressFn): Promise<DetectorResult> {
  const diagnostics: Record<string, string | number> = {};
  try {
    onProgress("OCR — reading visible text", 25);
    const base = await fileToCanvas(file, 2000);
    const pre = preprocessForOcr(base);

    const worker = await createWorker("eng", 1, {
      workerPath: "/tesseract/worker.min.js",
      corePath: "/tesseract",
      langPath: "/tessdata",
    });

    const collect = (data: any): OcrLine[] =>
      (data?.blocks ?? [])
        .flatMap((b: any) => b?.paragraphs ?? [])
        .flatMap((p: any) => p?.lines ?? [])
        .map((l: any) => ({
          text: l?.text ?? "",
          confidence: typeof l?.confidence === "number" ? l.confidence / 100 : 0.5,
          bbox: l?.bbox,
        }))
        .filter((l: OcrLine) => l.text.trim().length > 0);

    // Three-pass strategy: SPARSE (scattered overlays), AUTO (layout),
    // RAW_LINE-style word sweep via SPARSE on the UNPROCESSED image (contrast
    // stretch can hurt some photos — both variants are tried).
    let lines: OcrLine[] = [];
    try {
      await worker.setParameters({ tessedit_pageseg_mode: PSM.SPARSE_TEXT });
      const r1 = await worker.recognize(pre, {}, { blocks: true });
      lines = lines.concat(collect(r1.data));
      diagnostics["sparse pass"] = `${collect(r1.data).length} lines`;
    } catch (e: any) {
      diagnostics["sparse pass"] = `failed: ${String(e?.message ?? e).slice(0, 80)}`;
    }
    try {
      await worker.setParameters({ tessedit_pageseg_mode: PSM.AUTO });
      const r2 = await worker.recognize(pre, {}, { blocks: true });
      lines = lines.concat(collect(r2.data));
      diagnostics["auto pass"] = `${collect(r2.data).length} lines`;
    } catch (e: any) {
      diagnostics["auto pass"] = `failed: ${String(e?.message ?? e).slice(0, 80)}`;
    }
    // Third pass: original (non-stretched) image — catches cases where the
    // percentile stretch hurts more than it helps (e.g. tiny text on smooth skin).
    try {
      const raw = await fileToCanvas(file, 2000);
      await worker.setParameters({ tessedit_pageseg_mode: PSM.SPARSE_TEXT });
      const r3 = await worker.recognize(raw, {}, { blocks: true });
      lines = lines.concat(collect(r3.data));
      diagnostics["raw pass"] = `${collect(r3.data).length} lines`;
    } catch (e: any) {
      diagnostics["raw pass"] = `failed: ${String(e?.message ?? e).slice(0, 80)}`;
    }
    await worker.terminate();

    diagnostics["lines read"] = lines.length;
    if (lines.length === 0) {
      return {
        detector: "OCR", status: "pass", findings: [],
        diagnostics: { ...diagnostics, note: "no text recognized" },
      };
    }

    const findings: LocalFinding[] = [];
    const seen = new Set<string>();
    const remember = (k: string) => (seen.has(k) ? false : (seen.add(k), true));
    const W = pre.width, H = pre.height;

    for (const line of lines) {
      const region = line.bbox
        ? toRegion(line.bbox.x0, line.bbox.y0, line.bbox.x1, line.bbox.y1, W, H)
        : undefined;
      const reading = Math.max(0, Math.min(1, line.confidence));

      const sources = [line.text, ocrDigitFix(line.text)];
      for (const c of CLASSIFIERS) {
        for (const src of sources) {
          for (const m of src.match(c.regex) ?? []) {
            const key = `${c.type}:${m.toLowerCase().replace(/\s+/g, "")}`;
            if (!remember(key)) continue;
            findings.push({
              type: c.type,
              category: c.category,
              severity: c.severity,
              value: m,
              evidence: maskEvidence(m),
              source: "local-ocr",
              detectionConfidence: 0.9,
              readingConfidence: reading,
              description: c.description,
              action: c.action,
              region,
            });
          }
        }
      }
    }

    diagnostics["findings"] = findings.length;
    return { detector: "OCR", status: "pass", findings, diagnostics };
  } catch (e: any) {
    return {
      detector: "OCR", status: "error", findings: [], diagnostics,
      error: `OCR could not complete: ${String(e?.message ?? e).slice(0, 120)}`,
    };
  }
}

// ── Detector 2: ink / handwriting — v2 precision ───────────────

// (marker — the function body below through its closing brace is replaced)
async function detectInk(file: File, onProgress: ProgressFn): Promise<DetectorResult> {
  const diagnostics: Record<string, string | number> = {};
  try {
    onProgress("Ink analysis — stroke detection", 55);
    const canvas = await fileToCanvas(file, 1000);
    const W = canvas.width, H = canvas.height;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) throw new Error("canvas unavailable");
    const d = ctx.getImageData(0, 0, W, H).data;

    const hueLo = 190, hueHi = 260;
    const mask = new Uint8Array(W * H);
    let maskCount = 0;
    for (let p = 0; p < W * H; p++) {
      const i = p * 4;
      const r = d[i] / 255, g = d[i + 1] / 255, b = d[i + 2] / 255;
      const max = Math.max(r, g, b), min = Math.min(r, g, b);
      const v = max, s = max === 0 ? 0 : (max - min) / max;
      let h = 0;
      if (max !== min) {
        const dd = max - min;
        if (max === b) h = 60 * (4 + (r - g) / dd);
        else if (max === g) h = 60 * (2 + (b - r) / dd);
        else h = 60 * ((g - b) / dd);
        if (h < 0) h += 360;
      }
      if (h >= hueLo && h <= hueHi && s > 0.3 && v > 0.2) {
        mask[p] = 1;
        maskCount++;
      }
    }
    diagnostics["ink pixels"] = maskCount;

    const labels = new Int32Array(W * H).fill(-1);
    interface Comp { minX: number; minY: number; maxX: number; maxY: number; px: number; strong: number }
    const comps: Comp[] = [];
    const stack: number[] = [];
    for (let p0 = 0; p0 < W * H; p0++) {
      if (!mask[p0] || labels[p0] !== -1) continue;
      const id = comps.length;
      const comp: Comp = { minX: W, minY: H, maxX: 0, maxY: 0, px: 0, strong: 0 };
      stack.push(p0);
      labels[p0] = id;
      while (stack.length) {
        const p = stack.pop()!;
        const x = p % W, y = (p / W) | 0;
        if (x < comp.minX) comp.minX = x;
        if (x > comp.maxX) comp.maxX = x;
        if (y < comp.minY) comp.minY = y;
        if (y > comp.maxY) comp.maxY = y;
        comp.px++;
        for (const n of [p - 1, p + 1, p - W, p + W]) {
          if (n < 0 || n >= W * H) continue;
          if ((n % W === W - 1 && p % W === 0) || (n % W === 0 && p % W === W - 1)) continue;
          if (mask[n] && labels[n] === -1) { labels[n] = id; stack.push(n); }
        }
      }
      comps.push(comp);
    }

    // ── Shape-based classification (v3) ──
    // Handwriting = SPARSE strokes (thin ink over a bounding box).
    // Solid objects (sunglasses frames, blue clothing) = DENSE blobs.
    // Single letters = dense compact blobs too. Density is the discriminator:
    //   stroke-like: density roughly 0.04–0.38
    //   blob/object: density > 0.42  → reject
    // Also reject: tiny noise (< minPx), oversized objects (> 1.5% of frame
    // pixels — the sunglasses false positive was 2.08%).
    const minPx = Math.max(150, Math.round(W * H * 0.0004));
    const maxShare = 0.015; // component pixels / whole-frame pixels
    const margin = Math.round(Math.min(W, H) * 0.012);

    const kept: Comp[] = [];
    let rejectedDense = 0, rejectedBig = 0, rejectedSmall = 0;
    for (const c of comps) {
      const bw = c.maxX - c.minX + 1, bh = c.maxY - c.minY + 1;
      const density = c.px / Math.max(1, bw * bh);
      const share = c.px / (W * H);
      if (c.px < minPx) { rejectedSmall++; continue; }
      if (share > maxShare) { rejectedBig++; continue; }
      if (density > 0.42 || density < 0.04) { rejectedDense++; continue; }
      kept.push(c);
    }
    diagnostics["components kept"] = kept.length;
    diagnostics["rejected: dense objects"] = rejectedDense;
    diagnostics["rejected: oversized"] = rejectedBig;
    diagnostics["rejected: tiny"] = rejectedSmall;

    const merged: Comp[] = [];
    for (const c of kept) {
      const hit = merged.find(
        (m) =>
          c.minX <= m.maxX + margin && c.maxX >= m.minX - margin &&
          c.minY <= m.maxY + margin && c.maxY >= m.minY - margin
      );
      if (hit) {
        hit.minX = Math.min(hit.minX, c.minX); hit.minY = Math.min(hit.minY, c.minY);
        hit.maxX = Math.max(hit.maxX, c.maxX); hit.maxY = Math.max(hit.maxY, c.maxY);
        hit.px += c.px; hit.strong += c.strong;
      } else merged.push({ ...c });
    }
    diagnostics["regions"] = merged.length;

    const findings: LocalFinding[] = merged.slice(0, 8).map((c, i) => {
      const bw = c.maxX - c.minX, bh = c.maxY - c.minY;
      const density = c.px / Math.max(1, bw * bh);
      const strongRatio = c.px ? c.strong / c.px : 0;
      const detectionConfidence = Math.max(0.55, Math.min(0.97, 0.55 + strongRatio));
      const aspect = bw / Math.max(1, bh);
      const isSignatureLike = aspect > 1.8 && density < 0.3;
      return {
        type: isSignatureLike ? "signature" : "handwriting",
        category: isSignatureLike ? "Possible handwritten signature" : "Handwritten marking",
        severity: "medium" as const,
        evidence: `ink region ${i + 1} (~${Math.round((c.px / (W * H)) * 10000) / 100}% of frame)`,
        source: "local-ink" as const,
        detectionConfidence,
        description: isSignatureLike
          ? "A handwritten signature-like marking is visible (blue ink). Its content cannot be reliably read locally — treat the region as sensitive."
          : "A handwritten marking is visible (blue ink). Its content cannot be reliably read locally — treat the region as sensitive.",
        action: "Remove or pixelate this region before sharing.",
        region: toRegion(c.minX, c.minY, c.maxX + 1, c.maxY + 1, W, H),
      };
    });

    return { detector: "Ink", status: "pass", findings, diagnostics };
  } catch (e: any) {
    return {
      detector: "Ink", status: "error", findings: [], diagnostics,
      error: `Ink analysis could not complete: ${String(e?.message ?? e).slice(0, 120)}`,
    };
  }
}

// ── Detector 3: QR — v2 multi-scale ────────────────────────────

interface QrHit { data: string; region: RedactionRegion; scaleNote: string }

/** Scan a canvas at one scale; return region in THAT canvas's coords. */
function scanOnce(canvas: HTMLCanvasElement): { data: string; corners: { x: number; y: number }[] } | null {
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  const id = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const code = jsQR(id.data, canvas.width, canvas.height);
  if (!code?.data) return null;
  const l = code.location;
  return {
    data: code.data,
    corners: [l.topLeftCorner, l.topRightCorner, l.bottomLeftCorner, l.bottomRightCorner],
  };
}

async function detectQr(file: File, onProgress: ProgressFn): Promise<DetectorResult> {
  const diagnostics: Record<string, string | number> = {};
  try {
    onProgress("QR detection — multi-scale", 75);
    // Scale ladder: full → medium → small. Small codes that vanish at full
    // size become detectable once the image is downscaled (module size grows
    // relative to noise, and jsQR's finder patterns resolve).
    const scales = [1400, 900, 600];
    const hits: QrHit[] = [];
    const seenData = new Set<string>();

    for (const s of scales) {
      const canvas = await fileToCanvas(file, s);
      const hit = scanOnce(canvas);
      diagnostics[`scan@${s}`] = hit ? "found" : "none";
      if (!hit) continue;
      if (seenData.has(hit.data)) continue;
      seenData.add(hit.data);
      const W = canvas.width, H = canvas.height;
      const xs = hit.corners.map((c) => c.x);
      const ys = hit.corners.map((c) => c.y);
      hits.push({
        data: hit.data,
        region: toRegion(Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys), W, H),
        scaleNote: `@${s}px`,
      });
      break; // one decode per unique code is enough — largest-scale hit wins
    }

    // Small-code rescue: if the ladder found nothing, scan QUADRANTS of a
    // downscaled image — a tiny QR occupying one corner is findable when the
    // quadrant is analyzed at effective higher zoom.
    if (hits.length === 0) {
      const canvas = await fileToCanvas(file, 1200);
      const W = canvas.width, H = canvas.height;
      const half = Math.floor(Math.min(W, H) / 2);
      for (let qy = 0; qy < 2 && hits.length === 0; qy++) {
        for (let qx = 0; qx < 2 && hits.length === 0; qx++) {
          const qx0 = qx * (W - half), qy0 = qy * (H - half);
          // magnify quadrant 2x into a work canvas
          const work = document.createElement("canvas");
          work.width = half * 2;
          work.height = half * 2;
          const wctx = work.getContext("2d", { willReadFrequently: true });
          if (!wctx) continue;
          wctx.imageSmoothingEnabled = true;
          wctx.drawImage(canvas, qx0, qy0, half, half, 0, 0, work.width, work.height);
          const hit = scanOnce(work);
          diagnostics[`quadrant(${qx},${qy})@2x`] = hit ? "found" : "none";
          if (!hit) continue;
          if (seenData.has(hit.data)) continue;
          seenData.add(hit.data);
          // Map back: work coords → quadrant coords → full-image coords
          const fx0 = qx0 + (hit.corners[0].x / 2);
          const fy0 = qy0 + (hit.corners[0].y / 2);
          const xs = hit.corners.map((c) => qx0 + c.x / 2);
          const ys = hit.corners.map((c) => qy0 + c.y / 2);
          void fx0; void fy0;
          hits.push({
            data: hit.data,
            region: toRegion(Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys), W, H),
            scaleNote: "quadrant@2x",
          });
        }
      }
    }

    diagnostics["codes"] = hits.length;

    // Local classification of decoded content (spec: analyze locally first).
    // If the payload is a URL, run the deterministic Link-Check rules on it —
    // zero network. Live reachability stays user-initiated (routed to
    // /check/link, which uses the SSRF-safe server probe).
    const findings: LocalFinding[] = hits.map((h) => {
      let desc = `A QR code is visible (${h.scaleNote}). Its content was decoded locally.`;
      let act = "Pixelate or crop the QR code unless it's meant to be scanned.";
      let sev: "high" | "medium" | "low" = "medium";
      let extra = "";

      const trimmed = h.data.trim();
      if (/^https?:\/\//i.test(trimmed)) {
        try {
          const u = new URL(trimmed);
          const urlFindings = analyzeUrlDeterministic(u);
          const highCount = urlFindings.filter((f) => f.severity === "HIGH").length;
          const medCount = urlFindings.filter((f) => f.severity === "MEDIUM").length;
          if (highCount > 0) {
            sev = "high";
            desc = `This QR code opens a link with ${highCount} serious warning sign${highCount === 1 ? "" : "s"}: ${urlFindings.map((f) => f.category.toLowerCase()).join(", ")}.`;
            act = "Do NOT open this destination. Verify with the sender through another channel.";
          } else if (medCount > 0) {
            desc = `This QR code opens a link with ${medCount} caution flag${medCount === 1 ? "" : "s"}: ${urlFindings.map((f) => f.category.toLowerCase()).join(", ")}.`;
            act = "Verify the destination before opening — use the Verify button to run the full link check.";
          } else {
            desc = `This QR code opens a link. Local pattern checks found no red flags in the address itself.`;
            act = "No local red flags — but a link's true safety can't be proven without visiting it. Use Verify for the full check.";
          }
          extra = ` Destination: ${trimmed.slice(0, 80)}`;
          void extra;
        } catch {
          desc = "This QR code contains a link, but the address couldn't be parsed for local verification.";
          act = "Treat as unverified. Use the Verify button to run the full link check.";
        }
      } else if (/^[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/.test(trimmed)) {
        desc = `This QR code contains an email address — possibly a pre-filled contact or scam channel.`;
        act = "Remove or blur unless it's meant to be scanned.";
      } else if (/^BT|upi:|paytm|phonepe/i.test(trimmed)) {
        sev = "high";
        desc = "This QR code appears to contain payment details (UPI/payment string).";
        act = "Never share payment QR codes publicly — they can be abused for fraudulent collections.";
      } else {
        desc = `This QR code contains non-link content (${h.scaleNote}), decoded locally.`;
      }

      return {
        type: "qr",
        category: "QR code visible",
        severity: sev,
        value: h.data,
        evidence: maskEvidence(h.data),
        source: "local-qr" as const,
        detectionConfidence: 0.99,
        readingConfidence: 1,
        description: desc + (extra ? ` ${extra}` : ""),
        action: act,
        region: h.region,
      };
    });

    return {
      detector: "QR", status: "pass",
      findings,
      diagnostics,
    };
  } catch (e: any) {
    return {
      detector: "QR", status: "error", findings: [], diagnostics,
      error: `QR analysis could not complete: ${String(e?.message ?? e).slice(0, 120)}`,
    };
  }
}

// ── Detector 4: metadata (unchanged) ───────────────────────────

async function detectMetadata(file: File, onProgress: ProgressFn): Promise<DetectorResult> {
  const diagnostics: Record<string, string | number> = {};
  try {
    onProgress("Metadata", 90);
    const findings: LocalFinding[] = [];
    const gps = await exifr.gps(file).catch(() => null);
    if (gps && typeof gps.latitude === "number" && typeof gps.longitude === "number") {
      diagnostics["gps"] = "present";
      findings.push({
        type: "gps",
        category: "GPS location in file",
        severity: "high",
        value: `${gps.latitude}, ${gps.longitude}`,
        evidence: `${gps.latitude.toFixed(3)}, ${gps.longitude.toFixed(3)}`,
        source: "local-exif",
        detectionConfidence: 1,
        description: "GPS coordinates are embedded in this photo's metadata — the original file reveals exactly where it was taken.",
        action: "Share the safe copy (it strips metadata), or remove location data first.",
      });
    } else {
      diagnostics["gps"] = "not present";
    }
    const meta = await exifr.parse(file, { pick: ["Make", "Model", "Software", "DateTimeOriginal"] }).catch(() => null);
    if (meta) {
      diagnostics["camera"] = meta.Make ? `${meta.Make} ${meta.Model ?? ""}`.trim() : "unknown";
      diagnostics["software"] = meta.Software ?? "none";
      diagnostics["captured"] = meta.DateTimeOriginal ? String(meta.DateTimeOriginal).slice(0, 10) : "unknown";
    } else {
      diagnostics["exif"] = "none";
    }
    return { detector: "Metadata", status: "pass", findings, diagnostics };
  } catch (e: any) {
    return {
      detector: "Metadata", status: "error", findings: [], diagnostics,
      error: `Metadata analysis could not complete: ${String(e?.message ?? e).slice(0, 120)}`,
    };
  }
}

// ── Orchestrator ───────────────────────────────────────────────

export async function runLocalPhotoIntelligence(
  file: File, onProgress: ProgressFn = () => {}
): Promise<LocalPhotoReport> {
  onProgress("Decoding image", 5);
  const probe = await fileToCanvas(file, 1600);

  const [ocr, ink, qr, metadata] = await Promise.all([
    detectOcrAndClassify(file, onProgress),
    detectInk(file, onProgress),
    detectQr(file, onProgress),
    detectMetadata(file, onProgress),
  ]);

  const findings = [...ocr.findings, ...ink.findings, ...qr.findings, ...metadata.findings];

  return {
    fileName: file.name,
    width: probe.width,
    height: probe.height,
    analyzedAt: new Date().toISOString(),
    findings,
    detectors: { ocr, ink, qr, metadata },
  };
}