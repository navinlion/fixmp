import type { ElaRegionFinding, ErrorLevelResults } from "./types";

// ═══════════════════════════════════════════════════════════════
// Error Level Analysis (ELA) — the classic manipulation detector.
//
// Principle: recompress the image at a known, uniform JPEG quality; every
// pixel then carries a similar amount of new compression error. Regions that
// were saved at a DIFFERENT quality — a pasted-in element, a retouched patch,
// a re-saved screenshot overlay — absorb noticeably more or less error than
// their surroundings and stand out in the per-tile error map.
//
// Like everything in this module it is an INDICATOR, not proof: heavy
// processing, strong textures and flat skies all produce natural variation.
// The rating bands are deliberately conservative.
//
// Runs inside the forensics Web Worker via OffscreenCanvas; returns
// supported:false when the browser can't re-encode, and the UI hides the
// card instead of showing a fake "clean".
// ═══════════════════════════════════════════════════════════════

const ELA_QUALITY = 0.85; // standard-ish reference quality; uniform by construction
const MAX_ANALYSIS_EDGE = 2400; // cap re-encode cost on huge photos (downscaled copy only)

function locationLabel(col: number, cols: number, row: number, rows: number): string {
  const h = col < cols / 3 ? "left" : col < (2 * cols) / 3 ? "center" : "right";
  const v = row < rows / 3 ? "top" : row < (2 * rows) / 3 ? "middle" : "bottom";
  return v === "middle" && h === "center" ? "center" : `${v}-${h}`;
}

/** Encode → decode helper. Returns re-compressed pixels, or null when unsupported. */
async function roundTrip(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
): Promise<Uint8ClampedArray | null> {
  if (typeof OffscreenCanvas === "undefined") return null;
  try {
    const src = new OffscreenCanvas(width, height);
    const sctx = src.getContext("2d");
    if (!sctx) return null;
    // Copy into a plain ArrayBuffer-backed view — ImageData requires it.
    sctx.putImageData(new ImageData(new Uint8ClampedArray(rgba), width, height), 0, 0);
    const blob = await src.convertToBlob({ type: "image/jpeg", quality: ELA_QUALITY });
    const bmp = await createImageBitmap(blob);
    const out = new OffscreenCanvas(bmp.width, bmp.height);
    const octx = out.getContext("2d");
    if (!octx) return null;
    octx.drawImage(bmp, 0, 0);
    bmp.close();
    const decoded = octx.getImageData(0, 0, out.width, out.height);
    return decoded.data;
  } catch {
    return null;
  }
}

export async function computeErrorLevelAnalysis(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
): Promise<ErrorLevelResults | undefined> {
  // Downscaled working copy for very large images — ELA compares an image
  // against ITSELF, so both sides scale together and the comparison stays valid.
  let work = rgba;
  let w = width;
  let h = height;
  const longEdge = Math.max(width, height);
  if (longEdge > MAX_ANALYSIS_EDGE) {
    const scale = MAX_ANALYSIS_EDGE / longEdge;
    w = Math.max(1, Math.round(width * scale));
    h = Math.max(1, Math.round(height * scale));
    const small = await roundTripNearest(rgba, width, height, w, h);
    if (!small) return undefined;
    work = small;
  }

  const recompressed = await roundTrip(work, w, h);
  if (!recompressed) {
    return {
      label: "Not available in this browser",
      indicator: "unsupported",
      whyItMatters: "Error level analysis needs the browser's offscreen image encoder, which isn't available here.",
      technicalDetails: {},
      limitations: "This test was skipped, not 'clean'.",
      flaggedBlocks: 0,
      totalBlocks: 0,
      topRegions: [],
      supported: false,
    };
  }

  // Per-pixel luminance difference between original and recompressed.
  const lumaDiff = new Float32Array(w * h);
  let totalErr = 0;
  for (let p = 0; p < w * h; p++) {
    const i = p * 4;
    const l0 = 0.299 * work[i] + 0.587 * work[i + 1] + 0.114 * work[i + 2];
    const l1 = 0.299 * recompressed[i] + 0.587 * recompressed[i + 1] + 0.114 * recompressed[i + 2];
    const d = Math.abs(l0 - l1);
    lumaDiff[p] = d;
    totalErr += d;
  }
  const meanError = totalErr / (w * h);

  // Tile the error map (aim ~8×6 grid, tiles ≥ 32px) and find outliers.
  const targetBlock = Math.max(32, Math.round(Math.min(w, h) / 6));
  const cols = Math.max(1, Math.floor(w / targetBlock));
  const rows = Math.max(1, Math.floor(h / targetBlock));
  const bw = Math.floor(w / cols);
  const bh = Math.floor(h / rows);

  interface Tile { col: number; row: number; mean: number }
  const tiles: Tile[] = [];
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      let sum = 0, n = 0;
      for (let y = row * bh; y < (row + 1) * bh; y++) {
        for (let x = col * bw; x < (col + 1) * bw; x++) {
          sum += lumaDiff[y * w + x];
          n++;
        }
      }
      tiles.push({ col, row, mean: n > 0 ? sum / n : 0 });
    }
  }

  const means = tiles.map((t) => t.mean).sort((a, b) => a - b);
  const median = means.length > 0 ? means[Math.floor(means.length / 2)] : 0;
  // Robust spread (MAD) — immune to the outliers we're hunting.
  const absDev = means.map((m) => Math.abs(m - median)).sort((a, b) => a - b);
  const mad = absDev.length > 0 ? absDev[Math.floor(absDev.length / 2)] : 0;
  const floorMad = Math.max(mad, median * 0.15, 0.5); // guard against near-zero MAD on flat images

  const flaggedHigh = tiles.filter((t) => median > 0 && t.mean > median + 4 * floorMad && t.mean > median * 1.9);
  // Low tail — a pasted-in dark or heavily smoothed/retouched region absorbs
  // far LESS error than its surroundings. Conservatively gated so natural
  // smooth areas (skies, bokeh backdrops, studio walls) don't fire: the tile
  // must be near-flat relative to an already meaningful median, and enough
  // tiles must agree before the rating moves at all. Low-tail alone can
  // never reach "potential" — the high tail or corroborating tests must.
  const flaggedLow = tiles.filter((t) => median > 1.2 && t.mean < median * 0.18);
  const flagged = [...flaggedHigh, ...flaggedLow];
  const flagRatioHigh = tiles.length > 0 ? flaggedHigh.length / tiles.length : 0;
  const flagRatioLow = tiles.length > 0 ? flaggedLow.length / tiles.length : 0;

  const indicator: ErrorLevelResults["indicator"] =
    flagRatioHigh > 0.12 ? "potential" :
    flagRatioHigh > 0.04 ? "unusual" :
    flagRatioLow > 0.08 ? "unusual" : "normal";

  const label =
    indicator === "potential" ? "Inconsistent error levels across regions" :
    indicator === "unusual"
      ? flaggedHigh.length > 0 ? "Inconsistent error levels across regions" : "Some regions absorb unusually little error"
      : "Uniform error levels";

  const topRegions: ElaRegionFinding[] = [
    ...[...tiles].sort((a, b) => b.mean - a.mean).slice(0, 3).filter((t) => median > 0 && t.mean > median * 1.3),
    ...[...tiles].sort((a, b) => a.mean - b.mean).slice(0, 2).filter((t) => median > 1.2 && t.mean < median * 0.25),
  ]
    .map((t) => ({
      locationLabel: locationLabel(t.col, cols, t.row, rows),
      xRange: [t.col * bw, (t.col + 1) * bw] as [number, number],
      yRange: [t.row * bh, (t.row + 1) * bh] as [number, number],
      meanError: Math.round(t.mean * 100) / 100,
      ratioToMedian: Math.round((t.mean / Math.max(median, 0.01)) * 100) / 100,
      indicator: (t.mean > median ? "potential" : "informational") as ElaRegionFinding["indicator"],
    }));

  // ── Normalized error map for visual inspection ──
  // Contrast stretch: median error → ~96/255 so the map is readable on any
  // content, from flat screenshots (median ≈ 0.1) to busy photos (median ≈ 2).
  let errorMap: ErrorLevelResults["errorMap"];
  try {
    const mScale = median > 0 ? 96 / median : 1;
    const map = new Uint8ClampedArray(w * h);
    for (let p = 0; p < w * h; p++) map[p] = Math.min(255, lumaDiff[p] * mScale);
    errorMap = { width: w, height: h, data: map };
  } catch {
    errorMap = undefined;
  }

  return {
    label,
    indicator,
    whyItMatters:
      `The image was re-compressed at a single known quality (${Math.round(ELA_QUALITY * 100)}); pixels of the same history absorb the same amount of new error. ` +
      `Regions with a DIFFERENT error level were likely saved, edited, pasted, or smoothed at another quality — the classic signature of localized manipulation. ` +
      `${flaggedHigh.length} tile(s) absorb unusually much error and ${flaggedLow.length} unusually little (median ${median.toFixed(2)}). ` +
      `Compare the error map with the photo: an area that glows or stays black out of place deserves a second look.`,
    technicalDetails: {
      "Mean error (0-255)": meanError.toFixed(2),
      "Median tile error": median.toFixed(2),
      "Flagged tiles": `${flagged.length} / ${tiles.length}`,
      "Analysis resolution": `${w} × ${h}`,
    },
    limitations:
      "ELA produces false positives on naturally high-contrast textures, strong JPEG artifacts, and images already saved multiple times — and false negatives on uniformly re-saved edits. An indicator, never proof. The error map is for visual comparison; read it together with the other tests.",
    flaggedBlocks: flagged.length,
    totalBlocks: tiles.length,
    topRegions,
    supported: true,
    errorMap,
  };
}

/** Nearest-neighbour downscale for the pre-ELA working copy (worker-safe). */
async function roundTripNearest(
  rgba: Uint8ClampedArray, width: number, height: number, outW: number, outH: number,
): Promise<Uint8ClampedArray | null> {
  try {
    const src = new OffscreenCanvas(width, height);
    const sctx = src.getContext("2d");
    if (!sctx) return null;
    sctx.putImageData(new ImageData(new Uint8ClampedArray(rgba), width, height), 0, 0);
    const out = new OffscreenCanvas(outW, outH);
    const octx = out.getContext("2d");
    if (!octx) return null;
    octx.imageSmoothingEnabled = true;
    octx.drawImage(src, 0, 0, outW, outH);
    return octx.getImageData(0, 0, outW, outH).data;
  } catch {
    return null;
  }
}
