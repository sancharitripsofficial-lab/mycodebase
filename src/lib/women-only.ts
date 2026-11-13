import type { CoTravelerPreference, DepartureType } from "@/lib/types";

/**
 * Women-only batches: whoever books must confirm that every traveller in the booking is a woman.
 * Checked on the server for every seat hold (database and preview store), so the trip page, the
 * chat guide's links and any direct request all follow the same rule.
 */
export const WOMEN_ONLY_CONFIRM_LABEL = "I confirm that every traveller in this booking is a woman.";

export const WOMEN_ONLY_ERROR =
  "WOMEN_ONLY: This date is a women-only batch. Please confirm that every traveller in this booking is a woman.";

/** Throws WOMEN_ONLY_ERROR when a women-only departure is booked without the confirmation. */
export function assertWomenOnlyConfirmed(departureType: DepartureType | string | null | undefined, confirmed: boolean | undefined): void {
  if (departureType === "women_only" && confirmed !== true) throw new Error(WOMEN_ONLY_ERROR);
}

/** On a women-only batch the booking is recorded as a women-only request, whatever was picked. */
export function preferenceForDeparture(
  departureType: DepartureType | string | null | undefined,
  picked: CoTravelerPreference,
): CoTravelerPreference {
  return departureType === "women_only" ? "request_women_only" : picked;
}
