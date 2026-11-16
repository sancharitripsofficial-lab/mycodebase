/**
 * Search metadata and structured data (SEO plan, 16 Nov 2026): one brand name, titles 50-60
 * characters, descriptions 140-158, no "weekend-only" wording, no places without a live trip,
 * and JSON-LD that parses and carries the fields Google needs. No invented ratings or reviews.
 */
import { describe, expect, it } from "vitest";
import {
  BRAND_ALT_NAMES,
  BRAND_NAME,
  BUSINESS_DESCRIPTION,
  DEFAULT_OG_IMAGE,
  HOME_DESCRIPTION,
  HOME_TITLE,
  NOT_FOUND_METADATA,
  PAGE_SEO,
  TITLE_SUFFIX,
  blogPostingJsonLd,
  businessJsonLd,
  cityOnly,
  cleanProfileUrl,
  faqJsonLd,
  hasWeekendFaq,
  jsonLdText,
  liveDestinations,
  packagesPageDescription,
  pageBreadcrumb,
  pageMetadata,
  tripImageAlt,
  tripJsonLd,
  tripListJsonLd,
  tripOgTitle,
  tripPriceInfo,
  tripSeoDescription,
  tripSeoTitle,
  tripsPageDescription,
} from "@/lib/seo";
import { getDemoState } from "@/lib/data/demo-store";
import { DEFAULT_BLOG_POSTS } from "@/lib/blog";
import type { PublicDepartureAvailability, SiteSettings, Trip, TripWithDetails } from "@/lib/types";

// --- fixtures ------------------------------------------------------------------------------------

let n = 0;
function trip(t: Partial<Trip>, departures: Partial<PublicDepartureAvailability>[] = []): TripWithDetails {
  const id = t.id ?? `t${++n}`;
  return {
    trip: {
      id, slug: id, title: "", destination: "", region: "", tagline: "", summary: "", durationDays: 3, durationNights: 2,
      difficulty: "Easy", vibe: "", basePricePaise: 0, privateGroupPricePaise: null, privateDiscountPercent: 0, depositPercent: null,
      balanceDueDaysBefore: 7, pickupCity: "Bengaluru", heroImageUrl: "", galleryUrls: [], videoLinks: [], inclusions: [], exclusions: [],
      accommodationNotes: "", packingList: [], safetyNotes: "", accessibilityNotes: "", isSampleDemo: false, isPublished: true, sortOrder: 0,
      ...t,
    },
    itinerary: [],
    pickupPoints: [],
    departures: departures.map((d, i) => ({
      departureId: `${id}-dep${i}`, tripId: id, departureCode: `D${i}`, startDate: "2099-12-04", endDate: "2099-12-06",
      maxCapacity: 6, minOccupancy: 2, departureType: "mixed", status: "open", bookingCutoffAt: "2099-12-03T12:00:00Z",
      preferenceDeadlineAt: "2099-12-01T12:00:00Z", priceOverridePaise: null, seatsTaken: 0, seatsRemaining: 6, ...d,
    })) as PublicDepartureAvailability[],
  };
}

const COORG = trip(
  {
    id: "coorg",
    slug: "coorg-rainforest-spice-drive",
    title: "Kodagu Rainforest & Spice Drive",
    destination: "Kodagu (Coorg), Karnataka",
    tagline: "Pepper vines, misty shola valleys, and quiet backroads away from busy resort strips.",
    summary: "Three slow days across South Kodagu’s spice estates.",
    basePricePaise: 499900,
    heroImageUrl: "/media/dest-coorg.jpg",
    galleryUrls: ["/media/dest-coorg.jpg", "/media/coorg-2.jpg"],
  },
  [{ priceOverridePaise: 399900 }]
);
const CHIK = trip(
  { id: "chik", slug: "chikmagalur-coffee-trails", title: "Chikmagalur Coffee & Mist Trails", destination: "Chikmagalur, Karnataka", basePricePaise: 419900 },
  [{ priceOverridePaise: 499900 }]
);
const LIVE = [COORG, CHIK];
const DEST = liveDestinations(LIVE);

const between = (s: string, min: number, max: number) => s.length >= min && s.length <= max;
const fullTitle = (t: string) => `${t}${TITLE_SUFFIX}`;

/** Every indexable page's title (as shown in Google) and description, with today's two live trips. */
function allIndexablePages() {
  const fixed = (["blog", "about", "safety", "policies", "faqs", "contact", "creators"] as const).map((k) => ({
    key: k,
    title: fullTitle(PAGE_SEO[k].title),
    description: PAGE_SEO[k].description,
  }));
  const coorgPrice = tripPriceInfo(COORG.trip, COORG.departures).fromPaise;
  const chikPrice = tripPriceInfo(CHIK.trip, CHIK.departures).fromPaise;
  return [
    { key: "home", title: HOME_TITLE, description: HOME_DESCRIPTION },
    { key: "trips", title: fullTitle(PAGE_SEO.trips.title), description: tripsPageDescription(DEST) },
    { key: "packages", title: fullTitle(PAGE_SEO.packages.title), description: packagesPageDescription(DEST) },
    { key: "trip-coorg", title: fullTitle(tripSeoTitle(COORG.trip, LIVE.map((t) => t.trip))), description: tripSeoDescription(COORG.trip, coorgPrice) },
    { key: "trip-chik", title: fullTitle(tripSeoTitle(CHIK.trip, LIVE.map((t) => t.trip))), description: tripSeoDescription(CHIK.trip, chikPrice) },
    ...fixed,
  ];
}

const settings = (patch: Partial<SiteSettings> = {}): SiteSettings => {
  const base = getDemoState().settings;
  return { ...base, ...patch };
};

// --- titles and descriptions ---------------------------------------------------------------------

describe("titles and descriptions", () => {
  it("names only the places that have a live trip", () => {
    expect(DEST).toBe("Coorg and Chikmagalur");
    const hidden = trip({ destination: "Hampi", isPublished: false });
    const twin = trip({ destination: "Coorg, Karnataka" });
    expect(liveDestinations([...LIVE, hidden, twin])).toBe("Coorg and Chikmagalur");
    expect(liveDestinations([])).toBe("");
  });

  it("every indexable title is 50-60 characters and every description 140-158", () => {
    for (const page of allIndexablePages()) {
      expect(between(page.title, 50, 60), `${page.key} title (${page.title.length}): ${page.title}`).toBe(true);
      expect(between(page.description, 140, 158), `${page.key} description (${page.description.length}): ${page.description}`).toBe(true);
    }
  });

  it("no two pages share a title or a description", () => {
    const pages = allIndexablePages();
    expect(new Set(pages.map((p) => p.title)).size).toBe(pages.length);
    expect(new Set(pages.map((p) => p.description)).size).toBe(pages.length);
  });

  it("the home title leads with the brand; every other title ends with it", () => {
    expect(HOME_TITLE.startsWith(`${BRAND_NAME} | `)).toBe(true);
    for (const page of allIndexablePages().filter((p) => p.key !== "home")) expect(page.title.endsWith(` | ${BRAND_NAME}`)).toBe(true);
  });

  it("never says the trips are weekend-only, never names places without a live trip, never a rating", () => {
    const texts = [...allIndexablePages().flatMap((p) => [p.title, p.description]), BUSINESS_DESCRIPTION, DEFAULT_OG_IMAGE.alt, PAGE_SEO.faqs.descriptionWithoutWeekendFaq];
    for (const text of texts) {
      expect(text).not.toMatch(/weekend trips|weekend road|weekend tours|weekend getaways/i);
      expect(text).not.toMatch(/Gokarna|Hampi/);
      expect(text).not.toMatch(/rated|stars?\b|best\b|#1|no\.? ?1/i);
      expect(text).not.toContain("…");
    }
    // The truthful "any day" line: scheduled dates or a private car on the traveller's dates.
    expect(HOME_DESCRIPTION).toContain("Join a scheduled date or ask for a private car on your own dates.");
    expect(tripSeoDescription(COORG.trip, 399900)).toContain("ask for a private car on your own dates");
  });

  it("the /faqs description asks the weekend question only once a visible FAQ answers it", () => {
    expect(hasWeekendFaq([{ question: "Do trips run only on weekends?", answer: "No." }])).toBe(true);
    expect(hasWeekendFaq([{ question: "Do trips run only on weekends?", answer: " " }])).toBe(false);
    expect(hasWeekendFaq([{ question: "How much luggage?", answer: "One bag." }])).toBe(false);
    // Mentions a weekend but does not ask whether trips run only then: the snippet must not claim it.
    expect(hasWeekendFaq([{ question: "What should I pack for a weekend trip?", answer: "Layers." }])).toBe(false);
    expect(hasWeekendFaq([{ question: "Are trips weekends only?", answer: "No." }])).toBe(true);
    expect(hasWeekendFaq([{ question: "Do you run trips on weekdays?", answer: "Yes." }])).toBe(true);
    expect(between(PAGE_SEO.faqs.descriptionWithoutWeekendFaq, 140, 158)).toBe(true);
  });

  it("promises nothing the pages do not say: no luggage answer, no unasked booking rules", () => {
    for (const d of [PAGE_SEO.faqs.description, PAGE_SEO.faqs.descriptionWithoutWeekendFaq, PAGE_SEO.safety.description]) {
      expect(d).not.toMatch(/luggage|booking rules/i);
    }
  });

  it("the private car is always something you ask for, never a plain offer on any date", () => {
    for (const d of [packagesPageDescription(DEST), packagesPageDescription(""), tripsPageDescription(DEST), PAGE_SEO.about.description]) {
      expect(d).toContain("ask for a private car");
      expect(d).not.toMatch(/as a private car|dates or a private car/i);
    }
  });

  it("long place lists fall back to a short line instead of a cut-off one", () => {
    const many = "Coorg, Chikmagalur, Sakleshpur, Agumbe, Dandeli, Kudremukh and Badami";
    for (const d of [tripsPageDescription(many), packagesPageDescription(many), tripsPageDescription(""), packagesPageDescription("")]) {
      expect(d.length).toBeLessThanOrEqual(158);
      expect(d).not.toContain("…");
      expect(d).not.toContain("Badami");
    }
  });
});

describe("trip titles", () => {
  it("follows '{Place} Trip from Bangalore – {d}D/{n}N' within 60 characters with the brand", () => {
    expect(tripSeoTitle(COORG.trip, LIVE.map((t) => t.trip))).toBe("Coorg Trip from Bangalore – 3D/2N");
    expect(tripSeoTitle(CHIK.trip, LIVE.map((t) => t.trip))).toBe("Chikmagalur Trip from Bangalore – 3D/2N");
    expect(tripSeoTitle({ ...CHIK.trip, durationDays: 2, durationNights: 1 })).toBe("Chikmagalur Trip from Bangalore – 2D/1N");
  });

  it("says 'Day Trip' when there is no night", () => {
    expect(tripSeoTitle({ ...COORG.trip, durationDays: 1, durationNights: 0 })).toBe("Coorg Day Trip from Bangalore");
  });

  it("uses the trip's own title when two live trips go to the same place, still within 60", () => {
    const second = trip({ id: "coorg2", title: "Coorg Coffee Estates & Waterfalls Long Drive Edition", destination: "Kodagu (Coorg), Karnataka" });
    const t = tripSeoTitle(second.trip, [COORG.trip, second.trip]);
    expect(t.startsWith("Coorg Coffee Estates")).toBe(true);
    expect(fullTitle(t).length).toBeLessThanOrEqual(60);
    expect(fullTitle(tripSeoTitle(COORG.trip, [COORG.trip, second.trip])).length).toBeLessThanOrEqual(60);
  });

  it("a very long place name never pushes the title past 60", () => {
    const long = trip({ title: "X", destination: "Kalasa Horanadu Kudremukh National Park Region, Karnataka" });
    expect(fullTitle(tripSeoTitle(long.trip)).length).toBeLessThanOrEqual(60);
  });

  it("og:title carries the trip's own name and the place, never the place twice", () => {
    expect(tripOgTitle(COORG.trip)).toBe("Kodagu Rainforest & Spice Drive – Coorg Trip from Bangalore");
    expect(tripOgTitle(CHIK.trip)).toBe("Chikmagalur Coffee & Mist Trails – Trip from Bangalore");
    expect(tripImageAlt(COORG.trip)).toBe("Kodagu Rainforest & Spice Drive, Coorg");
    expect(tripImageAlt(CHIK.trip)).toBe("Chikmagalur Coffee & Mist Trails");
  });

  it("two trips to one place: the title names the place once", () => {
    const second = trip({ id: "chik2", title: "Chikmagalur Peaks", destination: "Chikmagalur, Karnataka" });
    expect(tripSeoTitle(CHIK.trip, [CHIK.trip, second.trip])).toBe("Chikmagalur Coffee & Mist Trails");
    expect(tripSeoTitle(second.trip, [CHIK.trip, second.trip])).toBe("Chikmagalur Peaks – Trip from Bangalore");
  });

  it("leaves out days and nights that disagree with the itinerary (owner fact F1)", () => {
    // Live today: saved as 2 days / 1 night, but the itinerary runs Day 1-3.
    const disputed = { ...CHIK.trip, durationDays: 2, durationNights: 1 };
    expect(tripSeoTitle(disputed, [], 3)).toBe("Chikmagalur Trip from Bangalore");
    const d = tripSeoDescription(disputed, 499900, 6, 3);
    expect(d).not.toMatch(/\d+ days?|night/);
    expect(d).toContain("Chikmagalur trip from Bangalore: max 6 per car, from ₹4,999 per seat.");
    // Matching itinerary, or none: the figure is printed.
    expect(tripSeoTitle(disputed, [], 2)).toBe("Chikmagalur Trip from Bangalore – 2D/1N");
    expect(tripSeoTitle(disputed, [], 0)).toBe("Chikmagalur Trip from Bangalore – 2D/1N");
    expect(tripSeoTitle({ ...COORG.trip, durationDays: 1, durationNights: 0 }, [], 2)).toBe("Coorg Trip from Bangalore");
  });

  it("the description says 1 night, not 1 nights, and uses the price it is given", () => {
    const d = tripSeoDescription({ ...CHIK.trip, durationDays: 2, durationNights: 1 }, 499900);
    expect(d).toContain("2 days, 1 night,");
    expect(d).toContain("from ₹4,999 per seat");
  });
});

describe("the 'From' price (one number everywhere)", () => {
  it("is the lowest bookable date price, not the base price when no date costs that", () => {
    expect(tripPriceInfo(CHIK.trip, CHIK.departures).fromPaise).toBe(499900); // base ₹4,199, only date ₹4,999
    expect(tripPriceInfo(COORG.trip, COORG.departures).fromPaise).toBe(399900);
  });

  it("ignores full, cancelled and closed dates; falls back to the base price with no open date", () => {
    const t = trip({ basePricePaise: 450000 }, [
      { priceOverridePaise: 100000, seatsRemaining: 0 },
      { priceOverridePaise: 200000, status: "cancelled" },
      { priceOverridePaise: 300000, bookingCutoffAt: "2000-01-01T00:00:00Z" },
    ]);
    const info = tripPriceInfo(t.trip, t.departures);
    expect(info).toMatchObject({ fromPaise: 450000, bookable: false, offerCount: 0 });
  });
});

// --- page metadata -------------------------------------------------------------------------------

describe("pageMetadata", () => {
  it("always sets the canonical, og:url, site name, locale, an image with alt and a large Twitter card", () => {
    const m = pageMetadata({ title: PAGE_SEO.about.title, description: PAGE_SEO.about.description, path: "/about" });
    expect(m.title).toBe(PAGE_SEO.about.title);
    expect(m.alternates?.canonical).toBe("/about");
    const og = m.openGraph as Record<string, unknown>;
    expect(og.url).toBe("/about");
    expect(og.siteName).toBe(BRAND_NAME);
    expect(og.locale).toBe("en_IN");
    expect((og.images as { alt: string }[])[0].alt).toBeTruthy();
    // Versioned share-card address (no content hash once pages pass their own image).
    expect((og.images as { url: string }[])[0].url).toMatch(/^\/opengraph-image\?v=\d+$/);
    const tw = m.twitter as Record<string, unknown>;
    expect(tw.card).toBe("summary_large_image");
    expect(tw.description).toBe(PAGE_SEO.about.description);
    expect(m.robots).toBeUndefined();
  });

  it("supports the brand-first home title, article pages and noindex", () => {
    expect(pageMetadata({ title: HOME_TITLE, description: HOME_DESCRIPTION, path: "/", absoluteTitle: true }).title).toEqual({ absolute: HOME_TITLE });
    const a = pageMetadata({ title: "Story", description: "d", path: "/blog/x", type: "article", publishedTime: "2026-11-01T12:00:00+05:30" });
    expect((a.openGraph as Record<string, unknown>).type).toBe("article");
    expect((a.openGraph as Record<string, unknown>).publishedTime).toBe("2026-11-01T12:00:00+05:30");
    expect(pageMetadata({ title: "x", description: "y", path: "/booking-lookup", noindex: true }).robots).toEqual({ index: false, follow: true });
  });

  it("not-found pages have their own share card and no address of their own", () => {
    expect(NOT_FOUND_METADATA.robots).toEqual({ index: false, follow: true });
    expect(NOT_FOUND_METADATA.alternates).toBeUndefined();
    const og = NOT_FOUND_METADATA.openGraph as Record<string, unknown>;
    expect(og.title).toBe(PAGE_SEO.notFound.title);
    expect(og.url).toBeUndefined();
    expect((NOT_FOUND_METADATA.twitter as Record<string, unknown>).title).toBe(PAGE_SEO.notFound.title);
  });

  it("canonicals never carry a query string", () => {
    for (const k of Object.keys(PAGE_SEO) as (keyof typeof PAGE_SEO)[]) expect(PAGE_SEO[k].path).not.toContain("?");
  });
});

// --- structured data -----------------------------------------------------------------------------

const parse = (data: unknown) => JSON.parse(jsonLdText(data));

describe("business and website JSON-LD", () => {
  const s = settings({
    socialLinks: {
      ...getDemoState().settings.socialLinks,
      instagramUrl: "https://www.instagram.com/sancharitrips?igsh=abc&utm_source=qr",
      youtubeUrl: "https://youtube.com/@sancharitrips?si=xyz",
      facebookUrl: "",
      whatsappNumber: "919876543210",
    },
    brandIdentity: {
      ...getDemoState().settings.brandIdentity,
      baseCity: "Bengaluru, Karnataka",
      legalEntityName: "Sanchari Trips",
      supportEmail: "hello@example.com",
      isCopyDraft: false,
    },
  });
  const ld = parse(businessJsonLd(s));
  const business = ld["@graph"].find((n: { "@type": string }) => n["@type"] === "TravelAgency");
  const site = ld["@graph"].find((n: { "@type": string }) => n["@type"] === "WebSite");

  it("parses, with both nodes named the same and the alternate names ending in the domain", () => {
    expect(ld["@context"]).toBe("https://schema.org");
    expect(business.name).toBe(BRAND_NAME);
    expect(site.name).toBe(BRAND_NAME);
    for (const node of [business, site]) {
      expect(node.alternateName).toEqual([...BRAND_ALT_NAMES]);
      expect(node.alternateName[node.alternateName.length - 1]).toBe("sancharitrips.com");
      expect(node["@id"]).toMatch(/^https?:\/\/.+\/#(business|website)$/);
      expect(node.url).toMatch(/^https?:\/\/.+\/$/);
    }
    expect(site.publisher["@id"]).toBe(business["@id"]);
  });

  it("has the business fields Google reads, from real settings only", () => {
    expect(business.logo).toMatch(/\/brand\/sanchari-logo\.png$/);
    expect(business.address.addressLocality).toBe("Bengaluru");
    expect(business.address.addressCountry).toBe("IN");
    expect(business.legalName).toBe("Sanchari Trips");
    expect(business.email).toBe("hello@example.com");
    expect(business.telephone).toBe("+919876543210");
    expect(business.sameAs).toEqual(["https://www.instagram.com/sancharitrips/", "https://www.youtube.com/@sancharitrips"]);
    for (const url of business.sameAs) expect(url).not.toContain("?");
    expect(business.priceRange).toBeUndefined();
    const text = JSON.stringify(ld);
    expect(text).not.toMatch(/weekend|Gokarna|Hampi/i);
    expect(text).not.toMatch(/aggregateRating|ratingValue|"review"/i);
  });

  it("leaves out placeholders the owner has not filled in", () => {
    const draft = parse(businessJsonLd(getDemoState().settings))["@graph"][0];
    expect(draft.legalName).toBeUndefined();
    // A real-looking legal name is still left out while the owner marks the copy as a draft.
    const unverified = settings({ brandIdentity: { ...s.brandIdentity, isCopyDraft: true } });
    expect(parse(businessJsonLd(unverified))["@graph"][0].legalName).toBeUndefined();
    expect(draft.email).toBeUndefined();
    expect(draft.address.addressLocality).not.toContain(",");
  });

  it("points the site search at /trips?q=", () => {
    expect(site.potentialAction["@type"]).toBe("SearchAction");
    expect(site.potentialAction.target.urlTemplate).toMatch(/\/trips\?q=\{search_term_string\}$/);
    expect(site.potentialAction["query-input"]).toBe("required name=search_term_string");
    expect(parse(businessJsonLd(s, { searchAction: false }))["@graph"][1].potentialAction).toBeUndefined();
  });
});

describe("trip JSON-LD", () => {
  it("is a TouristTrip whose Offer price is the page's From price, with no rating fields", () => {
    const info = tripPriceInfo(COORG.trip, COORG.departures);
    const ld = parse(tripJsonLd(COORG, info));
    expect(ld["@type"]).toBe("TouristTrip");
    expect(ld.name).toBe(COORG.trip.title);
    expect(ld.url).toMatch(/\/trips\/coorg-rainforest-spice-drive$/);
    expect(ld.offers).toMatchObject({ "@type": "Offer", price: "3999", priceCurrency: "INR", availability: "https://schema.org/InStock" });
    expect(ld.provider.name).toBe(BRAND_NAME);
    expect(ld.provider["@id"]).toMatch(/\/#business$/);
    expect(ld.touristType.join(" ")).not.toMatch(/weekend/i);
    expect(JSON.stringify(ld)).not.toMatch(/aggregateRating|ratingValue|"review"|Product/i);
  });

  it("uses the tagline, not a summary that may repeat a disputed day count, when the itinerary disagrees", () => {
    const disputed = {
      ...trip({ durationDays: 2, durationNights: 1, tagline: "Coffee estates and misty ridges.", summary: "A calm 3-day weekend drive." }),
      itinerary: [1, 2, 3].map((dayNumber) => ({ dayNumber, title: `Day ${dayNumber}` })) as TripWithDetails["itinerary"],
    };
    expect(parse(tripJsonLd(disputed, tripPriceInfo(disputed.trip, disputed.departures))).description).toBe("Coffee estates and misty ridges.");
    const agreed = { ...disputed, trip: { ...disputed.trip, durationDays: 3, durationNights: 2 } };
    expect(parse(tripJsonLd(agreed, tripPriceInfo(agreed.trip, agreed.departures))).description).toBe("A calm 3-day weekend drive.");
  });

  it("lists each picture once", () => {
    const ld = parse(tripJsonLd(COORG, tripPriceInfo(COORG.trip, COORG.departures)));
    expect(ld.image).toHaveLength(2);
    expect(new Set(ld.image).size).toBe(ld.image.length);
  });

  it("uses AggregateOffer for several different date prices and SoldOut when nothing can be booked", () => {
    const multi = trip({ basePricePaise: 400000 }, [{ priceOverridePaise: 350000 }, { priceOverridePaise: 450000 }]);
    const ld = parse(tripJsonLd(multi, tripPriceInfo(multi.trip, multi.departures)));
    expect(ld.offers).toMatchObject({ "@type": "AggregateOffer", lowPrice: "3500", highPrice: "4500", offerCount: 2, priceCurrency: "INR" });

    const full = trip({ basePricePaise: 400000 }, [{ seatsRemaining: 0, status: "sold_out" }]);
    const sold = parse(tripJsonLd(full, tripPriceInfo(full.trip, full.departures)));
    expect(sold.offers).toMatchObject({ "@type": "Offer", price: "4000", availability: "https://schema.org/SoldOut" });
  });
});

describe("other JSON-LD", () => {
  it("breadcrumbs start at Home with absolute addresses", () => {
    const b = parse(pageBreadcrumb("Trips", "/trips"));
    expect(b["@type"]).toBe("BreadcrumbList");
    expect(b.itemListElement.map((i: { name: string }) => i.name)).toEqual(["Home", "Trips"]);
    expect(b.itemListElement[1].item).toMatch(/^https?:\/\/[^/]+\/trips$/);
  });

  it("the trip list holds published trips only, numbered from 1", () => {
    const hidden = trip({ id: "hidden", title: "Hidden", isPublished: false });
    const list = parse(tripListJsonLd("Road trips from Bangalore", [...LIVE, hidden]));
    expect(list["@type"]).toBe("ItemList");
    expect(list.numberOfItems).toBe(2);
    expect(list.itemListElement.map((i: { position: number }) => i.position)).toEqual([1, 2]);
    expect(JSON.stringify(list)).not.toContain("Hidden");
  });

  it("FAQPage holds only answered questions, and cannot break out of its script tag", () => {
    const ld = parse(
      faqJsonLd([
        { question: "Do trips run only on weekends?", answer: "No. Scheduled trips run on the dates listed on each trip page." },
        { question: "Empty?", answer: "  " },
        { question: "</script>", answer: "<b>x</b>" },
      ])
    );
    expect(ld["@type"]).toBe("FAQPage");
    expect(ld.mainEntity).toHaveLength(2);
    expect(ld.mainEntity[0]).toMatchObject({ "@type": "Question", acceptedAnswer: { "@type": "Answer" } });
    expect(jsonLdText(faqJsonLd([{ question: "</script>", answer: "a" }]))).not.toContain("</script>");
  });

  it("BlogPosting has the required fields, the brand as author and publisher, and the video", () => {
    const ld = parse(
      blogPostingJsonLd({ id: "a-sanchari-weekend", title: "Six seats, one car", excerpt: "Dawn pickup.", publishedOn: "2026-11-01", posterUrl: "/p.jpg", videoUrl: "/v.mp4" })
    );
    expect(ld["@type"]).toBe("BlogPosting");
    expect(ld.headline).toBe("Six seats, one car");
    expect(ld.datePublished).toBe("2026-11-01T12:00:00+05:30");
    expect(ld.dateModified).toBe(ld.datePublished);
    expect(ld.inLanguage).toBe("en-IN");
    expect(ld.mainEntityOfPage).toMatch(/\/blog\/a-sanchari-weekend$/);
    expect(ld.author).toMatchObject({ "@type": "Organization", name: BRAND_NAME });
    expect(ld.publisher.logo.url).toMatch(/sanchari-logo\.png$/);
    expect(ld.video).toMatchObject({ "@type": "VideoObject", contentUrl: expect.stringMatching(/\/v\.mp4$/) });
  });
});

describe("fixed page titles name only what the page offers", () => {
  it("the FAQ title names no dates and the creators title promises no free seats", () => {
    expect(PAGE_SEO.faqs.title).not.toMatch(/date/i);
    expect(PAGE_SEO.creators.title).not.toMatch(/free/i);
  });
});

describe("small helpers", () => {
  it("cleans social profile links", () => {
    expect(cleanProfileUrl("https://www.instagram.com/sancharitrips?igsh=1&utm_source=qr")).toBe("https://www.instagram.com/sancharitrips/");
    expect(cleanProfileUrl("https://instagram.com/sancharitrips/reels/#x")).toBe("https://www.instagram.com/sancharitrips/");
    expect(cleanProfileUrl("https://m.youtube.com/@sancharitrips/videos?si=1")).toBe("https://www.youtube.com/@sancharitrips");
    expect(cleanProfileUrl("https://www.facebook.com/sanchari.trips/?ref=1")).toBe("https://www.facebook.com/sanchari.trips");
    // A new Facebook page has no handle: its id is the profile, only the tracking bits go.
    expect(cleanProfileUrl("https://www.facebook.com/profile.php?id=61550000000000&mibextid=ZbWKwL&utm_source=qr")).toBe(
      "https://www.facebook.com/profile.php?id=61550000000000"
    );
    expect(cleanProfileUrl("https://m.facebook.com/profile.php?id=61550000000000&fbclid=abc#x")).toBe("https://m.facebook.com/profile.php?id=61550000000000");
    expect(cleanProfileUrl("http://insecure.example")).toBeNull();
    expect(cleanProfileUrl("")).toBeNull();
  });

  it("keeps only the city", () => {
    expect(cityOnly("Bengaluru, Karnataka")).toBe("Bengaluru");
    expect(cityOnly("")).toBe("");
  });
});

describe("built-in blog posts", () => {
  it("name no place without a trip (no Gokarna or Hampi, no beach)", () => {
    for (const post of DEFAULT_BLOG_POSTS.filter((p) => p.published)) {
      const text = [post.title, post.excerpt, post.body].join(" ");
      expect(text).not.toMatch(/Gokarna|Hampi|beach|by the sea/i);
    }
  });
});
