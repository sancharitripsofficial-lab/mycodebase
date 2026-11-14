import type { MetadataRoute } from "next";
import { visiblePosts } from "@/lib/blog";
import { SITE_URL } from "@/lib/seo";
import { getPublishedTripsWithDetails, getSiteSettings } from "@/lib/data/repository";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = SITE_URL;
  const [{ trips }, { settings }] = await Promise.all([getPublishedTripsWithDetails(), getSiteSettings()]);

  const staticRoutes = ["", "/trips", "/blog", "/about", "/safety", "/policies", "/faqs", "/contact", "/creators"].map(
    // No made-up "changed today" date on every request (Google learns to ignore those).
    (route) => ({
      url: `${baseUrl}${route}`,
      changeFrequency: "weekly" as const,
      priority: route === "" ? 1 : 0.8,
    })
  );

  const tripRoutes = trips.map(({ trip }) => ({
    url: `${baseUrl}/trips/${trip.slug}`,
    changeFrequency: "weekly" as const,
    priority: 0.9,
  }));

  const blogRoutes = visiblePosts(settings.blogPosts ?? []).map((p) => ({
    url: `${baseUrl}/blog/${p.id}`,
    lastModified: new Date(`${p.publishedOn}T12:00:00Z`),
    changeFrequency: "monthly" as const,
    priority: 0.6,
  }));

  return [...staticRoutes, ...tripRoutes, ...blogRoutes];
}

