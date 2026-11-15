/**
 * "Ask us to plan <place>": the trips search tells the enquiry form which place the visitor
 * wanted, either on the same page (a window event) or through a link (?place=…, e.g. /?place=Hampi#plan).
 * The text only ever lands in the form's own message box, which the visitor sees and can edit.
 */

export const PLAN_PLACE_EVENT = "sanchari:plan-place";

/** A short, plain place text (no control characters or angle brackets), or "" when unusable. */
export function cleanPlaceText(raw: unknown): string {
  if (typeof raw !== "string") return "";
  return raw
    .replace(/[\u0000-\u001f\u007f<>{}]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80)
    .trim();
}

/** The message the form starts with for a place. */
export function planMessageFor(place: string): string {
  return `I'd like a trip to ${place}.`;
}

/** Tell an enquiry form on this page which place to plan. */
export function requestPlanFor(place: string): void {
  if (typeof window === "undefined") return;
  const clean = cleanPlaceText(place);
  if (!clean) return;
  window.dispatchEvent(new CustomEvent(PLAN_PLACE_EVENT, { detail: { place: clean } }));
}
