import type { MetadataRoute } from "next";
import { visiblePosts } from "@/lib/blog";
import type { TripWithDetails } from "@/lib/types";
import type { BlogPost } from "@/lib/blog";

/** Indexable pages with no data behind them. Never /booking-lookup, /motion-preview, /admin or /api. */
export const STATIC_SITEMAP_ROUTES = [
  "",
  "/trips",
  "/karnataka-tour-packages",
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
 * never listed), every visible blog post, and lastModified only from real dates.
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

  const blogRoutes = posts.map((p) => ({
    url: `${baseUrl}/blog/${p.id}`,
    lastModified: new Date(`${p.publishedOn}T12:00:00Z`),
    changeFrequency: "monthly" as const,
    priority: 0.6,
  }));

  return [...staticRoutes, ...tripRoutes, ...blogRoutes];
}
