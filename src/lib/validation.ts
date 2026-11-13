import { z } from "zod";

export const travelerInputSchema = z.object({
  fullName: z.string().trim().min(2, "Traveler name must be at least 2 characters").max(120),
  ageGroup: z.enum(["adult", "senior"]).default("adult"),
  emergencyContact: z
    .string()
    .trim()
    .min(8, "Provide a valid emergency contact phone number")
    .max(25),
  dietaryNotes: z.string().trim().max(240).optional().default(""),
  seatRowRequest: z
    .enum(["no_preference", "front_middle", "rear_window"])
    .default("no_preference"),
  roomPreference: z
    .enum(["shared_same_gender", "private_room_request", "couple_friends_room_request"])
    .default("shared_same_gender"),
});

export const checkoutSchema = z
  .object({
    departureId: z.string().uuid("Invalid departure selection"),
    bookingMode: z.enum(["batch_seats", "private_vehicle"]),
    seatsRequested: z.number().int().min(1).max(6),
    pickupPointId: z.string().uuid("Please select a pickup point").nullable(),
    customerName: z.string().trim().min(2, "Full name is required").max(120),
    customerEmail: z.string().trim().email("Enter a valid email address").max(160),
    customerPhone: z
      .string()
      .trim()
      .regex(/^[0-9+\-\s()]{8,20}$/, "Enter a valid phone number"),
    payDepositOnly: z.boolean().default(false),
    travelers: z.array(travelerInputSchema).min(1).max(6),
    coTravelerPreference: z
      .enum(["open_mixed", "prefer_same_gender", "request_women_only"])
      .default("open_mixed"),
    preferenceNotes: z.string().trim().max(300).optional().default(""),
    whatsappOptIn: z.boolean().default(false),
    acceptedTermsPrivacy: z.literal(true, {
      errorMap: () => ({ message: "You must review and accept the terms and privacy notice." }),
    }),
    preferredSeats: z.array(z.number().int().min(1).max(6)).max(6).optional(),
    couponCode: z
      .string()
      .trim()
      .max(24)
      .transform((v) => v.toUpperCase())
      .refine((v) => v === "" || /^[A-Z0-9][A-Z0-9-]{3,23}$/.test(v), "That coupon code doesn't look right.")
      .optional(),
    acceptedComfortProcessing: z.literal(true, {
      errorMap: () => ({
        message: "Please confirm consent for operational handling of your booking preferences.",
      }),
    }),
  })
  .superRefine((data, ctx) => {
    if (data.bookingMode === "private_vehicle" && data.seatsRequested !== 6) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["seatsRequested"],
        message: "Private vehicle option reserves all 6 seats.",
      });
    }
    if (data.bookingMode === "batch_seats" && data.preferredSeats && data.preferredSeats.length > 0) {
      if (data.preferredSeats.length !== data.seatsRequested || new Set(data.preferredSeats).size !== data.preferredSeats.length) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["preferredSeats"],
          message: `Pick exactly ${data.seatsRequested} different seat(s) on the car map.`,
        });
      }
    }
    if (data.travelers.length !== data.seatsRequested) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["travelers"],
        message: `Please provide details for all ${data.seatsRequested} traveler(s).`,
      });
    }
  });

export const waitlistSchema = z.object({
  departureId: z.string().uuid("Invalid departure"),
  fullName: z.string().trim().min(2, "Name is required").max(120),
  email: z.string().trim().email("Valid email required").max(160),
  phone: z
    .string()
    .trim()
    .regex(/^[0-9+\-\s()]{8,20}$/, "Enter a valid phone number"),
  seatsNeeded: z.number().int().min(1).max(6),
  whatsappOptIn: z.boolean().default(false),
  acceptedWaitlistConsent: z.literal(true, {
    errorMap: () => ({ message: "Consent is required to join the waitlist." }),
  }),
});

export const bookingLookupSchema = z.object({
  bookingReference: z
    .string()
    .trim()
    .min(5, "Enter your booking reference")
    .max(40)
    .transform((v) => v.toUpperCase()),
  email: z.string().trim().email("Enter the email used during booking").max(160),
});

export const cancellationRequestSchema = z.object({
  bookingReference: z.string().trim().min(5).max(40),
  email: z.string().trim().email(),
  requestType: z.enum(["cancel", "reschedule"]),
  reason: z.string().trim().min(5, "Please share a brief reason").max(400),
});

export const adminTripUpdateSchema = z.object({
  id: z.string().uuid(),
  title: z.string().trim().min(3).max(160),
  basePricePaise: z.number().int().min(0).max(50_000_000),
  privateGroupPricePaise: z.number().int().min(0).max(200_000_000).nullable(),
  privateDiscountPercent: z.number().int().min(0).max(40),
  depositPercent: z.number().int().min(10).max(100).nullable(),
  isPublished: z.boolean(),
});

export const adminDepartureCreateSchema = z.object({
  tripId: z.string().uuid(),
  departureCode: z.string().trim().min(4).max(32),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  maxCapacity: z.number().int().min(1).max(6),
  minOccupancy: z.number().int().min(1).max(6),
  departureType: z.enum(["open_batch", "women_only", "private_charter"]),
  bookingCutoffAt: z.string().min(10),
  preferenceDeadlineAt: z.string().min(10),
  priceOverridePaise: z.number().int().min(0).nullable(),
});

export const adminSeatOverrideSchema = z.object({
  departureId: z.string().uuid(),
  action: z.enum(["block_seat", "release_block", "promote_waitlist"]),
  seatsDelta: z.number().int().min(1).max(6).default(1),
  reason: z.string().trim().min(8, "A detailed operational reason is required (min 8 chars)").max(300),
});

export const adminBookingActionSchema = z.object({
  bookingId: z.string().uuid(),
  action: z.enum([
    "mark_verified",
    "cancel_booking",
    "mark_refunded",
    "resolve_comfort",
  ]),
  comfortResolution: z
    .enum([
      "none_requested",
      "pending_review",
      "accommodated",
      "not_feasible_notified",
      "customer_accepted_alt",
      "customer_rescheduled",
      "customer_refunded",
    ])
    .optional(),
  reason: z.string().trim().min(5, "Audit reason required").max(300),
});


export const upiReviewSchema = z.object({
  paymentId: z.string().uuid(),
  decision: z.enum(["confirm", "reject_retry", "reject_cancel", "refund_late"]),
  note: z.string().trim().max(300).default(""),
});

export const upiSettingsSchema = z.object({
  isEnabled: z.boolean(),
  upiId: z.string().max(260).default(""),
  payeeName: z.string().max(80).default(""),
  supportPhone: z.string().max(20).default(""),
});

// ---------------------------------------------------------------------------
// Owner operations
// ---------------------------------------------------------------------------

const rupeesToPaise = z
  .number({ invalid_type_error: "Enter the amount in rupees." })
  .positive("Amount must be more than zero.")
  .max(10_00_000, "That amount looks too large for one booking.")
  .transform((r) => Math.round(r * 100));

const staffNote = z.string().trim().min(5, "Write why (at least 5 characters).").max(300);

export const ownerOpsActionSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("record_payment"),
    bookingId: z.string().uuid(),
    amountRupees: rupeesToPaise,
    method: z.enum(["cash", "bank_transfer", "upi_manual"]),
    reference: z.string().trim().min(3, "Add a reference: receipt number, bank UTR or UPI reference.").max(60),
    note: staffNote,
  }),
  z.object({
    kind: z.literal("record_refund"),
    bookingId: z.string().uuid(),
    amountRupees: rupeesToPaise,
    reference: z.string().trim().min(3, "Add the refund reference (bank UTR or UPI reference).").max(60),
    note: staffNote,
    closeBooking: z.boolean(),
  }),
  z.object({
    kind: z.literal("save_crew"),
    departureId: z.string().uuid(),
    driverName: z.string().trim().max(80),
    driverPhone: z
      .string()
      .trim()
      .transform((v) => v.replace(/[\s-]/g, "").replace(/^(\+91|91|0)(?=[6-9]\d{9}$)/, ""))
      .refine((v) => v === "" || /^[6-9]\d{9}$/.test(v), "Driver phone must be a 10-digit Indian mobile number."),
    vehicleNumber: z
      .string()
      .trim()
      .max(20)
      .transform((v) => v.toUpperCase().replace(/\s+/g, " ")),
    whatsappGroupUrl: z
      .string()
      .trim()
      .refine(
        (v) => v === "" || /^https:\/\/chat\.whatsapp\.com\/[A-Za-z0-9]{10,40}$/.test(v),
        "Paste the group invite link that starts with https://chat.whatsapp.com/"
      ),
    reportingNote: z.string().trim().max(300),
    operatorNotes: z.string().trim().max(1000),
  }),
  z.object({
    kind: z.literal("update_enquiry"),
    id: z.string().uuid(),
    status: z.enum(["new", "contacted", "converted", "closed"]),
    staffNote: z.string().trim().max(500),
  }),
]);

export const enquirySchema = z.object({
  kind: z.enum(["private_date", "custom_trip", "group", "general"]),
  fullName: z.string().trim().min(2, "Enter your name.").max(120),
  phone: z
    .string()
    .trim()
    .transform((v) => v.replace(/[\s-]/g, "").replace(/^(\+91|91|0)(?=[6-9]\d{9}$)/, ""))
    .refine((v) => /^[6-9]\d{9}$/.test(v), "Enter a 10-digit Indian mobile number."),
  email: z.union([z.literal(""), z.string().trim().email("Enter a valid email or leave it empty.").max(160)]),
  tripId: z.string().uuid().nullable(),
  preferredDates: z.string().trim().max(120),
  groupSize: z.number().int().min(1).max(60).nullable(),
  message: z.string().trim().max(1500),
  /** Hidden field; real people leave it empty. */
  website: z.string().max(0, "Could not send. Please WhatsApp us instead.").optional(),
});

// ---------------------------------------------------------------------------
// Offers & ads
// ---------------------------------------------------------------------------

const mediaLink = z
  .string()
  .trim()
  .max(600)
  .refine((v) => v === "" || /^\/[A-Za-z0-9._~/%-]+$/.test(v) || /^https:\/\/[^\s<>"]{4,}$/.test(v), "Links must start with https:// (or be a file from the media library).");

export const promotionSchema = z
  .object({
    id: z.string().uuid().nullable().optional(),
    title: z.string().trim().min(3, "Title: at least 3 characters.").max(80),
    message: z.string().trim().max(240),
    badge: z.string().trim().max(24),
    mediaType: z.enum(["none", "image", "video", "youtube"]),
    mediaUrl: mediaLink,
    posterUrl: mediaLink,
    ctaLabel: z.string().trim().max(30),
    ctaUrl: z
      .string()
      .trim()
      .max(500)
      .refine((v) => v === "" || /^\/[A-Za-z0-9._~/?#=&%-]*$/.test(v) || /^https:\/\/[^\s<>"]{4,}$/.test(v), "Button link: a page on this site (starts with /) or an https:// link."),
    placements: z
      .array(z.enum(["top_bar", "home_banner", "trips_banner", "trip_page", "popup"]))
      .min(1, "Choose at least one place to show the offer.")
      .transform((a) => Array.from(new Set(a))),
    tripId: z.string().uuid().nullable(),
    theme: z.enum(["sunset", "ocean", "teal"]),
    startsAt: z.string().datetime().nullable(),
    endsAt: z.string().datetime().nullable(),
    isActive: z.boolean(),
    sortOrder: z.number().int().min(-1000).max(1000),
  })
  .superRefine((d, ctx) => {
    if (d.mediaType !== "none" && !d.mediaUrl) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["mediaUrl"], message: "Add the photo/video, or choose “No media”." });
    }
    if (d.mediaType === "youtube" && d.mediaUrl && !/youtu\.?be/.test(d.mediaUrl)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["mediaUrl"], message: "That is not a YouTube link." });
    }
    if ((d.ctaLabel === "") !== (d.ctaUrl === "")) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["ctaUrl"], message: "Give the button both a label and a link, or leave both empty." });
    }
    if (d.startsAt && d.endsAt && Date.parse(d.endsAt) <= Date.parse(d.startsAt)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["endsAt"], message: "The end must be after the start." });
    }
    if (d.placements.includes("top_bar") && d.title.length > 60) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["title"], message: "For the thin top bar keep the title under 60 characters." });
    }
  });

export const promotionActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("save"), promotion: promotionSchema }),
  z.object({ action: z.literal("delete"), id: z.string().uuid() }),
]);

// ---------------------------------------------------------------------------
// Creators (influencers) and coupons
// ---------------------------------------------------------------------------

const indianMobile = z
  .string()
  .trim()
  .transform((v) => v.replace(/[\s-]/g, "").replace(/^(\+91|91|0)(?=[6-9]\d{9}$)/, ""))
  .refine((v) => /^[6-9]\d{9}$/.test(v), "Enter a 10-digit Indian mobile number.");

export const creatorApplySchema = z.object({
  fullName: z.string().trim().min(2, "Enter your name.").max(120),
  phone: indianMobile,
  email: z.string().trim().toLowerCase().email("Enter a valid email — your code will be tied to it.").max(160),
  platform: z.enum(["instagram", "youtube", "facebook", "x", "other"]),
  profileUrl: z
    .string()
    .trim()
    .max(300)
    .refine((v) => /^https:\/\/[^\s<>"]{4,}$/.test(v), "Paste your full profile link (starts with https://)."),
  followersClaimed: z.number({ invalid_type_error: "Enter your follower count." }).int().min(0).max(500_000_000),
  message: z.string().trim().max(1500),
  consent: z.literal(true, { errorMap: () => ({ message: "Please agree so we can contact you." }) }),
  website: z.string().max(0, "Could not send.").optional(),
});

const codeField = z
  .string()
  .trim()
  .transform((v) => v.toUpperCase())
  .refine((v) => /^[A-Z0-9][A-Z0-9-]{3,23}$/.test(v), "Codes are 4–24 capital letters, numbers or dashes.");

export const creatorAdminActionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("save_tier"),
    tier: z
      .object({
        id: z.string().uuid().nullable().optional(),
        label: z.string().trim().min(2).max(40),
        minFollowers: z.number().int().min(0),
        maxFollowers: z.number().int().min(0).nullable(),
        discountType: z.enum(["percent", "flat", "free_seats"]),
        discountValue: z.number().int().positive(),
        maxDiscountPaise: z.number().int().positive().nullable(),
        validDays: z.number().int().min(1).max(365),
        isActive: z.boolean(),
      })
      .refine((t) => t.maxFollowers === null || t.maxFollowers >= t.minFollowers, "The highest follower count must be at or above the lowest."),
  }),
  z.object({ action: z.literal("delete_tier"), id: z.string().uuid() }),
  z.object({
    action: z.literal("approve"),
    applicationId: z.string().uuid(),
    followersVerified: z.number().int().min(0).max(500_000_000),
    code: codeField,
    note: z.string().trim().max(500),
  }),
  z.object({ action: z.literal("reject"), applicationId: z.string().uuid(), note: z.string().trim().min(5, "Write why (at least 5 characters).").max(500) }),
  z.object({
    action: z.literal("save_coupon"),
    coupon: z.object({
      id: z.string().uuid().nullable().optional(),
      code: codeField,
      discountType: z.enum(["percent", "flat", "free_seats"]),
      discountValue: z.number().int().positive(),
      maxDiscountPaise: z.number().int().positive().nullable(),
      minOrderPaise: z.number().int().min(0),
      maxRedemptions: z.number().int().positive().nullable(),
      perCustomerLimit: z.number().int().min(1).max(10),
      validFrom: z.string().datetime().nullable(),
      validUntil: z.string().datetime().nullable(),
      tripId: z.string().uuid().nullable(),
      isActive: z.boolean(),
      note: z.string().trim().max(300),
    }),
  }),
]);
