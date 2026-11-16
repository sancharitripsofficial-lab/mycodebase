import type { MetadataRoute } from "next";
import { visiblePosts } from "@/lib/blog";
import { GUIDE_HUB, GUIDE_PAGES, GUIDE_UPDATED_ON } from "@/lib/places/guide";
import type { TripWithDetails } from "@/lib/types";
import type { BlogPost } from "@/lib/blog";

/** Indexable pages with no data behind them. Never /booking-lookup, /motion-preview, /admin or /api. */
export const STATIC_SITEMAP_ROUTES = [
  "",
  "/trips",
  "/karnataka-tour-packages",
  "/weekend-trips-from-bangalore",
  "/private-car-trips",
  "/offers",
  "/blog",
  "/about",
  "/safety",
  "/policies",
  "/faqs",
  "/contact",
  "/creators",
] as const;

const validDate = (iso: string | null | undefined): Date | null => {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
};

const newest = (dates: (Date | null)[]): Date | null =>
  dates.reduce<Date | null>((max, d) => (d && (!max || d > max) ? d : max), null);

/**
 * The sitemap entries, from data already loaded (pure, so tests can check it):
 * only canonical 200 URLs, the CURRENT slug of each published trip (old slugs redirect and are
 * never listed), every visible blog post, the Karnataka guide pages, and lastModified only from
 * real dates.
 */
export function buildSitemap(input: {
  baseUrl: string;
  trips: TripWithDetails[];
  /** True when the database failed and demo trips are served: list no trip URLs then. */
  isDemoFallback: boolean;
  posts: BlogPost[];
}): MetadataRoute.Sitemap {
  const { baseUrl, isDemoFallback } = input;
  const trips = isDemoFallback ? [] : input.trips.filter((t) => t.trip.isPublished);
  const posts = visiblePosts(input.posts);

  // No lastModified for trip pages, nor for /, /trips and /karnataka-tour-packages (which show the
  // trip list). trips.updated_at moves only on Admin trip saves: adding, re-pricing, cancelling or
  // reopening a date (admin_save_departure / admin_set_departure_status) never touches it, so it
  // would understate the last change and slow Google's recrawl after a date or price change.
  // Put it back as max(trips.updated_at, newest departures.updated_at) once that is available.
  const newestPost = newest(posts.map((p) => validDate(`${p.publishedOn}T12:00:00Z`)));

  const staticRoutes = STATIC_SITEMAP_ROUTES.map((route) => {
    // No made-up "changed today" date (Google learns to ignore those): real dates or nothing.
    const lastModified = route === "/blog" ? newestPost : null;
    return {
      url: `${baseUrl}${route}`,
      ...(lastModified && { lastModified }),
      changeFrequency: "weekly" as const,
      priority: route === "" ? 1 : 0.8,
    };
  });

  const tripRoutes = trips.map(({ trip }) => ({
    url: `${baseUrl}/trips/${trip.slug}`,
    changeFrequency: "weekly" as const,
    priority: 0.9,
  }));

  // The Karnataka guide: its facts change only when the place list does (GUIDE_UPDATED_ON, a real day).
  const guideRoutes = [GUIDE_HUB.path, ...GUIDE_PAGES.map((p) => p.path)].map((path) => ({
    url: `${baseUrl}${path}`,
    lastModified: GUIDE_UPDATED_ON,
    changeFrequency: "monthly" as const,
    priority: path === GUIDE_HUB.path ? 0.8 : 0.7,
  }));

  const blogRoutes = posts.map((p) => ({
    url: `${baseUrl}/blog/${p.id}`,
    lastModified: new Date(`${p.publishedOn}T12:00:00Z`),
    changeFrequency: "monthly" as const,
    priority: 0.6,
  }));

  return [...staticRoutes, ...tripRoutes, ...guideRoutes, ...blogRoutes];
}

const xmlEscape = (text: string) =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");

/** The sitemap as XML (sitemaps.org 0.9). A date given as a plain day ("2026-11-16") is printed as that day. */
export function sitemapXml(entries: MetadataRoute.Sitemap): string {
  const rows = entries.map((e) => {
    const lastmod = e.lastModified ? (typeof e.lastModified === "string" ? e.lastModified : e.lastModified.toISOString()) : "";
    return [
      "<url>",
      `<loc>${xmlEscape(e.url)}</loc>`,
      lastmod ? `<lastmod>${xmlEscape(lastmod)}</lastmod>` : "",
      e.changeFrequency ? `<changefreq>${e.changeFrequency}</changefreq>` : "",
      typeof e.priority === "number" ? `<priority>${e.priority}</priority>` : "",
      "</url>",
    ].join("");
  });
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${rows.join("\n")}\n</urlset>\n`;
}
