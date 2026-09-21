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
  ArrowLeft, Camera, CheckCircle2, Eye, FileImage, ImageIcon, Loader2,
  ScanFace, ScanSearch, Upload, X,
} from "lucide-react";

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

const MAX_EDGE = 1600; // analysis copy is downscaled; redaction uses the original

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
        setVerdict(
          toVerdict(data, originalFileRef.current?.name ?? "photo", "Photo check")
        );
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

          {/* Upload zone */}
          {!previewUrl ? (
            <div
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => { e.preventDefault(); setDragOver(false); handleFile(e.dataTransfer.files?.[0]); }}
              className={`mt-8 flex min-h-[280px] cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed p-8 text-center transition-all ${
                dragOver ? "border-amber-500 bg-amber-50" : "border-stone-300 bg-white hover:border-amber-400"
              }`}
              onClick={() => inputRef.current?.click()}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") inputRef.current?.click(); }}
              aria-label="Upload a photo to check"
            >
              <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-100 text-amber-700">
                <ImageIcon size={26} aria-hidden="true" />
              </span>
              <p className="mt-4 text-lg font-bold text-stone-900">Drop a photo here</p>
              <p className="mt-1 text-sm text-stone-500">or tap to choose — JPG, PNG or WebP, up to {LIMITS.MAX_IMAGE_SIZE_MB}MB</p>
              <p className="mt-4 flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.15em] text-stone-400">
                <Camera size={12} /> your photo never leaves your device unprocessed
              </p>
              <input
                ref={inputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => handleFile(e.target.files?.[0])}
              />
            </div>
          ) : (
            <div className="mt-8 rounded-2xl border border-stone-200 bg-white p-5 shadow-xl shadow-stone-900/5 sm:p-6">
              <div className="flex items-center justify-between">
                <p className="font-mono text-[11px] font-bold uppercase tracking-[0.2em] text-stone-500">
                  Your photo
                </p>
                <button
                  onClick={clearAll}
                  className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-stone-200 px-3 py-1.5 text-xs font-semibold text-stone-600 transition-all hover:border-red-300 hover:text-red-600"
                >
                  <X size={13} /> Remove
                </button>
              </div>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={previewUrl}
                alt="Photo to be checked"
                className="mt-3 max-h-[420px] w-full rounded-xl border border-stone-200 object-contain"
              />

              <button
                onClick={handleCheck}
                disabled={loading || !analysis}
                className="mt-5 flex h-14 w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-stone-900 text-sm font-bold uppercase tracking-wider text-white shadow-sm transition-all hover:bg-stone-700 active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-stone-300"
              >
                {loading ? (
                  <>
                    <Loader2 size={17} className="animate-spin" aria-hidden="true" />
                    Examining your photo — this can take 10–30 seconds
                  </>
                ) : (
                  <>
                    <ScanSearch size={17} /> Did I miss anything?
                  </>
                )}
              </button>
            </div>
          )}

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
                }))}
                notRemovable={notRemovable}
              />
            </>
          )}

          <p className="mt-10 flex items-center justify-center gap-2 text-center text-xs text-stone-400">
            <Eye size={13} aria-hidden="true" />
            A resized copy is analysed on our server; the safe copy is created locally in your browser.
          </p>
        </section>
      </main>
      <Footer />
    </div>
  );
}