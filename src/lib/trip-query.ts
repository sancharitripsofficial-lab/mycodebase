import { placeTripMatches, searchPlaces, tripMatchesQuery, unambiguousPlaceHit } from "@/lib/places/search";
import type { KarnatakaDistrict, KarnatakaPlace } from "@/lib/places/types";
import type { TripWithDetails } from "@/lib/types";

/**
 * /trips?q=… (the WebSite SearchAction target, SEO plan §4.1): the text a link or Google sent,
 * read in the browser so /trips stays a cached page with its canonical at /trips.
 */
export const MAX_URL_QUERY = 80;

/** The ?q= text from a query string ("?q=coorg&mode=private"), trimmed and capped, or null. */
export function readTripQuery(search: string): string | null {
  let value: string | null = null;
  try {
    value = new URLSearchParams(search).get("q");
  } catch {
    return null;
  }
  const clean = (value ?? "").replace(/\s+/g, " ").trim().slice(0, MAX_URL_QUERY).trim();
  return clean ? clean : null;
}

/** The query string without ?q= (other filters such as ?mode= stay), for history.replaceState. */
export function withoutTripQuery(search: string): string {
  const params = new URLSearchParams(search);
  params.delete("q");
  const rest = params.toString();
  return rest ? `?${rest}` : "";
}

/**
 * Published trips for the text, by the same rule as typing it into the trips search box: the
 * trip's own words (itinerary too), or the place the text clearly means once the place list has
 * loaded (e.g. "Abbey Falls" finds the Coorg trip).
 */
export function tripIdsForQuery(
  query: string,
  trips: readonly TripWithDetails[],
  placeData?: { places: readonly KarnatakaPlace[]; districts: readonly KarnatakaDistrict[] } | null
): string[] {
  const published = trips.filter((t) => t.trip.isPublished);
  const viaPlace = new Set<string>();
  if (placeData) {
    const top = unambiguousPlaceHit(searchPlaces(query, placeData.places, placeData.districts, 24));
    if (top) placeTripMatches(top.place, published, placeData.districts, placeData.places).forEach((t) => viaPlace.add(t.trip.id));
  }
  return published.filter((t) => viaPlace.has(t.trip.id) || tripMatchesQuery(t, query)).map((t) => t.trip.id);
}
