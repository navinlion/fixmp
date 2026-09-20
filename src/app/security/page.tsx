import Header from "@/components/Header";
import Footer from "@/components/Footer";
import Link from "next/link";
import { ArrowLeft, ShieldCheck, Lock, Server } from "lucide-react";

export default function SecurityPage() {
  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      <Header />
      <main className="flex-1 max-w-3xl mx-auto w-full px-4 sm:px-6 py-12">
        <Link href="/" className="inline-flex items-center gap-2 text-sm text-slate-600 hover:text-slate-900 mb-8">
          <ArrowLeft className="w-4 h-4" /> Back to Home
        </Link>

        <h1 className="text-3xl font-bold text-slate-900 mb-6">Security Architecture</h1>
        <p className="text-slate-600 mb-8">How FixMP protects you and our infrastructure.</p>

        <div className="space-y-8">
          <SecurityCard 
            icon={<ShieldCheck className="w-6 h-6 text-blue-600" />}
            title="Ephemeral Processing"
            description="Your prompts, images, and links are processed in volatile server memory and immediately discarded. We do not store your raw content in any database."
          />
          <SecurityCard 
            icon={<Lock className="w-6 h-6 text-emerald-600" />}
            title="Strict SSRF Protection"
            description="Our Link Checker never blindly fetches URLs. We validate protocols, block private/internal IP ranges (like 192.168.x.x), and enforce strict 3-second timeouts to prevent Server-Side Request Forgery attacks."
          />
          <SecurityCard 
            icon={<Server className="w-6 h-6 text-purple-600" />}
            title="Native Cost & Abuse Controls"
            description="To prevent abuse and protect our infrastructure, we enforce strict client-side and server-side limits on input sizes (e.g., 5MB max for images, 5000 characters max for text) and implement rate limiting."
          />
          <SecurityCard 
            icon={<ShieldCheck className="w-6 h-6 text-orange-600" />}
            title="Secure AI Integration"
            description="We use official, secure API endpoints for AI analysis. Your API keys are never exposed to the browser, and we configure our AI providers to ensure your data is not used for model training."
          />
        </div>

        <div className="mt-12 p-6 bg-blue-50 border border-blue-200 rounded-xl">
          <h3 className="text-lg font-bold text-blue-900 mb-2">Report a Vulnerability</h3>
          <p className="text-blue-800 text-sm">
            If you discover a security vulnerability in FixMP, please report it responsibly to security@fixmp.com (replace with your actual email). We appreciate your help in keeping our users safe.
          </p>
        </div>
      </main>
      <Footer />
    </div>
  );
}

function SecurityCard({ icon, title, description }: { icon: React.ReactNode, title: string, description: string }) {
  return (
    <div className="flex gap-4 p-6 bg-white rounded-xl border border-slate-200 shadow-sm">
      <div className="flex-shrink-0 mt-1">{icon}</div>
      <div>
        <h3 className="text-lg font-semibold text-slate-900 mb-2">{title}</h3>
        <p className="text-slate-600 leading-relaxed">{description}</p>
      </div>
    </div>
  );
}