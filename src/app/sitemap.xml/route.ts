import { getPublishedTripsWithDetails, getSiteSettings } from "@/lib/data/repository";
import { SITE_URL } from "@/lib/seo";
import { buildSitemap, sitemapXml } from "@/lib/sitemap-entries";

// Built from live data on every request, never frozen at build time: a trip that is added,
// renamed or hidden shows here at once. (The earlier build-time sitemap kept listing a trip's old
// address for hours after it was renamed.) The CDN keeps each copy for five minutes, so search
// engines always get an instant answer.
export const dynamic = "force-dynamic";

export async function GET() {
  const [{ trips, isDemoFallback }, { settings }] = await Promise.all([getPublishedTripsWithDetails(), getSiteSettings()]);
  const xml = sitemapXml(buildSitemap({ baseUrl: SITE_URL, trips, isDemoFallback, posts: settings.blogPosts ?? [] }));
  return new Response(xml, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=0, s-maxage=300, stale-while-revalidate=600",
    },
  });
}
