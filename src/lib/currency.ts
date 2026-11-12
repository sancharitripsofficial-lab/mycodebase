import type { BookingMode, SiteSettings, Trip } from "@/lib/types";

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

  const payNowPaise = canPayDeposit
    ? Math.round((totalPaise * effectiveDepositPercent) / 100)
    : totalPaise;
  const balanceLaterPaise = Math.max(0, totalPaise - payNowPaise);

  return {
    unitPricePaise,
    seatsCount,
    subtotalPaise,
    discountPaise,
    taxPaise,
    totalPaise,
    payNowPaise,
    balanceLaterPaise,
    depositApplied: canPayDeposit,
    depositPercentApplied: canPayDeposit ? effectiveDepositPercent : null,
  };
}

