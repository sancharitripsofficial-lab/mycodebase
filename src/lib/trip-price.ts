import { isBookable } from "@/lib/departure-rules";
import type { PublicDepartureAvailability, Trip } from "@/lib/types";

/** The prices a visitor can actually book for a trip right now (SEO plan §4.4, owner fact F2). */
export interface TripPriceInfo {
  /** The "From" price shown on the page, the cards, the search snippet and the structured data. */
  fromPaise: number;
  lowPaise: number;
  highPaise: number;
  /** Bookable dates with a seat open. */
  offerCount: number;
  /** At least one date can be booked now with a seat open. */
  bookable: boolean;
}

/**
 * "From" = the lowest price of a date that can be booked now with a seat open (a date's own
 * price when set, else the trip price). Only when no such date exists is the trip's base price
 * shown, so the page never says "From ₹4,199" while the only open date costs ₹4,999.
 */
export function tripPriceInfo(
  trip: Pick<Trip, "basePricePaise">,
  departures: readonly Pick<PublicDepartureAvailability, "status" | "bookingCutoffAt" | "startDate" | "seatsRemaining" | "priceOverridePaise">[],
  now: number = Date.now()
): TripPriceInfo {
  const prices = departures
    .filter((d) => isBookable(d, now) && d.seatsRemaining > 0)
    .map((d) => d.priceOverridePaise ?? trip.basePricePaise)
    .filter((p) => Number.isFinite(p) && p > 0);
  if (prices.length === 0) {
    const base = trip.basePricePaise;
    return { fromPaise: base, lowPaise: base, highPaise: base, offerCount: 0, bookable: false };
  }
  const low = Math.min(...prices);
  return { fromPaise: low, lowPaise: low, highPaise: Math.max(...prices), offerCount: prices.length, bookable: true };
}
