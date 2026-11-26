import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { getDemoState, lookupCustomerBookingDemo, resetDemoStateForTests, reserveSeatsDemo, saveTravelerDetailsDemo } from "@/lib/data/demo-store";
import { editableTravelerName, reservedSeatTravelers, travelerDetailsComplete, travelerDetailsLock, travelerIsComplete } from "@/lib/traveler-details";
import { checkoutSchema, travelerDetailsSchema } from "@/lib/validation";
import type { TravelerDetailsInput } from "@/lib/types";
import { createMigratedDb } from "./helpers/payment-backends";

const DEPARTURE = "22222222-2222-4222-8222-222222222205"; // SAN-HMP-JAN08: all six seats free
const EMAIL = "asha@example.com";

/** What the new booking box sends: date, seats, name, WhatsApp number, email, one consent. No travellers. */
const STEP_ONE = {
  departureId: DEPARTURE,
  bookingMode: "batch_seats",
  seatsRequested: 3,
  pickupPointId: null,
  customerName: "Asha Rao",
  customerEmail: EMAIL,
  customerPhone: "9800000001",
  payDepositOnly: false,
  whatsappOptIn: false,
  acceptedTermsPrivacy: true,
  acceptedComfortProcessing: true,
};

function reserve(seats = 3) {
  return reserveSeatsDemo({
    departureId: DEPARTURE,
    userId: null,
    customerName: "Asha Rao",
    customerEmail: EMAIL,
    customerPhone: "9800000001",
    bookingMode: "batch_seats",
    seatsRequested: seats,
    pickupPointId: null,
    payDepositOnly: false,
    paymentProvider: "upi",
    travelers: reservedSeatTravelers("Asha Rao", "9800000001", seats),
    coTravelerPreference: "open_mixed",
    preferenceNotes: "",
    whatsappOptIn: false,
  });
}

function details(bookingReference: string, over: Partial<TravelerDetailsInput> = {}): TravelerDetailsInput {
  const view = lookupCustomerBookingDemo(bookingReference, EMAIL)!;
  return {
    bookingReference,
    email: EMAIL,
    travelers: view.travelers.map((t, i) => ({
      id: t.id,
      fullName: ["Asha Rao", "Vikram Nair", "Meera Iyer"][i] ?? `Guest ${i + 1}`,
      ageGroup: i === 2 ? "senior" : "adult",
      ageYears: [29, 34, 62][i] ?? 30,
      emergencyContact: "9811100000",
      dietaryNotes: i === 1 ? "Vegetarian" : "",
      seatRowRequest: "no_preference",
      roomPreference: "shared_same_gender",
    })),
    ...over,
  };
}

describe("step 1: reserving needs only a date, seats, a name, a WhatsApp number and an email", () => {
  it("is accepted without any traveller details", () => {
    const parsed = checkoutSchema.safeParse(STEP_ONE);
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.travelers).toBeUndefined();
  });

  it("still needs the consent, a real email and a real phone number", () => {
    expect(checkoutSchema.safeParse({ ...STEP_ONE, acceptedTermsPrivacy: false }).success).toBe(false);
    expect(checkoutSchema.safeParse({ ...STEP_ONE, customerEmail: "asha" }).success).toBe(false);
    expect(checkoutSchema.safeParse({ ...STEP_ONE, customerPhone: "12" }).success).toBe(false);
    expect(checkoutSchema.safeParse({ ...STEP_ONE, customerName: "A" }).success).toBe(false);
  });

  it("a page opened before the two-step form still books with its full traveller list", () => {
    const old = {
      ...STEP_ONE,
      seatsRequested: 1,
      travelers: [{ fullName: "Asha Rao", ageGroup: "adult", ageYears: 29, emergencyContact: "9811100000", seatRowRequest: "no_preference", roomPreference: "shared_same_gender" }],
    };
    expect(checkoutSchema.safeParse(old).success).toBe(true);
    // ...but a list that does not match the seats is still refused.
    expect(checkoutSchema.safeParse({ ...old, seatsRequested: 2 }).success).toBe(false);
  });

  it("each reserved seat gets a row: the booker by name, the rest to be named, none complete yet", () => {
    const rows = reservedSeatTravelers("  Asha Rao ", "9800000001", 3);
    expect(rows.map((r) => r.fullName)).toEqual(["Asha Rao", "Traveller 2", "Traveller 3"]);
    expect(rows.every((r) => r.ageYears === null && r.emergencyContact === "9800000001")).toBe(true);
    expect(travelerDetailsComplete(rows)).toBe(false);
    expect(reservedSeatTravelers("Asha", "98", 9)).toHaveLength(6);
    expect(reservedSeatTravelers("Asha", "98", 0)).toHaveLength(1);
  });

  it("a stand-in name is never offered back as if it were a real name", () => {
    expect(editableTravelerName("Traveller 2")).toBe("");
    expect(editableTravelerName("Asha Rao")).toBe("Asha Rao");
    expect(travelerIsComplete({ fullName: "Traveller 2", ageYears: 30 })).toBe(false);
    expect(travelerIsComplete({ fullName: "Asha Rao", ageYears: null })).toBe(false);
    expect(travelerIsComplete({ fullName: "Asha Rao", ageYears: 29 })).toBe(true);
  });
});

describe("step 2: traveller details are filled in from My Booking", () => {
  beforeEach(() => resetDemoStateForTests());

  it("the seats are held first; My Booking then says details are needed and offers the pick-up points", () => {
    const { booking, assignedSeats } = reserve(3);
    expect(assignedSeats).toHaveLength(3);
    const view = lookupCustomerBookingDemo(booking.bookingReference, EMAIL)!;
    expect(view.travelers).toHaveLength(3);
    expect(view.travelerDetailsComplete).toBe(false);
    expect(view.travelerDetailsLockedReason).toBeNull();
    expect(view.pickupPoint).toBeNull();
    expect(view.pickupOptions!.length).toBeGreaterThan(0);
    expect(view.pickupOptions!.every((p) => p.tripId === view.trip.id)).toBe(true);
    expect(view.coTravelerPreference).toBe("open_mixed");
    expect(view.comfortEditable).toBe(true);
  });

  it("saving the details completes the booking's travellers, pick-up point and request", () => {
    const { booking } = reserve(3);
    const before = lookupCustomerBookingDemo(booking.bookingReference, EMAIL)!;
    const pickupPointId = before.pickupOptions![0].id;

    const result = saveTravelerDetailsDemo(details(booking.bookingReference, { pickupPointId, coTravelerPreference: "prefer_same_gender", preferenceNotes: "Travelling with my mother" }));
    expect(result).toEqual({ saved: 3 });

    const after = lookupCustomerBookingDemo(booking.bookingReference, EMAIL)!;
    expect(after.travelerDetailsComplete).toBe(true);
    expect(after.travelers.map((t) => t.fullName)).toEqual(["Asha Rao", "Vikram Nair", "Meera Iyer"]);
    expect(after.travelers.map((t) => t.ageYears)).toEqual([29, 34, 62]);
    expect(after.travelers[2].ageGroup).toBe("senior");
    expect(after.travelers[1].dietaryNotes).toBe("Vegetarian");
    expect(after.travelers.every((t) => t.emergencyContact === "9811100000")).toBe(true);
    expect(after.pickupPoint?.id).toBe(pickupPointId);
    expect(after.coTravelerPreference).toBe("prefer_same_gender");
    expect(after.comfortResolutionStatus).toBe("pending_review");
    // Seats and money are untouched by step 2.
    expect(after.booking.seatsRequested).toBe(3);
    expect(after.booking.totalPaise).toBe(before.booking.totalPaise);
    expect(after.booking.amountDuePaise).toBe(before.booking.amountDuePaise);
  });

  it("the log says details were saved, never what they are", () => {
    const { booking } = reserve(2);
    saveTravelerDetailsDemo(details(booking.bookingReference));
    const entry = getDemoState().auditLogs.find((l) => l.action === "customer_traveler_details")!;
    expect(entry.entityId).toBe(booking.id);
    expect(JSON.stringify(entry)).not.toMatch(/Vikram|9811100000|Vegetarian/);
  });

  it("can be changed again until staff have checked an ID", () => {
    const { booking } = reserve(1);
    saveTravelerDetailsDemo(details(booking.bookingReference));
    const again = details(booking.bookingReference);
    again.travelers[0].dietaryNotes = "Jain food";
    expect(saveTravelerDetailsDemo(again)).toEqual({ saved: 1 });
    expect(lookupCustomerBookingDemo(booking.bookingReference, EMAIL)!.travelers[0].dietaryNotes).toBe("Jain food");

    getDemoState().travelers.find((t) => t.bookingId === booking.id)!.verificationChecked = true;
    expect(() => saveTravelerDetailsDemo(details(booking.bookingReference))).toThrow(/^DETAILS_LOCKED: Our team has already checked/);
    expect(lookupCustomerBookingDemo(booking.bookingReference, EMAIL)!.travelerDetailsLockedReason).toMatch(/already checked/);
  });

  it("only this booking's own seats can be filled in: no extra, missing or foreign travellers", () => {
    const mine = reserve(2).booking;
    const other = reserveSeatsDemo({
      departureId: DEPARTURE,
      userId: null,
      customerName: "Someone Else",
      customerEmail: "else@example.com",
      customerPhone: "9800000009",
      bookingMode: "batch_seats",
      seatsRequested: 1,
      pickupPointId: null,
      payDepositOnly: false,
      paymentProvider: "upi",
      travelers: reservedSeatTravelers("Someone Else", "9800000009", 1),
      coTravelerPreference: "open_mixed",
      preferenceNotes: "",
      whatsappOptIn: false,
    }).booking;
    const foreignId = getDemoState().travelers.find((t) => t.bookingId === other.id)!.id;

    const good = details(mine.bookingReference);
    expect(() => saveTravelerDetailsDemo({ ...good, travelers: good.travelers.slice(0, 1) })).toThrow(/^TRAVELERS_MISMATCH/);
    expect(() => saveTravelerDetailsDemo({ ...good, travelers: [good.travelers[0], { ...good.travelers[1], id: foreignId }] })).toThrow(/^TRAVELERS_MISMATCH/);
    // The other booking's traveller is untouched.
    expect(getDemoState().travelers.find((t) => t.id === foreignId)!.fullName).toBe("Someone Else");
    // Wrong email: the booking is not found at all.
    expect(() => saveTravelerDetailsDemo({ ...good, email: "else@example.com" })).toThrow(/^BOOKING_NOT_FOUND/);
  });

  it("refuses a pick-up point of another trip", () => {
    const { booking } = reserve(1);
    const view = lookupCustomerBookingDemo(booking.bookingReference, EMAIL)!;
    const foreign = getDemoState().pickupPoints.find((p) => p.tripId !== view.trip.id)!;
    expect(() => saveTravelerDetailsDemo(details(booking.bookingReference, { pickupPointId: foreign.id }))).toThrow(/^PICKUP_INVALID/);
  });

  it("is closed once the booking is cancelled or expired, or the trip has left", () => {
    const { booking } = reserve(1);
    const state = getDemoState();
    state.bookings.find((b) => b.id === booking.id)!.status = "cancelled";
    expect(() => saveTravelerDetailsDemo(details(booking.bookingReference))).toThrow(/^DETAILS_LOCKED: This booking is closed/);
    state.bookings.find((b) => b.id === booking.id)!.status = "confirmed";
    state.departures.find((d) => d.id === DEPARTURE)!.startDate = "2026-01-01";
    expect(() => saveTravelerDetailsDemo(details(booking.bookingReference))).toThrow(/^DETAILS_LOCKED: This trip has already left/);
    expect(travelerDetailsLock({ status: "expired", tripHasStarted: false, anyVerified: false }).locked).toBe(true);
    expect(travelerDetailsLock({ status: "deposit_paid", tripHasStarted: false, anyVerified: false }).locked).toBe(false);
  });

  it("a co-traveller request the team has already answered is not overwritten", () => {
    const { booking } = reserve(1);
    saveTravelerDetailsDemo(details(booking.bookingReference, { coTravelerPreference: "request_women_only" }));
    const comfort = getDemoState().comfortPreferences.find((c) => c.bookingId === booking.id)!;
    comfort.resolutionStatus = "accommodated";
    saveTravelerDetailsDemo(details(booking.bookingReference, { coTravelerPreference: "open_mixed" }));
    expect(comfort.coTravelerPreference).toBe("request_women_only");
    expect(lookupCustomerBookingDemo(booking.bookingReference, EMAIL)!.comfortEditable).toBe(false);
  });
});

describe("step 2 form checks", () => {
  const ok = {
    bookingReference: "san-ab12cd",
    email: EMAIL,
    pickupPointId: null,
    travelers: [{ id: "11111111-1111-4111-8111-111111111111", fullName: "Asha Rao", ageGroup: "adult", ageYears: "29", emergencyContact: "98111 00000", dietaryNotes: "", seatRowRequest: "no_preference", roomPreference: "shared_same_gender" }],
  };

  it("accepts a complete traveller, with the age typed as text, and tidies the reference", () => {
    const parsed = travelerDetailsSchema.safeParse(ok);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.bookingReference).toBe("SAN-AB12CD");
      expect(parsed.data.travelers[0].ageYears).toBe(29);
    }
  });

  it("needs a name, an age inside the traveller's age group and an emergency number", () => {
    const withTraveller = (patch: Record<string, unknown>) => travelerDetailsSchema.safeParse({ ...ok, travelers: [{ ...ok.travelers[0], ...patch }] });
    expect(withTraveller({ fullName: "A" }).success).toBe(false);
    expect(withTraveller({ ageYears: "" }).success).toBe(false);
    expect(withTraveller({ ageYears: 17 }).success).toBe(false);
    expect(withTraveller({ ageYears: 60 }).success).toBe(false); // 60 is a senior
    expect(withTraveller({ ageYears: 60, ageGroup: "senior" }).success).toBe(true);
    expect(withTraveller({ ageYears: 111, ageGroup: "senior" }).success).toBe(false);
    expect(withTraveller({ emergencyContact: "call my mum" }).success).toBe(false);
    expect(withTraveller({ id: "not-an-id" }).success).toBe(false);
  });

  it("refuses the same traveller twice, no travellers, or more than six", () => {
    const t = ok.travelers[0];
    expect(travelerDetailsSchema.safeParse({ ...ok, travelers: [t, t] }).success).toBe(false);
    expect(travelerDetailsSchema.safeParse({ ...ok, travelers: [] }).success).toBe(false);
    const seven = Array.from({ length: 7 }, (_, i) => ({ ...t, id: `11111111-1111-4111-8111-11111111111${i}` }));
    expect(travelerDetailsSchema.safeParse({ ...ok, travelers: seven }).success).toBe(false);
  });
});

describe("the database accepts step 1's stand-in travellers (real migrations)", () => {
  let db: PGlite;
  let departureId: string;

  beforeAll(async () => {
    db = await createMigratedDb();
    const trip = await db.query<{ id: string }>(
      `INSERT INTO public.trips (slug, title, destination, region, tagline, summary, duration_days, duration_nights, difficulty, vibe, base_price_paise, hero_image_url, is_published)
       VALUES ('two-step', 'Two Step', 'Test', 'Test', 't', 's', 2, 1, 'Easy', 'calm', 499900, '/x.jpg', true) RETURNING id`
    );
    const dep = await db.query<{ id: string }>(
      `INSERT INTO public.departures (trip_id, departure_code, start_date, end_date, booking_cutoff_at, preference_deadline_at)
       VALUES ($1, 'T-TWOSTEP', (now() + interval '35 days')::date, (now() + interval '36 days')::date, now() + interval '30 days', now() + interval '29 days') RETURNING id`,
      [trip.rows[0].id]
    );
    departureId = dep.rows[0].id;
  }, 120_000);

  afterAll(async () => {
    await db?.close();
  });

  it("holds the seats with one row per seat; ages stay empty until step 2 and are then checked", async () => {
    const travelers = reservedSeatTravelers("Asha Rao", "9800000001", 2);
    const held = await db.query<{ booking_id: string; assigned_seats: number[] }>(
      `SELECT * FROM public.reserve_departure_seats(
         'SAN-TWOSTEP1', $1, NULL, 'Asha Rao', 'asha@example.com', '9800000001', 'batch_seats', 2, NULL,
         499900, 999800, 0, 0, 999800, 999800, NULL, 15, '{}'::jsonb, '{}'::jsonb, 'upi', $2::jsonb,
         'open_mixed', '', false, 'test-v1', NULL)`,
      [departureId, JSON.stringify(travelers)]
    );
    const bookingId = held.rows[0].booking_id;
    expect(held.rows[0].assigned_seats).toHaveLength(2);

    const rows = await db.query<{ id: string; full_name: string; age_years: number | null; emergency_contact: string }>(
      `SELECT id, full_name, age_years, emergency_contact FROM public.booking_travelers WHERE booking_id = $1 ORDER BY full_name`,
      [bookingId]
    );
    expect(rows.rows.map((r) => r.full_name)).toEqual(["Asha Rao", "Traveller 2"]);
    expect(rows.rows.every((r) => r.age_years === null && r.emergency_contact === "9800000001")).toBe(true);

    // Step 2 writes the same columns the site's server writes; the database's own age rule still applies.
    await db.query(`UPDATE public.booking_travelers SET full_name = 'Vikram Nair', age_group = 'adult', age_years = 34, emergency_contact = '9811100000' WHERE id = $1`, [rows.rows[1].id]);
    await expect(db.query(`UPDATE public.booking_travelers SET age_group = 'adult', age_years = 61 WHERE id = $1`, [rows.rows[0].id])).rejects.toThrow(/age_years_check/);
    const after = await db.query<{ full_name: string; age_years: number | null }>(`SELECT full_name, age_years FROM public.booking_travelers WHERE id = $1`, [rows.rows[1].id]);
    expect(after.rows[0]).toEqual({ full_name: "Vikram Nair", age_years: 34 });
  });
});
