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
