import type { MetadataResults } from "./types";

// Minimal, dependency-free EXIF (JPEG APP1/TIFF) + PNG text-chunk metadata reader.
// Covers the common tags spec §5 asks for. Exotic/manufacturer-proprietary maker
// notes are intentionally NOT parsed — see the "raw" passthrough for anything else.

const TAGS: Record<number, string> = {
  0x010f: "Make",
  0x0110: "Model",
  0x0131: "Software",
  0x0132: "DateTime",
  0x9003: "DateTimeOriginal",
  0x0112: "Orientation",
  0x011a: "XResolution",
  0x011b: "YResolution",
  0x0128: "ResolutionUnit",
  0xa434: "LensModel",
  0x8825: "GPSIFDPointer",
};

const ORIENTATIONS: Record<number, string> = {
  1: "Normal", 2: "Mirrored", 3: "Rotated 180°", 4: "Mirrored + rotated 180°",
  5: "Mirrored + rotated 90° CW", 6: "Rotated 90° CW", 7: "Mirrored + rotated 90° CCW", 8: "Rotated 90° CCW",
};

function readExifFromJpeg(bytes: Uint8Array): { raw: Record<string, string | number>; gps: { lat: number; lon: number } | null } {
  const raw: Record<string, string | number> = {};
  let gps: { lat: number; lon: number } | null = null;

  // Find APP1 EXIF segment
  let offset = 2; // skip SOI (FFD8)
  let exifStart = -1;
  while (offset < bytes.length - 4) {
    if (bytes[offset] !== 0xff) break;
    const marker = bytes[offset + 1];
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { offset += 2; continue; }
    if (marker === 0xda) break; // start of scan — stop looking
    const segLen = (bytes[offset + 2] << 8) | bytes[offset + 3];
    if (marker === 0xe1) {
      // "Exif\0\0"
      const isExif = bytes[offset + 4] === 0x45 && bytes[offset + 5] === 0x78 && bytes[offset + 6] === 0x69 && bytes[offset + 7] === 0x66;
      if (isExif) { exifStart = offset + 4 + 6; break; }
    }
    offset += 2 + segLen;
  }
  if (exifStart < 0) return { raw, gps };

  const view = new DataView(bytes.buffer, bytes.byteOffset);
  const tiffStart = exifStart;
  const little = view.getUint16(tiffStart) === 0x4949;
  const ifd0Offset = view.getUint32(tiffStart + 4, little);

  function readIFD(ifdOffset: number, onGpsPointer?: (o: number) => void) {
    const count = view.getUint16(tiffStart + ifdOffset, little);
    for (let i = 0; i < count; i++) {
      const entryOffset = tiffStart + ifdOffset + 2 + i * 12;
      const tag = view.getUint16(entryOffset, little);
      const type = view.getUint16(entryOffset + 2, little);
      const numValues = view.getUint32(entryOffset + 4, little);
      const valueOffsetField = entryOffset + 8;

      const typeSizes: Record<number, number> = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 7: 1, 9: 4, 10: 8 };
      const size = (typeSizes[type] ?? 1) * numValues;
      const dataPos = size <= 4 ? valueOffsetField : tiffStart + view.getUint32(valueOffsetField, little);

      if (tag === 0x8825) { onGpsPointer?.(tiffStart + view.getUint32(valueOffsetField, little)); continue; }

      const name = TAGS[tag];
      if (!name) continue;

      if (type === 2) {
        // ASCII
        let str = "";
        for (let b = 0; b < numValues - 1; b++) str += String.fromCharCode(bytes[dataPos + b]);
        raw[name] = str.trim();
      } else if (type === 3) {
        raw[name] = view.getUint16(dataPos, little);
      } else if (type === 4) {
        raw[name] = view.getUint32(dataPos, little);
      } else if (type === 5) {
        const num = view.getUint32(dataPos, little);
        const den = view.getUint32(dataPos + 4, little);
        raw[name] = den !== 0 ? Math.round((num / den) * 100) / 100 : num;
      }
    }
  }

  let gpsIfdOffset = -1;
  readIFD(ifd0Offset, (abs) => { gpsIfdOffset = abs - tiffStart; });

  if (gpsIfdOffset >= 0) {
    const count = view.getUint16(tiffStart + gpsIfdOffset, little);
    let latRef = "N", lonRef = "E", lat: number[] = [], lon: number[] = [];
    for (let i = 0; i < count; i++) {
      const entryOffset = tiffStart + gpsIfdOffset + 2 + i * 12;
      const tag = view.getUint16(entryOffset, little);
      const numValues = view.getUint32(entryOffset + 4, little);
      const valueOffsetField = entryOffset + 8;
      if (tag === 1) latRef = String.fromCharCode(bytes[valueOffsetField]);
      if (tag === 3) lonRef = String.fromCharCode(bytes[valueOffsetField]);
      if (tag === 2 || tag === 4) {
        const dataPos = tiffStart + view.getUint32(valueOffsetField, little);
        const vals: number[] = [];
        for (let r = 0; r < Math.min(numValues, 3); r++) {
          const num = view.getUint32(dataPos + r * 8, little);
          const den = view.getUint32(dataPos + r * 8 + 4, little);
          vals.push(den !== 0 ? num / den : num);
        }
        if (tag === 2) lat = vals; else lon = vals;
      }
    }
    if (lat.length === 3 && lon.length === 3) {
      const dd = (v: number[]) => v[0] + v[1] / 60 + v[2] / 3600;
      let latitude = dd(lat) * (latRef === "S" ? -1 : 1);
      let longitude = dd(lon) * (lonRef === "W" ? -1 : 1);
      gps = { lat: Math.round(latitude * 1e6) / 1e6, lon: Math.round(longitude * 1e6) / 1e6 };
    }
  }

  return { raw, gps };
}

function readPngText(bytes: Uint8Array): Record<string, string | number> {
  const raw: Record<string, string | number> = {};
  let offset = 8; // skip PNG signature
  while (offset < bytes.length - 8) {
    const len = new DataView(bytes.buffer, bytes.byteOffset).getUint32(offset);
    const type = String.fromCharCode(bytes[offset + 4], bytes[offset + 5], bytes[offset + 6], bytes[offset + 7]);
    if (type === "IHDR") {
      const dv = new DataView(bytes.buffer, bytes.byteOffset);
      raw["Width"] = dv.getUint32(offset + 8);
      raw["Height"] = dv.getUint32(offset + 12);
    }
    if (type === "tEXt" || type === "iTXt") {
      let chunk = "";
      for (let i = 0; i < len; i++) chunk += String.fromCharCode(bytes[offset + 8 + i]);
      const nullIdx = chunk.indexOf("\0");
      if (nullIdx > 0) raw[chunk.slice(0, nullIdx)] = chunk.slice(nullIdx + 1).replace(/\0/g, "").slice(0, 200);
    }
    if (type === "IEND") break;
    offset += 12 + len; // length(4) + type(4) + data(len) + crc(4)
  }
  return raw;
}

export function extractMetadata(bytes: Uint8Array, mime: string, width: number, height: number): MetadataResults {
  let raw: Record<string, string | number> = {};
  let gps: { lat: number; lon: number } | null = null;

  if (mime === "image/jpeg") {
    const r = readExifFromJpeg(bytes);
    raw = r.raw;
    gps = r.gps;
  } else if (mime === "image/png") {
    raw = readPngText(bytes);
  }

  const dpi = raw["XResolution"] ? `${raw["XResolution"]} dpi` : undefined;

  return {
    hasMetadata: Object.keys(raw).length > 0,
    camera: raw["Make"] || raw["Model"] ? [raw["Make"], raw["Model"]].filter(Boolean).join(" ") : undefined,
    lens: (raw["LensModel"] as string) || undefined,
    dateTime: (raw["DateTimeOriginal"] as string) || (raw["DateTime"] as string) || undefined,
    software: (raw["Software"] as string) || undefined,
    orientation: raw["Orientation"] ? ORIENTATIONS[raw["Orientation"] as number] ?? String(raw["Orientation"]) : undefined,
    dimensions: `${width} × ${height}`,
    colorProfile: mime === "image/png" && raw["Width"] ? undefined : undefined,
    dpi,
    gps,
    raw,
  };
}
