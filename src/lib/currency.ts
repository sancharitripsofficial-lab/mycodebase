import { addDaysISO } from "@/lib/dates";
import { istTodayISO } from "@/lib/departure-rules";
import type { BookingMode, SiteSettings, Trip } from "@/lib/types";

/**
 * Paying an advance now and the balance later. One set of rules for the booking box, the server
 * that holds the seats, My Booking and the chat guide, so the advance and the balance a customer
 * is shown are always the amounts they are asked to pay.
 */
export interface AdvanceTerms {
  /** The advance can be chosen for this date right now. */
  available: boolean;
  /** Share of the total paid now, in percent. Null when this trip takes the full amount only. */
  percent: number | null;
  /** Last calendar day (YYYY-MM-DD) to pay the balance. Null when the advance is not available. */
  balanceDueDate: string | null;
  /** How many days before the trip the balance is due (the trip's own number, else the site's). */
  balanceDueDaysBefore: number;
  /**
   * "full_only": the owner offers no advance on this trip.
   * "too_close": the day the balance would be due is today or already past, so the full amount is due now.
   */
  reason: "ok" | "full_only" | "too_close";
}

export function advanceTerms(input: {
  tripDepositPercent: number | null;
  /** The trip's own "balance due N days before" (Admin → Trips). It wins over the site rule, like the trip's own advance %. */
  tripBalanceDueDaysBefore?: number | null;
  bookingPolicy: Pick<SiteSettings["bookingPolicy"], "allowDepositCheckout" | "depositPercent" | "balanceDueDaysBefore">;
  /** The trip's first day (YYYY-MM-DD). */
  startDate: string;
  now?: number;
}): AdvanceTerms {
  const ownDays = input.tripBalanceDueDaysBefore;
  const balanceDueDaysBefore = Math.max(0, Math.round((typeof ownDays === "number" && Number.isFinite(ownDays) ? ownDays : input.bookingPolicy.balanceDueDaysBefore) || 0));
  const percent = input.tripDepositPercent ?? (input.bookingPolicy.allowDepositCheckout ? input.bookingPolicy.depositPercent : null);
  if (percent === null || !Number.isFinite(percent) || percent < 10 || percent >= 100) {
    return { available: false, percent: null, balanceDueDate: null, balanceDueDaysBefore, reason: "full_only" };
  }
  const start = (input.startDate ?? "").slice(0, 10);
  const balanceDueDate = /^\d{4}-\d{2}-\d{2}$/.test(start) ? addDaysISO(start, -balanceDueDaysBefore) : null;
  if (!balanceDueDate || balanceDueDate <= istTodayISO(input.now)) {
    return { available: false, percent, balanceDueDate: null, balanceDueDaysBefore, reason: "too_close" };
  }
  return { available: true, percent, balanceDueDate, balanceDueDaysBefore, reason: "ok" };
}

/** Refuses a seat hold that asks for the advance on a date where it is not offered ("CODE: message"). */
export function assertAdvanceAvailable(payDepositOnly: boolean, terms: AdvanceTerms): void {
  if (!payDepositOnly || terms.available) return;
  throw new Error(
    terms.reason === "too_close"
      ? "ADVANCE_CLOSED: This trip leaves too soon for an advance, so the full amount is due now. Please check the amount and continue."
      : "ADVANCE_CLOSED: This trip takes the full amount at booking. Please check the amount and continue."
  );
}

/**
 * The advance for a total: the percentage, rounded up to a whole rupee, so nobody is asked to pay
 * ₹1,499.70 by UPI. 30% of ₹4,999 is ₹1,500 and the balance is ₹3,499.
 */
export function advanceAmountPaise(totalPaise: number, percent: number): number {
  if (totalPaise <= 0) return 0;
  const rounded = Math.ceil((totalPaise * percent) / 10_000) * 100;
  return Math.min(totalPaise, Math.max(0, rounded));
}

export function formatINR(paise: number): string {
  const rupees = paise / 100;
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: paise % 100 === 0 ? 0 : 2,
  }).format(rupees);
}

export interface PricingCalculationInput {
  trip: Pick<
    Trip,
    | "basePricePaise"
    | "privateGroupPricePaise"
    | "privateDiscountPercent"
    | "depositPercent"
    | "balanceDueDaysBefore"
  >;
  priceOverridePaise: number | null;
  bookingMode: BookingMode;
  seatsRequested: number;
  payDepositOnly: boolean;
  /** Coupon discount already checked by the database (coupon_check). Applied after any private-car discount. */
  couponDiscountPaise?: number;
  bookingPolicy: Pick<
    SiteSettings["bookingPolicy"],
    "taxRatePercent" | "allowDepositCheckout" | "depositPercent" | "balanceDueDaysBefore"
  >;
}

export interface PricingBreakdown {
  unitPricePaise: number;
  seatsCount: number;
  subtotalPaise: number;
  discountPaise: number;
  /** Part of discountPaise that came from a coupon. */
  couponDiscountPaise: number;
  taxPaise: number;
  totalPaise: number;
  payNowPaise: number;
  balanceLaterPaise: number;
  depositApplied: boolean;
  depositPercentApplied: number | null;
}

export function calculateBookingPricing(input: PricingCalculationInput): PricingBreakdown {
  const seatsCount = input.bookingMode === "private_vehicle" ? 6 : input.seatsRequested;
  if (seatsCount < 1 || seatsCount > 6) {
    throw new Error("Seat count must be between 1 and 6.");
  }

  const unitPricePaise = input.priceOverridePaise ?? input.trip.basePricePaise;
  const fullBatchSubtotal = unitPricePaise * seatsCount;

  let subtotalPaise = fullBatchSubtotal;
  let discountPaise = 0;

  if (input.bookingMode === "private_vehicle") {
    if (
      input.trip.privateGroupPricePaise !== null &&
      input.trip.privateGroupPricePaise >= 0 &&
      input.trip.privateGroupPricePaise <= fullBatchSubtotal
    ) {
      discountPaise = fullBatchSubtotal - input.trip.privateGroupPricePaise;
    } else if (input.trip.privateDiscountPercent > 0) {
      discountPaise = Math.round((fullBatchSubtotal * input.trip.privateDiscountPercent) / 100);
    }
    subtotalPaise = fullBatchSubtotal;
  }

  const couponDiscountPaise = Math.max(0, Math.min(Math.round(input.couponDiscountPaise ?? 0), subtotalPaise - discountPaise));
  discountPaise += couponDiscountPaise;

  const netBeforeTax = Math.max(0, subtotalPaise - discountPaise);
  const taxRate = Math.max(0, input.bookingPolicy.taxRatePercent);
  const taxPaise = Math.round((netBeforeTax * taxRate) / 100);
  const totalPaise = netBeforeTax + taxPaise;

  const effectiveDepositPercent =
    input.trip.depositPercent ??
    (input.bookingPolicy.allowDepositCheckout ? input.bookingPolicy.depositPercent : null);

  const canPayDeposit =
    input.payDepositOnly &&
    effectiveDepositPercent !== null &&
    effectiveDepositPercent >= 10 &&
    effectiveDepositPercent < 100;

  // Whole rupees (see advanceAmountPaise). Whether the advance may be chosen for a date at all is
  // decided by advanceTerms(); callers pass payDepositOnly only when it is available.
  const payNowPaise = canPayDeposit ? advanceAmountPaise(totalPaise, effectiveDepositPercent) : totalPaise;
  const balanceLaterPaise = Math.max(0, totalPaise - payNowPaise);

  return {
    unitPricePaise,
    seatsCount,
    subtotalPaise,
    discountPaise,
    couponDiscountPaise,
    taxPaise,
    totalPaise,
    payNowPaise,
    balanceLaterPaise,
    depositApplied: canPayDeposit && balanceLaterPaise > 0,
    depositPercentApplied: canPayDeposit && balanceLaterPaise > 0 ? effectiveDepositPercent : null,
  };
}

