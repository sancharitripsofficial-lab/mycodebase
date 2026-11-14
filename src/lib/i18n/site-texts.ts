/**
 * Every visitor-facing text that comes from the owner's data (trips, itinerary, pickups, home page,
 * policies, FAQs, chat guide, offers), so Admin → Kannada can show which ones still need Kannada.
 * Generic on purpose: new fields are picked up without code changes. Ids, links, codes, dates,
 * numbers and machine values are skipped.
 */

export interface SiteText {
  en: string;
  /** Where it comes from, e.g. "Trip: Kodagu Rainforest & Spice Drive". */
  where: string;
}

const SKIP_KEYS = /(^id$|Id$|^slug$|Slug$|url$|Url$|Urls$|^code$|Code$|status$|Status$|type$|Type$|^theme$|^mode$|At$|Date$|^date$|Paise$|Percent$|Count$|^order$|sortOrder|Number$|number$|^email|Email$|^phone|Phone$|^placements$|^mediaType$|^difficulty$|^region$|^icon$|^emotion|guideMedia|^tripSlugs$|Days$|Minutes$|^isActive$|^key$)/;
const LOOKS_MACHINE = /^(https?:\/\/|\/|#|[a-z0-9_-]+$|[\w.+-]+@[\w-]+\.|\+?\d[\d\s-]{5,}$|\d{4}-\d{2}-\d{2})/;

const normalise = (s: string) => s.replace(/\s+/g, " ").trim();

function walk(value: unknown, where: string, out: Map<string, string>, key = "", depth = 0): void {
  if (depth > 8 || value === null || value === undefined) return;
  if (typeof value === "string") {
    if (SKIP_KEYS.test(key)) return;
    // Pages show multi-line texts line by line too, so offer the whole text and each line.
    const parts = [value, ...value.split(/\r?\n/)];
    for (const raw of parts) {
      const s = normalise(raw);
      if (s.length < 2 || !/[A-Za-z]{2,}/.test(s) || LOOKS_MACHINE.test(s)) continue;
      if (!out.has(s)) out.set(s, where);
    }
    return;
  }
  if (Array.isArray(value)) {
    for (const v of value) walk(v, where, out, key, depth + 1);
    return;
  }
  if (typeof value === "object") {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (SKIP_KEYS.test(k)) continue;
      walk(v, where, out, k, depth + 1);
    }
  }
}

export function collectSiteTexts(input: {
  settings: Record<string, unknown>;
  trips: { trip: { title: string } & Record<string, unknown>; itinerary?: unknown[]; pickupPoints?: unknown[] }[];
  promotions?: ({ title: string } & Record<string, unknown>)[];
}): SiteText[] {
  const out = new Map<string, string>();
  for (const t of input.trips) {
    const where = `Trip: ${t.trip.title}`;
    walk(t.trip, where, out);
    walk(t.itinerary ?? [], `${where} (itinerary)`, out);
    walk(t.pickupPoints ?? [], `${where} (pickup points)`, out);
  }
  const s = input.settings;
  const sections: [string, string][] = [
    ["homePage", "Home page"],
    ["brandIdentity", "Brand & contact"],
    ["bookingPolicy", "Booking rules"],
    ["faqs", "FAQs"],
    ["legalDrafts", "Legal pages"],
    ["assistant", "Chat guide"],
  ];
  for (const [key, label] of sections) walk(s[key], label, out);
  for (const p of input.promotions ?? []) walk(p, `Offer: ${p.title}`, out);
  return [...out.entries()].map(([en, where]) => ({ en, where }));
}
