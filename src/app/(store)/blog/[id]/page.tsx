import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight, CalendarDays } from "lucide-react";
import { BlogVideo } from "@/components/blog/BlogVideo";
import { paragraphs, visiblePosts } from "@/lib/blog";
import { getPublishedTripsWithDetails, getSiteSettings } from "@/lib/data/repository";

export const revalidate = 60;

const DATE = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

async function findPost(id: string) {
  const { settings } = await getSiteSettings();
  return visiblePosts(settings.blogPosts ?? []).find((p) => p.id === id) ?? null;
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const post = await findPost((await params).id);
  if (!post) return { title: "Story not found", robots: { index: false } };
  return {
    title: post.title,
    description: post.excerpt || undefined,
    openGraph: { title: post.title, description: post.excerpt || undefined, type: "article", images: post.posterUrl ? [post.posterUrl] : undefined },
  };
}

export default async function BlogPostPage({ params }: { params: Promise<{ id: string }> }) {
  const post = await findPost((await params).id);
  if (!post) notFound();
  const trip = post.tripSlug ? (await getPublishedTripsWithDetails()).trips.find((t) => t.trip.slug === post.tripSlug)?.trip ?? null : null;

  return (
    <div className="sec-route">
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
        <BlogVideo src={post.videoUrl} poster={post.posterUrl} title={post.title} />
        {post.body && (
          <div className="max-w-3xl space-y-4 text-[1.02rem] leading-relaxed text-ink-900">
            {paragraphs(post.body).map((p, i) => (
              <p key={i}>{p}</p>
            ))}
          </div>
        )}
        {/* The heading keeps a real width (never squeezed to one letter per line, e.g. in Kannada);
            on phones the button drops below it at full width. */}
        <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-stone-200 bg-white p-5">
          <p className="min-w-0 flex-[1_1_15rem] font-display text-lg font-semibold text-forest-900">{trip ? trip.title : "Ready for your own weekend?"}</p>
          <Link href={trip ? `/trips/${trip.slug}#book` : "/trips"} className="btn-sunset inline-flex w-full items-center justify-center gap-2 px-5 py-3 text-center text-sm sm:w-auto">
            {trip ? "See dates" : "See trips and dates"} <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>
      </article>
    </div>
  );
}
