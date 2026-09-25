"use client";

import { useState } from "react";
import { AlertTriangle, ChevronDown, ExternalLink, Eye, MapPin, ShieldCheck, X } from "lucide-react";
import type { LocalPhotoReport, LocalFinding } from "@/lib/photo-local-engine";
import { TEST_MODE } from "@/config/flags";
import Link from "next/link";

const sevDot: Record<string, string> = { high: "bg-red-500", medium: "bg-amber-500", low: "bg-emerald-500" };

function pct(n?: number): string {
  return typeof n === "number" ? `${Math.round(n * 100)}%` : "—";
}

function FindingRow({ f, onHighlight }: { f: LocalFinding; onHighlight: (f: LocalFinding | null) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <li className="rounded-xl border border-stone-200 bg-white p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span aria-hidden="true" className={`h-2.5 w-2.5 rounded-full ${sevDot[f.severity]}`} />
        <p className="font-bold text-stone-900">{f.category}</p>
        {f.evidence && (
          <span className="rounded bg-stone-100 px-1.5 py-0.5 font-mono text-[11px] text-stone-500">{f.evidence}</span>
        )}
      </div>
      <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 font-mono text-[10px] uppercase tracking-widest text-stone-500">
        <span>detection {pct(f.detectionConfidence)}</span>
        {f.readingConfidence !== undefined && <span>reading {pct(f.readingConfidence)}</span>}
        <span>source: {f.source}</span>
      </div>
      <p className="mt-1.5 text-sm text-stone-600">{f.description}</p>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        {f.region && (
          <button
            onClick={() => onHighlight(f)}
            className="flex cursor-pointer items-center gap-1 text-xs font-bold text-amber-700 hover:text-amber-800"
          >
            <MapPin size={13} aria-hidden="true" /> View region
          </button>
        )}
        {f.type === "qr" && f.value && /^https?:\/\//i.test(f.value.trim()) && (
          <Link
            href={`/check/link?url=${encodeURIComponent(f.value.trim())}`}
            className="flex cursor-pointer items-center gap-1 text-xs font-bold text-blue-700 hover:text-blue-800"
          >
            <ExternalLink size={13} aria-hidden="true" /> Verify destination
          </Link>
        )}
        <button
          onClick={() => setOpen((o) => !o)}
          className="flex cursor-pointer items-center gap-1 text-xs font-semibold text-stone-500 hover:text-stone-900"
        >
          <ChevronDown size={13} className={`transition-transform ${open ? "rotate-180" : ""}`} /> Details
        </button>
      </div>
      {open && (
        <div className="mt-2 rounded-lg bg-stone-50 p-3 text-sm text-stone-600">
          <p><strong className="text-stone-700">Recommended:</strong> {f.action}</p>
        </div>
      )}
    </li>
  );
}

function DetectorLine({ name, result }: { name: string; result: { status: string; findings: unknown[]; error?: string } }) {
  if (result.status === "error") {
    return (
      <p className="flex items-start gap-2 text-sm text-amber-700">
        <AlertTriangle size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
        <span><strong>{name}: could not complete</strong> — {result.error} <em>(a failed check is never reported as “nothing found”)</em></span>
      </p>
    );
  }
  const n = result.findings.length;
  return (
    <p className="flex items-center gap-2 text-sm text-stone-600">
      <ShieldCheck size={14} className="shrink-0 text-emerald-600" aria-hidden="true" />
      <span><strong>{name}:</strong> {n === 0 ? "none detected" : `${n} finding${n === 1 ? "" : "s"}`}</span>
    </p>
  );
}

interface Props {
  report: LocalPhotoReport;
  previewUrl: string;
}

export default function LocalPhotoReport({ report, previewUrl }: Props) {
  const [highlight, setHighlight] = useState<LocalFinding | null>(null);
  const [diagOpen, setDiagOpen] = useState(false);

  return (
    <section aria-live="polite" className="space-y-5">
      {/* Header */}
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50/50 p-5">
        <p className="flex items-center gap-2 font-mono text-[11px] font-bold uppercase tracking-[0.2em] text-emerald-700">
          <ShieldCheck size={15} aria-hidden="true" /> FixMP local analysis — completed on your device
        </p>
        <p className="mt-2 text-stone-700">
          {report.findings.length > 0
            ? `${report.findings.length} finding${report.findings.length === 1 ? "" : "s"} across all local detectors.`
            : "All local detectors ran. No findings from the detectors that completed."}
        </p>
      </div>

      {/* Image + region highlight */}
      <div className="relative overflow-hidden rounded-2xl border border-stone-200 bg-black">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={previewUrl} alt="Analyzed photo" className="max-h-[380px] w-full object-contain" />
        {highlight?.region && (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute border-[3px] border-amber-400 bg-amber-400/20 shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]"
            style={{
              left: `${highlight.region.xMin / 10}%`,
              top: `${highlight.region.yMin / 10}%`,
              width: `${((highlight.region.xMax - highlight.region.xMin) / 1000) * 100}%`,
              height: `${((highlight.region.yMax - highlight.region.yMin) / 1000) * 100}%`,
            }}
          />
        )}
        {highlight && (
          <button
            onClick={() => setHighlight(null)}
            className="absolute right-3 top-3 rounded-full bg-black/70 p-2 text-white"
            aria-label="Clear region highlight"
          >
            <X size={16} />
          </button>
        )}
      </div>

      {/* Findings (evidence map) */}
      {report.findings.length > 0 ? (
        <ul className="space-y-3">
          {report.findings.map((f, i) => (
            <FindingRow key={`${f.type}-${i}`} f={f} onHighlight={setHighlight} />
          ))}
        </ul>
      ) : (
        <p className="rounded-xl border border-stone-200 bg-white p-4 text-sm text-stone-600">
          No findings from the detectors that completed. See per-detector status below — and
          remember what each detector covers.
        </p>
      )}

      {/* Per-detector status — the "Not detected" vs "Could not analyze" line */}
      <div className="rounded-2xl border border-stone-200 bg-white p-5">
        <p className="font-mono text-[11px] font-bold uppercase tracking-[0.2em] text-stone-500">
          Detector status
        </p>
        <div className="mt-3 space-y-2">
          <DetectorLine name="Text (OCR)" result={report.detectors.ocr} />
          <DetectorLine name="Handwriting / ink" result={report.detectors.ink} />
          <DetectorLine name="QR codes" result={report.detectors.qr} />
          <DetectorLine name="Metadata (EXIF/GPS)" result={report.detectors.metadata} />
        </div>
        <p className="mt-3 text-xs leading-relaxed text-stone-400">
          “None detected” means the detector ran and found nothing. “Could not complete” means it
          failed — FixMP never reports a failure as an all-clear.
        </p>
      </div>

      {/* Dev diagnostics — TEST BUILD only */}
      {TEST_MODE && (
        <div className="rounded-xl border border-dashed border-stone-300 p-4">
          <button
            onClick={() => setDiagOpen((o) => !o)}
            className="flex cursor-pointer items-center gap-1.5 font-mono text-[10px] font-bold uppercase tracking-widest text-stone-400 hover:text-stone-700"
          >
            <Eye size={12} /> {diagOpen ? "Hide" : "Show"} developer diagnostics
          </button>
          {diagOpen && (
            <div className="mt-3 space-y-2 font-mono text-[11px] text-stone-500">
              {Object.entries(report.detectors).map(([name, r]) => (
                <div key={name} className="rounded-lg bg-stone-50 p-2.5">
                  <p className="font-bold text-stone-700">
                    {r.detector}: {r.status.toUpperCase()}
                    {r.error ? ` — ${r.error}` : ""}
                  </p>
                  {Object.entries(r.diagnostics).map(([k, v]) => (
                    <p key={k}>{k}: {String(v)}</p>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}