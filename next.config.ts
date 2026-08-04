import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // There is a stray package-lock.json in the home directory above this
  // project; without an explicit root Turbopack walks up and adopts it.
  turbopack: { root: path.resolve(import.meta.dirname) },

  images: {
    // Real festival photography replaces the design's <image-slot> placeholders.
    formats: ["image/avif", "image/webp"],
  },
};

export default nextConfig;
