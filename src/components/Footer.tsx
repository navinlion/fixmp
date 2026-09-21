import Link from "next/link";
import { TrafficDots } from "./brand";

const columns = [
  {
    title: "The checks",
    links: [
      { label: "AI Check", href: "/check/ai" },
      { label: "Post Check", href: "/check/post" },
      { label: "Photo Check", href: "/check/photo" },
      { label: "Link Check", href: "/check/link" },
    ],
  },
    {
    title: "Learn",
    links: [
      { label: "How it works", href: "/how-it-works" },
    ],
  },

  {
    title: "Trust",
    links: [
      { label: "About", href: "/about" },
      { label: "Security", href: "/security" },
      { label: "Privacy", href: "/privacy" },
      { label: "Terms", href: "/terms" },
    ],
  },
];

export default function Footer() {
  return (
    <footer className="relative overflow-hidden border-t border-stone-200 bg-white">
      <div className="mx-auto max-w-6xl px-4 pb-10 pt-14 sm:px-6">
        <div className="grid gap-10 md:grid-cols-[1.5fr_1fr_1fr_1fr]">
          <div>
            <Link href="/" className="flex items-center gap-2.5">
              <TrafficDots />
              <span className="text-lg font-extrabold tracking-tight text-stone-900">
                FIX<span className="text-amber-600">MP</span>
              </span>
            </Link>
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-stone-500">
              The pause between impulse and publish. Check before you post, send, share or click.
            </p>
            <p className="mt-4 font-mono text-[10px] uppercase tracking-[0.2em] text-stone-400">
              Test build v0.1 — local testing
            </p>
          </div>

          {columns.map((col) => (
            <div key={col.title}>
              <p className="font-mono text-[10px] font-bold uppercase tracking-[0.25em] text-stone-400">
                {col.title}
              </p>
              <ul className="mt-4 space-y-2.5">
                {col.links.map((link) => (
                  <li key={link.label}>
                    <Link
                      href={link.href}
                      className="text-sm text-stone-600 transition-colors hover:text-amber-700"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-12 flex flex-col items-center justify-between gap-3 border-t border-stone-200 pt-6 font-mono text-[10px] uppercase tracking-[0.2em] text-stone-400 sm:flex-row">
          <p>© {new Date().getFullYear()} FixMP</p>
          <p className="flex items-center gap-2">
            Stop. Check before you act. <TrafficDots size="sm" />
          </p>
        </div>
      </div>

      <div aria-hidden="true" className="pointer-events-none select-none overflow-hidden">
        <p className="translate-y-[22%] bg-gradient-to-b from-stone-200 to-stone-50 bg-clip-text text-center text-[21vw] font-extrabold leading-[0.8] tracking-tighter text-transparent">
          FIXMP
        </p>
      </div>
    </footer>
  );
}