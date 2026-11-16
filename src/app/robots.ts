import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/seo";

export default function robots(): MetadataRoute.Robots {
  // Vercel preview deployments must never be indexed (only production is the real site).
  if (process.env.VERCEL_ENV && process.env.VERCEL_ENV !== "production") {
    return { rules: { userAgent: "*", disallow: "/" } };
  }
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // /booking-lookup is NOT blocked here on purpose: Google must be able to read its noindex
      // (meta + X-Robots-Tag from middleware). Its data comes from /api, which stays blocked.
      // The admin panel is deliberately not listed (that would advertise its address); it is kept
      // out of search engines by an X-Robots-Tag header and noindex metadata instead.
      disallow: ["/api"],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}

