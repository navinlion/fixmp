"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertTriangle, CheckCircle2, ChevronDown, Eye, EyeOff, Info, Layers,
  Loader2, Lock, RefreshCw, ScanFace, ShieldCheck, Sparkles, X,
} from "lucide-react";
import { detectFacesInImage, fileToImage, type DetectedFace } from "@/lib/face-detector";
import ImageRedactor from "@/components/ImageRedactor";

const MAX_MB = 8;

const SAMPLES: { file: string; label: string }[] = [
  { file: "/samples/one-face.jpg", label: "One face" },
  { file: "/samples/two-faces.jpg", label: "Two faces" },
  { file: "/samples/landscape-no-face.jpg", label: "No face" },
];

async function urlToFile(url: string): Promise<File> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`sample fetch failed (${res.status})`);
  const blob = await res.blob();
  const name = url.split("/").pop() || "sample.jpg";
  return new File([blob], name, { type: blob.type || "image/jpeg" });
}

/**
 * Tracks the "contain"-fitted rect of an <img> inside its box, so overlay
 * boxes can be positioned in screen space. Uses a CALLBACK ref (not
 * useRef) on purpose: a plain ref's identity never changes, so an effect
 * keyed on it only ever runs once — before the <img> exists, when the
 * dropzone is still showing. A callback ref fires every time the node
 * actually mounts/unmounts, which is what lets this recompute when the
 * photo appears.
 */
function useContainRect() {
  const [node, setNode] = useState<HTMLImageElement | null>(null);
  const [rect, setRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null);

  const imgRef = useCallback((el: HTMLImageElement | null) => {
    setNode(el);
  }, []);

  useEffect(() => {
    if (!node) { setRect(null); return; }
    const compute = () => {
      if (!node.naturalWidth || !node.naturalHeight) return;
      const boxW = node.clientWidth, boxH = node.clientHeight;
      if (!boxW || !boxH) return;
      const boxRatio = boxW / boxH;
      const imgRatio = node.naturalWidth / node.naturalHeight;
      let w: number, h: number, x: number, y: number;
      if (imgRatio > boxRatio) { w = boxW; h = boxW / imgRatio; x = 0; y = (boxH - h) / 2; }
      else { h = boxH; w = boxH * imgRatio; y = 0; x = (boxW - w) / 2; }
      setRect({ x, y, w, h });
    };
    if (node.complete) compute();
    node.addEventListener("load", compute);
    const ro = new ResizeObserver(compute);
    ro.observe(node);
    return () => { node.removeEventListener("load", compute); ro.disconnect(); };
  }, [node]);

  return { imgRef, rect };
}

// ── Evidence — one entry per observation, grouped by face for the map below ──

type EvidenceKind = "face" | "eye" | "expression" | "correlation";
interface Box { xMin: number; yMin: number; xMax: number; yMax: number }
interface EvidenceItem {
  key: string;
  kind: EvidenceKind;
  faceIndex: number; // -1 for the page-level correlation note
  label: string;
  badge: "Medium" | "High" | "Info";
  confidencePct?: number;
  description: string;
  actionNote: string;
  region?: Box; // canvas-pixel space, same space as canvasWidth/canvasHeight
}

function buildEvidence(faces: DetectedFace[]): EvidenceItem[] {
  const items: EvidenceItem[] = [];
  const multiple = faces.length > 1;

  faces.forEach((f, i) => {
    const pct = Math.round(f.score * 100);
    items.push({
      key: `face-${i}`, kind: "face", faceIndex: i,
      label: faces.length > 1 ? `Face ${i + 1} of ${faces.length}` : "Face visible",
      badge: multiple ? "High" : "Medium",
      confidencePct: pct,
      description: pct < 55
        ? "A face is partially visible, angled, or small in this image, which may reduce recognition reliability."
        : "A face is clearly visible in this image and can potentially be linked to other photos of the same person.",
      actionNote: "Blur or crop this face unless this person agreed to be posted, or use the safe-copy generator below.",
      region: f.box,
    });
    items.push({
      key: `eye-left-${i}`, kind: "eye", faceIndex: i,
      label: "Eye region (left)", badge: "Info",
      description: "Detailed eye features are visible. FixMP cannot determine whether this is suitable for reliable iris identification.",
      actionNote: "No automatic action required; eye detail alone is low risk.",
      region: f.eyeRegions.left,
    });
    items.push({
      key: `eye-right-${i}`, kind: "eye", faceIndex: i,
      label: "Eye region (right)", badge: "Info",
      description: "Detailed eye features are visible. FixMP cannot determine whether this is suitable for reliable iris identification.",
      actionNote: "No automatic action required; eye detail alone is low risk.",
      region: f.eyeRegions.right,
    });
    items.push({
      key: `expr-${i}`, kind: "expression", faceIndex: i,
      label: "Expression / orientation", badge: "Info",
      description: f.expression.summary,
      actionNote: "Expression and orientation are observable biometric cues; no action required.",
      region: f.box,
    });
  });

  if (faces.length > 0) {
    items.push({
      key: "correlation", kind: "correlation", faceIndex: -1,
      label: "Face correlation", badge: "Info",
      description: "A visible face can act as a linking signal between photos of the same person. FixMP does not search the web or attempt to identify anyone.",
      actionNote: "Be aware that faces can link photos across sources.",
    });
  }

  return items;
}

function toRemovable(faces: DetectedFace[], canvasWidth: number, canvasHeight: number) {
  const multiple = faces.length > 1;
  return faces.map((f, i) => ({
    id: `face-${i}`,
    category: faces.length > 1 ? `Face ${i + 1} of ${faces.length}` : "Face visible",
    description: "A face is visible in this photo.",
    severity: (multiple ? "high" : "medium") as "high" | "medium",
    region: {
      xMin: Math.max(0, Math.round((f.box.xMin / canvasWidth) * 1000)),
      yMin: Math.max(0, Math.round((f.box.yMin / canvasHeight) * 1000)),
      xMax: Math.min(1000, Math.round((f.box.xMax / canvasWidth) * 1000)),
      yMax: Math.min(1000, Math.round((f.box.yMax / canvasHeight) * 1000)),
    },
  }));
}

const badgeStyle: Record<EvidenceItem["badge"], string> = {
  High: "bg-red-100 text-red-700",
  Medium: "bg-amber-100 text-amber-700",
  Info: "bg-stone-200 text-stone-600",
};

const boxColor: Record<EvidenceKind, string> = {
  face: "border-cyan-400",
  eye: "border-sky-300",
  expression: "border-cyan-400",
  correlation: "border-transparent",
};

export default function FaceCheckPanel() {
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [faces, setFaces] = useState<DetectedFace[] | null>(null);
  const [canvasSize, setCanvasSize] = useState<{ w: number; h: number } | null>(null);
  const [detectError, setDetectError] = useState<string | null>(null);
  const [availableSamples, setAvailableSamples] = useState<{ file: string; label: string }[]>([]);
  const [error, setError] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [highlighted, setHighlighted] = useState<string | null>(null);
  const [expandedFace, setExpandedFace] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { imgRef, rect: imgRect } = useContainRect();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const checks = await Promise.all(
        SAMPLES.map(
          (s) =>
            new Promise<typeof s | null>((resolve) => {
              const img = new Image();
              img.onload = () => resolve(s);
              img.onerror = () => resolve(null);
              img.src = s.file;
            })
        )
      );
      if (!cancelled) setAvailableSamples(checks.filter((s): s is typeof SAMPLES[number] => s !== null));
    })();
    return () => { cancelled = true; };
  }, []);

  function reset() {
    setFile(null);
    setPreviewUrl(null);
    setFaces(null);
    setCanvasSize(null);
    setDetectError(null);
    setHighlighted(null);
    setExpandedFace(null);
    setError("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function handleFile(f: File | undefined | null) {
    if (!f) return;
    if (!f.type.startsWith("image/")) { setError("That doesn't look like an image. Please use JPG, PNG or WebP."); return; }
    if (f.size > MAX_MB * 1024 * 1024) { setError(`Image is too large. Please use an image under ${MAX_MB}MB.`); return; }
    setError("");
    setFaces(null);
    setDetectError(null);
    setHighlighted(null);
    setExpandedFace(null);
    setFile(f);
    setPreviewUrl(URL.createObjectURL(f));
  }

  async function loadSample(url: string) {
    setError("");
    setFaces(null);
    setDetectError(null);
    try {
      const f = await urlToFile(url);
      setFile(f);
      setPreviewUrl(URL.createObjectURL(f));
    } catch {
      setError("Couldn't load that sample image. Try uploading your own instead.");
    }
  }

  async function runCheck() {
    if (!file || running) return;
    setRunning(true);
    setError("");
    setFaces(null);
    setDetectError(null);
    try {
      const img = await fileToImage(file);
      const outcome = await detectFacesInImage(img);
      if (!outcome.ok) {
        setDetectError(`Face detection could not complete: ${outcome.error}`);
      } else {
        setFaces(outcome.faces);
        setCanvasSize({ w: outcome.canvasWidth, h: outcome.canvasHeight });
      }
    } catch (e) {
      setDetectError(`Face detection could not complete: ${e instanceof Error ? e.message : "unknown error"}`);
    } finally {
      setRunning(false);
    }
  }

  function toggleHighlight(key: string) {
    setHighlighted((cur) => (cur === key ? null : key));
  }

  const hasResult = faces !== null || detectError !== null;
  const evidence = faces && canvasSize ? buildEvidence(faces) : [];
  const removable = faces && canvasSize ? toRemovable(faces, canvasSize.w, canvasSize.h) : [];
  const showTwoColumn = hasResult && faces !== null && faces.length > 0;
  const correlationItem = evidence.find((e) => e.kind === "correlation") ?? null;
  const faceGroups = faces
    ? faces.map((_, i) => {
        const items = evidence.filter((e) => e.faceIndex === i);
        return { index: i, face: items.find((e) => e.kind === "face")!, subItems: items.filter((e) => e.kind !== "face") };
      })
    : [];

  // ── Narrative summary — aggregate wording for the "Face & biometric privacy" panel ──
  const clearFaceCount = faces ? faces.filter((f) => f.score >= 0.55).length : 0;
  const eyeRegionCount = faces ? faces.length * 2 : 0;
  const expressionSummary = faces && faces.length > 0
    ? faces.map((f) => f.expression.summary).join(" · ")
    : "";

  return (
    <div>
      <div className="mt-6 flex items-start gap-3 rounded-2xl border border-cyan-800/40 bg-cyan-950/40 p-4">
        <ShieldCheck size={18} className="mt-0.5 shrink-0 text-cyan-400" aria-hidden="true" />
        <p className="text-sm leading-relaxed text-cyan-100">
          Detection runs entirely in your browser. FixMP does not upload your photo for face
          recognition, does not identify the person, and does not search the web. AI removal is a
          separate, opt-in step you trigger explicitly.
        </p>
      </div>

      <div className={showTwoColumn ? "lg:grid lg:grid-cols-[minmax(0,480px)_1fr] lg:items-start lg:gap-6" : ""}>
        {/* ── Left column: photo + (once scanned) detector status grid ── */}
        <div className={showTwoColumn ? "lg:sticky lg:top-6" : ""}>
          <div className="mt-6 rounded-3xl border border-stone-800 bg-stone-950 p-4 shadow-2xl sm:p-6">
            {previewUrl && (
              <div className="mb-4 flex items-center justify-between">
                <p className="flex items-center gap-1.5 text-sm font-bold text-white">
                  <ScanFace size={16} className="text-cyan-400" aria-hidden="true" /> Photo check
                </p>
                <button onClick={reset} className="flex items-center gap-1.5 rounded-full border border-stone-700 bg-stone-900 px-3 py-1.5 text-xs font-semibold text-stone-300 transition-colors hover:border-cyan-400 hover:text-cyan-300">
                  <RefreshCw size={12} aria-hidden="true" /> New photo
                </button>
              </div>
            )}

            <div className="flex min-h-[300px] flex-col items-center justify-center rounded-2xl bg-stone-100 p-3 sm:p-4">
              {!previewUrl ? (
                <>
                  <div
                    onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                    onDragLeave={() => setDragOver(false)}
                    onDrop={(e) => { e.preventDefault(); setDragOver(false); handleFile(e.dataTransfer.files?.[0]); }}
                    onClick={() => fileInputRef.current?.click()}
                    role="button" tabIndex={0}
                    onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") fileInputRef.current?.click(); }}
                    aria-label="Upload a photo to check for faces"
                    className={`w-full max-w-lg cursor-pointer rounded-2xl border-2 border-dashed p-8 text-center transition-all ${
                      dragOver ? "border-cyan-500 bg-cyan-50" : "border-stone-300 hover:border-cyan-400 hover:bg-stone-50"
                    }`}
                  >
                    <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full border border-stone-300 bg-white">
                      <ScanFace size={26} className="text-cyan-600" aria-hidden="true" />
                    </span>
                    <p className="mt-4 text-lg font-bold text-stone-900">Drop photo to scan</p>
                    <p className="mt-1 text-sm text-stone-500">or tap to choose — JPG, PNG or WebP, up to {MAX_MB}MB</p>
                    <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => handleFile(e.target.files?.[0])} />
                  </div>

                  {availableSamples.length > 0 && (
                    <div className="mt-6 w-full max-w-lg">
                      <p className="text-center text-[11px] font-semibold uppercase tracking-[0.2em] text-stone-400">or try a sample</p>
                      <div className="mt-3 grid grid-cols-3 gap-3">
                        {availableSamples.map((s) => (
                          <button key={s.file} onClick={() => loadSample(s.file)} className="group overflow-hidden rounded-xl border border-stone-200 bg-white transition-all hover:border-cyan-400">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={s.file} alt={s.label} className="h-20 w-full object-cover opacity-90 transition-opacity group-hover:opacity-100" />
                            <p className="p-1.5 text-center text-[11px] font-semibold text-stone-600 group-hover:text-cyan-700">{s.label}</p>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <>
                  <div className="relative mx-auto w-full max-w-2xl overflow-hidden rounded-xl bg-black">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img ref={imgRef} src={previewUrl} alt="Photo to be checked for faces"
                      className={`max-h-[420px] w-full object-contain transition-all duration-500 ${running ? "opacity-40 grayscale" : "opacity-100"}`} />

                    {!running && imgRect && canvasSize && evidence.map((ev) => {
                      if (!ev.region) return null;
                      const isHighlighted = highlighted === ev.key;
                      const dimmed = highlighted !== null && !isHighlighted;
                      return (
                        <div key={ev.key} aria-hidden="true"
                          className={`pointer-events-none absolute border-2 transition-all ${boxColor[ev.kind]} ${
                            isHighlighted ? "border-[3px] ring-2 ring-white/80" : ""
                          } ${dimmed ? "opacity-20" : "opacity-90"}`}
                          style={{
                            left: `${imgRect.x + (ev.region.xMin / canvasSize.w) * imgRect.w}px`,
                            top: `${imgRect.y + (ev.region.yMin / canvasSize.h) * imgRect.h}px`,
                            width: `${((ev.region.xMax - ev.region.xMin) / canvasSize.w) * imgRect.w}px`,
                            height: `${((ev.region.yMax - ev.region.yMin) / canvasSize.h) * imgRect.h}px`,
                          }}
                        >
                          {ev.kind === "face" && (
                            <span className="absolute -top-6 left-0 whitespace-nowrap rounded bg-black/70 px-1.5 py-0.5 font-mono text-[10px] text-white">
                              {ev.confidencePct}%
                            </span>
                          )}
                        </div>
                      );
                    })}

                    {running && (
                      <div className="absolute inset-0 flex items-center justify-center">
                        <div className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm" />
                        <div className="scanner-ring" />
                        <div className="scanner-bracket bracket-tl" /><div className="scanner-bracket bracket-tr" />
                        <div className="scanner-bracket bracket-bl" /><div className="scanner-bracket bracket-br" />
                        <div className="scan-beam" />
                        <div className="relative z-20 flex flex-col items-center">
                          <div className="tech-text animate-pulse text-lg font-bold text-cyan-400">Local face scan</div>
                          <div className="tech-text mt-1 text-xs text-stone-400">Running detection on your device…</div>
                        </div>
                      </div>
                    )}

                    {!running && (
                      <button onClick={reset} aria-label="Remove photo" className="absolute right-3 top-3 rounded-full border border-stone-600 bg-black/60 p-2 text-white backdrop-blur-md transition-colors hover:border-red-500 hover:bg-red-600">
                        <X size={16} />
                      </button>
                    )}
                  </div>

                  {!running && !hasResult && (
                    <button onClick={runCheck} className="group mt-6 flex items-center gap-3 rounded-xl bg-cyan-500 px-8 py-4 font-bold text-stone-950 shadow-lg shadow-cyan-500/20 transition-all hover:bg-cyan-400 active:scale-95">
                      <ScanFace size={20} className="transition-transform group-hover:rotate-12" aria-hidden="true" />
                      <span className="text-base tracking-widest">Scan for faces</span>
                    </button>
                  )}
                  {running && (
                    <button disabled className="mt-6 flex items-center gap-3 rounded-xl border border-stone-300 bg-stone-200 px-8 py-4 font-bold text-stone-500">
                      <Loader2 size={20} className="animate-spin" aria-hidden="true" />
                      <span className="text-base tracking-widest">Processing…</span>
                    </button>
                  )}

                  <p className="mt-4 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.15em] text-stone-400">
                    <Eye size={12} aria-hidden="true" /> runs entirely in your browser — nothing is uploaded
                  </p>
                </>
              )}
            </div>
          </div>

          {/* Detector status — scoped to what THIS page actually checks (faces + eyes).
              Metadata/QR/OCR live on Share Photo, so they're deliberately not shown here
              as "none detected" — this page never looked for them. */}
          {showTwoColumn && (
            <div className="mt-4 rounded-3xl border border-stone-800 bg-stone-950 p-5">
              <p className="text-sm font-bold text-white">Detector status</p>
              <div className="mt-3 grid grid-cols-2 gap-3">
                <div className="flex items-center justify-between rounded-xl border border-stone-800 bg-stone-900 px-3.5 py-2.5">
                  <span className="flex items-center gap-2 text-sm text-stone-200"><CheckCircle2 size={15} className="text-emerald-400" aria-hidden="true" /> Faces</span>
                  <span className="font-mono text-sm font-bold text-white">{faces!.length}</span>
                </div>
                <div className="flex items-center justify-between rounded-xl border border-stone-800 bg-stone-900 px-3.5 py-2.5">
                  <span className="flex items-center gap-2 text-sm text-stone-200"><CheckCircle2 size={15} className="text-emerald-400" aria-hidden="true" /> Eye regions</span>
                  <span className="font-mono text-sm font-bold text-white">{eyeRegionCount}</span>
                </div>
              </div>
              <p className="mt-3 text-[11px] leading-relaxed text-stone-500">
                Metadata, QR codes, and text aren&apos;t checked on this page — run{" "}
                <a href="/check/photo" className="text-cyan-400 underline hover:text-cyan-300">Share Photo</a> for those.
              </p>
            </div>
          )}
        </div>

        {/* ── Right column: narrative "Face & biometric privacy" summary ── */}
        <div className={showTwoColumn ? "lg:mt-6" : ""}>
          {error && <div role="alert" className="mt-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}

          {hasResult && !showTwoColumn && (
            <div className="mt-8">
              {detectError ? (
                <div className="flex items-start gap-3 rounded-2xl border border-amber-300 bg-amber-50 p-5">
                  <AlertTriangle size={18} className="mt-0.5 shrink-0 text-amber-600" aria-hidden="true" />
                  <div>
                    <p className="font-bold text-stone-900">Face detection could not complete</p>
                    <p className="mt-1 text-sm text-stone-600">{detectError}</p>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
                  <ShieldCheck size={18} className="shrink-0 text-emerald-600" aria-hidden="true" />
                  <p className="text-stone-800"><strong>No faces detected.</strong> The scan completed successfully and found nothing.</p>
                </div>
              )}
            </div>
          )}

          {showTwoColumn && faces && (
            <div className="mt-6 rounded-3xl border border-cyan-800/40 bg-cyan-950/10 p-6 lg:mt-0">
              <p className="flex items-center gap-2 text-base font-bold text-white">
                <ScanFace size={18} className="text-cyan-400" aria-hidden="true" /> Face &amp; biometric privacy
              </p>
              <p className="mt-1 text-sm text-cyan-200/70">
                {faces.length} face{faces.length === 1 ? "" : "s"} detected · {clearFaceCount === faces.length ? "clearly visible" : "mixed clarity"}
              </p>

              <div className="mt-5 space-y-5">
                <div className="flex gap-3">
                  <ScanFace size={16} className="mt-0.5 shrink-0 text-cyan-400" aria-hidden="true" />
                  <div>
                    <p className="text-sm font-bold text-white">Face detected</p>
                    <p className="mt-0.5 text-sm leading-relaxed text-stone-300">
                      {faces.length} clearly visible human face{faces.length === 1 ? " is" : "s are"} present in this image.
                    </p>
                  </div>
                </div>

                <div className="flex gap-3">
                  <AlertTriangle size={16} className="mt-0.5 shrink-0 text-amber-400" aria-hidden="true" />
                  <div>
                    <p className="text-sm font-bold text-white">Potential exposure</p>
                    <p className="mt-0.5 text-sm leading-relaxed text-stone-300">
                      Facial characteristics can potentially be used to associate this photograph with other photographs of the same person.
                    </p>
                  </div>
                </div>

                <div className="flex gap-3">
                  <Eye size={16} className="mt-0.5 shrink-0 text-cyan-400" aria-hidden="true" />
                  <div>
                    <p className="text-sm font-bold text-white">Eye detail</p>
                    <p className="mt-0.5 text-sm leading-relaxed text-stone-300">
                      Detailed eye features are visible in {eyeRegionCount} region{eyeRegionCount === 1 ? "" : "s"}. FixMP does not
                      determine whether this image is suitable for reliable iris identification.
                    </p>
                  </div>
                </div>

                <div className="flex gap-3">
                  <ScanFace size={16} className="mt-0.5 shrink-0 text-cyan-400" aria-hidden="true" />
                  <div>
                    <p className="text-sm font-bold text-white">Observable expression / orientation</p>
                    <p className="mt-0.5 text-sm leading-relaxed text-stone-300">{expressionSummary}</p>
                  </div>
                </div>

                <div className="flex gap-3">
                  <Layers size={16} className="mt-0.5 shrink-0 text-rose-400" aria-hidden="true" />
                  <div>
                    <p className="text-sm font-bold text-white">Combined exposure</p>
                    <p className="mt-0.5 text-sm leading-relaxed text-stone-300">
                      A visible face can potentially act as a linking signal between photographs of the same person. Other
                      publicly available photographs may contain additional information such as names, workplaces, locations,
                      or social connections. FixMP does not search the web or attempt to identify anyone.
                    </p>
                  </div>
                </div>
              </div>

              <div className="mt-5 space-y-3 border-t border-cyan-900/40 pt-5">
                <div className="flex gap-3">
                  <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-emerald-400" aria-hidden="true" />
                  <div>
                    <p className="text-sm font-bold text-white">What FixMP did</p>
                    <p className="mt-0.5 text-sm leading-relaxed text-stone-300">
                      The analysis was performed locally on your device (face landmarks, eye regions, expression heuristics).
                    </p>
                  </div>
                </div>
                <div className="flex gap-3">
                  <EyeOff size={16} className="mt-0.5 shrink-0 text-stone-500" aria-hidden="true" />
                  <div>
                    <p className="text-sm font-bold text-white">What FixMP did not do</p>
                    <p className="mt-0.5 text-sm leading-relaxed text-stone-300">
                      FixMP did not identify the person, search for their identity, perform a reverse-image lookup, or upload
                      the image for face recognition.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Evidence map — full width, below both columns. This is what actually
          drives the clickable per-region highlights on the photo above. ── */}
      {showTwoColumn && (
        <div className="mt-6 space-y-5">
          <div className="rounded-2xl border border-stone-200 bg-white p-5">
            <div className="flex items-center justify-between">
              <p className="flex items-center gap-1.5 text-sm font-bold text-stone-900">
                <Info size={15} className="text-stone-400" /> Evidence map
              </p>
              <span className="text-xs text-stone-400">{faceGroups.length} face{faceGroups.length === 1 ? "" : "s"} · all checks run locally</span>
            </div>
            <p className="mt-1 text-xs text-stone-500">Tap &quot;View region&quot; to highlight an area on the photo above, or &quot;Detail&quot; for eye/expression data on that face.</p>

            <ul className="mt-4 space-y-2.5">
              {faceGroups.map((g) => (
                <li key={`face-group-${g.index}`} className="overflow-hidden rounded-xl border border-stone-100 bg-stone-50">
                  <div className="flex flex-wrap items-center justify-between gap-2 p-3.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-stone-900">{g.face.label}</span>
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${badgeStyle[g.face.badge]}`}>{g.face.badge}</span>
                      {g.face.confidencePct !== undefined && (
                        <span className="text-[11px] text-stone-500">conf {g.face.confidencePct}%</span>
                      )}
                    </div>
                    <div className="flex items-center gap-4">
                      <button onClick={() => toggleHighlight(g.face.key)}
                        className="text-xs font-semibold text-cyan-700 underline decoration-cyan-300 underline-offset-2 hover:text-cyan-800">
                        {highlighted === g.face.key ? "Hide highlight" : "View region"}
                      </button>
                      <button onClick={() => setExpandedFace(expandedFace === g.index ? null : g.index)}
                        className="flex items-center gap-1 text-xs font-semibold text-stone-500 hover:text-stone-700">
                        Detail <ChevronDown size={13} className={`transition-transform ${expandedFace === g.index ? "rotate-180" : ""}`} />
                      </button>
                    </div>
                  </div>
                  <p className="-mt-1 px-3.5 pb-3 text-sm text-stone-600">{g.face.description}</p>

                  {expandedFace === g.index && (
                    <div className="space-y-2.5 border-t border-stone-200 bg-white p-3.5">
                      {g.subItems.map((si) => (
                        <div key={si.key} className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-sm font-medium text-stone-800">{si.label}</p>
                            <p className="mt-0.5 text-xs text-stone-500">{si.description}</p>
                          </div>
                          <button onClick={() => toggleHighlight(si.key)}
                            className="shrink-0 text-xs font-semibold text-cyan-700 underline decoration-cyan-300 underline-offset-2 hover:text-cyan-800">
                            {highlighted === si.key ? "Hide" : "View"}
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </li>
              ))}
            </ul>

            {correlationItem && (
              <div className="mt-3 rounded-xl border border-stone-100 bg-stone-50 p-3.5">
                <span className="rounded-full bg-stone-200 px-2 py-0.5 text-[11px] font-semibold text-stone-600">Info</span>
                <p className="mt-1.5 text-sm text-stone-600">{correlationItem.description}</p>
              </div>
            )}
          </div>

          {removable.length > 0 && file && (
            <ImageRedactor originalFile={file} removable={removable} notRemovable={[]} />
          )}

          <p className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.15em] text-stone-400">
            <Sparkles size={12} /> This check only looks at faces. For text, QR codes, and metadata
            in the same photo, use <a href="/check/photo" className="underline hover:text-stone-600">Share Photo</a>.
          </p>
        </div>
      )}

      <p className="mt-4 flex items-center justify-center gap-1.5 text-center font-mono text-[10px] uppercase tracking-[0.15em] text-stone-400">
        <Lock size={12} /> No identification. No matching. No demographics — detection, region, and observable expression only.
      </p>
    </div>
  );
}