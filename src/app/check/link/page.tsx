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
import { ArrowLeft, EyeOff, Link2, Loader2, Server, ShieldCheck, Zap } from "lucide-react";

const EXAMPLES = [
  { label: "Phishing lookalike", url: "http://paypa1-secure-login.tk/verify-account" },
  { label: "Shortened link", url: "https://bit.ly/3xYzAbc" },
  { label: "Normal site", url: "https://www.wikipedia.org" },
];

function LinkCheckInner() {
  const params = useSearchParams();
  const [url, setUrl] = useState("");
  const [verdict, setVerdict] = useState<Verdict | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const resultRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const q = params.get("url");
    if (q) setUrl(q); // homepage handoff — /check/link?url=...
  }, [params]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!url.trim() || loading) return;

    setLoading(true);
    setError("");
    setVerdict(null);

    try {
      const res = await fetch("/api/check/link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ urlToCheck: url.trim() }),
      });
      const data = await res.json();

      if (!res.ok) throw new Error(data.error || "Something went wrong while checking this link. Please try again.");

      setVerdict(toVerdict(data as CheckResponse, url.trim(), "Link check"));
      setTimeout(() => resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 60);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="mx-auto w-full max-w-3xl px-4 pb-16 pt-10 sm:px-6 sm:pt-14">
      <Link href="/" className="inline-flex items-center gap-1.5 text-sm font-semibold text-stone-500 transition-colors hover:text-stone-900">
        <ArrowLeft size={15} /> FixMP home
      </Link>

      <div className="mt-6">
        <SectionLabel>Checkpoint 03 — Click</SectionLabel>
        <h1 className="mt-3 text-3xl font-extrabold leading-tight tracking-tight text-stone-900 sm:text-5xl">
          CHECK A LINK BEFORE YOU <span className="text-amber-600">OPEN IT.</span>
        </h1>
        <p className="mt-4 leading-relaxed text-stone-600">
          Paste the link someone sent you. FixMP checks it for lookalike domains, disguised
          characters, hidden redirects and the patterns behind most phishing — before your tap does.
        </p>
      </div>

      {/* Trust strip */}
      <div className="mt-5 flex flex-wrap gap-x-6 gap-y-2 font-mono text-[10px] uppercase tracking-[0.18em] text-stone-500">
        <span className="flex items-center gap-1.5"><ShieldCheck size={13} className="text-emerald-600" aria-hidden="true" /> No sign-up</span>
        <span className="flex items-center gap-1.5"><EyeOff size={13} className="text-amber-600" aria-hidden="true" /> Nothing stored</span>
        <span className="flex items-center gap-1.5"><Zap size={13} className="text-blue-600" aria-hidden="true" /> Pattern checks in seconds</span>
        <span className="flex items-center gap-1.5"><Server size={13} className="text-blue-600" aria-hidden="true" /> Site probed safely — never by your device</span>
      </div>

      {/* Input console */}
      <form onSubmit={handleSubmit} className="mt-8 rounded-2xl border border-stone-200 bg-white p-5 shadow-xl shadow-stone-900/5 sm:p-7">
        <label htmlFor="url-input" className="font-mono text-[11px] font-bold uppercase tracking-[0.2em] text-stone-500">
          The link you were sent
        </label>
        <div className="mt-3 flex flex-col gap-3 sm:flex-row">
          <div className="relative flex-1">
            <Link2 size={17} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-stone-400" aria-hidden="true" />
            <input
              id="url-input"
              type="text"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="example.com or https://…"
              autoComplete="off"
              spellCheck={false}
              className="h-14 w-full rounded-xl border border-stone-300 bg-stone-50 pl-11 pr-4 font-mono text-sm text-stone-900 transition-all placeholder:text-stone-400 focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/25"
            />
          </div>
          <button
            type="submit"
            disabled={loading || !url.trim()}
            className="flex h-14 cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-xl bg-stone-900 px-7 text-sm font-bold uppercase tracking-wider text-white shadow-sm transition-all hover:bg-stone-700 active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-stone-300"
          >
            {loading ? (
              <>
                <Loader2 size={16} className="animate-spin" aria-hidden="true" /> Checking…
              </>
            ) : (
              "Check link"
            )}
          </button>
        </div>

        {/* Examples — doubles as test cases */}
        <div className="mt-5 border-t border-stone-100 pt-5">
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-stone-400">Try an example (great for testing)</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {EXAMPLES.map((ex) => (
              <button
                key={ex.label}
                type="button"
                onClick={() => setUrl(ex.url)}
                className="cursor-pointer rounded-full border border-stone-200 bg-stone-50 px-3.5 py-2 text-xs font-semibold text-stone-600 transition-all hover:border-amber-400 hover:text-amber-700 active:scale-95"
              >
                {ex.label}
              </button>
            ))}
          </div>
        </div>
      </form>

      {/* Live scan card — shown only while the check request is in flight */}
      {loading && (
        <div className="mt-4 overflow-hidden rounded-2xl border border-blue-200 bg-white">
          <div className="flex items-center justify-between border-b border-stone-100 px-4 py-2.5">
            <p className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-stone-500">
              Analyzing link
            </p>
            <Loader2 size={14} className="animate-spin text-blue-600" aria-hidden="true" />
          </div>
          <div className="relative px-4 py-5">
            <p className="break-all font-mono text-sm text-stone-800">{url}</p>
            <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
              <div className="scanline-x" />
            </div>
          </div>
        </div>
      )}

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

      <p className="mt-10 text-center text-xs leading-relaxed text-stone-400">
        No checker can promise a site is safe — FixMP gives you the strongest honest signal,
        never false certainty.
      </p>
    </section>
  );
}

export default function LinkCheckPage() {
  return (
    <Suspense fallback={null}>
      <div className="flex min-h-screen flex-col">
        <Header />
        <main className="flex-1">
          <LinkCheckInner />
        </main>
        <Footer />
      </div>
    </Suspense>
  );
}