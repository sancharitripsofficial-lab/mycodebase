import { nextOpenDeparture } from "@/lib/trip-facts";
import { formatTripDay } from "@/lib/trip-dates";
import type { PublicDepartureAvailability } from "@/lib/types";

/**
 * What a visitor is told about an offer besides its own words, and when an offer steps aside by
 * itself. Offers are written by the owner in Admin → Offers & ads; these two rules keep them honest
 * on the website without anyone having to remember to switch them off.
 */

/**
 * "Offer ends 31 Dec" for an offer with an end time (the calendar day in India). Null when the
 * offer has no end time. Always the date itself, never "tomorrow": a page may be a few minutes old.
 */
export function offerEndLabel(endsAt: string | null | undefined): string | null {
  if (!endsAt) return null;
  const end = Date.parse(endsAt);
  if (!Number.isFinite(end)) return null;
  const istDay = new Date(end + 330 * 60_000).toISOString().slice(0, 10);
  return `Offer ends ${formatTripDay(istDay)}`;
}

type TripDates = { trip: { id: string }; departures: readonly Pick<PublicDepartureAvailability, "status" | "bookingCutoffAt" | "startDate" | "seatsRemaining">[] };

/** Can this trip be booked right now (a date still open with a seat free)? */
export function tripHasOpenDate(tripId: string, trips: readonly TripDates[], now: number = Date.now()): boolean {
  const found = trips.find((t) => t.trip.id === tripId);
  return Boolean(found && nextOpenDeparture(found.departures, now));
}

/**
 * An offer made for one trip is shown only while that trip can be booked. Once its last date is
 * full, closed or gone, "Limited seats! Grab soon!" would lead to a page with nothing to book, so
 * the offer steps aside until the trip has an open date again. Offers for all trips are untouched.
 */
export function offersWithOpenTrips<T extends { tripId: string | null }>(offers: readonly T[], trips: readonly TripDates[], now: number = Date.now()): T[] {
  return offers.filter((o) => !o.tripId || tripHasOpenDate(o.tripId, trips, now));
}
