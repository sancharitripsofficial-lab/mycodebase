/**
 * Trip address changes (SEO plan §6): an old slug redirects for good only when the new slug is a
 * live trip, the new slug works (temporarily redirected) before the rename, and neither address
 * ever 404s during the switch. Plus the /trips?q= search text and the sitemap.
 */
import { describe, expect, it } from "vitest";
import {
  TRIP_SLUG_REDIRECTS,
  decideMovedTrip,
  demoRenderWouldMislead,
  expandTripSlugs,
  resolveTripSlug,
  sameTripSlug,
  tripRedirectTarget,
  tripSlugAliases,
  tripStaticSlugs,
} from "@/lib/trip-slugs";
import { MAX_URL_QUERY, readTripQuery, tripIdsForQuery, withoutTripQuery } from "@/lib/trip-query";
import { buildSitemap } from "@/lib/sitemap-entries";
import { DEFAULT_BLOG_POSTS } from "@/lib/blog";
import { DEFAULT_HOME_CONTENT, OLD_HOME_DEFAULTS, mergeHomeContent } from "@/lib/home-content";
import { asLang, langFromCookieString } from "@/lib/i18n/lang-cookie";
import { config as middlewareConfig } from "@/middleware";
import type { Trip, TripWithDetails } from "@/lib/types";

const OLD = "coorg-rainforest-slow-drive";
const NEW = "coorg-rainforest-spice-drive";
const CHIK = "chikmagalur-coffee-trails";
const SLUG_RULE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

describe("?lang= across a trip-address redirect", () => {
  it("runs the middleware on both forms of every renamed trip address", () => {
    const matcher = middlewareConfig.matcher as string[];
    for (const [from, to] of Object.entries(TRIP_SLUG_REDIRECTS)) {
      expect(matcher).toContain(`/trips/${from}`);
      expect(matcher).toContain(`/trips/${to}`);
    }
    // Every other trip page still bypasses middleware.
    expect(matcher.some((m) => m.startsWith("/trips") && m.includes(":"))).toBe(false);
  });

  it("reads the hand-over cookie the middleware sets", () => {
    expect(langFromCookieString("a=1; sanchari-lang=kn; b=2")).toBe("kn");
    expect(langFromCookieString("sanchari-lang=en")).toBe("en");
    expect(langFromCookieString("sanchari-lang=fr")).toBeNull();
    expect(langFromCookieString("xsanchari-lang=kn")).toBeNull();
    expect(langFromCookieString("")).toBeNull();
    expect(asLang("kn")).toBe("kn");
    expect(asLang("KN")).toBeNull();
  });
});

describe("the redirect map", () => {
  it("holds well-formed slugs only (the database rule), never a slug pointing at itself", () => {
    for (const [from, to] of Object.entries(TRIP_SLUG_REDIRECTS)) {
      expect(from).toMatch(SLUG_RULE);
      expect(to).toMatch(SLUG_RULE);
      expect(from.length).toBeLessThanOrEqual(80);
      expect(to.length).toBeLessThanOrEqual(80);
      expect(from).not.toBe(to);
      // No slug is both a current target and moved on again without the map knowing (one hop at most today).
      expect(TRIP_SLUG_REDIRECTS[to]).toBeUndefined();
    }
  });

  it("sends the old Coorg address to the new one, and nothing else anywhere", () => {
    expect(tripRedirectTarget(OLD)).toBe(NEW);
    expect(tripRedirectTarget(NEW)).toBeNull();
    expect(tripRedirectTarget(CHIK)).toBeNull();
    expect(tripRedirectTarget("no-such-trip")).toBeNull();
  });

  it("follows renames A→B→C in one step and survives a loop", () => {
    const chain = { a: "b", b: "c" };
    expect(tripRedirectTarget("a", chain)).toBe("c");
    expect(tripRedirectTarget("b", chain)).toBe("c");
    expect(tripSlugAliases("c", chain).sort()).toEqual(["a", "b", "c"]);
    const loop = { x: "y", y: "x" };
    expect(() => tripRedirectTarget("x", loop)).not.toThrow();
  });
});

describe("what the trip page does", () => {
  it("before the rename: the old address renders, the new one redirects there for now", () => {
    const live = [OLD, CHIK];
    expect(resolveTripSlug(OLD, live)).toEqual({ kind: "live" });
    expect(resolveTripSlug(NEW, live)).toEqual({ kind: "temporary", to: OLD });
    expect(resolveTripSlug(CHIK, live)).toEqual({ kind: "live" });
  });

  it("after the rename: the old address redirects for good, the new one renders", () => {
    const live = [NEW, CHIK];
    expect(resolveTripSlug(OLD, live)).toEqual({ kind: "permanent", to: NEW });
    expect(resolveTripSlug(NEW, live)).toEqual({ kind: "live" });
  });

  it("never redirects to a trip that is not live (unpublished or never renamed)", () => {
    expect(resolveTripSlug(OLD, [CHIK])).toEqual({ kind: "missing" });
    expect(resolveTripSlug(NEW, [CHIK])).toEqual({ kind: "missing" });
    expect(resolveTripSlug("gokarna-coastal-headlands", [NEW, CHIK])).toEqual({ kind: "missing" });
  });

  it("a live slug always wins over the map", () => {
    expect(resolveTripSlug(OLD, [OLD, NEW])).toEqual({ kind: "live" });
  });

  it("builds both addresses ahead of time while either form is live, and no others", () => {
    expect(tripStaticSlugs([OLD, CHIK]).sort()).toEqual([CHIK, OLD, NEW].sort());
    expect(tripStaticSlugs([NEW, CHIK]).sort()).toEqual([CHIK, OLD, NEW].sort());
    expect(tripStaticSlugs([CHIK])).toEqual([CHIK]);
  });

  it("never decides a redirect from demo trips (database failed)", () => {
    // Demo data publishes the NEW slug; the live database still has the OLD one.
    const demoSlugs = [NEW, CHIK];
    const failed = { liveSlugs: demoSlugs, isDemoFallback: true, databaseConfigured: true };
    expect(decideMovedTrip(OLD, failed)).toEqual({ kind: "data-unavailable" });
    expect(decideMovedTrip(NEW, failed)).toEqual({ kind: "data-unavailable" });
    // No database at all (local demo mode): a plain 404, never a redirect.
    expect(decideMovedTrip(OLD, { ...failed, databaseConfigured: false })).toEqual({ kind: "missing" });
    // Real data: the usual rules.
    expect(decideMovedTrip(OLD, { liveSlugs: [NEW, CHIK], isDemoFallback: false, databaseConfigured: true })).toEqual({ kind: "permanent", to: NEW });
    expect(decideMovedTrip(NEW, { liveSlugs: [OLD, CHIK], isDemoFallback: false, databaseConfigured: true })).toEqual({ kind: "temporary", to: OLD });
  });

  it("never renders demo data at a renamed trip's address while the database is down", () => {
    const down = { isDemoFallback: true, databaseConfigured: true };
    expect(demoRenderWouldMislead(NEW, down)).toBe(true);
    expect(demoRenderWouldMislead(OLD, down)).toBe(true);
    expect(demoRenderWouldMislead(CHIK, down)).toBe(false);
    expect(demoRenderWouldMislead(NEW, { isDemoFallback: false, databaseConfigured: true })).toBe(false);
    expect(demoRenderWouldMislead(NEW, { isDemoFallback: true, databaseConfigured: false })).toBe(false);
  });

  it("categories and blog posts naming either form still find the trip", () => {
    expect(expandTripSlugs([OLD, CHIK])).toEqual([OLD, NEW, CHIK]);
    expect(expandTripSlugs([NEW])).toEqual([NEW, OLD]);
    expect(sameTripSlug(OLD, NEW)).toBe(true);
    expect(sameTripSlug(NEW, OLD)).toBe(true);
    expect(sameTripSlug(OLD, CHIK)).toBe(false);
    expect(sameTripSlug(null, NEW)).toBe(false);
  });
});

// --- /trips?q= ---------------------------------------------------------------------------------

let n = 0;
function trip(t: Partial<Trip>): TripWithDetails {
  const id = t.id ?? `q${++n}`;
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
    departures: [],
  };
}

describe("/trips?q=", () => {
  it("reads, tidies and caps the search text", () => {
    expect(readTripQuery("?q=%20%20coorg%20%20trip%20")).toBe("coorg trip");
    expect(readTripQuery("?mode=private")).toBeNull();
    expect(readTripQuery("?q=")).toBeNull();
    expect(readTripQuery(`?q=${"a".repeat(200)}`)?.length).toBe(MAX_URL_QUERY);
  });

  it("drops only ?q= from the address", () => {
    expect(withoutTripQuery("?q=coorg&mode=private")).toBe("?mode=private");
    expect(withoutTripQuery("?q=coorg")).toBe("");
  });

  it("finds published trips by their own words, never hidden ones", () => {
    const coorg = trip({ id: "c", title: "Kodagu Rainforest & Spice Drive", destination: "Kodagu (Coorg), Karnataka" });
    const chik = trip({ id: "k", title: "Chikmagalur Coffee & Mist Trails", destination: "Chikmagalur, Karnataka" });
    const hidden = trip({ id: "h", title: "Coorg Secret Trip", destination: "Kodagu (Coorg)", isPublished: false });
    expect(tripIdsForQuery("coorg", [coorg, chik, hidden])).toEqual(["c"]);
    expect(tripIdsForQuery("coffee", [coorg, chik, hidden])).toEqual(["k"]);
    expect(tripIdsForQuery("gokarna", [coorg, chik])).toEqual([]);
  });
});

// --- sitemap -------------------------------------------------------------------------------------

describe("sitemap", () => {
  const coorg = trip({ id: "c", slug: NEW, updatedAt: "2026-11-15T10:00:00Z" });
  const chik = trip({ id: "k", slug: CHIK, updatedAt: "2026-11-10T10:00:00Z" });
  const hidden = trip({ id: "h", slug: "draft-trip", isPublished: false });
  const map = buildSitemap({ baseUrl: "https://www.sancharitrips.com", trips: [coorg, chik, hidden], isDemoFallback: false, posts: DEFAULT_BLOG_POSTS });
  const urls = map.map((e) => e.url);

  it("lists the current slug of each published trip and never an old or hidden one", () => {
    expect(urls).toContain(`https://www.sancharitrips.com/trips/${NEW}`);
    expect(urls).toContain(`https://www.sancharitrips.com/trips/${CHIK}`);
    expect(urls.join(" ")).not.toContain(OLD);
    expect(urls.join(" ")).not.toContain("draft-trip");
  });

  it("never lists query strings, private pages or duplicates", () => {
    for (const u of urls) {
      expect(u).not.toContain("?");
      expect(u).not.toMatch(/booking-lookup|motion-preview|\/admin|\/api/);
    }
    expect(new Set(urls).size).toBe(urls.length);
  });

  it("dates pages only from real changes, and never trip pages from trips.updated_at alone", () => {
    const entry = (path: string) => map.find((e) => e.url === `https://www.sancharitrips.com${path}`);
    // Date and price changes do not move trips.updated_at, so it would understate the last change.
    expect(entry(`/trips/${NEW}`)?.lastModified).toBeUndefined();
    expect(entry("/trips")?.lastModified).toBeUndefined();
    expect(entry("")?.lastModified).toBeUndefined();
    expect(entry("/karnataka-tour-packages")?.lastModified).toBeUndefined();
    expect(entry("/about")?.lastModified).toBeUndefined();
    expect(entry("/blog")?.lastModified).toBeInstanceOf(Date);
  });

  it("lists no trip at all when the database failed and demo trips are shown", () => {
    const demo = buildSitemap({ baseUrl: "https://www.sancharitrips.com", trips: [coorg, chik], isDemoFallback: true, posts: [] });
    expect(demo.some((e) => e.url.includes("/trips/"))).toBe(false);
    expect(demo.some((e) => e.url.endsWith("/trips"))).toBe(true);
  });
});

// --- home page wording: "weekend" defaults upgrade, owner text stays ------------------------------

describe("home page wording", () => {
  it("shows the new wording where the saved text is exactly the old weekend default", () => {
    const saved = {
      heroChip: OLD_HOME_DEFAULTS.heroChip,
      categoriesSection: { show: true, eyebrow: OLD_HOME_DEFAULTS.categoriesEyebrow, title: OLD_HOME_DEFAULTS.categoriesTitle, body: "x" },
      howCards: [{ ...DEFAULT_HOME_CONTENT.howCards[0] }, { ...DEFAULT_HOME_CONTENT.howCards[1], body: OLD_HOME_DEFAULTS.howCardBody }],
      faqSection: { show: true, eyebrow: "Questions", title: OLD_HOME_DEFAULTS.faqTitle, body: OLD_HOME_DEFAULTS.faqBody },
    };
    const merged = mergeHomeContent(saved);
    expect(merged.heroChip).toBe("Sanchari Trips • Small-group road trips from Bengaluru • Max 6 per car");
    expect(merged.categoriesSection.eyebrow).toBe("Pick your trip");
    // The old title named a coast and ruins (no Gokarna or Hampi trip runs).
    expect(merged.categoriesSection.title).toBe("Which kind of trip suits you?");
    expect(DEFAULT_HOME_CONTENT.categoriesSection.title).not.toMatch(/coast|ruins/i);
    expect(merged.categoriesSection.body).toBe("x");
    expect(merged.howCards[1].body).not.toMatch(/weekend/i);
    expect(merged.faqSection.title).toBe("Frequently asked questions");
    expect(merged.faqSection.body).not.toMatch(/luggage/i);
  });

  it("never touches wording the owner wrote", () => {
    const merged = mergeHomeContent({ heroChip: "Weekend escapes, our way", categoriesSection: { eyebrow: "Pick a weekend" } });
    expect(merged.heroChip).toBe("Weekend escapes, our way");
    expect(merged.categoriesSection.eyebrow).toBe("Pick a weekend");
  });

  it("the built-in defaults no longer say weekend", () => {
    expect(JSON.stringify(DEFAULT_HOME_CONTENT)).not.toMatch(/weekend|luggage/i);
  });
});
