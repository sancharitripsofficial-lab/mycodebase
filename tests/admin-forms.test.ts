import { describe, expect, it } from "vitest";
import {
  contentActionSchema,
  departureSaveSchema,
  firstIssue,
  mediaUrl,
  reviewSaveSchema,
  slugify,
  socialLinksSchema,
  tripSaveSchema,
} from "@/lib/admin/content-schemas";
import { defaultsFor, suggestCode } from "@/components/admin/DeparturesManager";
import { addDaysISO, istInstant, tripEndDate } from "@/lib/dates";
import { classifyVideoLink, isOptimizableImage } from "@/lib/media";

describe("calendar dates never shift a day", () => {
  it("adds days across month/year ends", () => {
    expect(addDaysISO("2026-12-30", 3)).toBe("2027-01-02");
    expect(addDaysISO("2026-03-01", -1)).toBe("2026-02-28");
    expect(tripEndDate("2026-12-04", 3)).toBe("2026-12-06");
    expect(tripEndDate("2026-12-04", 1)).toBe("2026-12-04");
  });

  it("new date defaults: return date, booking cutoff 2 days before 6 PM IST, comfort deadline 3 days before", () => {
    const d = defaultsFor("2026-12-04", 3);
    expect(d.endDate).toBe("2026-12-06");
    expect(d.bookingCutoffAt).toBe(istInstant("2026-12-02", "18:00"));
    expect(new Date(d.bookingCutoffAt).toISOString()).toBe("2026-12-02T12:30:00.000Z");
    expect(d.preferenceDeadlineAt).toBe("2026-12-01T12:30:00.000Z");
  });

  it("suggests readable departure codes", () => {
    expect(suggestCode("chikmagalur-coffee-trails", "2026-12-04")).toBe("SAN-CHI-DEC04");
    expect(suggestCode("coorg", "2027-01-18")).toBe("SAN-COO-JAN18");
  });
});

const validTrip = {
  title: "Coorg Spice Drive",
  slug: "",
  destination: "Kodagu, Karnataka",
  region: "Western Ghats",
  tagline: "Pepper vines and misty valleys",
  summary: "Three slow days across South Kodagu.",
  durationDays: 3,
  durationNights: 2,
  difficulty: "Easy" as const,
  vibe: "Rainforest",
  basePricePaise: 1_240_000,
  privateGroupPricePaise: 6_690_000,
  privateDiscountPercent: 10,
  depositPercent: 30,
  balanceDueDaysBefore: 7,
  pickupCity: "Bengaluru",
  heroImageUrl: "/media/dest-coorg.jpg",
  galleryUrls: ["https://example-project.supabase.co/storage/v1/object/public/media/uploads/a.jpg"],
  videoLinks: [{ label: "Reel", url: "https://www.instagram.com/reel/abc/" }],
  inclusions: ["Transport", "Stay"],
  exclusions: ["Lunch"],
  accommodationNotes: "",
  packingList: [],
  safetyNotes: "",
  accessibilityNotes: "",
  isSampleDemo: false,
  isPublished: true,
  sortOrder: 2,
};

describe("trip form rules", () => {
  it("accepts a sensible trip", () => {
    expect(tripSaveSchema.safeParse(validTrip).success).toBe(true);
  });

  it("rejects nights > days, a whole-car price above 6 seats, and unsafe links", () => {
    expect(tripSaveSchema.safeParse({ ...validTrip, durationNights: 4 }).success).toBe(false);
    const over = tripSaveSchema.safeParse({ ...validTrip, privateGroupPricePaise: 1_240_000 * 6 + 1 });
    expect(over.success).toBe(false);
    if (!over.success) expect(firstIssue(over.error)).toMatch(/Whole-car price/);
    for (const bad of ["javascript:alert(1)", "http://x.com/a.jpg", "//evil.com/a.jpg", "/media/../secret", "data:image/png;base64,AA"]) {
      expect(mediaUrl.safeParse(bad).success).toBe(false);
    }
    expect(mediaUrl.safeParse("https://images.example.com/a.jpg").success).toBe(true);
  });

  it("slugs are web-safe", () => {
    expect(slugify("Hampi Boulders & Sunrise Ruins!")).toBe("hampi-boulders-sunrise-ruins");
    expect(tripSaveSchema.safeParse({ ...validTrip, slug: "Bad Slug" }).success).toBe(false);
  });
});

describe("dates, reviews, social links", () => {
  it("departure codes are upper-cased; capacity is 1–6", () => {
    const base = {
      tripId: "11111111-1111-4111-8111-111111111101",
      departureCode: "san-ckm-dec04",
      startDate: "2026-12-04",
      endDate: "2026-12-06",
      maxCapacity: 6,
      minOccupancy: 3,
      departureType: "open_batch",
      bookingCutoffAt: "2026-12-02T12:30:00.000Z",
      preferenceDeadlineAt: "2026-12-01T12:30:00.000Z",
      priceOverridePaise: null,
      isPublished: true,
    };
    const ok = departureSaveSchema.safeParse(base);
    expect(ok.success && ok.data.departureCode).toBe("SAN-CKM-DEC04");
    expect(departureSaveSchema.safeParse({ ...base, maxCapacity: 7 }).success).toBe(false);
  });

  it("a review can only be published once verified as real", () => {
    const r = { tripId: null, authorName: "Asha", departureLabel: null, rating: 5, quote: "Loved every minute of it.", isVerifiedAuthentic: false, isPublished: true };
    expect(reviewSaveSchema.safeParse(r).success).toBe(false);
    expect(reviewSaveSchema.safeParse({ ...r, isVerifiedAuthentic: true }).success).toBe(true);
  });

  it("WhatsApp number must be 91 + a 10-digit mobile", () => {
    const ok = socialLinksSchema.safeParse({ instagramUrl: "", youtubeUrl: "", facebookUrl: "", whatsappNumber: "+91 98765 43210" });
    expect(ok.success && ok.data.whatsappNumber).toBe("919876543210");
    expect(socialLinksSchema.safeParse({ instagramUrl: "", youtubeUrl: "", facebookUrl: "", whatsappNumber: "9876543210" }).success).toBe(false);
  });

  it("unknown admin actions are refused", () => {
    expect(contentActionSchema.safeParse({ action: "trip.nuke", data: {} }).success).toBe(false);
  });
});

describe("media links on the website", () => {
  it("knows YouTube, Instagram and uploaded videos", () => {
    expect(classifyVideoLink("https://youtu.be/dQw4w9WgXcQ")).toEqual({ kind: "youtube", embedUrl: "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ" });
    expect(classifyVideoLink("https://www.youtube.com/watch?v=dQw4w9WgXcQ").kind).toBe("youtube");
    expect(classifyVideoLink("https://youtube.com/shorts/abcdefghijk").kind).toBe("youtube");
    expect(classifyVideoLink("https://www.instagram.com/reel/DfmUtz_y5KB/").kind).toBe("instagram");
    expect(classifyVideoLink("https://x.supabase.co/storage/v1/object/public/media/uploads/v.mp4").kind).toBe("file");
    expect(classifyVideoLink("https://vimeo.com/123").kind).toBe("link");
  });

  it("only local and project-storage images go through the optimiser", () => {
    expect(isOptimizableImage("/media/dest-coorg.jpg")).toBe(true);
    expect(isOptimizableImage("https://images.example.com/a.jpg")).toBe(false);
    expect(isOptimizableImage("//evil.com/a.jpg")).toBe(false);
  });
});
