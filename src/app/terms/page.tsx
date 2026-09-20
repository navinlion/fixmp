import Header from "@/components/Header";
import Footer from "@/components/Footer";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export default function TermsPage() {
  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      <Header />
      <main className="flex-1 max-w-3xl mx-auto w-full px-4 sm:px-6 py-12">
        <Link href="/" className="inline-flex items-center gap-2 text-sm text-slate-600 hover:text-slate-900 mb-8">
          <ArrowLeft className="w-4 h-4" /> Back to Home
        </Link>

        <h1 className="text-3xl font-bold text-slate-900 mb-6">Terms of Service</h1>
        <p className="text-slate-600 mb-8">Last updated: {new Date().toLocaleDateString()}</p>

        <div className="prose prose-slate max-w-none space-y-6 text-slate-700">
          <section>
            <h2 className="text-xl font-semibold text-slate-900 mb-2">1. Acceptance of Terms</h2>
            <p>By accessing or using FixMP, you agree to be bound by these Terms. If you do not agree, please do not use the service.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-900 mb-2">2. No Guarantees (The "Helper" Clause)</h2>
            <p>FixMP is an automated analysis tool designed to help you identify potential privacy and security risks. <strong>It is not a guarantee of safety.</strong> Automated systems can produce false positives or miss certain risks (false negatives). You are ultimately responsible for reviewing your content before posting, sending, or sharing it.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-900 mb-2">3. Acceptable Use</h2>
            <p>You agree not to use FixMP to:</p>
            <ul className="list-disc pl-5 space-y-2">
              <li>Scan or process illegal content, including child sexual abuse material (CSAM) or illicit goods.</li>
              <li>Attempt to reverse-engineer, spam, or overload the FixMP infrastructure.</li>
              <li>Use the service for high-risk professional advice (e.g., medical, legal, or financial decisions) without consulting a qualified human professional.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-900 mb-2">4. Limitation of Liability</h2>
            <p>FixMP is provided "as is" without warranties of any kind. We shall not be liable for any indirect, incidental, or consequential damages arising from your use of the service or reliance on its results.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-900 mb-2">5. Changes to Terms</h2>
            <p>We reserve the right to modify these terms at any time. Continued use of FixMP constitutes acceptance of the updated terms.</p>
          </section>
        </div>
      </main>
      <Footer />
    </div>
  );
}