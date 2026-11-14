import type { PublicDepartureAvailability, TripWithDetails } from "@/lib/types";

/**
 * One set of rules for which trip dates the website shows and offers, so the home page, trip
 * cards, trip pages and booking form always agree with what the server will accept.
 * Dates are compared in India time (IST): servers run on UTC, which is 5½ hours behind.
 */

/** Today in India (IST) as YYYY-MM-DD, whatever the server's own time zone. */
export function istTodayISO(now: number = Date.now()): string {
  return new Date(now + 330 * 60_000).toISOString().slice(0, 10);
}

/**
 * The trip has left (it starts today or earlier, IST): it is no longer an "upcoming" date.
 * Trips leave early in the morning, so a trip starting today is already on the road.
 */
export function hasStarted(d: Pick<PublicDepartureAvailability, "startDate">, now: number = Date.now()): boolean {
  return d.startDate.slice(0, 10) <= istTodayISO(now);
}

/** Bookings for this date are closed: the owner's booking cut-off time has passed. */
export function isBookingClosed(d: Pick<PublicDepartureAvailability, "bookingCutoffAt">, now: number = Date.now()): boolean {
  const cutoff = Date.parse(d.bookingCutoffAt);
  return Number.isFinite(cutoff) && cutoff <= now;
}

/** A date a visitor can still book right now (seats may still be 0 → waitlist). */
export function isBookable(d: Pick<PublicDepartureAvailability, "status" | "bookingCutoffAt" | "startDate">, now: number = Date.now()): boolean {
  return d.status !== "cancelled" && d.status !== "completed" && !hasStarted(d, now) && !isBookingClosed(d, now);
}

/** Trips with dates that have already started (before today in IST) left out. */
export function withoutStartedDepartures(trips: TripWithDetails[], now: number = Date.now()): TripWithDetails[] {
  return trips.map((t) => ({ ...t, departures: t.departures.filter((d) => !hasStarted(d, now)) }));
}
