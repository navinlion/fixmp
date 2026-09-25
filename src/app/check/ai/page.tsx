"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import VerdictCard from "@/components/VerdictCard";
import { SectionLabel } from "@/components/brand";
import { toVerdict } from "@/lib/adapter";
import type { CheckResponse, Verdict } from "@/types/check";
import { AI_ENABLED } from "@/config/flags";
import { getBudget, consume } from "@/lib/scan-budget";
import { ArrowLeft, ArrowRight, Bot, EyeOff, Loader2, ScanSearch, ShieldCheck, Zap } from "lucide-react";

const MAX = 5000;

const EXAMPLES = [
  {
    label: "Leaked login",
    text: "Hi AI, I can't log into my Gmail. My email is ravi.k@example.com and my password is Monsoon$42. The OTP I just received is 583921 — please help me recover my account.",
  },
  {
    label: "Bank details",
    text: "Can you explain these bank charges? My account number is 5012 3456 7890, my card is 4532 8871 0932 4451, and my phone is 98765 43210 in case you need it.",
  },
  {
    label: "Everyday question",
    text: "What's the best way to explain the water cycle to a 7-year-old for a school project?",
  },
];

function AICheckInner() {
  const params = useSearchParams();
  const [text, setText] = useState("");
  const [verdict, setVerdict] = useState<Verdict | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [deepScan, setDeepScan] = useState(false);
  const resultRef = useRef<HTMLDivElement>(null);

  // Prefill from the homepage console (?q=...)
  useEffect(() => {
    const q = params.get("q");
    if (q) setText(q);
  }, [params]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const value = text.trim();
    if (!value || loading) return;

    if (deepScan && getBudget().remaining <= 0) {
      setError("Daily deep-scan limit reached (5). Local pattern checks are unlimited — deep scans reset tomorrow.");
      return;
    }

    setLoading(true);
    setError("");
    setVerdict(null);

    try {
      const res = await fetch("/api/check/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ textContent: value, deepScan }),
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Something went wrong while checking your prompt. Please try again.");
      }
      if (data.status === "ERROR") {
        throw new Error("Something went wrong while checking this. Please try again.");
      }

      if ((data as CheckResponse).deepScanStatus === "full") consume();
      if ((data as CheckResponse).deepScanStatus === "full") consume();
      setVerdict(toVerdict(data as CheckResponse, value, "Ask AI check"));
      setTimeout(() => resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 60);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Something went wrong while checking your prompt. Please try again."
      );
    } finally {
      setLoading(false);
    }
  }

  const containsLink = /https?:\/\/|www\./i.test(text);

  return (
    <section className="mx-auto w-full max-w-3xl px-4 pb-16 pt-10 sm:px-6 sm:pt-14">
      <Link
        href="/"
        className="inline-flex items-center gap-1.5 text-sm font-semibold text-stone-500 transition-colors hover:text-stone-900"
      >
        <ArrowLeft size={15} /> FixMP home
      </Link>

      <div className="mt-6">
        <SectionLabel>Checkpoint 02 — Ask AI</SectionLabel>
        <h1 className="mt-3 text-3xl font-extrabold leading-tight tracking-tight text-stone-900 sm:text-5xl">
          WHAT ARE YOU ABOUT TO TELL A <span className="text-amber-600">CHATBOT?</span>
        </h1>
        <p className="mt-4 leading-relaxed text-stone-600">
          Paste the exact prompt you&apos;re about to send to ChatGPT, Gemini, Claude or any other AI.
          FixMP checks it for passwords, one-time codes, API keys and personal details — before it
          leaves you.
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
          <Zap size={13} className="text-blue-600" aria-hidden="true" /> Result in seconds
        </span>
      </div>

      {/* Input console */}
      <form
        onSubmit={handleSubmit}
        className="mt-8 rounded-2xl border border-stone-200 bg-white p-5 shadow-xl shadow-stone-900/5 sm:p-7"
      >
        <div className="flex items-center justify-between gap-3">
          <label
            htmlFor="prompt"
            className="font-mono text-[11px] font-bold uppercase tracking-[0.2em] text-stone-500"
          >
            Your prompt
          </label>
          <span
            aria-hidden="true"
            className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-100 text-blue-700"
          >
            <Bot size={18} />
          </span>
        </div>

        <textarea
          id="prompt"
          rows={8}
          maxLength={MAX}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder='e.g. "Hi AI, I locked myself out — my email is ravi@example.com, password is Monsoon$42 and the OTP I just received is 583921..."'
          className="mt-3 w-full resize-y rounded-xl border border-stone-300 bg-stone-50 p-4 text-base leading-relaxed text-stone-900 transition-all placeholder:text-stone-400 focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/25"
        />

        <div className="mt-2 flex items-center justify-between text-xs">
          <p className={text.length > MAX * 0.9 ? "font-semibold text-amber-600" : "text-stone-400"}>
            {text.length > MAX * 0.9
              ? "Approaching the length limit"
              : `${MAX.toLocaleString()} characters max`}
          </p>
          <p
            className={`font-mono ${text.length > MAX * 0.9 ? "font-bold text-amber-600" : "text-stone-400"}`}
          >
            {text.length} / {MAX.toLocaleString()}
          </p>
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
        {/* Optional deep scan — user opt-in, default OFF */}
        {AI_ENABLED && (
          <label className="mt-5 flex cursor-pointer items-start gap-3 rounded-xl border border-stone-200 bg-stone-50 p-4 transition-colors hover:border-amber-300">
            <input
              type="checkbox"
              checked={deepScan}
              onChange={(e) => setDeepScan(e.target.checked)}
              className="mt-0.5 h-4 w-4 accent-amber-600"
            />
                <span className="text-sm">
                  <span className="font-bold text-stone-900">
                    Deep AI analysis
                    <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 font-mono text-[9px] font-bold uppercase tracking-widest text-amber-700">
                      {getBudget().remaining} of {getBudget().limit} free today
                    </span>
                  </span>
  <span className="block text-stone-500">
    Optional. Off (default): everything is checked using local analysis rules
    on our server — no AI analysis is used. On: your text is analyzed more
    deeply to better understand context, nuance, and meaning.
  </span>
</span>
          </label>
        )}

        <button
          type="submit"
          disabled={loading || !text.trim()}
          className="mt-6 flex h-14 w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-stone-900 text-sm font-bold uppercase tracking-wider text-white shadow-sm transition-all hover:bg-stone-700 active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-stone-300"
        >
          {loading ? (
            <>
              <Loader2 size={17} className="animate-spin" aria-hidden="true" />
                            {deepScan ? "Checking + deep analysis…" : "Checking your prompt…"}
            </>
          ) : (
            <>
              Check with FixMP <ScanSearch size={17} aria-hidden="true" />
            </>
          )}
        </button>

        {containsLink && (
          <p className="mt-4 flex flex-wrap items-center gap-1.5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-stone-700">
            Your text contains a link. Want to
            <Link href="/check/link" className="inline-flex items-center gap-1 font-bold text-amber-700 underline-offset-2 hover:underline">
              run Click Check too <ArrowRight size={13} />
            </Link>
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
            <VerdictCard verdict={verdict} onReset={() => { setVerdict(null); setError(""); }} />
          </div>
        )}
      </div>

      <p className="mt-10 text-center text-xs text-stone-400">
        Curious what happens to your text?{" "}
        <Link href="/how-it-works" className="font-semibold text-stone-500 underline-offset-2 hover:underline">
          See how the check works
        </Link>
      </p>
    </section>
  );
}

export default function AICheckPage() {
  return (
    <Suspense fallback={null}>
      <div className="flex min-h-screen flex-col">
        <Header />
        <main className="flex-1">
          <AICheckInner />
        </main>
        <Footer />
      </div>
    </Suspense>
  );
}