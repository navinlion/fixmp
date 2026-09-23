"use client";

import { useCallback, useRef, useState } from "react";
import {
  AlertTriangle, ChevronDown, Cpu, Download, FileWarning, Fingerprint,
  HardDriveDownload, ImageIcon, Loader2, Lock, ScanSearch, ShieldCheck, X,
} from "lucide-react";
import type { AnalyzeInput } from "@/lib/forensics/analyze";
import { runLocalForensics } from "@/lib/forensics/analyze";
import type { WorkerRequest, WorkerResponse } from "@/lib/forensics/worker";
import type { ForensicsResult, Indicator, RatedResult } from "@/lib/forensics/types";
import { SCAN_LEVEL_DESCRIPTIONS } from "@/lib/forensics/types";

const MAX_MB = 20;

const indicatorStyles: Record<Indicator, { dot: string; text: string }> = {
  normal: { dot: "bg-emerald-500", text: "text-emerald-700" },
  informational: { dot: "bg-blue-500", text: "text-blue-700" },
  unusual: { dot: "bg-amber-500", text: "text-amber-700" },
  potential: { dot: "bg-red-500", text: "text-red-700" },
  unsupported: { dot: "bg-stone-300", text: "text-stone-500" },
  error: { dot: "bg-red-500", text: "text-red-700" },
};

function IndicatorRow({ title, result }: { title: string; result: RatedResult }) {
  const [open, setOpen] = useState(false);
  const s = indicatorStyles[result.indicator];
  return (
    <div className="rounded-xl border border-stone-200 bg-white p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="flex items-center gap-2 font-bold text-stone-900">
          <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${s.dot}`} aria-hidden="true" />
          {title}
        </p>
        <span className={`font-mono text-xs font-bold uppercase tracking-wide ${s.text}`}>{result.label}</span>
      </div>
      <p className="mt-1.5 text-sm text-stone-600">{result.whyItMatters}</p>
      <button
        onClick={() => setOpen((o) => !o)}
        className="mt-2 flex cursor-pointer items-center gap-1 text-xs font-bold text-stone-500 hover:text-stone-900"
      >
        <ChevronDown size={13} className={`transition-transform ${open ? "rotate-180" : ""}`} />
        {open ? "Hide" : "Show"} technical details
      </button>
      {open && (
        <div className="mt-2 space-y-1 rounded-lg bg-stone-50 p-3 font-mono text-xs text-stone-600">
          {Object.entries(result.technicalDetails).map(([k, v]) => (
            <div key={k} className="flex justify-between gap-4">
              <span className="text-stone-400">{k}</span>
              <span className="text-stone-800">{String(v)}</span>
            </div>
          ))}
          <p className="mt-2 border-t border-stone-200 pt-2 text-stone-500">
            <strong className="text-stone-700">Limitations:</strong> {result.limitations}
          </p>
        </div>
      )}
    </div>
  );
}

export default function MediaForensicsPanel() {
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [scanLevel, setScanLevel] = useState<"quick" | "standard">("standard");
  const [attemptExtraction, setAttemptExtraction] = useState(false);
  const [progress, setProgress] = useState<{ step: string; pct: number } | null>(null);
  const [result, setResult] = useState<ForensicsResult | null>(null);
  const [error, setError] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const workerRef = useRef<Worker | null>(null);

  function reset() {
    setFile(null);
    setPreviewUrl(null);
    setResult(null);
    setProgress(null);
    setError("");
    if (inputRef.current) inputRef.current.value = "";
  }

  const handleFile = useCallback((f: File | undefined | null) => {
    if (!f) return;
    if (!f.type.startsWith("image/")) {
      setError("Media Forensics currently supports images (JPG, PNG, WebP, GIF, BMP). Video and audio are on the roadmap.");
      return;
    }
    if (f.size > MAX_MB * 1024 * 1024) {
      setError(`Image is too large for in-browser analysis. Please use a file under ${MAX_MB}MB.`);
      return;
    }
    setError("");
    setResult(null);
    setFile(f);
    setPreviewUrl(URL.createObjectURL(f));
  }, []);

  async function decodeToImageData(f: File): Promise<{ rgba: Uint8ClampedArray; width: number; height: number }> {
    const url = URL.createObjectURL(f);
    const img = new Image();
    img.src = url;
    await img.decode();
    URL.revokeObjectURL(url);
    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("canvas unavailable");
    ctx.drawImage(img, 0, 0);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    return { rgba: imageData.data, width: canvas.width, height: canvas.height };
  }

  async function runAnalysis() {
    if (!file) return;
    setProgress({ step: "Reading file", pct: 0 });
    setError("");
    setResult(null);

    try {
      const [fileBuffer, decoded] = await Promise.all([file.arrayBuffer(), decodeToImageData(file)]);

      const runOnMainThread = async () => {
        const input: AnalyzeInput = {
          fileName: file.name,
          fileType: file.type,
          fileBuffer,
          rgba: decoded.rgba,
          width: decoded.width,
          height: decoded.height,
          scanLevel,
          attemptExtraction,
        };
        const r = await runLocalForensics(input, (step, pct) => setProgress({ step, pct }));
        setResult(r);
        setProgress(null);
      };

      // Prefer a Web Worker so the UI thread stays responsive; fall back to the
      // main thread transparently if Worker construction fails for any reason
      // (older browser, bundler quirk, etc.) — analysis still completes either way.
      try {
        if (!workerRef.current) {
          workerRef.current = new Worker(new URL("../../lib/forensics/worker.ts", import.meta.url));
        }
        const worker = workerRef.current;

        await new Promise<void>((resolve, reject) => {
          worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
            const msg = e.data;
            if (msg.type === "progress") setProgress({ step: msg.step, pct: msg.pct });
            else if (msg.type === "result") { setResult(msg.result); setProgress(null); resolve(); }
            else if (msg.type === "error") reject(new Error(msg.message));
          };
          worker.onerror = () => reject(new Error("worker failed"));

          const req: WorkerRequest = {
            type: "analyze",
            fileName: file.name,
            fileType: file.type,
            fileBuffer: fileBuffer.slice(0),
             rgbaBuffer: new Uint8ClampedArray(decoded.rgba).buffer as ArrayBuffer,
            width: decoded.width,
            height: decoded.height,
            scanLevel,
            attemptExtraction,
          };
          worker.postMessage(req, [req.fileBuffer, req.rgbaBuffer]);
        });
      } catch {
        await runOnMainThread();
      }
    } catch {
      setError("Couldn't analyze that image locally. Please try a different file.");
      setProgress(null);
    }
  }

  function cancelAnalysis() {
    workerRef.current?.terminate();
    workerRef.current = null;
    setProgress(null);
  }

  function exportReport() {
    if (!result) return;
    const blob = new Blob([JSON.stringify(result, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `fixmp-forensics-${result.fileName.replace(/\.[^.]+$/, "")}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div>
      {!file ? (
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => { e.preventDefault(); setDragOver(false); handleFile(e.dataTransfer.files?.[0]); }}
          onClick={() => inputRef.current?.click()}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") inputRef.current?.click(); }}
          aria-label="Upload an image for local forensic analysis"
          className={`mt-8 flex min-h-[260px] cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed p-8 text-center transition-all ${
            dragOver ? "border-amber-500 bg-amber-50" : "border-stone-300 bg-white hover:border-amber-400"
          }`}
        >
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-100 text-amber-700">
            <ImageIcon size={26} aria-hidden="true" />
          </span>
          <p className="mt-4 text-lg font-bold text-stone-900">Drop an image here</p>
          <p className="mt-1 text-sm text-stone-500">or tap to choose — up to {MAX_MB}MB</p>
          <p className="mt-4 flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.15em] text-stone-400">
            <Lock size={12} /> Local analysis — your media stays on your device
          </p>
          <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={(e) => handleFile(e.target.files?.[0])} />
        </div>
      ) : (
        <div className="mt-8 rounded-2xl border border-stone-200 bg-white p-5 shadow-xl shadow-stone-900/5 sm:p-6">
          <div className="flex items-center justify-between">
            <p className="font-mono text-[11px] font-bold uppercase tracking-[0.2em] text-stone-500">{file.name}</p>
            <button onClick={reset} className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-stone-200 px-3 py-1.5 text-xs font-semibold text-stone-600 hover:border-red-300 hover:text-red-600">
              <X size={13} /> Remove
            </button>
          </div>
          {previewUrl && (
            <div className="relative mt-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={previewUrl} alt="Image to be forensically analyzed" className="max-h-[360px] w-full rounded-xl border border-stone-200 object-contain" />
              {progress && (
                <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden rounded-xl">
                  <div className="scanline" />
                </div>
              )}
            </div>
          )}

          {!progress && !result && (
            <>
              <div className="mt-4 rounded-xl border border-stone-200 bg-stone-50 p-4">
                <p className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-stone-500">Scan level</p>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  {(["quick", "standard"] as const).map((level) => (
                    <button
                      key={level}
                      onClick={() => setScanLevel(level)}
                      className={`rounded-lg border p-3 text-left text-sm transition-all ${
                        scanLevel === level ? "border-amber-500 bg-amber-50" : "border-stone-200 bg-white hover:border-stone-300"
                      }`}
                    >
                      <span className="font-bold capitalize text-stone-900">{level}</span>
                      <p className="mt-0.5 text-xs text-stone-500">{SCAN_LEVEL_DESCRIPTIONS[level]}</p>
                    </button>
                  ))}
                </div>
                {scanLevel === "standard" && (
                  <label className="mt-3 flex cursor-pointer items-center gap-2 text-sm text-stone-700">
                    <input type="checkbox" checked={attemptExtraction} onChange={(e) => setAttemptExtraction(e.target.checked)} className="h-4 w-4 accent-amber-600" />
                    Also attempt simple LSB extraction
                  </label>
                )}
              </div>

              <button
                onClick={runAnalysis}
                className="mt-4 flex h-14 w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-stone-900 text-sm font-bold uppercase tracking-wider text-white shadow-sm transition-all hover:bg-stone-700 active:scale-[0.98]"
              >
                <ScanSearch size={17} /> Analyze locally
              </button>
            </>
          )}

          {progress && (
            <div className="mt-4 rounded-xl border border-stone-200 bg-stone-50 p-4">
              <div className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2 font-semibold text-stone-700">
                  <Loader2 size={15} className="animate-spin" /> {progress.step}…
                </span>
                <span className="font-mono text-xs text-stone-500">{progress.pct}%</span>
              </div>
              <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-stone-200">
                <div className="h-full rounded-full bg-amber-500 transition-all" style={{ width: `${progress.pct}%` }} />
              </div>
              <button onClick={cancelAnalysis} className="mt-3 text-xs font-bold text-stone-500 hover:text-stone-900">Cancel</button>
            </div>
          )}
        </div>
      )}

      {error && (
        <div role="alert" className="mt-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>
      )}

      {result && (
        <div className="mt-6 space-y-5">
          {/* Privacy / AI badge — always accurate to what actually ran */}
          <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50/60 p-3 text-sm font-semibold text-emerald-800">
            <ShieldCheck size={16} /> Analyzed entirely on your device. No AI service was used.
          </div>

          {/* Summary */}
          <div className="rounded-2xl border border-stone-200 bg-white p-5 sm:p-6">
            <p className="font-mono text-[11px] font-bold uppercase tracking-[0.2em] text-stone-500">Analysis complete</p>
            <div className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
              <div><p className="text-stone-400">File</p><p className="font-semibold text-stone-900">{result.fileName}</p></div>
              <div><p className="text-stone-400">Type</p><p className="font-semibold text-stone-900">{result.fileType}</p></div>
              <div><p className="text-stone-400">Size</p><p className="font-semibold text-stone-900">{(result.fileSizeBytes / 1024 / 1024).toFixed(2)} MB</p></div>
              <div><p className="text-stone-400">Dimensions</p><p className="font-semibold text-stone-900">{result.dimensions}</p></div>
            </div>
            <p className="mt-4 text-stone-700">{result.overallSummary}</p>
            {result.steganography && result.steganography.overall.indicator !== "normal" && (
              <p className="mt-2 flex items-start gap-2 text-sm text-amber-700">
                <AlertTriangle size={15} className="mt-0.5 shrink-0" /> This does not prove hidden data — see the technical details below.
              </p>
            )}
          </div>

          {/* File structure */}
          <div className="rounded-2xl border border-stone-200 bg-white p-5 sm:p-6">
            <p className="flex items-center gap-2 font-extrabold text-stone-900"><FileWarning size={16} /> File structure</p>
            <p className="mt-1 text-sm text-stone-600">{result.fileStructure.note}</p>
            <div className="mt-2 grid grid-cols-2 gap-2 font-mono text-xs text-stone-500 sm:grid-cols-3">
              <span>Declared: {result.fileStructure.declaredMime}</span>
              <span>Detected: {result.fileStructure.detectedMime ?? "unknown"}</span>
              <span>Trailing bytes: {result.fileStructure.trailingDataBytes}</span>
            </div>
          </div>

          {/* Metadata */}
          <div className="rounded-2xl border border-stone-200 bg-white p-5 sm:p-6">
            <p className="flex items-center gap-2 font-extrabold text-stone-900"><Cpu size={16} /> Metadata</p>
            {!result.metadata.hasMetadata ? (
              <p className="mt-1 text-sm text-stone-500">No readable metadata detected.</p>
            ) : (
              <div className="mt-2 grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
                <div><p className="text-stone-400">Camera</p><p className="text-stone-800">{result.metadata.camera ?? "—"}</p></div>
                <div><p className="text-stone-400">Date</p><p className="text-stone-800">{result.metadata.dateTime ?? "—"}</p></div>
                <div><p className="text-stone-400">Software</p><p className="text-stone-800">{result.metadata.software ?? "—"}</p></div>
                <div><p className="text-stone-400">Orientation</p><p className="text-stone-800">{result.metadata.orientation ?? "—"}</p></div>
                <div><p className="text-stone-400">DPI</p><p className="text-stone-800">{result.metadata.dpi ?? "—"}</p></div>
                <div>
                  <p className="text-stone-400">GPS</p>
                  <p className="text-stone-800">{result.metadata.gps ? `${result.metadata.gps.lat}, ${result.metadata.gps.lon}` : "—"}</p>
                </div>
              </div>
            )}
            {result.metadata.gps && (
              <p className="mt-2 flex items-start gap-2 text-xs text-red-600">
                <AlertTriangle size={13} className="mt-0.5 shrink-0" /> This image contains GPS location data. Consider removing it before sharing publicly.
              </p>
            )}
          </div>

          {/* Hashes */}
          <div className="rounded-2xl border border-stone-200 bg-white p-5 sm:p-6">
            <p className="flex items-center gap-2 font-extrabold text-stone-900"><Fingerprint size={16} /> Hashes</p>
            <div className="mt-2 space-y-1.5 font-mono text-xs text-stone-600">
              <p><span className="text-stone-400">SHA-256 (exact file identity):</span> <span className="break-all">{result.hashes.sha256}</span></p>
              <p><span className="text-stone-400">MD5 (legacy identity):</span> <span className="break-all">{result.hashes.md5}</span></p>
              <p><span className="text-stone-400">Average hash (visual similarity):</span> {result.hashes.averageHash}</p>
              <p><span className="text-stone-400">Difference hash (visual similarity):</span> {result.hashes.differenceHash}</p>
            </div>
            <p className="mt-2 text-xs text-stone-500">Similar perceptual hashes mean visually similar images — not identical files.</p>
          </div>

          {/* Statistics */}
          {result.statistics && (
            <div className="space-y-3">
              <p className="font-extrabold text-stone-900">Statistical analysis</p>
              <IndicatorRow title="Entropy" result={result.statistics.entropy} />
              <IndicatorRow title="Noise pattern" result={result.statistics.noise} />
              <IndicatorRow title="Compression characteristics" result={result.statistics.compression} />
              <IndicatorRow title="Pixel distribution" result={result.statistics.pixelDistribution} />
            </div>
          )}

          {/* Steganography */}
          {result.steganography && (
            <div className="space-y-3">
              <p className="font-extrabold text-stone-900">Steganography analysis</p>
              <p className="text-sm text-stone-500">
                Mathematical/statistical indicators only — never presented as proof of hidden data.
                This looks for statistically <em>hidden</em> data; anything plainly visible in the photo
                (a QR code, a logo, printed text) isn&apos;t steganography and won&apos;t show up here —
                that&apos;s what Photo Check&apos;s visual review is for.
                Not implemented yet: {result.steganography.notImplemented.join(", ")}.
              </p>
              <IndicatorRow title="LSB — Red channel" result={result.steganography.lsb.red} />
              <IndicatorRow title="LSB — Green channel" result={result.steganography.lsb.green} />
              <IndicatorRow title="LSB — Blue channel" result={result.steganography.lsb.blue} />
              <IndicatorRow title="LSB — Combined RGB" result={result.steganography.lsb.combined} />
              <IndicatorRow title="Chi-square indicator (whole image)" result={result.steganography.chiSquare} />
              <IndicatorRow title={`Regional check (${result.steganography.regional.flaggedBlocks}/${result.steganography.regional.totalBlocks} tiles flagged)`} result={result.steganography.regional} />
              <IndicatorRow title="Overall" result={result.steganography.overall} />
            </div>
          )}

          {/* Extraction */}
          {result.extraction && (
            <div className="rounded-2xl border border-stone-200 bg-white p-5 sm:p-6">
              <p className="font-extrabold text-stone-900">Extraction attempt</p>
              <p className="mt-1 text-sm text-stone-600">
                Detection and extraction are different. Statistical evidence of possible embedding does not guarantee a recoverable message exists.
              </p>
              <p className="mt-2 text-sm">{result.extraction.message}</p>
              {result.extraction.success && (
                <div className="mt-3 rounded-lg bg-stone-50 p-3 text-sm">
                  <p>Type: <strong>{result.extraction.payloadType}</strong>{result.extraction.detectedSignature ? ` (${result.extraction.detectedSignature})` : ""}</p>
                  <p>Size: <strong>{result.extraction.payloadSizeBytes} bytes</strong></p>
                  {result.extraction.textPreview && (
                    <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap rounded bg-white p-2 font-mono text-xs text-stone-700">{result.extraction.textPreview}</pre>
                  )}
                  {result.extraction.downloadBlobUrl && (
                    <a href={result.extraction.downloadBlobUrl} download="fixmp-extracted-payload.bin" className="mt-2 inline-flex items-center gap-1.5 text-xs font-bold text-amber-700 hover:text-amber-800">
                      <Download size={13} /> Download extracted data (never opened or executed automatically)
                    </a>
                  )}
                </div>
              )}
            </div>
          )}

          <button
            onClick={exportReport}
            className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl border border-stone-300 bg-white px-6 py-3 text-sm font-bold text-stone-700 transition-all hover:border-stone-400"
          >
            <HardDriveDownload size={16} /> Export report (JSON, generated locally)
          </button>
        </div>
      )}
    </div>
  );
}
