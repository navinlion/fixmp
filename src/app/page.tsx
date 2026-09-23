"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import ToolCard, { type ToolTone } from "@/components/ToolCard";
import { SectionLabel, TrafficDots, HazardDivider } from "@/components/brand";
import { buildVerdict, looksLikeUrl, riskStyles, scanText, severityStyles } from "@/lib/engine/detect";
import type { Verdict } from "@/types/check";
import {
  Send, Bot, Link as LinkIcon, Image as ImageIcon, Lock, AlertTriangle,
  Mic, Camera, FileText, ScanSearch, ArrowRight, RotateCcw, CheckCircle2,
  ShieldCheck, EyeOff, FlaskConical, Fingerprint, type LucideIcon,
} from "lucide-react";

type Tool = { icon: LucideIcon; title: string; description: string; href: string; tone: ToolTone };

const tools: Tool[] = [
  { icon: Send, title: "Post", description: "Check before you post — captions, text and images get reviewed for private details before they go public.", href: "/check/post", tone: "purple" },
  { icon: Bot, title: "Ask AI", description: "Check what you're about to tell a chatbot — catch passwords, codes and personal data hidden in your prompts.", href: "/check/ai", tone: "blue" },
  { icon: LinkIcon, title: "Click", description: "Check a link before opening it — spot lookalike domains and phishing signs before you tap.", href: "/check/link", tone: "emerald" },
  { icon: ImageIcon, title: "Share Photo", description: "Find things you may have missed — documents, screens, notifications and reflections in the background.", href: "/check/photo", tone: "amber" },
  { icon: Lock, title: "Share Info", description: "Check what personal information you're exposing — see exactly what you're handing over, and to whom.", href: "/check/ai", tone: "rose" },
  { icon: AlertTriangle, title: "Do Something", description: "Check before you act — not sure which check fits? Start here and FixMP will point you the right way.", href: "/check/ai", tone: "slate" },
  { icon: Fingerprint, title: "Media Forensics", description: "Metadata, hashes, statistics and steganography indicators for an image — computed entirely on your device, no AI used.", href: "/check/forensics", tone: "slate" },
];

const quickActions: { icon: LucideIcon; label: string; href: string | null }[] = [
  { icon: Mic, label: "Speak", href: null },
  { icon: Camera, label: "Upload photo", href: "/check/photo" },
  { icon: FileText, label: "Add file", href: "/check/post" },
  { icon: LinkIcon, label: "Check link", href: "/check/link" },
];

const tickerItems = [
  "Before you post", "Before you send", "Before you share", "Before you upload",
  "Before you search", "Before you ask", "Before you click",
];

const steps = [
  { num: "01", title: "Tell FixMP what you're about to do", body: "Paste the text, drop the link, or upload the photo. No account, no forms." },
  { num: "02", title: "FixMP runs the check", body: "Fast deterministic scans first. AI review only where it adds something — never for show." },
  { num: "03", title: "You get one clear verdict", body: "DON'T, CHECK, DO, WHY, NEXT — plain language, no scare tactics, no jargon." },
];

export default function Home() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState("");
  const [hint, setHint] = useState("");
  const [preview, setPreview] = useState<Verdict | null>(null);
  const [original, setOriginal] = useState("");
  const [safer, setSafer] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const value = draft.trim();
    if (!value) {
      setHint("Tell FixMP what you're about to do — paste text or a link first.");
      inputRef.current?.focus();
      return;
    }
    setHint("");

    // Spec §12 — input type detection before routing.
    if (looksLikeUrl(value)) {
      router.push(`/check/link?url=${encodeURIComponent(value)}`);
      return;
    }

    const result = scanText(value);
    setOriginal(value);
    setSafer(result.saferVersion !== value ? result.saferVersion : null);
    setPreview(buildVerdict("quick-check", value, result.findings));
  }

  function resetPreview() {
    setPreview(null);
    setSafer(null);
    setOriginal("");
  }

  const risk = preview ? riskStyles[preview.riskLevel] : null;

  return (
    <div className="flex min-h-screen flex-col">
      <Header />

      <main className="flex-1">
        {/* ================= HERO + CHECK CONSOLE ================= */}
        <section id="check" className="relative scroll-mt-20 overflow-hidden">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 [background-image:radial-gradient(circle,rgba(28,25,23,0.06)_1px,transparent_1px)] [background-size:24px_24px] [mask-image:radial-gradient(ellipse_70%_60%_at_50%_0%,black,transparent)]"
          />

          <div className="relative mx-auto max-w-6xl px-4 pb-16 pt-14 text-center sm:px-6 sm:pt-20">
            <p className="inline-flex items-center gap-3 rounded-full border border-stone-200 bg-white px-4 py-2 shadow-sm">
              <TrafficDots size="sm" />
              <span className="font-mono text-[10px] font-bold uppercase tracking-[0.3em] text-stone-500">
                Digital safety checkpoint
              </span>
            </p>

            <h1 className="mt-8 text-[2.6rem] font-extrabold leading-[1.03] tracking-tight text-stone-900 sm:text-6xl lg:text-7xl">
              <span className="text-red-600">STOP.</span>{" "}
              <span className="text-amber-600">CHECK</span>
              <br />
              BEFORE YOU ACT<span className="text-emerald-500">.</span>
            </h1>

            <p className="mx-auto mt-6 max-w-xl text-base leading-relaxed text-stone-600 sm:text-lg">
              Before you post, send, share, upload, search, ask or click — check it with FixMP.
            </p>

            {/* CONSOLE */}
            <div className="mx-auto mt-10 max-w-2xl rounded-2xl border border-stone-200 bg-white p-5 text-left shadow-xl shadow-stone-900/5 sm:p-7">
              <label
                htmlFor="main-input"
                className="font-mono text-[11px] font-bold uppercase tracking-[0.2em] text-stone-500"
              >
                What are you about to do?
              </label>

              <form onSubmit={handleSubmit} className="mt-3">
                <div className="flex flex-col gap-3 sm:flex-row">
                  <input
                    id="main-input"
                    ref={inputRef}
                    type="text"
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    placeholder="Tell FixMP what you're about to do..."
                    className="h-14 flex-1 rounded-xl border border-stone-300 bg-stone-50 px-4 text-base text-stone-900 placeholder:text-stone-400 transition-all focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/25"
                  />
                  <button
                    type="submit"
                    className="flex h-14 cursor-pointer items-center justify-center gap-2 rounded-xl bg-stone-900 px-7 text-sm font-bold uppercase tracking-wider text-white shadow-sm transition-all hover:bg-stone-700 active:scale-[0.98]"
                  >
                    Check with FixMP
                    <ScanSearch size={17} />
                  </button>
                </div>
              </form>

              {hint && (
                <p role="alert" className="mt-3 text-sm font-medium text-red-600">
                  {hint}
                </p>
              )}

              {/* Quick actions — large touch targets, mobile-first */}
              <div className="mt-5 border-t border-stone-200 pt-5">
                <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-stone-400">
                  or start with
                </p>
                <div className="mt-3 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
                  {quickActions.map((a) => (
                    <button
                      key={a.label}
                      onClick={() =>
                        a.href ? router.push(a.href) : alert("Voice input is on the roadmap. While we're in testing, please type or paste instead.")
                      }
                      className="flex h-12 cursor-pointer items-center justify-center gap-2 rounded-xl border border-stone-200 bg-white px-4 text-sm font-semibold text-stone-700 transition-all hover:border-amber-400 hover:text-amber-700 active:scale-95"
                    >
                      <a.icon size={16} aria-hidden="true" />
                      {a.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* INSTANT LOCAL VERDICT — the engine runs in your browser */}
            {preview && risk && (
              <div
                aria-live="polite"
                className="mx-auto mt-6 max-w-2xl animate-[fadeUp_0.3s_ease-out] rounded-2xl border border-stone-200 bg-white p-5 text-left shadow-lg shadow-stone-900/5 sm:p-7"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 font-mono text-[11px] font-bold uppercase tracking-[0.15em] ${risk.pill}`}>
                    <span className={`h-2 w-2 rounded-full ${risk.dot}`} aria-hidden="true" />
                    {preview.statusText}
                  </span>
                  <button
                    onClick={resetPreview}
                    className="flex cursor-pointer items-center gap-1.5 text-xs font-semibold text-stone-500 transition-colors hover:text-stone-900"
                  >
                    <RotateCcw size={13} /> Clear
                  </button>
                </div>

                <p className="mt-3 text-stone-700">{preview.summary}</p>

                {preview.findings.length > 0 && (
                  <ul className="mt-4 space-y-3.5">
                    {preview.findings.map((f) => (
                      <li key={f.id} className="flex gap-3">
                        <span
                          aria-hidden="true"
                          className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${severityStyles[f.severity].dot}`}
                        />
                        <div>
                          <p className="font-bold text-stone-900">
                            {f.category}
                            {f.count && f.count > 1 ? ` (${f.count} found)` : ""}
                            <span className="ml-2 font-mono text-[10px] font-bold uppercase tracking-widest text-stone-400">
                              {severityStyles[f.severity].label}
                            </span>
                          </p>
                          <p className="text-sm text-stone-600">{f.description}</p>
                          <p className="mt-0.5 font-mono text-[11px] text-stone-400">
                            detected: {f.evidence}
                          </p>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}

                {preview.findings.length === 0 && (
                  <p className="mt-4 flex items-start gap-2 text-sm text-emerald-700">
                    <CheckCircle2 size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
                    {preview.do}
                  </p>
                )}

                {safer && (
                  <div className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50/60 p-4">
                    <p className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-emerald-700">
                      Safer version
                    </p>
                    <p className="mt-2 break-words font-mono text-sm leading-relaxed text-stone-800">
                      {safer}
                    </p>
                  </div>
                )}

                <div className="mt-5 flex flex-col gap-3 border-t border-stone-200 pt-4 sm:flex-row sm:items-center sm:justify-between">
                  <Link
                    href={`/check/ai?q=${encodeURIComponent(original)}`}
                    className="inline-flex items-center gap-2 text-sm font-bold text-stone-900 underline-offset-4 hover:text-amber-700 hover:underline"
                  >
                    Open the full check <ArrowRight size={15} />
                  </Link>
                  <p className="font-mono text-[10px] uppercase tracking-[0.15em] text-stone-400">
                    Instant local scan — nothing sent anywhere
                  </p>
                </div>

                <p className="mt-3 text-xs leading-relaxed text-stone-400">
                  {preview.limitations}
                </p>
              </div>
            )}

            {/* Trust row */}
            <div className="mt-8 flex flex-wrap items-center justify-center gap-x-7 gap-y-2 font-mono text-[10px] uppercase tracking-[0.2em] text-stone-500">
              <span className="flex items-center gap-1.5"><ShieldCheck size={13} className="text-emerald-600" aria-hidden="true" /> No sign-up</span>
              <span className="flex items-center gap-1.5"><EyeOff size={13} className="text-amber-600" aria-hidden="true" /> Nothing stored</span>
              <span className="flex items-center gap-1.5"><FlaskConical size={13} className="text-blue-600" aria-hidden="true" /> Free while testing</span>
            </div>
          </div>
        </section>

        {/* ================= TICKER ================= */}
        <div aria-hidden="true" className="overflow-hidden border-y border-stone-200 bg-white py-3">
          <div className="flex w-max animate-[marquee_30s_linear_infinite]">
            {[0, 1].map((copy) => (
              <div key={copy} className="flex shrink-0 items-center">
                {[...tickerItems, ...tickerItems].map((item, i) => (
                  <span
                    key={`${copy}-${i}`}
                    className="flex items-center font-mono text-[11px] font-semibold uppercase tracking-[0.3em] text-stone-400"
                  >
                    <span className="px-6">{item}</span>
                    <span className="text-amber-500">◆</span>
                  </span>
                ))}
              </div>
            ))}
          </div>
        </div>

        {/* ================= THE CHECKS ================= */}
        <section id="tools" className="scroll-mt-20 py-16 sm:py-24">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <SectionLabel>01 — The checks</SectionLabel>
                <h2 className="mt-3 text-3xl font-extrabold tracking-tight text-stone-900 sm:text-4xl">
                  WHAT ARE YOU ABOUT TO DO?
                </h2>
              </div>
              <p className="max-w-sm text-sm leading-relaxed text-stone-500 sm:text-right">
                Six doors, one rule: nothing goes out until it's been through a checkpoint.
              </p>
            </div>

            <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {tools.map((tool, i) => (
                <ToolCard key={tool.title} {...tool} index={i} />
              ))}
            </div>
          </div>
        </section>

        <HazardDivider />

        {/* ================= HOW IT WORKS ================= */}
        <section id="how" className="scroll-mt-20 bg-white py-16 sm:py-24">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <SectionLabel>02 — How it works</SectionLabel>
            <h2 className="mt-3 text-3xl font-extrabold tracking-tight text-stone-900 sm:text-4xl">
              THREE STEPS. THIRTY SECONDS.
            </h2>

            <div className="mt-12 grid items-start gap-12 lg:grid-cols-2">
              <ol className="space-y-8">
                {steps.map((step) => (
                  <li key={step.num} className="flex gap-5">
                    <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-stone-200 bg-stone-50 font-mono text-sm font-bold text-amber-600">
                      {step.num}
                    </span>
                    <div>
                      <h3 className="text-lg font-extrabold tracking-tight text-stone-900">
                        {step.title}
                      </h3>
                      <p className="mt-1.5 text-sm leading-relaxed text-stone-600">{step.body}</p>
                    </div>
                  </li>
                ))}
              </ol>

              {/* Example verdict — shows the product at a glance */}
              <div className="rounded-2xl border border-stone-200 bg-stone-50 p-6 shadow-xl shadow-stone-900/5 sm:p-7">
                <p className="font-mono text-[10px] font-bold uppercase tracking-[0.25em] text-stone-400">
                  Example result
                </p>
                <span className="mt-3 inline-flex items-center gap-2 rounded-full bg-amber-100 px-3 py-1.5 font-mono text-[11px] font-bold uppercase tracking-[0.15em] text-amber-700">
                  <span className="h-2 w-2 rounded-full bg-amber-500" aria-hidden="true" />
                  Pause before sharing
                </span>
                <p className="mt-3 text-stone-700">We found 2 things to check.</p>

                <ul className="mt-4 space-y-2.5 text-sm">
                  <li className="flex gap-2.5">
                    <span aria-hidden="true" className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-red-500" />
                    <span><strong className="text-stone-900">Phone number</strong> — your phone number is visible in the text.</span>
                  </li>
                  <li className="flex gap-2.5">
                    <span aria-hidden="true" className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-amber-500" />
                    <span><strong className="text-stone-900">Email address</strong> — an email address is included.</span>
                  </li>
                </ul>

                <div className="mt-5 space-y-2 border-t border-stone-200 pt-4 text-sm">
                  <p><strong className="text-red-600">🚫 DON'T</strong> <span className="text-stone-600">— share it as it is.</span></p>
                  <p><strong className="text-amber-600">✅ DO</strong> <span className="text-stone-600">— use the safer version below.</span></p>
                  <p><strong className="text-stone-900">➡️ NEXT</strong> <span className="text-stone-600">— run the check again after editing.</span></p>
                </div>

                <div className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50/60 p-4">
                  <p className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-emerald-700">
                    Safer version
                  </p>
                  <p className="mt-2 font-mono text-sm text-stone-800">
                    "Hey! Landing tomorrow evening — call me when you land."
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ================= PRIVACY ================= */}
        <section id="privacy" className="scroll-mt-20 px-4 py-16 sm:px-6 sm:py-24">
          <div className="mx-auto max-w-6xl rounded-3xl bg-stone-900 px-6 py-14 text-center sm:px-12">
            <h2 className="text-3xl font-extrabold tracking-tight text-stone-50 sm:text-4xl">
              PRIVATE <span className="text-amber-400">BY DESIGN.</span>
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-stone-400">
              FixMP is built for things you'd normally never paste anywhere. So it handles your input the way it should.
            </p>

            <div className="mt-10 grid gap-8 text-left sm:grid-cols-3">
              <div>
                <h3 className="font-extrabold text-stone-100">No account</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-stone-400">
                  Basic checks work without signing up. Nothing to create, nothing to leak.
                </p>
              </div>
              <div>
                <h3 className="font-extrabold text-stone-100">Minimal by default</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-stone-400">
                  Your content is processed, then deleted. We don't build profiles on you.
                </p>
              </div>
              <div>
                <h3 className="font-extrabold text-stone-100">Yours stays yours</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-stone-400">
                  We never sell or share what you check. The privacy page states exactly what happens, in plain words.
                </p>
              </div>
            </div>

            <p className="mt-10 font-mono text-[10px] uppercase tracking-[0.25em] text-stone-500">
              While in testing: everything runs in your browser — nothing leaves your device
            </p>
          </div>
        </section>

        {/* ================= FINAL CTA ================= */}
        <section className="px-4 pb-20 pt-4 text-center sm:px-6">
          <h2 className="text-3xl font-extrabold tracking-tight text-stone-900 sm:text-5xl">
            THE INTERNET HAS NO <span className="text-amber-600">UNDO BUTTON.</span>
          </h2>
          <p className="mx-auto mt-4 max-w-md text-stone-600">
            One quick check turns "I should have checked first" into "glad I checked."
          </p>
          <div className="mt-8 flex flex-col items-center gap-4">
            <a
              href="#check"
              className="rounded-xl bg-amber-400 px-8 py-4 text-sm font-bold uppercase tracking-wider text-stone-900 shadow-sm transition-all hover:bg-amber-300 active:scale-[0.98]"
            >
              Check with FixMP
            </a>
            <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-stone-400">
              Free · No sign-up · ~30 seconds
            </p>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}