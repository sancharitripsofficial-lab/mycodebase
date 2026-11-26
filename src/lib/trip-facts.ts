import { calculateBookingPricing } from "@/lib/currency";
import { isBookable } from "@/lib/departure-rules";
import type { PublicDepartureAvailability, SiteSettings, Trip } from "@/lib/types";

/**
 * The facts every page shows about a trip's dates and seats, worked out in one place: the home
 * page, the trip cards, the trip page, the booking box and the phone booking bar all read these,
 * so a visitor never sees "6 seats" on one screen and "4 seats" on the next.
 */

type DateFacts = Pick<PublicDepartureAvailability, "status" | "bookingCutoffAt" | "startDate" | "seatsRemaining">;

const byStart = <T extends { startDate: string }>(a: T, b: T) => a.startDate.localeCompare(b.startDate);

/** The earliest date a visitor can book right now with a seat still free. */
export function nextOpenDeparture<T extends DateFacts>(departures: readonly T[], now: number = Date.now()): T | null {
  return [...departures].filter((d) => isBookable(d, now) && d.seatsRemaining > 0).sort(byStart)[0] ?? null;
}

/** The earliest date still taking bookings, even when it is full (then only the waitlist is open). */
export function nextListedDeparture<T extends DateFacts>(departures: readonly T[], now: number = Date.now()): T | null {
  return nextOpenDeparture(departures, now) ?? [...departures].filter((d) => isBookable(d, now)).sort(byStart)[0] ?? null;
}

export type SeatTone = "open" | "few" | "full";

/** Seat count in plain words, the same wording on every page. */
export function seatSummary(d: Pick<PublicDepartureAvailability, "seatsRemaining" | "maxCapacity">): { tone: SeatTone; label: string } {
  const left = Math.max(0, d.seatsRemaining);
  if (left === 0) return { tone: "full", label: "Sold out" };
  if (left === 1) return { tone: "few", label: "Last seat" };
  if (left === 2) return { tone: "few", label: "Last 2 seats" };
  return { tone: "open", label: `${left} of ${d.maxCapacity} seats open` };
}

const MONTH_INDEX: Record<string, number> = {
  JAN: 1, FEB: 2, MAR: 3, APR: 4, MAY: 5, JUN: 6, JUL: 7, AUG: 8, SEP: 9, SEPT: 9, OCT: 10, NOV: 11, DEC: 12,
};

/**
 * Does a date code such as "SAN-CKM-DEC04" agree with the day the trip leaves?
 * true / false when the code carries a month and day, null when it carries none (nothing to check).
 */
export function departureCodeAgrees(code: string, startDate: string): boolean | null {
  const match = /(?:^|[^A-Za-z])(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEPT?|OCT|NOV|DEC)[-_ ]?(\d{1,2})(?!\d)/i.exec(code ?? "");
  const date = /^(\d{4})-(\d{2})-(\d{2})/.exec(startDate ?? "");
  if (!match || !date) return null;
  return MONTH_INDEX[match[1].toUpperCase()] === Number(date[2]) && Number(match[2]) === Number(date[3]);
}

/** The code with its month and day replaced by the real ones: what staff should rename it to. */
export function suggestedDepartureCode(code: string, startDate: string): string | null {
  if (departureCodeAgrees(code, startDate) !== false) return null;
  const date = /^(\d{4})-(\d{2})-(\d{2})/.exec(startDate);
  if (!date) return null;
  const month = Object.keys(MONTH_INDEX).find((k) => MONTH_INDEX[k] === Number(date[2]) && k.length === 3);
  if (!month) return null;
  return code.replace(/(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEPT?|OCT|NOV|DEC)([-_ ]?)(\d{1,2})(?!\d)/i, (_m, _mon, sep: string) => `${month}${sep}${date[3]}`);
}

/**
 * The code visitors may see. A code that names another day than the trip's own date is left out
 * (the date itself is always shown), so nobody reads "NOV27" beside "4–6 Dec".
 */
export function visibleDepartureCode(d: Pick<PublicDepartureAvailability, "departureCode" | "startDate">): string | null {
  return departureCodeAgrees(d.departureCode, d.startDate) === false ? null : d.departureCode;
}

/** Can the whole car still be booked on this date (nobody has a seat yet)? */
export function wholeCarOpen(d: Pick<PublicDepartureAvailability, "seatsTaken" | "maxCapacity" | "status" | "bookingCutoffAt" | "startDate">, now: number = Date.now()): boolean {
  return d.seatsTaken === 0 && d.maxCapacity === 6 && isBookable(d, now);
}

/** What the whole car costs on a date: the same sum the booking box and the server work out. */
export function wholeCarPricePaise(
  trip: Pick<Trip, "basePricePaise" | "privateGroupPricePaise" | "privateDiscountPercent" | "depositPercent" | "balanceDueDaysBefore">,
  d: Pick<PublicDepartureAvailability, "priceOverridePaise">,
  bookingPolicy: Pick<SiteSettings["bookingPolicy"], "taxRatePercent" | "allowDepositCheckout" | "depositPercent" | "balanceDueDaysBefore">
): number {
  return calculateBookingPricing({
    trip,
    priceOverridePaise: d.priceOverridePaise,
    bookingMode: "private_vehicle",
    seatsRequested: 6,
    payDepositOnly: false,
    bookingPolicy,
  }).totalPaise;
}

/**
 * The first lines of the owner's own "Included" list for a trip card, in their words.
 * Nothing is reworded or summarised; a bracketed aside is dropped only to keep a line short.
 */
export function inclusionHighlights(inclusions: readonly string[], max = 2): { shown: string[]; more: number } {
  const items = inclusions
    .map((s) => s.replace(/\s*\([^)]*\)\s*/g, " ").replace(/\s+/g, " ").trim().replace(/[.;,]+$/, ""))
    .filter((s) => s.length > 1);
  const shown = items.slice(0, Math.max(0, max));
  return { shown, more: items.length - shown.length };
}
