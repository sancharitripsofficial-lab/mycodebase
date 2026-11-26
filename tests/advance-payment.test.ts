import { beforeEach, describe, expect, it } from "vitest";
import { advanceAmountPaise, advanceTerms, assertAdvanceAvailable, calculateBookingPricing } from "@/lib/currency";
import { getDemoState, resetDemoStateForTests, reserveSeatsDemo } from "@/lib/data/demo-store";
import { reservedSeatTravelers } from "@/lib/traveler-details";

const POLICY = { allowDepositCheckout: false, depositPercent: 30, balanceDueDaysBefore: 7, taxRatePercent: 0 };
/** 26 Nov 2026, 5 pm in India. */
const NOW = Date.parse("2026-11-26T17:00:00+05:30");

describe("advance (deposit) and balance: one rule everywhere", () => {
  it("30% of ₹4,999 is ₹1,500 now and ₹3,499 later (the audit's own example)", () => {
    const pricing = calculateBookingPricing({
      trip: { basePricePaise: 419_900, privateGroupPricePaise: 2_299_900, privateDiscountPercent: 10, depositPercent: 30, balanceDueDaysBefore: 7 },
      priceOverridePaise: 499_900,
      bookingMode: "batch_seats",
      seatsRequested: 1,
      payDepositOnly: true,
      bookingPolicy: POLICY,
    });
    expect(pricing.totalPaise).toBe(499_900);
    expect(pricing.payNowPaise).toBe(150_000);
    expect(pricing.balanceLaterPaise).toBe(349_900);
    expect(pricing.payNowPaise + pricing.balanceLaterPaise).toBe(pricing.totalPaise);
    expect(pricing.depositApplied).toBe(true);
  });

  it("the advance is always whole rupees, never more than the total, and adds up with the balance", () => {
    for (const total of [100, 9_900, 224_900, 399_900, 499_900, 999_800, 2_159_460, 2_299_900, 6_510_000]) {
      for (const percent of [10, 25, 30, 50, 90]) {
        const now = advanceAmountPaise(total, percent);
        expect(now % 100).toBe(0);
        expect(now).toBeLessThanOrEqual(total);
        // Never less than the plain percentage (rounded up, not down).
        expect(now).toBeGreaterThanOrEqual(Math.min(total, Math.floor((total * percent) / 100)));
      }
    }
    expect(advanceAmountPaise(6_510_000, 30)).toBe(1_953_000); // already whole rupees: unchanged
    expect(advanceAmountPaise(0, 30)).toBe(0);
  });

  it("paying in full never changes: the whole total is due now", () => {
    const pricing = calculateBookingPricing({
      trip: { basePricePaise: 499_900, privateGroupPricePaise: null, privateDiscountPercent: 0, depositPercent: 30, balanceDueDaysBefore: 7 },
      priceOverridePaise: null,
      bookingMode: "batch_seats",
      seatsRequested: 2,
      payDepositOnly: false,
      bookingPolicy: POLICY,
    });
    expect(pricing.payNowPaise).toBe(999_800);
    expect(pricing.balanceLaterPaise).toBe(0);
    expect(pricing.depositApplied).toBe(false);
  });

  it("is offered while the balance date is still ahead, with that date", () => {
    // Trip on 18 Dec, balance 7 days before = 11 Dec.
    expect(advanceTerms({ tripDepositPercent: 30, bookingPolicy: POLICY, startDate: "2026-12-18", now: NOW })).toEqual({
      available: true,
      percent: 30,
      balanceDueDate: "2026-12-11",
      balanceDueDaysBefore: 7,
      reason: "ok",
    });
    // Trip on 4 Dec: the balance is due 27 Nov, tomorrow. Still offered today...
    expect(advanceTerms({ tripDepositPercent: 30, bookingPolicy: POLICY, startDate: "2026-12-04", now: NOW }).available).toBe(true);
    // ...and no longer from 27 Nov on: the balance would already be due.
    const nextDay = Date.parse("2026-11-27T00:05:00+05:30");
    expect(advanceTerms({ tripDepositPercent: 30, bookingPolicy: POLICY, startDate: "2026-12-04", now: nextDay })).toEqual({
      available: false,
      percent: 30,
      balanceDueDate: null,
      balanceDueDaysBefore: 7,
      reason: "too_close",
    });
  });

  it("uses India's date, not the server's (UTC is 5½ hours behind)", () => {
    // 00:30 on 27 Nov in India is still 26 Nov in UTC.
    const justAfterMidnightIst = Date.parse("2026-11-27T00:30:00+05:30");
    expect(new Date(justAfterMidnightIst).toISOString().slice(0, 10)).toBe("2026-11-26");
    expect(advanceTerms({ tripDepositPercent: 30, bookingPolicy: POLICY, startDate: "2026-12-04", now: justAfterMidnightIst }).available).toBe(false);
  });

  it("a trip with no advance takes the full amount; the site rule applies only when switched on", () => {
    expect(advanceTerms({ tripDepositPercent: null, bookingPolicy: POLICY, startDate: "2026-12-18", now: NOW })).toEqual({
      available: false,
      percent: null,
      balanceDueDate: null,
      balanceDueDaysBefore: 7,
      reason: "full_only",
    });
    expect(advanceTerms({ tripDepositPercent: null, bookingPolicy: { ...POLICY, allowDepositCheckout: true }, startDate: "2026-12-18", now: NOW }).percent).toBe(30);
    // The trip's own percentage wins over the site rule.
    expect(advanceTerms({ tripDepositPercent: 50, bookingPolicy: { ...POLICY, allowDepositCheckout: true }, startDate: "2026-12-18", now: NOW }).percent).toBe(50);
  });

  it("the trip's own 'balance due N days before' wins over the site rule, like its advance %", () => {
    const own = advanceTerms({ tripDepositPercent: 30, tripBalanceDueDaysBefore: 3, bookingPolicy: POLICY, startDate: "2026-12-04", now: NOW });
    expect(own).toMatchObject({ available: true, balanceDueDate: "2026-12-01", balanceDueDaysBefore: 3 });
    // No own number on the trip: the site rule (7 days) applies.
    expect(advanceTerms({ tripDepositPercent: 30, tripBalanceDueDaysBefore: null, bookingPolicy: POLICY, startDate: "2026-12-18", now: NOW }).balanceDueDate).toBe("2026-12-11");
    // The longer the notice, the earlier the advance closes.
    expect(advanceTerms({ tripDepositPercent: 30, tripBalanceDueDaysBefore: 14, bookingPolicy: POLICY, startDate: "2026-12-04", now: NOW }).reason).toBe("too_close");
  });

  it("asking for the advance where it is not offered is refused with a message, never charged as another amount", () => {
    const closed = advanceTerms({ tripDepositPercent: 30, bookingPolicy: POLICY, startDate: "2026-11-28", now: NOW });
    expect(() => assertAdvanceAvailable(true, closed)).toThrow(/^ADVANCE_CLOSED: This trip leaves too soon/);
    const none = advanceTerms({ tripDepositPercent: null, bookingPolicy: POLICY, startDate: "2026-12-18", now: NOW });
    expect(() => assertAdvanceAvailable(true, none)).toThrow(/^ADVANCE_CLOSED: This trip takes the full amount/);
    // Paying in full is always fine.
    expect(() => assertAdvanceAvailable(false, closed)).not.toThrow();
    expect(() => assertAdvanceAvailable(false, none)).not.toThrow();
  });
});

describe("seat hold (preview store) follows the advance rule", () => {
  beforeEach(() => resetDemoStateForTests());

  const hold = (departureId: string, payDepositOnly: boolean) =>
    reserveSeatsDemo({
      departureId,
      userId: null,
      customerName: "Asha Rao",
      customerEmail: "asha@example.com",
      customerPhone: "+919800000001",
      bookingMode: "batch_seats",
      seatsRequested: 1,
      pickupPointId: null,
      payDepositOnly,
      paymentProvider: "upi",
      travelers: reservedSeatTravelers("Asha Rao", "+919800000001", 1),
      coTravelerPreference: "open_mixed",
      preferenceNotes: "",
      whatsappOptIn: false,
    });

  /** A date that takes bookings today, starting `days` from now. */
  function futureDeparture(days: number): string {
    const state = getDemoState();
    const dep = state.departures.find((d) => d.departureCode === "SAN-HMP-JAN08")!;
    const start = new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
    dep.startDate = start;
    dep.endDate = start;
    dep.bookingCutoffAt = new Date(Date.now() + 3_600_000).toISOString();
    dep.status = "open";
    return dep.id;
  }

  it("a trip with no advance refuses a hold that asks for one, and holds the seat at full price", () => {
    const id = futureDeparture(40);
    expect(() => hold(id, true)).toThrow(/^ADVANCE_CLOSED/);
    const { booking } = hold(id, false);
    expect(booking.amountDuePaise).toBe(booking.totalPaise);
    expect(booking.balanceDueAt).toBeNull();
  });

  it("a trip with a 30% advance holds the seat for the rounded advance and dates the balance", () => {
    const id = futureDeparture(40);
    const state = getDemoState();
    const dep = state.departures.find((d) => d.id === id)!;
    state.trips.find((t) => t.id === dep.tripId)!.depositPercent = 30;
    dep.priceOverridePaise = 499_900;
    const { booking } = hold(id, true);
    expect(booking.totalPaise).toBe(499_900);
    expect(booking.amountDuePaise).toBe(150_000);
    // The balance is dated 7 days before the trip, the same day the booking box shows.
    expect(booking.balanceDueAt).toBe(`${new Date(Date.parse(dep.startDate) - 7 * 86_400_000).toISOString().slice(0, 10)}T00:00:00.000Z`);
  });

  it("the same trip refuses the advance once it leaves within the balance window", () => {
    const id = futureDeparture(3);
    const state = getDemoState();
    const dep = state.departures.find((d) => d.id === id)!;
    state.trips.find((t) => t.id === dep.tripId)!.depositPercent = 30;
    expect(() => hold(id, true)).toThrow(/^ADVANCE_CLOSED: This trip leaves too soon/);
    expect(hold(id, false).booking.amountDuePaise).toBeGreaterThan(0);
  });
});
