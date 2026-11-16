import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight, CalendarDays } from "lucide-react";
import { BlogCover } from "@/components/blog/BlogCover";
import { visiblePosts } from "@/lib/blog";
import { BlogBody } from "@/components/blog/BlogBody";
import { PageCanvas } from "@/components/PageCanvas";
import { getPublishedTripsWithDetails, getSiteSettings } from "@/lib/data/repository";
import { blogPostingJsonLd, breadcrumbJsonLd, clip, jsonLdText, pageMetadata, sameTripSlug } from "@/lib/seo";

export const revalidate = 60;

const DATE = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

async function findPost(id: string) {
  const { settings } = await getSiteSettings();
  return visiblePosts(settings.blogPosts ?? []).find((p) => p.id === id) ?? null;
}

/**
 * Builds the visible stories ahead of time, which makes this route ISR like /trips/[slug]. That
 * is what gives an unknown id a real HTTP 404: a dynamically rendered route streams its shell
 * first (loading.tsx), so a later notFound() can only add a noindex to a 200 page. New posts
 * still render on first visit (dynamicParams stays at its default, true).
 */
export async function generateStaticParams() {
  const { settings } = await getSiteSettings();
  return visiblePosts(settings.blogPosts ?? []).map((p) => ({ id: p.id }));
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const post = await findPost((await params).id);
  // A 404 for an unknown or hidden story (a real HTTP 404 thanks to generateStaticParams above).
  if (!post) notFound();
  const published = `${post.publishedOn}T12:00:00+05:30`;
  return pageMetadata({
    title: post.title,
    description: clip(post.excerpt || post.title),
    path: `/blog/${post.id}`,
    type: "article",
    publishedTime: published,
    modifiedTime: published,
    image: post.posterUrl ? { url: post.posterUrl, alt: post.title } : undefined,
  });
}

export default async function BlogPostPage({ params }: { params: Promise<{ id: string }> }) {
  const post = await findPost((await params).id);
  if (!post) notFound();
  // The story's trip, also when the saved slug is the trip's old address (lib/trip-slugs.ts).
  const trip = post.tripSlug
    ? (await getPublishedTripsWithDetails()).trips.find((t) => sameTripSlug(t.trip.slug, post.tripSlug))?.trip ?? null
    : null;

  const article = blogPostingJsonLd(post);
  const breadcrumb = breadcrumbJsonLd([
    { name: "Home", path: "/" },
    { name: "Blog", path: "/blog" },
    { name: post.title, path: `/blog/${post.id}` },
  ]);

  return (
    <div>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdText(article) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdText(breadcrumb) }} />
      <PageCanvas theme="blog" />
      <article className="mx-auto max-w-4xl space-y-6 px-4 py-8 sm:px-6 sm:py-12">
        <Link href="/blog" className="inline-flex min-h-10 items-center gap-1.5 text-sm font-semibold text-forest-800 hover:underline">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" /> All stories
        </Link>
        <header className="space-y-2">
          <p className="flex items-center gap-1.5 text-xs font-semibold text-stone-600">
            <CalendarDays className="h-3.5 w-3.5" aria-hidden="true" /> {DATE.format(new Date(`${post.publishedOn}T12:00:00Z`))}
          </p>
          <h1 className="font-display text-3xl leading-tight font-semibold text-forest-900 sm:text-4xl">{post.title}</h1>
          {post.excerpt && <p className="text-lg leading-relaxed text-stone-600">{post.excerpt}</p>}
        </header>
        <BlogCover videoUrl={post.videoUrl} posterUrl={post.posterUrl} title={post.title} priority />
        {post.body && <BlogBody text={post.body} />}
        {/* The heading keeps a real width (never squeezed to one letter per line, e.g. in Kannada);
            on phones the button drops below it at full width. */}
        <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-stone-200 bg-white p-5">
          <p className="min-w-0 flex-[1_1_15rem] font-display text-lg font-semibold text-forest-900">{trip ? trip.title : "Ready for your own trip?"}</p>
          <Link href={trip ? `/trips/${trip.slug}#book` : "/trips"} className="btn-sunset inline-flex w-full items-center justify-center gap-2 px-5 py-3 text-center text-sm sm:w-auto">
            {trip ? "See dates" : "See trips and dates"} <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>
      </article>
    </div>
  );
}
