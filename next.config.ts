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
    remotePatterns: supabaseHost
      ? [{ protocol: "https", hostname: supabaseHost, pathname: "/storage/v1/object/public/**" }]
      : [],
  },
  // Local profiling only (dev, or a local build with JS_PROFILING=1): allows the browser's
  // JS Self-Profiling API and ships source maps, to find slow code. Never set on Vercel.
  ...(process.env.JS_PROFILING === "1" ? { productionBrowserSourceMaps: true } : {}),
  ...(process.env.NODE_ENV !== "production" || process.env.JS_PROFILING === "1"
    ? {
        async headers() {
          return [{ source: "/:path*", headers: [{ key: "Document-Policy", value: "js-profiling" }] }];
        },
      }
    : {}),
};

export default nextConfig;
