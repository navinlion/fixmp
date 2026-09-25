"use client";

import { useEffect, useRef, useState } from "react";
import { AlertTriangle, ChevronDown, ExternalLink, Eye, MapPin, ShieldCheck, X } from "lucide-react";
import type { LocalPhotoReport, LocalFinding } from "@/lib/photo-local-engine";
import { TEST_MODE } from "@/config/flags";
import Link from "next/link";
import ImageRedactor from "@/components/ImageRedactor";
import type { VerdictFinding } from "@/types/check";

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
      {f.value && f.type !== "qr" && (
        <p className="mt-1.5 break-all rounded-lg bg-stone-50 px-2.5 py-1.5 font-mono text-[11px] text-stone-700">
          content read: {f.value}
        </p>
      )}
      {f.type === "qr" && f.value && (
        <p className="mt-1.5 break-all rounded-lg bg-stone-50 px-2.5 py-1.5 font-mono text-[11px] text-stone-700">
          decoded: {f.value.length > 120 ? f.value.slice(0, 120) + "…" : f.value}
        </p>
      )}
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
  /** Raw file, needed to generate the safe-to-share copy. */
  originalFile: File;
}

/**
 * BUGFIX: the highlight overlay used to be positioned as a naive percentage
 * of the *container* div. Because the <img> uses object-contain inside a
 * fixed-height box, any photo whose aspect ratio doesn't match the container
 * gets letterboxed — empty space above/below or left/right — and that gap
 * was never accounted for. The box would land wherever the raw percentage
 * said, which is disconnected from where the pixels actually are. This is
 * worse the more the container and photo aspect ratios diverge (very
 * noticeable on wide desktop windows with portrait photos).
 *
 * This hook computes the real rendered image rect (in px, relative to the
 * <img> element's own box) so overlays can be positioned against it instead.
 */
function useContainRect(imgRef: React.RefObject<HTMLImageElement>) {
  const [rect, setRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  useEffect(() => {
    const img = imgRef.current;
    if (!img) return;
    const compute = () => {
      if (!img.naturalWidth || !img.naturalHeight) return;
      const boxW = img.clientWidth, boxH = img.clientHeight;
      if (!boxW || !boxH) return;
      const boxRatio = boxW / boxH;
      const imgRatio = img.naturalWidth / img.naturalHeight;
      let w: number, h: number, x: number, y: number;
      if (imgRatio > boxRatio) {
        w = boxW; h = boxW / imgRatio; x = 0; y = (boxH - h) / 2;
      } else {
        h = boxH; w = boxH * imgRatio; y = 0; x = (boxW - w) / 2;
      }
      setRect({ x, y, w, h });
    };
    if (img.complete) compute();
    img.addEventListener("load", compute);
    const ro = new ResizeObserver(compute);
    ro.observe(img);
    return () => {
      img.removeEventListener("load", compute);
      ro.disconnect();
    };
  }, [imgRef]);
  return rect;
}

/** Findings with a region can be auto-removed by ImageRedactor. */
function toRemovable(findings: LocalFinding[]) {
  return findings
    .filter((f) => f.region)
    .map((f, i) => ({
      id: `${f.type}-${i}`,
      category: f.category,
      description: f.description,
      severity: f.severity,
      region: f.region!,
    }));
}

/** Findings with no fixed region (nothing to crop/retouch) are listed as manual follow-ups. */
function toNotRemovable(findings: LocalFinding[]): VerdictFinding[] {
  return findings
    .filter((f) => !f.region)
    .map((f, i) => ({
      id: `${f.type}-nr-${i}`,
      category: f.category,
      description: f.description,
      severity: f.severity,
      action: f.action,
    })) as unknown as VerdictFinding[]; // NOTE: confirm this matches your VerdictFinding shape in @/types/check
}

/** Overall share-safety statement, driven by actual finding counts. */
function SafetyVerdict({ findings }: { findings: LocalFinding[] }) {
  const high = findings.filter((f) => f.severity === "high").length;
  const med = findings.filter((f) => f.severity === "medium").length;
  const low = findings.filter((f) => f.severity === "low").length;
  if (findings.length === 0) return null;
  const unsafe = high > 0;
  return (
    <div className={`rounded-xl border p-3 text-sm ${unsafe ? "border-red-300 bg-red-50 text-red-800" : "border-amber-300 bg-amber-50 text-amber-800"}`}>
      {unsafe
        ? <>⚠️ NOT SAFE to post publicly as-is. {findings.length} finding{findings.length === 1 ? "" : "s"} — {high} high-risk{med ? `, ${med} to review` : ""}. Remove flagged items or use the safe copy before posting.</>
        : <>⚠️ REVIEW before posting. {findings.length} finding{findings.length === 1 ? "" : "s"} found — {med} need review{low ? `, ${low} low-risk` : ""}. Nothing here is an automatic all-clear for visible content.</>}
    </div>
  );
}

export default function LocalPhotoReport({ report, previewUrl, originalFile }: Props) {
  const [highlight, setHighlight] = useState<LocalFinding | null>(null);
  const [diagOpen, setDiagOpen] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);
  const imgRect = useContainRect(imgRef);

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
        <img ref={imgRef} src={previewUrl} alt="Analyzed photo" className="max-h-[380px] w-full object-contain" />
        {highlight?.region && imgRect && (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute border-[3px] border-amber-400 bg-amber-400/20 shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]"
            style={{
              left: `${imgRect.x + (highlight.region.xMin / 1000) * imgRect.w}px`,
              top: `${imgRect.y + (highlight.region.yMin / 1000) * imgRect.h}px`,
              width: `${((highlight.region.xMax - highlight.region.xMin) / 1000) * imgRect.w}px`,
              height: `${((highlight.region.yMax - highlight.region.yMin) / 1000) * imgRect.h}px`,
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

      {/* Overall share-safety verdict */}
      <SafetyVerdict findings={report.findings} />

      {/* Scope disclosure — this pass only covers what's listed below */}
      <p className="rounded-xl border border-stone-200 bg-stone-50 px-4 py-3 text-xs leading-relaxed text-stone-500">
        This on-device scan checks <strong>text/handwriting (OCR)</strong>,{" "}
        <strong>QR codes</strong>, and <strong>GPS/EXIF metadata</strong>. It does not check faces,
        reflections, background context, or documents beyond what OCR can read — run a Deep AI
        Check for that.
      </p>

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

      {/* Turn findings into an actual safe-to-share file */}
      <ImageRedactor
        originalFile={originalFile}
        removable={toRemovable(report.findings)}
        notRemovable={toNotRemovable(report.findings)}
      />

      {/* Per-detector status — the "Not detected" vs "Could not analyze" line */}
      <div className="rounded-2xl border border-stone-200 bg-white p-5">
        <p className="font-mono text-[11px] font-bold uppercase tracking-[0.2em] text-stone-500">
          Detector status
        </p>
        <div className="mt-3 space-y-2">
          <DetectorLine name="Text & handwriting regions (local model)" result={report.detectors.text} />
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