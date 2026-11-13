/**
 * Two interchangeable backends for the UPI payment scenarios:
 *  - "postgres": the real Supabase migrations running in PGlite (in-process Postgres 17)
 *  - "local":    the in-memory demo store used when Supabase is not configured
 * Every scenario in upi-payments.test.ts runs against both, so the rules cannot drift apart.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { calculateBookingPricing } from "@/lib/currency";
import {
  computePublicAvailabilityDemo,
  getDemoState,
  resetDemoStateForTests,
  reserveSeatsDemo,
} from "@/lib/data/demo-store";
import {
  cancelUnpaidBookingDemo,
  reviewUpiPaymentDemo,
  submitUpiPaymentDemo,
  updateUpiSettingsDemo,
} from "@/lib/data/demo-upi";
import type { BookingMode, UpiReviewDecision } from "@/lib/types";

export const TEST_TRIP = {
  basePricePaise: 1_000_000, // ₹10,000 per seat
  privateGroupPricePaise: 5_400_000, // ₹54,000 whole car
  privateDiscountPercent: 10,
  depositPercent: 30,
  balanceDueDaysBefore: 7,
};

const POLICY = {
  taxRatePercent: 0,
  allowDepositCheckout: true,
  depositPercent: 30,
  balanceDueDaysBefore: 7,
};

export const STAFF_USER_ID = "00000000-0000-4000-8000-0000000000aa";

export interface HoldOptions {
  departureId: string;
  seats: number;
  mode?: BookingMode;
  deposit?: boolean;
  /** Exact seats picked on the car map. */
  preferred?: number[];
}

export interface BookingSnapshot {
  status: string;
  totalPaise: number;
  amountPaidPaise: number;
  amountDuePaise: number;
  holdExpiresAt: string | null;
  heldSeats: number;
  heldSeatsWithoutExpiry: number;
  confirmedSeats: number;
}

export interface PaymentSnapshot {
  status: string;
  utr: string | null;
  amountPaise: number;
  paymentType: string;
  lateAfterHold: boolean;
  seatsLost: boolean;
}

export interface PaymentBackend {
  name: "postgres" | "local";
  newDeparture(opts?: { blockedSeats?: number }): Promise<string>;
  setUpi(enabled: boolean): Promise<void>;
  hold(opts: HoldOptions): Promise<{ bookingId: string; amountDuePaise: number; totalPaise: number }>;
  submit(bookingId: string, utr: string): Promise<{
    paymentId: string;
    amountPaise: number;
    lateAfterHold: boolean;
    seatsLost: boolean;
    bookingStatus: string;
  }>;
  review(
    paymentId: string,
    decision: UpiReviewDecision,
    note?: string,
    role?: string
  ): Promise<{ paymentStatus: string; bookingStatus: string; amountPaidPaise: number; amountDuePaise: number }>;
  booking(bookingId: string): Promise<BookingSnapshot>;
  payment(paymentId: string): Promise<PaymentSnapshot>;
  seatsTaken(departureId: string): Promise<number>;
  /** Seat numbers held or confirmed for one booking, lowest first. */
  seatNumbers(bookingId: string): Promise<number[]>;
  expireHold(bookingId: string): Promise<void>;
  setAmountDue(bookingId: string, amountDuePaise: number): Promise<void>;
  cancelUnpaid(bookingId: string): Promise<boolean>;
  refundCount(paymentId: string): Promise<number>;
  close(): Promise<void>;
}

let utrCounter = 0;
/** A fresh, never-repeated 12-digit UTR for each call. */
export function newUtr(): string {
  utrCounter += 1;
  const base = Date.now() % 1_000_000;
  return `${String(base).padStart(6, "0")}${String(utrCounter).padStart(6, "0")}`;
}

function pricingFor(opts: HoldOptions) {
  return calculateBookingPricing({
    trip: TEST_TRIP,
    priceOverridePaise: null,
    bookingMode: opts.mode ?? "batch_seats",
    seatsRequested: opts.mode === "private_vehicle" ? 6 : opts.seats,
    payDepositOnly: Boolean(opts.deposit),
    bookingPolicy: POLICY,
  });
}

function travelers(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    fullName: `Traveler ${i + 1}`,
    ageGroup: "adult" as const,
    emergencyContact: "+919800000000",
    seatRowRequest: "no_preference" as const,
    roomPreference: "shared_same_gender" as const,
  }));
}

// ---------------------------------------------------------------------------
// Postgres (PGlite) backend — runs the real migrations
// ---------------------------------------------------------------------------

const AUTH_STUBS = `
  CREATE ROLE anon NOLOGIN;
  CREATE ROLE authenticated NOLOGIN;
  CREATE ROLE service_role NOLOGIN;
  CREATE SCHEMA auth;
  CREATE TABLE auth.users (
    id UUID PRIMARY KEY,
    email TEXT,
    raw_user_meta_data JSONB NOT NULL DEFAULT '{}'::jsonb
  );
  CREATE FUNCTION auth.uid() RETURNS UUID LANGUAGE sql STABLE AS $$
    SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid
  $$;
`;

/** A fresh in-process Postgres with Supabase-like auth stubs and every migration applied. */
export async function createMigratedDb(): Promise<PGlite> {
  const db = await PGlite.create({ extensions: { pgcrypto } });
  await db.exec(AUTH_STUBS);
  const dir = path.resolve(__dirname, "../../supabase/migrations");
  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
    await db.exec(fs.readFileSync(path.join(dir, file), "utf8"));
  }
  return db;
}

export async function createPostgresBackend(): Promise<PaymentBackend> {
  const db = await createMigratedDb();

  await db.query(`INSERT INTO auth.users (id, email) VALUES ($1, 'owner@test.local')`, [STAFF_USER_ID]);
  await db.query(`INSERT INTO public.staff_roles (user_id, role) VALUES ($1, 'owner')`, [STAFF_USER_ID]);
  const trip = await db.query<{ id: string }>(
    `INSERT INTO public.trips (slug, title, destination, region, tagline, summary, duration_days,
       duration_nights, difficulty, vibe, base_price_paise, private_group_price_paise,
       private_discount_percent, deposit_percent, hero_image_url, is_published)
     VALUES ('test-trip', 'Test Trip', 'Test', 'Test', 't', 's', 3, 2, 'Easy', 'calm',
       $1, $2, $3, $4, '/x.jpg', true)
     RETURNING id`,
    [
      TEST_TRIP.basePricePaise,
      TEST_TRIP.privateGroupPricePaise,
      TEST_TRIP.privateDiscountPercent,
      TEST_TRIP.depositPercent,
    ]
  );
  const tripId = trip.rows[0].id;

  const one = async <T>(sql: string, params: unknown[] = []): Promise<T> => {
    const res = await db.query<T>(sql, params);
    return res.rows[0];
  };

  return {
    name: "postgres",

    async newDeparture(opts) {
      const code = `T-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
      const row = await one<{ id: string }>(
        `INSERT INTO public.departures (trip_id, departure_code, start_date, end_date,
           booking_cutoff_at, preference_deadline_at)
         VALUES ($1, $2, (now() + interval '35 days')::date, (now() + interval '37 days')::date,
           now() + interval '30 days', now() + interval '29 days')
         RETURNING id`,
        [tripId, code]
      );
      for (let s = 1; s <= (opts?.blockedSeats ?? 0); s++) {
        await db.query(
          `INSERT INTO public.seat_allocations (departure_id, seat_number, allocation_status, reason)
           VALUES ($1, $2, 'operator_blocked', 'test')`,
          [row.id, s]
        );
      }
      return row.id;
    },

    async setUpi(enabled) {
      await db.query(
        `UPDATE public.upi_payment_settings
         SET is_enabled = $1, upi_id = 'sanchari.test@okaxis', payee_name = 'Sanchari Test',
             updated_by = $2, updated_at = now()
         WHERE id = 1`,
        [enabled, STAFF_USER_ID]
      );
    },

    async hold(opts) {
      const p = pricingFor(opts);
      const ref = `SAN-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
      const row = await one<{ booking_id: string }>(
        `SELECT * FROM public.reserve_departure_seats(
           $1, $2, NULL, 'Asha Rao', 'asha@example.com', '+919800000001', $3, $4, NULL,
           $5, $6, $7, $8, $9, $10, NULL, 15, '{}'::jsonb, $11::jsonb, 'upi', $12::jsonb,
           'open_mixed', '', false, 'test-v1', $13)`,
        [
          ref,
          opts.departureId,
          opts.mode ?? "batch_seats",
          p.seatsCount,
          p.unitPricePaise,
          p.subtotalPaise,
          p.discountPaise,
          p.taxPaise,
          p.totalPaise,
          p.payNowPaise,
          JSON.stringify(p),
          JSON.stringify(travelers(p.seatsCount)),
          opts.preferred ?? null,
        ]
      );
      return { bookingId: row.booking_id, amountDuePaise: p.payNowPaise, totalPaise: p.totalPaise };
    },

    async submit(bookingId, utr) {
      const r = await one<{
        payment_id: string;
        amount_paise: number;
        late_after_hold: boolean;
        seats_lost: boolean;
        booking_status: string;
      }>(`SELECT * FROM public.submit_upi_payment($1, $2)`, [bookingId, utr]);
      return {
        paymentId: r.payment_id,
        amountPaise: r.amount_paise,
        lateAfterHold: r.late_after_hold,
        seatsLost: r.seats_lost,
        bookingStatus: r.booking_status,
      };
    },

    async review(paymentId, decision, note = "", role = "owner") {
      const r = await one<{
        payment_status: string;
        booking_status: string;
        amount_paid_paise: number;
        amount_due_paise: number;
      }>(`SELECT * FROM public.review_upi_payment($1, $2, $3, $4, $5, 15)`, [
        paymentId,
        decision,
        STAFF_USER_ID,
        role,
        note,
      ]);
      return {
        paymentStatus: r.payment_status,
        bookingStatus: r.booking_status,
        amountPaidPaise: r.amount_paid_paise,
        amountDuePaise: r.amount_due_paise,
      };
    },

    async booking(bookingId) {
      const b = await one<{
        status: string;
        total_paise: number;
        amount_paid_paise: number;
        amount_due_paise: number;
        hold_expires_at: Date | null;
        held: number;
        held_open: number;
        confirmed: number;
      }>(
        `SELECT b.status, b.total_paise, b.amount_paid_paise, b.amount_due_paise, b.hold_expires_at,
           (SELECT COUNT(*)::int FROM public.seat_allocations s WHERE s.booking_id = b.id AND s.allocation_status = 'held') AS held,
           (SELECT COUNT(*)::int FROM public.seat_allocations s WHERE s.booking_id = b.id AND s.allocation_status = 'held' AND s.hold_expires_at IS NULL) AS held_open,
           (SELECT COUNT(*)::int FROM public.seat_allocations s WHERE s.booking_id = b.id AND s.allocation_status = 'confirmed') AS confirmed
         FROM public.bookings b WHERE b.id = $1`,
        [bookingId]
      );
      return {
        status: b.status,
        totalPaise: b.total_paise,
        amountPaidPaise: b.amount_paid_paise,
        amountDuePaise: b.amount_due_paise,
        holdExpiresAt: b.hold_expires_at ? new Date(b.hold_expires_at).toISOString() : null,
        heldSeats: b.held,
        heldSeatsWithoutExpiry: b.held_open,
        confirmedSeats: b.confirmed,
      };
    },

    async payment(paymentId) {
      const p = await one<{
        status: string;
        utr: string | null;
        amount_paise: number;
        payment_type: string;
        late_after_hold: boolean;
        seats_lost: boolean;
      }>(
        `SELECT status, utr, amount_paise, payment_type, late_after_hold, seats_lost
         FROM public.payments WHERE id = $1`,
        [paymentId]
      );
      return {
        status: p.status,
        utr: p.utr,
        amountPaise: p.amount_paise,
        paymentType: p.payment_type,
        lateAfterHold: p.late_after_hold,
        seatsLost: p.seats_lost,
      };
    },

    async seatNumbers(bookingId) {
      const r = await db.query<{ seat_number: number }>(
        `SELECT seat_number FROM public.seat_allocations
         WHERE booking_id = $1 AND allocation_status IN ('held', 'confirmed') ORDER BY seat_number`,
        [bookingId]
      );
      return r.rows.map((x) => x.seat_number);
    },

    async seatsTaken(departureId) {
      const r = await one<{ seats_taken: number }>(
        `SELECT seats_taken FROM public.get_departure_availability(NULL) WHERE departure_id = $1`,
        [departureId]
      );
      return r.seats_taken;
    },

    async expireHold(bookingId) {
      await db.query(
        `UPDATE public.bookings SET hold_expires_at = now() - interval '1 minute' WHERE id = $1`,
        [bookingId]
      );
      await db.query(
        `UPDATE public.seat_allocations SET hold_expires_at = now() - interval '1 minute'
         WHERE booking_id = $1 AND allocation_status = 'held'`,
        [bookingId]
      );
    },

    async setAmountDue(bookingId, amountDuePaise) {
      await db.query(`UPDATE public.bookings SET amount_due_paise = $2 WHERE id = $1`, [
        bookingId,
        amountDuePaise,
      ]);
    },

    async cancelUnpaid(bookingId) {
      const r = await one<{ ok: boolean }>(
        `SELECT public.cancel_unpaid_booking($1, 'Changed my plans') AS ok`,
        [bookingId]
      );
      return r.ok;
    },

    async refundCount(paymentId) {
      const r = await one<{ n: number }>(
        `SELECT COUNT(*)::int AS n FROM public.refunds WHERE payment_id = $1`,
        [paymentId]
      );
      return r.n;
    },

    async close() {
      await db.close();
    },
  };
}

// ---------------------------------------------------------------------------
// Local (in-memory demo store) backend
// ---------------------------------------------------------------------------

export function createLocalBackend(): PaymentBackend {
  resetDemoStateForTests();
  const state = () => getDemoState();
  const tripId = "99999999-9999-4999-8999-999999999999";
  state().trips.push({
    ...state().trips[0],
    id: tripId,
    slug: "test-trip",
    title: "Test Trip",
    basePricePaise: TEST_TRIP.basePricePaise,
    privateGroupPricePaise: TEST_TRIP.privateGroupPricePaise,
    privateDiscountPercent: TEST_TRIP.privateDiscountPercent,
    depositPercent: TEST_TRIP.depositPercent,
    balanceDueDaysBefore: TEST_TRIP.balanceDueDaysBefore,
    isPublished: true,
  });
  state().settings.bookingPolicy = { ...state().settings.bookingPolicy, ...POLICY, holdMinutes: 15 };

  const day = 86_400_000;
  return {
    name: "local",

    async newDeparture(opts) {
      const id = crypto.randomUUID();
      const now = Date.now();
      state().departures.push({
        id,
        tripId,
        departureCode: `T-${crypto.randomBytes(4).toString("hex").toUpperCase()}`,
        startDate: new Date(now + 35 * day).toISOString().slice(0, 10),
        endDate: new Date(now + 37 * day).toISOString().slice(0, 10),
        maxCapacity: 6,
        minOccupancy: 3,
        departureType: "open_batch",
        status: "open",
        bookingCutoffAt: new Date(now + 30 * day).toISOString(),
        preferenceDeadlineAt: new Date(now + 29 * day).toISOString(),
        priceOverridePaise: null,
        isPublished: true,
      });
      for (let s = 1; s <= (opts?.blockedSeats ?? 0); s++) {
        state().seatAllocations.push({
          id: crypto.randomUUID(),
          departureId: id,
          bookingId: null,
          seatNumber: s,
          allocationStatus: "operator_blocked",
          holdExpiresAt: null,
          reason: "test",
        });
      }
      return id;
    },

    async setUpi(enabled) {
      updateUpiSettingsDemo(
        { isEnabled: enabled, upiId: "sanchari.test@okaxis", payeeName: "Sanchari Test", supportPhone: "" },
        { userId: STAFF_USER_ID, role: "owner" }
      );
    },

    async hold(opts) {
      const seats = opts.mode === "private_vehicle" ? 6 : opts.seats;
      const { booking } = reserveSeatsDemo({
        departureId: opts.departureId,
        userId: null,
        customerName: "Asha Rao",
        customerEmail: "asha@example.com",
        customerPhone: "+919800000001",
        bookingMode: opts.mode ?? "batch_seats",
        seatsRequested: seats,
        pickupPointId: null,
        payDepositOnly: Boolean(opts.deposit),
        paymentProvider: "upi",
        travelers: travelers(seats),
        coTravelerPreference: "open_mixed",
        preferenceNotes: "",
        whatsappOptIn: false,
        preferredSeats: opts.preferred ?? null,
      });
      return { bookingId: booking.id, amountDuePaise: booking.amountDuePaise, totalPaise: booking.totalPaise };
    },

    async submit(bookingId, utr) {
      return submitUpiPaymentDemo({ bookingId, utr });
    },

    async review(paymentId, decision, note = "", role = "owner") {
      return reviewUpiPaymentDemo({
        paymentId,
        decision,
        actorUserId: STAFF_USER_ID,
        actorRole: role,
        note,
        retryMinutes: 15,
      });
    },

    async booking(bookingId) {
      const b = state().bookings.find((x) => x.id === bookingId)!;
      const seats = state().seatAllocations.filter((s) => s.bookingId === bookingId);
      return {
        status: b.status,
        totalPaise: b.totalPaise,
        amountPaidPaise: b.amountPaidPaise,
        amountDuePaise: b.amountDuePaise,
        holdExpiresAt: b.holdExpiresAt,
        heldSeats: seats.filter((s) => s.allocationStatus === "held").length,
        heldSeatsWithoutExpiry: seats.filter((s) => s.allocationStatus === "held" && s.holdExpiresAt === null).length,
        confirmedSeats: seats.filter((s) => s.allocationStatus === "confirmed").length,
      };
    },

    async payment(paymentId) {
      const p = state().payments.find((x) => x.id === paymentId)!;
      return {
        status: p.status,
        utr: p.utr,
        amountPaise: p.amountPaise,
        paymentType: p.paymentType,
        lateAfterHold: p.lateAfterHold,
        seatsLost: p.seatsLost,
      };
    },

    async seatNumbers(bookingId) {
      return state()
        .seatAllocations.filter(
          (s) => s.bookingId === bookingId && (s.allocationStatus === "held" || s.allocationStatus === "confirmed")
        )
        .map((s) => s.seatNumber)
        .sort((a, b) => a - b);
    },

    async seatsTaken(departureId) {
      return computePublicAvailabilityDemo(state()).find((d) => d.departureId === departureId)!.seatsTaken;
    },

    async expireHold(bookingId) {
      const past = new Date(Date.now() - 60_000).toISOString();
      const b = state().bookings.find((x) => x.id === bookingId)!;
      b.holdExpiresAt = past;
      for (const s of state().seatAllocations) {
        if (s.bookingId === bookingId && s.allocationStatus === "held") s.holdExpiresAt = past;
      }
    },

    async setAmountDue(bookingId, amountDuePaise) {
      state().bookings.find((x) => x.id === bookingId)!.amountDuePaise = amountDuePaise;
    },

    async cancelUnpaid(bookingId) {
      return cancelUnpaidBookingDemo(bookingId, "Changed my plans");
    },

    async refundCount(paymentId) {
      return state().refunds.filter((r) => r.paymentId === paymentId).length;
    },

    async close() {
      resetDemoStateForTests();
    },
  };
}
