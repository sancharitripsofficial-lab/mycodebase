import { describe, expect, it } from "vitest";
import { cleanMeasurementId, mergeAnalyticsSettings, rupees, tripItem } from "@/lib/analytics";
import { analyticsSettingsSchema, homePageSchema, siteMediaSchema } from "@/lib/admin/content-schemas";
import { isWeatherFresh, weatherAgeMs, WEATHER_MAX_AGE_MS, type LiveWeather } from "@/components/living/weather";
import { DEFAULT_HOME_CONTENT, mergeHomeContent } from "@/lib/home-content";
import { offerEndLabel, offersWithOpenTrips, tripHasOpenDate } from "@/lib/offer-rules";
import { DEFAULT_TEAM, EMPTY_SITE_MEDIA, mergeSiteMedia, teamInitials } from "@/lib/site-media";

/** 26 Nov 2026, 5 pm in India. */
const NOW = Date.parse("2026-11-26T17:00:00+05:30");

describe("offers say when they end and step aside when their trip cannot be booked", () => {
  it("shows the end as a calendar day in India", () => {
    // The live Christmas offer ends 31 Dec 2026, 08:15 UTC = 1:45 pm in India.
    expect(offerEndLabel("2026-12-31T08:15:00+00:00")).toBe("Offer ends 31 Dec");
    // 20:01 UTC on 30 Dec is already 31 Dec in India.
    expect(offerEndLabel("2026-12-30T20:01:00+00:00")).toBe("Offer ends 31 Dec");
    expect(offerEndLabel(null)).toBeNull();
    expect(offerEndLabel("")).toBeNull();
    expect(offerEndLabel("soon")).toBeNull();
  });

  const date = (over: Record<string, unknown>) => ({ status: "open" as const, bookingCutoffAt: "2026-12-02T12:30:00+00:00", startDate: "2026-12-04", seatsRemaining: 6, ...over });
  const trips = [
    { trip: { id: "open" }, departures: [date({})] },
    { trip: { id: "full" }, departures: [date({ seatsRemaining: 0 })] },
    { trip: { id: "closed" }, departures: [date({ bookingCutoffAt: "2026-11-25T12:30:00+00:00" })] },
    { trip: { id: "none" }, departures: [] },
  ];

  it("keeps offers for all trips and for trips with an open date; hides the rest", () => {
    const offers = [
      { id: "everyone", tripId: null },
      { id: "for-open", tripId: "open" },
      { id: "for-full", tripId: "full" },
      { id: "for-closed", tripId: "closed" },
      { id: "for-none", tripId: "none" },
      { id: "for-unpublished", tripId: "gone" },
    ];
    expect(offersWithOpenTrips(offers, trips, NOW).map((o) => o.id)).toEqual(["everyone", "for-open"]);
    expect(tripHasOpenDate("open", trips, NOW)).toBe(true);
    expect(tripHasOpenDate("full", trips, NOW)).toBe(false);
  });

  it("comes back by itself when the trip gets a new open date", () => {
    const later = [{ trip: { id: "full" }, departures: [date({ seatsRemaining: 0 }), date({ startDate: "2026-12-18", bookingCutoffAt: "2026-12-16T12:30:00+00:00" })] }];
    expect(offersWithOpenTrips([{ id: "x", tripId: "full" }], later, NOW)).toHaveLength(1);
  });
});

describe("weather is shown with its time, and only while it is fresh", () => {
  const reading = (minutesOld: number, over: Partial<LiveWeather> = {}): LiveWeather => ({
    live: true,
    place: "Chikkamagaluru",
    condition: "mist",
    label: "fog",
    tempC: 19,
    windKmh: 6,
    windFromDeg: 90,
    windFrom: "E",
    isDay: true,
    humidity: 90,
    cloudCover: 80,
    precipMm: 0,
    updatedAt: new Date(NOW - minutesOld * 60_000).toISOString(),
    ...over,
  });

  it("a reading up to an hour old counts as now; an older one is hidden", () => {
    expect(isWeatherFresh(reading(0), NOW)).toBe(true);
    expect(isWeatherFresh(reading(45), NOW)).toBe(true);
    expect(isWeatherFresh(reading(60), NOW)).toBe(true);
    expect(isWeatherFresh(reading(61), NOW)).toBe(false);
    // The case the audit saw: a page built at 4:30 am, opened at 5 pm.
    expect(isWeatherFresh(reading(12.5 * 60), NOW)).toBe(false);
    expect(WEATHER_MAX_AGE_MS).toBe(60 * 60 * 1000);
  });

  it("no reading, a failed lookup or a kept reading without a time is never shown as fresh", () => {
    expect(isWeatherFresh(null, NOW)).toBe(false);
    expect(isWeatherFresh(reading(5, { live: false }), NOW)).toBe(false);
    expect(isWeatherFresh(reading(5, { updatedAt: undefined, stale: true }), NOW)).toBe(false);
    expect(isWeatherFresh(reading(5, { updatedAt: undefined }), NOW)).toBe(true);
    expect(weatherAgeMs(reading(30), NOW)).toBe(30 * 60_000);
    expect(weatherAgeMs({ updatedAt: "rubbish" }, NOW)).toBeNull();
  });
});

describe("booking-funnel analytics", () => {
  it("accepts only a real GA4 measurement ID (it is written into the page)", () => {
    expect(cleanMeasurementId(" g-ab12cd34ef ")).toBe("G-AB12CD34EF");
    expect(cleanMeasurementId("G-DF7156T3VT")).toBe("G-DF7156T3VT");
    for (const bad of ["", "UA-12345-1", "GTM-ABC123", "G-", "G-AB12');alert(1);//", "<script>", null, 42, undefined]) {
      expect(cleanMeasurementId(bad)).toBe("");
    }
    expect(mergeAnalyticsSettings({ gaMeasurementId: "G-AB12CD34EF" })).toEqual({ gaMeasurementId: "G-AB12CD34EF", googleSiteVerification: "", bingSiteVerification: "", googleAdsId: "", googleAdsPurchaseLabel: "" });
    expect(mergeAnalyticsSettings(undefined)).toEqual({ gaMeasurementId: "", googleSiteVerification: "", bingSiteVerification: "", googleAdsId: "", googleAdsPurchaseLabel: "" });
    expect(mergeAnalyticsSettings({ gaMeasurementId: "javascript:alert(1)" })).toEqual({ gaMeasurementId: "", googleSiteVerification: "", bingSiteVerification: "", googleAdsId: "", googleAdsPurchaseLabel: "" });
  });

  it("the admin form saves a valid ID or an empty one, nothing else", () => {
    expect(analyticsSettingsSchema.parse({ gaMeasurementId: "g-ab12cd34ef" })).toEqual({ gaMeasurementId: "G-AB12CD34EF", googleSiteVerification: "", bingSiteVerification: "", googleAdsId: "", googleAdsPurchaseLabel: "" });
    expect(analyticsSettingsSchema.parse({ gaMeasurementId: "" })).toEqual({ gaMeasurementId: "", googleSiteVerification: "", bingSiteVerification: "", googleAdsId: "", googleAdsPurchaseLabel: "" });
    expect(analyticsSettingsSchema.safeParse({ gaMeasurementId: "UA-1" }).success).toBe(false);
  });

  it("reports money in rupees and a trip as an item, with no personal details", () => {
    expect(rupees(499_900)).toBe(4999);
    expect(rupees(149_970)).toBe(1499.7);
    const item = tripItem({ slug: "chikmagalur-coffee-trails", title: "Chikmagalur Coffee & Mist Trails", destination: "Chikmagalur, Karnataka", variant: "2026-12-04", pricePaise: 499_900, quantity: 2 });
    expect(item).toEqual({ item_id: "chikmagalur-coffee-trails", item_name: "Chikmagalur Coffee & Mist Trails", item_category: "Chikmagalur", item_variant: "2026-12-04", price: 4999, quantity: 2 });
    expect(Object.keys(item).some((k) => /name$|phone|email/.test(k) && k !== "item_name")).toBe(false);
  });
});

describe("home page: first-screen facts and trust sections", () => {
  it("a home page saved before these existed gets the built-in ones", () => {
    const old = { heroChip: "Sanchari Trips", kannadaLine: "", categories: [] };
    const merged = mergeHomeContent(old);
    expect(merged.heroPoints).toEqual(DEFAULT_HOME_CONTENT.heroPoints);
    expect(merged.trustSection.show).toBe(true);
    expect(merged.trustCards).toHaveLength(4);
    expect(merged.teamSection.title).toBeTruthy();
    expect(merged.vehicleSection.show && merged.journeysSection.show).toBe(true);
  });

  it("the trip cards' heading moves from the old built-in words to the new, but never over the owner's own words", () => {
    const untouched = mergeHomeContent({ routesSection: { show: true, eyebrow: "Curated routes", title: "Karnataka micro-expeditions", body: "" } });
    expect(untouched.routesSection.eyebrow).toBe("Upcoming trips");
    expect(untouched.routesSection.title).toBe("Pick a date and reserve your seat");
    const owners = mergeHomeContent({ routesSection: { show: true, eyebrow: "Our trips", title: "Where shall we go?", body: "" } });
    expect(owners.routesSection.eyebrow).toBe("Our trips");
    expect(owners.routesSection.title).toBe("Where shall we go?");
  });

  it("keeps the owner's own facts (at most four, no blanks) and saves them", () => {
    const merged = mergeHomeContent({ heroPoints: ["Max 6 travellers", "", "  ", "Bengaluru pick-up", "Five", "Six", "Seven"] });
    expect(merged.heroPoints).toEqual(["Max 6 travellers", "Bengaluru pick-up", "Five", "Six"]);
    expect(homePageSchema.safeParse(DEFAULT_HOME_CONTENT).success).toBe(true);
    // A Home page form opened before the new fields existed still saves.
    const { heroPoints: _hp, trustSection: _ts, trustCards: _tc, teamSection: _tm, vehicleSection: _vs, journeysSection: _js, ...older } = DEFAULT_HOME_CONTENT;
    expect(homePageSchema.safeParse(older).success).toBe(true);
    expect(homePageSchema.safeParse({ ...DEFAULT_HOME_CONTENT, heroPoints: ["x".repeat(40)] }).success).toBe(false);
  });

  it("every built-in promise links to a page where it is written down", () => {
    for (const card of DEFAULT_HOME_CONTENT.trustCards) {
      expect(card.href).toMatch(/^\/(trips|policies|safety|contact)/);
      expect(card.body.length).toBeGreaterThan(20);
    }
  });
});

describe("team and real photos (Admin → Pictures & videos)", () => {
  it("starts with the team as Sanchari announced it, and no stand-in photos", () => {
    expect(EMPTY_SITE_MEDIA.team).toEqual(DEFAULT_TEAM);
    expect(DEFAULT_TEAM.map((m) => m.name)).toEqual(["Dr. Basavaraj Ullatti", "K S Indra Kumar", "Navya P", "Sandeepa A (Sandy)"]);
    expect(DEFAULT_TEAM.every((m) => m.photo === "")).toBe(true);
    expect(EMPTY_SITE_MEDIA.vehiclePhotos).toEqual([]);
    expect(EMPTY_SITE_MEDIA.tripPhotos).toEqual([]);
  });

  it("an older saved copy gets the team; the owner's own list (even an empty one) is kept", () => {
    expect(mergeSiteMedia({ heroMode: "video" }).team).toEqual(DEFAULT_TEAM);
    expect(mergeSiteMedia({ team: [] }).team).toEqual([]);
    const own = mergeSiteMedia({ team: [{ name: " Navya P ", role: "Trip Operations Executive", photo: "/media/team/navya.jpg" }, { name: "", role: "nobody" }, "junk"] });
    expect(own.team).toEqual([{ name: "Navya P", role: "Trip Operations Executive", photo: "/media/team/navya.jpg" }]);
  });

  it("photo lists keep only pictures the site can show, once each", () => {
    const m = mergeSiteMedia({
      vehiclePhotos: ["/media/car-1.jpg", "/media/car-1.jpg", "javascript:alert(1)", "/media/film.mp4", 7, ""],
      tripPhotos: ["/media/trip-1.jpg"],
    });
    expect(m.vehiclePhotos).toEqual(["/media/car-1.jpg"]);
    expect(m.tripPhotos).toEqual(["/media/trip-1.jpg"]);
    expect(siteMediaSchema.safeParse({ ...EMPTY_SITE_MEDIA, vehiclePhotos: ["/media/car-1.jpg"], tripPhotos: [] }).success).toBe(true);
    expect(siteMediaSchema.safeParse({ ...EMPTY_SITE_MEDIA, team: [{ name: "N", role: "", photo: "" }] }).success).toBe(false);
    // A Pictures & videos form opened before these existed still saves.
    const { team: _t, vehiclePhotos: _v, tripPhotos: _p, ...older } = EMPTY_SITE_MEDIA;
    expect(siteMediaSchema.safeParse(older).success).toBe(true);
  });

  it("initials for a member without a photo skip titles and nicknames", () => {
    expect(teamInitials("Dr. Basavaraj Ullatti")).toBe("BU");
    expect(teamInitials("K S Indra Kumar")).toBe("IK");
    expect(teamInitials("Navya P")).toBe("NP");
    expect(teamInitials("Sandeepa A (Sandy)")).toBe("SA");
    expect(teamInitials("Asha")).toBe("A");
    expect(teamInitials("")).toBe("S");
  });
});
