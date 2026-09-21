"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import VerdictCard from "@/components/VerdictCard";
import { SectionLabel } from "@/components/brand";
import { toVerdict } from "@/lib/adapter";
import { AI_ENABLED, LIMITS } from "@/config/flags";
import type { Verdict } from "@/types/check";
import {
  ArrowLeft, Camera, EyeOff, FileImage, Image as ImageIcon, Loader2,
  ScanSearch, Send, Server, ShieldCheck, X, Zap,
} from "lucide-react";

const MAX_TEXT = 5000;
const MAX_EDGE = 1600; // analysis copy is downscaled before sending

const EXAMPLES = [
  {
    label: "Vacation post",
    text: "Finally on vacation! 🏖️ Two weeks at Beachside Resort, room 402. Call or WhatsApp me on 98765 43210 if anything comes up — back on the 24th!",
  },
  {
    label: "New job post",
    text: "So proud to share — joining Acme Corp as Senior Engineer from Monday! Signing my offer at their Whitefield office, Bengaluru 560066. The email on my offer letter was hr-recruitment@acme-corp.in if anyone wants details.",
  },
  {
    label: "Clean post",
    text: "New blog post is live — how I built a habit tracker in one weekend. Link in bio!",
  },
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

export default function PostCheckPage() {
  const [text, setText] = useState("");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<string | null>(null);
  const [verdict, setVerdict] = useState<Verdict | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const originalNameRef = useRef<string>("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const resultRef = useRef<HTMLDivElement>(null);

  function clearImage() {
    setPreviewUrl(null);
    setAnalysis(null);
    originalNameRef.current = "";
    if (fileInputRef.current) fileInputRef.current.value = "";
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
    originalNameRef.current = file.name;
    setPreviewUrl(URL.createObjectURL(file));
    try {
      setAnalysis(await makeAnalysisCopy(file));
    } catch {
      setError("Couldn't read that image. Please try a different file.");
    }
  }

  function resetAll() {
    setText("");
    clearImage();
    setVerdict(null);
    setError("");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if ((!text.trim() && !analysis) || loading) return;

    setLoading(true);
    setError("");
    setVerdict(null);

    try {
      const res = await fetch("/api/check/post", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ textContent: text, imageBase64: analysis ?? "" }),
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Something went wrong while checking your post. Please try again.");
      }

      const original = text.trim() || originalNameRef.current || "your post";
      setVerdict(toVerdict(data, original, "Post check"));
      setTimeout(() => resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 60);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="flex-1">
        <section className="mx-auto w-full max-w-3xl px-4 pb-16 pt-10 sm:px-6 sm:pt-14">
          <Link href="/" className="inline-flex items-center gap-1.5 text-sm font-semibold text-stone-500 transition-colors hover:text-stone-900">
            <ArrowLeft size={15} /> FixMP home
          </Link>

          <div className="mt-6">
            <SectionLabel>Checkpoint 01 — Post</SectionLabel>
            <h1 className="mt-3 text-3xl font-extrabold leading-tight tracking-tight text-stone-900 sm:text-5xl">
              WHAT ARE YOU ABOUT TO <span className="text-amber-600">POST?</span>
            </h1>
            <p className="mt-4 leading-relaxed text-stone-600">
              Paste your caption, attach the image — or both. FixMP checks for phone numbers,
              addresses, location clues, visible documents and background details before your
              followers ever see them.
            </p>
          </div>

          {/* Trust strip */}
          <div className="mt-5 flex flex-wrap gap-x-6 gap-y-2 font-mono text-[10px] uppercase tracking-[0.18em] text-stone-500">
            <span className="flex items-center gap-1.5">
              <ShieldCheck size={13} className="text-emerald-600" aria-hidden="true" /> No sign-up
            </span>
            <span className="flex items-center gap-1.5">
              <EyeOff size={13} className="text-amber-600" aria-hidden="true" /> Nothing stored
            </span>
            <span className="flex items-center gap-1.5">
              {AI_ENABLED ? (
                <>
                  <Server size={13} className="text-blue-600" aria-hidden="true" /> Server + Gemini · nothing stored
                </>
              ) : (
                <>
                  <Zap size={13} className="text-blue-600" aria-hidden="true" /> Result in seconds
                </>
              )}
            </span>
          </div>

          {/* Input console */}
          <form
            onSubmit={handleSubmit}
            className="mt-8 rounded-2xl border border-stone-200 bg-white p-5 shadow-xl shadow-stone-900/5 sm:p-7"
          >
            <div className="flex items-center justify-between gap-3">
              <label
                htmlFor="post-text"
                className="font-mono text-[11px] font-bold uppercase tracking-[0.2em] text-stone-500"
              >
                Your caption / text
              </label>
              <span aria-hidden="true" className="flex h-9 w-9 items-center justify-center rounded-lg bg-purple-100 text-purple-700">
                <Send size={17} />
              </span>
            </div>

            <textarea
              id="post-text"
              rows={5}
              maxLength={MAX_TEXT}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="What are you about to post?"
              className="mt-3 w-full resize-y rounded-xl border border-stone-300 bg-stone-50 p-4 text-base leading-relaxed text-stone-900 transition-all placeholder:text-stone-400 focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/25"
            />

            <div className="mt-2 flex items-center justify-between text-xs">
              <p className="text-stone-400">{MAX_TEXT.toLocaleString()} characters max</p>
              <p className={`font-mono ${text.length > MAX_TEXT * 0.9 ? "font-bold text-amber-600" : "text-stone-400"}`}>
                {text.length} / {MAX_TEXT.toLocaleString()}
              </p>
            </div>

            {/* Image dropzone */}
            <div className="mt-5 border-t border-stone-100 pt-5">
              <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-stone-400">
                Attach image (optional)
              </p>

              {!previewUrl ? (
                <div
                  onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={(e) => { e.preventDefault(); setDragOver(false); handleFile(e.dataTransfer.files?.[0]); }}
                  onClick={() => fileInputRef.current?.click()}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") fileInputRef.current?.click(); }}
                  role="button"
                  tabIndex={0}
                  aria-label="Attach an image to your post"
                  className={`mt-3 flex h-32 cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed p-4 text-center transition-all ${
                    dragOver ? "border-amber-500 bg-amber-50" : "border-stone-300 bg-stone-50 hover:border-amber-400"
                  }`}
                >
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-100 text-amber-700">
                    <ImageIcon size={20} aria-hidden="true" />
                  </span>
                  <p className="mt-2 text-sm font-semibold text-stone-700">
                    Drop an image here, or tap to choose
                  </p>
                  <p className="mt-0.5 flex items-center gap-1 text-xs text-stone-400">
                    <Camera size={12} aria-hidden="true" /> JPG, PNG or WebP · up to {LIMITS.MAX_IMAGE_SIZE_MB}MB
                  </p>
                </div>
              ) : (
                <div className="relative mt-3 max-h-64 overflow-hidden rounded-xl border border-stone-200 bg-stone-50">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={previewUrl} alt="Image attached to the post" className="max-h-64 w-full object-contain" />
                  <button
                    type="button"
                    onClick={clearImage}
                    className="absolute right-2 top-2 flex items-center gap-1 rounded-full bg-white/90 px-2.5 py-1.5 text-xs font-semibold text-stone-700 shadow-md transition-colors hover:bg-white hover:text-red-600"
                  >
                    <X size={13} /> Remove
                  </button>
                </div>
              )}

              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => handleFile(e.target.files?.[0])}
              />
            </div>

            {/* Examples — doubles as test cases */}
            <div className="mt-5 border-t border-stone-100 pt-5">
              <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-stone-400">
                Try an example (great for testing)
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {EXAMPLES.map((ex) => (
                  <button
                    key={ex.label}
                    type="button"
                    onClick={() => setText(ex.text)}
                    className="cursor-pointer rounded-full border border-stone-200 bg-stone-50 px-3.5 py-2 text-xs font-semibold text-stone-600 transition-all hover:border-amber-400 hover:text-amber-700 active:scale-95"
                  >
                    {ex.label}
                  </button>
                ))}
              </div>
            </div>

            <button
              type="submit"
              disabled={loading || (!text.trim() && !analysis)}
              className="mt-6 flex h-14 w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-stone-900 text-sm font-bold uppercase tracking-wider text-white shadow-sm transition-all hover:bg-stone-700 active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-stone-300"
            >
              {loading ? (
                <>
                  <Loader2 size={17} className="animate-spin" aria-hidden="true" />
                  {analysis ? "Checking post + image…" : "Checking your post…"}
                </>
              ) : (
                <>
                  Check with FixMP <ScanSearch size={17} aria-hidden="true" />
                </>
              )}
            </button>

            {analysis && (
              <p className="mt-3 flex items-center justify-center gap-1.5 text-center font-mono text-[10px] uppercase tracking-[0.15em] text-stone-400">
                <FileImage size={12} aria-hidden="true" /> a resized copy is analyzed — your original file stays on your device
              </p>
            )}
          </form>

          {error && (
            <div role="alert" className="mt-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              {error}
            </div>
          )}

          <div ref={resultRef} className="scroll-mt-24">
            {verdict && (
              <div className="mt-8">
                <VerdictCard verdict={verdict} onReset={resetAll} />
              </div>
            )}
          </div>

          <p className="mt-10 text-center text-xs text-stone-400">
            Curious what happens to your post?{" "}
            <Link href="/how-it-works" className="font-semibold text-stone-500 underline-offset-2 hover:underline">
              See how the check works
            </Link>
          </p>
        </section>
      </main>
      <Footer />
    </div>
  );
}