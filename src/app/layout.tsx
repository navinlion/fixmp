import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import TestModeBanner from "@/components/TestModeBanner";

const jakarta = Plus_Jakarta_Sans({ subsets: ["latin"], variable: "--font-jakarta", display: "swap" });
const jbmono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-jbmono", display: "swap" });

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"),
  title: { default: "FixMP — Stop. Check Before You Act.", template: "%s — FixMP" },
  description:
    "Before you post, send, share, upload, search, ask or click — check it with FixMP.",
  openGraph: {
    title: "FixMP — Stop. Check Before You Act.",
    description: "Before you post, send, share, upload, search, ask or click — check it with FixMP.",
    siteName: "FixMP",
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: "#fafaf9",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${jakarta.variable} ${jbmono.variable}`}>
      <body className="min-h-screen bg-stone-50 font-sans text-stone-900 antialiased">
        <TestModeBanner />
        {children}
      </body>
    </html>
  );
}