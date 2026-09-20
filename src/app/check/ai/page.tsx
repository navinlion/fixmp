"use client";

import { useState } from "react";
import Header from "@/components/Header";
import { CheckResult } from "@/components/CheckResult";
import { CheckResponse } from "@/types/check";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";

export default function AICheckPage() {
  const [text, setText] = useState("");
  const [result, setResult] = useState<CheckResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;

    setLoading(true);
    setError("");
    setResult(null);

    try {
      const res = await fetch("/api/check/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ textContent: text }),
      });

      if (!res.ok) {
        // Extract the specific error message from the API (e.g., "Text is too long")
        const errData = await res.json();
        throw new Error(errData.error || "Failed to check");
      }
      
      const data: CheckResponse = await res.json();
      setResult(data);
    } catch (err: any) {
      setError(err.message || "Something went wrong while checking your prompt. Please try again.");
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

        <h1 className="text-3xl font-bold text-slate-900 mb-2">AI Prompt Check</h1>
        <p className="text-slate-600 mb-8">Paste the prompt you are about to send to ChatGPT, Gemini, or any other AI.</p>

        <form onSubmit={handleSubmit} className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 mb-8">
          <label htmlFor="prompt" className="block text-sm font-semibold text-slate-700 mb-2">
            YOUR PROMPT
          </label>
          
          <textarea
            id="prompt"
            rows={8}
            maxLength={5000} // <-- HARD CLIENT-SIDE LIMIT
            className="w-full p-4 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-base resize-none"
            placeholder="e.g., Hi AI, I'm working on a secret project for my company Acme Corp. My email is john@acme.com and my AWS key is..."
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          
          {/* Character Counter */}
          <div className="flex justify-between items-center mt-2">
            <p className="text-xs text-slate-500">
              {text.length > 4800 
                ? "⚠️ Approaching maximum length limit." 
                : "Max 5,000 characters to ensure fast, secure checking."}
            </p>
            <p className={`text-xs ${text.length > 4500 ? 'text-orange-600 font-bold' : 'text-slate-400'}`}>
              {text.length} / 5000
            </p>
          </div>

          <button
            type="submit"
            disabled={loading || !text.trim()}
            className="mt-6 w-full h-12 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white font-semibold rounded-lg transition-colors flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Checking...
              </>
            ) : "CHECK WITH FIXMP"}
          </button>
        </form>

        {error && (
          <div className="p-4 bg-red-50 text-red-700 rounded-lg border border-red-200 mb-8 text-sm">
            {error}
          </div>
        )}

        {result && <CheckResult result={result} />}
      </main>
    </div>
  );
}