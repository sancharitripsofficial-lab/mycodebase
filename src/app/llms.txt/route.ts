import { getPublishedTripsWithDetails, getSiteSettings } from "@/lib/data/repository";
import { buildLlmsTxt } from "@/lib/llms";
import { SITE_URL } from "@/lib/seo";

// Same rule as the sitemap: built from live data, kept by the CDN for five minutes.
export const dynamic = "force-dynamic";

export async function GET() {
  const [{ trips, isDemoFallback }, { settings }] = await Promise.all([getPublishedTripsWithDetails(), getSiteSettings()]);
  return new Response(buildLlmsTxt({ baseUrl: SITE_URL, trips, isDemoFallback, settings }), {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=0, s-maxage=300, stale-while-revalidate=600",
    },
  });
}
