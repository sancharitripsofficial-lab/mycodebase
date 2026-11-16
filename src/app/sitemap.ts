import type { MetadataRoute } from "next";
import { getPublishedTripsWithDetails, getSiteSettings } from "@/lib/data/repository";
import { SITE_URL } from "@/lib/seo";
import { buildSitemap } from "@/lib/sitemap-entries";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [{ trips, isDemoFallback }, { settings }] = await Promise.all([getPublishedTripsWithDetails(), getSiteSettings()]);
  return buildSitemap({ baseUrl: SITE_URL, trips, isDemoFallback, posts: settings.blogPosts ?? [] });
}
