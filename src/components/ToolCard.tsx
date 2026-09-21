import Link from "next/link";
import { ArrowRight, type LucideIcon } from "lucide-react";

export type ToolTone = "purple" | "blue" | "emerald" | "amber" | "rose" | "slate";

const tones: Record<ToolTone, { chip: string; border: string; title: string; num: string }> = {
  purple:  { chip: "bg-purple-100 text-purple-700",   border: "hover:border-purple-300",   title: "group-hover:text-purple-800", num: "text-purple-100" },
  blue:    { chip: "bg-blue-100 text-blue-700",       border: "hover:border-blue-300",     title: "group-hover:text-blue-800",   num: "text-blue-100" },
  emerald: { chip: "bg-emerald-100 text-emerald-700", border: "hover:border-emerald-300",  title: "group-hover:text-emerald-800", num: "text-emerald-100" },
  amber:   { chip: "bg-amber-100 text-amber-700",     border: "hover:border-amber-300",    title: "group-hover:text-amber-800",  num: "text-amber-100" },
  rose:    { chip: "bg-rose-100 text-rose-700",       border: "hover:border-rose-300",     title: "group-hover:text-rose-800",   num: "text-rose-100" },
  slate:   { chip: "bg-stone-200 text-stone-700",     border: "hover:border-stone-300",    title: "group-hover:text-stone-900",  num: "text-stone-200" },
};

interface ToolCardProps {
  icon: LucideIcon;
  title: string;
  description: string;
  href: string;
  tone: ToolTone;
  index: number;
}

export default function ToolCard({ icon: Icon, title, description, href, tone, index }: ToolCardProps) {
  const t = tones[tone];
  return (
    <Link
      href={href}
      className={`group relative flex flex-col rounded-2xl border border-stone-200 bg-white p-6 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-lg hover:shadow-stone-900/5 ${t.border}`}
    >
      <span aria-hidden="true" className={`absolute right-5 top-4 select-none font-mono text-4xl font-extrabold ${t.num}`}>
        {String(index + 1).padStart(2, "0")}
      </span>

      <span className={`flex h-12 w-12 items-center justify-center rounded-xl ${t.chip}`}>
        <Icon size={22} strokeWidth={2} />
      </span>

      <h3 className={`mt-5 text-lg font-extrabold tracking-tight text-stone-900 transition-colors ${t.title}`}>
        {title}
      </h3>
      <p className="mt-2 text-sm leading-relaxed text-stone-600">{description}</p>

      <span className="mt-auto flex items-center gap-2 pt-5 text-sm font-bold text-stone-900">
        Open this check
        <ArrowRight size={15} className="transition-transform duration-300 group-hover:translate-x-1" />
      </span>
    </Link>
  );
}