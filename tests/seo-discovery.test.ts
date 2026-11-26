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
    expect(mergeAnalyticsSettings({ gaMeasurementId: "G-AB12CD34EF" })).toEqual({ gaMeasurementId: "G-AB12CD34EF", googleSiteVerification: "", bingSiteVerification: "" });
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
