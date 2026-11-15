import { existsSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { settingsSaveSchema } from "@/lib/admin/content-schemas";
import { DEFAULT_BLOG_POSTS, blogIdFrom, mergeBlogPosts, paragraphs, visiblePosts, type BlogPost } from "@/lib/blog";
import kn from "@/lib/i18n/kn.json";

const post = (over: Partial<BlogPost> = {}): BlogPost => ({ ...DEFAULT_BLOG_POSTS[0], ...over });

describe("blog posts", () => {
  it("shows the built-in video post until the owner saves the list", () => {
    expect(mergeBlogPosts(undefined)).toEqual(DEFAULT_BLOG_POSTS);
    expect(mergeBlogPosts([])).toEqual([]); // the owner deleted everything: nothing is shown
    const first = DEFAULT_BLOG_POSTS[0];
    expect(first.videoUrl).toBe("/media/blog/sanchari-weekend-live.mp4");
    for (const file of [first.videoUrl, first.posterUrl]) {
      const abs = path.join(process.cwd(), "public", file);
      expect(existsSync(abs), file).toBe(true);
      expect(statSync(abs).size, file).toBeGreaterThan(10_000);
    }
  });

  it("drops unsafe or broken posts and fixes addresses", () => {
    const list = mergeBlogPosts([
      post({ id: "good", title: "Good one" }),
      post({ id: "bad-link", title: "Bad", videoUrl: "javascript:alert(1)" }),
      post({ id: "proto", title: "Proto", videoUrl: "//evil.example/x.mp4" }),
      post({ id: "good", title: "Duplicate address" }),
      { title: "No address yet", videoUrl: "/media/x.mp4" },
      post({ id: "poster", title: "Bad poster", posterUrl: "data:image/png;base64,AAAA" }),
      "nonsense",
    ]);
    // Unsafe video links are never kept; those posts still have a safe cover photo, so they stay as
    // photo stories (15 Nov: a story may be a video, a cover photo, or both).
    expect(list.map((p) => p.id)).toEqual(["good", "bad-link", "proto", "no-address-yet", "poster"]);
    expect(list.find((p) => p.id === "bad-link")?.videoUrl).toBe("");
    expect(list.find((p) => p.id === "proto")?.videoUrl).toBe("");
    expect(list.find((p) => p.id === "poster")?.posterUrl).toBe("");
    expect(blogIdFrom("Monsoon weekend in Coorg!")).toBe("monsoon-weekend-in-coorg");
  });

  it("shows only published posts, newest first, and splits the story into paragraphs", () => {
    const list = visiblePosts([
      post({ id: "old", publishedOn: "2026-10-01" }),
      post({ id: "hidden", publishedOn: "2026-12-01", published: false }),
      post({ id: "new", publishedOn: "2026-11-20" }),
    ]);
    expect(list.map((p) => p.id)).toEqual(["new", "old"]);
    expect(paragraphs("One.\n\nTwo\nlines.\n\n\nThree.")).toEqual(["One.", "Two\nlines.", "Three."]);
  });

  it("admin saves are checked: a video is required and links must be safe", () => {
    const ok = settingsSaveSchema.safeParse({ key: "blog_posts", value: [post()] });
    expect(ok.success).toBe(true);
    // A photo story (cover photo, no video) saves; a post with neither does not.
    const photoOnly = settingsSaveSchema.safeParse({ key: "blog_posts", value: [post({ videoUrl: "" })] });
    expect(photoOnly.success).toBe(true);
    const neither = settingsSaveSchema.safeParse({ key: "blog_posts", value: [post({ videoUrl: "", posterUrl: "" })] });
    expect(neither.success).toBe(false);
    const evil = settingsSaveSchema.safeParse({ key: "blog_posts", value: [post({ posterUrl: "javascript:alert(1)" })] });
    expect(evil.success).toBe(false);
    const dup = settingsSaveSchema.safeParse({ key: "blog_posts", value: [post(), post()] });
    expect(dup.success).toBe(false);
  });

  it("the Blog page and the first post have Kannada", () => {
    const d = kn as Record<string, string>;
    const first = DEFAULT_BLOG_POSTS[0];
    for (const en of ["Blog", "Stories from the road", "Read the story", first.title, first.excerpt, ...paragraphs(first.body)]) {
      expect(d[en], en).toMatch(/[ಀ-೿]/);
    }
  });
});
