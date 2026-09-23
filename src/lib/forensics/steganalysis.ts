import type { ExtractionAttempt, Indicator, RatedResult, RegionalFinding, SteganographyResults } from "./types";

/**
 * Reduced chi-square statistic over LSB "pairs of values" (POV) — the classic
 * Westfeld/Pfitzmann LSB steganalysis idea: sequential LSB embedding tends to
 * equalize the counts of value-pairs (2i, 2i+1). A LOW reduced chi-square
 * (pairs close to equal) is the signal to watch; a HIGH one is typical of an
 * untouched natural image.
 *
 * This returns a reduced statistic (chi-square / degrees of freedom), NOT a
 * calibrated p-value — we deliberately don't claim more precision than a
 * lightweight browser-side implementation can back up.
 */
function reducedChiSquare(channelHist: number[]): number {
  let chiSq = 0;
  let df = 0;
  for (let i = 0; i < 128; i++) {
    const n2i = channelHist[2 * i];
    const n2i1 = channelHist[2 * i + 1];
    const expected = (n2i + n2i1) / 2;
    if (expected < 4) continue; // too sparse to be informative
    chiSq += ((n2i - expected) ** 2) / expected;
    df++;
  }
  return df > 0 ? chiSq / df : NaN;
}

function bandFromReducedChiSq(reduced: number): { label: string; indicator: Indicator } {
  if (Number.isNaN(reduced)) return { label: "Not enough data", indicator: "unsupported" };
  if (reduced < 0.3) return { label: "Elevated", indicator: "potential" };
  if (reduced < 1.2) return { label: "Moderate", indicator: "unusual" };
  return { label: "Low", indicator: "normal" };
}

function channelHistogram(data: Uint8ClampedArray, channelOffset: number): number[] {
  const hist = new Array(256).fill(0);
  for (let i = channelOffset; i < data.length; i += 4) hist[data[i]]++;
  return hist;
}

function oneBitsRatio(data: Uint8ClampedArray, channelOffset: number): number {
  let ones = 0, n = 0;
  for (let i = channelOffset; i < data.length; i += 4) { ones += data[i] & 1; n++; }
  return n > 0 ? ones / n : 0;
}

function channelResult(name: string, data: Uint8ClampedArray, offset: number): RatedResult {
  const hist = channelHistogram(data, offset);
  const reduced = reducedChiSquare(hist);
  const band = bandFromReducedChiSq(reduced);
  const ratio = oneBitsRatio(data, offset);
  return {
    label: band.label === "Elevated" ? "Unusual" : band.label === "Moderate" ? "Moderate anomaly" : "Normal",
    indicator: band.indicator,
    whyItMatters: `${name} channel LSB statistics — sequential LSB embedding tends to flatten value-pair frequencies toward equal, which this test is sensitive to.`,
    technicalDetails: {
      "Reduced chi-square (pairs-of-values)": Number.isNaN(reduced) ? "n/a" : reduced.toFixed(3),
      "LSB = 1 ratio": (ratio * 100).toFixed(1) + "%",
    },
    limitations: "Natural images, prior edits, resizing, and compression can all produce similar statistics. This is a mathematical indicator, not proof of hidden data, and not AI-based detection.",
  };
}

// ── Regional (blockwise) analysis ──────────────────────────────────────────
// Whole-image chi-square dilutes a small hidden patch into statistical noise:
// a 100x100px payload in a 2000x2000px photo barely moves the global stats.
// Splitting the image into a grid and running the same test per-tile lets a
// localized anomaly show up as one bad tile instead of disappearing into the
// average. This is what actually catches "hidden in a few pixel areas."

function locationLabel(col: number, cols: number, row: number, rows: number): string {
  const h = col < cols / 3 ? "left" : col < (2 * cols) / 3 ? "center" : "right";
  const v = row < rows / 3 ? "top" : row < (2 * rows) / 3 ? "middle" : "bottom";
  return v === "middle" && h === "center" ? "center" : `${v}-${h}`;
}

function blockChiSquare(data: Uint8ClampedArray, width: number, x0: number, y0: number, bw: number, bh: number): number {
  const hist = new Array(256).fill(0);
  for (let y = y0; y < y0 + bh; y++) {
    for (let x = x0; x < x0 + bw; x++) {
      const i = (y * width + x) * 4;
      hist[data[i]]++; hist[data[i + 1]]++; hist[data[i + 2]]++;
    }
  }
  return reducedChiSquare(hist);
}

function regionalAnalysis(data: Uint8ClampedArray, width: number, height: number): SteganographyResults["regional"] {
  // Target roughly a 6x6-ish grid, but keep each block big enough (>= 24px)
  // to be statistically meaningful — tiny blocks produce unreliable chi-square.
  const targetBlock = Math.max(24, Math.round(Math.min(width, height) / 6));
  const cols = Math.max(1, Math.floor(width / targetBlock));
  const rows = Math.max(1, Math.floor(height / targetBlock));
  const bw = Math.floor(width / cols);
  const bh = Math.floor(height / rows);

  const findings: RegionalFinding[] = [];
  const rank: Record<Indicator, number> = { normal: 0, informational: 1, unusual: 2, potential: 3, unsupported: -1, error: -1 };

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const x0 = col * bw, y0 = row * bh;
      const reduced = blockChiSquare(data, width, x0, y0, bw, bh);
      const band = bandFromReducedChiSq(reduced);
      findings.push({
        locationLabel: locationLabel(col, cols, row, rows),
        xRange: [x0, x0 + bw],
        yRange: [y0, y0 + bh],
        reducedChiSquare: reduced,
        indicator: band.indicator,
      });
    }
  }

  findings.sort((a, b) => rank[b.indicator] - rank[a.indicator] || a.reducedChiSquare - b.reducedChiSquare);
  const flagged = findings.filter((f) => f.indicator === "potential" || f.indicator === "unusual");
  const worst = findings[0];
  const topRegions = findings.slice(0, 5).filter((f) => f.indicator !== "normal");

  const indicator = worst?.indicator ?? "unsupported";
  return {
    label:
      indicator === "potential" ? "Localized anomaly detected" :
      indicator === "unusual" ? "Slight localized anomaly" :
      "No localized anomaly detected",
    indicator,
    whyItMatters: `Image was checked in a ${cols}×${rows} grid of tiles so that data hidden in only part of the image isn't averaged away by the rest. ${flagged.length} of ${findings.length} tiles showed an anomaly.`,
    technicalDetails: Object.fromEntries(
      topRegions.map((f, i) => [`#${i + 1} ${f.locationLabel} (x:${f.xRange[0]}-${f.xRange[1]}, y:${f.yRange[0]}-${f.yRange[1]})`, f.reducedChiSquare.toFixed(3)])
    ),
    limitations: "Smaller tiles are noisier estimates than a whole-image test, so this trades some false-positive risk for the ability to catch small, localized embedding. Still an indicator, not proof.",
    flaggedBlocks: flagged.length,
    totalBlocks: findings.length,
    topRegions,
  };
}

export function analyzeSteganography(data: Uint8ClampedArray, width: number, height: number): SteganographyResults {
  const red = channelResult("Red", data, 0);
  const green = channelResult("Green", data, 1);
  const blue = channelResult("Blue", data, 2);

  const rank: Record<Indicator, number> = { normal: 0, informational: 1, unusual: 2, potential: 3, unsupported: -1, error: -1 };
  const worst = [red, green, blue].reduce((w, c) => (rank[c.indicator] > rank[w.indicator] ? c : w));

  const combined: RatedResult = {
    label: worst.indicator === "potential" ? "Moderate anomaly" : worst.indicator === "unusual" ? "Slight anomaly" : "Normal",
    indicator: worst.indicator,
    whyItMatters: "Combines the three channel tests — a real embedding tool usually touches all channels it uses, so the worst channel result drives this summary.",
    technicalDetails: {
      "Red": red.label, "Green": green.label, "Blue": blue.label,
    },
    limitations: red.limitations,
  };

  // Whole-image chi-square (over luminance-independent combined RGB samples)
  const allHist = new Array(256).fill(0);
  for (let i = 0; i < data.length; i += 4) { allHist[data[i]]++; allHist[data[i + 1]]++; allHist[data[i + 2]]++; }
  const reducedAll = reducedChiSquare(allHist);
  const bandAll = bandFromReducedChiSq(reducedAll);
  const chiSquare: RatedResult = {
    label: bandAll.label,
    indicator: bandAll.indicator,
    whyItMatters: "A single combined chi-square reading across all three colour channels.",
    technicalDetails: { "Reduced chi-square": Number.isNaN(reducedAll) ? "n/a" : reducedAll.toFixed(3) },
    limitations: "Same caveats as the per-channel tests — an indicator, not proof.",
  };

  const regional = regionalAnalysis(data, width, height);

  const overallIndicator = [combined.indicator, chiSquare.indicator, regional.indicator].reduce((worst, i) => (rank[i] > rank[worst] ? i : worst));
  const overall: RatedResult = {
    label:
      overallIndicator === "potential"
        ? "Multiple independent tests detected statistical characteristics that can occur with steganographic embedding. Further investigation may be warranted."
        : overallIndicator === "unusual"
        ? "One or more statistical characteristics were unusual. This may have benign explanations and does not confirm hidden data."
        : "No significant indicators were detected by the selected local tests.",
    indicator: overallIndicator,
    whyItMatters: "Rule-based summary of the whole-image LSB/chi-square tests AND the regional (blockwise) test above — every conclusion here is traceable to a specific measurement, not an averaged score.",
    technicalDetails: {},
    limitations: "Statistical evidence of possible embedding does not guarantee that a recoverable message exists. Detection and extraction are different questions.",
  };

  return {
    lsb: { red, green, blue, combined },
    chiSquare,
    regional,
    overall,
    notImplemented: ["RS analysis", "Pixel-pair analysis", "Audio/video steganalysis"],
  };
}

// ── Simple sequential-LSB extraction (RGB, raster order) ──────────────────
// Scheme: first 32 bits across R,G,B LSBs (in that order) = big-endian payload
// length in bytes; followed by that many bytes, 8 bits per byte, taken 1 bit
// per colour channel in raster order. This matches the most common "simple"
// LSB tools. Anything else (custom/keyed schemes) will not be recoverable —
// that's expected and is stated in the UI.

const SIGNATURES: [string, number[]][] = [
  ["PNG", [0x89, 0x50, 0x4e, 0x47]],
  ["JPEG", [0xff, 0xd8, 0xff]],
  ["PDF", [0x25, 0x50, 0x44, 0x46]],
  ["ZIP", [0x50, 0x4b, 0x03, 0x04]],
  ["GZIP", [0x1f, 0x8b]],
];

function detectSignature(bytes: Uint8Array): string | undefined {
  for (const [name, sig] of SIGNATURES) {
    if (sig.every((b, i) => bytes[i] === b)) return name;
  }
  let printable = 0;
  const sample = bytes.subarray(0, Math.min(bytes.length, 512));
  for (const b of sample) if (b === 9 || b === 10 || b === 13 || (b >= 32 && b < 127)) printable++;
  if (sample.length > 0 && printable / sample.length > 0.9) {
    try {
      JSON.parse(new TextDecoder().decode(bytes));
      return "JSON";
    } catch {
      return "TXT";
    }
  }
  return undefined;
}

export function attemptLsbExtraction(data: Uint8ClampedArray, maxBytes = 5_000_000, startPixelIndex = 0): ExtractionAttempt {
  const startByteIndex = startPixelIndex * 4;
  const remainingPixels = Math.max(0, (data.length - startByteIndex) / 4);
  const capacityBits = Math.floor(remainingPixels * 3);
  const capacityBytes = Math.floor(capacityBits / 8);

  const bits: number[] = [];
  const bitLimit = Math.min(capacityBits, (maxBytes + 4) * 8);
  let bitCount = 0;
  outer: for (let i = startByteIndex; i < data.length; i += 4) {
    for (let c = 0; c < 3; c++) {
      bits.push(data[i + c] & 1);
      bitCount++;
      if (bitCount >= bitLimit) break outer;
    }
  }

  function bitsToByte(offsetBits: number): number {
    let byte = 0;
    for (let b = 0; b < 8; b++) byte = (byte << 1) | (bits[offsetBits + b] ?? 0);
    return byte;
  }

  if (bits.length < 32) {
    return { attempted: true, success: false, message: "Image too small to contain a length-prefixed payload under this scheme." };
  }

  let lengthBytes = 0;
  for (let b = 0; b < 4; b++) lengthBytes = (lengthBytes << 8) | bitsToByte(b * 8);
  const declaredLength = lengthBytes >>> 0;

  if (declaredLength === 0 || declaredLength > capacityBytes - 4 || declaredLength > maxBytes) {
    return {
      attempted: true,
      success: false,
      message: "No valid payload structure found for the simple sequential-LSB scheme. This does not rule out other, unsupported schemes.",
    };
  }

  const payload = new Uint8Array(declaredLength);
  for (let i = 0; i < declaredLength; i++) payload[i] = bitsToByte(32 + i * 8);

  const signature = detectSignature(payload);
  const isText = signature === "TXT" || signature === "JSON";

  let textPreview: string | undefined;
  if (isText) textPreview = new TextDecoder().decode(payload).slice(0, 4000);

  let downloadBlobUrl: string | undefined;
  if (typeof URL !== "undefined" && typeof Blob !== "undefined") {
    const blob = new Blob([payload], { type: "application/octet-stream" });
    downloadBlobUrl = URL.createObjectURL(blob);
  }

  return {
    attempted: true,
    success: true,
    message: "A length-prefixed payload was found and decoded using the simple sequential-LSB scheme.",
    payloadType: isText ? "text" : signature ? "binary" : "unknown",
    payloadSizeBytes: declaredLength,
    detectedSignature: signature,
    textPreview,
    downloadBlobUrl,
  };
}
