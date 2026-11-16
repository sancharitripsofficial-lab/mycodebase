import { describe, expect, it } from "vitest";
import { breadcrumbJsonLd, clip, jsonLdText, searchName, tripSeoDescription, tripSeoTitle } from "@/lib/seo";

const coorg = {
  id: "coorg",
  title: "Kodagu Rainforest & Spice Drive",
  destination: "Kodagu (Coorg), Karnataka",
  durationDays: 3,
  durationNights: 2,
  basePricePaise: 1240000,
  tagline: "Pepper vines, misty shola valleys, and quiet backroads away from busy resort strips.",
};

describe("search words for trips", () => {
  it("uses the name people search for", () => {
    expect(searchName("Kodagu (Coorg), Karnataka")).toBe("Coorg");
    expect(searchName("Chikmagalur, Karnataka")).toBe("Chikmagalur");
    expect(searchName("Hampi")).toBe("Hampi");
    expect(searchName("")).toBe("");
  });

  it("puts '<place> Trip from Bangalore – nD/nN' in the title (SEO plan §3 row T)", () => {
    expect(tripSeoTitle(coorg)).toBe("Coorg Trip from Bangalore – 3D/2N");
    expect(
      tripSeoTitle({ id: "ckm", title: "Chikmagalur Coffee & Mist Trails", destination: "Chikmagalur, Karnataka", durationDays: 3, durationNights: 2 })
    ).toBe("Chikmagalur Trip from Bangalore – 3D/2N");
  });

  it("starts the description with the facts and the page's own From price, short enough for Google", () => {
    const d = tripSeoDescription(coorg, 399900);
    expect(d.startsWith("Coorg trip from Bangalore: 3 days, 2 nights, max 6 per car, from ₹3,999 per seat.")).toBe(true);
    expect(d.length).toBeLessThanOrEqual(158);
  });
});

describe("clip", () => {
  it("leaves short text alone and cuts long text at a word", () => {
    expect(clip("Short line.")).toBe("Short line.");
    const long = "word ".repeat(60);
    const out = clip(long, 50);
    expect(out.length).toBeLessThanOrEqual(50);
    expect(out.endsWith("…")).toBe(true);
    expect(out).not.toMatch(/\s…$/);
  });
});

describe("structured data", () => {
  it("cannot close the script tag early", () => {
    const text = jsonLdText({ name: "</script><script>alert(1)</script>" });
    expect(text).not.toContain("</script>");
    expect(JSON.parse(text).name).toBe("</script><script>alert(1)</script>");
  });

  it("numbers breadcrumb steps from 1 with full addresses", () => {
    const b = breadcrumbJsonLd([
      { name: "Home", path: "/" },
      { name: "Trips", path: "/trips" },
    ]);
    expect(b.itemListElement.map((i) => i.position)).toEqual([1, 2]);
    expect(b.itemListElement[1].item).toMatch(/^https?:\/\/[^/]+\/trips$/);
  });
});
