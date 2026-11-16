/**
 * Which offer the pop-up shows. Plain functions (no database, no browser), used by the pop-up in the
 * browser and by the tests.
 *
 * Each phone or computer shows one pop-up offer per page that it has not shown before, and remembers
 * it in that browser only. Taking the offers in the owner's Order (oldest first) made a new offer
 * wait behind every older offer that device had not shown yet: on 16 Nov the owner's phone, which had
 * been through the three older offers, showed the new "New Blogs for you", while the laptop was still
 * on the older "Upcoming Netravati". Newest first, a new offer shows on every device at its next page.
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

/** The pop-up offer to show next: the newest one this browser has not shown yet (none = undefined). */
export function nextPopup<T extends Pick<Promotion, "id" | "startsAt" | "createdAt">>(
  list: readonly T[],
  alreadyShown: (id: string) => boolean
): T | undefined {
  return popupOrder(list).find((p) => !alreadyShown(p.id));
}
