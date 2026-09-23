// ═══════════════════════════════════════════════════════════════
// FixMP Media Forensics — local-first result model (images, v1)
// Everything here is produced entirely in the browser. Nothing in
// this module ever sends data anywhere.
// ═══════════════════════════════════════════════════════════════

export type Indicator = "normal" | "informational" | "unusual" | "potential" | "unsupported" | "error";

export interface RatedResult {
  label: string; // short human status, e.g. "Moderate anomaly"
  indicator: Indicator;
  whyItMatters: string;
  technicalDetails: Record<string, string | number>;
  limitations: string;
}

export interface HashResults {
  sha256: string;
  md5: string;
  averageHash: string; // perceptual (aHash)
  differenceHash: string; // perceptual (dHash)
}

export interface MetadataResults {
  hasMetadata: boolean;
  camera?: string;
  lens?: string;
  dateTime?: string;
  software?: string;
  orientation?: string;
  dimensions: string;
  colorProfile?: string;
  dpi?: string;
  gps?: { lat: number; lon: number } | null;
  raw: Record<string, string | number>;
}

export interface StatisticalResults {
  entropy: RatedResult; // overall + per-channel in technicalDetails
  noise: RatedResult;
  compression: RatedResult;
  pixelDistribution: RatedResult;
  histogram: { r: number[]; g: number[]; b: number[]; luminance: number[] };
}

export interface RegionalFinding {
  locationLabel: string; // human-readable approx position, e.g. "top-left"
  xRange: [number, number];
  yRange: [number, number];
  reducedChiSquare: number;
  indicator: Indicator;
}

export interface SteganographyResults {
  lsb: {
    red: RatedResult;
    green: RatedResult;
    blue: RatedResult;
    combined: RatedResult;
  };
  chiSquare: RatedResult;
  regional: RatedResult & { flaggedBlocks: number; totalBlocks: number; topRegions: RegionalFinding[] };
  overall: RatedResult;
  notImplemented: string[]; // e.g. ["RS analysis", "Pixel-pair analysis"] — only list what's genuinely missing
}

export interface ExtractionAttempt {
  attempted: boolean;
  success: boolean;
  message: string;
  payloadType?: "text" | "binary" | "unknown";
  payloadSizeBytes?: number;
  detectedSignature?: string;
  textPreview?: string;
  downloadBlobUrl?: string;
}

export interface FileStructureResults {
  fileSizeBytes: number;
  declaredMime: string;
  detectedMime: string | null;
  extension: string;
  mimeMismatch: boolean;
  trailingDataBytes: number;
  note: string;
}

export interface ForensicsResult {
  fileName: string;
  fileType: string;
  fileSizeBytes: number;
  dimensions: string;
  scanLevel: "quick" | "standard";
  fileStructure: FileStructureResults;
  hashes: HashResults;
  metadata: MetadataResults;
  statistics?: StatisticalResults; // undefined at "quick" level
  steganography?: SteganographyResults; // undefined at "quick" level
  extraction?: ExtractionAttempt;
  overallSummary: string;
  aiUsed: false; // this pipeline never uses AI — kept explicit for the UI badge
  analyzedLocally: true;
  timestamp: string;
}

export const SCAN_LEVEL_DESCRIPTIONS: Record<"quick" | "standard", string> = {
  quick: "File structure, metadata, cryptographic + perceptual hashes.",
  standard: "Quick scan, plus entropy, channel/noise statistics, compression indicators, and LSB + chi-square steganalysis.",
};
