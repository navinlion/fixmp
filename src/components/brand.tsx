import type { ReactNode } from "react";

export function TrafficDots({ size = "md" }: { size?: "sm" | "md" | "lg" }) {
  const s = size === "sm" ? "h-1.5 w-1.5" : size === "lg" ? "h-4 w-4" : "h-2.5 w-2.5";
  return (
    <span className="flex items-center gap-1" aria-hidden="true">
      <span className={`${s} rounded-full bg-red-500`} />
      <span className={`${s} rounded-full bg-amber-400`} />
      <span className={`${s} rounded-full bg-emerald-500`} />
    </span>
  );
}

export function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <p className="font-mono text-[11px] font-bold uppercase tracking-[0.25em] text-amber-600">
      {children}
    </p>
  );
}

export function HazardDivider() {
  return <div aria-hidden="true" className="hazard-tape h-1.5 w-full opacity-90" />;
}