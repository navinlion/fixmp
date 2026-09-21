"use client";

import { useState } from "react";
import { Check, Copy, Flag, Info, RotateCcw, Server, ThumbsDown, ThumbsUp } from "lucide-react";
import type { Severity, Verdict } from "@/types/check";

const riskStyles: Record<Verdict["riskLevel"], { banner: string; chip: string; dot: string }> = {
  stop: { banner: "border-red-200 bg-red-50", chip: "bg-red-100 text-red-700", dot: "bg-red-500" },
  review: { banner: "border-amber-200 bg-amber-50", chip: "bg-amber-100 text-amber-700", dot: "bg-amber-500" },
  clear: { banner: "border-emerald-200 bg-emerald-50", chip: "bg-emerald-100 text-emerald-700", dot: "bg-emerald-500" },
};

const sevDot: Record<Severity, string> = { high: "bg-red-500", medium: "bg-amber-500", low: "bg-emerald-500" };
const sevLabel: Record<Severity, string> = { high: "HIGH RISK", medium: "REVIEW", low: "LOW RISK" };

const framework = [
  { key: "dont", icon: "🚫", label: "Don't", cls: "text-red-600" },
  { key: "check", icon: "⚠️", label: "Check", cls: "text-amber-600" },
  { key: "do", icon: "✅", label: "Do", cls: "text-emerald-600" },
  { key: "why", icon: "🔍", label: "Why", cls: "text-stone-900" },
  { key: "next", icon: "➡️", label: "Next", cls: "text-stone-900" },
] as const;

interface VerdictCardProps {
  verdict: Verdict;
  onReset?: () => void;
}

export default function VerdictCard({ verdict, onReset }: VerdictCardProps) {
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);
  const [feedback, setFeedback] = useState<null | "up" | "down" | "wrong">(null);
  const s = riskStyles[verdict.riskLevel];

  async function copySafer() {
    if (!verdict.saferVersion) return;
    try {
      await navigator.clipboard.writeText(verdict.saferVersion);
      setCopied(true);
      setCopyFailed(false);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopyFailed(true);
    }
  }

  return (
    <div aria-live="polite" className="space-y-5">
      {/* Verdict banner */}
      <div className={`rounded-2xl border p-5 sm:p-6 ${s.banner}`}>
        <span
          className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 font-mono text-[11px] font-bold uppercase tracking-[0.15em] ${s.chip}`}
        >
          <span aria-hidden="true" className={`h-2 w-2 rounded-full ${s.dot}`} />
          {verdict.statusText}
        </span>
        <p className="mt-3 text-lg font-bold leading-snug text-stone-900 sm:text-xl">{verdict.summary}</p>
        <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.2em] text-stone-500">
          {verdict.tool} · confidence {Math.round(verdict.confidence * 100)}%
        </p>
      </div>

      {/* Findings */}
      {verdict.findings.length > 0 && (
        <section className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm sm:p-6">
          <h3 className="font-mono text-[11px] font-bold uppercase tracking-[0.2em] text-stone-500">
            What we found ({verdict.findings.length})
          </h3>
          <ul className="mt-4 space-y-5">
            {verdict.findings.map((f) => (
              <li key={f.id} className="border-l-2 border-stone-200 pl-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span aria-hidden="true" className={`h-2.5 w-2.5 rounded-full ${sevDot[f.severity]}`} />
                  <p className="font-bold text-stone-900">
                    {f.category}
                    {f.count && f.count > 1 ? ` ×${f.count}` : ""}
                  </p>
                  <span className="rounded bg-stone-100 px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase tracking-widest text-stone-500">
                    {sevLabel[f.severity]}
                  </span>
                </div>
                <p className="mt-1 text-sm text-stone-600">{f.description}</p>
                {f.evidence && (
                  <p className="mt-2 break-all rounded-lg bg-stone-50 px-2.5 py-1.5 font-mono text-[11px] text-stone-500">
                    detected: {f.evidence}
                  </p>
                )}
                <p className="mt-2 text-sm text-stone-800">
                  <span className="font-bold text-amber-600">Fix: </span>
                  {f.action}
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Safer version */}
      {verdict.saferVersion && (
        <section className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-5 sm:p-6">
          <div className="flex items-center justify-between gap-3">
            <h3 className="font-mono text-[11px] font-bold uppercase tracking-[0.2em] text-emerald-700">
              ✨ Safer version
            </h3>
            <button
              onClick={copySafer}
              className={`flex cursor-pointer items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-bold transition-all active:scale-95 ${
                copied
                  ? "border-emerald-300 bg-emerald-100 text-emerald-700"
                  : "border-stone-300 bg-white text-stone-700 hover:border-emerald-400 hover:text-emerald-700"
              }`}
            >
              {copied ? <Check size={13} /> : <Copy size={13} />}
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
          <pre className="mt-3 overflow-x-auto whitespace-pre-wrap break-words rounded-xl border border-emerald-200 bg-white p-4 font-mono text-sm leading-relaxed text-stone-800">
            {verdict.saferVersion}
          </pre>
          {copyFailed && (
            <p className="mt-2 text-xs text-red-600">Couldn&apos;t copy automatically — please select and copy manually.</p>
          )}
          <p className="mt-3 text-xs leading-relaxed text-stone-500">
            This version removes the sensitive information FixMP identified. It is not a guarantee of safety.
          </p>
        </section>
      )}

      {/* The five-line answer */}
      <section className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm sm:p-6">
        <h3 className="font-mono text-[11px] font-bold uppercase tracking-[0.2em] text-stone-500">
          Your action plan
        </h3>
        <dl className="mt-2 divide-y divide-stone-100">
          {framework.map((row) => (
            <div key={row.key} className="flex flex-col gap-1 py-3.5 sm:flex-row sm:gap-4">
              <dt
                className={`flex shrink-0 items-center gap-2 font-mono text-xs font-bold uppercase tracking-widest sm:w-32 ${row.cls}`}
              >
                <span aria-hidden="true">{row.icon}</span> {row.label}
              </dt>
              <dd className="text-sm leading-relaxed text-stone-700">{verdict[row.key]}</dd>
            </div>
          ))}
        </dl>
      </section>

      {/* Processing disclosure — what actually happened to this content */}
      <p className="flex items-start gap-2 px-1 text-xs leading-relaxed text-stone-500">
        <Server size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
        {verdict.aiUsed
          ? "For this check, your content was processed on FixMP's server and by our AI provider (Google Gemini). Nothing was stored."
          : "For this check, your content was processed on FixMP's server using pattern checks. Nothing was stored."}
      </p>

      {/* Limitations */}
      <p className="flex items-start gap-2 px-1 text-xs leading-relaxed text-stone-400">
        <Info size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
        {verdict.limitations}
      </p>

      {/* Feedback */}
      <div className="rounded-2xl border border-stone-200 bg-white p-4">
        {feedback === null ? (
          <div className="flex flex-wrap items-center gap-2">
            <p className="mr-1 text-sm font-semibold text-stone-700">Was this check helpful?</p>
            {(
              [
                { v: "up", icon: ThumbsUp, label: "Helpful" },
                { v: "down", icon: ThumbsDown, label: "Not helpful" },
                { v: "wrong", icon: Flag, label: "Something's wrong" },
              ] as const
            ).map((b) => (
              <button
                key={b.v}
                onClick={() => setFeedback(b.v)}
                className="flex cursor-pointer items-center gap-1.5 rounded-full border border-stone-200 px-3 py-1.5 text-xs font-semibold text-stone-600 transition-all hover:border-amber-400 hover:text-amber-700 active:scale-95"
              >
                <b.icon size={13} aria-hidden="true" /> {b.label}
              </button>
            ))}
          </div>
        ) : (
          <p className="text-sm text-emerald-700">
            Thanks — noted.{" "}
            {feedback === "wrong" && "Wrong results are the most useful feedback during testing. "}
            <span className="text-stone-400">(In this test build, feedback stays on your screen.)</span>
          </p>
        )}
      </div>

      {onReset && (
        <button
          onClick={onReset}
          className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl border border-stone-300 px-6 py-3.5 text-sm font-bold uppercase tracking-wider text-stone-700 transition-all hover:border-stone-400 hover:bg-stone-100 active:scale-[0.98] sm:w-auto"
        >
          <RotateCcw size={15} /> Run another check
        </button>
      )}
    </div>
  );
}