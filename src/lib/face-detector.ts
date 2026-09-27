// ═══════════════════════════════════════════════════════════════
// FixMP Local Face Detector — feature #08 "Face Privacy"
//
// Self-contained detector matching the photo-local-engine detector pattern
// (DetectorResult / LocalFinding). Runs 100% client-side using
// `@vladmandic/face-api` (bundles its own TF.js, no @mediapipe dependency).
//
// Error contract (NON-NEGOTIABLE): ANY failure — model fetch, backend init,
// inference — resolves to `status: "error"`. A failed detector is NEVER
// reported as "no faces found." Zero faces after a SUCCESSFUL run is a valid
// negative and is reported as `status: "pass"` with `findings: []`.
//
// No identification, no matching, no demographics. Detection + region only.
//
// Detection capability (REVISION 4 — group / side-profile / dark photos):
//
//   ROOT CAUSES THIS REVISION FIXES (why a 30-person photo found only 4):
//   1. The SSD fallback only ran when Tiny found ZERO faces. A group photo
//      where Tiny found 4 never reached SSD at all. SSD MobileNet v1 is now
//      ALWAYS run and merged with Tiny.
//   2. Both nets resize their input to a fixed square (Tiny → inputSize,
//      SSD → 512×512). On a 2400px crowd canvas, a back-row face (~80px)
//      becomes ~17–26px at net input — physically below the smallest anchor
//      box of either architecture. No threshold tweak can recover that.
//      FIX: TILED DETECTION for crowd photos — the canvas is cut into
//      overlapping ~1024px tiles, SSD runs per tile (faces are effectively
//      2–4× larger relative to the net), and all tile hits are mapped back
//      and NMS-merged with the full-frame passes.
//   3. The geometry gate second-guessed marginal detections using 68-point
//      landmarks that are unreliable on small faces and profiles (a turned
//      face widens the landmark box, a tiny face produces garbage eye
//      positions) — real people were being silently filtered out.
//      FIX: the interocular check is skipped below 48px box width, aspect
//      bounds are widened for profiles, and the detector box is used when
//      the landmark box is degenerate.
//   4. SIDE / PROFILE faces: both detectors have a strong facing bias.
//      FIX: one extra SSD pass runs on the horizontally FLIPPED canvas and
//      results are un-flipped before merging — profiles of either facing
//      direction are caught by whichever orientation the nets prefer.
//   5. DARK photos: the old contrast stretch only triggered when the full
//      sampled luma range was < 60, which night photos with bright light
//      sources (sparklers, lamps, sun glare) easily exceed even though the
//      FACES are still crushed to black. FIX: percentile-based stats
//      (mean luma + 2nd–98th percentile range); when the image is dark or
//      compressed, a boosted variant (stretch + gamma lift) is built and
//      detected as an additional pass, merged with the original.
//
// Model files required in /public/models/face-api/ (all single-file weights —
// @vladmandic/face-api ships ONE .bin per model; there are NO shard files):
//   tiny_face_detector_model-weights_manifest.json + tiny_face_detector_model.bin
//   face_landmark_68_model-weights_manifest.json  + face_landmark_68_model.bin
//   ssd_mobilenetv1_model-weights_manifest.json   + ssd_mobilenetv1_model.bin
// If the SSD files are missing, SSD passes are skipped (never an error) and
// the Tiny + tile results still stand.
// ═══════════════════════════════════════════════════════════════

import type { RedactionRegion } from "@/types/check";
import type { DetectorResult, LocalFinding, ProgressFn } from "@/lib/photo-local-engine";

const MODEL_URL = "/models/face-api/";

// ── Detection profile — chosen from the image's own pixel count, not from a
// prior detection pass, so there's only ever one canvas/coordinate space to
// reason about. ──
const CROWD_PIXEL_THRESHOLD = 2_000_000; // ~1600×1250 and up counts as a likely group/crowd photo

const NORMAL_LONG_EDGE = 1600;
const NORMAL_INPUT_SIZE = 608;
const NORMAL_SCORE_THRESHOLD = 0.5;
const NORMAL_MIN_AREA_FRACTION = 0.0007; // ~0.07% of frame — fine for a photo with a handful of people

const CROWD_LONG_EDGE = 2400;
const CROWD_INPUT_SIZE = 800;
const CROWD_SCORE_THRESHOLD = 0.4;       // small faces score lower purely from size; floor eases slightly, geometry gate still filters junk
const CROWD_MIN_AREA_FRACTION = 0.00015; // a face is legitimately tiny in a 20–30 person formal photo

const CONFIDENT_SCORE = 0.6;    // at/above this, a detection is trusted outright — never geometry-filtered
const MIN_KEEP_SCORE = 0.5;     // hard floor for the marginal band — anything weaker is background junk in practice
const TINY_FACE_MIN_SCORE = 0.5; // boxes < TINY_FACE_PX wide need at least this score (kills background blobs)
const TINY_FACE_PX = 48;        // below this width, 68-point landmarks are guesses — interocular check is skipped
const NMS_IOU_THRESHOLD = 0.35; // overlap fraction above which two raw boxes are treated as the same face

// ── Tiled detection (crowd profile) ──
const TILE_LONG_EDGE = 1024;    // 1024px tile → SSD's fixed 512 input keeps faces at ~0.5 scale — above the anchor floor
const TILE_OVERLAP = 0.28;      // any face up to ~28% of a tile is fully inside at least one tile
const MAX_TILES = 9;            // hard latency bound (2400px canvas needs at most 3×3)
const CPU_MAX_TILES = 4;        // CPU backend is ~10× slower — cut the tile budget

// ── SSD passes (full-frame, both profiles) ──
const SSD_FULL_MIN_CONFIDENCE = 0.35;   // recall-first; geometry gate + NMS clean up
const SSD_DARK_MIN_CONFIDENCE = 0.3;    // dark-variant pass runs a bit hotter — faces there are rare and hard

// ── Dark/flat image boost (variant B) ──
const DARK_MEAN_LUMA = 88;      // mean luma below this counts as a dark photo
const FLAT_P2P98_RANGE = 70;    // p98−p2 span below this counts as flat/compressed
const BOOST_GAMMA = 1.55;       // shadow lift exponent applied on the boosted variant

interface DetectionProfile {
  longEdge: number;
  inputSize: number;
  scoreThreshold: number;
  minAreaFraction: number;
  isCrowd: boolean;
}

function chooseProfile(img: HTMLImageElement): DetectionProfile {
  const pixels = img.naturalWidth * img.naturalHeight;
  const isCrowd = pixels > CROWD_PIXEL_THRESHOLD;
  return isCrowd
    ? { longEdge: CROWD_LONG_EDGE, inputSize: CROWD_INPUT_SIZE, scoreThreshold: CROWD_SCORE_THRESHOLD, minAreaFraction: CROWD_MIN_AREA_FRACTION, isCrowd: true }
    : { longEdge: NORMAL_LONG_EDGE, inputSize: NORMAL_INPUT_SIZE, scoreThreshold: NORMAL_SCORE_THRESHOLD, minAreaFraction: NORMAL_MIN_AREA_FRACTION, isCrowd: false };
}

// ── Lazy-loaded face-api module + models (cached for the page lifetime) ──

type FaceApiModule = typeof import("@vladmandic/face-api");
interface TfBackendOps {
  setBackend: (name: string) => Promise<boolean>;
  ready: () => Promise<void>;
  getBackend: () => string;
}

let cached: FaceApiModule | null = null;
let loading: Promise<FaceApiModule> | null = null;

function errMsg(e: unknown): string {
  if (e instanceof Error) return e.message;
  try { return String(e); } catch { return "unknown error"; }
}

async function loadFaceApi(): Promise<FaceApiModule> {
  if (typeof window === "undefined") {
    throw new Error("Face detection is browser-only.");
  }
  if (cached) return cached;
  if (loading) return loading;

  loading = (async () => {
    const faceapi = await import("@vladmandic/face-api");
    const tfb = faceapi.tf as unknown as TfBackendOps;
    try {
      await tfb.setBackend("webgl");
    } catch {
      await tfb.setBackend("cpu");
    }
    await tfb.ready();

    // TinyFaceDetector + SSD MobileNet v1 for boxes, FaceLandmark68Net to
    // refine boxes and drive the geometry gate. Deliberately NOT loading
    // age/gender, expression, or recognition nets — this feature does
    // detection + region only.
    await faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL);
    await faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL);
    return faceapi;
  })();

  try {
    cached = await loading;
    return cached;
  } catch (e) {
    loading = null; // allow retry on a later call (e.g. transient network failure)
    throw e;
  }
}

// SSD MobileNet v1 is loaded lazily on first use and cached for the page
// lifetime; both the full-frame and tiled passes share one load.
let ssdLoadingPromise: Promise<void> | null = null;
let ssdLoadFailed = false;

async function ensureSsdModel(faceapi: FaceApiModule): Promise<void> {
  if (faceapi.nets.ssdMobilenetv1.isLoaded) return;
  if (ssdLoadFailed) throw new Error("ssd_mobilenetv1 model unavailable");
  if (ssdLoadingPromise) return ssdLoadingPromise;
  ssdLoadingPromise = faceapi.nets.ssdMobilenetv1
    .loadFromUri(MODEL_URL)
    .then(() => undefined)
    .catch((e: unknown) => { ssdLoadFailed = true; throw e; })
    .finally(() => { ssdLoadingPromise = null; });
  return ssdLoadingPromise;
}

/** Pre-warm the models (optional — call on hover/mount to hide first-run latency). */
export async function warmFaceDetector(): Promise<void> {
  try { await loadFaceApi(); } catch { /* surfaced properly on the real call */ }
}

// ── Image decoding (self-contained — no shared helpers from other detectors) ──

export async function fileToImage(file: File): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Downscaled canvas fed to the detector — natural image stays untouched; only used for coordinate math. */
function toDetectionCanvas(img: HTMLImageElement, longEdge: number): HTMLCanvasElement {
  const imgLongEdge = Math.max(img.naturalWidth, img.naturalHeight);
  const scale = Math.min(1, longEdge / imgLongEdge);
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("canvas unavailable");
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas;
}

// ── Luma stats + dark-photo boost (REVISION 4) ──
//
// Percentile-based stats instead of min/max: a night photo with sparklers,
// a lamp or sun glare has a huge min→max span while the FACES stay crushed.
// p2–p98 and the mean describe what most of the frame actually looks like.

interface LumaStats { mean: number; p2: number; p98: number; dark: boolean }

function lumaStats(canvas: HTMLCanvasElement): LumaStats {
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return { mean: 128, p2: 0, p98: 255, dark: false };

  // Sample on a small offscreen copy — statistically identical, much cheaper.
  const w = 256;
  const h = Math.max(1, Math.round((canvas.height / canvas.width) * w));
  const s = document.createElement("canvas");
  s.width = w; s.height = h;
  const sctx = s.getContext("2d", { willReadFrequently: true });
  if (!sctx) return { mean: 128, p2: 0, p98: 255, dark: false };
  sctx.drawImage(canvas, 0, 0, w, h);

  const { data } = sctx.getImageData(0, 0, w, h);
  const hist = new Uint32Array(256);
  let sum = 0, n = 0;
  for (let i = 0; i < data.length; i += 4) {
    const luma = (0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]) | 0;
    hist[luma]++; sum += luma; n++;
  }
  const mean = n > 0 ? sum / n : 128;
  const pct = (p: number): number => {
    const target = n * p;
    let acc = 0;
    for (let v = 0; v < 256; v++) { acc += hist[v]; if (acc >= target) return v; }
    return 255;
  };
  const p2 = pct(0.02);
  const p98 = pct(0.98);
  return { mean, p2, p98, dark: mean < DARK_MEAN_LUMA || p98 - p2 < FLAT_P2P98_RANGE };
}

/**
 * Boosted variant for dark/flat photos: percentile stretch + gamma shadow
 * lift. Only ever applied to a COPY used for an extra detection pass — the
 * original canvas and coordinates are untouched, so regions map back 1:1.
 */
function makeBoostVariant(src: HTMLCanvasElement, stats: LumaStats): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = src.width; canvas.height = src.height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("canvas unavailable");
  ctx.drawImage(src, 0, 0);

  const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const { data } = image;

  const lo = stats.p2, hi = Math.max(stats.p2 + 1, stats.p98);
  const scale = 245 / (hi - lo);
  const gamma = stats.mean < DARK_MEAN_LUMA ? BOOST_GAMMA : 1;
  const lut = new Uint8ClampedArray(256);
  for (let v = 0; v < 256; v++) {
    const stretched = Math.max(0, Math.min(255, (v - lo) * scale));
    lut[v] = 255 * Math.pow(stretched / 255, 1 / gamma);
  }

  for (let i = 0; i < data.length; i += 4) {
    data[i] = lut[data[i]];
    data[i + 1] = lut[data[i + 1]];
    data[i + 2] = lut[data[i + 2]];
  }
  ctx.putImageData(image, 0, 0);
  return canvas;
}

function toRegion(x0: number, y0: number, x1: number, y1: number, W: number, H: number): RedactionRegion {
  return {
    xMin: Math.max(0, Math.round((x0 / W) * 1000)),
    yMin: Math.max(0, Math.round((y0 / H) * 1000)),
    xMax: Math.min(1000, Math.round((x1 / W) * 1000)),
    yMax: Math.min(1000, Math.round((y1 / H) * 1000)),
  };
}

// ── Raw detection structures ──
//
// Every pass (full-frame, flipped, tiled, boosted) normalizes its output into
// plain `RawDet` objects in CANVAS coordinates, so results from different
// runs and different coordinate spaces can be NMS-merged as one set.

interface Box { xMin: number; yMin: number; xMax: number; yMax: number }
interface Pt { x: number; y: number }

interface RawDet {
  score: number;
  detBox: Box;     // detector's own box, canvas coords
  landmarks: Pt[]; // 68 points, canvas coords (face-api i59 indexing: 0–16 jaw, 17–26 brows, 27–35 nose, 36–41/42–47 eyes, 48–67 mouth)
}

function dist(a: Pt, b: Pt): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function bboxOf(pts: Pt[]): Box {
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  return { xMin: Math.min(...xs), yMin: Math.min(...ys), xMax: Math.max(...xs), yMax: Math.max(...ys) };
}

function boxArea(b: Box): number {
  return Math.max(0, b.xMax - b.xMin) * Math.max(0, b.yMax - b.yMin);
}

/** Intersection-over-union — how much two boxes overlap, 0 (none) to 1 (identical). */
function iou(a: Box, b: Box): number {
  const x0 = Math.max(a.xMin, b.xMin), y0 = Math.max(a.yMin, b.yMin);
  const x1 = Math.min(a.xMax, b.xMax), y1 = Math.min(a.yMax, b.yMax);
  const inter = Math.max(0, x1 - x0) * Math.max(0, y1 - y0);
  const union = boxArea(a) + boxArea(b) - inter;
  return union > 0 ? inter / union : 0;
}

function meanPt(pts: Pt[]): Pt {
  return {
    x: pts.reduce((s, p) => s + p.x, 0) / pts.length,
    y: pts.reduce((s, p) => s + p.y, 0) / pts.length,
  };
}

/** Run one detector pass and normalize results into canvas-space RawDets. */
async function runPass(
  faceapi: FaceApiModule,
  canvas: HTMLCanvasElement,
  options: InstanceType<FaceApiModule["TinyFaceDetectorOptions"]> | InstanceType<FaceApiModule["SsdMobilenetv1Options"]>,
): Promise<RawDet[]> {
  const results = await faceapi.detectAllFaces(canvas, options).withFaceLandmarks();
  return results.map((r) => ({
    score: r.detection.score,
    detBox: {
      xMin: r.detection.box.x,
      yMin: r.detection.box.y,
      xMax: r.detection.box.x + r.detection.box.width,
      yMax: r.detection.box.y + r.detection.box.height,
    },
    landmarks: r.landmarks.positions.map((p) => ({ x: p.x, y: p.y })),
  }));
}

/** Re-map a tile-pass RawDet from tile coordinates back into canvas coordinates. */
function shiftDet(d: RawDet, ox: number, oy: number): RawDet {
  return {
    score: d.score,
    detBox: { xMin: d.detBox.xMin + ox, yMin: d.detBox.yMin + oy, xMax: d.detBox.xMax + ox, yMax: d.detBox.yMax + oy },
    landmarks: d.landmarks.map((p) => ({ x: p.x + ox, y: p.y + oy })),
  };
}

/** Mirror a full-frame RawDet from a flipped canvas back into canvas coordinates. */
function flipDet(d: RawDet, W: number): RawDet {
  const flipBox = (b: Box): Box => ({ xMin: W - b.xMax, yMin: b.yMin, xMax: W - b.xMin, yMax: b.yMax });
  return { score: d.score, detBox: flipBox(d.detBox), landmarks: d.landmarks.map((p) => ({ x: W - p.x, y: p.y })) };
}

function mirrorCanvas(src: HTMLCanvasElement): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = src.width; canvas.height = src.height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("canvas unavailable");
  ctx.translate(src.width, 0);
  ctx.scale(-1, 1);
  ctx.drawImage(src, 0, 0);
  return canvas;
}

interface TileRect { x: number; y: number; w: number; h: number }

/** Overlapping tile grid guaranteeing full coverage of the canvas. */
function tileRects(W: number, H: number): TileRect[] {
  const tileW = Math.min(TILE_LONG_EDGE, W);
  const tileH = Math.min(TILE_LONG_EDGE, H);
  const strideX = Math.max(1, Math.round(tileW * (1 - TILE_OVERLAP)));
  const strideY = Math.max(1, Math.round(tileH * (1 - TILE_OVERLAP)));

  const axis = (dim: number, tile: number, stride: number): number[] => {
    if (dim <= tile) return [0];
    const pos: number[] = [];
    for (let p = 0; p < dim - tile; p += stride) pos.push(p);
    pos.push(dim - tile); // guarantee the tail edge is fully covered
    return [...new Set(pos)].sort((a, b) => a - b);
  };

  const xs = axis(W, tileW, strideX);
  const ys = axis(H, tileH, strideY);
  const tiles: TileRect[] = [];
  for (const y of ys) {
    for (const x of xs) {
      tiles.push({ x, y, w: Math.min(tileW, W - x), h: Math.min(tileH, H - y) });
    }
  }
  return tiles.slice(0, MAX_TILES);
}

function cropTile(canvas: HTMLCanvasElement, t: TileRect): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = t.w; c.height = t.h;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("canvas unavailable");
  ctx.drawImage(canvas, t.x, t.y, t.w, t.h, 0, 0, t.w, t.h);
  return c;
}

// ── Geometry gate ──

/**
 * Geometry sanity check — only ever applied to marginal-confidence
 * detections (score between MIN_KEEP_SCORE and CONFIDENT_SCORE). A confident
 * detection always passes without being second-guessed.
 *
 * REVISION 4: the interocular check is skipped for faces narrower than
 * TINY_FACE_PX (68-point landmarks are guesses there — the old version
 * deleted real back-row faces on this check), aspect bounds are widened for
 * profile faces, and the detector box is used when the landmark box is
 * degenerate. Tiny low-score boxes are still rejected to kill background
 * blobs (flowers, windows, posters).
 */
function isPlausibleFace(
  rawBox: Box, detBox: Box, leftEye: Pt[], rightEye: Pt[],
  score: number, canvasArea: number, minAreaFraction: number,
): boolean {
  if (score >= CONFIDENT_SCORE) return true;
  if (score < MIN_KEEP_SCORE) return false;

  const lmSane = rawBox.xMax > rawBox.xMin && rawBox.yMax > rawBox.yMin;
  const box = lmSane ? rawBox : detBox;
  const w = box.xMax - box.xMin;
  const h = box.yMax - box.yMin;
  if (w <= 0 || h <= 0) return false;

  const areaFraction = (w * h) / canvasArea;
  if (areaFraction < minAreaFraction) return false;

  const aspect = h / w; // faces run roughly square to a bit tall; widened for profile/turned faces
  if (aspect < 0.45 || aspect > 2.3) return false;

  if (w < TINY_FACE_PX) {
    // Landmarks are unreliable at this size — rely on the detector's score.
    return score >= TINY_FACE_MIN_SCORE;
  }

  const interocular = dist(meanPt(leftEye), meanPt(rightEye));
  const ratio = interocular / w;
  if (ratio < 0.1 || ratio > 0.8) return false;

  return true;
}

/** Eye-aspect-ratio: standard 6-point formula (Soukupová & Čech). ~0.3 typical open, <~0.20 typically closed. */
function eyeAspectRatio(eye: Pt[]): number {
  const vertical = dist(eye[1], eye[5]) + dist(eye[2], eye[4]);
  const horizontal = dist(eye[0], eye[3]) * 2;
  return horizontal > 0 ? vertical / horizontal : 0;
}

export interface FaceExpression {
  eyesOpen: boolean;
  mouthOpen: boolean;
  /** Coarse yaw estimate from nose-tip vs. inter-eye-midpoint symmetry — not an identity signal, just orientation. */
  orientation: "toward camera" | "turned left" | "turned right";
  summary: string; // one human-readable sentence, matching the FixMP tone used elsewhere
}

function describeExpression(leftEye: Pt[], rightEye: Pt[], mouth: Pt[], nose: Pt[]): FaceExpression {
  const leftEAR = eyeAspectRatio(leftEye);
  const rightEAR = eyeAspectRatio(rightEye);
  const eyesOpen = (leftEAR + rightEAR) / 2 > 0.20;

  const innerTop = mouth[14], innerBottom = mouth[18], leftCorner = mouth[12], rightCorner = mouth[16];
  const mouthWidth = dist(leftCorner, rightCorner);
  const mouthGap = dist(innerTop, innerBottom);
  const mouthOpen = mouthWidth > 0 && mouthGap / mouthWidth > 0.15;

  const eyeMidpoint = { x: (bboxOf(leftEye).xMin + bboxOf(leftEye).xMax + bboxOf(rightEye).xMin + bboxOf(rightEye).xMax) / 4,
                         y: (bboxOf(leftEye).yMin + bboxOf(leftEye).yMax + bboxOf(rightEye).yMin + bboxOf(rightEye).yMax) / 4 };
  const interEyeDist = dist(
    { x: bboxOf(leftEye).xMin, y: bboxOf(leftEye).yMin },
    { x: bboxOf(rightEye).xMax, y: bboxOf(rightEye).yMax }
  ) || 1;
  const noseTip = nose[6];
  const yawRatio = (noseTip.x - eyeMidpoint.x) / interEyeDist;
  const orientation: FaceExpression["orientation"] =
    yawRatio > 0.06 ? "turned left" : yawRatio < -0.06 ? "turned right" : "toward camera";

  const summary = [
    mouthOpen ? "Mouth appears open." : "Mouth appears closed.",
    eyesOpen ? "Eyes appear open." : "Eyes appear closed.",
    orientation === "toward camera"
      ? "Face is oriented approximately toward the camera."
      : `Face appears ${orientation}.`,
  ].join(" ");

  return { eyesOpen, mouthOpen, orientation, summary };
}

export interface DetectedFace {
  box: Box;
  eyeRegions: { left: Box; right: Box };
  expression: FaceExpression;
  score: number;
  faceId: number;
}

export type FaceDetectionOutcome =
  | { ok: true; faces: DetectedFace[]; canvasWidth: number; canvasHeight: number; modelUsed: string; isCrowdProfile: boolean }
  | { ok: false; error: string };

/**
 * REVISION 4 core: NMS-merge raw results from ALL passes, apply the geometry
 * gate, build DetectedFace[]. Coordinates are already canvas-space (full
 * frame, un-flipped, un-tiled), so this is a single flat merge.
 */
function buildFaces(dets: RawDet[], canvasArea: number, minAreaFraction: number): DetectedFace[] {
  const byScore = [...dets].sort((a, b) => b.score - a.score);
  const kept: RawDet[] = [];
  for (const d of byScore) {
    const overlapsKept = kept.some((k) => iou(d.detBox, k.detBox) > NMS_IOU_THRESHOLD);
    if (!overlapsKept) kept.push(d);
  }

  const candidates = kept.map((d) => {
    const lmBox = bboxOf(d.landmarks);
    const det = d.detBox;

    const w = lmBox.xMax - lmBox.xMin;
    const h = lmBox.yMax - lmBox.yMin;
    const sane = w > 0 && h > 0;
    const padX = (sane ? w : (det.xMax - det.xMin)) * 0.25;
    const padTop = (sane ? h : (det.yMax - det.yMin)) * 0.55;
    const padBottom = (sane ? h : (det.yMax - det.yMin)) * 0.15;

    const box: Box = {
      xMin: Math.max(0, Math.min(lmBox.xMin - padX, det.xMin)),
      yMin: Math.max(0, Math.min(lmBox.yMin - padTop, det.yMin)),
      xMax: Math.max(lmBox.xMax + padX, det.xMax),
      yMax: Math.max(lmBox.yMax + padBottom, det.yMax),
    };
    const rawBox: Box = sane ? lmBox : det;

    // face-api 68-point groups, applied to the raw positions array so that
    // results from any pass share one code path.
    const leftEye = d.landmarks.slice(36, 42);
    const rightEye = d.landmarks.slice(42, 48);
    const mouth = d.landmarks.slice(48, 68);
    const nose = d.landmarks.slice(27, 36);
    const eyePad = Math.max(0, (sane ? w : 0)) * 0.06;
    const padBox = (b: Box): Box => ({ xMin: b.xMin - eyePad, yMin: b.yMin - eyePad, xMax: b.xMax + eyePad, yMax: b.yMax + eyePad });

    return {
      box, rawBox, detBox: det, leftEye, rightEye,
      eyeRegions: { left: padBox(bboxOf(leftEye)), right: padBox(bboxOf(rightEye)) },
      expression: describeExpression(leftEye, rightEye, mouth, nose),
      score: d.score,
    };
  });

  const plausible = candidates.filter((c) =>
    isPlausibleFace(c.rawBox, c.detBox, c.leftEye, c.rightEye, c.score, canvasArea, minAreaFraction)
  );

  plausible.sort((a, b) => a.box.xMin - b.box.xMin); // left-to-right reading order

  return plausible.map((c, i) => ({
    box: c.box,
    eyeRegions: c.eyeRegions,
    expression: c.expression,
    score: c.score,
    faceId: i,
  }));
}

/**
 * Runs face + landmark detection on an already-decoded image. Exposed
 * separately from `detectFace` (the DetectorResult-shaped entrypoint) so the
 * focused /check/face panel can draw region overlays directly without
 * re-deriving LocalFinding wording.
 */
export async function detectFacesInImage(img: HTMLImageElement): Promise<FaceDetectionOutcome> {
  let faceapi: FaceApiModule;
  try {
    faceapi = await loadFaceApi();
  } catch (e) {
    return { ok: false, error: `Face detection model could not load: ${errMsg(e)}` };
  }

  try {
    const profile = chooseProfile(img);
    const canvas = toDetectionCanvas(img, profile.longEdge);
    const canvasArea = canvas.width * canvas.height;
    const W = canvas.width;
    const stats = lumaStats(canvas);

    const tfb = faceapi.tf as unknown as TfBackendOps;
    const backend = tfb.getBackend();
    const cpuBackend = backend !== "webgl";

    const dets: RawDet[] = [];
    const passesUsed: string[] = [];

    // SSD availability is decided once — a missing model files silently
    // degrades to Tiny-only instead of erroring or retry-fetching per pass.
    let hasSsd = false;
    try {
      await ensureSsdModel(faceapi);
      hasSsd = true;
    } catch { /* SSD files not present — Tiny + geometry gate still stand */ }

    // ── Pass set A: the photo as-is ──
    const tinyOptions = new faceapi.TinyFaceDetectorOptions({
      inputSize: profile.inputSize,
      scoreThreshold: profile.scoreThreshold,
    });
    dets.push(...await runPass(faceapi, canvas, tinyOptions));
    passesUsed.push("tiny_face_detector");

    if (hasSsd) {
      const ssdOptions = new faceapi.SsdMobilenetv1Options({ minConfidence: SSD_FULL_MIN_CONFIDENCE });
      dets.push(...await runPass(faceapi, canvas, ssdOptions));
      passesUsed.push("ssd_mobilenetv1");

      // Flipped pass — profile faces of the facing direction the nets are
      // biased against. One of the cheapest big-recall wins available.
      if (!cpuBackend) {
        try {
          const mirrored = mirrorCanvas(canvas);
          const flippedDets = await runPass(faceapi, mirrored, ssdOptions);
          dets.push(...flippedDets.map((d) => flipDet(d, W)));
          passesUsed.push("ssd_mobilenetv1 (flipped)");
        } catch { /* flip pass is best-effort */ }
      }
    }

    // ── Tiled pass (crowd profile) — the fix for 30-person group photos ──
    if (profile.isCrowd && hasSsd) {
      const tiles = tileRects(W, canvas.height);
      const budget = cpuBackend ? CPU_MAX_TILES : tiles.length;
      const tileOptions = new faceapi.SsdMobilenetv1Options({ minConfidence: 0.3 });
      let tilesRun = 0;
      for (const t of tiles.slice(0, budget)) {
        try {
          const tileCanvas = cropTile(canvas, t);
          const tileDets = await runPass(faceapi, tileCanvas, tileOptions);
          dets.push(...tileDets.map((d) => shiftDet(d, t.x, t.y)));
          tileCanvas.width = 0; tileCanvas.height = 0; // free early
          tilesRun++;
        } catch { /* per-tile failure is non-fatal */ }
      }
      if (tilesRun > 0) passesUsed.push(`ssd_mobilenetv1 ×${tilesRun} tiles`);
    }

    // ── Pass set B: boosted variant for dark/flat photos ──
    if (stats.dark) {
      try {
        const boosted = makeBoostVariant(canvas, stats);
        dets.push(...await runPass(faceapi, boosted, tinyOptions));
        passesUsed.push("tiny_face_detector (boosted)");
        if (hasSsd) {
          const darkSsdOptions = new faceapi.SsdMobilenetv1Options({ minConfidence: SSD_DARK_MIN_CONFIDENCE });
          dets.push(...await runPass(faceapi, boosted, darkSsdOptions));
          passesUsed.push("ssd_mobilenetv1 (boosted)");
          if (!cpuBackend) {
            try {
              const mirrored = mirrorCanvas(boosted);
              const flippedDets = await runPass(faceapi, mirrored, darkSsdOptions);
              dets.push(...flippedDets.map((d) => flipDet(d, W)));
              passesUsed.push("ssd_mobilenetv1 (boosted, flipped)");
            } catch { /* flip pass is best-effort */ }
          }
        }
        boosted.width = 0; boosted.height = 0;
      } catch { /* boosted pass is best-effort — original passes already ran */ }
    }

    const faces = buildFaces(dets, canvasArea, profile.minAreaFraction);

    return {
      ok: true,
      faces,
      canvasWidth: canvas.width,
      canvasHeight: canvas.height,
      modelUsed: passesUsed.join(" + ") || "none",
      isCrowdProfile: profile.isCrowd,
    };
  } catch (e) {
    return { ok: false, error: `Face detection failed: ${errMsg(e)}` };
  }
}

// ── DetectorResult-shaped entrypoint — this is what photo-local-engine.ts calls ──

export async function detectFace(file: File, onProgress: ProgressFn = () => {}): Promise<DetectorResult> {
  const diagnostics: Record<string, string | number> = {};
  try {
    onProgress("Face detection", 70);
    const img = await fileToImage(file);
    const outcome = await detectFacesInImage(img);

    if (!outcome.ok) {
      return {
        detector: "Face",
        status: "error",
        findings: [],
        diagnostics,
        error: `Face detection could not complete: ${outcome.error}`,
      };
    }

    diagnostics["faces"] = outcome.faces.length;
    diagnostics["model"] = `${outcome.modelUsed} (local, NMS-merged, geometry-gated)`;
    diagnostics["profile"] = outcome.isCrowdProfile ? "crowd (high-res pass + tiles)" : "standard";

    const multiple = outcome.faces.length > 1;
    const findings: LocalFinding[] = outcome.faces.map((face, i) => {
      const region = toRegion(
        face.box.xMin, face.box.yMin, face.box.xMax, face.box.yMax,
        outcome.canvasWidth, outcome.canvasHeight
      );
      const pct = Math.round(face.score * 100);
      return {
        type: "face",
        category: outcome.faces.length > 1 ? `Face ${i + 1} of ${outcome.faces.length}` : "Face visible",
        severity: multiple ? "high" : "medium",
        evidence: `${pct}% confidence`,
        source: "local-face",
        detectionConfidence: face.score,
        description: multiple
          ? `One of ${outcome.faces.length} faces detected in this photo. Posting a photo with other people in it is a decision they didn't get to make.`
          : "A face is visible in this photo.",
        action: "Blur or crop this face unless this person has agreed to be posted, or use the safe-copy generator below.",
        region,
      };
    });

    return { detector: "Face", status: "pass", findings, diagnostics };
  } catch (e) {
    return {
      detector: "Face", status: "error", findings: [], diagnostics,
      error: `Face detection could not complete: ${errMsg(e).slice(0, 160)}`,
    };
  }
}
