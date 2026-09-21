import type { Metadata } from "next";
import Link from "next/link";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { SectionLabel, TrafficDots } from "@/components/brand";
import { ArrowRight, FileInput, ScanSearch, BrainCircuit, Gauge, ClipboardCheck, ShieldCheck } from "lucide-react";

export const metadata: Metadata = {
  title: "How it works",
  description:
    "What happens when you check something with FixMP — from paste to verdict in about thirty seconds.",
};

const pipeline = [
  {
    icon: FileInput,
    step: "01",
    title: "You hand over the thing",
    body: "The post you're about to publish, the prompt for a chatbot, the link someone sent, the photo you're about to upload. No account, no forms.",
  },
  {
    icon: ScanSearch,
    step: "02",
    title: "Instant pattern checks run first",
    body: "Phone numbers, emails, passwords, API keys, one-time codes, card numbers, ID numbers — found by fast, deterministic checks. Cheap, private, immediate.",
  },
  {
    icon: BrainCircuit,
    step: "03",
    title: "Deeper analysis where it earns its place",
    body: "For context that patterns can't judge — tone, backgrounds, lookalike domains — FixMP adds AI review. Only where it adds something. Never for show.",
  },
  {
    icon: Gauge,
    step: "04",
    title: "Everything gets one of three verdicts",
    body: "High risk (shouldn't leave your device), review (probably unnecessary), or clear (no obvious red flags). No scare tactics, no false alarms.",
  },
  {
    icon: ClipboardCheck,
    step: "05",
    title: "You get the five-line answer",
    body: "DON'T, CHECK, DO, WHY, NEXT — a clear verdict with a safer version where possible, and the honest limits of what was checked.",
  },
];

const verdictParts = [
  { emoji: "🚫", label: "DON'T", body: "The one thing to avoid right now, stated plainly." },
  { emoji: "⚠️", label: "CHECK", body: "What specifically needs your attention before you act." },
  { emoji: "✅", label: "DO", body: "The safer way to do what you were about to do." },
  { emoji: "🔍", label: "WHY", body: "The reasoning in plain language. No jargon, no lectures." },
  { emoji: "➡️", label: "NEXT", body: "Your concrete next step — edit, redact, verify, or go." },
];

const honesty = [
  "Never \"this is 100% safe\" — no checker can promise that, and one that does is lying to you.",
  "Never silent certainty — every result states what the checks looked at and what they could miss.",
  "Never stored longer than needed — your content is processed for the check, not kept to build profiles.",
  "Never a replacement for your judgement — FixMP is the second pair of eyes, not the decision.",
];

export default function HowItWorksPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <Header />

      <main className="flex-1">
        {/* Hero */}
        <section className="mx-auto max-w-6xl px-4 pb-14 pt-16 sm:px-6 sm:pt-20">
          <SectionLabel>How it works</SectionLabel>
          <h1 className="mt-4 max-w-3xl text-4xl font-extrabold tracking-tight text-stone-900 sm:text-6xl">
            FROM PASTE TO VERDICT IN{" "}
            <span className="text-amber-600">THIRTY SECONDS.</span>
          </h1>
          <p className="mt-5 max-w-2xl text-lg leading-relaxed text-stone-600">
            FixMP isn&apos;t a chatbot with a website on top. It&apos;s a checking system with a
            fixed pipeline — the same structure behind every check, for every tool.
          </p>
        </section>

        {/* Pipeline */}
        <section className="mx-auto max-w-6xl px-4 pb-16 sm:px-6">
          <div className="overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm">
            {pipeline.map((stage, i) => (
              <div
                key={stage.step}
                className={`flex flex-col gap-4 p-6 sm:flex-row sm:items-start sm:gap-6 sm:p-8 ${
                  i > 0 ? "border-t border-stone-200" : ""
                }`}
              >
                <div className="flex items-center gap-4 sm:w-56 sm:shrink-0">
                  <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-amber-100 text-amber-700">
                    <stage.icon size={22} aria-hidden="true" />
                  </span>
                  <span className="font-mono text-sm font-bold text-stone-400">{stage.step}</span>
                </div>
                <div>
                  <h2 className="text-lg font-extrabold tracking-tight text-stone-900">
                    {stage.title}
                  </h2>
                  <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-stone-600">
                    {stage.body}
                  </p>
                </div>
              </div>
            ))}
          </div>
          <p className="mt-4 text-center font-mono text-[10px] uppercase tracking-[0.2em] text-stone-400">
            Test build: stages 1, 2, 4 and 5 are live. AI analysis (stage 3) is switched off.
          </p>
        </section>

        {/* Result anatomy */}
        <section className="border-y border-stone-200 bg-white py-16 sm:py-20">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <SectionLabel>The result</SectionLabel>
            <h2 className="mt-3 text-3xl font-extrabold tracking-tight text-stone-900 sm:text-4xl">
              FIVE LINES. EVERY TIME.
            </h2>
            <p className="mt-4 max-w-2xl text-stone-600">
              Every FixMP result follows the same shape, so you never have to re-learn it:
            </p>

            <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
              {verdictParts.map((part) => (
                <div
                  key={part.label}
                  className="rounded-2xl border border-stone-200 bg-stone-50 p-5"
                >
                  <p className="text-2xl" aria-hidden="true">{part.emoji}</p>
                  <h3 className="mt-3 font-mono text-sm font-bold uppercase tracking-[0.15em] text-stone-900">
                    {part.label}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-stone-600">{part.body}</p>
                </div>
              ))}
            </div>

            <div className="mt-10 flex justify-center">
              <Link
                href="/check/ai"
                className="inline-flex items-center gap-2 rounded-xl bg-stone-900 px-7 py-3.5 text-sm font-bold uppercase tracking-wider text-white transition-all hover:bg-stone-700 active:scale-[0.98]"
              >
                Try a check now <ArrowRight size={16} />
              </Link>
            </div>
          </div>
        </section>

        {/* Honesty section */}
        <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
          <div className="flex items-center gap-3">
            <TrafficDots />
            <SectionLabel>The honesty rules</SectionLabel>
          </div>
          <h2 className="mt-3 text-3xl font-extrabold tracking-tight text-stone-900 sm:text-4xl">
            WHAT FIXMP WILL <span className="text-red-600">NEVER</span> TELL YOU
          </h2>

          <ul className="mt-8 grid gap-4 sm:grid-cols-2">
            {honesty.map((rule) => (
              <li
                key={rule}
                className="flex gap-3 rounded-xl border border-stone-200 bg-white p-5 text-sm leading-relaxed text-stone-700"
              >
                <ShieldCheck size={18} className="mt-0.5 shrink-0 text-emerald-600" aria-hidden="true" />
                {rule}
              </li>
            ))}
          </ul>
        </section>
      </main>

      <Footer />
    </div>
  );
}