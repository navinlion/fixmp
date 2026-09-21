import type { Metadata } from "next";
import Link from "next/link";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { SectionLabel, TrafficDots, HazardDivider } from "@/components/brand";
import { ArrowRight, Eye, XCircle } from "lucide-react";

export const metadata: Metadata = {
  title: "About",
  description:
    "FixMP is a pre-action checking platform — the pause between impulse and publish. Built by one founder.",
};

const notList = [
  "Not a scary cybersecurity warning system",
  "Not a generic AI assistant",
  "Not a repair or fix-it service",
  "Not a search engine",
  "Not a social network",
];

export default function AboutPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <Header />

      <main className="flex-1">
        <section className="mx-auto max-w-6xl px-4 pb-14 pt-16 sm:px-6 sm:pt-20">
          <SectionLabel>About FixMP</SectionLabel>
          <h1 className="mt-4 max-w-3xl text-4xl font-extrabold tracking-tight text-stone-900 sm:text-6xl">
            A CALM SECOND PAIR OF{" "}
            <span className="text-amber-600">EYES.</span>
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-relaxed text-stone-600">
            Most online mistakes don&apos;t happen because people lack information. They happen
            because nothing paused them for three seconds first. FixMP is that pause — a quick
            check before you post, send, share, upload, ask, or click.
          </p>
        </section>

        <section className="mx-auto max-w-6xl px-4 pb-16 sm:px-6">
          <div className="grid gap-4 md:grid-cols-3">
            <div className="rounded-2xl border border-stone-200 bg-white p-6">
              <TrafficDots />
              <h2 className="mt-4 text-lg font-extrabold tracking-tight text-stone-900">
                Interruption first
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-stone-600">
                Problems don&apos;t always need a solution first. Sometimes they need an
                interruption. FixMP sits between impulse and action.
              </p>
            </div>
            <div className="rounded-2xl border border-stone-200 bg-white p-6">
              <Eye size={22} className="text-amber-600" aria-hidden="true" />
              <h2 className="mt-4 text-lg font-extrabold tracking-tight text-stone-900">
                Plain language
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-stone-600">
                We say &ldquo;your phone number is visible in this image&rdquo; — never
                &ldquo;PII detected.&rdquo; Built for everyone, not for security experts.
              </p>
            </div>
            <div className="rounded-2xl border border-stone-200 bg-white p-6">
              <HazardDivider />
              <h2 className="mt-5 text-lg font-extrabold tracking-tight text-stone-900">
                Private by design
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-stone-600">
                FixMP handles the things you&apos;d never paste anywhere else. No account for
                basic checks, minimal storage, and a privacy page that matches reality.
              </p>
            </div>
          </div>
        </section>

        <section className="border-y border-stone-200 bg-white py-16 sm:py-20">
          <div className="mx-auto grid max-w-6xl gap-12 px-4 sm:px-6 lg:grid-cols-2">
            <div>
              <SectionLabel>What FixMP is</SectionLabel>
              <h2 className="mt-3 text-2xl font-extrabold tracking-tight text-stone-900 sm:text-3xl">
                A CHECK BEFORE ACTION.
              </h2>
              <p className="mt-4 text-sm leading-relaxed text-stone-600">
                You give it the thing you&apos;re about to send — a caption, a prompt, a link, a
                photo. It runs fast deterministic checks, adds deeper analysis where it matters,
                and returns one clear verdict: what to avoid, what to check, what to do, why,
                and what comes next.
              </p>
              <p className="mt-4 text-sm leading-relaxed text-stone-600">
                The goal is a habit: <em>&ldquo;before I do this online, I&apos;ll check
                FixMP.&rdquo;</em>
              </p>
            </div>
            <div>
              <SectionLabel>What FixMP is not</SectionLabel>
              <ul className="mt-4 space-y-3">
                {notList.map((item) => (
                  <li key={item} className="flex items-center gap-3 text-sm font-medium text-stone-700">
                    <XCircle size={17} className="shrink-0 text-red-500" aria-hidden="true" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
          <SectionLabel>Where things stand</SectionLabel>
          <h2 className="mt-3 text-2xl font-extrabold tracking-tight text-stone-900 sm:text-3xl">
            CURRENTLY IN <span className="text-amber-600">TESTING.</span>
          </h2>
          <p className="mt-4 max-w-2xl text-sm leading-relaxed text-stone-600">
            FixMP is being built by one founder, in the open, starting with the four core checks.
            Everything currently runs without accounts and without storing your content. The
            full privacy policy will describe exactly what happens to your data — and it will
            only be published once it matches the real implementation, word for word.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link
              href="/check/ai"
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-stone-900 px-7 py-3.5 text-sm font-bold uppercase tracking-wider text-white transition-all hover:bg-stone-700 active:scale-[0.98]"
            >
              Try a check <ArrowRight size={16} />
            </Link>
            <Link
              href="/how-it-works"
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-stone-300 px-7 py-3.5 text-sm font-bold uppercase tracking-wider text-stone-700 transition-all hover:border-stone-400 hover:bg-stone-100 active:scale-[0.98]"
            >
              See how it works
            </Link>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}