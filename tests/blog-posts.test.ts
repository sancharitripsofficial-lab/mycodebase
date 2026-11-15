/**
 * Blog posts (Admin → Website → Blog & videos): a story can have a video, a cover photo, or both.
 * Before 15 Nov a post without a video was silently dropped on save.
 */
import { describe, expect, it } from "vitest";
import { blogPostsSchema } from "@/lib/admin/content-schemas";
import { mergeBlogPosts, visiblePosts } from "@/lib/blog";

const base = {
  id: "coorg-monsoon",
  title: "Monsoon weekend in Coorg",
  excerpt: "Mist, coffee and six friends.",
  body: "Day one…",
  videoUrl: "",
  posterUrl: "",
  tripSlug: null,
  publishedOn: "2026-11-15",
  published: true,
};

describe("blog post rules", () => {
  it("saves a photo story (cover photo, no video)", () => {
    const ok = blogPostsSchema.safeParse([{ ...base, posterUrl: "/media/blog/cover.jpg" }]);
    expect(ok.success).toBe(true);
  });

  it("saves a video story and a video + cover story", () => {
    expect(blogPostsSchema.safeParse([{ ...base, videoUrl: "/media/blog/clip.mp4" }]).success).toBe(true);
    expect(
      blogPostsSchema.safeParse([{ ...base, videoUrl: "/media/blog/clip.mp4", posterUrl: "/media/blog/cover.jpg" }]).success
    ).toBe(true);
  });

  it("refuses a post with neither, with a clear message", () => {
    const bad = blogPostsSchema.safeParse([base]);
    expect(bad.success).toBe(false);
    expect(bad.error?.issues[0].message).toMatch(/video or a cover photo/);
  });

  it("refuses unsafe links", () => {
    expect(blogPostsSchema.safeParse([{ ...base, posterUrl: "javascript:alert(1)" }]).success).toBe(false);
  });
});

describe("reading saved posts", () => {
  it("keeps photo stories and video stories, drops empty ones", () => {
    const posts = mergeBlogPosts([
      { ...base, id: "photo", posterUrl: "/media/blog/cover.jpg" },
      { ...base, id: "video", title: "Hampi at sunrise", videoUrl: "/media/blog/clip.mp4" },
      { ...base, id: "empty", title: "Nothing to show" },
      { ...base, id: "bad-link", title: "Bad link", posterUrl: "javascript:alert(1)" },
    ]);
    expect(posts.map((p) => p.id)).toEqual(["photo", "video"]);
    expect(visiblePosts(posts)).toHaveLength(2);
  });
});
