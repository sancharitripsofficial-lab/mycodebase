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
  "bed",
  "route",
  "message",
  "tag",
] as const;
export type IconKey = (typeof ICON_KEYS)[number];

/** The five steps on the home 'Pick-up to drop' film card. */
export const JOURNEY_STEP_KEYS = ["pickup", "journey", "moments", "stay", "drop"] as const;
export type JourneyStepKey = (typeof JOURNEY_STEP_KEYS)[number];
export const JOURNEY_STEP_LABELS: Record<JourneyStepKey, string> = { pickup: "Pick-up", journey: "Journey", moments: "Moments", stay: "Stay", drop: "Drop" };

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
  /** Short facts under the first-screen buttons ("Max 6 travellers", …). Only what every trip really offers. */
  heroPoints: string[];
  categoriesSection: SectionText;
  categories: HomeCategory[];
  travellerCards: HomeCard[];
  departuresSection: SectionText;
  /** Coming soon: resorts, hotel rooms and pick-up-to-drop planning. */
  /** watermark: stamp on the card's film, e.g. "Upcoming · Stay + Food" (empty = none). */
  beyondSection: SectionText & { tagline: string; buttonLabel: string; watermark: string; upcomingSteps: JourneyStepKey[] };
  beyondCards: HomeCard[];
  compareSection: SectionText & { usLabel: string; themLabel: string };
  compareRows: { label: string; us: string; them: string }[];
  howSection: SectionText;
  howCards: HomeCard[];
  routesSection: SectionText;
  /** "Travel with confidence": the promises every trip keeps, each linked to where it is written down. */
  trustSection: SectionText;
  trustCards: HomeCard[];
  /** The people behind Sanchari (names, roles and photos: Admin → Pictures & videos → Team). */
  teamSection: SectionText;
  /** Real photos of the car, shown only once the owner has added some (Admin → Pictures & videos). */
  vehicleSection: SectionText;
  /** Real photos from past trips, shown only once the owner has added some. */
  journeysSection: SectionText;
  safetySection: SectionText;
  reviewsSection: SectionText;
  planSection: SectionText;
  faqSection: SectionText;
}

export const DEFAULT_HOME_CONTENT: HomePageContent = {
  kannadaLine: "ಬನ್ನಿ, ಕರ್ನಾಟಕ ಸುತ್ತೋಣ",
  heroChip: "Sanchari Trips • Small-group road trips from Bengaluru • Max 6 per car",
  heroPoints: ["Max 6 travellers", "Ertiga-class MPV", "Bengaluru pick-up", "Price shown upfront"],
  categoriesSection: {
    show: true,
    eyebrow: "Pick your trip",
    title: "Which kind of trip suits you?",
    body: "Every kind of trip we run, with live weather at the place right now and the price per seat.",
  },
  categories: [
    {
      id: "hills",
      name: "Hills & rainforest",
      description: "Misty shola valleys, spice estates and slow forest drives in Kodagu.",
      theme: "coorg",
      tripSlugs: ["coorg-rainforest-spice-drive"],
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
  beyondSection: {
    show: true,
    eyebrow: "Coming soon: beyond the trip",
    title: "Pick-up to drop, all in one plan",
    body: "We are going beyond our tours. We are connecting with resorts and hotel rooms, so your trip runs smoothly from pick-up to drop without you searching for stays. For batch trips, solo travellers and every group.",
    tagline: "Plan your unplanned experiences with Sanchari Trips.",
    buttonLabel: "Tell us your plan",
    watermark: "Upcoming · Stay + Food",
    upcomingSteps: ["moments", "stay"],
  },
  beyondCards: [
    { title: "Resort stays", body: "Resorts linked to your trip, so you never hunt for a stay on your own.", colour: "leaf", icon: "mountain", href: "" },
    { title: "Hotel rooms", body: "Rooms on your route, arranged along with your booking.", colour: "lagoon", icon: "bed", href: "" },
    { title: "Pick-up to drop", body: "One plan from your pick-up point to the drop after the trip ends.", colour: "sunset", icon: "route", href: "" },
    { title: "Batch, solo or group", body: "Joining a batch date, going solo or bringing your own group, we plan around you.", colour: "amber", icon: "users", href: "#plan" },
  ],
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
      body: "Curated routes from Bengaluru with planned highway meal stops and ghat-road daylight pacing.",
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
  routesSection: { show: true, eyebrow: "Upcoming trips", title: "Pick a date and reserve your seat", body: "" },
  trustSection: {
    show: true,
    eyebrow: "Travel with confidence",
    title: "What you can count on, every trip",
    body: "",
  },
  trustCards: [
    { title: "Six travellers, never more", body: "Every car is capped at six seats. You see the open seats before you book.", colour: "lagoon", icon: "users", href: "/trips" },
    { title: "The price you see is the price", body: "Each trip page lists what is included and what is not, before you pay anything.", colour: "sunset", icon: "tag", href: "/trips" },
    { title: "Safety and refunds, in writing", body: "Our safety standards and cancellation rules are published for you to read first.", colour: "leaf", icon: "shield", href: "/policies#refunds" },
    { title: "A person on WhatsApp", body: "Message our team before or after you book. A real person replies.", colour: "amber", icon: "message", href: "/contact" },
  ],
  teamSection: { show: true, eyebrow: "Meet Sanchari", title: "The people who plan and run your trip", body: "" },
  vehicleSection: { show: true, eyebrow: "Our car", title: "The car you travel in", body: "" },
  journeysSection: { show: true, eyebrow: "From our trips", title: "Moments from the road", body: "" },
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
  faqSection: { show: true, eyebrow: "Questions", title: "Frequently asked questions", body: "The six-seat cap, joining solo, room requests, pickup points and more." },
};

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

function mergeSection<T extends SectionText>(def: T, v: unknown): T {
  return isObj(v) ? ({ ...def, ...v } as T) : def;
}

/**
 * Old built-in wording that said "weekend" (trips run on any listed day, or on the traveller's
 * own dates with a private car). A saved value that is EXACTLY the old default is shown as the
 * new default; anything the owner wrote themselves is never touched (SEO plan §8.2).
 */
export const OLD_HOME_DEFAULTS = {
  // The trip cards moved up to sit right under the first screen: their heading now says what to do.
  routesEyebrow: "Curated routes",
  routesTitle: "Karnataka micro-expeditions",
  heroChip: "Weekend trips from Bengaluru • Max 6 per car",
  categoriesEyebrow: "Pick your weekend",
  // Named a coast and ruins, but only hill and coffee trips run (no Gokarna or Hampi trip).
  categoriesTitle: "Hills, coffee, coast or ruins?",
  howCardBody: "Curated weekend routes from Bengaluru with planned highway meal stops and ghat-road daylight pacing.",
  faqTitle: "Before you book",
  // Named "luggage space", which no FAQ answers (the luggage allowance is shared only after owner
  // confirmation, /policies).
  faqBody: "Luggage space, pickup timing, private 6-seat dates and more.",
} as const;

const upgrade = (value: unknown, oldDefault: string, newDefault: string) => (value === oldDefault ? newDefault : value);

function upgradeSection(v: unknown, fields: Partial<Record<"eyebrow" | "title" | "body", [string, string]>>): unknown {
  if (!isObj(v)) return v;
  const out: Record<string, unknown> = { ...v };
  for (const [key, pair] of Object.entries(fields)) {
    if (pair) out[key] = upgrade(out[key], pair[0], pair[1]);
  }
  return out;
}

/** Saved copy + defaults for anything missing (older saves, fields added later). */
export function mergeHomeContent(saved: unknown): HomePageContent {
  const d = DEFAULT_HOME_CONTENT;
  if (!isObj(saved)) return d;
  const s = saved as Partial<HomePageContent>;
  const old = OLD_HOME_DEFAULTS;
  const savedHero = upgrade(s.heroChip, old.heroChip, d.heroChip);
  const howCards = Array.isArray(s.howCards)
    ? s.howCards.map((card) => (isObj(card) ? { ...card, body: upgrade(card.body, old.howCardBody, d.howCards[1].body) } : card) as HomeCard)
    : d.howCards;
  return {
    kannadaLine: typeof s.kannadaLine === "string" ? s.kannadaLine : d.kannadaLine,
    heroChip: typeof savedHero === "string" && savedHero.trim() ? savedHero : d.heroChip,
    heroPoints: Array.isArray(s.heroPoints) ? s.heroPoints.filter((p): p is string => typeof p === "string" && p.trim().length > 0).slice(0, 4) : d.heroPoints,
    categoriesSection: mergeSection(
      d.categoriesSection,
      upgradeSection(s.categoriesSection, {
        eyebrow: [old.categoriesEyebrow, d.categoriesSection.eyebrow],
        title: [old.categoriesTitle, d.categoriesSection.title],
      })
    ),
    categories: Array.isArray(s.categories) ? s.categories : d.categories,
    travellerCards: Array.isArray(s.travellerCards) ? s.travellerCards : d.travellerCards,
    departuresSection: mergeSection(d.departuresSection, s.departuresSection),
    beyondSection: mergeSection(d.beyondSection, s.beyondSection),
    beyondCards: Array.isArray(s.beyondCards) ? s.beyondCards : d.beyondCards,
    compareSection: mergeSection(d.compareSection, s.compareSection),
    compareRows: Array.isArray(s.compareRows) ? s.compareRows : d.compareRows,
    howSection: mergeSection(d.howSection, s.howSection),
    howCards,
    routesSection: mergeSection(
      d.routesSection,
      upgradeSection(s.routesSection, {
        eyebrow: [old.routesEyebrow, d.routesSection.eyebrow],
        title: [old.routesTitle, d.routesSection.title],
      })
    ),
    trustSection: mergeSection(d.trustSection, s.trustSection),
    trustCards: Array.isArray(s.trustCards) ? s.trustCards : d.trustCards,
    teamSection: mergeSection(d.teamSection, s.teamSection),
    vehicleSection: mergeSection(d.vehicleSection, s.vehicleSection),
    journeysSection: mergeSection(d.journeysSection, s.journeysSection),
    safetySection: mergeSection(d.safetySection, s.safetySection),
    reviewsSection: mergeSection(d.reviewsSection, s.reviewsSection),
    planSection: mergeSection(d.planSection, s.planSection),
    faqSection: mergeSection(d.faqSection, upgradeSection(s.faqSection, { title: [old.faqTitle, d.faqSection.title], body: [old.faqBody, d.faqSection.body] })),
  };
}

/** Category a trip belongs to (first match), or null. */
export function categoryOfTrip(categories: HomeCategory[], slug: string): HomeCategory | null {
  return categories.find((c) => c.tripSlugs.includes(slug)) ?? null;
}
