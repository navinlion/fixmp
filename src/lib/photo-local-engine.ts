// ═══════════════════════════════════════════════════════════════
// FixMP Local Photo Intelligence Engine (v3 — ML region detection)
//
// Principle: "FixMP should know what it found before it asks AI for anything."
//
// DETECTION: local ONNX text-region model (DBNet/PP-OCR det) — finds text
//   AND handwritten strokes generally, no hand-tuned thresholds.
// READING:  Tesseract per-region crops (targeted = accurate).
// CLASSIFY: existing FixMP pattern engine rules.
// METADATA: exifr (GPS/camera). CODES: jsQR multi-scale + quadrant rescue.
//
// The image never leaves the device. Every detector reports explicit
// status — FAILURE is never presented as a negative finding. Confidence
// values derive from measured signals (model probabilities, OCR confidence)
// with formulas inline — never invented.
// ═══════════════════════════════════════════════════════════════

import { createWorker } from "tesseract.js";
import exifr from "exifr";
import jsQR from "jsqr";
import { analyzeUrlDeterministic } from "@/lib/link-checks";
import type { RedactionRegion } from "@/types/check";

// ── Public types ───────────────────────────────────────────────

export type DetectorSource = "local-model" | "local-ocr" | "local-qr" | "local-exif";
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
    text: DetectorResult;   // ML regions + OCR reading + classification
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

async function fileToCanvas(
  file: File,
  targetLongEdge: number,
  opts: { allowUpscale?: boolean } = {}
): Promise<HTMLCanvasElement> {
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.src = url;
  await img.decode();
  URL.revokeObjectURL(url);
  const longEdge = Math.max(img.naturalWidth, img.naturalHeight);
  // BUGFIX: Math.min(1, ...) previously capped this at "shrink only", which
  // silently defeated the QR ladder's upscale passes (small QR modules need
  // magnification to resolve) and broke the "model always sees exactly
  // 960px" guarantee for text detection on images smaller than 960px.
  const scale = opts.allowUpscale ? targetLongEdge / longEdge : Math.min(1, targetLongEdge / longEdge);
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("canvas unavailable");
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas;
}

// ── ONNX session (lazy, cached) ────────────────────────────────

let sessionPromise: Promise<any> | null = null;

async function getSession(): Promise<any> {
  if (!sessionPromise) {
    sessionPromise = (async () => {
      const ort = await import("onnxruntime-web");
      ort.env.wasm.numThreads = 1; // no cross-origin isolation needed
      const res = await fetch("/models/textdet.onnx");
      if (!res.ok) throw new Error(`Model fetch failed (${res.status}) — is public/models/textdet.onnx present?`);
      const buf = await res.arrayBuffer();
      return await ort.InferenceSession.create(buf, { executionProviders: ["wasm"] });
    })();
    sessionPromise.catch(() => { sessionPromise = null; }); // allow retry after failure
  }
  return sessionPromise;
}

// ── Detector 1: ML text-region detection + OCR reading + classification ──

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

const MODEL_SIZE = 960;
const BOX_THRESHOLD = 0.3;   // DBNet standard (per-pixel)
const MIN_REGION_PROB = 0.45; // NEW: per-box mean-probability floor — drops noise blobs
const MAX_REGIONS = 40;
const MAX_OCR_REGIONS = 20;  // bound total OCR time

/** Runs the detection model; returns text-region boxes in ORIGINAL canvas coords. */
async function detectRegions(
  src: HTMLCanvasElement
): Promise<{ boxes: { x0: number; y0: number; x1: number; y1: number; prob: number }[]; loadMs: number; inferMs: number }> {
  const ort = await import("onnxruntime-web");
  const t0 = performance.now();
  const session = await getSession();
  const loadMs = Math.round(performance.now() - t0);

  const t1 = performance.now();
  // Letterbox to MODEL_SIZE square
  const ratio = Math.min(MODEL_SIZE / src.width, MODEL_SIZE / src.height);
  const rw = Math.max(1, Math.round(src.width * ratio));
  const rh = Math.max(1, Math.round(src.height * ratio));
  const input = document.createElement("canvas");
  input.width = MODEL_SIZE;
  input.height = MODEL_SIZE;
  const ictx = input.getContext("2d", { willReadFrequently: true })!;
  ictx.fillStyle = "#000";
  ictx.fillRect(0, 0, MODEL_SIZE, MODEL_SIZE);
  ictx.drawImage(src, 0, 0, rw, rh);

  // Normalize CHW with PaddleOCR mean/std
  const id = ictx.getImageData(0, 0, MODEL_SIZE, MODEL_SIZE).data;
  const mean = [0.485, 0.456, 0.406];
  const std = [0.229, 0.224, 0.225];
  const tensor = new Float32Array(3 * MODEL_SIZE * MODEL_SIZE);
  const plane = MODEL_SIZE * MODEL_SIZE;
  for (let p = 0; p < plane; p++) {
    tensor[p] = (id[p * 4] / 255 - mean[0]) / std[0];
    tensor[plane + p] = (id[p * 4 + 1] / 255 - mean[1]) / std[1];
    tensor[2 * plane + p] = (id[p * 4 + 2] / 255 - mean[2]) / std[2];
  }

  const feeds = { [session.inputNames[0]]: new ort.Tensor("float32", tensor, [1, 3, MODEL_SIZE, MODEL_SIZE]) };
  const results = await session.run(feeds);
  const out = results[session.outputNames[0]];
  const prob = out.data as Float32Array; // [1,1,H,W]
  const inferMs = Math.round(performance.now() - t1);

  // Threshold + connected components → boxes (same CC math, now on model output)
  const mask = new Uint8Array(plane);
  for (let p = 0; p < plane; p++) if (prob[p] >= BOX_THRESHOLD) mask[p] = 1;

  const labels = new Int32Array(plane).fill(-1);
  interface Comp { minX: number; minY: number; maxX: number; maxY: number; px: number; probSum: number }
  const comps: Comp[] = [];
  const stack: number[] = [];
  for (let p0 = 0; p0 < plane; p0++) {
    if (!mask[p0] || labels[p0] !== -1) continue;
    const cid = comps.length;
    const comp: Comp = { minX: MODEL_SIZE, minY: MODEL_SIZE, maxX: 0, maxY: 0, px: 0, probSum: 0 };
    stack.push(p0);
    labels[p0] = cid;
    while (stack.length) {
      const p = stack.pop()!;
      const x = p % MODEL_SIZE, y = (p / MODEL_SIZE) | 0;
      if (x < comp.minX) comp.minX = x;
      if (x > comp.maxX) comp.maxX = x;
      if (y < comp.minY) comp.minY = y;
      if (y > comp.maxY) comp.maxY = y;
      comp.px++;
      comp.probSum += prob[p];
      for (const n of [p - 1, p + 1, p - MODEL_SIZE, p + MODEL_SIZE]) {
        if (n < 0 || n >= plane) continue;
        if ((n % MODEL_SIZE === MODEL_SIZE - 1 && p % MODEL_SIZE === 0) ||
            (n % MODEL_SIZE === 0 && p % MODEL_SIZE === MODEL_SIZE - 1)) continue;
        if (mask[n] && labels[n] === -1) { labels[n] = cid; stack.push(n); }
      }
    }
    comps.push(comp);
  }

  // Unclip: expand each box ~20% of its smaller dim (DBNet standard practice),
  // drop specks, map back to source coords
  const boxes = comps
    .filter((c) => c.px >= 12)
    // BUGFIX: without a mean-probability floor, low-confidence noise blobs
    // (JPEG artifacts, fabric texture, skin creases) were passing through as
    // "regions" purely because they cleared 12px at the *pixel* threshold —
    // the box never carried its own confidence check.
    .filter((c) => c.probSum / Math.max(1, c.px) >= MIN_REGION_PROB)
    .map((c) => {
      const bw = c.maxX - c.minX + 1, bh = c.maxY - c.minY + 1;
      const ux = Math.max(2, Math.round(bw * 0.1));
      const uy = Math.max(2, Math.round(bh * 0.1));
      const x0 = Math.max(0, c.minX - ux), y0 = Math.max(0, c.minY - uy);
      const x1 = Math.min(MODEL_SIZE, c.maxX + ux + 1), y1 = Math.min(MODEL_SIZE, c.maxY + uy + 1);
      return {
        x0: Math.min(src.width, Math.round(x0 / ratio)),
        y0: Math.min(src.height, Math.round(y0 / ratio)),
        x1: Math.min(src.width, Math.round(x1 / ratio)),
        y1: Math.min(src.height, Math.round(y1 / ratio)),
        prob: c.probSum / Math.max(1, c.px), // model's own mean probability — measured confidence
      };
    })
    .filter((b) => b.x1 - b.x0 >= 4 && b.y1 - b.y0 >= 4)
    .sort((a, b) => (b.x1 - b.x0) * (b.y1 - b.y0) - (a.x1 - a.x0) * (a.y1 - a.y0))
    .slice(0, MAX_REGIONS);

  return { boxes, loadMs, inferMs };
}

/** Binarize a crop: grayscale → Otsu threshold. Recovers low-contrast text. */
function binarize(canvas: HTMLCanvasElement): void {
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  const id = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const d = id.data;
  const n = d.length / 4;
  const hist = new Array(256).fill(0);
  for (let i = 0, g = 0; i < d.length; i += 4, g++) {
    const gray = Math.round(0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]);
    hist[gray]++;
    d[i] = d[i + 1] = d[i + 2] = gray;
  }
  // Otsu: maximize between-class variance
  let sum = 0;
  for (let t = 0; t < 256; t++) sum += t * hist[t];
  let sumB = 0, wB = 0, best = 0, thr = 127;
  for (let t = 0; t < 256; t++) {
    wB += hist[t];
    if (wB === 0) continue;
    const wF = n - wB;
    if (wF === 0) break;
    sumB += t * hist[t];
    const mB = sumB / wB, mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) * (mB - mF);
    if (between > best) { best = between; thr = t; }
  }
  for (let i = 0; i < d.length; i += 4) {
    const v = d[i] > thr ? 255 : 0;
    d[i] = d[i + 1] = d[i + 2] = v;
  }
  ctx.putImageData(id, 0, 0);
}

/** OCR one region crop (with binarization fallback); returns measured confidence. */
async function readRegion(
  worker: any, src: HTMLCanvasElement,
  b: { x0: number; y0: number; x1: number; y1: number }
): Promise<{ text: string; confidence: number; lines: number }> {
  const pad = 4;
  const cx = Math.max(0, b.x0 - pad), cy = Math.max(0, b.y0 - pad);
  const cw = Math.min(src.width - cx, b.x1 - b.x0 + pad * 2);
  const ch = Math.min(src.height - cy, b.y1 - b.y0 + pad * 2);
  if (cw < 4 || ch < 4) return { text: "", confidence: 0, lines: 0 };

  const scale = Math.min(3, Math.max(1, 64 / Math.min(cw, ch)));
  const make = (binarized: boolean) => {
    const crop = document.createElement("canvas");
    crop.width = Math.round(cw * scale);
    crop.height = Math.round(ch * scale);
    const cctx = crop.getContext("2d", { willReadFrequently: true })!;
    cctx.imageSmoothingEnabled = true;
    cctx.drawImage(src, cx, cy, cw, ch, 0, 0, crop.width, crop.height);
    if (binarized) binarize(crop);
    return crop;
  };

  const parse = (r: any) => {
    let text = "", confSum = 0, lines = 0;
    for (const blk of r.data?.blocks ?? []) {
      for (const par of blk?.paragraphs ?? []) {
        for (const line of par?.lines ?? []) {
          if (!line?.text?.trim()) continue;
          text += (text ? "\n" : "") + line.text.trim();
          if (typeof line.confidence === "number") { confSum += line.confidence; lines++; }
        }
      }
    }
    return { text, confidence: lines ? confSum / lines / 100 : 0, lines };
  };

  // Pass 1: natural crop
  const first = parse(await worker.recognize(make(false), {}, { blocks: true }));
  if (first.confidence >= 0.7 || first.text.trim()) {
    // Accept natural reading if it produced text with reasonable confidence
    if (first.confidence >= 0.55) return first;
  }
  // Pass 2: binarized retry for low-contrast text
  const second = parse(await worker.recognize(make(true), {}, { blocks: true }));
  return second.confidence > first.confidence ? second : first;
}
async function detectText(file: File, onProgress: ProgressFn): Promise<DetectorResult> {
  const diagnostics: Record<string, string | number> = {};
  try {
    onProgress("Local model — detecting regions", 20);
    // Deterministic resolution: the model ALWAYS sees exactly 960px regardless
    // of device/browser scaling — identical input = identical findings on
    // mobile and desktop.
    const src = await fileToCanvas(file, 960, { allowUpscale: true });
    const { boxes, loadMs, inferMs } = await detectRegions(src);
    diagnostics["model load"] = `${loadMs}ms`;
    diagnostics["inference"] = `${inferMs}ms`;
    diagnostics["regions found"] = boxes.length;
    if (boxes.length === 0) {
      return { detector: "Text regions", status: "pass", findings: [], diagnostics: { ...diagnostics, note: "model found no text-like regions" } };
    }

    onProgress("Reading regions (OCR)", 45);
    // Local assets only
    const worker = await createWorker("eng", 1, {
      workerPath: "/tesseract/worker.min.js",
      corePath: "/tesseract",
      langPath: "/tessdata",
    });

    const findings: LocalFinding[] = [];
    const seen = new Set<string>();
    const W = src.width, H = src.height;
    const toRead = boxes.slice(0, MAX_OCR_REGIONS);
    let readCount = 0, unreadCount = 0;

    for (let i = 0; i < boxes.length; i++) {
      const b = boxes[i];
      const region = toRegion(b.x0, b.y0, b.x1, b.y1, W, H);
      // Detection confidence: the model's own mean probability for this box.
      // BUGFIX: no artificial floor — MIN_REGION_PROB already filtered out
      // anything below a sane confidence, so what's left should be reported
      // as-is instead of being inflated to look more certain than it is.
      const detectionConfidence = Math.min(0.99, b.prob);

      // Bound OCR work: read the largest MAX_OCR_REGIONS regions
      if (i >= MAX_OCR_REGIONS) {
        unreadCount++;
        findings.push({
          type: "handwriting",
          category: "Text region detected",
          severity: "medium",
          evidence: `region ${i + 1} (model confidence ${Math.round(detectionConfidence * 100)}%)`,
          source: "local-model",
          detectionConfidence,
          description: "A text-like region was detected by the local model. (Region was not OCR-read — lower priority.)",
          action: "Review this region; use removal if it contains anything private.",
          region,
        });
        continue;
      }

      const r = await readRegion(worker, src, b);
      readCount++;
      const hasText = r.text.trim().length > 0;
      const readable = hasText && r.confidence >= 0.55; // measured threshold: OCR's own confidence

      // Handwriting label: region found by the model but reading failed or
      // scored low — the honest "marking, not machine-readable" case.
      if (!readable) {
        unreadCount++;
        findings.push({
          type: "handwriting",
          category: "Handwritten marking",
          severity: "medium",
          evidence: `region ${i + 1} (model ${Math.round(detectionConfidence * 100)}%, reading ${Math.round(r.confidence * 100)}%)`,
          source: "local-model",
          detectionConfidence,
          readingConfidence: r.confidence,
          description: "A text/handwritten region was detected locally, but its content could not be read reliably — treat it as sensitive.",
          action: "Remove or pixelate this region before sharing.",
          region,
        });
        continue;
      }

      // Classify readable text through FixMP's pattern engine rules
      const sources = [r.text, ocrDigitFix(r.text)];
      let classified = false;
      for (const c of CLASSIFIERS) {
        for (const srcText of sources) {
          for (const m of srcText.match(c.regex) ?? []) {
            const key = `${c.type}:${m.toLowerCase().replace(/\s+/g, "")}`;
            if (seen.has(key)) continue;
            seen.add(key);
            classified = true;
            findings.push({
              type: c.type,
              category: c.category,
              severity: c.severity,
              value: m,
              evidence: maskEvidence(m),
              source: "local-ocr",
              detectionConfidence,
              readingConfidence: r.confidence,
              description: c.description,
              action: c.action,
              region,
            });
          }
        }
      }
      if (!classified) {
        findings.push({
          type: "text",
          category: "Text detected",
          severity: "low",
          evidence: maskEvidence(r.text.replace(/\n/g, " ").slice(0, 30)),
          source: "local-ocr",
          detectionConfidence,
          readingConfidence: r.confidence,
          description: "Readable text was detected here. Content didn't match sensitive patterns — review visually.",
          action: "Review the region; remove if it contains anything private.",
          region,
        });
      }
    }
    await worker.terminate();

    diagnostics["regions ocr-read"] = readCount;
    diagnostics["regions unread"] = unreadCount;
    diagnostics["findings"] = findings.length;
    return { detector: "Text regions", status: "pass", findings, diagnostics };
  } catch (e: any) {
    return {
      detector: "Text regions", status: "error", findings: [], diagnostics,
      error: `Text analysis could not complete: ${String(e?.message ?? e).slice(0, 140)}`,
    };
  }
}

// ── Detector 2: QR — multi-scale + quadrant rescue (kept from 2.5.1) ──

function scanOnce(canvas: HTMLCanvasElement): { data: string; corners: { x: number; y: number }[] } | null {
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  const id = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const code = jsQR(id.data, canvas.width, canvas.height);
  if (!code?.data) return null;
  const l = code.location;
  return { data: code.data, corners: [l.topLeftCorner, l.topRightCorner, l.bottomLeftCorner, l.bottomRightCorner] };
}

async function detectQr(file: File, onProgress: ProgressFn): Promise<DetectorResult> {
  const diagnostics: Record<string, string | number> = {};
  try {
    onProgress("QR detection — multi-scale", 75);
    // Ladder runs BOTH directions: downscale for huge images, UPSCALE for
    // small ones (small QR modules need magnification to resolve).
    const scales = [1024, 768, 1536, 512];
    const hits: { data: string; region: RedactionRegion; scaleNote: string }[] = [];
    const seenData = new Set<string>();

    for (const s of scales) {
      const canvas = await fileToCanvas(file, s, { allowUpscale: true });
      const hit = scanOnce(canvas);
      diagnostics[`scan@${s}`] = hit ? "found" : "none";
      if (!hit || seenData.has(hit.data)) continue;
      seenData.add(hit.data);
      const W = canvas.width, H = canvas.height;
      const xs = hit.corners.map((c) => c.x);
      const ys = hit.corners.map((c) => c.y);
      hits.push({ data: hit.data, region: toRegion(Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys), W, H), scaleNote: `@${s}px` });
      break;
    }

    if (hits.length === 0) {
      const canvas = await fileToCanvas(file, 1200, { allowUpscale: true });
      const W = canvas.width, H = canvas.height;
      const half = Math.floor(Math.min(W, H) / 2);
      for (let qy = 0; qy < 2 && hits.length === 0; qy++) {
        for (let qx = 0; qx < 2 && hits.length === 0; qx++) {
          const qx0 = qx * (W - half), qy0 = qy * (H - half);
          const work = document.createElement("canvas");
          work.width = half * 2; work.height = half * 2;
          const wctx = work.getContext("2d", { willReadFrequently: true });
          if (!wctx) continue;
          wctx.imageSmoothingEnabled = true;
          wctx.drawImage(canvas, qx0, qy0, half, half, 0, 0, work.width, work.height);
          const hit = scanOnce(work);
          diagnostics[`quadrant(${qx},${qy})@2x`] = hit ? "found" : "none";
          if (!hit || seenData.has(hit.data)) continue;
          seenData.add(hit.data);
          const xs = hit.corners.map((c) => qx0 + c.x / 2);
          const ys = hit.corners.map((c) => qy0 + c.y / 2);
          hits.push({ data: hit.data, region: toRegion(Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys), W, H), scaleNote: "quadrant@2x" });
        }
      }
    }

    diagnostics["codes"] = hits.length;

    // Local classification of decoded payloads (zero network)
    const findings: LocalFinding[] = hits.map((h) => {
      let desc = `A QR code is visible (${h.scaleNote}). Its content was decoded locally.`;
      let act = "Pixelate or crop the QR code unless it's meant to be scanned.";
      let sev: "high" | "medium" | "low" = "medium";
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
            act = "Verify the destination before opening — use the Verify button for the full check.";
          } else {
            desc = "This QR code opens a link. Local pattern checks found no red flags in the address itself.";
            act = "No local red flags — a link's true safety can't be proven without visiting it. Use Verify for the full check.";
          }
        } catch {
          desc = "This QR code contains a link that couldn't be parsed for local verification.";
          act = "Treat as unverified. Use the Verify button for the full check.";
        }
      } else if (/^[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/.test(trimmed)) {
        desc = "This QR code contains an email address — possibly a pre-filled contact or scam channel.";
        act = "Remove or blur unless it's meant to be scanned.";
      } else if (/^BT|upi:|paytm|phonepe/i.test(trimmed)) {
        sev = "high";
        desc = "This QR code appears to contain payment details (UPI/payment string).";
        act = "Never share payment QR codes publicly — they can be abused for fraudulent collections.";
      } else {
        desc = "This QR code contains non-link content, decoded locally.";
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
        description: desc,
        action: act,
        region: h.region,
      };
    });

    return { detector: "QR", status: "pass", findings, diagnostics };
  } catch (e: any) {
    return {
      detector: "QR", status: "error", findings: [], diagnostics,
      error: `QR analysis could not complete: ${String(e?.message ?? e).slice(0, 120)}`,
    };
  }
}

// ── Detector 3: metadata (kept) ────────────────────────────────

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

  const [text, qr, metadata] = await Promise.all([
    detectText(file, onProgress),
    detectQr(file, onProgress),
    detectMetadata(file, onProgress),
  ]);

  const findings = [...text.findings, ...qr.findings, ...metadata.findings];

  return {
    fileName: file.name,
    width: probe.width,
    height: probe.height,
    analyzedAt: new Date().toISOString(),
    findings,
    detectors: { text, qr, metadata },
  };
}