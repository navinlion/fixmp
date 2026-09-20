import Header from "@/components/Header";
import Footer from "@/components/Footer";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export default function PrivacyPage() {
  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      <Header />
      <main className="flex-1 max-w-3xl mx-auto w-full px-4 sm:px-6 py-12">
        <Link href="/" className="inline-flex items-center gap-2 text-sm text-slate-600 hover:text-slate-900 mb-8">
          <ArrowLeft className="w-4 h-4" /> Back to Home
        </Link>

        <h1 className="text-3xl font-bold text-slate-900 mb-6">Privacy Policy</h1>
        <p className="text-slate-600 mb-8">Last updated: {new Date().toLocaleDateString()}</p>

        <div className="prose prose-slate max-w-none space-y-6 text-slate-700">
          <section>
            <h2 className="text-xl font-semibold text-slate-900 mb-2">1. Our Core Privacy Principle</h2>
            <p>FixMP is built on a simple principle: <strong>We do not store your sensitive data.</strong> When you use FixMP to check a prompt, image, or link, your content is processed ephemeraly in memory and immediately discarded. We do not save your prompts, uploaded images, or checked URLs in our database.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-900 mb-2">2. Information We Collect</h2>
            <p>We collect minimal data necessary to operate the service:</p>
            <ul className="list-disc pl-5 space-y-2">
              <li><strong>Usage Metadata:</strong> We may log anonymous, aggregated statistics (e.g., "100 AI checks performed today") to monitor system health and prevent abuse.</li>
              <li><strong>IP Addresses:</strong> Temporarily processed solely for rate-limiting purposes to prevent spam and protect our infrastructure. This data is not permanently stored or linked to your identity.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-900 mb-2">3. Third-Party AI Processing</h2>
            <p>To provide advanced analysis, FixMP sends text and image data to third-party AI providers (currently Google Gemini API). </p>
            <p><strong>Important:</strong> We use enterprise/API endpoints that guarantee your data is <strong>not</strong> used to train their AI models. However, you should avoid inputting highly classified, illegal, or extremely sensitive government/financial data into any public AI tool, including FixMP.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-900 mb-2">4. Data Retention</h2>
            <p>Raw user content (text prompts, uploaded images, URLs) is processed in volatile memory and deleted immediately after the analysis is returned to your browser. We do not retain this content.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-900 mb-2">5. Contact Us</h2>
            <p>If you have any questions about this Privacy Policy, please contact us at privacy@fixmp.com (replace with your actual email).</p>
          </section>
        </div>
      </main>
      <Footer />
    </div>
  );
}