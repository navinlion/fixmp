"use client";

import { useEffect, useRef, useState } from "react";
import {
  AlertTriangle, Eye, ImageIcon, Loader2, Lock, ScanFace, ShieldCheck, Sparkles, X,
} from "lucide-react";
import { detectFace } from "@/lib/face-detector";
import type { DetectorResult, LocalFinding } from "@/lib/photo-local-engine";
import ImageRedactor from "@/components/ImageRedactor";

const MAX_MB = 8;

/** One entry per sample tile FixMP will try to show. A tile only renders once
 *  its file has loaded successfully — a missing sample is silently skipped,
 *  never a broken image or a faked result. */
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

/** Same letterboxing math as LocalPhotoReport's useContainRect — computes the
 *  real rendered image rect (px, relative to the <img> box) so overlays land
 *  on the actual pixels regardless of aspect-ratio mismatch with the box. */
function useContainRect(imgRef: React.RefObject<HTMLImageElement | null>) {
  const [rect, setRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  useEffect(() => {
    const img = imgRef.current;
    if (!img) return;
    const compute = () => {
      if (!img.naturalWidth || !img.naturalHeight) return;
      const boxW = img.clientWidth, boxH = img.clientHeight;
      if (!boxW || !boxH) return;
      const boxRatio = boxW / boxH;
      const imgRatio = img.naturalWidth / img.naturalHeight;
      let w: number, h: number, x: number, y: number;
      if (imgRatio > boxRatio) { w = boxW; h = boxW / imgRatio; x = 0; y = (boxH - h) / 2; }
      else { h = boxH; w = boxH * imgRatio; y = 0; x = (boxW - w) / 2; }
      setRect({ x, y, w, h });
    };
    if (img.complete) compute();
    img.addEventListener("load", compute);
    const ro = new ResizeObserver(compute);
    ro.observe(img);
    return () => { img.removeEventListener("load", compute); ro.disconnect(); };
  }, [imgRef]);
  return rect;
}

function toRemovable(findings: LocalFinding[]) {
  return findings.filter((f) => f.region).map((f, i) => ({
    id: `face-${i}`, category: f.category, description: f.description, severity: f.severity, region: f.region!,
  }));
}

export default function FaceCheckPanel() {
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<DetectorResult | null>(null);
  const [availableSamples, setAvailableSamples] = useState<{ file: string; label: string }[]>([]);
  const [error, setError] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const imgRect = useContainRect(imgRef);

  // Only offer a sample tile once its image has actually loaded — a 404
  // (e.g. "one-face.jpg" not bundled) just means one fewer tile.
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
    setResult(null);
    setError("");
    if (inputRef.current) inputRef.current.value = "";
  }

  function handleFile(f: File | undefined | null) {
    if (!f) return;
    if (!f.type.startsWith("image/")) {
      setError("That doesn't look like an image. Please use JPG, PNG or WebP.");
      return;
    }
    if (f.size > MAX_MB * 1024 * 1024) {
      setError(`Image is too large. Please use an image under ${MAX_MB}MB.`);
      return;
    }
    setError("");
    setResult(null);
    setFile(f);
    setPreviewUrl(URL.createObjectURL(f));
  }

  async function loadSample(url: string) {
    setError("");
    setResult(null);
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
    setResult(null);
    try {
      const r = await detectFace(file);
      setResult(r);
    } catch {
      setResult({
        detector: "Face", status: "error", findings: [], diagnostics: {},
        error: "Face detection could not complete. Please try again.",
      });
    } finally {
      setRunning(false);
    }
  }

  const findings = result?.findings ?? [];
  const removable = toRemovable(findings);

  return (
    <div>
      {/* Privacy banner — exact wording, always visible regardless of state */}
      <div className="mt-6 flex items-start gap-3 rounded-2xl border border-cyan-800/40 bg-cyan-950/40 p-4">
        <ShieldCheck size={18} className="mt-0.5 shrink-0 text-cyan-400" aria-hidden="true" />
        <p className="text-sm leading-relaxed text-cyan-100">
          Detection runs entirely in your browser. FixMP does not upload your photo for face
          recognition, does not identify the person, and does not search the web. AI removal is a
          separate, opt-in step you trigger explicitly.
        </p>
      </div>

      {/* ===== SCANNER CONSOLE (dark, matches Share Photo / Media Forensics conventions) ===== */}
      <div className="scanner-bg mt-6 flex min-h-[380px] flex-col items-center justify-center rounded-3xl p-6 shadow-2xl sm:p-10">
        {!previewUrl ? (
          <>
            <div
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => { e.preventDefault(); setDragOver(false); handleFile(e.dataTransfer.files?.[0]); }}
              onClick={() => inputRef.current?.click()}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") inputRef.current?.click(); }}
              aria-label="Upload a photo to check for faces"
              className={`w-full max-w-lg cursor-pointer rounded-2xl border-2 border-dashed p-8 text-center transition-all ${
                dragOver ? "border-cyan-400 bg-cyan-400/10" : "border-stone-600 hover:border-cyan-400/70 hover:bg-stone-800/40"
              }`}
            >
              <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full border border-stone-600 bg-stone-800">
                <ScanFace size={26} className="text-cyan-400" aria-hidden="true" />
              </span>
              <p className="tech-text mt-4 text-lg font-bold text-white">Drop photo to scan</p>
              <p className="mt-1 text-sm text-stone-400">or tap to choose — JPG, PNG or WebP, up to {MAX_MB}MB</p>
              <input
                ref={inputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={(e) => handleFile(e.target.files?.[0])}
              />
            </div>

            {availableSamples.length > 0 && (
              <div className="mt-6 w-full max-w-lg">
                <p className="text-center font-mono text-[10px] uppercase tracking-[0.2em] text-stone-500">
                  or try a sample
                </p>
                <div className="mt-3 grid grid-cols-3 gap-3">
                  {availableSamples.map((s) => (
                    <button
                      key={s.file}
                      onClick={() => loadSample(s.file)}
                      className="group overflow-hidden rounded-xl border border-stone-700 bg-stone-800/60 transition-all hover:border-cyan-400"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={s.file} alt={s.label} className="h-20 w-full object-cover opacity-80 transition-opacity group-hover:opacity-100" />
                      <p className="p-1.5 text-center text-[11px] font-semibold text-stone-300 group-hover:text-cyan-300">{s.label}</p>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </>
        ) : (
          <>
            <div className="relative mx-auto w-full max-w-2xl overflow-hidden rounded-xl border border-stone-700 bg-black">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                ref={imgRef}
                src={previewUrl}
                alt="Photo to be checked for faces"
                className={`max-h-[420px] w-full object-contain transition-all duration-500 ${running ? "opacity-40 grayscale" : "opacity-100"}`}
              />

              {/* Region overlays — all detected faces at once */}
              {!running && imgRect && findings.map((f, i) =>
                f.region ? (
                  <div
                    key={i}
                    aria-hidden="true"
                    className={`pointer-events-none absolute border-[3px] ${
                      f.severity === "high" ? "border-red-400 bg-red-400/15" : "border-cyan-400 bg-cyan-400/15"
                    }`}
                    style={{
                      left: `${imgRect.x + (f.region.xMin / 1000) * imgRect.w}px`,
                      top: `${imgRect.y + (f.region.yMin / 1000) * imgRect.h}px`,
                      width: `${((f.region.xMax - f.region.xMin) / 1000) * imgRect.w}px`,
                      height: `${((f.region.yMax - f.region.yMin) / 1000) * imgRect.h}px`,
                    }}
                  >
                    <span className="absolute -top-6 left-0 whitespace-nowrap rounded bg-black/70 px-1.5 py-0.5 font-mono text-[10px] text-white">
                      {f.evidence}
                    </span>
                  </div>
                ) : null
              )}

              {running && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm" />
                  <div className="scanner-ring" />
                  <div className="scanner-bracket bracket-tl" />
                  <div className="scanner-bracket bracket-tr" />
                  <div className="scanner-bracket bracket-bl" />
                  <div className="scanner-bracket bracket-br" />
                  <div className="scan-beam" />
                  <div className="relative z-20 flex flex-col items-center">
                    <div className="tech-text animate-pulse text-lg font-bold text-cyan-400">Local face scan</div>
                    <div className="tech-text mt-1 text-xs text-stone-400">Running detection on your device…</div>
                  </div>
                </div>
              )}

              {!running && (
                <button
                  onClick={reset}
                  aria-label="Remove photo"
                  className="absolute right-3 top-3 rounded-full border border-stone-600 bg-black/60 p-2 text-white backdrop-blur-md transition-colors hover:border-red-500 hover:bg-red-600"
                >
                  <X size={16} />
                </button>
              )}
            </div>

            {!running && !result && (
              <button
                onClick={runCheck}
                className="group mt-6 flex items-center gap-3 rounded-xl bg-cyan-500 px-8 py-4 font-bold text-stone-950 shadow-lg shadow-cyan-500/20 transition-all hover:bg-cyan-400 active:scale-95"
              >
                <ScanFace size={20} className="transition-transform group-hover:rotate-12" aria-hidden="true" />
                <span className="tech-text text-base tracking-widest">Scan for faces</span>
              </button>
            )}

            {running && (
              <button disabled className="mt-6 flex items-center gap-3 rounded-xl border border-stone-700 bg-stone-800 px-8 py-4 font-bold text-stone-400">
                <Loader2 size={20} className="animate-spin" aria-hidden="true" />
                <span className="tech-text text-base tracking-widest">Processing…</span>
              </button>
            )}

            <p className="mt-4 flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.15em] text-stone-500">
              <Eye size={12} aria-hidden="true" /> runs entirely in your browser — nothing is uploaded
            </p>
          </>
        )}
      </div>

      {error && (
        <div role="alert" className="mt-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* ===== RESULTS ===== */}
      {result && (
        <div className="mt-8 space-y-5">
          {result.status === "error" ? (
            <div className="flex items-start gap-3 rounded-2xl border border-amber-300 bg-amber-50 p-5">
              <AlertTriangle size={18} className="mt-0.5 shrink-0 text-amber-600" aria-hidden="true" />
              <div>
                <p className="font-bold text-stone-900">Face detection could not complete</p>
                <p className="mt-1 text-sm text-stone-600">{result.error}</p>
                <p className="mt-1 text-xs text-stone-500">
                  This is never shown as &quot;no faces found&quot; — a failed check is reported as a
                  failure, not a clean result.
                </p>
              </div>
            </div>
          ) : findings.length === 0 ? (
            <div className="flex items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
              <ShieldCheck size={18} className="shrink-0 text-emerald-600" aria-hidden="true" />
              <p className="text-stone-800">
                <strong>No faces detected.</strong> The scan completed successfully and found nothing.
              </p>
            </div>
          ) : (
            <div className={`rounded-2xl border p-5 ${findings.length > 1 ? "border-red-300 bg-red-50" : "border-amber-300 bg-amber-50"}`}>
              <p className="font-bold text-stone-900">
                {findings.length} face{findings.length === 1 ? "" : "s"} detected
              </p>
              <p className="mt-1 text-sm text-stone-700">
                {findings.length > 1
                  ? "Multiple people are in this frame. Make sure everyone here agreed to be posted — or blur the ones who didn't."
                  : "Make sure this person agreed to be posted before you share it."}
              </p>
              <ul className="mt-3 space-y-1.5 text-sm text-stone-700">
                {findings.map((f, i) => (
                  <li key={i} className="flex items-center gap-2">
                    <span aria-hidden="true" className={`h-2 w-2 shrink-0 rounded-full ${f.severity === "high" ? "bg-red-500" : "bg-amber-500"}`} />
                    {f.category} — {f.evidence}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Turn findings into an actual safe-to-share file — reuses the same redactor as Photo Check */}
          {removable.length > 0 && (
            <ImageRedactor originalFile={file} removable={removable} notRemovable={[]} />
          )}

          <p className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.15em] text-stone-400">
            <Sparkles size={12} /> This check only looks at faces. For text, QR codes, and metadata
            in the same photo, use{" "}
            <a href="/check/photo" className="underline hover:text-stone-600">Share Photo</a>.
          </p>
        </div>
      )}

      <p className="mt-4 flex items-center justify-center gap-1.5 text-center font-mono text-[10px] uppercase tracking-[0.15em] text-stone-400">
        <Lock size={12} /> No identification. No matching. No demographics — detection and region only.
      </p>
    </div>
  );
}
