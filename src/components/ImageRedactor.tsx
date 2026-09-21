"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Download, Loader2, ShieldCheck, Undo2 } from "lucide-react";
import type { Severity, VerdictFinding } from "@/types/check";

const sevDot: Record<Severity, string> = { high: "bg-red-500", medium: "bg-amber-500", low: "bg-emerald-500" };

interface RemovableFinding {
  id: string;
  category: string;
  description: string;
  severity: Severity;
}

interface ImageRedactorProps {
  originalFile: File | null;
  removable: RemovableFinding[];
  notRemovable: VerdictFinding[];
}

export default function ImageRedactor({ originalFile, removable, notRemovable }: ImageRedactorProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set<string>());
  const [working, setWorking] = useState(false);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [error, setError] = useState("");
  const urlRef = useRef<string | null>(null);

  const allSelected = useMemo(
    () => removable.length > 0 && removable.every((f) => selected.has(f.id)),
    [removable, selected]
  );

  useEffect(() => {
    setSelected(new Set(removable.map((f) => f.id)));
  }, [removable]);

  // Clean up the object URL when leaving
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

  function pixelateRegion(
    ctx: CanvasRenderingContext2D,
    img: HTMLImageElement | HTMLCanvasElement,
    region: { yMin: number; xMin: number; yMax: number; xMax: number },
    W: number,
    H: number
  ) {
    const pad = Math.max(10, Math.round(Math.min(W, H) * 0.02)); // safety margin — AI boxes can be slightly off
    const sx = Math.max(0, (region.xMin / 1000) * W - pad);
    const sy = Math.max(0, (region.yMin / 1000) * H - pad);
    const sw = Math.min(W - sx, ((region.xMax - region.xMin) / 1000) * W + pad * 2);
    const sh = Math.min(H - sy, ((region.yMax - region.yMin) / 1000) * H + pad * 2);
    if (sw <= 2 || sh <= 2) return;

    // Shrink to a tiny canvas, then blow back up with smoothing off → strong pixelation
    const factor = 24;
    const tw = Math.max(1, Math.round(sw / factor));
    const th = Math.max(1, Math.round(sh / factor));
    const tmp = document.createElement("canvas");
    tmp.width = tw;
    tmp.height = th;
    const tctx = tmp.getContext("2d");
    if (!tctx) return;
    tctx.drawImage(img, sx, sy, sw, sh, 0, 0, tw, th);

    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(tmp, 0, 0, tw, th, sx, sy, sw, sh);
    ctx.imageSmoothingEnabled = true;
  }

  async function generateSafeCopy() {
    if (!originalFile || selected.size === 0) return;
    setWorking(true);
    setError("");

    try {
      const chosen = removable.filter((f) => selected.has(f.id));

      // Decode the ORIGINAL file at full resolution (never uploaded anywhere)
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

         for (const f of chosen) {
        const region = (f as RemovableFinding & { region?: { yMin: number; xMin: number; yMax: number; xMax: number } }).region;
        if (region) pixelateRegion(ctx, canvas, region, canvas.width, canvas.height);
      }

      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/jpeg", 0.92)
      );
      if (!blob) throw new Error("blob");

      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
      const newUrl = URL.createObjectURL(blob);
      urlRef.current = newUrl;
      setResultUrl(newUrl);
    } catch {
      setError("Couldn't create the safe copy in your browser. Please try again.");
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
            FixMP can create a copy with the findings below strongly pixelated — every other
            pixel stays exactly as you took it. The copy is made <strong>in your browser</strong>;
            your original file is never modified and never uploaded.
          </p>
        </div>
      </div>

      {/* Region picker */}
      <div className="mt-4 rounded-xl border border-stone-200 bg-white p-4">
        <div className="flex items-center justify-between">
          <p className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-stone-500">
            Remove from the copy
          </p>
          <button
            onClick={() =>
              setSelected(allSelected ? new Set() : new Set(removable.map((f) => f.id)))
            }
            className="cursor-pointer text-xs font-bold text-amber-700 hover:text-amber-800"
          >
            {allSelected ? "Clear all" : "Select all"}
          </button>
        </div>
        <ul className="mt-3 space-y-2.5">
          {removable.map((f) => (
            <li key={f.id}>
              <label className="flex cursor-pointer items-start gap-3 rounded-lg p-2 transition-colors hover:bg-stone-50">
                <input
                  type="checkbox"
                  checked={selected.has(f.id)}
                  onChange={() => toggle(f.id)}
                  className="mt-0.5 h-4 w-4 accent-amber-600"
                />
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
              <strong className="text-stone-700">Can&apos;t be auto-removed</strong> (no fixed
              location — handle manually):{" "}
              {notRemovable.map((f) => f.category).join(", ")}.
            </p>
          </div>
        )}
      </div>

      <button
        onClick={generateSafeCopy}
        disabled={working || selected.size === 0}
        className="mt-4 flex h-13 w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-stone-900 px-6 py-3.5 text-sm font-bold uppercase tracking-wider text-white transition-all hover:bg-stone-700 active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-stone-300"
      >
        {working ? (
          <>
            <Loader2 size={16} className="animate-spin" aria-hidden="true" /> Creating safe copy…
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
            alt="Safe-to-share preview with selected findings pixelated"
            className="mt-3 max-h-[420px] w-full rounded-lg border border-stone-200 object-contain"
          />
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-stone-100 pt-3">
            <p className="text-xs leading-relaxed text-stone-500">
              Re-encoding also strips hidden metadata (like GPS) from the copy. Pixelation is
              strong, but AI boxes can be slightly off — always eyeball the result before sharing.
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