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
// No identification, no matching, no demographics. Detection + region only:
// face bounding boxes (from TinyFaceDetector) refined slightly using the 68
// landmark points (from FaceLandmark68Net) so the region hugs the face
// rather than the raw detector box, which tends to run a little tight on
// the chin/forehead. Landmarks are never exposed as a feature of their own.
// ═══════════════════════════════════════════════════════════════

import type { RedactionRegion } from "@/types/check";
import type { DetectorResult, LocalFinding, ProgressFn } from "@/lib/photo-local-engine";

const MODEL_URL = "/models/face-api/";
const DETECTOR_INPUT_SIZE = 416; // TinyFaceDetector's internal resize target
const SCORE_THRESHOLD = 0.5;
const DETECTION_LONG_EDGE = 1280; // canvas fed to the detector — plenty for TinyFaceDetector

// ── Lazy-loaded face-api module + models (cached for the page lifetime) ──

type FaceApiModule = typeof import("@vladmandic/face-api");
interface TfBackendOps {
  setBackend: (name: string) => Promise<boolean>;
  ready: () => Promise<void>;
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

    // TinyFaceDetector for boxes, FaceLandmark68Net to refine the box to the
    // actual face shape. Deliberately NOT loading age/gender, expression, or
    // recognition nets — this feature does detection + region only.
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

/** Pre-warm the models (optional — call on hover/mount to hide first-run latency). */
export async function warmFaceDetector(): Promise<void> {
  try { await loadFaceApi(); } catch { /* surfaced properly on the real call */ }
}

// ── Image decoding (self-contained — no shared helpers from other detectors) ──

async function fileToImage(file: File): Promise<HTMLImageElement> {
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
function toDetectionCanvas(img: HTMLImageElement): HTMLCanvasElement {
  const longEdge = Math.max(img.naturalWidth, img.naturalHeight);
  const scale = Math.min(1, DETECTION_LONG_EDGE / longEdge);
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("canvas unavailable");
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
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

// ── Raw detection (exported for the focused /check/face panel, e.g. region overlays before redaction) ──

export interface DetectedFace {
  /** Region in the SAME coordinate space as `canvasWidth`/`canvasHeight` returned alongside it. */
  box: { xMin: number; yMin: number; xMax: number; yMax: number };
  score: number; // model-measured detection confidence, 0–1
  faceId: number;
}

export type FaceDetectionOutcome =
  | { ok: true; faces: DetectedFace[]; canvasWidth: number; canvasHeight: number }
  | { ok: false; error: string };

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
    const canvas = toDetectionCanvas(img);
    const options = new faceapi.TinyFaceDetectorOptions({
      inputSize: DETECTOR_INPUT_SIZE,
      scoreThreshold: SCORE_THRESHOLD,
    });
    const results = await faceapi.detectAllFaces(canvas, options).withFaceLandmarks();

    const faces: DetectedFace[] = results.map((r, i) => {
      // Prefer the landmark-derived bounding box when available — it tends
      // to hug the actual face better than the raw detector box, which is
      // tuned for detection recall rather than a tight redaction region.
      const pts = r.landmarks.positions;
      const xs = pts.map((p) => p.x);
      const ys = pts.map((p) => p.y);
      const lmBox = { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
      const detBox = r.detection.box;

      // Landmarks cover eyes-to-chin, not forehead/hair — pad up/out a bit
      // so the redaction region actually covers the whole head, not just
      // the lower face. Padding is relative to the box size, not a fixed px
      // count, so it scales correctly at any photo resolution.
      const w = lmBox.x1 - lmBox.x0;
      const h = lmBox.y1 - lmBox.y0;
      const padX = w * 0.25;
      const padTop = h * 0.55; // forehead + hairline
      const padBottom = h * 0.15;

      const x0 = Math.max(0, Math.min(lmBox.x0 - padX, detBox.x));
      const y0 = Math.max(0, Math.min(lmBox.y0 - padTop, detBox.y));
      const x1 = Math.max(lmBox.x1 + padX, detBox.x + detBox.width);
      const y1 = Math.max(lmBox.y1 + padBottom, detBox.y + detBox.height);

      return {
        box: { xMin: x0, yMin: y0, xMax: x1, yMax: y1 },
        score: r.detection.score,
        faceId: i,
      };
    });

    return { ok: true, faces, canvasWidth: canvas.width, canvasHeight: canvas.height };
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
    diagnostics["model"] = "tiny_face_detector + face_landmark_68 (local)";

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
        // Multiple faces = consent risk — you can't know everyone in frame agreed to be posted.
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
