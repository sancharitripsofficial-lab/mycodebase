/**
 * Karnataka guide pages (/karnataka and /karnataka/[slug]): every region, district and kind of
 * place has one page, built only from the fact-checked place list. Titles fit Google's width,
 * descriptions fit its snippet, and nothing claims a rating, a price or a trip we do not run.
 */
import { describe, expect, it } from "vitest";
import { TITLE_SUFFIX } from "@/lib/seo";
import { CATEGORY_ORDER, KARNATAKA_DISTRICTS, KARNATAKA_PLACES } from "@/lib/places/karnataka-places";
import { GUIDE_HUB, GUIDE_PAGES, GUIDE_REGIONS, GUIDE_UPDATED_ON, districtGuide, guidePage, guidePagesOfKind, tripsForPlaces } from "@/lib/places/guide";
import type { Trip, TripWithDetails } from "@/lib/types";

const full = (title: string) => `${title}${TITLE_SUFFIX}`;

function trip(t: Partial<Trip>): TripWithDetails {
  return {
    trip: {
      id: "t", slug: "t", title: "", destination: "", region: "", tagline: "", summary: "", durationDays: 3, durationNights: 2,
      difficulty: "Easy", vibe: "", basePricePaise: 0, privateGroupPricePaise: null, privateDiscountPercent: 0, depositPercent: null,
      balanceDueDaysBefore: 7, pickupCity: "Bengaluru", heroImageUrl: "", galleryUrls: [], videoLinks: [], inclusions: [], exclusions: [],
      accommodationNotes: "", packingList: [], safetyNotes: "", accessibilityNotes: "", isSampleDemo: false, isPublished: true, sortOrder: 0,
      ...t,
    } as Trip,
    itinerary: [],
    pickupPoints: [],
    departures: [],
  };
}

describe("Karnataka guide pages", () => {
  it("has one page for each of the 6 regions, 31 districts and 12 kinds of place", () => {
    expect(guidePagesOfKind("region")).toHaveLength(6);
    expect(guidePagesOfKind("district")).toHaveLength(KARNATAKA_DISTRICTS.length);
    expect(guidePagesOfKind("district")).toHaveLength(31);
    expect(guidePagesOfKind("category")).toHaveLength(CATEGORY_ORDER.length);
    expect(GUIDE_PAGES).toHaveLength(49);
  });

  it("gives every page its own address, title and description", () => {
    const slugs = GUIDE_PAGES.map((p) => p.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const slug of slugs) expect(slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
    expect(new Set(GUIDE_PAGES.map((p) => p.title)).size).toBe(GUIDE_PAGES.length);
    expect(new Set(GUIDE_PAGES.map((p) => p.description)).size).toBe(GUIDE_PAGES.length);
    expect(new Set(GUIDE_PAGES.map((p) => p.h1)).size).toBe(GUIDE_PAGES.length);
  });

  it("keeps every title within 60 characters with the brand, and every description within 158", () => {
    for (const p of [...GUIDE_PAGES, GUIDE_HUB]) {
      expect(full(p.title).length, `${p.path} title: ${full(p.title)}`).toBeLessThanOrEqual(60);
      expect(full(p.title).length, `${p.path} title: ${full(p.title)}`).toBeGreaterThanOrEqual(40);
      expect(p.description.length, `${p.path} description (${p.description.length}): ${p.description}`).toBeLessThanOrEqual(158);
      expect(p.description.length, `${p.path} description (${p.description.length}): ${p.description}`).toBeGreaterThanOrEqual(120);
      expect(p.description).not.toContain("…");
    }
  });

  it("claims no rating, price, distance or timing, and never says a trip runs there", () => {
    for (const p of GUIDE_PAGES) {
      const text = [p.title, p.description, p.h1, ...p.intro].join(" ");
      expect(text, p.path).not.toMatch(/\bbest\b|top[- ]rated|#1|no\.? ?1|\bstars?\b|₹|\bkm\b|\bhours?\b|cheapest|guaranteed/i);
      expect(text, p.path).not.toMatch(/weekend/i);
      expect(text, p.path).not.toMatch(/we run|our trip to|book now/i);
    }
  });

  it("lists every place on its district page, and on each kind-of-place page it belongs to", () => {
    for (const place of KARNATAKA_PLACES) {
      const d = districtGuide(place.district);
      expect(d, place.name).not.toBeNull();
      expect(d!.places.includes(place), place.name).toBe(true);
      expect(d!.groups.flatMap((g) => g.places).includes(place), place.name).toBe(true);
    }
    for (const p of guidePagesOfKind("category")) {
      expect(p.places.length).toBeGreaterThan(0);
      for (const place of p.places) expect(place.categories.includes(p.category!)).toBe(true);
      // The count in the title is the number of places on the page.
      const n = p.title.match(/\d+/)?.[0];
      if (n) expect(Number(n)).toBe(p.places.length);
    }
    const all = guidePagesOfKind("region").flatMap((p) => p.places);
    expect(all).toHaveLength(KARNATAKA_PLACES.length);
  });

  it("groups have no empty sections and link only to pages that exist", () => {
    for (const p of GUIDE_PAGES) {
      expect(p.groups.length, p.path).toBeGreaterThan(0);
      expect(p.groups.flatMap((g) => g.places)).toHaveLength(p.places.length);
      for (const g of p.groups) {
        expect(g.places.length).toBeGreaterThan(0);
        if (g.href) expect(guidePage(g.href.split("/").pop()!), g.href).not.toBeNull();
      }
    }
  });

  it("uses the names people search: Coorg, Chikmagalur, Mysore, Hampi, Bangalore", () => {
    expect(guidePage("kodagu")?.title).toBe("Places to Visit in Coorg (Kodagu)");
    expect(guidePage("kodagu")?.h1).toBe("Places to visit in Kodagu (Coorg)");
    expect(guidePage("chikkamagaluru")?.title).toBe("Places to Visit in Chikmagalur");
    expect(guidePage("mysuru")?.title).toBe("Places to Visit in Mysuru (Mysore)");
    expect(guidePage("vijayanagara")?.title).toBe("Places to Visit in Hampi & Vijayanagara");
    expect(guidePage("near-bangalore")?.title).toBe("Places to Visit near Bangalore");
    expect(guidePage("waterfalls")?.h1).toBe("Waterfalls in Karnataka");
    expect(guidePage("no-such-page")).toBeNull();
  });

  it("regions cover every district exactly once", () => {
    const covered = GUIDE_REGIONS.flatMap((r) => KARNATAKA_DISTRICTS.filter((d) => d.region === r.region).map((d) => d.name));
    expect(covered.sort()).toEqual(KARNATAKA_DISTRICTS.map((d) => d.name).sort());
  });

  it("dates the guide with a real calendar day", () => {
    expect(GUIDE_UPDATED_ON).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(Number.isNaN(new Date(`${GUIDE_UPDATED_ON}T12:00:00Z`).getTime())).toBe(false);
  });
});

describe("trips shown on a guide page", () => {
  const coorg = trip({ id: "c", slug: "coorg", title: "Kodagu Rainforest & Spice Drive", destination: "Kodagu (Coorg), Karnataka" });
  const chik = trip({ id: "k", slug: "chik", title: "Chikmagalur Coffee & Mist Trails", destination: "Chikmagalur, Karnataka" });
  const hidden = trip({ id: "h", slug: "hampi", title: "Hampi Boulders", destination: "Hampi, Karnataka", isPublished: false });
  const live = [coorg, chik, hidden];

  it("shows a district's own trips only, and never an unpublished one", () => {
    expect(tripsForPlaces(guidePage("kodagu")!.places, live)).toEqual([coorg]);
    expect(tripsForPlaces(guidePage("chikkamagaluru")!.places, live)).toEqual([chik]);
    expect(tripsForPlaces(guidePage("vijayanagara")!.places, live)).toEqual([]);
    expect(tripsForPlaces(guidePage("udupi")!.places, live)).toEqual([]);
  });

  it("shows a region's trips once each, in list order", () => {
    expect(tripsForPlaces(guidePage("malnad-western-ghats")!.places, live)).toEqual([coorg, chik]);
    expect(tripsForPlaces(guidePage("north-karnataka")!.places, live)).toEqual([]);
  });
});

// --- search wiring: sitemap, new landing pages, IndexNow ------------------------------------------

import { DEFAULT_BLOG_POSTS } from "@/lib/blog";
import { INDEXNOW_KEY, indexNowBody } from "@/lib/indexnow";
import { WELL_KNOWN_PLACES } from "@/lib/places/guide";
import { PAGE_SEO, guideListJsonLd, jsonLdText } from "@/lib/seo";
import { buildSitemap, sitemapXml } from "@/lib/sitemap-entries";
import { readFileSync } from "node:fs";

describe("guide wiring", () => {
  const BASE = "https://www.sancharitrips.com";
  const map = buildSitemap({ baseUrl: BASE, trips: [], isDemoFallback: false, posts: DEFAULT_BLOG_POSTS });
  const urls = map.map((e) => e.url);

  it("names only real places first in descriptions", () => {
    const names = new Set(KARNATAKA_PLACES.map((p) => p.name));
    for (const name of WELL_KNOWN_PLACES) expect(names.has(name), name).toBe(true);
    for (const p of GUIDE_PAGES) expect(p.description, p.path).not.toMatch(/(\b[A-Z][\w' ]+), \1\b/); // no "Sandur, Sandur"
  });

  it("lists the hub, every guide page and the three new landing pages in the sitemap, each once", () => {
    expect(urls).toContain(`${BASE}/karnataka`);
    for (const p of GUIDE_PAGES) expect(urls, p.path).toContain(`${BASE}${p.path}`);
    for (const k of ["weekend", "privateCar", "offers"] as const) expect(urls).toContain(`${BASE}${PAGE_SEO[k].path}`);
    expect(new Set(urls).size).toBe(urls.length);
  });

  it("dates guide pages with the guide's real day and leaves live pages undated", () => {
    const entry = (path: string) => map.find((e) => e.url === `${BASE}${path}`);
    expect(entry("/karnataka/kodagu")?.lastModified).toBe(GUIDE_UPDATED_ON);
    expect(entry("/karnataka")?.lastModified).toBe(GUIDE_UPDATED_ON);
    expect(entry("/weekend-trips-from-bangalore")?.lastModified).toBeUndefined();
    expect(entry("/offers")?.lastModified).toBeUndefined();
  });

  it("prints a valid sitemap document", () => {
    const xml = sitemapXml([...map, { url: `${BASE}/x?a=1&b=2` }]);
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
    expect(xml).toContain('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">');
    expect(xml).toContain(`<loc>${BASE}/karnataka/kodagu</loc><lastmod>${GUIDE_UPDATED_ON}</lastmod>`);
    expect(xml).toContain("<loc>https://www.sancharitrips.com/x?a=1&amp;b=2</loc>");
    expect(xml.match(/<url>/g)).toHaveLength(map.length + 1);
    expect(xml.match(/<\/url>/g)).toHaveLength(map.length + 1);
  });

  it("the new landing pages have titles within 60 and descriptions of 140-158 characters", () => {
    for (const k of ["weekend", "privateCar", "offers"] as const) {
      const p = PAGE_SEO[k];
      expect(full(p.title).length, `${k}: ${full(p.title)}`).toBeLessThanOrEqual(60);
      expect(full(p.title).length, `${k}: ${full(p.title)}`).toBeGreaterThanOrEqual(50);
      expect(p.description.length, `${k} (${p.description.length})`).toBeGreaterThanOrEqual(140);
      expect(p.description.length, `${k} (${p.description.length})`).toBeLessThanOrEqual(158);
      expect(p.description).not.toMatch(/\bbest\b|#1|rated|cheapest|guaranteed/i);
    }
    // The private car is something you ask for on your own dates, never a promise for any date.
    expect(PAGE_SEO.weekend.description).toContain("ask for a private car on your own dates");
    expect(PAGE_SEO.privateCar.description).toContain("ask for a private or custom trip on your own dates");
  });

  it("marks up the places as a list that parses, towns as places and the rest as attractions", () => {
    const page = guidePage("mysuru")!;
    const ld = JSON.parse(jsonLdText(guideListJsonLd(page.h1, page.places)));
    expect(ld["@type"]).toBe("ItemList");
    expect(ld.numberOfItems).toBe(ld.itemListElement.length);
    expect(ld.itemListElement[0].position).toBe(1);
    const types = new Set(ld.itemListElement.map((i: { item: { "@type": string } }) => i.item["@type"]));
    expect([...types].sort()).toEqual(["Place", "TouristAttraction"]);
    expect(JSON.stringify(ld)).not.toMatch(/aggregateRating|ratingValue|"review"|price/i);
    const big = JSON.parse(jsonLdText(guideListJsonLd("x", guidePage("heritage-history")!.places)));
    expect(big.itemListElement).toHaveLength(60);
    expect(big.numberOfItems).toBe(60);
  });

  it("IndexNow: the key file matches the key, and a ping carries this site's own addresses only", () => {
    expect(INDEXNOW_KEY).toMatch(/^[a-f0-9]{32}$/);
    expect(readFileSync(`public/${INDEXNOW_KEY}.txt`, "utf8").trim()).toBe(INDEXNOW_KEY);
    const body = indexNowBody(["/trips", `${BASE}/karnataka`, `${BASE}/karnataka`, "https://evil.example/x", "not a url"], BASE);
    expect(body.host).toBe("www.sancharitrips.com");
    expect(body.keyLocation).toBe(`${BASE}/${INDEXNOW_KEY}.txt`);
    expect(body.urlList).toEqual([`${BASE}/trips`, `${BASE}/karnataka`, `${BASE}/not a url`]);
  });
});
