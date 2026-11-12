import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/trips", "/about", "/safety", "/policies", "/contact"],
        // The admin panel is deliberately not listed here (that would advertise its address);
        // it is kept out of search engines by an X-Robots-Tag header and noindex metadata instead.
        disallow: ["/booking-lookup", "/api"],
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}

