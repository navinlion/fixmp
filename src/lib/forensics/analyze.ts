import { averageHash, differenceHash, md5Hex, sha256Hex } from "./hash";
import { extractMetadata } from "./exif";
import { computeStatistics } from "./stats";
import { analyzeSteganography, attemptLsbExtraction } from "./steganalysis";
import { analyzeFileStructure } from "./fileStructure";
import type { ForensicsResult } from "./types";

export interface AnalyzeInput {
  fileName: string;
  fileType: string;
  fileBuffer: ArrayBuffer; // original file bytes, for hashing/metadata/structure
  rgba: Uint8ClampedArray; // decoded pixels, for stats/steganalysis
  width: number;
  height: number;
  scanLevel: "quick" | "standard";
  attemptExtraction: boolean;
}

export type ProgressCallback = (step: string, pct: number) => void;

// Small grayscale helper for perceptual hashes — resamples via an offscreen canvas
// when running on the main thread; falls back to a nearest-neighbour manual resample
// inside a Worker, where OffscreenCanvas may not always be available.
function grayscaleResample(rgba: Uint8ClampedArray, width: number, height: number, outW: number, outH: number): Uint8ClampedArray {
  const out = new Uint8ClampedArray(outW * outH);
  for (let oy = 0; oy < outH; oy++) {
    for (let ox = 0; ox < outW; ox++) {
      const sx = Math.floor((ox / outW) * width);
      const sy = Math.floor((oy / outH) * height);
      const i = (sy * width + sx) * 4;
      out[oy * outW + ox] = Math.round(0.299 * rgba[i] + 0.587 * rgba[i + 1] + 0.114 * rgba[i + 2]);
    }
  }
  return out;
}

export async function runLocalForensics(input: AnalyzeInput, onProgress?: ProgressCallback): Promise<ForensicsResult> {
  const bytes = new Uint8Array(input.fileBuffer);

  onProgress?.("File structure", 5);
  const fileStructure = analyzeFileStructure(bytes, { name: input.fileName, type: input.fileType, size: bytes.length });

  onProgress?.("Metadata", 20);
  const metadata = extractMetadata(bytes, input.fileType, input.width, input.height);

  onProgress?.("Hashing", 35);
  const [sha256, md5] = await Promise.all([sha256Hex(input.fileBuffer), Promise.resolve(md5Hex(input.fileBuffer))]);
  const gray8 = grayscaleResample(input.rgba, input.width, input.height, 8, 8);
  const gray9 = grayscaleResample(input.rgba, input.width, input.height, 9, 8);
  const hashes = {
    sha256,
    md5,
    averageHash: averageHash(gray8),
    differenceHash: differenceHash(gray9),
  };

  let statistics: ForensicsResult["statistics"];
  let steganography: ForensicsResult["steganography"];
  let extraction: ForensicsResult["extraction"];

  if (input.scanLevel === "standard") {
    onProgress?.("Statistics", 55);
    statistics = computeStatistics(input.rgba, input.width, input.height);

    onProgress?.("Steganography indicators", 75);
    steganography = analyzeSteganography(input.rgba, input.width, input.height);

    if (input.attemptExtraction) {
      onProgress?.("Attempting extraction", 90);
      // Try the whole-image assumption first (payload starts at pixel 0,0),
      // then fall back to seeding the same simple scheme from each flagged
      // region's top-left pixel — this is still a guess, not general recovery,
      // but it covers the common case of a tool that writes a length-prefixed
      // payload starting at wherever it hid data, not necessarily pixel (0,0).
      let attempt = attemptLsbExtraction(input.rgba);
      const triedLocations = ["whole image (from pixel 0,0)"];
      if (!attempt.success && steganography) {
        for (const region of steganography.regional.topRegions) {
          const startPixelIndex = region.yRange[0] * input.width + region.xRange[0];
          const regionAttempt = attemptLsbExtraction(input.rgba, 5_000_000, startPixelIndex);
          triedLocations.push(`${region.locationLabel} region (x:${region.xRange[0]}, y:${region.yRange[0]})`);
          if (regionAttempt.success) { attempt = regionAttempt; break; }
        }
      }
      extraction = {
        ...attempt,
        message: attempt.success
          ? attempt.message
          : `${attempt.message} Tried: ${triedLocations.join("; ")}. A tool using a different offset, order, or a custom/keyed scheme won't be found by this generic extractor.`,
      };
    }
  }

  onProgress?.("Done", 100);

  const overallSummary = steganography
    ? steganography.overall.label
    : "Quick scan complete — structure, metadata and hashes only. Run a standard scan for statistical and steganography indicators.";

  return {
    fileName: input.fileName,
    fileType: input.fileType,
    fileSizeBytes: bytes.length,
    dimensions: `${input.width} × ${input.height}`,
    scanLevel: input.scanLevel,
    fileStructure,
    hashes,
    metadata,
    statistics,
    steganography,
    extraction,
    overallSummary,
    aiUsed: false,
    analyzedLocally: true,
    timestamp: new Date().toISOString(),
  };
}
