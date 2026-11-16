/**
 * Karnataka travel guide pages: /karnataka (the hub) and /karnataka/[slug], one page per region,
 * district and kind of place. Everything is built from the fact-checked place list
 * (karnataka-places.ts). That list holds no distances, prices, opening times or rankings, so
 * these pages state none.
 */
import type { TripWithDetails } from "@/lib/types";
import { CATEGORY_LABELS, CATEGORY_ORDER, KARNATAKA_DISTRICTS, KARNATAKA_PLACES } from "./karnataka-places";
import { placeTripMatches } from "./search";
import type { KarnatakaDistrict, KarnatakaPlace, PlaceCategory, PlaceRegion } from "./types";

/**
 * The day the guide's facts last changed (the sitemap's lastmod for these pages). Move it only
 * when the place list or the guide wording really changes: search engines learn to ignore dates
 * that move for no reason.
 */
export const GUIDE_UPDATED_ON = "2026-11-16";
export const GUIDE_BASE = "/karnataka";

export type GuideKind = "region" | "district" | "category";

export interface GuideGroup {
  id: string;
  heading: string;
  /** The guide page for this group (a district, a region or a kind of place), when there is one. */
  href: string | null;
  places: KarnatakaPlace[];
}

export interface GuidePage {
  kind: GuideKind;
  slug: string;
  path: string;
  /** Short name for links and breadcrumbs: "Kodagu (Coorg)", "Coastal Karnataka", "Waterfalls". */
  name: string;
  /** Before the " | Sanchari Trips" suffix; at most 43 characters. */
  title: string;
  description: string;
  h1: string;
  eyebrow: string;
  intro: string[];
  /** What the enquiry form starts with: "I'd like a trip to <planName>." */
  planName: string;
  places: KarnatakaPlace[];
  groups: GuideGroup[];
  region: PlaceRegion | null;
  district: KarnatakaDistrict | null;
  category: PlaceCategory | null;
}

const TITLE_MAX = 43;
const DESCRIPTION_MIN = 140;
const DESCRIPTION_MAX = 158;

const slugify = (text: string) =>
  text
    .toLowerCase()
    .replace(/&/g, " ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

/** "A", "A and B", "A, B and C". */
export function listWords(words: readonly string[]): string {
  if (words.length <= 1) return words[0] ?? "";
  return `${words.slice(0, -1).join(", ")} and ${words[words.length - 1]}`;
}

const TAILS = [
  " Ask Sanchari Trips to plan your road trip from Bengaluru.",
  " Ask us to plan your trip from Bengaluru.",
  " Ask us to plan your trip.",
  "",
];

/**
 * Widely known places, named first in search descriptions (an order only: the pages call nothing
 * "best" or "top"). Every name must be a place in karnataka-places.ts (checked by a test).
 */
export const WELL_KNOWN_PLACES: readonly string[] = [
  "Hampi", "Mysore Palace", "Jog Falls", "Abbey Falls", "Nandi Hills", "Mullayanagiri", "Agumbe", "Kodachadri", "Gol Gumbaz",
  "Badami Cave Temples", "Pattadakal", "Aihole", "Halebidu", "Belur Chennakeshava Temple", "Shravanabelagola",
  "Udupi Sri Krishna Matha", "Malpe Beach", "St Mary's Island", "Om Beach", "Kudle Beach", "Netrani Island", "Yana Caves",
  "Chamundi Hills", "Virupaksha Temple", "Vittala Temple", "KRS Dam & Brindavan Gardens", "Srirangapatna", "BR Hills",
  "Skandagiri", "Savandurga", "Kemmangundi", "Baba Budangiri", "Madikeri", "Raja's Seat", "Sakleshpur", "Gokak Falls",
  "Bidar Fort", "Chitradurga Fort", "Lalbagh Botanical Garden", "Cubbon Park", "Bangalore Palace", "Kaveri Nisargadhama",
  "Daroji Bear Sanctuary", "Panambur Beach", "Anjanadri Hill", "Anegundi", "Mysuru", "Mangaluru", "Hubballi", "Belagavi", "Gokarna",
];

const wellKnownRank = new Map(WELL_KNOWN_PLACES.map((name, i) => [name, i]));

/**
 * Place names to mention in a description: widely known ones first, the rest in list order.
 * Names with a comma ("Mahabaleshwar Temple, Gokarna") are left out, because they read as two
 * places in a list; `skipTowns` leaves out the towns themselves when enough other places remain.
 */
function exampleNames(places: readonly KarnatakaPlace[], skipTowns = false): string[] {
  const usable = places.filter((p) => !p.name.includes(","));
  const withoutTowns = usable.filter((p) => p.categories[0] !== "city_town");
  const pool = skipTowns && withoutTowns.length >= 3 ? withoutTowns : usable;
  const rank = (p: KarnatakaPlace) => wellKnownRank.get(p.name) ?? Number.MAX_SAFE_INTEGER;
  return [...pool].sort((a, b) => rank(a) - rank(b)).map((p) => p.name);
}

/**
 * A search description that names as many of `names` as fit in 140-158 characters. Tries the most
 * names first and the longer closing line first; falls back to the longest text that still fits.
 */
function fitDescription(build: (names: string) => string, names: readonly string[]): string {
  let longest = "";
  for (let n = Math.min(names.length, 6); n >= 1; n--) {
    for (const tail of TAILS) {
      const text = `${build(listWords(names.slice(0, n)))}${tail}`;
      if (text.length > DESCRIPTION_MAX) continue;
      if (text.length >= DESCRIPTION_MIN) return text;
      if (text.length > longest.length) longest = text;
    }
  }
  return longest || build(names[0] ?? "Karnataka").slice(0, DESCRIPTION_MAX);
}

// ---------------------------------------------------------------------------
// Regions
// ---------------------------------------------------------------------------

interface RegionInfo {
  region: PlaceRegion;
  slug: string;
  /** Link label and the name used in sentences. */
  name: string;
  title: string;
  h1: string;
}

export const GUIDE_REGIONS: readonly RegionInfo[] = [
  {
    region: "Bengaluru & surroundings",
    slug: "near-bangalore",
    name: "Bengaluru & surroundings",
    title: "Places to Visit near Bangalore",
    h1: "Places to visit near Bengaluru (Bangalore)",
  },
  {
    region: "Mysuru & South Karnataka",
    slug: "mysuru-south-karnataka",
    name: "Mysuru & South Karnataka",
    title: "Mysuru & South Karnataka: Places to Visit",
    h1: "Places to visit in Mysuru & South Karnataka",
  },
  {
    region: "Malnad & Western Ghats",
    slug: "malnad-western-ghats",
    name: "Malnad & Western Ghats",
    title: "Malnad & Western Ghats: Places to Visit",
    h1: "Places to visit in Malnad & the Western Ghats",
  },
  {
    region: "Coastal Karnataka",
    slug: "coastal-karnataka",
    name: "Coastal Karnataka",
    title: "Coastal Karnataka: Places to Visit",
    h1: "Places to visit in Coastal Karnataka",
  },
  {
    region: "North Karnataka",
    slug: "north-karnataka",
    name: "North Karnataka",
    title: "North Karnataka: Places to Visit",
    h1: "Places to visit in North Karnataka",
  },
  {
    region: "Hyderabad-Karnataka (Kalyana Karnataka)",
    slug: "kalyana-karnataka",
    name: "Kalyana Karnataka",
    title: "Kalyana Karnataka: Places to Visit",
    h1: "Places to visit in Kalyana Karnataka (Hyderabad-Karnataka)",
  },
];

const regionInfo = (region: PlaceRegion) => GUIDE_REGIONS.find((r) => r.region === region)!;

// ---------------------------------------------------------------------------
// Districts
// ---------------------------------------------------------------------------

/** The old or English name people still search for a district, where it has one. */
const DISTRICT_OTHER_NAME: Readonly<Record<string, string>> = {
  Ballari: "Bellary",
  Belagavi: "Belgaum",
  "Bengaluru South": "Ramanagara",
  "Bengaluru Urban": "Bangalore",
  Chikkamagaluru: "Chikmagalur",
  Davanagere: "Davangere",
  Kalaburagi: "Gulbarga",
  Kodagu: "Coorg",
  Mysuru: "Mysore",
  Shivamogga: "Shimoga",
  Tumakuru: "Tumkur",
  Vijayapura: "Bijapur",
};

/**
 * The name in the search title where the plain one would not be what people type: the searched
 * name first, or the district's best-known town next to it (Hubballi is in Dharwad district and
 * Hampi in Vijayanagara district).
 */
const DISTRICT_TITLE_NAME: Readonly<Record<string, string>> = {
  "Bengaluru South": "Ramanagara",
  "Bengaluru Urban": "Bengaluru (Bangalore)",
  Chikkamagaluru: "Chikmagalur",
  Dharwad: "Dharwad & Hubballi",
  Kodagu: "Coorg (Kodagu)",
  Vijayanagara: "Hampi & Vijayanagara",
};

/** "Kodagu (Coorg)", "Mysuru (Mysore)", "Udupi". */
export function districtDisplayName(district: Pick<KarnatakaDistrict, "name">): string {
  const other = DISTRICT_OTHER_NAME[district.name];
  return other ? `${district.name} (${other})` : district.name;
}

export const districtSlug = (district: Pick<KarnatakaDistrict, "name">) => slugify(district.name);

function districtTitle(district: KarnatakaDistrict): string {
  const candidates = [DISTRICT_TITLE_NAME[district.name], districtDisplayName(district), district.name].filter(Boolean) as string[];
  for (const name of candidates) {
    const title = `Places to Visit in ${name}`;
    if (title.length <= TITLE_MAX) return title;
  }
  return `${district.name}: Places to Visit`.slice(0, TITLE_MAX);
}

// ---------------------------------------------------------------------------
// Kinds of place
// ---------------------------------------------------------------------------

const CATEGORY_SLUG: Readonly<Record<PlaceCategory, string>> = {
  hill_station: "hill-stations",
  coffee_tea: "coffee-tea-country",
  waterfall: "waterfalls",
  trek_peak: "treks-peaks",
  wildlife_forest: "wildlife-forests",
  beach_coast: "beaches-coast",
  island: "islands",
  heritage: "heritage-history",
  temple_pilgrimage: "temples-pilgrimage",
  lake_river_dam: "lakes-rivers-dams",
  cave: "caves",
  city_town: "cities-towns",
};

/** How the kind of place reads inside a sentence ("36 waterfalls in Karnataka"). */
const CATEGORY_NOUN: Readonly<Record<PlaceCategory, string>> = {
  hill_station: "hill stations",
  coffee_tea: "coffee and tea places",
  waterfall: "waterfalls",
  trek_peak: "treks and peaks",
  wildlife_forest: "wildlife and forest places",
  beach_coast: "beach and coast places",
  island: "islands",
  heritage: "heritage places",
  temple_pilgrimage: "temples and pilgrimage places",
  lake_river_dam: "lakes, rivers and dams",
  cave: "caves",
  city_town: "cities and towns",
};

const CATEGORY_TITLE: Readonly<Record<PlaceCategory, (n: number) => string>> = {
  hill_station: (n) => `${n} Hill Stations in Karnataka to Visit`,
  coffee_tea: () => "Coffee & Tea Places in Karnataka",
  waterfall: (n) => `${n} Waterfalls in Karnataka to Visit`,
  trek_peak: (n) => `${n} Treks & Peaks in Karnataka`,
  wildlife_forest: (n) => `${n} Wildlife & Forest Places in Karnataka`,
  beach_coast: (n) => `${n} Beach & Coast Places in Karnataka`,
  island: (n) => `${n} Islands in Karnataka to Visit`,
  heritage: (n) => `${n} Heritage Places in Karnataka`,
  temple_pilgrimage: (n) => `Temples in Karnataka: ${n} Places to Visit`,
  lake_river_dam: (n) => `${n} Lakes, Rivers & Dams in Karnataka`,
  cave: (n) => `${n} Caves in Karnataka to Visit`,
  city_town: (n) => `${n} Cities & Towns in Karnataka to Visit`,
};

export const categorySlug = (category: PlaceCategory) => CATEGORY_SLUG[category];
export const categoryNoun = (category: PlaceCategory) => CATEGORY_NOUN[category];

// ---------------------------------------------------------------------------
// The pages
// ---------------------------------------------------------------------------

const districtByName = new Map(KARNATAKA_DISTRICTS.map((d) => [d.name, d]));
const sortedDistricts = [...KARNATAKA_DISTRICTS].sort((a, b) => a.name.localeCompare(b.name));

const regionHref = (region: PlaceRegion) => `${GUIDE_BASE}/${regionInfo(region).slug}`;
const districtHref = (name: string) => `${GUIDE_BASE}/${slugify(name)}`;
const categoryHref = (category: PlaceCategory) => `${GUIDE_BASE}/${CATEGORY_SLUG[category]}`;

function districtPage(district: KarnatakaDistrict): GuidePage {
  const places = KARNATAKA_PLACES.filter((p) => p.district === district.name);
  const display = districtDisplayName(district);
  const region = regionInfo(district.region);
  const groups: GuideGroup[] = CATEGORY_ORDER.map((category) => ({
    id: CATEGORY_SLUG[category],
    heading: CATEGORY_LABELS[category],
    href: categoryHref(category),
    places: places.filter((p) => p.categories[0] === category),
  })).filter((g) => g.places.length > 0);
  // Other names people type for the district, without the ones that only repeat its own name.
  const others = district.aliases
    .filter((a) => !a.toLowerCase().includes(district.name.toLowerCase()) && !/district$/i.test(a) && a !== DISTRICT_OTHER_NAME[district.name])
    .slice(0, 3);
  const slug = districtSlug(district);
  return {
    kind: "district",
    slug,
    path: `${GUIDE_BASE}/${slug}`,
    name: display,
    title: districtTitle(district),
    description: fitDescription(
      (names) => `${places.length} places to visit in ${display} district, Karnataka, such as ${names}.`,
      exampleNames(places, true),
    ),
    h1: `Places to visit in ${display}`,
    eyebrow: `${region.name} · Karnataka district guide`,
    intro: [
      `${display} is a district of Karnataka, listed in this guide under ${region.name}.${
        others.length ? ` People also search for it as ${listWords(others)}.` : ""
      }`,
      `This page lists ${places.length} places to visit in ${district.name}, grouped by type: ${listWords(groups.map((g) => g.heading.toLowerCase()))}.`,
    ],
    planName: display,
    places,
    groups,
    region: district.region,
    district,
    category: null,
  };
}

function regionPage(info: RegionInfo): GuidePage {
  const districts = sortedDistricts.filter((d) => d.region === info.region);
  const places = KARNATAKA_PLACES.filter((p) => p.region === info.region);
  const groups: GuideGroup[] = districts
    .map((d) => ({
      id: districtSlug(d),
      heading: districtDisplayName(d),
      href: districtHref(d.name),
      places: places.filter((p) => p.district === d.name),
    }))
    .filter((g) => g.places.length > 0);
  return {
    kind: "region",
    slug: info.slug,
    path: `${GUIDE_BASE}/${info.slug}`,
    name: info.name,
    title: info.title,
    description: fitDescription(
      (names) => `${places.length} places to visit in ${info.name}, across ${districts.length} districts including ${names}.`,
      districts.map((d) => d.name),
    ),
    h1: info.h1,
    eyebrow: "Karnataka region guide",
    intro: [
      `${info.name} is one of the six regions this guide uses for Karnataka. It covers ${districts.length} districts: ${listWords(
        districts.map((d) => districtDisplayName(d)),
      )}.`,
      `This page lists ${places.length} places to visit, district by district.`,
    ],
    planName: info.name,
    places,
    groups,
    region: info.region,
    district: null,
    category: null,
  };
}

function categoryPage(category: PlaceCategory): GuidePage {
  // Places whose main type this is come first; then places that also count as this type.
  const main = KARNATAKA_PLACES.filter((p) => p.categories[0] === category);
  const also = KARNATAKA_PLACES.filter((p) => p.categories[0] !== category && p.categories.includes(category));
  const places = [...main, ...also];
  const noun = CATEGORY_NOUN[category];
  const groups: GuideGroup[] = GUIDE_REGIONS.map((r) => ({
    id: r.slug,
    heading: r.name,
    href: regionHref(r.region),
    places: places.filter((p) => p.region === r.region),
  })).filter((g) => g.places.length > 0);
  const slug = CATEGORY_SLUG[category];
  return {
    kind: "category",
    slug,
    path: `${GUIDE_BASE}/${slug}`,
    name: CATEGORY_LABELS[category],
    title: CATEGORY_TITLE[category](places.length),
    description: fitDescription(
      (names) => `${places.length} ${noun} in Karnataka, listed by region and district, such as ${names}.`,
      exampleNames(main.length >= 3 ? main : places),
    ),
    h1: `${CATEGORY_LABELS[category]} in Karnataka`,
    eyebrow: "Karnataka places by type",
    intro: [
      `This page lists ${places.length} ${noun} in Karnataka, region by region. Each one names its district, so you can see what is close together.`,
    ],
    planName: `${noun} in Karnataka`,
    places,
    groups,
    region: null,
    district: null,
    category,
  };
}

/** Every guide page: 6 regions, 31 districts and 12 kinds of place. */
export const GUIDE_PAGES: readonly GuidePage[] = [
  ...GUIDE_REGIONS.map(regionPage),
  ...sortedDistricts.map(districtPage),
  ...CATEGORY_ORDER.map(categoryPage),
];

const pageBySlug = new Map(GUIDE_PAGES.map((p) => [p.slug, p]));

export function guidePage(slug: string): GuidePage | null {
  return pageBySlug.get(slug) ?? null;
}

export const guidePagesOfKind = (kind: GuideKind) => GUIDE_PAGES.filter((p) => p.kind === kind);

/** The guide page of a district, by its official name. */
export function districtGuide(name: string): GuidePage | null {
  const d = districtByName.get(name);
  return d ? guidePage(districtSlug(d)) : null;
}

// ---------------------------------------------------------------------------
// The hub (/karnataka)
// ---------------------------------------------------------------------------

export const GUIDE_HUB = {
  path: GUIDE_BASE,
  name: "Places to visit in Karnataka",
  title: "Places to Visit in Karnataka: Travel Guide",
  h1: "Places to visit in Karnataka",
  description: `Karnataka travel guide: ${KARNATAKA_PLACES.length} places to visit by region, district and type, from hill stations and waterfalls to beaches, treks, wildlife and temples.`,
} as const;

// ---------------------------------------------------------------------------
// Trips that go there
// ---------------------------------------------------------------------------

/** Published trips that go to any of the places (see placeTripMatches), each trip once, in list order. */
export function tripsForPlaces(places: readonly KarnatakaPlace[], trips: readonly TripWithDetails[]): TripWithDetails[] {
  const found = new Set<TripWithDetails>();
  for (const place of places) {
    for (const item of placeTripMatches(place, trips, KARNATAKA_DISTRICTS, KARNATAKA_PLACES)) found.add(item);
  }
  return trips.filter((t) => found.has(t));
}
