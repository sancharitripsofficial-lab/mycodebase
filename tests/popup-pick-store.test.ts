/**
 * Admin → Offers & ads → "Make this the pop-up": saving, re-picking and clearing the pick, on the
 * built-in preview store (no database). The database rules for the same pick are checked on the real
 * migrations in promotions.test.ts.
 */
import { beforeAll, describe, expect, it } from "vitest";
import type { PromotionInput } from "@/lib/data/promotions";
import { promotionActionSchema } from "@/lib/validation";

type Store = typeof import("@/lib/data/promotions");
let store: Store;
const actor = { userId: null, staffRole: "owner" as const };

const offer = (title: string): PromotionInput => ({
  title,
  message: "",
  badge: "",
  mediaType: "none",
  mediaUrl: "",
  posterUrl: "",
  wideMediaUrl: "",
  ctaLabel: "",
  ctaUrl: "",
  placements: ["home_banner", "popup"],
  tripId: null,
  theme: "sunset",
  startsAt: null,
  endsAt: null,
  sortOrder: 0,
  isActive: true,
});

beforeAll(async () => {
  // No database for this file, whatever the computer's own environment says.
  process.env.NEXT_PUBLIC_SUPABASE_URL = "";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "";
  store = await import("@/lib/data/promotions");
});

describe("picking the pop-up offer (preview store)", () => {
  it("starts automatic, keeps the pick, gives a new time when picked again, and clears", async () => {
    expect(await store.getPopupChoice()).toBeNull();
    const a = await store.savePromotion(offer("Offer A"), actor);
    const b = await store.savePromotion(offer("Offer B"), actor);

    const first = await store.setPopupChoice(a.id, actor);
    expect(first?.promotionId).toBe(a.id);
    expect(Number.isFinite(Date.parse(first?.since ?? ""))).toBe(true);
    expect(await store.getPopupChoice()).toEqual(first);

    await new Promise((r) => setTimeout(r, 5));
    const again = await store.setPopupChoice(a.id, actor); // "Show it again to everyone"
    expect(again?.promotionId).toBe(a.id);
    expect(again?.since).not.toBe(first?.since);

    const other = await store.setPopupChoice(b.id, actor);
    expect((await store.getPopupChoice())?.promotionId).toBe(b.id);
    expect(other?.promotionId).toBe(b.id);

    expect(await store.setPopupChoice(null, actor)).toBeNull(); // "Back to automatic"
    expect(await store.getPopupChoice()).toBeNull();
  });

  it("refuses an offer that does not exist, and forgets the pick when its offer is deleted", async () => {
    await expect(store.setPopupChoice("00000000-0000-4000-8000-00000000dead", actor)).rejects.toThrow(/no longer exists/);
    const c = await store.savePromotion(offer("Offer C"), actor);
    await store.setPopupChoice(c.id, actor);
    await store.deletePromotion(c.id, actor);
    expect(await store.getPopupChoice()).toBeNull();
  });

  it("the picked offer is in the live list the website reads, with its made-on time", async () => {
    const d = await store.savePromotion(offer("Offer D"), actor);
    await store.setPopupChoice(d.id, actor);
    const live = await store.getLivePromotions();
    const choice = await store.getPopupChoice();
    const picked = live.find((p) => p.id === choice?.promotionId);
    expect(choice?.promotionId).toBe(d.id);
    expect(picked?.title).toBe("Offer D");
    expect(typeof picked?.createdAt).toBe("string");
    await store.setPopupChoice(null, actor);
  });
});

describe("the admin request for the pick", () => {
  it("accepts one offer id or null (automatic), nothing else", () => {
    const id = "4674facd-2a2d-4d0b-bd18-e8f01b9b20cc";
    expect(promotionActionSchema.safeParse({ action: "popup_choice", id }).success).toBe(true);
    expect(promotionActionSchema.safeParse({ action: "popup_choice", id: null }).success).toBe(true);
    expect(promotionActionSchema.safeParse({ action: "popup_choice" }).success).toBe(false);
    expect(promotionActionSchema.safeParse({ action: "popup_choice", id: "netravati" }).success).toBe(false);
    expect(promotionActionSchema.safeParse({ action: "popup_choice", id: [id] }).success).toBe(false);
  });
});
