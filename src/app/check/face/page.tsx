"use client";

import Link from "next/link";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import FaceCheckPanel from "@/components/FaceCheckPanel";
import { SectionLabel } from "@/components/brand";
import { ArrowLeft } from "lucide-react";

export default function FacePrivacyPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="flex-1">
        <section className="mx-auto w-full max-w-3xl px-4 pb-16 pt-10 sm:px-6 sm:pt-14">
          <Link href="/" className="inline-flex items-center gap-1.5 text-sm font-semibold text-stone-500 transition-colors hover:text-stone-900">
            <ArrowLeft size={15} /> FixMP home
          </Link>

          <div className="mt-6">
            <SectionLabel>Checkpoint 08 — Face Privacy</SectionLabel>
            <h1 className="mt-3 text-3xl font-extrabold leading-tight tracking-tight text-stone-900 sm:text-5xl">
              WHO ELSE IS <span className="text-cyan-600">IN THIS PHOTO?</span>
            </h1>
            <p className="mt-4 leading-relaxed text-stone-600">
              Upload a photo and FixMP finds every face in it — on your device, before you post.
              See who&apos;s in frame, then blur anyone who didn&apos;t agree to be there.
            </p>
          </div>

          <FaceCheckPanel />

          <p className="mt-10 text-center text-xs text-stone-400">
            This check only looks for faces. For text, QR codes, and metadata in the same photo,
            use Share Photo — or run both on the same image.
          </p>
        </section>
      </main>
      <Footer />
    </div>
  );
}
