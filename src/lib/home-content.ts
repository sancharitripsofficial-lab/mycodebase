/**
 * Home page words, cards and trip categories, editable in Admin → Website text → Home page.
 * Saved as the `home_page` site setting. Anything missing in a saved copy (older saves, new
 * fields) falls back to these defaults, so the page always renders complete.
 */

/** Colour + pattern families (classes `theme-*` in globals.css). */
export const THEME_KEYS = ["coorg", "chikmagalur", "gokarna", "hampi", "brand"] as const;
export type ThemeKey = (typeof THEME_KEYS)[number];
export const THEME_LABELS: Record<ThemeKey, string> = {
  coorg: "Green leaves (hills, forest)",
  chikmagalur: "Coffee brown (estates)",
  gokarna: "Sea blue waves (coast)",
  hampi: "Sunset stone (heritage)",
  brand: "Sanchari teal road (anything else)",
};

/** Tile colours (classes `tile-*` in globals.css). */
export const TILE_COLOURS = ["lagoon", "sunset", "leaf", "amber", "rose"] as const;
export type TileColour = (typeof TILE_COLOURS)[number];
export const TILE_LABELS: Record<TileColour, string> = {
  lagoon: "Lagoon blue",
  sunset: "Sunset orange",
  leaf: "Leaf green",
  amber: "Amber",
  rose: "Rose",
};

/** Icons the admin can pick for cards (mapped to lucide icons in components/home/icons.tsx). */
export const ICON_KEYS = [
  "user",
  "users",
  "group",
  "heart",
  "shield",
  "car",
  "map",
  "mountain",
  "coffee",
  "waves",
  "landmark",
  "sun",
  "calendar",
  "star",
  "camera",
  "utensils",
] as const;
export type IconKey = (typeof ICON_KEYS)[number];

export interface HomeCategory {
  id: string;
  name: string;
  description: string;
  theme: ThemeKey;
  /** Trips in this category, by their web address name (slug). */
  tripSlugs: string[];
}

export interface HomeCard {
  title: string;
  body: string;
  colour: TileColour;
  icon: IconKey;
  /** Optional link: a page ("/trips?mode=private") or a section ("#plan"). */
  href: string;
}

export interface SectionText {
  show: boolean;
  eyebrow: string;
  title: string;
  body: string;
}

export interface HomePageContent {
  kannadaLine: string;
  heroChip: string;
  categoriesSection: SectionText;
  categories: HomeCategory[];
  travellerCards: HomeCard[];
  departuresSection: SectionText;
  compareSection: SectionText & { usLabel: string; themLabel: string };
  compareRows: { label: string; us: string; them: string }[];
  howSection: SectionText;
  howCards: HomeCard[];
  routesSection: SectionText;
  safetySection: SectionText;
  reviewsSection: SectionText;
  planSection: SectionText;
  faqSection: SectionText;
}

export const DEFAULT_HOME_CONTENT: HomePageContent = {
  kannadaLine: "ಬನ್ನಿ, ಕರ್ನಾಟಕ ಸುತ್ತೋಣ",
  heroChip: "Weekend trips from Bengaluru • Max 6 per car",
  categoriesSection: {
    show: true,
    eyebrow: "Pick your weekend",
    title: "Hills, coffee, coast or ruins?",
    body: "Every kind of trip we run, with live weather at the place right now and the price per seat.",
  },
  categories: [
    {
      id: "hills",
      name: "Hills & rainforest",
      description: "Misty shola valleys, spice estates and slow forest drives in Kodagu.",
      theme: "coorg",
      tripSlugs: ["coorg-rainforest-slow-drive"],
    },
    {
      id: "coffee",
      name: "Coffee country",
      description: "Estate walks, filter coffee on the verandah and mountain viewpoints.",
      theme: "chikmagalur",
      tripSlugs: ["chikmagalur-coffee-trails"],
    },
    {
      id: "coast",
      name: "Coast & beaches",
      description: "Laterite cliff paths, quiet coves and sunset swims on the Uttara Kannada coast.",
      theme: "gokarna",
      tripSlugs: ["gokarna-coastal-headlands"],
    },
    {
      id: "heritage",
      name: "Heritage & ruins",
      description: "Giant boulders, carved temples and golden-hour ruins by the Tungabhadra.",
      theme: "hampi",
      tripSlugs: ["hampi-boulders-and-ruins"],
    },
  ],
  travellerCards: [
    { title: "Going solo", body: "Buy one seat, ride with five others. Pick a window on the live car map.", colour: "lagoon", icon: "user", href: "/trips" },
    { title: "Women-only batches", body: "Dates run only with women travellers, scheduled by our team.", colour: "rose", icon: "shield", href: "/trips?mode=women" },
    { title: "Couples & families", body: "Book the whole car: all six seats, just your people.", colour: "sunset", icon: "heart", href: "/trips?mode=private" },
    { title: "Friends & teams", body: "More than six? We run two or more cars on your date.", colour: "leaf", icon: "group", href: "#plan" },
  ],
  departuresSection: { show: true, eyebrow: "Live departure availability", title: "Upcoming 6-seat departures", body: "" },
  compareSection: {
    show: true,
    eyebrow: "Why a car, not a bus",
    title: "A 6-seat car beats a 40-seat bus",
    body: "",
    usLabel: "Sanchari car",
    themLabel: "Big-bus tour",
  },
  compareRows: [
    { label: "People on board", us: "6 at most, always", them: "Often 30 to 50" },
    { label: "Your seat", us: "You pick it on a live car map", them: "Given out on boarding day" },
    { label: "Booking", us: "Live dates and seats, held while you pay by UPI", them: "Fill a form, wait for a call-back" },
    { label: "Driver and car", us: "Name, car and WhatsApp group shown 3 days before", them: "Shared on the day" },
    { label: "Whole vehicle", us: "Book all six seats for your group", them: "Rarely possible" },
  ],
  howSection: { show: true, eyebrow: "How Sanchari works", title: "One comfortable MPV. Six seats. Zero bus-tour rush.", body: "" },
  howCards: [
    {
      title: "Hard cap of 6",
      body: "Whether you join solo, as a duo, or book the whole vehicle privately, departures never exceed six travelers.",
      colour: "lagoon",
      icon: "users",
      href: "",
    },
    {
      title: "Ertiga-class comfort",
      body: "Curated weekend routes from Bengaluru with planned highway meal stops and ghat-road daylight pacing.",
      colour: "sunset",
      icon: "car",
      href: "",
    },
    {
      title: "Private comfort care",
      body: "Optional co-traveler and room preferences are reviewed privately by operations and never exposed publicly.",
      colour: "rose",
      icon: "heart",
      href: "",
    },
    {
      title: "Transparent terms",
      body: "Clear inclusions, cancellation slabs, and server-verified seat holds before any payment step.",
      colour: "leaf",
      icon: "shield",
      href: "",
    },
  ],
  routesSection: { show: true, eyebrow: "Curated routes", title: "Karnataka micro-expeditions", body: "" },
  safetySection: {
    show: true,
    eyebrow: "Safety, respect & privacy",
    title: "Designed for solo travelers, friends, and peace of mind.",
    body:
      "We treat comfort and room requests as sensitive operational inputs—never public badges or marketing gimmicks. Women-only departures are explicitly scheduled by our team, and solo overnight stays default to same-gender shared rooms only where confirmed by the operator.",
  },
  reviewsSection: { show: true, eyebrow: "Traveler notes", title: "Verified reflections", body: "" },
  planSection: {
    show: true,
    eyebrow: "Plan my trip",
    title: "Your date, your group, your route.",
    body: "Private car on a date we don't list, a group bigger than six, or a place we don't run yet. Tell us once and we reply on WhatsApp.",
  },
  faqSection: { show: true, eyebrow: "Questions", title: "Before you book", body: "Luggage space, pickup timing, private 6-seat dates and more." },
};

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

function mergeSection<T extends SectionText>(def: T, v: unknown): T {
  return isObj(v) ? ({ ...def, ...v } as T) : def;
}

/** Saved copy + defaults for anything missing (older saves, fields added later). */
export function mergeHomeContent(saved: unknown): HomePageContent {
  const d = DEFAULT_HOME_CONTENT;
  if (!isObj(saved)) return d;
  const s = saved as Partial<HomePageContent>;
  return {
    kannadaLine: typeof s.kannadaLine === "string" ? s.kannadaLine : d.kannadaLine,
    heroChip: typeof s.heroChip === "string" && s.heroChip.trim() ? s.heroChip : d.heroChip,
    categoriesSection: mergeSection(d.categoriesSection, s.categoriesSection),
    categories: Array.isArray(s.categories) ? s.categories : d.categories,
    travellerCards: Array.isArray(s.travellerCards) ? s.travellerCards : d.travellerCards,
    departuresSection: mergeSection(d.departuresSection, s.departuresSection),
    compareSection: mergeSection(d.compareSection, s.compareSection),
    compareRows: Array.isArray(s.compareRows) ? s.compareRows : d.compareRows,
    howSection: mergeSection(d.howSection, s.howSection),
    howCards: Array.isArray(s.howCards) ? s.howCards : d.howCards,
    routesSection: mergeSection(d.routesSection, s.routesSection),
    safetySection: mergeSection(d.safetySection, s.safetySection),
    reviewsSection: mergeSection(d.reviewsSection, s.reviewsSection),
    planSection: mergeSection(d.planSection, s.planSection),
    faqSection: mergeSection(d.faqSection, s.faqSection),
  };
}

/** Category a trip belongs to (first match), or null. */
export function categoryOfTrip(categories: HomeCategory[], slug: string): HomeCategory | null {
  return categories.find((c) => c.tripSlugs.includes(slug)) ?? null;
}
