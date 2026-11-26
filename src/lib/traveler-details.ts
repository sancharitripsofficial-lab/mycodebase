import type { BookingStatus, TravelerInput } from "@/lib/types";

/**
 * Booking in two steps.
 *   Step 1 (reserve): date, seats, name, WhatsApp number, email. The seats are held and paid for.
 *   Step 2 (traveller details): names, ages, emergency contacts, food and room requests, pick-up
 *           point. Filled in from My Booking any time before the trip.
 * Until step 2 is done the seats still need people on them, so step 1 saves one row per seat:
 * the first in the name of the person who booked, the rest as "Traveller 2", "Traveller 3"…
 * A row is complete once it has an age (the one thing step 1 never asks).
 */

const PLACEHOLDER_NAME = /^Traveller \d$/;

/** The rows saved at step 1, before anyone has typed traveller details. */
export function reservedSeatTravelers(customerName: string, customerPhone: string, seats: number): TravelerInput[] {
  const count = Math.min(6, Math.max(1, Math.round(seats)));
  return Array.from({ length: count }, (_, i) => ({
    fullName: i === 0 ? customerName.trim() : `Traveller ${i + 1}`,
    ageGroup: "adult" as const,
    ageYears: null,
    // Until the customer names an emergency contact, staff can reach the person who booked.
    emergencyContact: customerPhone.trim(),
    dietaryNotes: "",
    seatRowRequest: "no_preference" as const,
    roomPreference: "shared_same_gender" as const,
  }));
}

/** This traveller's details have been filled in (step 2 done for this seat). */
export function travelerIsComplete(t: Pick<TravelerInput, "fullName" | "ageYears">): boolean {
  return typeof t.ageYears === "number" && t.ageYears > 0 && !PLACEHOLDER_NAME.test(t.fullName.trim());
}

/** Every seat on the booking has a named traveller with an age. */
export function travelerDetailsComplete(travelers: readonly Pick<TravelerInput, "fullName" | "ageYears">[]): boolean {
  return travelers.length > 0 && travelers.every(travelerIsComplete);
}

/** A name to show in the step 2 form: the placeholder is not a real name, so the box starts empty. */
export function editableTravelerName(fullName: string): string {
  return PLACEHOLDER_NAME.test(fullName.trim()) ? "" : fullName;
}

const EDITABLE: BookingStatus[] = ["pending_payment", "deposit_paid", "confirmed"];

/**
 * Can the customer still change traveller details themselves?
 * Not after the trip has left, not on a closed booking, and not once staff have checked a
 * traveller's ID (then a change goes through the team, so a checked name is never swapped quietly).
 */
export function travelerDetailsLock(input: {
  status: BookingStatus;
  tripHasStarted: boolean;
  anyVerified: boolean;
}): { locked: false } | { locked: true; reason: string } {
  if (input.status === "cancel_requested") {
    return { locked: true, reason: "A cancellation request is being reviewed for this booking, so its traveller details cannot be changed right now." };
  }
  if (!EDITABLE.includes(input.status)) {
    return { locked: true, reason: "This booking is closed, so its traveller details can no longer be changed." };
  }
  if (input.tripHasStarted) {
    return { locked: true, reason: "This trip has already left, so its traveller details can no longer be changed." };
  }
  if (input.anyVerified) {
    return { locked: true, reason: "Our team has already checked these traveller details. Message us on WhatsApp to change them." };
  }
  return { locked: false };
}
