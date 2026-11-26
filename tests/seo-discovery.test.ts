import { describe, expect, it } from "vitest";
import { analyticsSettingsSchema } from "@/lib/admin/content-schemas";
import { cleanVerificationCode, mergeAnalyticsSettings } from "@/lib/analytics";
import { buildLlmsTxt } from "@/lib/llms";
import type { PublicDepartureAvailability, TripWithDetails } from "@/lib/types";

const NOW = Date.parse("2026-11-26T17:00:00+05:30");

describe("search engine ownership codes", () => {
  it("keeps a bare code or the code inside a pasted meta tag, nothing else", () => {
    expect(cleanVerificationCode("abcDEF123_-xyz789")).toBe("abcDEF123_-xyz789");
    expect(cleanVerificationCode('<meta name="google-site-verification" content="Zx9_kLmN0pQrStUvWxYz12345" />')).toBe("Zx9_kLmN0pQrStUvWxYz12345");
    expect(cleanVerificationCode("<meta name='msvalidate.01' content='0123456789ABCDEF0123456789ABCDEF' />")).toBe("0123456789ABCDEF0123456789ABCDEF");
    for (const bad of ["", "short", '"><script>alert(1)</script>', "has spaces in it ok", null, 7, undefined]) {
      expect(cleanVerificationCode(bad)).toBe("");
    }
  });

  it("old saved rows without codes still load, and the admin form stores only the code", () => {
    expect(mergeAnalyticsSettings({ gaMeasurementId: "G-AB12CD34EF" })).toEqual({ gaMeasurementId: "G-AB12CD34EF", googleSiteVerification: "", bingSiteVerification: "", googleAdsId: "", googleAdsPurchaseLabel: "" });
    const saved = analyticsSettingsSchema.parse({
      gaMeasurementId: "",
      googleSiteVerification: '<meta name="google-site-verification" content="Zx9_kLmN0pQrStUvWxYz12345" />',
      bingSiteVerification: "",
    });
    expect(saved.googleSiteVerification).toBe("Zx9_kLmN0pQrStUvWxYz12345");
    expect(analyticsSettingsSchema.safeParse({ gaMeasurementId: "", googleSiteVerification: "<b>nope</b>", bingSiteVerification: "" }).success).toBe(false);
  });
});

function trip(over: Partial<TripWithDetails["trip"]>, departures: Partial<PublicDepartureAvailability>[] = []): TripWithDetails {
  return {
    trip: {
      id: "t1",
      slug: "chikmagalur-coffee-trails",
      title: "Chikmagalur Coffee & Mist Trails",
      destination: "Chikmagalur",
      region: "Malnad",
      tagline: "Coffee estates and misty ridges.",
      summary: "",
      durationDays: 2,
      durationNights: 1,
      difficulty: "easy",
      vibe: "",
      basePricePaise: 419_900,
      privateGroupPricePaise: null,
      privateDiscountPercent: 10,
      depositPercent: 30,
      balanceDueDaysBefore: 7,
      pickupCity: "Bengaluru",
      heroImageUrl: "",
      galleryUrls: [],
      videoLinks: [],
      inclusions: [],
      exclusions: [],
      accommodationNotes: "",
      packingList: [],
      safetyNotes: "",
      accessibilityNotes: "",
      isSampleDemo: false,
      isPublished: true,
      sortOrder: 1,
      ...over,
    },
    departures: departures.map((d, i) => ({
      departureId: `d${i}`,
      tripId: "t1",
      departureCode: "SAN-CKM-DEC04",
      startDate: "2026-12-04",
      endDate: "2026-12-05",
      maxCapacity: 6,
      minOccupancy: 3,
      departureType: "open_batch",
      status: "open",
      bookingCutoffAt: "2026-12-02T12:30:00+00:00",
      preferenceDeadlineAt: null,
      priceOverridePaise: 499_900,
      seatsTaken: 2,
      seatsRemaining: 4,
      ...d,
    })) as PublicDepartureAvailability[],
  } as unknown as TripWithDetails;
}

describe("llms.txt for AI search", () => {
  const settings = { socialLinks: { whatsappNumber: "918123333562" }, blogPosts: [] } as never;

  it("lists each live trip with its real next date and price, and hides unpublished ones", () => {
    const txt = buildLlmsTxt({
      baseUrl: "https://www.sancharitrips.com",
      trips: [trip({}, [{}]), trip({ id: "t2", slug: "hidden-trip", title: "Hidden", isPublished: false })],
      isDemoFallback: false,
      settings,
      now: NOW,
    });
    expect(txt.startsWith("# Sanchari Trips\n")).toBe(true);
    expect(txt).toContain("- [Chikmagalur Coffee & Mist Trails](https://www.sancharitrips.com/trips/chikmagalur-coffee-trails): Chikmagalur; 2 days / 1 night; from ₹4,999 per person; next open date 4–5 Dec (4 of 6 seats open).");
    expect(txt).not.toContain("hidden-trip");
    expect(txt).toContain("WhatsApp: +918123333562");
    expect(txt).not.toMatch(/\/admin|\/api/);
  });

  it("never lists demo trips when the database is down", () => {
    const txt = buildLlmsTxt({ baseUrl: "https://www.sancharitrips.com", trips: [trip({})], isDemoFallback: true, settings, now: NOW });
    expect(txt).not.toContain("/trips/chikmagalur");
    expect(txt).toContain("(https://www.sancharitrips.com/trips)");
  });
});

describe("Google Ads booking tracking", () => {
  it("keeps only a real AW- tag ID and a conversion label", async () => {
    const { cleanAdsId, cleanAdsLabel } = await import("@/lib/analytics");
    expect(cleanAdsId(" aw-123456789 ")).toBe("AW-123456789");
    expect(cleanAdsLabel("AW-123456789/AbC-D_efG12")).toBe("AbC-D_efG12");
    expect(cleanAdsLabel("AbC-D_efG12")).toBe("AbC-D_efG12");
    for (const bad of ["", "G-ABC123DEF", "AW-12", "AW-123');alert(1)//", null]) expect(cleanAdsId(bad)).toBe("");
    for (const bad of ["", "x", "a b c d e f", "');alert(1)//"]) expect(cleanAdsLabel(bad)).toBe("");
  });

  it("a finished booking is also sent to Google Ads once a target is set", async () => {
    const { trackEvent } = await import("@/lib/analytics");
    const calls: unknown[][] = [];
    const w = globalThis as unknown as Record<string, unknown>;
    w.window = w;
    w.gtag = (...a: unknown[]) => calls.push(a);
    w.__sanchariAdsPurchase = "AW-123456789/AbC-D_efG12";
    trackEvent("purchase", { value: 1500, currency: "INR", transaction_id: "SAN-1" });
    expect(calls).toContainEqual(["event", "conversion", { send_to: "AW-123456789/AbC-D_efG12", value: 1500, currency: "INR", transaction_id: "SAN-1" }]);
    trackEvent("view_trip", {});
    expect(calls.filter((c) => c[1] === "conversion")).toHaveLength(1);
    delete w.window;
    delete w.gtag;
    delete w.__sanchariAdsPurchase;
  });
});

describe("trip pages link to the guides of the places they visit", () => {
  it("each live trip finds its own district guide", async () => {
    const { GUIDE_PAGES, tripsForPlaces } = await import("@/lib/places/guide");
    const guidesFor = (t: TripWithDetails) =>
      GUIDE_PAGES.filter((g) => g.kind !== "category" && tripsForPlaces(g.places, [t]).length > 0).map((g) => g.slug);
    const ckm = guidesFor(trip({ destination: "Chikmagalur, Karnataka", title: "Chikmagalur Coffee & Mist Trails" }));
    const coorg = guidesFor(trip({ destination: "Kodagu (Coorg), Karnataka", title: "Kodagu Rainforest & Spice Drive", slug: "coorg-rainforest-spice-drive" }));
    const mur = guidesFor(trip({ destination: "Murudeshwara, Karnataka", title: "Murudeshwara", slug: "murudeshwara" }));
    expect(ckm).toContain("chikkamagaluru");
    expect(coorg).toContain("kodagu");
    expect(mur).toContain("uttara-kannada");
  });
});
