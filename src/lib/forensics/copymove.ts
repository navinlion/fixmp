import type { CopyMoveFinding, CopyMoveResults } from "./types";

// ═══════════════════════════════════════════════════════════════
// Copy-move forgery detection (a.k.a. clone-stamp / duplicate-region check).
//
// The most common photo forgery is also the simplest: copy part of the image
// and paste it somewhere else in the SAME image — to hide a person, erase an
// object, duplicate a crowd, or cover a logo. The cloned patch carries the
// original's pixels with it, so two statistically IDENTICAL regions exist at
// two different places.
//
// Method (multi-offset block fingerprinting + displacement voting):
//   1. Candidate windows are placed on a downscaled analysis grid (speed),
//      but every window's SIGNATURE is sampled from the ORIGINAL-resolution
//      pixels — so identical original content always produces identical
//      signatures, whatever the analysis scale.
//   2. Each window is registered at 25 sub-offsets (5×5, 0–4px). A paste at
//      an arbitrary offset never lands two grid windows in exact register,
//      but with 25 shifted views of every window, some source/target pair
//      always aligns to the pixel.
//   3. Windows sharing a signature form candidate pairs; each pair votes for
//      the DISPLACEMENT between the two windows (original px, exact).
//      A real clone concentrates hundreds of votes on ONE displacement;
//      coincidental matches scatter.
//   4. A displacement group surviving the count + density guards is reported.
//
// False-positive guards: flat windows skipped, self-overlap excluded,
// density guard (matched windows must densely fill the cluster bounding box —
// repetitive scenes like uniform rows scatter sparsely), area cap.
// Still an indicator, never proof.
// ═══════════════════════════════════════════════════════════════

const MAX_EDGE = 1200;
const BLOCK = 16;              // analysis-grid window (the fingerprint window is ~16px in ORIGINAL px)
const STRIDE = 8;              // analysis-grid step between candidate windows
const VARIANCE_MIN = 40;       // flat windows below this luminance variance are ignored
const ORIG_BLOCK_DIV = 6;      // signature samples per dim (≈6×6 = 36 samples)
const SUB_OFFSETS = 7;         // 7×7 sub-offsets (0–6px) per window — must exceed grid phase error
const MIN_PAIRS_CLUSTER = 14;  // displacement votes needed for "unusual"
const MIN_PAIRS_STRONG = 60;   // displacement votes needed for "potential"
const MIN_FILL = 0.55;         // matched windows must densely fill the cluster bbox (natural horizontal banding sits ~0.3-0.5)
const MAX_AREA_FRACTION = 0.35;
const MAX_CLUSTERS = 4;

function locationLabel(x: number, y: number, w: number, h: number): string {
  const hh = x < w / 3 ? "left" : x < (2 * w) / 3 ? "center" : "right";
  const vv = y < h / 3 ? "top" : y < (2 * h) / 3 ? "middle" : "bottom";
  return vv === "middle" && hh === "center" ? "center" : `${vv}-${hh}`;
}

interface Entry {
  wx: number; // window origin in ORIGINAL pixels (includes sub-offset)
  wy: number;
  bx: number; // base window id (the analysis-grid window this view belongs to)
  by: number;
}

export function detectCopyMove(rgba: Uint8ClampedArray, width: number, height: number): CopyMoveResults {
  const base: Omit<CopyMoveResults, "clusters"> = {
    label: "No duplicated regions detected",
    indicator: "normal",
    whyItMatters: "",
    technicalDetails: {},
    limitations:
      "Rescaled, rotated, or heavily recompressed clones may not match exactly, and naturally repetitive scenes (windows, tiles, crowds) can look cloned. An indicator, never proof.",
    supported: true,
  };

  try {
    const longEdge = Math.max(width, height);
    const scale = Math.min(1, MAX_EDGE / longEdge);
    const w = Math.max(BLOCK * 4, Math.round(width * scale));
    const h = Math.max(BLOCK * 4, Math.round(height * scale));

    // Full-resolution grayscale, computed once — signatures always come from
    // original pixels so identical content is detected exactly.
    const origGray = new Float32Array(width * height);
    for (let p = 0; p < width * height; p++) {
      const i = p * 4;
      origGray[p] = 0.299 * rgba[i] + 0.587 * rgba[i + 1] + 0.114 * rgba[i + 2];
    }

    const origBlock = Math.max(8, Math.round(BLOCK / scale));      // ≈16px window in orig px
    const origStep = Math.max(1, Math.round(origBlock / ORIG_BLOCK_DIV)); // sampling step
    const samplesPerDim = Math.floor((origBlock - 1) / origStep) + 1;

    const buckets = new Map<string, Entry[]>();
    const baseOf = new Map<string, { x: number; y: number }>(); // "bx,by" -> base window id

    const emitWindow = (bx: number, by: number, sx: number, sy: number) => {
      const wx = bx + sx, wy = by + sy;
      if (wx < 0 || wy < 0 || wx + origBlock > width || wy + origBlock > height) return;
      let sum = 0, sumSq = 0;
      const samples: number[] = [];
      for (let j = 0; j < samplesPerDim; j++) {
        for (let i = 0; i < samplesPerDim; i++) {
          const v = origGray[(wy + j * origStep) * width + (wx + i * origStep)];
          samples.push(v);
          sum += v; sumSq += v * v;
        }
      }
      const n = samples.length;
      const mean = sum / n;
      if (sumSq / n - mean * mean < VARIANCE_MIN) return;
      let sig = "";
      for (const v of samples) {
        // 4-level quantization relative to window mean — tolerant to ±1px
        // resample jitter, still discriminates structure.
        sig += v < mean * 0.85 ? "0" : v < mean * 1.05 ? "1" : v < mean * 1.35 ? "2" : "3";
      }
      baseOf.set(`${bx},${by}`, { x: bx, y: by });
      const arr = buckets.get(sig);
      const entry: Entry = { wx, wy, bx, by };
      arr ? arr.push(entry) : buckets.set(sig, [entry]);
    };

    for (let y = 0; y + BLOCK <= h; y += STRIDE) {
      const oy = Math.round(y / scale);
      for (let x = 0; x + BLOCK <= w; x += STRIDE) {
        const ox = Math.round(x / scale);
        // Cheap variance gate on the base window, then register all sub-offsets.
        let sum = 0, sumSq = 0, n = 0;
        for (let j = 0; j < samplesPerDim && oy + j * origStep < height; j++) {
          for (let i = 0; i < samplesPerDim && ox + i * origStep < width; i++) {
            const v = origGray[(oy + j * origStep) * width + (ox + i * origStep)];
            sum += v; sumSq += v * v; n++;
          }
        }
        if (n === 0) continue;
        const mean = sum / n;
        const variance = sumSq / n - mean * mean;
        if (variance < VARIANCE_MIN) continue;
        for (let sy = 0; sy < SUB_OFFSETS; sy++) {
          for (let sx = 0; sx < SUB_OFFSETS; sx++) {
            emitWindow(ox, oy, sx, sy);
          }
        }
      }
    }

    if (buckets.size < 16) {
      return { ...base, whyItMatters: "Image too small or too flat for duplicate-region analysis.", clusters: [] };
    }

    // Displacement voting — one vote per PHYSICAL window pair, at the
    // EXACT original-pixel displacement (pixel-verified, so signature
    // coincidences across sub-offsets never vote).
    interface Cluster { dx: number; dy: number; pairs: { a: Entry; b: Entry }[] }
    const clusters = new Map<string, Cluster>();

    const exactMatch = (a: Entry, b: Entry): boolean => {
      let diff = 0;
      for (let j = 0; j < samplesPerDim; j++) {
        for (let i = 0; i < samplesPerDim; i++) {
          const va = origGray[(a.wy + j * origStep) * width + (a.wx + i * origStep)];
          const vb = origGray[(b.wy + j * origStep) * width + (b.wx + i * origStep)];
          diff += Math.abs(va - vb);
        }
      }
      return diff / (samplesPerDim * samplesPerDim) <= 4.0; // tolerate JPEG-generation noise only
    };

    for (const arr of buckets.values()) {
      if (arr.length < 2 || arr.length > 80) continue; // large buckets = repetitive/flat texture
      // Group this bucket's entries by base window.
      const byBase = new Map<string, Entry[]>();
      for (const e of arr) {
        const k = `${e.bx},${e.by}`;
        const list = byBase.get(k);
        if (list) list.push(e); else byBase.set(k, [e]);
      }
      const bases = [...byBase.values()];
      for (let i = 0; i < bases.length; i++) {
        for (let j = i + 1; j < bases.length; j++) {
          // Find the first sub-offset combo whose contents match EXACTLY.
          let hit: { dx: number; dy: number } | null = null;
          outer: for (const ea of bases[i]) {
            for (const eb of bases[j]) {
              const dx = eb.wx - ea.wx;
              const dy = eb.wy - ea.wy;
              if (Math.hypot(dx, dy) < origBlock) continue;
              if (exactMatch(ea, eb)) { hit = { dx, dy }; break outer; }
            }
          }
          if (!hit) continue;
          const key = `${Math.round(hit.dx / 8)},${Math.round(hit.dy / 8)}`;
          const c = clusters.get(key);
          if (c) c.pairs.push({ a: bases[i][0], b: bases[j][0] });
          else clusters.set(key, { dx: hit.dx, dy: hit.dy, pairs: [{ a: bases[i][0], b: bases[j][0] }] });
        }
      }
    }

    const imageArea = width * height;
    const found: CopyMoveFinding[] = [...clusters.values()]
      .filter((c) => c.pairs.length >= MIN_PAIRS_CLUSTER)
      // Density guard: a real clone's matched windows DENSELY fill a tight
      // bounding box; natural repetitive content scatters sparsely.
      .map((c) => {
        const xs = c.pairs.map((p) => p.a.wx), ys = c.pairs.map((p) => p.a.wy);
        const bw = Math.max(...xs) + origBlock - Math.min(...xs);
        const bh = Math.max(...ys) + origBlock - Math.min(...ys);
        const fill = (c.pairs.length * origBlock * origBlock * 0.2) / Math.max(1, bw * bh);
        return { cluster: c, fill, bboxArea: bw * bh };
      })
      .filter((c) => c.fill >= MIN_FILL && c.bboxArea <= imageArea * MAX_AREA_FRACTION)
      .sort((a, b) => b.cluster.pairs.length - a.cluster.pairs.length)
      .slice(0, MAX_CLUSTERS)
      .map(({ cluster: c }) => {
        const xs = c.pairs.map((p) => p.a.wx), ys = c.pairs.map((p) => p.a.wy);
        const x0 = Math.min(...xs), y0 = Math.min(...ys);
        const x1 = Math.max(...xs) + origBlock, y1 = Math.max(...ys) + origBlock;
        return {
          locationLabel: locationLabel((x0 + x1) / 2, (y0 + y1) / 2, width, height),
          xRange: [x0, x1] as [number, number],
          yRange: [y0, y1] as [number, number],
          displacement: [c.dx, c.dy] as [number, number],
          matchedBlocks: c.pairs.length,
        };
      });

    const strongest = found[0]?.matchedBlocks ?? 0;
    const indicator: CopyMoveResults["indicator"] =
      strongest >= MIN_PAIRS_STRONG ? "potential" :
      strongest >= MIN_PAIRS_CLUSTER ? "unusual" : "normal";

    return {
      ...base,
      label:
        indicator === "potential" ? "Duplicated regions detected" :
        indicator === "unusual" ? "Possible duplicated region" :
        "No duplicated regions detected",
      indicator,
      whyItMatters:
        indicator === "normal"
          ? `Every sufficiently textured window was fingerprinted (at multiple pixel offsets) and cross-compared across the whole image — no significant group of identical windows shares one displacement.`
          : `${found.length} group(s) of pixel-identical windows share one displacement — the signature of copy-paste or clone-stamp editing. Strongest group: ${strongest} matching windows shifted by (${found[0].displacement[0]}, ${found[0].displacement[1]})px.`,
      technicalDetails: Object.fromEntries(
        found.map((f, i) => [
          `#${i + 1} ${f.locationLabel} (${f.xRange[0]}-${f.xRange[1]}, ${f.yRange[0]}-${f.yRange[1]})`,
          `${f.matchedBlocks} windows, offset (${f.displacement[0]}, ${f.displacement[1]})px`,
        ]),
      ),
      clusters: found,
      supported: true,
    };
  } catch {
    return {
      label: "Not available",
      indicator: "unsupported",
      whyItMatters: "Duplicate-region analysis could not run in this browser.",
      technicalDetails: {},
      limitations: "This test was skipped, not 'clean'.",
      clusters: [],
      supported: false,
    };
  }
}
