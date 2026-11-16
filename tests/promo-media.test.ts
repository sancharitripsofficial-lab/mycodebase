/**
 * Soft blurred backgrounds behind offer pictures must never download the upload itself: on 16 Nov the
 * three offer pictures were 5-8 MB each and the blur fetched them whole.
 */
import { beforeAll, describe, expect, it } from "vitest";

type Media = typeof import("@/lib/media");
let media: Media;
const UPLOADS = "https://abc.supabase.co/storage/v1/object/public/media/uploads/";

beforeAll(async () => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://abc.supabase.co";
  media = await import("@/lib/media");
});

describe("small copy of a picture for blurred backgrounds", () => {
  it("uploads and site files come from the image service at 128 px", () => {
    expect(media.softImageSrc(`${UPLOADS}20261116-img-0926-f2c40d.png`)).toBe(
      `/_next/image?url=${encodeURIComponent(`${UPLOADS}20261116-img-0926-f2c40d.png`)}&w=128&q=75`
    );
    expect(media.softImageSrc("/media/dest-coorg.jpg")).toBe("/_next/image?url=%2Fmedia%2Fdest-coorg.jpg&w=128&q=75");
  });

  it("other links, already-resized links and empty values stay as they are", () => {
    expect(media.softImageSrc("https://example.com/poster.jpg")).toBe("https://example.com/poster.jpg");
    expect(media.softImageSrc("https://other.supabase.co/storage/v1/object/public/media/a.png")).toBe(
      "https://other.supabase.co/storage/v1/object/public/media/a.png"
    );
    expect(media.softImageSrc("/_next/image?url=%2Fmedia%2Fa.jpg&w=640&q=75")).toBe("/_next/image?url=%2Fmedia%2Fa.jpg&w=640&q=75");
    expect(media.softImageSrc("")).toBe("");
  });

  it("128 px is a size the image service accepts", async () => {
    const { imageConfigDefault } = await import("next/dist/shared/lib/image-config");
    expect([...imageConfigDefault.imageSizes, ...imageConfigDefault.deviceSizes]).toContain(128);
  });
});
