"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Download, Loader2, ShieldCheck, Sparkles, Undo2 } from "lucide-react";
import type { Severity, VerdictFinding } from "@/types/check";

const sevDot: Record<Severity, string> = { high: "bg-red-500", medium: "bg-amber-500", low: "bg-emerald-500" };
const FREE_AI_RETOUCHES = 5;
const USAGE_KEY = "fixmp_ai_retouch_used";

type Mode = "standard" | "ai";

interface RemovableFinding {
  id: string;
  category: string;
  description: string;
  severity: Severity;
  region?: { yMin: number; xMin: number; yMax: number; xMax: number };
}

interface ImageRedactorProps {
  originalFile: File | null;
  removable: RemovableFinding[];
  notRemovable: VerdictFinding[];
}

function getUsedCount(): number {
  try {
    return Number(localStorage.getItem(USAGE_KEY) ?? "0") || 0;
  } catch {
    return 0;
  }
}
function setUsedCount(n: number) {
  try {
    localStorage.setItem(USAGE_KEY, String(n));
  } catch {
    /* testing build — allow */
  }
}

export default function ImageRedactor({ originalFile, removable, notRemovable }: ImageRedactorProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set<string>());
  const [mode, setMode] = useState<Mode>("standard");
  const [working, setWorking] = useState(false);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [used, setUsed] = useState(0);
  const urlRef = useRef<string | null>(null);

  const remaining = Math.max(0, FREE_AI_RETOUCHES - used);

  const allSelected = useMemo(
    () => removable.length > 0 && removable.every((f) => selected.has(f.id)),
    [removable, selected]
  );

  useEffect(() => {
    setSelected(new Set(removable.map((f) => f.id)));
    setUsed(getUsedCount());
  }, [removable]);

  useEffect(() => {
    return () => {
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    };
  }, []);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function cropRect(
    region: { yMin: number; xMin: number; yMax: number; xMax: number },
    W: number,
    H: number
  ) {
    const pad = Math.max(24, Math.round(Math.min(W, H) * 0.05));
    const cx = Math.max(0, Math.round((region.xMin / 1000) * W - pad));
    const cy = Math.max(0, Math.round((region.yMin / 1000) * H - pad));
    const cw = Math.min(W - cx, Math.round(((region.xMax - region.xMin) / 1000) * W + pad * 2));
    const ch = Math.min(H - cy, Math.round(((region.yMax - region.yMin) / 1000) * H + pad * 2));
    return { cx, cy, cw, ch };
  }

  const AI_PATCH_MAX_EDGE = 384; // smaller = much faster on CPU; quality still strong

  async function buildPatchAndMask(
    source: HTMLCanvasElement,
    region: { yMin: number; xMin: number; yMax: number; xMax: number },
    W: number,
    H: number
  ): Promise<{ patch: string; mask: string; cx: number; cy: number; cw: number; ch: number } | null> {
    const { cx, cy, cw, ch } = cropRect(region, W, H);
    if (cw < 16 || ch < 16) return null;

    // Downscale large crops for fast CPU inference; result is stretched back on composite
    const scale = Math.min(1, AI_PATCH_MAX_EDGE / Math.max(cw, ch));
    const pw = Math.max(16, Math.round(cw * scale));
    const ph = Math.max(16, Math.round(ch * scale));

    const patch = document.createElement("canvas");
    patch.width = pw;
    patch.height = ph;
    const pctx = patch.getContext("2d");
    if (!pctx) return null;
    pctx.drawImage(source, cx, cy, cw, ch, 0, 0, pw, ph);

    const mask = document.createElement("canvas");
    mask.width = pw;
    mask.height = ph;
    const mctx = mask.getContext("2d");
    if (!mctx) return null;
    mctx.fillStyle = "#000";
    mctx.fillRect(0, 0, pw, ph);

    // Mask coords in patch-local, scaled space
    const mx = Math.max(0, Math.round(((region.xMin / 1000) * W - cx) * scale));
    const my = Math.max(0, Math.round(((region.yMin / 1000) * H - cy) * scale));
    const mw = Math.min(pw - mx, Math.max(4, Math.round(((region.xMax - region.xMin) / 1000) * W * scale)));
    const mh = Math.min(ph - my, Math.max(4, Math.round(((region.yMax - region.yMin) / 1000) * H * scale)));
    const r = Math.max(8, Math.round(Math.min(mw, mh) * 0.15));

    mctx.fillStyle = "#fff";
    mctx.fillRect(Math.max(0, mx - r / 2), Math.max(0, my - r / 2), Math.min(pw, mw + r), Math.min(ph, mh + r));
    mctx.filter = `blur(${Math.round(r / 2)}px)`;
    mctx.drawImage(mask, 0, 0);
    mctx.filter = "none";
    mctx.fillStyle = "#fff";
    mctx.fillRect(mx, my, mw, mh);

    return { patch: patch.toDataURL("image/png"), mask: mask.toDataURL("image/png"), cx, cy, cw, ch };
  }

  /** Standard retouch: deterministic edge-interpolation fill, 100% local. */
  function retouchRegionLocal(
    ctx: CanvasRenderingContext2D,
    source: HTMLCanvasElement,
    region: { yMin: number; xMin: number; yMax: number; xMax: number },
    W: number,
    H: number
  ) {
    const padIn = Math.max(10, Math.round(Math.min(W, H) * 0.02));
    const padOut = padIn * 3;

    const bx = Math.max(0, Math.round((region.xMin / 1000) * W - padOut));
    const by = Math.max(0, Math.round((region.yMin / 1000) * H - padOut));
    const bw = Math.min(W - bx, Math.round(((region.xMax - region.xMin) / 1000) * W + padOut * 2));
    const bh = Math.min(H - by, Math.round(((region.yMax - region.yMin) / 1000) * H + padOut * 2));
    if (bw < 6 || bh < 6) return;

    const ix = Math.max(0, Math.round((region.xMin / 1000) * W - padIn)) - bx;
    const iy = Math.max(0, Math.round((region.yMin / 1000) * H - padIn)) - by;
    const iw = Math.min(bw - ix, Math.round(((region.xMax - region.xMin) / 1000) * W + padIn * 2));
    const ih = Math.min(bh - iy, Math.round(((region.yMax - region.yMin) / 1000) * H + padIn * 2));
    if (iw < 4 || ih < 4) return;

    const work = document.createElement("canvas");
    work.width = bw;
    work.height = bh;
    const wctx = work.getContext("2d");
    if (!wctx) return;
    wctx.drawImage(source, bx, by, bw, bh, 0, 0, bw, bh);

    const idata = wctx.getImageData(0, 0, bw, bh);
    const d = idata.data;
    const idx = (x: number, y: number) => (y * bw + x) * 4;
    const sample = Math.max(4, Math.round(Math.min(W, H) * 0.012));

    const bandAvgX = (y: number, x0: number, x1: number): [number, number, number] | null => {
      const xa = Math.max(0, x0), xb = Math.min(bw, x1);
      let r = 0, g = 0, b = 0, n = 0;
      for (let x = xa; x < xb; x++) { const i = idx(x, y); r += d[i]; g += d[i + 1]; b += d[i + 2]; n++; }
      return n ? [r / n, g / n, b / n] : null;
    };
    const bandAvgY = (x: number, y0: number, y1: number): [number, number, number] | null => {
      const ya = Math.max(0, y0), yb = Math.min(bh, y1);
      let r = 0, g = 0, b = 0, n = 0;
      for (let y = ya; y < yb; y++) { const i = idx(x, y); r += d[i]; g += d[i + 1]; b += d[i + 2]; n++; }
      return n ? [r / n, g / n, b / n] : null;
    };

    for (let y = iy; y < iy + ih; y++) {
      const left = ix > 0 ? bandAvgX(y, ix - sample, ix) : null;
      const right = ix + iw < bw ? bandAvgX(y, ix + iw, ix + iw + sample) : null;
      const L = left ?? right, R = right ?? left;
      if (!L || !R) continue;
      for (let x = ix; x < ix + iw; x++) {
        const t = (x - ix + 0.5) / iw;
        const i = idx(x, y);
        d[i] = L[0] + (R[0] - L[0]) * t;
        d[i + 1] = L[1] + (R[1] - L[1]) * t;
        d[i + 2] = L[2] + (R[2] - L[2]) * t;
        d[i + 3] = 255;
      }
    }
    for (let x = ix; x < ix + iw; x++) {
      const top = iy > 0 ? bandAvgY(x, iy - sample, iy) : null;
      const bottom = iy + ih < bh ? bandAvgY(x, iy + ih, iy + ih + sample) : null;
      const T = top ?? bottom, B = bottom ?? top;
      if (!T || !B) continue;
      for (let y = iy; y < iy + ih; y++) {
        const t = (y - iy + 0.5) / ih;
        const i = idx(x, y);
        d[i] = (d[i] + T[0] + (B[0] - T[0]) * t) / 2;
        d[i + 1] = (d[i + 1] + T[1] + (B[1] - T[1]) * t) / 2;
        d[i + 2] = (d[i + 2] + T[2] + (B[2] - T[2]) * t) / 2;
      }
    }
    wctx.putImageData(idata, 0, 0);

    const feather = Math.max(6, Math.round(padOut * 0.6));
    const mask = document.createElement("canvas");
    mask.width = bw;
    mask.height = bh;
    const mk = mask.getContext("2d");
    if (!mk) return;
    mk.fillStyle = "#000";
    mk.fillRect(ix, iy, iw, ih);
    const edge = (fx0: number, fy0: number, fx1: number, fy1: number, rx: number, ry: number, rw: number, rh: number) => {
      const g = mk.createLinearGradient(fx0, fy0, fx1, fy1);
      g.addColorStop(0, "rgba(0,0,0,0)");
      g.addColorStop(1, "rgba(0,0,0,1)");
      mk.fillStyle = g;
      mk.fillRect(rx, ry, rw, rh);
    };
    const fadeL = Math.min(feather, ix);
    if (fadeL > 0) edge(ix - fadeL, 0, ix, 0, ix - fadeL, iy, fadeL, ih);
    const fadeR = Math.min(feather, bw - (ix + iw));
    if (fadeR > 0) edge(ix + iw, 0, ix + iw + fadeR, 0, ix + iw, iy, fadeR, ih);
    const fadeT = Math.min(feather, iy);
    if (fadeT > 0) edge(0, iy - fadeT, 0, iy, ix, iy - fadeT, iw, fadeT);
    const fadeB = Math.min(feather, bh - (iy + ih));
    if (fadeB > 0) edge(0, iy + ih, 0, iy + ih + fadeB, ix, iy + ih, iw, fadeB);

    wctx.globalCompositeOperation = "destination-in";
    wctx.drawImage(mask, 0, 0);
    wctx.globalCompositeOperation = "source-over";
    ctx.drawImage(work, bx, by);
  }

  async function generateSafeCopy() {
    if (!originalFile || selected.size === 0 || working) return;
    if (mode === "ai" && remaining === 0) {
      setError("You've used all free AI retouches. Standard retouch is still free and private.");
      return;
    }

    setWorking(true);
    setError("");
    setResultUrl(null); // a new attempt invalidates any previous preview

    try {
      const chosen = removable.filter((f) => selected.has(f.id));

      const url = URL.createObjectURL(originalFile);
      const img = new Image();
      img.src = url;
      await img.decode();
      URL.revokeObjectURL(url);

      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("canvas");
      ctx.drawImage(img, 0, 0);

      let aiSucceeded = false;

      for (const f of chosen) {
        if (!f.region) continue;

        if (mode === "ai") {
          const pm = await buildPatchAndMask(canvas, f.region, canvas.width, canvas.height);
          if (!pm) continue;

          const res = await fetch("/api/redact", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ image: pm.patch, mask: pm.mask }),
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || "AI retouch failed. Try Standard retouch.");

          const filled = new Image();
          filled.src = data.image;
          await filled.decode();
          ctx.drawImage(filled, pm.cx, pm.cy, pm.cw, pm.ch);
          aiSucceeded = true;
        } else {
          retouchRegionLocal(ctx, canvas, f.region, canvas.width, canvas.height);
        }
      }

      if (mode === "ai" && aiSucceeded) {
        const n = getUsedCount() + 1;
        setUsedCount(n);
        setUsed(n);
      }

      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/jpeg", 0.92)
      );
      if (!blob) throw new Error("blob");

      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
      const newUrl = URL.createObjectURL(blob);
      urlRef.current = newUrl;
      setResultUrl(newUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't create the safe copy. Please try again.");
    } finally {
      setWorking(false);
    }
  }

  if (removable.length === 0) {
    return notRemovable.length > 0 ? (
      <div className="mt-6 rounded-2xl border border-stone-200 bg-white p-5 sm:p-6">
        <h3 className="font-mono text-[11px] font-bold uppercase tracking-[0.2em] text-stone-500">
          Safe-to-share version
        </h3>
        <p className="mt-3 text-sm text-stone-600">
          This result has no regions that can be auto-removed. Handle these manually:
        </p>
        <ul className="mt-3 space-y-2 text-sm text-stone-600">
          {notRemovable.map((f) => (
            <li key={f.id} className="flex gap-2">
              <span aria-hidden="true" className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${sevDot[f.severity]}`} />
              <span>
                <strong className="text-stone-900">{f.category}</strong> — {f.action}
              </span>
            </li>
          ))}
        </ul>
      </div>
    ) : null;
  }

  return (
    <section className="mt-6 rounded-2xl border border-amber-200 bg-amber-50/50 p-5 sm:p-6">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-700">
          <ShieldCheck size={20} aria-hidden="true" />
        </span>
        <div>
          <h3 className="text-lg font-extrabold tracking-tight text-stone-900">
            Generate a safe-to-share version?
          </h3>
          <p className="mt-1 text-sm leading-relaxed text-stone-600">
            The findings below are removed and the area is rebuilt naturally. Every other pixel
            stays exactly as you took it; your original file is never modified.
          </p>
        </div>
      </div>

      {/* Mode picker */}
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className={`cursor-pointer rounded-xl border p-4 transition-all ${
          mode === "standard" ? "border-amber-500 bg-white shadow-sm" : "border-stone-200 bg-white hover:border-stone-300"
        }`}>
          <input type="radio" name="redact-mode" className="sr-only" checked={mode === "standard"} onChange={() => setMode("standard")} />
          <p className="flex items-center gap-2 text-sm font-bold text-stone-900">
            <ShieldCheck size={15} className="text-emerald-600" aria-hidden="true" /> Standard retouch
          </p>
          <p className="mt-1 text-xs leading-relaxed text-stone-500">
            Free & unlimited · 100% in your browser · nothing uploaded anywhere · clean fill
          </p>
        </label>

        <label className={`cursor-pointer rounded-xl border p-4 transition-all ${
          mode === "ai" ? "border-amber-500 bg-white shadow-sm" : "border-stone-200 bg-white hover:border-stone-300"
        } ${remaining === 0 ? "opacity-60" : ""}`}>
          <input type="radio" name="redact-mode" className="sr-only" checked={mode === "ai"} onChange={() => setMode("ai")} disabled={remaining === 0} />
          <p className="flex items-center gap-2 text-sm font-bold text-stone-900">
            <Sparkles size={15} className="text-amber-600" aria-hidden="true" /> AI natural retouch
            <span className="rounded-full bg-amber-100 px-2 py-0.5 font-mono text-[9px] font-bold uppercase tracking-widest text-amber-700">
              {remaining} of {FREE_AI_RETOUCHES} free
            </span>
          </p>
          <p className="mt-1 text-xs leading-relaxed text-stone-500">
            Professional inpainting — texture is realistically rebuilt. Only the cropped patch
            around each finding is processed; the rest of your photo is untouched.
          </p>
        </label>
      </div>

      {/* Region picker */}
      <div className="mt-4 rounded-xl border border-stone-200 bg-white p-4">
        <div className="flex items-center justify-between">
          <p className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-stone-500">
            Remove from the copy
          </p>
          <button
            onClick={() => setSelected(allSelected ? new Set() : new Set(removable.map((f) => f.id)))}
            className="cursor-pointer text-xs font-bold text-amber-700 hover:text-amber-800"
          >
            {allSelected ? "Clear all" : "Select all"}
          </button>
        </div>
        <ul className="mt-3 space-y-2.5">
          {removable.map((f) => (
            <li key={f.id}>
              <label className="flex cursor-pointer items-start gap-3 rounded-lg p-2 transition-colors hover:bg-stone-50">
                <input type="checkbox" checked={selected.has(f.id)} onChange={() => toggle(f.id)} className="mt-0.5 h-4 w-4 accent-amber-600" />
                <span aria-hidden="true" className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${sevDot[f.severity]}`} />
                <span className="text-sm">
                  <strong className="text-stone-900">{f.category}</strong>
                  <span className="block text-stone-500">{f.description}</span>
                </span>
              </label>
            </li>
          ))}
        </ul>

        {notRemovable.length > 0 && (
          <div className="mt-4 border-t border-stone-100 pt-3">
            <p className="text-xs leading-relaxed text-stone-500">
              <strong className="text-stone-700">Can&apos;t be auto-removed</strong> (no fixed location — handle manually):{" "}
              {notRemovable.map((f) => f.category).join(", ")}.
            </p>
          </div>
        )}
      </div>

      <button
        onClick={generateSafeCopy}
        disabled={working || selected.size === 0}
        className="mt-4 flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-stone-900 px-6 py-3.5 text-sm font-bold uppercase tracking-wider text-white transition-all hover:bg-stone-700 active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-stone-300"
      >
        {working ? (
          <>
            <Loader2 size={16} className="animate-spin" aria-hidden="true" />
            {mode === "ai" ? "AI retouching — a few seconds per area…" : "Creating safe copy…"}
          </>
        ) : (
          <>
            <ShieldCheck size={16} /> Create safe-to-share copy
          </>
        )}
      </button>

      {error && <p className="mt-3 text-sm font-medium text-red-600">{error}</p>}

      {resultUrl && (
        <div className="mt-5 rounded-xl border border-emerald-200 bg-white p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="flex items-center gap-2 font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-emerald-700">
              <Check size={13} /> Safe copy ready — preview below
            </p>
            <a
              href={resultUrl}
              download={`fixmp-safe-${originalFile?.name?.replace(/\.[^.]+$/, "") || "photo"}.jpg`}
              className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-bold text-white transition-all hover:bg-emerald-700 active:scale-95"
            >
              <Download size={13} /> Download copy
            </a>
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={resultUrl}
            alt="Safe-to-share preview with selected findings retouched out"
            className="mt-3 max-h-[420px] w-full rounded-lg border border-stone-200 object-contain"
          />
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-stone-100 pt-3">
            <p className="text-xs leading-relaxed text-stone-500">
              Re-encoding also strips hidden metadata (like GPS). Always eyeball the result before sharing.
            </p>
            <button
              onClick={generateSafeCopy}
              disabled={working}
              className="flex shrink-0 cursor-pointer items-center gap-1.5 text-xs font-bold text-stone-500 transition-colors hover:text-stone-900 disabled:opacity-50"
            >
              <Undo2 size={13} /> Regenerate
            </button>
          </div>
        </div>
      )}
    </section>
  );
}