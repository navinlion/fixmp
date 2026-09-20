import { ShieldCheck } from "lucide-react";
import Link from "next/link";

export default function Header() {
  return (
    <header className="border-b border-slate-200 bg-white/80 backdrop-blur-md sticky top-0 z-50">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2 group">
          <ShieldCheck className="h-7 w-7 text-blue-600 group-hover:text-blue-700 transition-colors" />
          <span className="text-xl font-bold tracking-tight text-slate-900">FIXMP</span>
        </Link>
        
        <nav className="hidden sm:flex items-center gap-6 text-sm font-medium text-slate-600">
          <Link href="/how-it-works" className="hover:text-slate-900 transition-colors">How it works</Link>
          <Link href="/about" className="hover:text-slate-900 transition-colors">About</Link>
        </nav>
      </div>
    </header>
  );
}