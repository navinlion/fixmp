"use client";

import { useState, useRef } from "react";
import Header from "@/components/Header";
import { CheckResult } from "@/components/CheckResult";
import { CheckResponse } from "@/types/check";
import { ArrowLeft, Image as ImageIcon, X } from "lucide-react";
import Link from "next/link";

export default function PostCheckPage() {
  const [text, setText] = useState("");
  const [image, setImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [result, setResult] = useState<CheckResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleImageChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        setError("Image must be smaller than 5MB.");
        return;
      }
      setImage(file);
      setImagePreview(URL.createObjectURL(file));
      setError("");
    }
  }

  function clearImage() {
    setImage(null);
    setImagePreview(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim() && !image) return;

    setLoading(true);
    setError("");
    setResult(null);

    try {
      let imageBase64 = "";
      if (image) {
        imageBase64 = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result as string);
          reader.readAsDataURL(image);
        });
      }

      const res = await fetch("/api/check/post", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ textContent: text, imageBase64 }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to check");
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

        <h1 className="text-3xl font-bold text-slate-900 mb-2">Post Check</h1>
        <p className="text-slate-600 mb-8">Check your text and images for hidden privacy leaks before you hit publish.</p>

        <form onSubmit={handleSubmit} className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 mb-8 space-y-6">
          
          {/* Text Input */}
          <div>
            <label htmlFor="post-text" className="block text-sm font-semibold text-slate-700 mb-2">
              YOUR CAPTION / TEXT
            </label>
            <textarea
              id="post-text"
              rows={4}
              className="w-full p-4 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-base resize-none"
              placeholder="What are you planning to post?"
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
          </div>

          {/* Image Input */}
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">
              ATTACH IMAGE (Optional)
            </label>
            
            {!imagePreview ? (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="w-full h-32 border-2 border-dashed border-slate-300 rounded-lg flex flex-col items-center justify-center text-slate-500 hover:border-blue-500 hover:text-blue-600 transition-colors cursor-pointer"
              >
                <ImageIcon className="w-8 h-8 mb-2" />
                <span className="text-sm font-medium">Click to upload a screenshot or photo</span>
                <span className="text-xs text-slate-400 mt-1">Max 5MB</span>
              </button>
            ) : (
              <div className="relative w-full h-48 bg-slate-100 rounded-lg overflow-hidden border border-slate-200">
                <img src={imagePreview} alt="Preview" className="w-full h-full object-contain" />
                <button
                  type="button"
                  onClick={clearImage}
                  className="absolute top-2 right-2 bg-white/90 hover:bg-white p-1.5 rounded-full shadow-md text-slate-700 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleImageChange}
              className="hidden"
            />
          </div>

          {error && (
            <div className="p-4 bg-red-50 text-red-700 rounded-lg border border-red-200 text-sm">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading || (!text.trim() && !image)}
            className="w-full h-12 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white font-semibold rounded-lg transition-colors flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Checking Post...
              </>
            ) : "CHECK WITH FIXMP"}
          </button>
        </form>

        {result && <CheckResult result={result} />}
      </main>
    </div>
  );
}