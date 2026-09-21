import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // These packages spawn worker threads / use native bindings and must NOT be
  // bundled by Turbopack — they need to resolve real files in node_modules.
  serverExternalPackages: ["tesseract.js", "sharp"],
};

export default nextConfig;