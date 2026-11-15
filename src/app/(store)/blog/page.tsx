import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, CalendarDays, Clock } from "lucide-react";
import { PageBanner3D } from "@/components/banners/PageBanner3D";
import { BlogCardImage, BlogCover } from "@/components/blog/BlogCover";
import { visiblePosts } from "@/lib/blog";
import { getSiteSettings } from "@/lib/data/repository";

export const revalidate = 60;

export const metadata: Metadata = {
  title: "Travel Blog & Trip Videos",
  description: "Videos and stories from Sanchari's small-group road trips from Bengaluru: Coorg, Chikmagalur, Gokarna and Hampi in a six-seat car.",
  alternates: { canonical: "/blog" },
};

const DATE = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const postDate = (iso: string) => DATE.format(new Date(`${iso}T12:00:00Z`));
/** About how long the story takes to read (200 words a minute), at least 1 minute. */
const readMinutes = (text: string) => Math.max(1, Math.round(text.split(/\s+/).filter(Boolean).length / 200));

export default async function BlogPage() {
  const { settings } = await getSiteSettings();
  const posts = visiblePosts(settings.blogPosts ?? []);
  const [featured, ...rest] = posts;

  return (
    <>
      <PageBanner3D
        scene="trips"
        width="4xl"
        eyebrow="Blog & trip videos"
        title="Stories from the road"
        subtitle="Small-group weekends from Bengaluru, one car and six seats at a time."
      />
      <div className="sec-route">
        <div className="mx-auto max-w-5xl space-y-10 px-4 py-10 sm:px-6 sm:py-12">
          {!featured ? (
            <p className="rounded-2xl border border-stone-200 bg-white p-6 text-center text-stone-600">New stories are coming soon.</p>
          ) : (
            <article className="space-y-5">
              {featured.videoUrl ? (
                <BlogCover videoUrl={featured.videoUrl} posterUrl={featured.posterUrl} title={featured.title} priority />
              ) : (
                <Link href={`/blog/${featured.id}`} aria-label={featured.title} className="group block">
                  <BlogCover videoUrl="" posterUrl={featured.posterUrl} title={featured.title} priority className="transition duration-500 group-hover:shadow-[0_34px_80px_-30px_rgb(13_95_107/0.75)]" />
                </Link>
              )}
              <div className="space-y-2">
                <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-semibold text-stone-600">
                  <span className="inline-flex items-center gap-1.5">
                    <CalendarDays className="h-3.5 w-3.5" aria-hidden="true" /> {postDate(featured.publishedOn)}
                  </span>
                  {featured.body && (
                    <span className="inline-flex items-center gap-1.5">
                      <Clock className="h-3.5 w-3.5" aria-hidden="true" /> {readMinutes(featured.body)} min read
                    </span>
                  )}
                </p>
                <h2 className="font-display text-2xl font-semibold text-forest-900 sm:text-3xl">
                  <Link href={`/blog/${featured.id}`} className="hover:underline">
                    {featured.title}
                  </Link>
                </h2>
                {featured.excerpt && <p className="max-w-3xl leading-relaxed text-stone-600">{featured.excerpt}</p>}
                <Link href={`/blog/${featured.id}`} className="inline-flex items-center gap-1.5 text-sm font-semibold text-copper-700 hover:underline">
                  Read the story <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Link>
              </div>
            </article>
          )}

          {rest.length > 0 && (
            <section aria-labelledby="more-stories" className="space-y-4">
              <h2 id="more-stories" className="font-display text-xl font-semibold text-forest-900">
                More stories
              </h2>
              <ul className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {rest.map((p) => (
                  <li key={p.id} className="min-w-0">
                    <Link
                      href={`/blog/${p.id}`}
                      className="group card-theme theme-brand block h-full overflow-hidden rounded-3xl shadow-[var(--shadow-soft)] transition duration-300 hover:-translate-y-1 hover:shadow-[var(--shadow-lift)]"
                    >
                      <BlogCardImage posterUrl={p.posterUrl} hasVideo={Boolean(p.videoUrl)} title={p.title} />
                      <div className="space-y-1.5 p-4">
                        <p className="text-xs font-semibold text-stone-600">
                          {postDate(p.publishedOn)}
                          {p.body ? ` · ${readMinutes(p.body)} min read` : ""}
                        </p>
                        <h3 className="font-display text-lg leading-snug font-semibold text-forest-900 group-hover:underline">{p.title}</h3>
                        {p.excerpt && <p className="line-clamp-3 text-sm text-stone-600">{p.excerpt}</p>}
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <div className="rounded-2xl border border-stone-200 bg-white p-6 text-center">
            <p className="font-display text-xl font-semibold text-forest-900">Want to be in the next story?</p>
            <p className="mt-1 text-sm text-stone-600">Pick a date and choose your seat on the live car map.</p>
            <Link href="/trips" className="btn-sunset mt-4 inline-flex items-center gap-2 px-5 py-3 text-sm">
              See trips and dates <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </div>
        </div>
      </div>
    </>
  );
}
