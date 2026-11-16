/**
 * Which offer the pop-up shows (16 Nov report): the owner's phone showed the new "New Blogs for you"
 * while the laptop showed the older "Upcoming Netravati". Both got the same four offers; each device
 * walked through them oldest first and remembered only its own. Newest first, both show the new one.
 */
import { describe, expect, it } from "vitest";
import { cleanPopupChoice, liveSince, nextPopup, pickPopup, popupOrder, shownForPick, shownMark } from "@/lib/popup-order";

type Offer = { id: string; title: string; sortOrder: number; startsAt: string | null; createdAt?: string | null };

/** The four pop-up offers live on the site on 16 Nov, in the order the page sends them (owner's Order, then title). */
const ravana: Offer = { id: "ravana", title: "Good ‘Ravana’ In us", sortOrder: 0, startsAt: "2026-11-15T07:29:00+00:00" };
const netravati: Offer = { id: "netravati", title: "Upcoming Netravati", sortOrder: 0, startsAt: "2026-11-15T08:15:00+00:00" };
const launch: Offer = { id: "launch", title: "TODAY WE ARE LIVE!", sortOrder: 1, startsAt: "2026-11-16T03:06:00+00:00" };
const blogs: Offer = { id: "blogs", title: "New Blogs for you", sortOrder: 2, startsAt: "2026-11-16T09:12:00+00:00" };
const site = [ravana, netravati, launch, blogs];

const shown = (...offers: Offer[]) => {
  const ids = new Set(offers.map((o) => o.id));
  return (id: string) => ids.has(id);
};
/** The old rule: first offer in the owner's Order that this device has not shown. */
const oldRule = (list: Offer[], alreadyShown: (id: string) => boolean) => list.find((o) => !alreadyShown(o.id));

describe("pop-up offer order", () => {
  it("the old rule gave the phone and the laptop different offers (the report)", () => {
    expect(oldRule(site, shown(ravana, netravati, launch))?.title).toBe("New Blogs for you"); // phone: been through the older three
    expect(oldRule(site, shown(ravana))?.title).toBe("Upcoming Netravati"); // laptop: only one shown so far
  });

  it("newest first: phone, laptop and a new visitor all get the new offer next", () => {
    expect(popupOrder(site).map((o) => o.id)).toEqual(["blogs", "launch", "netravati", "ravana"]);
    expect(nextPopup(site, shown(ravana, netravati, launch))?.title).toBe("New Blogs for you"); // phone
    expect(nextPopup(site, shown(ravana))?.title).toBe("New Blogs for you"); // laptop before it showed Netravati
    expect(nextPopup(site, shown(ravana, netravati))?.title).toBe("New Blogs for you"); // laptop after it
    expect(nextPopup(site, shown())?.title).toBe("New Blogs for you"); // someone new
  });

  it("each offer still shows once: after the newest, the next newest, then nothing", () => {
    expect(nextPopup(site, shown(blogs))?.id).toBe("launch");
    expect(nextPopup(site, shown(blogs, launch))?.id).toBe("netravati");
    expect(nextPopup(site, shown(blogs, launch, netravati))?.id).toBe("ravana");
    expect(nextPopup(site, shown(...site))).toBeUndefined();
    expect(nextPopup([], shown())).toBeUndefined();
  });

  it("does not reorder the list it was given (the banners keep the owner's Order)", () => {
    const before = site.map((o) => o.id);
    popupOrder(site);
    nextPopup(site, shown());
    expect(site.map((o) => o.id)).toEqual(before);
  });

  it("an offer with no start time counts from when it was made", () => {
    const noStart: Offer = { id: "no-start", title: "Made just now", sortOrder: 5, startsAt: null, createdAt: "2026-11-16T11:00:00+00:00" };
    expect(nextPopup([...site, noStart], shown(ravana))?.id).toBe("no-start");
    expect(liveSince(noStart)).toBe(Date.parse("2026-11-16T11:00:00Z"));
  });

  it("a start time typed in the past does not make a new offer look old", () => {
    const backdated: Offer = { id: "backdated", title: "Made today, start typed as 1 Nov", sortOrder: 0, startsAt: "2026-11-01T00:00:00+00:00", createdAt: "2026-11-16T10:00:00+00:00" };
    expect(popupOrder([...site, backdated])[0].id).toBe("backdated");
  });

  it("an offer made earlier but started later counts from its start", () => {
    const scheduled: Offer = { id: "scheduled", title: "Made on the 10th for the 16th", sortOrder: 0, startsAt: "2026-11-16T10:30:00+00:00", createdAt: "2026-11-10T05:00:00+00:00" };
    expect(liveSince(scheduled)).toBe(Date.parse("2026-11-16T10:30:00Z"));
    expect(popupOrder([...site, scheduled])[0].id).toBe("scheduled");
  });

  it("offers that went live together, or with no time known, keep the owner's Order", () => {
    const a: Offer = { id: "a", title: "A", sortOrder: 0, startsAt: "2026-11-16T09:12:00+00:00" };
    const b: Offer = { id: "b", title: "B", sortOrder: 1, startsAt: "2026-11-16T09:12:00+00:00" };
    const unknown1: Offer = { id: "u1", title: "U1", sortOrder: 0, startsAt: null };
    const unknown2: Offer = { id: "u2", title: "U2", sortOrder: 1, startsAt: null, createdAt: "not a date" };
    expect(popupOrder([a, b]).map((o) => o.id)).toEqual(["a", "b"]);
    // Not known = treated as oldest, after every dated offer, in the order they came.
    expect(popupOrder([unknown1, unknown2, a, b]).map((o) => o.id)).toEqual(["a", "b", "u1", "u2"]);
    expect(liveSince(unknown1)).toBe(0);
    expect(liveSince(unknown2)).toBe(0);
  });
});

/**
 * The owner's pick (Admin > Offers & ads > "Make this the pop-up"): only that offer pops up, once per
 * visitor for each time the owner picks it. A browser remembers, per offer, a line of text.
 */
describe("the owner picks which offer pops up", () => {
  const PICK_1 = "2026-11-16T12:30:00.000Z";
  const PICK_2 = "2026-11-16T15:00:00.000Z";
  /** A browser's memory: offer id -> what it kept. */
  const device = (kept: Record<string, string> = {}) => {
    const store = new Map(Object.entries(kept));
    return {
      memory: (id: string) => store.get(id) ?? null,
      /** Show whatever is due, remember it like the website does, and say what showed. */
      visit(picked: { promo: Offer; since: string } | null, list: Offer[] = site): string | null {
        const next = pickPopup(list, picked, (id) => store.get(id) ?? null);
        if (!next) return null;
        store.set(next.promo.id, shownMark(new Date("2026-11-16T16:00:00Z"), next.pickSince));
        return next.promo.id;
      },
    };
  };
  const old = "2026-11-16T09:00:00.000Z"; // shown earlier, while the pop-up was automatic

  it("only the picked offer pops up, on a phone that has seen everything and on a new laptop alike", () => {
    const picked = { promo: netravati, since: PICK_1 };
    const phone = device({ ravana: old, netravati: old, launch: old, blogs: old });
    const laptop = device();
    expect(phone.visit(picked)).toBe("netravati"); // picked = shown once more, even though this phone saw it before
    expect(laptop.visit(picked)).toBe("netravati"); // not the newest offer: the picked one
    // Next pages: nothing more. The other three offers never pop up while one is picked.
    expect(phone.visit(picked)).toBeNull();
    expect(laptop.visit(picked)).toBeNull();
    expect(laptop.visit(picked)).toBeNull();
    expect(laptop.memory("blogs")).toBeNull();
  });

  it("a picked offer pops up even when its own Pop-up box is not ticked", () => {
    const bannerOnly: Offer = { id: "banner-only", title: "Banner only", sortOrder: 0, startsAt: "2026-11-10T00:00:00+00:00" };
    expect(device().visit({ promo: bannerOnly, since: PICK_1 }, site)).toBe("banner-only");
    expect(device().visit({ promo: bannerOnly, since: PICK_1 }, [])).toBe("banner-only");
  });

  it("picking the same offer again shows it once more to everyone; picking another switches", () => {
    const phone = device();
    expect(phone.visit({ promo: netravati, since: PICK_1 })).toBe("netravati");
    expect(phone.visit({ promo: netravati, since: PICK_1 })).toBeNull();
    expect(phone.visit({ promo: netravati, since: PICK_2 })).toBe("netravati"); // "Show it again to everyone"
    expect(phone.visit({ promo: netravati, since: PICK_2 })).toBeNull();
    expect(phone.visit({ promo: blogs, since: PICK_2 })).toBe("blogs"); // owner picked another offer
    expect(phone.visit({ promo: blogs, since: PICK_2 })).toBeNull();
  });

  it("back to automatic (or the picked offer is not live): newest not-yet-shown offer, one per page", () => {
    const phone = device();
    expect(phone.visit({ promo: netravati, since: PICK_1 })).toBe("netravati");
    // picked = null: the owner pressed "Back to automatic", or the picked offer ended / was switched off.
    expect(phone.visit(null)).toBe("blogs");
    expect(phone.visit(null)).toBe("launch");
    expect(phone.visit(null)).toBe("ravana"); // Netravati is not repeated: this phone already showed it
    expect(phone.visit(null)).toBeNull();
  });

  it("does not depend on the phone's clock", () => {
    // Shown for this pick by a phone whose clock is a day behind the pick time: still counts as shown.
    const behind = shownMark(new Date("2026-11-15T10:00:00Z"), PICK_1);
    expect(shownForPick(behind, PICK_1)).toBe(true);
    // Shown "after" the pick time by the clock, but for automatic or for an older pick: not shown for this pick.
    expect(shownForPick("2026-11-17T10:00:00.000Z", PICK_1)).toBe(false);
    expect(shownForPick(shownMark(new Date("2026-11-17T10:00:00Z"), PICK_1), PICK_2)).toBe(false);
    expect(shownForPick(null, PICK_1)).toBe(false);
    expect(shownForPick("check", PICK_1)).toBe(false);
    expect(shownMark(new Date("2026-11-16T16:00:00Z"))).toBe("2026-11-16T16:00:00.000Z"); // automatic: the time only, as before
  });

  it("reads the saved pick; anything else means automatic", () => {
    const id = "4674facd-2a2d-4d0b-bd18-e8f01b9b20cc";
    expect(cleanPopupChoice({ promotionId: id, since: PICK_1 })).toEqual({ promotionId: id, since: PICK_1 });
    expect(cleanPopupChoice({ promotionId: id, since: PICK_1, extra: "ignored" })).toEqual({ promotionId: id, since: PICK_1 });
    for (const bad of [null, undefined, "", 7, [], {}, { promotionId: null, since: PICK_1 }, { promotionId: "netravati", since: PICK_1 }, { promotionId: id }, { promotionId: id, since: "soon" }]) {
      expect(cleanPopupChoice(bad)).toBeNull();
    }
  });
});
