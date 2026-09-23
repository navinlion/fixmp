import type { FileStructureResults } from "./types";

const SIGNATURES: { mime: string; bytes: number[] }[] = [
  { mime: "image/jpeg", bytes: [0xff, 0xd8, 0xff] },
  { mime: "image/png", bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  { mime: "image/gif", bytes: [0x47, 0x49, 0x46, 0x38] },
  { mime: "image/bmp", bytes: [0x42, 0x4d] },
  { mime: "image/webp", bytes: [0x52, 0x49, 0x46, 0x46] }, // RIFF; WEBP checked at offset 8 separately
];

function detectMime(bytes: Uint8Array): string | null {
  for (const sig of SIGNATURES) {
    if (sig.bytes.every((b, i) => bytes[i] === b)) {
      if (sig.mime === "image/webp") {
        const isWebp = bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50;
        if (!isWebp) continue;
      }
      return sig.mime;
    }
  }
  return null;
}

function findTrailingData(bytes: Uint8Array, mime: string | null): number {
  if (mime === "image/jpeg") {
    // Walk markers to find EOI (FFD9); anything after is "trailing"
    let offset = 2;
    while (offset < bytes.length - 1) {
      if (bytes[offset] !== 0xff) { offset++; continue; }
      const marker = bytes[offset + 1];
      if (marker === 0xd9) return Math.max(0, bytes.length - (offset + 2));
      if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) { offset += 2; continue; }
      if (marker === 0xda) {
        // Scan data — no simple length; search backward for EOI from the end instead.
        for (let i = bytes.length - 2; i > offset; i--) {
          if (bytes[i] === 0xff && bytes[i + 1] === 0xd9) return bytes.length - (i + 2);
        }
        return 0;
      }
      const segLen = (bytes[offset + 2] << 8) | bytes[offset + 3];
      offset += 2 + segLen;
    }
    return 0;
  }
  if (mime === "image/png") {
    let offset = 8;
    while (offset < bytes.length - 8) {
      const len = new DataView(bytes.buffer, bytes.byteOffset).getUint32(offset);
      const type = String.fromCharCode(bytes[offset + 4], bytes[offset + 5], bytes[offset + 6], bytes[offset + 7]);
      offset += 12 + len;
      if (type === "IEND") return Math.max(0, bytes.length - offset);
    }
    return 0;
  }
  return 0;
}

export function analyzeFileStructure(bytes: Uint8Array, file: { name: string; type: string; size: number }): FileStructureResults {
  const detectedMime = detectMime(bytes);
  const extension = (file.name.split(".").pop() || "").toLowerCase();
  const declaredMime = file.type || "unknown";

  const extToMime: Record<string, string> = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", gif: "image/gif", bmp: "image/bmp", webp: "image/webp" };
  const expectedFromExt = extToMime[extension];
  const mimeMismatch = !!detectedMime && !!expectedFromExt && detectedMime !== expectedFromExt;

  const trailingDataBytes = findTrailingData(bytes, detectedMime);

  let note = "No structural inconsistency detected.";
  if (mimeMismatch) note = "The file extension and the detected file signature do not match.";
  else if (trailingDataBytes > 256) note = `${trailingDataBytes.toLocaleString()} bytes of unexpected data found appended after the image's normal end marker.`;

  return {
    fileSizeBytes: file.size,
    declaredMime,
    detectedMime,
    extension,
    mimeMismatch,
    trailingDataBytes,
    note,
  };
}
