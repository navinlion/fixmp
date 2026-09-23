"use client";

import Link from "next/link";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import MediaForensicsPanel from "@/components/forensics/MediaForensicsPanel";
import { SectionLabel } from "@/components/brand";
import { ArrowLeft, Lock } from "lucide-react";

export default function MediaForensicsPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="flex-1">
        <section className="mx-auto w-full max-w-3xl px-4 pb-16 pt-10 sm:px-6 sm:pt-14">
          <Link href="/" className="inline-flex items-center gap-1.5 text-sm font-semibold text-stone-500 transition-colors hover:text-stone-900">
            <ArrowLeft size={15} /> FixMP home
          </Link>

          <div className="mt-6">
            <SectionLabel>Media Forensics — Images (beta)</SectionLabel>
            <h1 className="mt-3 text-3xl font-extrabold leading-tight tracking-tight text-stone-900 sm:text-5xl">
              WHAT&apos;S REALLY <span className="text-amber-600">IN THIS IMAGE?</span>
            </h1>
            <p className="mt-4 leading-relaxed text-stone-600">
              Metadata, hashes, statistics and steganography indicators — computed entirely
              in your browser. No AI service is used for this check, and nothing is uploaded.
            </p>
            <p className="mt-2 flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.15em] text-stone-400">
              <Lock size={12} /> Local analysis — your media stays on your device
            </p>
          </div>

          <MediaForensicsPanel />

          <p className="mt-10 text-center text-xs text-stone-400">
            Video and audio forensics are not implemented yet. Statistical indicators here
            describe likelihood, not certainty — see each result&apos;s limitations.
          </p>
        </section>
      </main>
      <Footer />
    </div>
  );
}
