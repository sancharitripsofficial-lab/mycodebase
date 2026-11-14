import { describe, expect, it } from "vitest";
import { breadcrumbJsonLd, clip, jsonLdText, searchName, tripSeoDescription, tripSeoTitle } from "@/lib/seo";

const coorg = {
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

  it("puts '<place> trip from Bangalore' in the title, without repeating the place", () => {
    expect(tripSeoTitle(coorg)).toBe("Kodagu Rainforest & Spice Drive – 3-Day Coorg Trip from Bangalore");
    expect(
      tripSeoTitle({ title: "Chikmagalur Coffee & Mist Trails", destination: "Chikmagalur, Karnataka", durationDays: 3 })
    ).toBe("Chikmagalur Coffee & Mist Trails – 3-Day Trip from Bangalore");
  });

  it("starts the description with the facts and keeps it short enough for Google", () => {
    const d = tripSeoDescription(coorg);
    expect(d.startsWith("Coorg trip from Bangalore: 3 days, 2 nights, max 6 per car, from ₹12,400 per seat.")).toBe(true);
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
