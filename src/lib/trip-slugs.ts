/**
 * Old trip web addresses that moved to a new one (SEO plan §6).
 *
 * Key = the old slug, value = the new slug. Add a line here BEFORE a trip's "Web address" is
 * changed in Admin, deploy, then rename the trip. The rules:
 *
 * - The old address 308-redirects (permanent) only when the new slug is a live, published trip.
 *   If the rename never happens, the line does nothing.
 * - Until the rename is made, the NEW address 307-redirects (temporary, never cached for good)
 *   back to the old one, so neither address ever shows a 404 during the switch.
 * - A slug that is itself a live trip always wins over this map.
 *
 * Pure functions only, so the tests and every page share one set of rules.
 */
export const TRIP_SLUG_REDIRECTS: Readonly<Record<string, string>> = {
  // Kodagu Rainforest & Spice Drive: "slow drive" is not in the trip's title (SEO plan §6.1).
  "coorg-rainforest-slow-drive": "coorg-rainforest-spice-drive",
};

const MAX_HOPS = 5;

/** Where an old slug points in the map (following A→B→C), or null when it is not an old slug. */
export function tripRedirectTarget(slug: string, map: Readonly<Record<string, string>> = TRIP_SLUG_REDIRECTS): string | null {
  let current = slug;
  const seen = new Set([slug]);
  for (let hop = 0; hop < MAX_HOPS; hop++) {
    const next = map[current];
    if (!next || seen.has(next)) break;
    seen.add(next);
    current = next;
  }
  return current === slug ? null : current;
}

/** Every slug that names the same trip as `slug` (the slug itself first, then its old/new forms). */
export function tripSlugAliases(slug: string, map: Readonly<Record<string, string>> = TRIP_SLUG_REDIRECTS): string[] {
  const finalSlug = tripRedirectTarget(slug, map) ?? slug;
  const group = new Set<string>([slug, finalSlug]);
  for (const oldSlug of Object.keys(map)) {
    if ((tripRedirectTarget(oldSlug, map) ?? oldSlug) === finalSlug) group.add(oldSlug);
  }
  return [...group];
}

/** True when the two slugs name the same trip (equal, or old and new forms of one address). */
export function sameTripSlug(a: string | null | undefined, b: string | null | undefined, map = TRIP_SLUG_REDIRECTS): boolean {
  if (!a || !b) return false;
  return a === b || tripSlugAliases(a, map).includes(b);
}

export type TripSlugResolution =
  | { kind: "live" }
  | { kind: "permanent"; to: string }
  | { kind: "temporary"; to: string }
  | { kind: "missing" };

/**
 * What the trip page should do for a requested slug, given the slugs of the published trips:
 * render it, redirect for good (old slug, renamed), redirect for now (new slug, not renamed yet),
 * or 404.
 */
export function resolveTripSlug(
  slug: string,
  liveSlugs: Iterable<string>,
  map: Readonly<Record<string, string>> = TRIP_SLUG_REDIRECTS
): TripSlugResolution {
  const live = new Set(liveSlugs);
  if (live.has(slug)) return { kind: "live" };

  const forward = tripRedirectTarget(slug, map);
  if (forward && live.has(forward)) return { kind: "permanent", to: forward };

  // The new address was shared before the producer renamed the trip: send it to the live old one.
  const older = tripSlugAliases(slug, map).filter((s) => s !== slug && live.has(s));
  if (older.length > 0) return { kind: "temporary", to: older[0] };

  return { kind: "missing" };
}

export type MovedTripDecision = TripSlugResolution | { kind: "data-unavailable" };

/**
 * resolveTripSlug, but never from demo trips. When the database failed and demo trips stand in
 * (`isDemoFallback`), a redirect would be decided from demo slugs and cached for crawlers (a 308
 * from the live address to a demo-only one). Then:
 * - the database is set up but failed: "data-unavailable", and the page throws so the CDN keeps
 *   serving the last good version instead of caching a redirect or a demo page;
 * - no database at all (local demo mode): "missing", a plain 404, never a redirect.
 */
export function decideMovedTrip(
  slug: string,
  loaded: { liveSlugs: Iterable<string>; isDemoFallback: boolean; databaseConfigured: boolean },
  map: Readonly<Record<string, string>> = TRIP_SLUG_REDIRECTS
): MovedTripDecision {
  if (loaded.isDemoFallback) return loaded.databaseConfigured ? { kind: "data-unavailable" } : { kind: "missing" };
  return resolveTripSlug(slug, loaded.liveSlugs, map);
}

/**
 * True when a demo trip must not be rendered at this address: the database is set up but failed,
 * and the address is one form of a renamed trip. Rendering demo data there would cache a 200 on an
 * address that otherwise redirects, so the page throws and the last good version stays.
 */
export function demoRenderWouldMislead(
  slug: string,
  loaded: { isDemoFallback: boolean; databaseConfigured: boolean },
  map: Readonly<Record<string, string>> = TRIP_SLUG_REDIRECTS
): boolean {
  return loaded.isDemoFallback && loaded.databaseConfigured && tripSlugAliases(slug, map).length > 1;
}

/** Slugs to build ahead of time: every live trip, plus each other form of its address. */
export function tripStaticSlugs(liveSlugs: readonly string[], map: Readonly<Record<string, string>> = TRIP_SLUG_REDIRECTS): string[] {
  const out = new Set(liveSlugs);
  for (const slug of liveSlugs) {
    for (const alias of tripSlugAliases(slug, map)) {
      if (resolveTripSlug(alias, liveSlugs, map).kind !== "missing") out.add(alias);
    }
  }
  return [...out];
}

/**
 * Admin category lists name trips by slug. Add the other forms of each slug so a category keeps
 * its trip before AND after a rename, until the producer updates the saved list (SEO plan §6.4).
 */
export function expandTripSlugs(slugs: readonly string[], map: Readonly<Record<string, string>> = TRIP_SLUG_REDIRECTS): string[] {
  const out: string[] = [];
  for (const slug of slugs) {
    for (const alias of tripSlugAliases(slug, map)) if (!out.includes(alias)) out.push(alias);
  }
  return out;
}
