import { mergeAssistantSettings } from "@/lib/assistant/settings";
import { mergeHomeContent } from "@/lib/home-content";
import crypto from "node:crypto";
import { calculateBookingPricing } from "@/lib/currency";
import {
  adminBookingActionDemo,
  adminSeatOverrideDemo,
  computePublicAvailabilityDemo,
  confirmPaymentDemo,
  getAdminRowsDemo,
  getDemoState,
  getDemoTripsWithDetails,
  lookupCustomerBookingDemo,
  reserveSeatsDemo,
  type ReserveSeatsDemoInput,
} from "@/lib/data/demo-store";
import {
  cancelUnpaidBookingDemo,
  getAdminPaymentRowsDemo,
  getBookingPaymentsDemo,
  getUpiSettingsDemo,
  hasWaitingPaymentDemo,
  reviewUpiPaymentDemo,
  submitUpiPaymentDemo,
  updateUpiSettingsDemo,
} from "@/lib/data/demo-upi";
import { isServiceRoleConfigured, isSupabaseConfigured } from "@/lib/env";
import { getSafeComfortCustomerLabel } from "@/lib/privacy";
import { createSupabaseAdminClient, createSupabasePublicClient } from "@/lib/supabase/server";
import { assertWomenOnlyConfirmed, preferenceForDeparture } from "@/lib/women-only";
import { withoutStartedDepartures } from "@/lib/departure-rules";
import type {
  BookingMode,
  AdminBookingRow,
  AdminPaymentRow,
  AuditLogEntry,
  BookingRecord,
  BookingTraveler,
  CoTravelerPreference,
  ComfortPreferenceRecord,
  ComfortResolutionStatus,
  CustomerBookingView,
  DepartureStatus,
  DepartureType,
  ItineraryDay,
  PaymentRecord,
  PickupPoint,
  PublicDepartureAvailability,
  SiteSettings,
  Trip,
  TripWithDetails,
  UpiPaymentSettings,
  UpiReviewDecision,
  UpiReviewResult,
  UpiSubmitResult,
  VerifiedReview,
  WaitlistEntry,
} from "@/lib/types";

/** True when the app runs on the built-in preview store instead of Supabase. */
function usesLocalStore(): boolean {
  return !isSupabaseConfigured() || !isServiceRoleConfigured();
}

/** Saved Kannada wording: only string → non-empty string pairs survive. */
function cleanTranslations(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out: Record<string, string> = {};
  for (const [en, kn] of Object.entries(value as Record<string, unknown>)) {
    if (typeof kn === "string" && kn.trim() && en.trim()) out[en] = kn;
  }
  return out;
}

export async function getSiteSettings(): Promise<{ settings: SiteSettings; isDemoFallback: boolean }> {
  if (!isSupabaseConfigured()) {
    return { settings: getDemoState().settings, isDemoFallback: true };
  }

  try {
    const supabase = createSupabasePublicClient();
    const { data, error } = await supabase.from("site_settings").select("key, value");
    if (error || !data || data.length === 0) {
      return { settings: getDemoState().settings, isDemoFallback: true };
    }

    const map = new Map<string, unknown>(data.map((row) => [row.key, row.value]));
    const fallback = getDemoState().settings;
    return {
      isDemoFallback: false,
      settings: {
        brandIdentity: (map.get("brand_identity") as SiteSettings["brandIdentity"]) ?? fallback.brandIdentity,
        bookingPolicy: (map.get("booking_policy") as SiteSettings["bookingPolicy"]) ?? fallback.bookingPolicy,
        faqs: (map.get("faqs") as SiteSettings["faqs"]) ?? fallback.faqs,
        legalDrafts: (map.get("legal_drafts") as SiteSettings["legalDrafts"]) ?? fallback.legalDrafts,
        socialLinks: {
          ...fallback.socialLinks,
          ...((map.get("social_links") as Partial<SiteSettings["socialLinks"]> | undefined) ?? {}),
        },
        homePage: mergeHomeContent(map.get("home_page")),
        assistant: mergeAssistantSettings(map.get("assistant")),
        translationsKn: cleanTranslations(map.get("translations_kn")),
      },
    };
  } catch {
    return { settings: getDemoState().settings, isDemoFallback: true };
  }
}

/**
 * Published trips with their dates, itinerary and pickups. Dates that have already left (IST)
 * are left out unless `includeStarted` (the chat guide uses them to say a trip is under way).
 */
export async function getPublishedTripsWithDetails(opts: { includeStarted?: boolean } = {}): Promise<{
  trips: TripWithDetails[];
  isDemoFallback: boolean;
}> {
  const res = await loadPublishedTripsWithDetails();
  return opts.includeStarted ? res : { ...res, trips: withoutStartedDepartures(res.trips) };
}

async function loadPublishedTripsWithDetails(): Promise<{
  trips: TripWithDetails[];
  isDemoFallback: boolean;
}> {
  if (!isSupabaseConfigured()) {
    return { trips: getDemoTripsWithDetails(), isDemoFallback: true };
  }

  try {
    const supabase = createSupabasePublicClient();
    const [{ data: tripRows, error: tripErr }, { data: availRows, error: availErr }] =
      await Promise.all([
        supabase
          .from("trips")
          .select("*")
          .eq("is_published", true)
          .order("sort_order", { ascending: true }),
        supabase.rpc("get_departure_availability", { p_trip_id: null }),
      ]);

    if (tripErr || availErr || !tripRows) {
      return { trips: getDemoTripsWithDetails(), isDemoFallback: true };
    }

    const tripIds = tripRows.map((t) => t.id);
    const [{ data: itRows }, { data: pickupRows }] = await Promise.all([
      supabase.from("itinerary_days").select("*").in("trip_id", tripIds).order("day_number"),
      supabase.from("pickup_points").select("*").in("trip_id", tripIds).order("sort_order"),
    ]);

    const mappedTrips: TripWithDetails[] = tripRows.map((row) => {
      const trip: Trip = {
        id: row.id,
        slug: row.slug,
        title: row.title,
        destination: row.destination,
        region: row.region,
        tagline: row.tagline,
        summary: row.summary,
        durationDays: row.duration_days,
        durationNights: row.duration_nights,
        difficulty: row.difficulty,
        vibe: row.vibe,
        basePricePaise: row.base_price_paise,
        privateGroupPricePaise: row.private_group_price_paise,
        privateDiscountPercent: row.private_discount_percent,
        depositPercent: row.deposit_percent,
        balanceDueDaysBefore: row.balance_due_days_before,
        pickupCity: row.pickup_city,
        heroImageUrl: row.hero_image_url,
        galleryUrls: Array.isArray(row.gallery_urls) ? row.gallery_urls : [],
        videoLinks: Array.isArray(row.video_links) ? row.video_links : [],
        inclusions: Array.isArray(row.inclusions) ? row.inclusions : [],
        exclusions: Array.isArray(row.exclusions) ? row.exclusions : [],
        accommodationNotes: row.accommodation_notes,
        packingList: Array.isArray(row.packing_list) ? row.packing_list : [],
        safetyNotes: row.safety_notes,
        accessibilityNotes: row.accessibility_notes,
        isSampleDemo: row.is_sample_demo,
        isPublished: row.is_published,
        sortOrder: row.sort_order,
      };

      const itinerary: ItineraryDay[] = (itRows ?? [])
        .filter((i) => i.trip_id === row.id)
        .map((i) => ({
          id: i.id,
          tripId: i.trip_id,
          dayNumber: i.day_number,
          title: i.title,
          description: i.description,
          driveTimeEstimate: i.drive_time_estimate,
          travelBufferNotes: i.travel_buffer_notes,
          mealsIncluded: i.meals_included,
        }));

      const pickupPoints: PickupPoint[] = (pickupRows ?? [])
        .filter((p) => p.trip_id === row.id)
        .map((p) => ({
          id: p.id,
          tripId: p.trip_id,
          name: p.name,
          area: p.area,
          pickupTimeLabel: p.pickup_time_label,
          mapsUrl: p.maps_url,
          isConfirmed: p.is_confirmed,
          sortOrder: p.sort_order,
        }));

      const departures: PublicDepartureAvailability[] = (availRows ?? [])
        .filter((d: Record<string, unknown>) => d.trip_id === row.id)
        .map((d: Record<string, unknown>) => ({
          departureId: String(d.departure_id),
          tripId: String(d.trip_id),
          departureCode: String(d.departure_code),
          startDate: String(d.start_date),
          endDate: String(d.end_date),
          maxCapacity: Number(d.max_capacity),
          minOccupancy: Number(d.min_occupancy),
          departureType: d.departure_type as DepartureType,
          status: d.status as DepartureStatus,
          bookingCutoffAt: String(d.booking_cutoff_at),
          preferenceDeadlineAt: String(d.preference_deadline_at),
          priceOverridePaise:
            d.price_override_paise === null ? null : Number(d.price_override_paise),
          seatsTaken: Number(d.seats_taken),
          seatsRemaining: Number(d.seats_remaining),
        }));

      return { trip, itinerary, pickupPoints, departures };
    });

    return { trips: mappedTrips, isDemoFallback: false };
  } catch {
    return { trips: getDemoTripsWithDetails(), isDemoFallback: true };
  }
}

export async function getPublishedTripBySlug(slug: string): Promise<{
  item: TripWithDetails | null;
  isDemoFallback: boolean;
}> {
  const { trips, isDemoFallback } = await getPublishedTripsWithDetails();
  return {
    item: trips.find((t) => t.trip.slug === slug) ?? null,
    isDemoFallback,
  };
}

export async function getVerifiedReviews(): Promise<VerifiedReview[]> {
  if (!isSupabaseConfigured()) {
    return getDemoState().reviews.filter((r) => r.isVerifiedAuthentic && r.isPublished);
  }
  try {
    const supabase = createSupabasePublicClient();
    const { data } = await supabase
      .from("reviews")
      .select("*")
      .eq("is_verified_authentic", true)
      .eq("is_published", true)
      .order("created_at", { ascending: false });

    return (data ?? []).map((r) => ({
      id: r.id,
      tripId: r.trip_id,
      authorName: r.author_name,
      departureLabel: r.departure_label,
      rating: r.rating,
      quote: r.quote,
      isVerifiedAuthentic: r.is_verified_authentic,
      isPublished: r.is_published,
      createdAt: r.created_at,
    }));
  } catch {
    return [];
  }
}

export async function createAtomicBookingHold(
  input: ReserveSeatsDemoInput
): Promise<{
  bookingId: string;
  bookingReference: string;
  amountDuePaise: number;
  holdExpiresAt: string;
  seatNumbers: number[];
  /** "confirmed" when a coupon made the booking free (nothing to pay). */
  bookingStatus: string;
  couponDiscountPaise: number;
}> {
  if (!isSupabaseConfigured() || !isServiceRoleConfigured()) {
    if (input.couponCode) {
      throw new Error("COUPON_NEEDS_DATABASE: Coupons work once the live database is connected.");
    }
    const { booking, assignedSeats } = reserveSeatsDemo(input);
    return {
      bookingStatus: booking.status,
      couponDiscountPaise: 0,
      seatNumbers: assignedSeats.slice().sort((a, b) => a - b),
      bookingId: booking.id,
      bookingReference: booking.bookingReference,
      amountDuePaise: booking.amountDuePaise,
      holdExpiresAt: booking.holdExpiresAt ?? new Date(Date.now() + 15 * 60_000).toISOString(),
    };
  }

  const admin = createSupabaseAdminClient();
  const { settings } = await getSiteSettings();

  const { data: depRow, error: depErr } = await admin
    .from("departures")
    .select("*, trips(*)")
    .eq("id", input.departureId)
    .single();

  if (depErr || !depRow || !depRow.trips) {
    throw new Error("Departure or trip could not be loaded.");
  }

  const tripRow = depRow.trips;
  assertWomenOnlyConfirmed(depRow.departure_type, input.womenOnlyConfirmed);
  if (input.pickupPointId) {
    const { data: pickupMatch } = await admin
      .from("pickup_points")
      .select("id")
      .eq("id", input.pickupPointId)
      .eq("trip_id", tripRow.id)
      .maybeSingle();
    if (!pickupMatch) {
      throw new Error("Selected pickup hub does not belong to this trip.");
    }
  }
  const priceInput = {
    trip: {
      basePricePaise: tripRow.base_price_paise,
      privateGroupPricePaise: tripRow.private_group_price_paise,
      privateDiscountPercent: tripRow.private_discount_percent,
      depositPercent: tripRow.deposit_percent,
      balanceDueDaysBefore: tripRow.balance_due_days_before,
    },
    priceOverridePaise: depRow.price_override_paise,
    bookingMode: input.bookingMode,
    seatsRequested: input.seatsRequested,
    payDepositOnly: input.payDepositOnly,
    bookingPolicy: settings.bookingPolicy,
  };
  let pricing = calculateBookingPricing(priceInput);
  const couponCode = input.couponCode?.trim().toUpperCase() || null;
  if (couponCode) {
    const quote = await checkCouponForPricing(admin, {
      code: couponCode,
      tripId: tripRow.id,
      pricing,
      email: input.customerEmail,
      phone: input.customerPhone,
    });
    pricing = calculateBookingPricing({ ...priceInput, couponDiscountPaise: quote.discountPaise });
  }

  const bookingReference = `SAN-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;
  const balanceDueAt =
    pricing.balanceLaterPaise > 0
      ? new Date(
          Date.parse(depRow.start_date) -
            settings.bookingPolicy.balanceDueDaysBefore * 86_400_000
        ).toISOString()
      : null;

  const { data, error } = await admin.rpc(couponCode ? "reserve_departure_seats_with_coupon" : "reserve_departure_seats", {
    ...(couponCode ? { p_coupon_code: couponCode, p_coupon_discount_paise: pricing.couponDiscountPaise } : {}),
    p_booking_reference: bookingReference,
    p_departure_id: input.departureId,
    p_user_id: input.userId,
    p_customer_name: input.customerName,
    p_customer_email: input.customerEmail,
    p_customer_phone: input.customerPhone,
    p_booking_mode: input.bookingMode,
    p_seats_requested: pricing.seatsCount,
    p_pickup_point_id: input.pickupPointId,
    p_unit_price_paise: pricing.unitPricePaise,
    p_subtotal_paise: pricing.subtotalPaise,
    p_discount_paise: pricing.discountPaise,
    p_tax_paise: pricing.taxPaise,
    p_total_paise: pricing.totalPaise,
    p_amount_due_paise: pricing.payNowPaise,
    p_balance_due_at: balanceDueAt,
    p_hold_minutes: settings.bookingPolicy.holdMinutes,
    p_terms_snapshot: {
      policyVersion: settings.bookingPolicy.policyVersion,
      cancellationSlabs: settings.bookingPolicy.cancellationSlabs,
      roomPolicySummary: settings.bookingPolicy.roomPolicySummary,
    },
    p_pricing_snapshot: pricing,
    p_payment_provider: input.paymentProvider,
    p_travelers: input.travelers,
    p_co_traveler_preference: preferenceForDeparture(depRow.departure_type, input.coTravelerPreference),
    p_preference_notes: input.preferenceNotes,
    p_whatsapp_opt_in: input.whatsappOptIn,
    p_policy_version: settings.bookingPolicy.policyVersion,
    p_preferred_seats: input.preferredSeats && input.preferredSeats.length > 0 ? input.preferredSeats : null,
  });

  if (error || !data || !data[0]) {
    throw new Error(error?.message || "Could not reserve seats.");
  }

  return {
    bookingId: data[0].booking_id,
    bookingReference: data[0].booking_reference,
    amountDuePaise: pricing.payNowPaise,
    holdExpiresAt: data[0].hold_expires_at ?? new Date().toISOString(),
    seatNumbers: ((data[0].assigned_seats ?? []) as number[]).map(Number).sort((a, b) => a - b),
    bookingStatus: String(data[0].booking_status ?? "pending_payment"),
    couponDiscountPaise: Number(data[0].coupon_discount_paise ?? 0),
  };
}

export async function confirmBookingPayment(params: {
  bookingId: string;
  provider: string;
  providerOrderId: string;
  providerPaymentId: string;
  idempotencyKey: string;
  amountPaise: number;
  rawPayload: Record<string, unknown>;
}): Promise<{ bookingStatus: string; alreadyProcessed: boolean }> {
  if (!isSupabaseConfigured() || !isServiceRoleConfigured()) {
    return confirmPaymentDemo({
      bookingId: params.bookingId,
      provider: params.provider,
      providerOrderId: params.providerOrderId,
      providerPaymentId: params.providerPaymentId,
      idempotencyKey: params.idempotencyKey,
      amountPaise: params.amountPaise,
    });
  }

  const admin = createSupabaseAdminClient();
  const { data: b } = await admin
    .from("bookings")
    .select("total_paise, amount_paid_paise")
    .eq("id", params.bookingId)
    .single();

  if (!b) throw new Error("Booking not found.");
  const paymentType =
    b.amount_paid_paise > 0
      ? "balance"
      : params.amountPaise < b.total_paise
        ? "deposit"
        : "full";

  const { data, error } = await admin.rpc("confirm_booking_payment", {
    p_booking_id: params.bookingId,
    p_provider: params.provider,
    p_provider_order_id: params.providerOrderId,
    p_provider_payment_id: params.providerPaymentId,
    p_idempotency_key: params.idempotencyKey,
    p_amount_paise: params.amountPaise,
    p_payment_type: paymentType,
    p_raw_payload: params.rawPayload,
  });

  if (error || !data || !data[0]) {
    throw new Error(error?.message || "Payment confirmation failed.");
  }

  return {
    bookingStatus: data[0].booking_status,
    alreadyProcessed: data[0].already_processed,
  };
}

export async function getBookingByIdForServer(bookingId: string): Promise<BookingRecord | null> {
  if (!isSupabaseConfigured() || !isServiceRoleConfigured()) {
    return getDemoState().bookings.find((b) => b.id === bookingId) ?? null;
  }

  const admin = createSupabaseAdminClient();
  const { data } = await admin.from("bookings").select("*").eq("id", bookingId).maybeSingle();
  if (!data) return null;
  return mapBookingRow(data);
}

export async function lookupCustomerBooking(
  bookingReference: string,
  email: string
): Promise<CustomerBookingView | null> {
  if (!isSupabaseConfigured() || !isServiceRoleConfigured()) {
    return lookupCustomerBookingDemo(bookingReference, email);
  }

  const admin = createSupabaseAdminClient();
  const { data: b } = await admin
    .from("bookings")
    .select("*")
    .eq("booking_reference", bookingReference.trim().toUpperCase())
    .ilike("customer_email", email.trim())
    .maybeSingle();

  if (!b) return null;

  const [{ data: availRows }, { data: tripRow }, { data: pickupRow }, { data: travRows }, { data: comfortRow }] =
    await Promise.all([
      admin.rpc("get_departure_availability", { p_trip_id: null }),
      admin
        .from("departures")
        .select("trip_id, trips(id, slug, title, destination, pickup_city, is_sample_demo)")
        .eq("id", b.departure_id)
        .single(),
      b.pickup_point_id
        ? admin.from("pickup_points").select("*").eq("id", b.pickup_point_id).maybeSingle()
        : Promise.resolve({ data: null }),
      admin.from("booking_travelers").select("*").eq("booking_id", b.id),
      admin
        .from("booking_comfort_preferences")
        .select("co_traveler_preference, resolution_status")
        .eq("booking_id", b.id)
        .maybeSingle(),
    ]);

  const depAvail = (availRows ?? []).find(
    (d: Record<string, unknown>) => d.departure_id === b.departure_id
  );
  const t = (tripRow as { trips?: Record<string, unknown> } | null)?.trips;
  if (!depAvail || !t) return null;

  return {
    booking: mapBookingRow(b),
    trip: {
      id: String(t.id),
      slug: String(t.slug),
      title: String(t.title),
      destination: String(t.destination),
      pickupCity: String(t.pickup_city),
      isSampleDemo: Boolean(t.is_sample_demo),
    },
    departure: {
      departureId: String(depAvail.departure_id),
      tripId: String(depAvail.trip_id),
      departureCode: String(depAvail.departure_code),
      startDate: String(depAvail.start_date),
      endDate: String(depAvail.end_date),
      maxCapacity: Number(depAvail.max_capacity),
      minOccupancy: Number(depAvail.min_occupancy),
      departureType: depAvail.departure_type as DepartureType,
      status: depAvail.status as DepartureStatus,
      bookingCutoffAt: String(depAvail.booking_cutoff_at),
      preferenceDeadlineAt: String(depAvail.preference_deadline_at),
      priceOverridePaise:
        depAvail.price_override_paise === null ? null : Number(depAvail.price_override_paise),
      seatsTaken: Number(depAvail.seats_taken),
      seatsRemaining: Number(depAvail.seats_remaining),
    },
    pickupPoint: pickupRow
      ? {
          id: pickupRow.id,
          tripId: pickupRow.trip_id,
          name: pickupRow.name,
          area: pickupRow.area,
          pickupTimeLabel: pickupRow.pickup_time_label,
          mapsUrl: pickupRow.maps_url,
          isConfirmed: pickupRow.is_confirmed,
          sortOrder: pickupRow.sort_order,
        }
      : null,
    travelers: (travRows ?? []).map((tr) => ({
      id: tr.id,
      bookingId: tr.booking_id,
      fullName: tr.full_name,
      ageGroup: tr.age_group,
      emergencyContact: tr.emergency_contact,
      dietaryNotes: tr.dietary_notes ?? "",
      seatRowRequest: tr.seat_row_request,
      roomPreference: tr.room_preference,
      verificationChecked: tr.verification_checked,
    })),
    comfortSummaryLabel: getSafeComfortCustomerLabel(
      (comfortRow?.co_traveler_preference as CoTravelerPreference) ?? "open_mixed",
      (comfortRow?.resolution_status as ComfortResolutionStatus) ?? "none_requested"
    ),
    comfortResolutionStatus:
      (comfortRow?.resolution_status as ComfortResolutionStatus) ?? "none_requested",
    assignedSeatCount: b.seats_requested,
  };
}

export async function addWaitlistEntry(input: {
  departureId: string;
  fullName: string;
  email: string;
  phone: string;
  seatsNeeded: number;
  whatsappOptIn: boolean;
}): Promise<WaitlistEntry> {
  if (!isSupabaseConfigured() || !isServiceRoleConfigured()) {
    const entry: WaitlistEntry = {
      id: crypto.randomUUID(),
      departureId: input.departureId,
      fullName: input.fullName,
      email: input.email,
      phone: input.phone,
      seatsNeeded: input.seatsNeeded,
      whatsappOptIn: input.whatsappOptIn,
      status: "waiting",
      consentRecordedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    };
    getDemoState().waitlist.push(entry);
    return entry;
  }

  const admin = createSupabaseAdminClient();
  const { settings } = await getSiteSettings();
  const { data, error } = await admin
    .from("waitlist_entries")
    .insert({
      departure_id: input.departureId,
      full_name: input.fullName,
      email: input.email,
      phone: input.phone,
      seats_needed: input.seatsNeeded,
      whatsapp_opt_in: input.whatsappOptIn,
      status: "waiting",
    })
    .select("*")
    .single();

  if (error || !data) {
    throw new Error(error?.message || "Failed to join waitlist.");
  }

  await admin.from("consent_records").insert({
    subject_email: input.email,
    consent_type: "waitlist_contact",
    granted: true,
    policy_version: settings.bookingPolicy.policyVersion,
  });

  return {
    id: data.id,
    departureId: data.departure_id,
    fullName: data.full_name,
    email: data.email,
    phone: data.phone,
    seatsNeeded: data.seats_needed,
    whatsappOptIn: data.whatsapp_opt_in,
    status: data.status,
    consentRecordedAt: data.consent_recorded_at,
    createdAt: data.created_at,
  };
}

export async function requestCustomerBookingChange(params: {
  bookingReference: string;
  email: string;
  requestType: "cancel" | "reschedule";
  reason: string;
}): Promise<{ outcome: "cancelled_unpaid" | "request_logged" }> {
  if (usesLocalStore()) {
    const state = getDemoState();
    const booking = state.bookings.find(
      (b) =>
        b.bookingReference.toUpperCase() === params.bookingReference.trim().toUpperCase() &&
        b.customerEmail.toLowerCase() === params.email.trim().toLowerCase()
    );
    if (!booking) throw new Error("Booking not found.");
    if (["cancelled", "refunded", "expired"].includes(booking.status)) {
      throw new Error(`Cannot request change on a ${booking.status} booking.`);
    }
    // Nothing paid and nothing waiting for a check: cancel now so the seats free up at once.
    if (params.requestType === "cancel" && cancelUnpaidBookingDemo(booking.id, params.reason)) {
      return { outcome: "cancelled_unpaid" };
    }
    if (params.requestType === "cancel") {
      booking.status = "cancel_requested";
    } else {
      booking.rescheduleRequestedNote = params.reason;
    }
    booking.updatedAt = new Date().toISOString();
    state.auditLogs.unshift({
      id: crypto.randomUUID(),
      actorUserId: null,
      actorRole: "customer",
      action: `customer_${params.requestType}_request`,
      entityType: "booking",
      entityId: booking.id,
      reason: params.reason,
      beforeState: null,
      afterState: { status: booking.status },
      createdAt: new Date().toISOString(),
    });
    return { outcome: "request_logged" };
  }

  const admin = createSupabaseAdminClient();
  const { data: booking } = await admin
    .from("bookings")
    .select("id, status")
    .eq("booking_reference", params.bookingReference.trim().toUpperCase())
    .ilike("customer_email", params.email.trim())
    .maybeSingle();

  if (!booking) throw new Error("Booking not found.");
  if (["cancelled", "refunded", "expired"].includes(booking.status)) {
    throw new Error(`Cannot request change on a ${booking.status} booking.`);
  }

  if (params.requestType === "cancel" && booking.status === "pending_payment") {
    const { data: cancelled, error: cancelErr } = await admin.rpc("cancel_unpaid_booking", {
      p_booking_id: booking.id,
      p_reason: params.reason,
    });
    if (cancelErr) throw new Error(cancelErr.message);
    if (cancelled === true) return { outcome: "cancelled_unpaid" };
  }

  const updatePayload =
    params.requestType === "cancel"
      ? { status: "cancel_requested", updated_at: new Date().toISOString() }
      : { reschedule_requested_note: params.reason, updated_at: new Date().toISOString() };

  await admin.from("bookings").update(updatePayload).eq("id", booking.id);
  await admin.from("audit_logs").insert({
    actor_role: "customer",
    action: `customer_${params.requestType}_request`,
    entity_type: "booking",
    entity_id: booking.id,
    reason: params.reason,
  });
  return { outcome: "request_logged" };
}

export async function getAdminOperationsData(includeComfortPrefs: boolean): Promise<{
  bookings: AdminBookingRow[];
  departures: (PublicDepartureAvailability & { tripTitle: string })[];
  waitlist: (WaitlistEntry & { departureCode: string })[];
  auditLogs: AuditLogEntry[];
  trips: Trip[];
  reviews: VerifiedReview[];
  isDemoFallback: boolean;
}> {
  if (!isSupabaseConfigured() || !isServiceRoleConfigured()) {
    const demo = getAdminRowsDemo();
    return {
      ...demo,
      bookings: includeComfortPrefs
        ? demo.bookings
        : demo.bookings.map((row) => ({ ...row, comfortPreference: null })),
      isDemoFallback: true,
    };
  }

  const admin = createSupabaseAdminClient();
  const [
    { data: bookingsData },
    { data: tripsData },
    { data: availRows },
    { data: travelersData },
    { data: comfortData },
    { data: waitlistData },
    { data: auditData },
    { data: reviewsData },
    { data: pickupsData },
    { data: seatRows },
  ] = await Promise.all([
    admin.from("bookings").select("*").order("created_at", { ascending: false }).limit(100),
    admin.from("trips").select("*").order("sort_order", { ascending: true }),
    admin.rpc("get_departure_availability", { p_trip_id: null }),
    admin.from("booking_travelers").select("*"),
    includeComfortPrefs
      ? admin.from("booking_comfort_preferences").select("*")
      : Promise.resolve({ data: [] }),
    admin.from("waitlist_entries").select("*").order("created_at", { ascending: false }).limit(100),
    admin.from("audit_logs").select("*").order("created_at", { ascending: false }).limit(100),
    admin.from("reviews").select("*").order("created_at", { ascending: false }).limit(50),
    admin.from("pickup_points").select("*"),
    admin.from("seat_allocations").select("booking_id, seat_number").in("allocation_status", ["held", "confirmed"]),
  ]);

  const seatsByBooking = new Map<string, number[]>();
  for (const s of seatRows ?? []) {
    if (!s.booking_id) continue;
    const list = seatsByBooking.get(s.booking_id) ?? [];
    list.push(Number(s.seat_number));
    seatsByBooking.set(s.booking_id, list);
  }

  const trips: Trip[] = (tripsData ?? []).map((row) => ({
    id: row.id,
    slug: row.slug,
    title: row.title,
    destination: row.destination,
    region: row.region,
    tagline: row.tagline,
    summary: row.summary,
    durationDays: row.duration_days,
    durationNights: row.duration_nights,
    difficulty: row.difficulty,
    vibe: row.vibe,
    basePricePaise: row.base_price_paise,
    privateGroupPricePaise: row.private_group_price_paise,
    privateDiscountPercent: row.private_discount_percent,
    depositPercent: row.deposit_percent,
    balanceDueDaysBefore: row.balance_due_days_before,
    pickupCity: row.pickup_city,
    heroImageUrl: row.hero_image_url,
    galleryUrls: Array.isArray(row.gallery_urls) ? row.gallery_urls : [],
    videoLinks: Array.isArray(row.video_links) ? row.video_links : [],
    inclusions: Array.isArray(row.inclusions) ? row.inclusions : [],
    exclusions: Array.isArray(row.exclusions) ? row.exclusions : [],
    accommodationNotes: row.accommodation_notes,
    packingList: Array.isArray(row.packing_list) ? row.packing_list : [],
    safetyNotes: row.safety_notes,
    accessibilityNotes: row.accessibility_notes,
    isSampleDemo: row.is_sample_demo,
    isPublished: row.is_published,
    sortOrder: row.sort_order,
  }));

  const tripMap = new Map(trips.map((t) => [t.id, t]));
  const departures = (availRows ?? []).map((d: Record<string, unknown>) => ({
    departureId: String(d.departure_id),
    tripId: String(d.trip_id),
    departureCode: String(d.departure_code),
    startDate: String(d.start_date),
    endDate: String(d.end_date),
    maxCapacity: Number(d.max_capacity),
    minOccupancy: Number(d.min_occupancy),
    departureType: d.departure_type as DepartureType,
    status: d.status as DepartureStatus,
    bookingCutoffAt: String(d.booking_cutoff_at),
    preferenceDeadlineAt: String(d.preference_deadline_at),
    priceOverridePaise:
      d.price_override_paise === null ? null : Number(d.price_override_paise),
    seatsTaken: Number(d.seats_taken),
    seatsRemaining: Number(d.seats_remaining),
    tripTitle: tripMap.get(String(d.trip_id))?.title ?? "Unknown trip",
  }));

  const depMap = new Map<string, (typeof departures)[number]>(
    departures.map((d: (typeof departures)[number]) => [d.departureId, d])
  );
  const pickupMap = new Map((pickupsData ?? []).map((p) => [p.id, p]));

  const bookings: AdminBookingRow[] = (bookingsData ?? []).map((b) => {
    const mapped = mapBookingRow(b);
    const dep = depMap.get(mapped.departureId);
    const comfortRow = (comfortData ?? []).find(
      (c: Record<string, unknown>) => c.booking_id === mapped.id
    ) as Record<string, unknown> | undefined;

    return {
      booking: mapped,
      tripTitle: dep?.tripTitle ?? "Unknown trip",
      departureCode: dep?.departureCode ?? "—",
      departureStartDate: dep?.startDate ?? "—",
      pickupName: mapped.pickupPointId ? pickupMap.get(mapped.pickupPointId)?.name ?? null : null,
      seatNumbers: (seatsByBooking.get(mapped.id) ?? []).sort((x, y) => x - y),
      travelers: (travelersData ?? [])
        .filter((tr) => tr.booking_id === mapped.id)
        .map((tr) => ({
          id: tr.id,
          bookingId: tr.booking_id,
          fullName: tr.full_name,
          ageGroup: tr.age_group,
          emergencyContact: tr.emergency_contact,
          dietaryNotes: tr.dietary_notes ?? "",
          seatRowRequest: tr.seat_row_request,
          roomPreference: tr.room_preference,
          verificationChecked: tr.verification_checked,
        })),
      comfortPreference: comfortRow
        ? {
            bookingId: String(comfortRow.booking_id),
            coTravelerPreference: comfortRow.co_traveler_preference as CoTravelerPreference,
            preferenceNotes: (comfortRow.preference_notes as string | null) ?? null,
            resolutionStatus: comfortRow.resolution_status as ComfortResolutionStatus,
            resolvedBy: (comfortRow.resolved_by as string | null) ?? null,
            resolvedAt: (comfortRow.resolved_at as string | null) ?? null,
            consentRecordedAt: String(comfortRow.consent_recorded_at),
          }
        : null,
    };
  });

  return {
    bookings,
    departures,
    waitlist: (waitlistData ?? []).map((w) => ({
      id: w.id,
      departureId: w.departure_id,
      fullName: w.full_name,
      email: w.email,
      phone: w.phone,
      seatsNeeded: w.seats_needed,
      whatsappOptIn: w.whatsapp_opt_in,
      status: w.status,
      consentRecordedAt: w.consent_recorded_at,
      createdAt: w.created_at,
      departureCode: depMap.get(w.departure_id)?.departureCode ?? "—",
    })),
    auditLogs: (auditData ?? []).map((a) => ({
      id: a.id,
      actorUserId: a.actor_user_id,
      actorRole: a.actor_role,
      action: a.action,
      entityType: a.entity_type,
      entityId: a.entity_id,
      reason: a.reason,
      beforeState: a.before_state,
      afterState: a.after_state,
      createdAt: a.created_at,
    })),
    trips,
    reviews: (reviewsData ?? []).map((r) => ({
      id: r.id,
      tripId: r.trip_id,
      authorName: r.author_name,
      departureLabel: r.departure_label,
      rating: r.rating,
      quote: r.quote,
      isVerifiedAuthentic: r.is_verified_authentic,
      isPublished: r.is_published,
      createdAt: r.created_at,
    })),
    isDemoFallback: false,
  };
}

export async function performAdminSeatOverride(params: {
  departureId: string;
  action: "block_seat" | "release_block" | "promote_waitlist";
  seatsDelta: number;
  reason: string;
  actorUserId: string;
  actorRole: string;
}): Promise<void> {
  if (!isSupabaseConfigured() || !isServiceRoleConfigured()) {
    adminSeatOverrideDemo(params);
    return;
  }

  const admin = createSupabaseAdminClient();
  const { data: dep } = await admin
    .from("departures")
    .select("*")
    .eq("id", params.departureId)
    .single();
  if (!dep) throw new Error("Departure not found.");

  if (params.action === "block_seat") {
    const { data: active } = await admin
      .from("seat_allocations")
      .select("seat_number")
      .eq("departure_id", params.departureId)
      .in("allocation_status", ["held", "confirmed", "operator_blocked"]);
    const taken = new Set((active ?? []).map((r) => r.seat_number));
    const inserts = [];
    for (let s = 1; s <= dep.max_capacity && inserts.length < params.seatsDelta; s++) {
      if (!taken.has(s)) {
        inserts.push({
          departure_id: params.departureId,
          seat_number: s,
          allocation_status: "operator_blocked",
          reason: params.reason,
          created_by: params.actorUserId,
        });
      }
    }
    if (inserts.length === 0) throw new Error("No free seats available to block.");
    const { error } = await admin.from("seat_allocations").insert(inserts);
    if (error) throw new Error(error.message);
  } else if (params.action === "release_block") {
    const { data: blocked } = await admin
      .from("seat_allocations")
      .select("id")
      .eq("departure_id", params.departureId)
      .eq("allocation_status", "operator_blocked")
      .limit(params.seatsDelta);
    if (!blocked || blocked.length === 0) throw new Error("No operator-blocked seats to release.");
    await admin
      .from("seat_allocations")
      .update({ allocation_status: "released", updated_at: new Date().toISOString() })
      .in(
        "id",
        blocked.map((b) => b.id)
      );
  }

  await admin.rpc("recalculate_departure_status", { p_departure_id: params.departureId });
  await admin.from("audit_logs").insert({
    actor_user_id: params.actorUserId,
    actor_role: params.actorRole,
    action: `seat_override_${params.action}`,
    entity_type: "departure",
    entity_id: params.departureId,
    reason: params.reason,
    after_state: { seatsDelta: params.seatsDelta },
  });
}

export async function performAdminBookingAction(params: {
  bookingId: string;
  action: "mark_verified" | "cancel_booking" | "mark_refunded" | "resolve_comfort";
  comfortResolution?: ComfortResolutionStatus;
  reason: string;
  actorUserId: string;
  actorRole: string;
}): Promise<void> {
  const waitingMessage =
    "A UPI payment for this booking is waiting for your check. Confirm or reject it under Payments first.";
  if (usesLocalStore()) {
    if (
      (params.action === "cancel_booking" || params.action === "mark_refunded") &&
      hasWaitingPaymentDemo(params.bookingId)
    ) {
      throw new Error(waitingMessage);
    }
    adminBookingActionDemo(params);
    return;
  }

  const admin = createSupabaseAdminClient();
  const { data: booking } = await admin
    .from("bookings")
    .select("*")
    .eq("id", params.bookingId)
    .single();
  if (!booking) throw new Error("Booking not found.");
  if (["cancelled", "refunded", "expired"].includes(booking.status)) {
    throw new Error(`Cannot request change on a ${booking.status} booking.`);
  }

  if (params.action === "cancel_booking" || params.action === "mark_refunded") {
    const { count } = await admin
      .from("payments")
      .select("id", { count: "exact", head: true })
      .eq("booking_id", params.bookingId)
      .eq("status", "submitted");
    if ((count ?? 0) > 0) throw new Error(waitingMessage);
  }

  if (params.action === "mark_verified") {
    await admin
      .from("bookings")
      .update({ verification_status: "checked", updated_at: new Date().toISOString() })
      .eq("id", params.bookingId);
    await admin
      .from("booking_travelers")
      .update({ verification_checked: true })
      .eq("booking_id", params.bookingId);
  } else if (params.action === "cancel_booking" || params.action === "mark_refunded") {
    const nextStatus = params.action === "mark_refunded" ? "refunded" : "cancelled";
    await admin
      .from("bookings")
      .update({ status: nextStatus, updated_at: new Date().toISOString() })
      .eq("id", params.bookingId);
    await admin
      .from("seat_allocations")
      .update({ allocation_status: "released" })
      .eq("booking_id", params.bookingId);
  } else if (params.action === "resolve_comfort" && params.comfortResolution) {
    await admin
      .from("booking_comfort_preferences")
      .update({
        resolution_status: params.comfortResolution,
        resolved_by: params.actorUserId,
        resolved_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("booking_id", params.bookingId);
  }

  await admin.rpc("recalculate_departure_status", { p_departure_id: booking.departure_id });
  await admin.from("audit_logs").insert({
    actor_user_id: params.actorUserId,
    actor_role: params.actorRole,
    action: params.action,
    entity_type: "booking",
    entity_id: params.bookingId,
    reason: params.reason,
    before_state: { status: booking.status },
    after_state: { comfortResolution: params.comfortResolution ?? null },
  });
}

export async function performAdminTripUpdate(params: {
  id: string;
  title: string;
  basePricePaise: number;
  privateGroupPricePaise: number | null;
  privateDiscountPercent: number;
  depositPercent: number | null;
  isPublished: boolean;
  actorUserId: string;
  actorRole: string;
}): Promise<void> {
  if (!isSupabaseConfigured() || !isServiceRoleConfigured()) {
    const state = getDemoState();
    const trip = state.trips.find((t) => t.id === params.id);
    if (!trip) throw new Error("Trip not found.");
    const before = { basePricePaise: trip.basePricePaise, isPublished: trip.isPublished };
    trip.title = params.title;
    trip.basePricePaise = params.basePricePaise;
    trip.privateGroupPricePaise = params.privateGroupPricePaise;
    trip.privateDiscountPercent = params.privateDiscountPercent;
    trip.depositPercent = params.depositPercent;
    trip.isPublished = params.isPublished;
    state.auditLogs.unshift({
      id: crypto.randomUUID(),
      actorUserId: params.actorUserId,
      actorRole: params.actorRole,
      action: "trip_updated",
      entityType: "trip",
      entityId: trip.id,
      reason: "Admin trip configuration update",
      beforeState: before,
      afterState: { basePricePaise: trip.basePricePaise, isPublished: trip.isPublished },
      createdAt: new Date().toISOString(),
    });
    return;
  }

  const admin = createSupabaseAdminClient();
  const { data: before } = await admin
    .from("trips")
    .select("base_price_paise, is_published")
    .eq("id", params.id)
    .single();
  const { error } = await admin
    .from("trips")
    .update({
      title: params.title,
      base_price_paise: params.basePricePaise,
      private_group_price_paise: params.privateGroupPricePaise,
      private_discount_percent: params.privateDiscountPercent,
      deposit_percent: params.depositPercent,
      is_published: params.isPublished,
      updated_at: new Date().toISOString(),
    })
    .eq("id", params.id);
  if (error) throw new Error(error.message);

  await admin.from("audit_logs").insert({
    actor_user_id: params.actorUserId,
    actor_role: params.actorRole,
    action: "trip_updated",
    entity_type: "trip",
    entity_id: params.id,
    reason: "Admin trip configuration update",
    before_state: before,
    after_state: { base_price_paise: params.basePricePaise, is_published: params.isPublished },
  });
}

function mapBookingRow(b: Record<string, unknown>): BookingRecord {
  return {
    id: String(b.id),
    bookingReference: String(b.booking_reference),
    departureId: String(b.departure_id),
    userId: (b.user_id as string | null) ?? null,
    customerName: String(b.customer_name),
    customerEmail: String(b.customer_email),
    customerPhone: String(b.customer_phone),
    bookingMode: b.booking_mode as BookingRecord["bookingMode"],
    seatsRequested: Number(b.seats_requested),
    status: b.status as BookingRecord["status"],
    currency: "INR",
    unitPricePaise: Number(b.unit_price_paise),
    subtotalPaise: Number(b.subtotal_paise),
    discountPaise: Number(b.discount_paise),
    taxPaise: Number(b.tax_paise),
    totalPaise: Number(b.total_paise),
    amountPaidPaise: Number(b.amount_paid_paise),
    amountDuePaise: Number(b.amount_due_paise),
    amountRefundedPaise: Number(b.amount_refunded_paise ?? 0),
    balanceDueAt: (b.balance_due_at as string | null) ?? null,
    holdExpiresAt: (b.hold_expires_at as string | null) ?? null,
    termsSnapshot: (b.terms_snapshot as Record<string, unknown>) ?? {},
    pricingSnapshot: (b.pricing_snapshot as Record<string, unknown>) ?? {},
    pickupPointId: (b.pickup_point_id as string | null) ?? null,
    verificationStatus: (b.verification_status as BookingRecord["verificationStatus"]) ?? "not_checked",
    paymentProvider: (b.payment_provider as string | null) ?? null,
    rescheduleRequestedNote: (b.reschedule_requested_note as string | null) ?? null,
    createdAt: String(b.created_at),
    updatedAt: String(b.updated_at),
  };
}


// ===========================================================================
// Direct UPI payments
// ===========================================================================

const DISABLED_UPI: UpiPaymentSettings = {
  isEnabled: false,
  upiId: "",
  payeeName: "",
  supportPhone: "",
  updatedAt: null,
};

export async function getUpiPaymentSettings(): Promise<UpiPaymentSettings> {
  if (usesLocalStore()) return getUpiSettingsDemo();
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("upi_payment_settings")
    .select("is_enabled, upi_id, payee_name, support_phone, updated_at")
    .eq("id", 1)
    .maybeSingle();
  if (error) console.error("[upi] settings lookup failed (treating UPI as off):", error.message);
  if (error || !data) return DISABLED_UPI;
  return {
    isEnabled: Boolean(data.is_enabled),
    upiId: String(data.upi_id ?? ""),
    payeeName: String(data.payee_name ?? ""),
    supportPhone: String(data.support_phone ?? ""),
    updatedAt: (data.updated_at as string | null) ?? null,
  };
}

export async function updateUpiPaymentSettings(
  input: { isEnabled: boolean; upiId: string; payeeName: string; supportPhone: string },
  actor: { userId: string; role: string }
): Promise<UpiPaymentSettings> {
  if (usesLocalStore()) return updateUpiSettingsDemo(input, actor);
  const admin = createSupabaseAdminClient();
  const { error } = await admin
    .from("upi_payment_settings")
    .update({
      is_enabled: input.isEnabled,
      upi_id: input.upiId,
      payee_name: input.payeeName,
      support_phone: input.supportPhone,
      updated_by: actor.userId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", 1);
  if (error) throw new Error(error.message);
  return getUpiPaymentSettings();
}

export async function findBookingByReferenceAndEmail(
  bookingReference: string,
  email: string
): Promise<BookingRecord | null> {
  const ref = bookingReference.trim().toUpperCase();
  const mail = email.trim().toLowerCase();
  if (usesLocalStore()) {
    return (
      getDemoState().bookings.find(
        (b) => b.bookingReference.toUpperCase() === ref && b.customerEmail.toLowerCase() === mail
      ) ?? null
    );
  }
  const admin = createSupabaseAdminClient();
  const { data } = await admin
    .from("bookings")
    .select("*")
    .eq("booking_reference", ref)
    .ilike("customer_email", mail)
    .maybeSingle();
  return data ? mapBookingRow(data) : null;
}

export async function submitUpiPayment(bookingId: string, utr: string): Promise<UpiSubmitResult> {
  if (usesLocalStore()) return submitUpiPaymentDemo({ bookingId, utr });
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.rpc("submit_upi_payment", {
    p_booking_id: bookingId,
    p_utr: utr,
  });
  if (error || !data || !data[0]) {
    throw new Error(error?.message || "Could not record the payment.");
  }
  const row = data[0];
  return {
    paymentId: String(row.payment_id),
    amountPaise: Number(row.amount_paise),
    lateAfterHold: Boolean(row.late_after_hold),
    seatsLost: Boolean(row.seats_lost),
    bookingStatus: row.booking_status as BookingRecord["status"],
  };
}

export async function reviewUpiPayment(params: {
  paymentId: string;
  decision: UpiReviewDecision;
  note: string;
  actorUserId: string;
  actorRole: string;
}): Promise<UpiReviewResult> {
  const { settings } = await getSiteSettings();
  const retryMinutes = settings.bookingPolicy.holdMinutes;
  if (usesLocalStore()) return reviewUpiPaymentDemo({ ...params, retryMinutes });
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.rpc("review_upi_payment", {
    p_payment_id: params.paymentId,
    p_decision: params.decision,
    p_actor_user_id: params.actorUserId,
    p_actor_role: params.actorRole,
    p_note: params.note,
    p_retry_minutes: retryMinutes,
  });
  if (error || !data || !data[0]) {
    throw new Error(error?.message || "Could not save the decision.");
  }
  const row = data[0];
  return {
    paymentStatus: row.payment_status as PaymentRecord["status"],
    bookingStatus: row.booking_status as BookingRecord["status"],
    amountPaidPaise: Number(row.amount_paid_paise),
    amountDuePaise: Number(row.amount_due_paise),
  };
}

function mapPaymentRow(p: Record<string, unknown>): PaymentRecord {
  return {
    id: String(p.id),
    bookingId: String(p.booking_id),
    provider: String(p.provider),
    amountPaise: Number(p.amount_paise),
    paymentType: p.payment_type as PaymentRecord["paymentType"],
    status: p.status as PaymentRecord["status"],
    utr: (p.utr as string | null) ?? null,
    paidToUpiId: (p.paid_to_upi_id as string | null) ?? null,
    paidToName: (p.paid_to_name as string | null) ?? null,
    submittedAt: (p.submitted_at as string | null) ?? null,
    lateAfterHold: Boolean(p.late_after_hold),
    seatsLost: Boolean(p.seats_lost),
    reviewedAt: (p.reviewed_at as string | null) ?? null,
    reviewNote: (p.review_note as string | null) ?? null,
    createdAt: String(p.created_at),
    method: ((p.method as string | null) ?? "upi") as PaymentRecord["method"],
    staffReference: p.provider === "manual" ? ((p.provider_payment_id as string | null) ?? null) : null,
  };
}

export async function getBookingPayments(bookingId: string): Promise<PaymentRecord[]> {
  if (usesLocalStore()) return getBookingPaymentsDemo(bookingId);
  const admin = createSupabaseAdminClient();
  const { data } = await admin
    .from("payments")
    .select("*")
    .eq("booking_id", bookingId)
    .order("created_at", { ascending: false });
  return (data ?? []).map((p) => mapPaymentRow(p));
}

export async function getAdminPayments(): Promise<AdminPaymentRow[]> {
  if (usesLocalStore()) return getAdminPaymentRowsDemo();
  const admin = createSupabaseAdminClient();
  const { data: payRows } = await admin
    .from("payments")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(200);
  const payments = (payRows ?? []).map((p) => mapPaymentRow(p));
  const bookingIds = Array.from(new Set(payments.map((p) => p.bookingId)));
  if (bookingIds.length === 0) return [];

  const [{ data: bookingRows }, { data: depRows }, { data: tripRows }] = await Promise.all([
    admin.from("bookings").select("*").in("id", bookingIds),
    admin.from("departures").select("id, trip_id, departure_code, start_date"),
    admin.from("trips").select("id, title"),
  ]);
  const bookings = new Map((bookingRows ?? []).map((b) => [String(b.id), mapBookingRow(b)]));
  const deps = new Map((depRows ?? []).map((d) => [String(d.id), d]));
  const trips = new Map((tripRows ?? []).map((t) => [String(t.id), String(t.title)]));

  return payments.flatMap((payment) => {
    const booking = bookings.get(payment.bookingId);
    if (!booking) return [];
    const dep = deps.get(booking.departureId);
    return [
      {
        payment,
        bookingId: booking.id,
        bookingReference: booking.bookingReference,
        bookingStatus: booking.status,
        bookingTotalPaise: booking.totalPaise,
        bookingPaidPaise: booking.amountPaidPaise,
        customerName: booking.customerName,
        customerEmail: booking.customerEmail,
        customerPhone: booking.customerPhone,
        tripTitle: dep ? trips.get(String(dep.trip_id)) ?? "Unknown trip" : "Unknown trip",
        departureCode: dep ? String(dep.departure_code) : "—",
        departureStartDate: dep ? String(dep.start_date) : "—",
        seatsRequested: booking.seatsRequested,
      },
    ];
  });
}

/** Seat numbers in use on a published departure (public; no personal data). */
export async function getDepartureSeatMap(departureId: string): Promise<number[]> {
  if (!isSupabaseConfigured()) {
    const state = getDemoState();
    const now = Date.now();
    return state.seatAllocations
      .filter(
        (sa) =>
          sa.departureId === departureId &&
          (sa.allocationStatus === "confirmed" ||
            sa.allocationStatus === "operator_blocked" ||
            (sa.allocationStatus === "held" && (!sa.holdExpiresAt || Date.parse(sa.holdExpiresAt) > now)))
      )
      .map((sa) => sa.seatNumber)
      .sort((a, b) => a - b);
  }
  const supabase = createSupabasePublicClient();
  const { data, error } = await supabase.rpc("get_departure_seat_map", { p_departure_id: departureId });
  if (error) {
    console.error("[seats] seat map lookup failed:", error.message);
    return [];
  }
  return (data ?? []).map((r: { seat_number: number }) => Number(r.seat_number)).sort((a: number, b: number) => a - b);
}


// ---------------------------------------------------------------------------
// Coupons at checkout
// ---------------------------------------------------------------------------

/** Ask the database what a coupon is worth for this booking (no lock; the hold re-checks under lock). */
async function checkCouponForPricing(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  p: { code: string; tripId: string; pricing: { seatsCount: number; unitPricePaise: number; subtotalPaise: number; discountPaise: number }; email: string; phone: string }
): Promise<{ discountPaise: number; summary: string; code: string }> {
  const { data, error } = await admin.rpc("coupon_check", {
    p_code: p.code,
    p_trip_id: p.tripId,
    p_seats: p.pricing.seatsCount,
    p_unit_price_paise: p.pricing.unitPricePaise,
    p_base_paise: p.pricing.subtotalPaise - p.pricing.discountPaise,
    p_customer_email: p.email,
    p_customer_phone: p.phone,
    p_lock: false,
  });
  if (error || !data?.[0]) throw new Error(error?.message || "COUPON_UNKNOWN: That coupon code is not valid.");
  return { discountPaise: Number(data[0].discount_paise), summary: String(data[0].summary), code: String(data[0].code) };
}

/** Price preview with a coupon for the booking box (same maths as the hold). */
export async function quoteCoupon(input: {
  code: string;
  departureId: string;
  bookingMode: BookingMode;
  seatsRequested: number;
  payDepositOnly: boolean;
  email: string;
  phone: string;
}): Promise<{ code: string; summary: string; pricing: ReturnType<typeof calculateBookingPricing> }> {
  if (!isSupabaseConfigured() || !isServiceRoleConfigured()) {
    throw new Error("COUPON_NEEDS_DATABASE: Coupons work once the live database is connected.");
  }
  const admin = createSupabaseAdminClient();
  const { settings } = await getSiteSettings();
  const { data: depRow, error } = await admin.from("departures").select("*, trips(*)").eq("id", input.departureId).single();
  if (error || !depRow || !depRow.trips) throw new Error("Departure or trip could not be loaded.");
  const tripRow = depRow.trips;
  const priceInput = {
    trip: {
      basePricePaise: tripRow.base_price_paise,
      privateGroupPricePaise: tripRow.private_group_price_paise,
      privateDiscountPercent: tripRow.private_discount_percent,
      depositPercent: tripRow.deposit_percent,
      balanceDueDaysBefore: tripRow.balance_due_days_before,
    },
    priceOverridePaise: depRow.price_override_paise,
    bookingMode: input.bookingMode,
    seatsRequested: input.seatsRequested,
    payDepositOnly: input.payDepositOnly,
    bookingPolicy: settings.bookingPolicy,
  };
  const before = calculateBookingPricing(priceInput);
  const q = await checkCouponForPricing(admin, {
    code: input.code.trim().toUpperCase(),
    tripId: tripRow.id,
    pricing: before,
    email: input.email,
    phone: input.phone,
  });
  return { code: q.code, summary: q.summary, pricing: calculateBookingPricing({ ...priceInput, couponDiscountPaise: q.discountPaise }) };
}
