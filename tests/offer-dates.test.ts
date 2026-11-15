/** Editing an existing offer: the database returns "+00:00" dates; saving must still work (15 Nov bug). */
import { describe, expect, it } from "vitest";
import { promotionSchema } from "@/lib/validation";

const offer = {
  id: null,
  title: "Good Ravana in us",
  message: "Plan for unplanned",
  badge: "Only Peace",
  mediaType: "none" as const,
  mediaUrl: "",
  posterUrl: "",
  ctaLabel: "See trips",
  ctaUrl: "/trips",
  placements: ["home_banner", "top_bar", "popup"] as ("home_banner" | "top_bar" | "popup")[],
  tripId: null,
  theme: "sunset" as const,
  isActive: true,
  sortOrder: 0,
};

describe("offer dates", () => {
  it("accepts dates as the database returns them and stores them as UTC", () => {
    const r = promotionSchema.parse({ ...offer, startsAt: "2026-11-15T07:29:00+00:00", endsAt: "2026-11-22T07:29:00+00:00" });
    expect(r.startsAt).toBe("2026-11-15T07:29:00.000Z");
    expect(r.endsAt).toBe("2026-11-22T07:29:00.000Z");
  });

  it("still accepts the form's own Z dates, empty dates, and refuses rubbish", () => {
    expect(promotionSchema.parse({ ...offer, startsAt: "2026-11-15T07:29:00.000Z", endsAt: null }).startsAt).toBe("2026-11-15T07:29:00.000Z");
    expect(promotionSchema.parse({ ...offer, startsAt: null, endsAt: null }).startsAt).toBeNull();
    expect(promotionSchema.safeParse({ ...offer, startsAt: "15-11-2026", endsAt: null }).success).toBe(false);
  });

  it("an end before the start is still refused", () => {
    expect(promotionSchema.safeParse({ ...offer, startsAt: "2026-11-22T07:29:00+00:00", endsAt: "2026-11-15T07:29:00+05:30" }).success).toBe(false);
  });
});
