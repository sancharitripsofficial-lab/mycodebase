/**
 * Blog / trip stories with videos (Admin → Website → Blog & videos), saved as the `blog_posts`
 * site setting (site_settings is key → JSON, so no database migration). Until the owner saves the
 * list for the first time, the built-in post below is shown.
 */

export interface BlogPost {
  /** Address of the post: /blog/<id> (lowercase letters, numbers and dashes). */
  id: string;
  title: string;
  /** One or two lines shown on the list. */
  excerpt: string;
  /** The story under the video; blank lines start a new paragraph. */
  body: string;
  /** Uploaded in Admin → Media (or a same-site / https link to an .mp4 or .webm). */
  videoUrl: string;
  /** Picture shown before the video plays (optional). */
  posterUrl: string;
  /** The trip this story is about (its page gets a "See dates" button), or null. */
  tripSlug: string | null;
  /** YYYY-MM-DD, newest first. */
  publishedOn: string;
  published: boolean;
}

export const DEFAULT_BLOG_POSTS: BlogPost[] = [
  {
    id: "a-sanchari-weekend",
    title: "Six seats, one car: a Sanchari weekend",
    excerpt: "Dawn pickup in Bengaluru, misty ghat roads, coffee estates, a Hampi sunset and a walk on the beach, all in one small car.",
    body: [
      "This is what a Sanchari weekend feels like. We leave Bengaluru before sunrise, while the city is still quiet, with no more than six travellers in one comfortable car.",
      "The road climbs into the Western Ghats through mist and forest. There is time for a walk through a coffee estate and filter coffee on a wooden verandah, then a sunset over the boulders of Hampi and a barefoot walk by the sea.",
      "On the way home the car is quieter, phones are full of photos, and a few of us are asleep. Pick a date, choose your seat on the live car map, and come along.",
    ].join("\n\n"),
    videoUrl: "/media/blog/sanchari-weekend-live.mp4",
    posterUrl: "/media/blog/sanchari-weekend-live.jpg",
    tripSlug: null,
    publishedOn: "2026-11-14",
    published: true,
  },
];

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "");

/** Same-site paths and https links only (never javascript:, data: or protocol-relative). */
export function isSafeMediaLink(url: string): boolean {
  return /^\/(?![/\\])[^\s\\]*$/.test(url) || /^https:\/\/[^\s<>"]{4,}$/.test(url);
}

export const blogIdFrom = (title: string) =>
  title
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "story";

/** Saved list → checked posts. Nothing saved yet → the built-in post. */
export function mergeBlogPosts(saved: unknown): BlogPost[] {
  if (!Array.isArray(saved)) return DEFAULT_BLOG_POSTS;
  const seen = new Set<string>();
  const out: BlogPost[] = [];
  for (const v of saved) {
    if (!isObj(v)) continue;
    const title = str(v.title, 120).trim();
    const id = /^[a-z0-9][a-z0-9-]{0,79}$/.test(String(v.id ?? "")) ? String(v.id) : blogIdFrom(title);
    const videoUrl = str(v.videoUrl, 500).trim();
    if (!title || !videoUrl || !isSafeMediaLink(videoUrl) || seen.has(id)) continue;
    seen.add(id);
    const poster = str(v.posterUrl, 500).trim();
    out.push({
      id,
      title,
      excerpt: str(v.excerpt, 300).trim(),
      body: str(v.body, 6000).trim(),
      videoUrl,
      posterUrl: poster && isSafeMediaLink(poster) ? poster : "",
      tripSlug: typeof v.tripSlug === "string" && /^[a-z0-9][a-z0-9-]{0,119}$/.test(v.tripSlug) ? v.tripSlug : null,
      publishedOn: /^\d{4}-\d{2}-\d{2}$/.test(String(v.publishedOn ?? "")) ? String(v.publishedOn) : "2026-01-01",
      published: v.published !== false,
    });
  }
  return out;
}

/** What visitors see: published posts, newest first. */
export const visiblePosts = (posts: BlogPost[]) =>
  posts.filter((p) => p.published).sort((a, b) => b.publishedOn.localeCompare(a.publishedOn) || a.title.localeCompare(b.title));

export const paragraphs = (body: string) =>
  body
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
