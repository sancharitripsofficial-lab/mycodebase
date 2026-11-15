import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  categoryOrderByRank,
  groupByCategory,
  highlightParts,
  isStrongHit,
  normalize,
  placeTripMatches,
  resolveDistrict,
  scoreText,
  searchPlaces,
  tripMatchesQuery,
  typoDistance,
  MATCH_SCORES,
} from "@/lib/places/search";
import type { KarnatakaDistrict, KarnatakaPlace, PlaceCategory } from "@/lib/places/types";
import type { ItineraryDay, Trip, TripWithDetails } from "@/lib/types";
import { translatePattern } from "@/lib/i18n/patterns";
import { cleanPlaceText, planMessageFor } from "@/lib/places/plan-prefill";
import { NoTripForPlace, PlaceFilterBanner, TripSearch } from "@/components/TripSearch";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: () => {} }) }));
import kn from "@/lib/i18n/kn.json";

// --- small fixture (the real list lives in karnataka-places.ts) ---------------------------------

const DISTRICTS: KarnatakaDistrict[] = [
  { name: "Kodagu", aliases: ["Coorg", "Madikeri"], region: "Malnad & Western Ghats" },
  { name: "Chikkamagaluru", aliases: ["Chikmagalur", "Chickmagalur"], region: "Malnad & Western Ghats" },
  { name: "Vijayanagara", aliases: ["Hosapete", "Hospet"], region: "North Karnataka" },
  { name: "Bengaluru Urban", aliases: ["Bangalore", "Bengaluru"], region: "Bengaluru & surroundings" },
  { name: "Uttara Kannada", aliases: ["Karwar"], region: "Coastal Karnataka" },
  { name: "Hassan", aliases: [], region: "Malnad & Western Ghats" },
];

const place = (p: Partial<KarnatakaPlace> & Pick<KarnatakaPlace, "id" | "name" | "district" | "categories">): KarnatakaPlace => ({
  aliases: [],
  region: DISTRICTS.find((d) => d.name === p.district)?.region ?? "North Karnataka",
  blurb: "",
  ...p,
});

const PLACES: KarnatakaPlace[] = [
  place({ id: "abbey-falls", name: "Abbey Falls", aliases: ["Abbi Falls", "Jessy Falls"], district: "Kodagu", categories: ["waterfall"] }),
  place({ id: "rajas-seat", name: "Raja's Seat", aliases: ["Raja Seat"], district: "Kodagu", categories: ["hill_station"] }),
  place({ id: "dubare", name: "Dubare Elephant Camp", district: "Kodagu", categories: ["wildlife_forest"] }),
  place({ id: "mullayanagiri", name: "Mullayanagiri", aliases: ["Mullayanagiri peak"], district: "Chikkamagaluru", categories: ["trek_peak", "hill_station"] }),
  place({ id: "baba-budangiri", name: "Baba Budangiri", district: "Chikkamagaluru", categories: ["trek_peak"] }),
  place({ id: "hampi", name: "Hampi", aliases: ["Hampi ruins"], district: "Vijayanagara", categories: ["heritage"] }),
  place({ id: "tungabhadra-dam", name: "Tungabhadra Dam", district: "Vijayanagara", categories: ["lake_river_dam"] }),
  place({ id: "bengaluru", name: "Bengaluru", aliases: ["Bangalore"], district: "Bengaluru Urban", categories: ["city_town"] }),
  place({ id: "lalbagh", name: "Lalbagh Botanical Garden", aliases: ["Lalbagh"], district: "Bengaluru Urban", categories: ["city_town"] }),
  place({ id: "om-beach", name: "Om Beach", district: "Uttara Kannada", categories: ["beach_coast"] }),
  place({ id: "sakleshpur", name: "Sakleshpur", district: "Hassan", categories: ["hill_station", "coffee_tea"] }),
];

const ORDER: PlaceCategory[] = [
  "hill_station", "coffee_tea", "waterfall", "trek_peak", "wildlife_forest", "beach_coast",
  "island", "heritage", "temple_pilgrimage", "lake_river_dam", "cave", "city_town",
];

let n = 0;
function trip(t: Partial<Trip>, days: Partial<ItineraryDay>[] = []): TripWithDetails {
  const id = `t${++n}`;
  return {
    trip: {
      id, slug: id, title: "", destination: "", region: "", tagline: "", summary: "", durationDays: 2, durationNights: 1,
      difficulty: "Easy", vibe: "", basePricePaise: 0, privateGroupPricePaise: null, privateDiscountPercent: 0, depositPercent: null,
      balanceDueDaysBefore: 7, pickupCity: "Bengaluru", heroImageUrl: "", galleryUrls: [], videoLinks: [], inclusions: [], exclusions: [],
      accommodationNotes: "", packingList: [], safetyNotes: "", accessibilityNotes: "", isSampleDemo: false, isPublished: true, sortOrder: 0,
      ...t,
    },
    itinerary: days.map((d, i) => ({ id: `${id}-d${i}`, tripId: id, dayNumber: i + 1, title: "", description: "", driveTimeEstimate: "", travelBufferNotes: "", mealsIncluded: "", ...d })),
    pickupPoints: [],
    departures: [],
  };
}

const KODAGU = trip(
  { title: "Kodagu Rainforest & Spice Drive", destination: "Kodagu (Coorg)", region: "Malnad", vibe: "Coffee estates, mist" },
  [{ title: "Bengaluru to Madikeri", description: "Leave Bengaluru at 6 AM. Sunset at Raja's Seat." }],
);
const MALNAD = trip(
  { title: "Sakleshpur Green Route", destination: "Sakleshpur", region: "Malnad", vibe: "Railway trek" },
  [{ title: "Hills", description: "Sunrise drive up Mullayanagiri before breakfast. Leave Bengaluru at 5 AM." }],
);
const COAST = trip({ title: "Gokarna Beach Hop", destination: "Gokarna, Uttara Kannada", region: "Coastal Karnataka", vibe: "Beaches" });
const HIDDEN_HAMPI = trip({ title: "Hampi Ruins Weekend", destination: "Hampi", region: "North Karnataka", isPublished: false });
const TRIPS = [KODAGU, MALNAD, COAST, HIDDEN_HAMPI];

const ids = (hits: { place: KarnatakaPlace }[]) => hits.map((h) => h.place.id);
const search = (q: string, limit = 30) => searchPlaces(q, PLACES, DISTRICTS, limit);

// --- tests ---------------------------------------------------------------------------------------

describe("normalize", () => {
  it("lowercases, drops accents and punctuation, collapses spaces", () => {
    expect(normalize("  Raja's   Seat!! ")).toBe("rajas seat");
    expect(normalize("Café—Kodagu (Coorg)")).toBe("cafe kodagu coorg");
    expect(normalize("Chikka-magaluru")).toBe("chikka magaluru");
    expect(normalize("")).toBe("");
  });

  it("keeps Kannada letters whole", () => {
    expect(normalize("ಕೊಡಗು")).toBe("ಕೊಡಗು");
  });
});

describe("typo distance", () => {
  it("counts insert, delete, change and swap", () => {
    expect(typoDistance("hampi", "hampi")).toBe(0);
    expect(typoDistance("hmapi", "hampi")).toBe(1); // swap
    expect(typoDistance("hampy", "hampi")).toBe(1);
    expect(typoDistance("abbi falls", "abbey falls")).toBe(2);
    expect(typoDistance("abcdef", "uvwxyz", 2)).toBe(3); // stops early
  });
});

describe("scoring", () => {
  it("ranks exact > prefix > word start > inside > typo", () => {
    const exact = scoreText("hampi", "Hampi");
    const prefix = scoreText("ham", "Hampi");
    const word = scoreText("fal", "Abbey Falls");
    const inside = scoreText("bey", "Abbey Falls");
    const typo = scoreText("hampy", "Hampi");
    expect(exact).toBe(MATCH_SCORES.exact);
    expect(exact).toBeGreaterThan(prefix);
    expect(prefix).toBeGreaterThan(word);
    expect(word).toBeGreaterThan(inside);
    expect(inside).toBeGreaterThan(typo);
    expect(typo).toBeGreaterThan(0);
  });

  it("allows 1 typo for 4-7 letters, 2 for 8+, none under 4", () => {
    expect(scoreText("hmapi", "Hampi")).toBeGreaterThan(0);
    expect(scoreText("hmapy", "Hampi")).toBe(0);
    expect(scoreText("mulayanagri", "Mullayanagiri")).toBeGreaterThan(0); // 11 letters, 2 typos
    expect(scoreText("om", "Ok")).toBe(0);
  });
});

describe("searchPlaces", () => {
  it("finds the exact place first", () => {
    expect(ids(search("hampi"))[0]).toBe("hampi");
    expect(search("Hampi")[0].place.district).toBe("Vijayanagara");
  });

  it('"coorg" finds the Kodagu places through the district alias', () => {
    const found = ids(search("coorg"));
    expect(found).toEqual(expect.arrayContaining(["abbey-falls", "rajas-seat", "dubare"]));
    expect(found).not.toContain("hampi");
  });

  it('"chikmagalur" and "chikkamagaluru" both find the Chikkamagaluru places', () => {
    for (const q of ["chikmagalur", "chikkamagaluru", "Chikkamagaluru", "chickmagalur"]) {
      expect(ids(search(q)), q).toEqual(expect.arrayContaining(["mullayanagiri", "baba-budangiri"]));
    }
  });

  it('"abbi falls" (alias) and "abby falls" (typo) find Abbey Falls', () => {
    expect(ids(search("abbi falls"))[0]).toBe("abbey-falls");
    expect(ids(search("abby falls"))[0]).toBe("abbey-falls");
    expect(ids(search("jessy"))[0]).toBe("abbey-falls");
    expect(search("abbi falls")[0]).toMatchObject({ field: "alias", matched: "Abbi Falls" });
  });

  it("matches while still typing, and word starts", () => {
    expect(ids(search("mullay"))[0]).toBe("mullayanagiri");
    expect(ids(search("elephant"))[0]).toBe("dubare");
    expect(ids(search("rajas seat"))[0]).toBe("rajas-seat");
    expect(ids(search("raja's"))[0]).toBe("rajas-seat");
  });

  it("puts a place's own name above places that only share the district", () => {
    const hits = search("bengaluru");
    expect(hits[0].place.id).toBe("bengaluru");
    expect(isStrongHit(hits[0])).toBe(true);
    expect(isStrongHit(search("coorg")[0])).toBe(false); // district-only match
  });

  it("returns nothing for empty or nonsense text and honours the limit", () => {
    expect(search("")).toEqual([]);
    expect(search("   ")).toEqual([]);
    expect(search("zzqxv")).toEqual([]);
    expect(search("a", 2).length).toBeLessThanOrEqual(2);
  });

  it("is fast on 250 places", () => {
    const many: KarnatakaPlace[] = Array.from({ length: 250 }, (_, i) => ({
      ...PLACES[i % PLACES.length],
      id: `p${i}`,
      name: `${PLACES[i % PLACES.length].name} ${i}`,
    }));
    searchPlaces("warmup", many, DISTRICTS); // builds the index once
    const queries = ["c", "co", "coo", "coor", "coorg", "abby fal", "mullayanagri", "hampi ruins", "xyzzyq"];
    // Best of 5 rounds, so a busy test machine does not make it flaky (desktop: ~0.3 ms).
    let perSearch = Infinity;
    for (let round = 0; round < 5; round++) {
      const start = performance.now();
      for (let r = 0; r < 10; r++) for (const q of queries) searchPlaces(q, many, DISTRICTS);
      perSearch = Math.min(perSearch, (performance.now() - start) / (10 * queries.length));
    }
    expect(perSearch).toBeLessThan(2);
  });
});

describe("groupByCategory", () => {
  it("groups by main category in the given order, keeping rank inside", () => {
    const groups = groupByCategory(search("coorg"), ORDER);
    expect(groups.map((g) => g.category)).toEqual(["hill_station", "waterfall", "wildlife_forest"]);
    expect(groups[0].items[0].place.id).toBe("rajas-seat");
  });

  it("works on plain places and puts unknown categories last", () => {
    const groups = groupByCategory(PLACES, ["heritage"]);
    expect(groups[0]).toMatchObject({ category: "heritage" });
    expect(groups[0].items.map((p) => p.id)).toEqual(["hampi"]);
    expect(groups.reduce((s, g) => s + g.items.length, 0)).toBe(PLACES.length);
  });

  it("can order groups by best result", () => {
    const hits = search("abbey");
    expect(categoryOrderByRank(hits)[0]).toBe("waterfall");
  });
});

describe("districts and trips", () => {
  it("resolves a district from a destination text", () => {
    expect(resolveDistrict("Kodagu (Coorg)", DISTRICTS)?.name).toBe("Kodagu");
    expect(resolveDistrict("Chikmagalur hills", DISTRICTS)?.name).toBe("Chikkamagaluru");
    expect(resolveDistrict("Gokarna, Uttara Kannada", DISTRICTS)?.name).toBe("Uttara Kannada");
    expect(resolveDistrict("Somewhere else", DISTRICTS)).toBeNull();
  });

  it("placeTripMatches: same district counts", () => {
    expect(placeTripMatches(PLACES[0], TRIPS, DISTRICTS)).toEqual([KODAGU]); // Abbey Falls → Kodagu trip
  });

  it("placeTripMatches: an itinerary mention counts (word boundary, any spelling)", () => {
    const mullayanagiri = PLACES.find((p) => p.id === "mullayanagiri")!;
    expect(placeTripMatches(mullayanagiri, TRIPS, DISTRICTS)).toEqual([MALNAD]);
    const rajasSeat = PLACES.find((p) => p.id === "rajas-seat")!;
    expect(placeTripMatches(rajasSeat, TRIPS, DISTRICTS)).toEqual([KODAGU]);
  });

  it("placeTripMatches: skips unpublished trips and the pickup city in itineraries", () => {
    const hampi = PLACES.find((p) => p.id === "hampi")!;
    expect(placeTripMatches(hampi, TRIPS, DISTRICTS)).toEqual([]);
    const bengaluru = PLACES.find((p) => p.id === "bengaluru")!;
    expect(placeTripMatches(bengaluru, TRIPS, DISTRICTS)).toEqual([]);
    const city = trip({ title: "Bengaluru Heritage Walk", destination: "Bengaluru" });
    expect(placeTripMatches(bengaluru, [city], DISTRICTS)).toEqual([city]);
  });

  it("tripMatchesQuery searches title, destination, vibe and itinerary text", () => {
    expect(tripMatchesQuery(KODAGU, "")).toBe(true);
    expect(tripMatchesQuery(KODAGU, "coorg")).toBe(true);
    expect(tripMatchesQuery(KODAGU, "raja's seat")).toBe(true); // itinerary only
    expect(tripMatchesQuery(KODAGU, "spice drive")).toBe(true);
    expect(tripMatchesQuery(KODAGU, "kodagu coffee")).toBe(true); // words in different fields
    expect(tripMatchesQuery(MALNAD, "mullayanagiri")).toBe(true);
    expect(tripMatchesQuery(MALNAD, "mulayanagiri")).toBe(true); // typo
    expect(tripMatchesQuery(COAST, "gokar")).toBe(true); // still typing
    expect(tripMatchesQuery(COAST, "coorg")).toBe(false);
    expect(tripMatchesQuery(KODAGU, "hampi")).toBe(false);
  });
});

describe("highlightParts", () => {
  it("marks the typed part at a word start", () => {
    expect(highlightParts("Abbey Falls", "fal")).toEqual([
      { text: "Abbey ", match: false },
      { text: "Fal", match: true },
      { text: "ls", match: false },
    ]);
    expect(highlightParts("Hampi", "")).toEqual([{ text: "Hampi", match: false }]);
    expect(highlightParts("Hampi", "zz")).toEqual([{ text: "Hampi", match: false }]);
  });
});

describe("Kannada for the search words", () => {
  const dict = kn as Record<string, string>;
  it("has every fixed text of the search", () => {
    for (const en of [
      "Search trips and places", "Browse by category", "Popular places", "Trips", "Places", "Trip available",
      "Loading places…", "All categories", "Clear search", "Clear place", "Show all trips", "Search suggestions",
      "No place or trip matches that yet. Check the spelling or try a nearby town.",
      "Tell us your dates and group size, and we'll plan a car trip there.",
      "No places in this category yet.",
      // CATEGORY_LABELS in karnataka-places.ts (chips and group headings)
      "Hill stations", "Coffee & tea country", "Waterfalls", "Treks & peaks", "Wildlife & forests", "Beaches & coast",
      "Islands", "Heritage & history", "Temples & pilgrimage", "Lakes, rivers & dams", "Caves", "Cities & towns",
    ]) {
      expect(dict[en], en).toMatch(/[ಀ-೿]/);
    }
  });

  it("translates the sentences with a place name in them", () => {
    const t = (s: string) => dict[s];
    expect(translatePattern("Trips that go to Abbey Falls (Kodagu)", t)).toMatch(/Abbey Falls \(ಕೊಡಗು\)|Abbey Falls \(Kodagu\)/);
    expect(translatePattern("No trip to Hampi yet", t)).toMatch(/[ಀ-೿]/);
    expect(translatePattern("Ask us to plan Hampi", t)).toMatch(/[ಀ-೿]/);
    expect(translatePattern("5 suggestions", t)).toBe("5 ಸಲಹೆಗಳು");
  });
});

describe("plan prefill", () => {
  it("keeps a short plain place text only", () => {
    expect(cleanPlaceText("  Abbey Falls,   Kodagu ")).toBe("Abbey Falls, Kodagu");
    expect(cleanPlaceText("<script>x</script>Hampi")).toBe("script x /script Hampi");
    expect(cleanPlaceText("a\u0000b\nc")).toBe("a b c");
    expect(cleanPlaceText("x".repeat(200))).toHaveLength(80);
    expect(cleanPlaceText(42)).toBe("");
    expect(cleanPlaceText(null)).toBe("");
    expect(planMessageFor("Hampi, Vijayanagara")).toBe("I'd like a trip to Hampi, Vijayanagara.");
  });
});

describe("TripSearch markup", () => {
  it("renders an accessible combobox, closed until focused", () => {
    const html = renderToStaticMarkup(createElement(TripSearch, { trips: TRIPS, onFilterChange: () => {} }));
    expect(html).toContain("role=\"combobox\"");
    expect(html).toContain("aria-expanded=\"false\"");
    expect(html).toContain("aria-autocomplete=\"list\"");
    expect(html).toContain("role=\"listbox\"");
    expect(html).toMatch(/<label[^>]*>Search trips and places<\/label>/);
    expect(html).toContain("Search Chikmagalur, Coorg, Gokarna, Hampi...");
  });

  it("renders the place banner and the no-trip panel with the plan link", () => {
    const hampi = PLACES.find((p) => p.id === "hampi")!;
    const banner = renderToStaticMarkup(createElement(PlaceFilterBanner, { place: hampi, onClear: () => {} }));
    expect(banner).toContain("Trips that go to Hampi (Vijayanagara)");
    expect(banner).toContain("aria-label=\"Clear place\"");
    const panel = renderToStaticMarkup(createElement(NoTripForPlace, { place: hampi, onClear: () => {} }));
    expect(panel).toContain("No trip to Hampi yet");
    expect(panel).toContain("href=\"#ask\"");
    expect(panel).toContain("Ask us to plan Hampi");
    expect(panel).toContain("Show all trips");
  });
});
