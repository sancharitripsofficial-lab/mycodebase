import type { NextConfig } from "next";

// Photos uploaded in Admin → Media live in the project's public Supabase Storage bucket.
const supabaseHost = (() => {
  try {
    return process.env.NEXT_PUBLIC_SUPABASE_URL ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname : null;
  } catch {
    return null;
  }
})();

const nextConfig: NextConfig = {
  // Styles arrive inside the HTML instead of as separate files the phone must fetch before it can
  // draw anything (faster first paint for new visitors from Google; public pages' CSS is ~34 KB
  // compressed since the Astryx component CSS moved to admin/booking-only pages).
  experimental: {
    inlineCss: true,
  },
  images: {
    unoptimized: false,
    // AVIF where the phone supports it (usually 20-30% smaller than WebP), else WebP.
    formats: ["image/avif", "image/webp"],
    // Optimised pictures stay cached for 31 days (they only change when a new file is uploaded,
    // which gets a new address).
    minimumCacheTTL: 2678400,
    remotePatterns: supabaseHost
      ? [{ protocol: "https", hostname: supabaseHost, pathname: "/storage/v1/object/public/**" }]
      : [],
  },
  // Local profiling only (dev, or a local build with JS_PROFILING=1): allows the browser's
  // JS Self-Profiling API and ships source maps, to find slow code. Never set on Vercel.
  ...(process.env.JS_PROFILING === "1" ? { productionBrowserSourceMaps: true } : {}),
  async headers() {
    // Pictures, videos and logos in /public: phones keep them for 7 days (and may use a copy up
    // to 30 days old while quietly checking for a new one), instead of re-asking on every page.
    const longCache = [
      { key: "Cache-Control", value: "public, max-age=604800, stale-while-revalidate=2592000" },
    ];
    const rules = [
      { source: "/media/:path*", headers: longCache },
      { source: "/brand/:path*", headers: longCache },
      { source: "/icon.png", headers: [{ key: "Cache-Control", value: "public, max-age=86400, stale-while-revalidate=604800" }] },
      { source: "/apple-icon.png", headers: [{ key: "Cache-Control", value: "public, max-age=86400, stale-while-revalidate=604800" }] },
      { source: "/favicon.ico", headers: [{ key: "Cache-Control", value: "public, max-age=86400, stale-while-revalidate=604800" }] },
    ];
    if (process.env.NODE_ENV !== "production" || process.env.JS_PROFILING === "1") {
      rules.push({ source: "/:path*", headers: [{ key: "Document-Policy", value: "js-profiling" }] });
    }
    return rules;
  },
};

export default nextConfig;
