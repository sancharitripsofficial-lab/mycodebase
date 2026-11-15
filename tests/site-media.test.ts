/** Admin → Site pictures & videos: home background video, page banners and section photos. */
import { describe, expect, it } from "vitest";
import { settingsSaveSchema, siteMediaSchema } from "@/lib/admin/content-schemas";
import { BUILT_IN_MEDIA, customBanner, EMPTY_SITE_MEDIA, mergeSiteMedia, resolveHero } from "@/lib/site-media";

describe("site pictures & videos", () => {
  it("nothing saved → the built-in film, photos and 3D banners", () => {
    const m = mergeSiteMedia(null);
    expect(m).toEqual(EMPTY_SITE_MEDIA);
    expect(resolveHero(m)).toEqual({
      videoSrc: BUILT_IN_MEDIA.heroVideo,
      mobileVideoSrc: BUILT_IN_MEDIA.heroMobileVideo,
      posterSrc: BUILT_IN_MEDIA.heroPoster,
      mobilePosterSrc: BUILT_IN_MEDIA.heroMobilePoster,
    });
    expect(customBanner(m, "trips")).toBeNull();
    expect(() => siteMediaSchema.parse(EMPTY_SITE_MEDIA)).not.toThrow();
    expect(settingsSaveSchema.parse({ key: "site_media", value: EMPTY_SITE_MEDIA }).key).toBe("site_media");
  });

  it("a new computer video also plays on phones (not the old phone film)", () => {
    const m = mergeSiteMedia({ heroVideo: "/media/new-loop.mp4", heroPoster: "/media/new-still.jpg" });
    const hero = resolveHero(m);
    expect(hero.videoSrc).toBe("/media/new-loop.mp4");
    expect(hero.mobileVideoSrc).toBeUndefined();
    expect(hero.posterSrc).toBe("/media/new-still.jpg");
    expect(hero.mobilePosterSrc).toBeUndefined();
  });

  it("still-picture mode shows the owner's picture with no video", () => {
    const hero = resolveHero(mergeSiteMedia({ heroMode: "photo", heroVideo: "/media/a.mp4", heroPoster: "/media/still.jpg" }));
    expect(hero.videoSrc).toBeUndefined();
    expect(hero.slides).toEqual([{ src: "/media/still.jpg" }]);
  });

  it("a page banner with the owner's picture replaces the 3D scene", () => {
    const m = mergeSiteMedia({ banners: { blog: { image: "/media/blog-top.jpg", video: "/media/blog-top.webm" } } });
    expect(customBanner(m, "blog")).toEqual({ image: "/media/blog-top.jpg", mobileImage: "", video: "/media/blog-top.webm" });
    expect(customBanner(m, "trips")).toBeNull();
  });

  it("refuses unsafe links and a video in a picture slot (and the other way round)", () => {
    const bad = (patch: Record<string, unknown>) => siteMediaSchema.safeParse({ ...EMPTY_SITE_MEDIA, ...patch }).success;
    expect(bad({ heroVideo: "javascript:alert(1)" })).toBe(false);
    expect(bad({ heroVideo: "http://evil.example/x.mp4" })).toBe(false);
    expect(bad({ heroVideo: "https://evil.example/x.mp4" })).toBe(false);
    expect(bad({ heroVideo: "/media/still.jpg" })).toBe(false);
    expect(bad({ heroPoster: "/media/loop.mp4" })).toBe(false);
    expect(bad({ safetyPhoto: "//evil.example/a.jpg" })).toBe(false);
    expect(bad({ heroVideo: "/media/loop.mp4", heroPoster: "/media/still.jpg" })).toBe(true);
    // Bad saved values never reach the page.
    expect(mergeSiteMedia({ heroVideo: "javascript:alert(1)", safetyPhoto: "/media/x.mp4" })).toEqual(EMPTY_SITE_MEDIA);
  });
});

describe("page banner with the owner's media", () => {
  it("shows their picture and silent video instead of the 3D scene", async () => {
    const { createElement } = await import("react");
    const { renderToStaticMarkup } = await import("react-dom/server");
    const { PageBanner3D } = await import("@/components/banners/PageBanner3D");
    const own = renderToStaticMarkup(
      createElement(PageBanner3D, { scene: "trips", title: "Trips", custom: { image: "/media/top.jpg", mobileImage: "", video: "/media/top.mp4" } })
    );
    expect(own).toContain('data-banner-live="custom"');
    expect(own).toContain("top.jpg");
    expect(own).toMatch(/<video[^>]*src="\/media\/top\.mp4"/);
    expect(own).not.toContain("/media/banners/trips-wide.jpg");

    const builtIn = renderToStaticMarkup(createElement(PageBanner3D, { scene: "trips", title: "Trips" }));
    expect(builtIn).toContain("trips-wide.jpg");
    expect(builtIn).not.toContain("<video");
  });
});
