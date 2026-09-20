import Header from "@/components/Header";
import Footer from "@/components/Footer";
import ToolCard from "@/components/ToolCard";
import { Send, MessageSquare, Link as LinkIcon, Image as ImageIcon, Lock, AlertTriangle } from "lucide-react";

export default function Home() {
  const tools = [
    {
      icon: Send,
      title: "POST",
      description: "Check text or images before you publish them on social media.",
      href: "/check/post",
      colorClass: "bg-purple-600",
    },
    {
      icon: MessageSquare,
      title: "ASK AI",
      description: "Verify your prompt doesn't leak passwords, API keys, or private data.",
      href: "/check/ai",
      colorClass: "bg-blue-600",
    },
    {
      icon: LinkIcon,
      title: "CLICK",
      description: "Analyze a URL for phishing, lookalike domains, and suspicious behavior.",
      href: "/check/link",
      colorClass: "bg-emerald-600",
    },
    {
      icon: ImageIcon,
      title: "SHARE PHOTO",
      description: "Find hidden details, documents, or reflections you might have missed.",
      href: "/check/photo",
      colorClass: "bg-amber-600",
    },
    {
      icon: Lock,
      title: "SHARE INFO",
      description: "Check what personal information you might be accidentally exposing.",
      href: "/check/info",
      colorClass: "bg-rose-600",
    },
    {
      icon: AlertTriangle,
      title: "DO SOMETHING",
      description: "A general safety check before taking any uncertain digital action.",
      href: "/check/general",
      colorClass: "bg-slate-600",
    },
  ];

  return (
    <div className="min-h-screen flex flex-col">
      <Header />

      <main className="flex-1">
        {/* HERO SECTION */}
        <section className="py-16 sm:py-24 px-4 sm:px-6 text-center max-w-4xl mx-auto">
          <h1 className="text-4xl sm:text-6xl font-extrabold tracking-tight text-slate-900 mb-6">
            STOP. <span className="text-blue-600">CHECK BEFORE YOU ACT.</span>
          </h1>
          <p className="text-lg sm:text-xl text-slate-600 mb-10 max-w-2xl mx-auto leading-relaxed">
            Before you post, send, share, upload, search, ask or click — check it with FixMP.
          </p>

          {/* MAIN INPUT AREA */}
          <div className="bg-white p-4 sm:p-6 rounded-2xl shadow-lg border border-slate-200 max-w-2xl mx-auto">
            <label htmlFor="main-input" className="block text-sm font-semibold text-slate-700 mb-2 text-left">
              WHAT ARE YOU ABOUT TO DO?
            </label>
            <div className="flex flex-col sm:flex-row gap-3">
              <input
                id="main-input"
                type="text"
                placeholder="Tell FixMP what you're about to do..."
                className="flex-1 h-12 px-4 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-base"
              />
              <button className="h-12 px-8 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-colors flex items-center justify-center gap-2 shadow-sm">
                CHECK WITH FIXMP
              </button>
            </div>
            
            {/* Quick Action Icons (Mobile Friendly) */}
            <div className="flex items-center justify-center gap-4 mt-4 text-slate-400">
              <button className="p-2 hover:bg-slate-100 rounded-full transition-colors" title="Speak">
                <span className="sr-only">Speak</span>
                🎤
              </button>
              <button className="p-2 hover:bg-slate-100 rounded-full transition-colors" title="Upload">
                <span className="sr-only">Upload</span>
                📷
              </button>
              <button className="p-2 hover:bg-slate-100 rounded-full transition-colors" title="Add file">
                <span className="sr-only">Add file</span>
                📄
              </button>
              <button className="p-2 hover:bg-slate-100 rounded-full transition-colors" title="Check link">
                <span className="sr-only">Check link</span>
                🔗
              </button>
            </div>
          </div>
        </section>

        {/* TOOLS GRID SECTION */}
        <section className="py-12 px-4 sm:px-6 bg-slate-100/50 border-t border-slate-200">
          <div className="max-w-5xl mx-auto">
            <h2 className="text-2xl font-bold text-center text-slate-900 mb-10">
              WHAT ARE YOU ABOUT TO DO?
            </h2>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {tools.map((tool) => (
                <ToolCard key={tool.href} {...tool} />
              ))}
            </div>
          </div>
        </section>
      </main>

      {/* SHARED FOOTER COMPONENT */}
      <Footer />
    </div>
  );
}