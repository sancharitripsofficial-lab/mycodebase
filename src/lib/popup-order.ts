/**
 * Which offer the pop-up shows. Plain functions (no database, no browser), used by the pop-up in the
 * browser, by the admin and by the tests.
 *
 * Two ways:
 * 1. The owner picked one offer (Admin → Offers & ads → "Make this the pop-up"): only that offer pops
 *    up, once per visitor for each time the owner picks it. Nothing else pops up.
 * 2. Automatic (no pick, or the picked offer is not live): each phone or computer shows one pop-up
 *    offer per page that it has not shown before, newest first.
 *
 * Why newest first: every phone or computer remembers in its own browser only. Taking the offers in
 * the owner's Order (oldest first) made a new offer wait behind every older offer that device had not
 * shown yet: on 16 Nov the owner's phone, which had been through the three older offers, showed the
 * new "New Blogs for you", while the laptop was still on the older "Upcoming Netravati".
 */
import type { Promotion } from "@/lib/data/promotions";

/**
 * When an offer went live for visitors: its start time, or the time it was made when that is later
 * (an offer made today with a start time typed in the past still went live today). 0 = not known.
 */
export function liveSince(p: Pick<Promotion, "startsAt" | "createdAt">): number {
  const start = p.startsAt ? Date.parse(p.startsAt) : NaN;
  const made = p.createdAt ? Date.parse(p.createdAt) : NaN;
  return Math.max(Number.isFinite(start) ? start : 0, Number.isFinite(made) ? made : 0);
}

/**
 * Pop-up order: the offer that went live most recently first. Offers that went live at the same
 * moment (or whose time is not known) keep the order they came in, which is the owner's Order.
 * Returns a new list; the one passed in is left as it was.
 */
export function popupOrder<T extends Pick<Promotion, "startsAt" | "createdAt">>(list: readonly T[]): T[] {
  return list.slice().sort((a, b) => liveSince(b) - liveSince(a));
}

/** Automatic: the newest offer this browser has not shown yet (none = undefined). */
export function nextPopup<T extends Pick<Promotion, "id" | "startsAt" | "createdAt">>(
  list: readonly T[],
  alreadyShown: (id: string) => boolean
): T | undefined {
  return popupOrder(list).find((p) => !alreadyShown(p.id));
}

// ---------------------------------------------------------------------------
// The owner's pick
// ---------------------------------------------------------------------------

/** The offer the owner picked to pop up. */
export interface PopupChoice {
  promotionId: string;
  /** When the owner picked it. Picking again gives a new time: the offer shows once more to everyone. */
  since: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The saved pick as stored (site setting `offer_popup`); anything else (empty, cleared, damaged) = no pick. */
export function cleanPopupChoice(value: unknown): PopupChoice | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  const promotionId = typeof v.promotionId === "string" ? v.promotionId : "";
  const since = typeof v.since === "string" ? v.since : "";
  if (!UUID.test(promotionId) || !Number.isFinite(Date.parse(since))) return null;
  return { promotionId, since };
}

/**
 * What the browser keeps after showing an offer: the time, and (for the owner's pick) which pick it
 * was shown for.
 */
export function shownMark(now: Date, pickSince?: string | null): string {
  return pickSince ? `${now.toISOString()}|pick:${pickSince}` : now.toISOString();
}

/**
 * Has this browser already shown the offer for THIS pick? It compares the pick itself, not clock
 * times, so a phone whose clock is wrong behaves the same as any other.
 */
export function shownForPick(mark: string | null, pickSince: string): boolean {
  return typeof mark === "string" && mark.endsWith(`|pick:${pickSince}`);
}

/**
 * The offer to pop up now, if any.
 * @param list   live offers with "Pop-up" ticked (used when there is no pick)
 * @param picked the owner's pick, only when that offer is live right now; otherwise null
 * @param memory what this browser kept for an offer (null = never shown here)
 */
export function pickPopup<T extends Pick<Promotion, "id" | "startsAt" | "createdAt">>(
  list: readonly T[],
  picked: { promo: T; since: string } | null,
  memory: (id: string) => string | null
): { promo: T; pickSince: string | null } | undefined {
  if (picked) {
    // Only the owner's pick pops up, and only if this browser has not shown it for this pick.
    return shownForPick(memory(picked.promo.id), picked.since) ? undefined : { promo: picked.promo, pickSince: picked.since };
  }
  const promo = nextPopup(list, (id) => memory(id) !== null);
  return promo ? { promo, pickSince: null } : undefined;
}
