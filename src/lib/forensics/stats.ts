import type { Indicator, RatedResult, StatisticalResults } from "./types";

function shannonEntropy(hist: number[], total: number): number {
  let h = 0;
  for (const count of hist) {
    if (count === 0) continue;
    const p = count / total;
    h -= p * Math.log2(p);
  }
  return h;
}

export function computeStatistics(data: Uint8ClampedArray, width: number, height: number): StatisticalResults {
  const r = new Array(256).fill(0);
  const g = new Array(256).fill(0);
  const b = new Array(256).fill(0);
  const lum = new Array(256).fill(0);
  const total = width * height;

  let noiseAccum = 0;
  let noiseSamples = 0;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const rv = data[i], gv = data[i + 1], bv = data[i + 2];
      r[rv]++; g[gv]++; b[bv]++;
      const l = Math.round(0.299 * rv + 0.587 * gv + 0.114 * bv);
      lum[l]++;

      // High-frequency noise proxy: absolute luminance difference to the right neighbour
      if (x < width - 1) {
        const i2 = i + 4;
        const l2 = Math.round(0.299 * data[i2] + 0.587 * data[i2 + 1] + 0.114 * data[i2 + 2]);
        noiseAccum += Math.abs(l - l2);
        noiseSamples++;
      }
    }
  }

  const entRed = shannonEntropy(r, total);
  const entGreen = shannonEntropy(g, total);
  const entBlue = shannonEntropy(b, total);
  const entLum = shannonEntropy(lum, total);

  const entropyIndicator: Indicator = entLum > 7.5 ? "informational" : entLum > 5.5 ? "normal" : "informational";
  const entropy: RatedResult = {
    label: `${entLum.toFixed(2)} / 8.00 — ${entLum > 7.3 ? "High" : entLum > 5.0 ? "Moderate" : "Low"}`,
    indicator: entropyIndicator,
    whyItMatters: "Entropy measures how unpredictable the pixel values are. It's a general texture/complexity signal, not evidence of anything on its own.",
    technicalDetails: {
      "Luminance entropy": entLum.toFixed(3),
      "Red channel entropy": entRed.toFixed(3),
      "Green channel entropy": entGreen.toFixed(3),
      "Blue channel entropy": entBlue.toFixed(3),
    },
    limitations: "High entropy occurs naturally in photographs, textures, noise, screenshots, and AI-generated images alike. It does NOT by itself indicate steganography or manipulation.",
  };

  const avgNoise = noiseSamples > 0 ? noiseAccum / noiseSamples : 0;
  const noiseLabel = avgNoise > 12 ? "High" : avgNoise > 4 ? "Moderate" : "Low";
  const noise: RatedResult = {
    label: noiseLabel,
    indicator: "informational",
    whyItMatters: "Estimated from local pixel-to-pixel variation. Useful context for interpreting other tests — very low noise (e.g. flat studio backgrounds) makes LSB indicators more reliable; very high noise can make them noisier too.",
    technicalDetails: { "Average adjacent-pixel luminance delta": avgNoise.toFixed(2) },
    limitations: "This is a simple spatial-variation proxy, not a calibrated sensor-noise model. Denoising, resizing, or heavy compression all shift this value.",
  };

  // Compression blockiness heuristic: average discontinuity at 8x8 JPEG block boundaries
  // vs. discontinuity inside blocks. A meaningfully higher boundary delta suggests visible
  // JPEG blocking. This is only a heuristic, not a JPEG-quality estimator.
  let boundaryDelta = 0, boundarySamples = 0, insideDelta = 0, insideSamples = 0;
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = (y * width + x) * 4;
      const iLeft = i - 4;
      const l = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      const lLeft = 0.299 * data[iLeft] + 0.587 * data[iLeft + 1] + 0.114 * data[iLeft + 2];
      const d = Math.abs(l - lLeft);
      if (x % 8 === 0) { boundaryDelta += d; boundarySamples++; }
      else { insideDelta += d; insideSamples++; }
    }
  }
  const avgBoundary = boundarySamples ? boundaryDelta / boundarySamples : 0;
  const avgInside = insideSamples ? insideDelta / insideSamples : 0;
  const blockRatio = avgInside > 0 ? avgBoundary / avgInside : 1;
  const compressionIndicator: Indicator = blockRatio > 1.6 ? "informational" : "normal";
  const compression: RatedResult = {
    label: blockRatio > 1.6 ? "8×8 blocking detected" : "No notable blocking detected",
    indicator: compressionIndicator,
    whyItMatters: "Visible 8×8 block boundaries are a normal side effect of JPEG compression, and their strength gives a rough sense of how heavily an image has been compressed or re-compressed.",
    technicalDetails: {
      "Boundary/inside luminance delta ratio": blockRatio.toFixed(2),
    },
    limitations: "This is a heuristic on visible 8×8 discontinuities, not a real DCT/quantization-table analysis, and says nothing about whether an image was edited.",
  };

  const uniqueValues = r.filter((c) => c > 0).length + g.filter((c) => c > 0).length + b.filter((c) => c > 0).length;
  const pixelDistribution: RatedResult = {
    label: uniqueValues < 60 ? "Unusual (very limited palette)" : "Normal",
    indicator: uniqueValues < 60 ? "informational" : "normal",
    whyItMatters: "A very narrow set of distinct pixel values across all channels is typical of graphics, screenshots, or flat illustrations rather than camera photos.",
    technicalDetails: { "Distinct values used (R+G+B)": uniqueValues },
    limitations: "This describes image type/origin, not authenticity or manipulation.",
  };

  return {
    entropy,
    noise,
    compression,
    pixelDistribution,
    histogram: { r, g, b, luminance: lum },
  };
}
