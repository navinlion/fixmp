"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import VerdictCard from "@/components/VerdictCard";
import ImageRedactor from "@/components/ImageRedactor";
import { SectionLabel } from "@/components/brand";
import { toVerdict } from "@/lib/adapter";
import { LIMITS } from "@/config/flags";
import type { Verdict } from "@/types/check";
import {
  ArrowLeft, ArrowRight, CheckCircle2, Eye, ImageIcon, Loader2,
  Scan, ScanSearch, X,
} from "lucide-react";

const MAX_EDGE = 1600; // analysis copy is downscaled; redaction uses the original

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
  const [aiOff, setAiOff] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const originalFileRef = useRef<File | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  function clearAll() {
    setPreviewUrl(null);
    setAnalysis(null);
    setVerdict(null);
    setAiOff(false);
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
    setAiOff(false);
    originalFileRef.current = file; // stays in the browser — used only for the safe copy
    setPreviewUrl(URL.createObjectURL(file));
    try {
      setAnalysis(await makeAnalysisCopy(file));
    } catch {
      setError("Couldn't read that image. Please try a different file.");
    }
  }

  async function handleCheck() {
    if (!analysis || loading) return;
    setLoading(true);
    setError("");
    setVerdict(null);
    setAiOff(false);

    try {
      const res = await fetch("/api/check/photo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageBase64: analysis }),
      });
      const data = await res.json();

      if (!res.ok) throw new Error(data.error || "Something went wrong while checking this photo. Please try again.");
      if (data.status === "AI_OFF") {
        setAiOff(true);
      } else {
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
              Upload the photo you&apos;re about to share. FixMP looks at the whole frame —
              backgrounds, screens, documents, reflections — for things you may not have noticed.
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
                    className={`max-h-[420px] w-full object-contain transition-all duration-500 ${loading ? "opacity-40 grayscale" : "opacity-100"}`}
                  />

                  {loading && (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm" />
                      <div className="scanner-ring" />
                      <div className="scanner-bracket bracket-tl" />
                      <div className="scanner-bracket bracket-tr" />
                      <div className="scanner-bracket bracket-bl" />
                      <div className="scanner-bracket bracket-br" />
                      <div className="scan-beam" />
                      <div className="relative z-20 flex flex-col items-center">
                        <div className="tech-text animate-pulse text-lg font-bold text-blue-400">Scanning</div>
                        <div className="tech-text mt-1 text-xs text-stone-400">Analyzing the full frame…</div>
                      </div>
                    </div>
                  )}

                  {!loading && (
                    <button
                      onClick={clearAll}
                      aria-label="Remove photo"
                      className="absolute right-3 top-3 rounded-full border border-stone-600 bg-black/60 p-2 text-white backdrop-blur-md transition-colors hover:border-red-500 hover:bg-red-600"
                    >
                      <X size={16} />
                    </button>
                  )}
                </div>

                {!loading ? (
                  <button
                    onClick={handleCheck}
                    disabled={!analysis}
                    className="group mt-8 flex items-center gap-3 rounded-xl bg-amber-500 px-8 py-4 font-bold text-stone-950 shadow-lg shadow-amber-500/20 transition-all hover:bg-amber-400 active:scale-95 disabled:cursor-not-allowed disabled:bg-stone-700 disabled:text-stone-400"
                  >
                    <Scan size={20} className="transition-transform group-hover:rotate-12" aria-hidden="true" />
                    <span className="tech-text text-base tracking-widest">Initiate scan</span>
                  </button>
                ) : (
                  <button
                    disabled
                    className="mt-8 flex items-center gap-3 rounded-xl border border-stone-700 bg-stone-800 px-8 py-4 font-bold text-stone-400"
                  >
                    <Loader2 size={20} className="animate-spin" aria-hidden="true" />
                    <span className="tech-text text-base tracking-widest">Processing…</span>
                  </button>
                )}

                <p className="mt-4 flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.15em] text-stone-500">
                  <Eye size={12} aria-hidden="true" /> a resized copy is analyzed — your original file stays on your device
                </p>
              </>
            )}
          </div>

          {error && (
            <div role="alert" className="mt-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              {error}
            </div>
          )}

          {/* Graceful AI-off mode: the honest self-check */}
          {aiOff && (
            <div className="mt-8 rounded-2xl border border-amber-200 bg-amber-50/60 p-5 sm:p-6">
              <h2 className="text-lg font-extrabold tracking-tight text-stone-900">
                Deep scan is switched off right now
              </h2>
              <p className="mt-1.5 text-sm leading-relaxed text-stone-600">
                Instead of pretending, here&apos;s the exact checklist FixMP&apos;s AI uses.
                Give your photo 30 honest seconds against it:
              </p>
              <ul className="mt-4 space-y-2.5">
                {SELF_CHECK.map((item) => (
                  <li key={item} className="flex items-start gap-2.5 text-sm text-stone-700">
                    <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-amber-600" aria-hidden="true" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {verdict && (
            <>
              <div className="mt-8">
                <VerdictCard verdict={verdict} onReset={clearAll} />
              </div>
              <ImageRedactor
                originalFile={originalFileRef.current}
                removable={removable.map((f) => ({
                  id: f.id,
                  category: f.category,
                  description: f.description,
                  severity: f.severity,
                  region: f.region,
                }))}
                notRemovable={notRemovable}
              />
            </>
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