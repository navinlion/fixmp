"use client";

import { useState } from "react";
import Link from "next/link";
import { Menu, X } from "lucide-react";
import { TrafficDots } from "./brand";

const navLinks = [
  { label: "The checks", href: "/#tools" },
  { label: "How it works", href: "/#how" },
  { label: "Privacy", href: "/#privacy" },
];

export default function Header() {
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 border-b border-stone-200/80 bg-stone-50/85 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2.5" aria-label="FixMP — home">
          <TrafficDots />
          <span className="text-lg font-extrabold tracking-tight text-stone-900">
            FIX<span className="text-amber-600">MP</span>
          </span>
        </Link>

        <nav className="hidden items-center gap-8 text-sm font-semibold text-stone-600 md:flex">
          {navLinks.map((l) => (
            <Link key={l.href} href={l.href} className="transition-colors hover:text-stone-900">
              {l.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <Link
            href="/#check"
            className="hidden rounded-full bg-stone-900 px-5 py-2.5 text-xs font-bold uppercase tracking-wider text-white shadow-sm transition-all hover:bg-stone-700 active:scale-95 sm:inline-flex"
          >
            Check with FixMP
          </Link>
          <button
            onClick={() => setOpen(!open)}
            className="rounded-lg p-2.5 text-stone-700 transition-colors hover:bg-stone-200/70 md:hidden"
            aria-expanded={open}
            aria-label={open ? "Close menu" : "Open menu"}
          >
            {open ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </div>

      {open && (
        <nav className="border-t border-stone-200 bg-white px-4 py-3 md:hidden">
          {navLinks.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              onClick={() => setOpen(false)}
              className="block rounded-lg px-3 py-3 text-base font-semibold text-stone-700 hover:bg-stone-100"
            >
              {l.label}
            </Link>
          ))}
          <Link
            href="/#check"
            onClick={() => setOpen(false)}
            className="mt-2 block rounded-xl bg-stone-900 px-3 py-3 text-center text-sm font-bold uppercase tracking-wider text-white"
          >
            Check with FixMP
          </Link>
        </nav>
      )}
    </header>
  );
}