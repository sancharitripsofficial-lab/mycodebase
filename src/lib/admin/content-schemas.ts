import { z } from "zod";

/** Local file (/media/x.jpg) or an https link. Never http, javascript:, data: or protocol-relative. */
export const mediaUrl = z
  .string()
  .trim()
  .max(600, "Link is too long")
  .refine(
    (v) => (v.startsWith("/") && !v.startsWith("//") && !v.includes("..")) || /^https:\/\/[^\s]+$/i.test(v),
    "Use an https:// link or a site path like /media/photo.jpg"
  );

const optionalHttps = z
  .string()
  .trim()
  .max(600)
  .refine((v) => v === "" || /^https:\/\/[^\s]+$/i.test(v), "Use an https:// link or leave empty");

const lines = (max: number, each: number) =>
  z.array(z.string().trim().min(2, "Each line needs at least 2 characters").max(each)).max(max);

export const slugify = (title: string) =>
  title
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);

export const videoLinkSchema = z.object({
  label: z.string().trim().min(1, "Give the video a short label").max(60),
  url: z
    .string()
    .trim()
    .max(600)
    .refine((v) => /^https:\/\/[^\s]+$/i.test(v) || /^\/[^/]/.test(v), "Use an https:// link (Instagram, YouTube) or an uploaded video"),
});

export const tripSaveSchema = z
  .object({
    id: z.string().uuid().optional(),
    title: z.string().trim().min(3, "Title needs at least 3 characters").max(120),
    slug: z
      .string()
      .trim()
      .max(80)
      .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "Web address: lowercase letters, numbers and dashes only")
      .optional()
      .or(z.literal("")),
    destination: z.string().trim().min(2).max(120),
    region: z.string().trim().min(2).max(60),
    tagline: z.string().trim().min(5, "Tagline needs at least 5 characters").max(200),
    summary: z.string().trim().min(10, "Summary needs at least 10 characters").max(2000),
    durationDays: z.number().int().min(1).max(14),
    durationNights: z.number().int().min(0).max(13),
    difficulty: z.enum(["Easy", "Moderate", "Active"]),
    vibe: z.string().trim().min(2).max(80),
    basePricePaise: z.number().int().min(0).max(50_000_000, "Seat price must be at most ₹5,00,000"),
    privateGroupPricePaise: z.number().int().min(0).max(300_000_000).nullable(),
    privateDiscountPercent: z.number().int().min(0).max(40),
    depositPercent: z.number().int().min(10).max(90).nullable(),
    balanceDueDaysBefore: z.number().int().min(1).max(60),
    pickupCity: z.string().trim().min(2).max(60),
    heroImageUrl: mediaUrl,
    galleryUrls: z.array(mediaUrl).max(12, "At most 12 gallery photos"),
    videoLinks: z.array(videoLinkSchema).max(8, "At most 8 videos"),
    inclusions: lines(25, 200),
    exclusions: lines(25, 200),
    accommodationNotes: z.string().trim().max(1500),
    packingList: lines(25, 120),
    safetyNotes: z.string().trim().max(1500),
    accessibilityNotes: z.string().trim().max(1500),
    isSampleDemo: z.boolean(),
    isPublished: z.boolean(),
    sortOrder: z.number().int().min(0).max(999),
  })
  .superRefine((t, ctx) => {
    if (t.durationNights > t.durationDays) {
      ctx.addIssue({ code: "custom", path: ["durationNights"], message: "Nights cannot be more than days" });
    }
    if (t.privateGroupPricePaise !== null && t.privateGroupPricePaise > t.basePricePaise * 6) {
      ctx.addIssue({
        code: "custom",
        path: ["privateGroupPricePaise"],
        message: "Whole-car price should not be more than 6 × the seat price",
      });
    }
  });

export const pickupSaveSchema = z.object({
  id: z.string().uuid().optional(),
  tripId: z.string().uuid(),
  name: z.string().trim().min(2).max(120),
  area: z.string().trim().min(2).max(80),
  pickupTimeLabel: z.string().trim().min(2, "e.g. 05:45 AM").max(40),
  mapsUrl: optionalHttps,
  isConfirmed: z.boolean(),
  sortOrder: z.number().int().min(0).max(99),
});

export const itinerarySaveSchema = z.object({
  tripId: z.string().uuid(),
  days: z
    .array(
      z.object({
        title: z.string().trim().min(2, "Each day needs a title").max(120),
        description: z.string().trim().max(1500),
        driveTimeEstimate: z.string().trim().max(80),
        travelBufferNotes: z.string().trim().max(300),
        mealsIncluded: z.string().trim().max(120),
      })
    )
    .max(14),
});

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a date");
const isoDateTime = z.string().refine((v) => !Number.isNaN(Date.parse(v)), "Use a date and time");

export const departureSaveSchema = z.object({
  id: z.string().uuid().optional(),
  tripId: z.string().uuid(),
  departureCode: z
    .string()
    .trim()
    .transform((v) => v.toUpperCase())
    .pipe(z.string().regex(/^[A-Z0-9][A-Z0-9-]{2,31}$/, "Code: 3–32 capital letters, numbers or dashes")),
  startDate: isoDate,
  endDate: isoDate,
  maxCapacity: z.number().int().min(1).max(6),
  minOccupancy: z.number().int().min(1).max(6),
  departureType: z.enum(["open_batch", "women_only", "private_charter"]),
  bookingCutoffAt: isoDateTime,
  preferenceDeadlineAt: isoDateTime,
  priceOverridePaise: z.number().int().min(0).max(50_000_000).nullable(),
  isPublished: z.boolean(),
});

export const departureStatusSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(["cancelled", "completed", "open"]),
  reason: z.string().trim().min(5, "Write a short reason (at least 5 characters)").max(300),
});

export const brandIdentitySchema = z.object({
  brandName: z.string().trim().min(2).max(80),
  headline: z.string().trim().min(5).max(120),
  subheadline: z.string().trim().min(5).max(240),
  baseCity: z.string().trim().min(2).max(80),
  supportHours: z.string().trim().max(120),
  legalEntityName: z.string().trim().max(160),
  registeredAddress: z.string().trim().max(400),
  supportEmail: z.string().trim().max(160),
  whatsappDisplay: z.string().trim().max(40),
  isCopyDraft: z.boolean(),
});

export const bookingPolicySchema = z
  .object({
    maxGroupSize: z.literal(6),
    holdMinutes: z.number().int().min(5, "At least 5 minutes").max(60, "At most 60 minutes"),
    gstIncludedOrNote: z.string().trim().max(200),
    taxRatePercent: z.number().min(0).max(28),
    allowDepositCheckout: z.boolean(),
    depositPercent: z.number().int().min(10).max(90),
    balanceDueDaysBefore: z.number().int().min(1).max(60),
    cancellationSlabs: z
      .array(z.object({ label: z.string().trim().min(3).max(120), refundNote: z.string().trim().min(3).max(300) }))
      .max(8),
    preferenceDecisionHoursBefore: z.number().int().min(12).max(336),
    roomPolicySummary: z.string().trim().max(1500),
    vehiclePolicySummary: z.string().trim().max(1500),
    policyVersion: z.string().trim().min(2).max(60),
  });

export const faqsSchema = z
  .array(
    z.object({
      id: z.string().trim().min(1).max(60),
      question: z.string().trim().min(5, "Question needs at least 5 characters").max(200),
      answer: z.string().trim().min(5, "Answer needs at least 5 characters").max(2000),
    })
  )
  .max(30);

export const legalDraftsSchema = z.object({
  ownerReviewRequired: z.boolean(),
  termsSummary: z.string().trim().max(6000),
  privacySummary: z.string().trim().max(6000),
  refundSummary: z.string().trim().max(6000),
  safetySummary: z.string().trim().max(6000),
});

export const socialLinksSchema = z.object({
  instagramUrl: optionalHttps,
  youtubeUrl: optionalHttps,
  facebookUrl: optionalHttps,
  whatsappNumber: z
    .string()
    .trim()
    .transform((v) => v.replace(/\D/g, ""))
    .refine((v) => v === "" || /^91[6-9]\d{9}$/.test(v), "WhatsApp number: 91 followed by the 10-digit mobile number"),
});

export const settingsSaveSchema = z.discriminatedUnion("key", [
  z.object({ key: z.literal("brand_identity"), value: brandIdentitySchema }),
  z.object({ key: z.literal("booking_policy"), value: bookingPolicySchema }),
  z.object({ key: z.literal("faqs"), value: faqsSchema }),
  z.object({ key: z.literal("legal_drafts"), value: legalDraftsSchema }),
  z.object({ key: z.literal("social_links"), value: socialLinksSchema }),
]);

export const reviewSaveSchema = z
  .object({
    id: z.string().uuid().optional(),
    tripId: z.string().uuid().nullable(),
    authorName: z.string().trim().min(2).max(80),
    departureLabel: z.string().trim().max(80).nullable(),
    rating: z.number().int().min(1).max(5),
    quote: z.string().trim().min(10, "Review text needs at least 10 characters").max(800),
    isVerifiedAuthentic: z.boolean(),
    isPublished: z.boolean(),
  })
  .refine((r) => !r.isPublished || r.isVerifiedAuthentic, {
    path: ["isPublished"],
    message: "Only reviews you have verified as real can be published",
  });

const idOnly = z.object({ id: z.string().uuid() });

export const contentActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("trip.save"), data: tripSaveSchema }),
  z.object({ action: z.literal("trip.delete"), data: idOnly }),
  z.object({ action: z.literal("itinerary.save"), data: itinerarySaveSchema }),
  z.object({ action: z.literal("pickup.save"), data: pickupSaveSchema }),
  z.object({ action: z.literal("pickup.delete"), data: idOnly }),
  z.object({ action: z.literal("departure.save"), data: departureSaveSchema }),
  z.object({ action: z.literal("departure.status"), data: departureStatusSchema }),
  z.object({ action: z.literal("departure.delete"), data: idOnly }),
  z.object({ action: z.literal("settings.save"), data: settingsSaveSchema }),
  z.object({ action: z.literal("review.save"), data: reviewSaveSchema }),
  z.object({ action: z.literal("review.delete"), data: idOnly }),
]);

export type ContentAction = z.infer<typeof contentActionSchema>;
export type TripSaveInput = z.infer<typeof tripSaveSchema>;
export type DepartureSaveInput = z.infer<typeof departureSaveSchema>;
export type PickupSaveInput = z.infer<typeof pickupSaveSchema>;
export type ItinerarySaveInput = z.infer<typeof itinerarySaveSchema>;
export type ReviewSaveInput = z.infer<typeof reviewSaveSchema>;

/** First validation message, prefixed with the field path so the admin knows what to fix. */
export function firstIssue(error: z.ZodError): string {
  const issue = error.issues[0];
  if (!issue) return "Please check the form.";
  const field = issue.path.filter((p) => p !== "data" && p !== "value").join(" → ");
  return field ? `${field}: ${issue.message}` : issue.message;
}
