"use client";

import { useState } from "react";
import Header from "@/components/Header";
import { CheckResult } from "@/components/CheckResult";
import { CheckResponse } from "@/types/check";
import { ArrowLeft, Link as LinkIcon } from "lucide-react";
import Link from "next/link";

export default function LinkCheckPage() {
  const [url, setUrl] = useState("");
  const [result, setResult] = useState<CheckResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!url.trim()) return;

    // Basic client-side prep (add https if missing)
    let checkUrl = url.trim();
    if (!checkUrl.startsWith("http://") && !checkUrl.startsWith("https://")) {
      checkUrl = "https://" + checkUrl;
    }

    setLoading(true);
    setError("");
    setResult(null);

    try {
      const res = await fetch("/api/check/link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ urlToCheck: checkUrl }),
      });

      if (!res.ok) {
        const err = await res.json();
        // If it's a security block, we still want to show it as a result, not an error
        if (res.status === 400 && err.riskLevel === "HIGH") {
          setResult(err);
          setLoading(false);
          return;
        }
        throw new Error(err.error || "Failed to check link");
      }
      
      const data: CheckResponse = await res.json();
      setResult(data);
    } catch (err: any) {
      setError(err.message || "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      <Header />
      <main className="flex-1 max-w-3xl mx-auto w-full px-4 sm:px-6 py-8">
        <Link href="/" className="inline-flex items-center gap-2 text-sm text-slate-600 hover:text-slate-900 mb-6">
          <ArrowLeft className="w-4 h-4" /> Back to Home
        </Link>

        <h1 className="text-3xl font-bold text-slate-900 mb-2">Link Check</h1>
        <p className="text-slate-600 mb-8">Paste a URL to check for phishing, suspicious redirects, and security risks before you click.</p>

        <form onSubmit={handleSubmit} className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 mb-8">
          <label htmlFor="url-input" className="block text-sm font-semibold text-slate-700 mb-2">
            URL TO CHECK
          </label>
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <LinkIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
              <input
                id="url-input"
                type="text"
                className="w-full h-12 pl-10 pr-4 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-base"
                placeholder="example.com or https://..."
                value={url}
                onChange={(e) => setUrl(e.target.value)}
              />
            </div>
            <button
              type="submit"
              disabled={loading || !url.trim()}
              className="h-12 px-8 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white font-semibold rounded-lg transition-colors flex items-center justify-center gap-2 whitespace-nowrap"
            >
              {loading ? (
                <>
                  <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Checking...
                </>
              ) : "CHECK LINK"}
            </button>
          </div>
        </form>

        {error && (
          <div className="p-4 bg-red-50 text-red-700 rounded-lg border border-red-200 mb-8">
            {error}
          </div>
        )}

        {result && <CheckResult result={result} />}
      </main>
    </div>
  );
}