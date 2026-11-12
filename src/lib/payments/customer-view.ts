import { getBookingPayments, getUpiPaymentSettings } from "@/lib/data/repository";
import { toCustomerPaymentSummary } from "@/lib/payments/upi";
import { buildUpiInstructions } from "@/lib/payments/upi-qr";
import type { BookingRecord, CustomerPaymentSummary, UpiPaymentInstructions } from "@/lib/types";

export type CustomerPayMode =
  /** Show QR + UPI ID + reference box (unpaid hold still running, or balance due). */
  | "pay"
  /** Hold ran out: no QR (don't invite new payments), but someone who already paid can send the reference. */
  | "late_reference"
  | "none";

export interface CustomerPaymentView {
  payments: CustomerPaymentSummary[];
  waitingForCheck: boolean;
  mode: CustomerPayMode;
  upi: UpiPaymentInstructions | null;
  supportPhone: string | null;
}

export async function buildCustomerPaymentView(booking: BookingRecord): Promise<CustomerPaymentView> {
  const [payments, settings] = await Promise.all([
    getBookingPayments(booking.id),
    getUpiPaymentSettings(),
  ]);
  const waitingForCheck = payments.some((p) => p.status === "submitted");
  const hasMoneyIn = payments.some((p) => p.status === "captured" || p.status === "submitted");
  const holdRunning =
    booking.status === "pending_payment" &&
    (booking.holdExpiresAt === null || Date.parse(booking.holdExpiresAt) > Date.now());
  const holdOver =
    booking.status === "expired" || (booking.status === "pending_payment" && !holdRunning);

  let mode: CustomerPayMode = "none";
  if (settings.isEnabled && !waitingForCheck && booking.amountDuePaise > 0) {
    if (holdRunning || booking.status === "deposit_paid") mode = "pay";
    else if (holdOver && !hasMoneyIn) mode = "late_reference";
  }

  const upi =
    mode === "pay"
      ? await buildUpiInstructions({
          settings,
          amountPaise: booking.amountDuePaise,
          bookingReference: booking.bookingReference,
          holdExpiresAt: booking.status === "pending_payment" ? booking.holdExpiresAt : null,
        })
      : null;

  return {
    payments: payments.map(toCustomerPaymentSummary),
    waitingForCheck,
    mode,
    upi,
    supportPhone: settings.supportPhone || null,
  };
}
