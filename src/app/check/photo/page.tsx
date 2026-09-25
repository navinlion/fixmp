"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import VerdictCard from "@/components/VerdictCard";
import ImageRedactor from "@/components/ImageRedactor";
import LocalPhotoReport from "@/components/LocalPhotoReport";
import { SectionLabel } from "@/components/brand";
import { toVerdict } from "@/lib/adapter";
import { LIMITS } from "@/config/flags";
import { getBudget, consume } from "@/lib/scan-budget";
import { runLocalPhotoIntelligence, type LocalPhotoReport as LocalReport } from "@/lib/photo-local-engine";
import type { Verdict } from "@/types/check";
import {
  ArrowLeft, ArrowRight, CheckCircle2, Eye, ImageIcon, Loader2,
  Scan, ScanSearch, X,
} from "lucide-react";

const MAX_EDGE = 1600;

const SELF_CHECK = [
  "Documents, letters, ID cards or packages in the background",
  "Phone screens, monitors or notifications that are switched on",
  "Visible phone numbers, emails, addresses or name labels",
  "QR codes, barcodes or license plates",
  "Reflections in windows, mirrors, glasses or screens",
  "Street signs, storefronts or house numbers revealing location",
  "Other people — especially children — who didn't agree to be posted",
  "Anything you'd only recognise as sensitive because you were there",
];

async function makeAnalysisCopy(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.src = url;
  await img.decode();
  URL.revokeObjectURL(url);
  const scale = Math.min(1, MAX_EDGE / Math.max(img.naturalWidth, img.naturalHeight));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(img.naturalWidth * scale);
  canvas.height = Math.round(img.naturalHeight * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas");
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.85);
}

export default function PhotoCheckPage() {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<string | null>(null);
  const [verdict, setVerdict] = useState<Verdict | null>(null);
  const [localReport, setLocalReport] = useState<LocalReport | null>(null);
  const [deepScan, setDeepScan] = useState(false);
  const [selfCheck, setSelfCheck] = useState<null | "voluntary" | "aiOff">(null);
  const [loading, setLoading] = useState(false);
  const [localRunning, setLocalRunning] = useState(false);
  const [error, setError] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const originalFileRef = useRef<File | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  function clearAll() {
    setPreviewUrl(null);
    setAnalysis(null);
    setVerdict(null);
    setLocalReport(null);
    setDeepScan(false);
    setSelfCheck(null);
    setError("");
    originalFileRef.current = null;
    if (inputRef.current) inputRef.current.value = "";
  }

  async function handleFile(file: File | undefined | null) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("That doesn't look like an image. Please use JPG, PNG or WebP.");
      return;
    }
    if (file.size > LIMITS.MAX_IMAGE_SIZE_MB * 1024 * 1024) {
      setError(`Image is too large. Please use an image under ${LIMITS.MAX_IMAGE_SIZE_MB}MB.`);
      return;
    }
    setError("");
    setVerdict(null);
    setLocalReport(null);
    setSelfCheck(null);
    originalFileRef.current = file;
    setPreviewUrl(URL.createObjectURL(file));
    try {
      setAnalysis(await makeAnalysisCopy(file));
    } catch {
      setError("Couldn't read that image. Please try a different file.");
    }
  }

  async function handleCheck() {
    if (loading || localRunning) return;

    // Default path — LOCAL INTELLIGENCE ENGINE: multi-detector, zero upload.
    if (!deepScan) {
      setVerdict(null);
      setSelfCheck(null);
      setLocalReport(null);
      setLocalRunning(true);
      setError("");
      try {
        if (!originalFileRef.current) return;
        const report = await runLocalPhotoIntelligence(originalFileRef.current);
        setLocalReport(report);
      } catch {
        setSelfCheck("voluntary"); // honest fallback if the engine itself fails
      } finally {
        setLocalRunning(false);
      }
      return;
    }

    // Deep path — budget guard, then server analysis
    if (getBudget().remaining <= 0) {
      setError("Daily deep-scan limit reached (5). Local checks are unlimited — deep scans reset tomorrow.");
      return;
    }
    if (!analysis) return;
    setLoading(true);
    setError("");
    setVerdict(null);
    setLocalReport(null);
    setSelfCheck(null);

    try {
      const res = await fetch("/api/check/photo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageBase64: analysis, deepScan: true }),
      });
      const data = await res.json();

      if (!res.ok) throw new Error(data.error || "Something went wrong while checking this photo. Please try again.");
      if (data.status === "AI_OFF") {
        setSelfCheck("aiOff");
      } else if (data.status === "SKIPPED") {
        setSelfCheck("voluntary");
      } else {
        if (data.deepScanStatus === "full") consume();
        setVerdict(toVerdict(data, originalFileRef.current?.name ?? "photo", "Photo check"));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  const removable = (verdict?.findings ?? []).filter((f) => f.region);
  const notRemovable = (verdict?.findings ?? []).filter((f) => !f.region);

  const localRemovable = (localReport?.findings ?? [])
    .filter((f) => f.region)
    .map((f, i) => ({
      id: `local-${f.type}-${i}`,
      category: f.category,
      description: f.description,
      severity: f.severity,
      region: f.region,
    }));
  const localNotRemovable = (localReport?.findings ?? [])
    .filter((f) => !f.region)
    .map((f, i) => ({
      id: `local-${f.type}-nr-${i}`,
      category: f.category,
      severity: f.severity,
      description: f.description,
      evidence: f.evidence,
      action: f.action,
    }));

  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="flex-1">
        <section className="mx-auto w-full max-w-3xl px-4 pb-16 pt-10 sm:px-6 sm:pt-14">
          <Link href="/" className="inline-flex items-center gap-1.5 text-sm font-semibold text-stone-500 transition-colors hover:text-stone-900">
            <ArrowLeft size={15} /> FixMP home
          </Link>

          <div className="mt-6">
            <SectionLabel>Checkpoint 04 — Share Photo</SectionLabel>
            <h1 className="mt-3 text-3xl font-extrabold leading-tight tracking-tight text-stone-900 sm:text-5xl">
              DID YOU MISS <span className="text-amber-600">ANYTHING?</span>
            </h1>
            <p className="mt-4 leading-relaxed text-stone-600">
              Upload the photo you&apos;re about to share. FixMP analyzes it on your device —
              text, handwriting, codes, metadata — and deep-scans the frame only on request.
            </p>
          </div>

          {/* ===== SCANNER CONSOLE (dark) ===== */}
          <div className="scanner-bg mt-8 flex min-h-[380px] flex-col items-center justify-center rounded-3xl p-6 shadow-2xl sm:p-10">
            {!previewUrl ? (
              <div
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => { e.preventDefault(); setDragOver(false); handleFile(e.dataTransfer.files?.[0]); }}
                onClick={() => inputRef.current?.click()}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") inputRef.current?.click(); }}
                aria-label="Upload a photo to check"
                className={`w-full max-w-lg cursor-pointer rounded-2xl border-2 border-dashed p-8 text-center transition-all ${
                  dragOver ? "border-amber-400 bg-amber-400/10" : "border-stone-600 hover:border-amber-400/70 hover:bg-stone-800/40"
                }`}
              >
                <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full border border-stone-600 bg-stone-800">
                  <ImageIcon size={26} className="text-amber-400" aria-hidden="true" />
                </span>
                <p className="tech-text mt-4 text-lg font-bold text-white">Drop photo to scan</p>
                <p className="mt-1 text-sm text-stone-400">
                  or tap to choose — JPG, PNG or WebP, up to {LIMITS.MAX_IMAGE_SIZE_MB}MB
                </p>
                <input
                  ref={inputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  onChange={(e) => handleFile(e.target.files?.[0])}
                />
              </div>
            ) : (
              <>
                <div className="relative mx-auto w-full max-w-2xl overflow-hidden rounded-xl border border-stone-700 bg-black">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={previewUrl}
                    alt="Photo to be checked"
                    className={`max-h-[420px] w-full object-contain transition-all duration-500 ${loading || localRunning ? "opacity-40 grayscale" : "opacity-100"}`}
                  />

                  {(loading || localRunning) && (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm" />
                      <div className="scanner-ring" />
                      <div className="scanner-bracket bracket-tl" />
                      <div className="scanner-bracket bracket-tr" />
                      <div className="scanner-bracket bracket-bl" />
                      <div className="scanner-bracket bracket-br" />
                      <div className="scan-beam" />
                      <div className="relative z-20 flex flex-col items-center">
                        <div className="tech-text animate-pulse text-lg font-bold text-blue-400">
                          {localRunning ? "Local scan" : "Deep scan"}
                        </div>
                        <div className="tech-text mt-1 text-xs text-stone-400">
                          {localRunning ? "Reading text, strokes, codes & metadata on your device…" : "Analyzing the full frame…"}
                        </div>
                      </div>
                    </div>
                  )}

                  {!loading && !localRunning && (
                    <button
                      onClick={clearAll}
                      aria-label="Remove photo"
                      className="absolute right-3 top-3 rounded-full border border-stone-600 bg-black/60 p-2 text-white backdrop-blur-md transition-colors hover:border-red-500 hover:bg-red-600"
                    >
                      <X size={16} />
                    </button>
                  )}
                </div>

                <label className="mt-6 flex w-full max-w-lg cursor-pointer items-start gap-3 rounded-xl border border-stone-700 bg-stone-900/60 p-4 transition-colors hover:border-amber-400/60">
                  <input
                    type="checkbox"
                    checked={deepScan}
                    onChange={(e) => setDeepScan(e.target.checked)}
                    className="mt-0.5 h-4 w-4 accent-amber-500"
                  />
                  <span className="text-sm">
                    <span className="font-bold text-white">
                      Deep AI scan
                      <span className="ml-2 rounded-full bg-amber-500/20 px-2 py-0.5 font-mono text-[9px] font-bold uppercase tracking-widest text-amber-400">
                        {getBudget().remaining} of {getBudget().limit} free today
                      </span>
                    </span>
                    <span className="block text-stone-400">
                      Optional. Off (default): full local analysis in your browser — nothing
                      uploaded. On: a resized copy is also analyzed in depth by an external AI
                      service.
                    </span>
                  </span>
                </label>

                {!loading && !localRunning ? (
                  <button
                    onClick={handleCheck}
                    disabled={!analysis}
                    className="group mt-6 flex items-center gap-3 rounded-xl bg-amber-500 px-8 py-4 font-bold text-stone-950 shadow-lg shadow-amber-500/20 transition-all hover:bg-amber-400 active:scale-95 disabled:cursor-not-allowed disabled:bg-stone-700 disabled:text-stone-400"
                  >
                    {deepScan ? (
                      <Scan size={20} className="transition-transform group-hover:rotate-12" aria-hidden="true" />
                    ) : (
                      <ScanSearch size={20} aria-hidden="true" />
                    )}
                    <span className="tech-text text-base tracking-widest">
                      {deepScan ? "Deep AI scan" : "Analyze locally"}
                    </span>
                  </button>
                ) : (
                  <button
                    disabled
                    className="mt-6 flex items-center gap-3 rounded-xl border border-stone-700 bg-stone-800 px-8 py-4 font-bold text-stone-400"
                  >
                    <Loader2 size={20} className="animate-spin" aria-hidden="true" />
                    <span className="tech-text text-base tracking-widest">Processing…</span>
                  </button>
                )}

                <p className="mt-4 flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.15em] text-stone-500">
                  <Eye size={12} aria-hidden="true" />
                  {deepScan
                    ? "a resized copy is analyzed — your original file stays on your device"
                    : "runs entirely in your browser — nothing is uploaded"}
                </p>
              </>
            )}
          </div>

          {error && (
            <div role="alert" className="mt-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              {error}
            </div>
          )}

          {/* LOCAL REPORT — the primary result */}
          {localReport && (
            <div className="mt-8">
               <LocalPhotoReport report={localReport} previewUrl={previewUrl ?? ""} originalFile={originalFileRef.current} />
              {(localRemovable.length > 0 || localNotRemovable.length > 0) && (
                <ImageRedactor
                  originalFile={originalFileRef.current}
                  removable={localRemovable}
                  notRemovable={localNotRemovable}
                />
              )}
            </div>
          )}

          {/* DEEP CONFIRM — optional, clearly separate */}
          {verdict && (
            <div className="mt-10">
              <p className="mb-3 font-mono text-[11px] font-bold uppercase tracking-[0.2em] text-stone-400">
                Deep confirm — optional external AI analysis
              </p>
                            <VerdictCard verdict={verdict} onReset={clearAll} />
              {removable.length > 0 && (
                <p className="mt-3 rounded-xl border border-stone-200 bg-white p-4 text-sm text-stone-600">
                  The deep-confirm findings above can also be removed — use the safe-to-share
                  generator in the local report below, which handles all detected regions.
                </p>
              )}
            </div>
          )}

          <Link
            href="/check/forensics"
            className="mt-6 flex items-center justify-between rounded-xl border border-stone-200 bg-white p-4 text-sm transition-all hover:border-amber-400"
          >
            <span>
              <strong className="text-stone-900">Want to see what&apos;s hidden in the file itself?</strong>
              <span className="block text-stone-500">Media Forensics — metadata, hashes, steganography indicators. Free, local, always available.</span>
            </span>
            <ArrowRight size={16} className="shrink-0 text-stone-400" aria-hidden="true" />
          </Link>
        </section>
      </main>
      <Footer />
    </div>
  );
}