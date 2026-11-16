import type { MetadataRoute } from "next";
import { getPublishedTripsWithDetails, getSiteSettings } from "@/lib/data/repository";
import { SITE_URL } from "@/lib/seo";
import { buildSitemap } from "@/lib/sitemap-entries";

// Refresh at least hourly, so a trip renamed straight in the database never stays listed under its old address.
export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [{ trips, isDemoFallback }, { settings }] = await Promise.all([getPublishedTripsWithDetails(), getSiteSettings()]);
  return buildSitemap({ baseUrl: SITE_URL, trips, isDemoFallback, posts: settings.blogPosts ?? [] });
}
